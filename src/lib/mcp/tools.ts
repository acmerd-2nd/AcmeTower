/**
 * MCP tool registry + wiring (v0.1设计文档 §32–§41).
 *
 * One source of truth for every MCP tool. Each declares the minimum PermissionLevel
 * it needs (§29); the gateway only registers (and re-checks) the tools the
 * principal's level allows, and every handler re-checks cross-project ownership
 * (§36) before delegating to the SAME App Logic → Permission → Validation chain the
 * web UI uses — but reached over the HTTPS path (lib/mcp/httpdata.ts reads,
 * db/mcp_rpc.sql writes via lib/mcp/httpwrite.ts). No tool ever writes the DB
 * directly, and /mcp never touches the worker's flaky Hyperdrive TCP tunnel.
 *
 * GOVERNANCE (§29) is deliberately absent: North-Star edits, Decision approvals,
 * phase/scope changes and archiving stay human-only; an agent that wants those
 * files a Proposal instead (§39).
 */
import { z } from "zod";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import {
  issueStatus,
  proposalKind,
  taskPriority,
  taskStatus,
  type Branch,
  type Checkpoint,
  type Issue,
  type Proposal,
  type Task,
} from "@/lib/db/schema";
import {
  httpBranchRows,
  httpCheckpointRows,
  httpDecisionRows,
  httpIssueRows,
  httpNorthStar,
  httpPhaseRows,
  httpProjectSpace,
  httpTaskListRows,
  httpTaskRow,
} from "@/lib/mcp/httpdata";
import {
  httpCloseBranch,
  httpCreateBranch,
  httpCreateCheckpoint,
  httpCreateIssue,
  httpCreateProposal,
  httpSetBranchStatus,
  httpSetTaskStatus,
  httpUpdateTask,
} from "@/lib/mcp/httpwrite";
import {
  hasPermission,
  type McpPrincipal,
  type PermissionLevel,
} from "@/lib/mcp/principal";
import { assertOwned, NotFoundError } from "@/lib/mcp/ownership";
import { assessDrift } from "@/lib/mcp/drift";

type Json = Record<string, unknown>;

// zod enum derived straight from the DB enums — inputs and schema can never drift.
const enumFrom = (vals: readonly string[]) => z.enum(vals as unknown as [string, ...string[]]);

export interface McpToolSpec {
  name: string;
  title: string;
  description: string;
  required: PermissionLevel;
  readOnly: boolean;
  input: z.ZodTypeAny;
  run: (args: any, principal: McpPrincipal) => Promise<Json>;
}

// ── row → snake_case mappers (consume the camel shapes httpdata produces) ─────
const taskSummary = (t: Task): Json => ({
  id: t.id, name: t.name, status: t.status, progress: t.progress, priority: t.priority,
  purpose: t.purpose, success_criteria: t.successCriteria, description: t.description,
  phase_id: t.phaseId, version: t.version, updated_at: t.updatedAt,
});
const branchSummary = (b: Branch): Json => ({
  id: b.id, name: b.name, status: b.status, reason: b.reason, goal: b.goal,
  success_criteria: b.successCriteria, source_type: b.sourceType, source_id: b.sourceId,
  return_point_type: b.returnPointType, return_point_id: b.returnPointId,
  progress: b.progress, resolution: b.resolution, version: b.version,
});
const issueSummary = (
  i: Pick<Issue, "id" | "title" | "description" | "severity" | "status" | "source" | "relatedTaskId" | "relatedPhaseId" | "resolution" | "version" | "createdAt"> & { relatedBranchId?: string | null },
): Json => ({
  id: i.id, title: i.title, description: i.description, severity: i.severity, status: i.status,
  source: i.source, related_task_id: i.relatedTaskId, related_phase_id: i.relatedPhaseId,
  related_branch_id: i.relatedBranchId ?? null, resolution: i.resolution, version: i.version, created_at: i.createdAt,
});
const checkpointSummary = (c: Checkpoint & { agentName?: string | null }): Json => ({
  id: c.id, summary: c.summary, task_id: c.taskId, branch_id: c.branchId,
  agent_id: c.agentId, agent_name: c.agentName ?? null,
  completed_items: c.completedItems, unfinished_items: c.unfinishedItems,
  new_issues: c.newIssues, new_decisions: c.newDecisions, new_branches: c.newBranches,
  current_status: c.currentStatus, next_action: c.nextAction, created_at: c.createdAt,
});
const proposalSummary = (p: Proposal): Json => ({
  id: p.id, kind: p.kind, title: p.title, reason: p.reason, description: p.description,
  impact: p.impact, related_task_id: p.relatedTaskId, status: p.status, version: p.version, created_at: p.createdAt,
});

const uuid = () => z.string().uuid();
const optStr = (d: string) => z.string().nullish().describe(d);

export const MCP_TOOLS: McpToolSpec[] = [
  // ───────────── READ ─────────────
  {
    name: "mcp_whoami", title: "Who am I", required: "READ", readOnly: true,
    description: "Return this connection's authenticated identity: bound project, permission level and token prefix. Confirms the auth chain.",
    input: z.object({}),
    async run(_a, p) {
      return {
        project_id: p.projectId, permission_level: p.permissionLevel,
        credential_name: p.credentialName, credential_id: p.credentialId,
        agent_id: p.agentId, token_prefix: p.tokenPrefix,
      };
    },
  },
  {
    name: "project_get", title: "Get project", required: "READ", readOnly: true,
    description: "The authorized project's core record (name, status, health, version, current pointers).",
    input: z.object({}),
    async run(_a, p) {
      const s = await httpProjectSpace(p.projectId);
      if (!s) throw new NotFoundError("Project");
      const g = s.project;
      return {
        id: g.id, name: g.name, slug: g.slug, description: g.description,
        status: g.status, health: g.health, current_phase_id: g.currentPhaseId,
        current_task_id: g.currentTaskId, version: g.version,
      };
    },
  },
  {
    name: "project_get_context", title: "Get project context", required: "READ", readOnly: true,
    description: "The flagship read: everything needed to safely resume — project, North Star, current position (phase/task/branch), current mission, recent decisions / open issues / checkpoints. §34.",
    input: z.object({}),
    async run(_a, p) {
      const s = await httpProjectSpace(p.projectId);
      if (!s) throw new NotFoundError("Project");
      return {
        project: { id: s.project.id, name: s.project.name, status: s.project.status, health: s.project.health },
        north_star: s.northStar && {
          name: s.northStar.name, final_goal: s.northStar.finalGoal, deliverable: s.northStar.deliverable,
          success_criteria: s.northStar.successCriteria, non_goals: s.northStar.nonGoals, constraints: s.northStar.constraints,
        },
        current_position: {
          phase: s.currentPhase && { id: s.currentPhase.id, name: s.currentPhase.name, status: s.currentPhase.status, progress: s.currentPhase.progress },
          task: s.currentTask && { id: s.currentTask.id, name: s.currentTask.name, status: s.currentTask.status, progress: s.currentTask.progress },
          branch: s.currentBranch && { id: s.currentBranch.id, name: s.currentBranch.name, status: s.currentBranch.status },
        },
        current_mission: s.mission,
        signals: {
          open_branches: s.signals.openBranches, open_issues: s.signals.openIssues,
          pending_proposals: s.signals.pendingProposals,
          recent_decisions: s.signals.recentDecisions.map((d) => ({ id: d.id, title: d.title, status: d.status })),
          recent_checkpoints: s.signals.recentCheckpoints.map((c) => ({ id: c.id, summary: c.summary, created_at: c.createdAt })),
        },
      };
    },
  },
  {
    name: "project_get_north_star", title: "Get North Star", required: "READ", readOnly: true,
    description: "The project's governance truth: final goal, deliverable, success criteria, non-goals, constraints.",
    input: z.object({}),
    async run(_a, p) {
      const n = await httpNorthStar(p.projectId);
      if (!n) return { north_star: null };
      return {
        north_star: {
          name: n.name, description: n.description, final_goal: n.finalGoal, deliverable: n.deliverable,
          success_criteria: n.successCriteria, non_goals: n.nonGoals, constraints: n.constraints, version: n.version,
        },
      };
    },
  },
  {
    name: "project_get_roadmap", title: "Get roadmap", required: "READ", readOnly: true,
    description: "Ordered phases with their status/scope/goal and the tasks inside each.",
    input: z.object({}),
    async run(_a, p) {
      const ph = await httpPhaseRows(p.projectId);
      const ts = await httpTaskListRows(p.projectId);
      const byPhase = new Map<string, Json[]>();
      for (const t of ts) {
        let arr = byPhase.get(t.phaseId);
        if (!arr) { arr = []; byPhase.set(t.phaseId, arr); }
        arr.push({ id: t.id, name: t.name, status: t.status, progress: t.progress, priority: t.priority, version: t.version });
      }
      return {
        phases: ph.map((x) => ({
          id: x.id, name: x.name, status: x.status, order_index: x.orderIndex,
          goal: x.goal, scope: x.scope, success_criteria: x.successCriteria, version: x.version,
          tasks: byPhase.get(x.id) ?? [],
        })),
      };
    },
  },
  {
    name: "project_get_current_mission", title: "Get current mission", required: "READ", readOnly: true,
    description: "The dynamically assembled current work context: objective, success criteria, current state, do-not rules, return-to, next action. §35.",
    input: z.object({}),
    async run(_a, p) {
      const s = await httpProjectSpace(p.projectId);
      if (!s) throw new NotFoundError("Project");
      return {
        mission: s.mission,
        current_position: {
          phase: s.currentPhase && { id: s.currentPhase.id, name: s.currentPhase.name, status: s.currentPhase.status },
          task: s.currentTask && { id: s.currentTask.id, name: s.currentTask.name, status: s.currentTask.status },
          branch: s.currentBranch && { id: s.currentBranch.id, name: s.currentBranch.name, status: s.currentBranch.status },
        },
      };
    },
  },
  {
    name: "project_get_task", title: "Get task", required: "READ", readOnly: true,
    description: "Read one task in full. Refuses if it is not in this token's project.",
    input: z.object({ task_id: uuid() }),
    async run(a, p) {
      const row = await httpTaskRow(p.projectId, a.task_id);
      if (!row) throw new NotFoundError("Task");
      return { task: taskSummary(row) };
    },
  },
  {
    name: "project_get_branch", title: "Get branch", required: "READ", readOnly: true,
    description: "Read one branch (source, reason, goal, return point, status).",
    input: z.object({ branch_id: uuid() }),
    async run(a, p) {
      const rows = await httpBranchRows(p.projectId);
      const row = rows.find((b) => b.id === a.branch_id);
      if (!row) throw new NotFoundError("Branch");
      return { branch: row };
    },
  },
  {
    name: "project_get_decisions", title: "Get decisions", required: "READ", readOnly: true,
    description: "Decision log (newest first), optionally filtered by status.",
    input: z.object({ status: z.string().optional().describe("PROPOSED | APPROVED | REJECTED | SUPERSEDED") }),
    async run(a, p) {
      const rows = await httpDecisionRows(p.projectId);
      const use = a.status ? rows.filter((d) => d.status === a.status) : rows;
      return { decisions: use.map((d) => ({
        id: d.id, title: d.title, decision: d.decision, reason: d.reason, alternatives: d.alternatives,
        impact: d.impact, status: d.status, created_by: d.createdBy, version: d.version,
      })) };
    },
  },
  {
    name: "project_get_open_issues", title: "Get open issues", required: "READ", readOnly: true,
    description: "Issues still in progress (status OPEN or IN_PROGRESS).",
    input: z.object({}),
    async run(_a, p) {
      const open = new Set<string>((issueStatus.enumValues as readonly string[]).filter((s) => s === "OPEN" || s === "IN_PROGRESS"));
      const rows = (await httpIssueRows(p.projectId)).filter((i) => open.has(i.status as string));
      return { issues: rows.map(issueSummary) };
    },
  },
  {
    name: "project_get_recent_checkpoints", title: "Get recent checkpoints", required: "READ", readOnly: true,
    description: "Latest work snapshots (newest first), limited.",
    input: z.object({ limit: z.number().int().min(1).max(50).default(5) }),
    async run(a, p) {
      const rows = await httpCheckpointRows(p.projectId);
      return { checkpoints: rows.slice(0, a.limit ?? 5).map((c) => checkpointSummary(c)) };
    },
  },
  {
    name: "project_check_drift", title: "Check scope drift", required: "READ", readOnly: true,
    description: "Rule-based triage (§40–§41): given the current task and the work you are about to do, returns { risk, is_drift, reason, recommended_action } so you know whether to CONTINUE, BRANCH, PROPOSAL, or ASK_HUMAN.",
    input: z.object({
      current_task: z.string().min(1).describe("A task id in this project, or a short description of what you are working on"),
      proposed_work: z.string().min(1).describe("What you are about to do / change"),
    }),
    async run(a, p) {
      return (await assessDrift(p.projectId, { currentTask: a.current_task, proposedWork: a.proposed_work })) as unknown as Json;
    },
  },

  // ───────────── WORKING_WRITE ─────────────
  {
    name: "project_update_task", title: "Update task", required: "WORKING_WRITE", readOnly: false,
    description: "Update a task's fields and/or move its status through the state machine. Pass expected_version for optimistic concurrency (omit = last write wins). §36.",
    input: z.object({
      task_id: uuid(),
      status: enumFrom(taskStatus.enumValues).optional().describe("New status; must be a legal transition"),
      progress: z.number().int().min(0).max(100).optional(),
      name: z.string().min(1).optional(),
      purpose: optStr("为什么做"),
      success_criteria: optStr("成功标准"),
      description: optStr("描述"),
      priority: enumFrom(taskPriority.enumValues).optional(),
      expected_version: z.number().int().positive().optional(),
    }),
    async run(a, p) {
      await assertOwned("task", a.task_id, p);
      const patch: Record<string, unknown> = {};
      if (a.progress != null) patch.progress = a.progress;
      if (a.name != null) patch.name = a.name;
      if (a.purpose !== undefined) patch.purpose = a.purpose;
      if (a.success_criteria !== undefined) patch.success_criteria = a.success_criteria;
      if (a.description !== undefined) patch.description = a.description;
      if (a.priority != null) patch.priority = a.priority;
      let row: Task | null = null;
      if (Object.keys(patch).length) row = await httpUpdateTask(p, a.task_id, patch, a.expected_version);
      if (a.status) row = await httpSetTaskStatus(p, a.task_id, a.status);
      if (!row) row = await httpTaskRow(p.projectId, a.task_id);
      if (!row) throw new NotFoundError("Task");
      return taskSummary(row);
    },
  },
  {
    name: "project_update_branch", title: "Update branch", required: "WORKING_WRITE", readOnly: false,
    description: "Move a branch's status through the state machine. To resolve with a conclusion use project_close_branch.",
    input: z.object({ branch_id: uuid(), status: z.enum(["IN_PROGRESS", "BLOCKED", "RESOLVED", "ABANDONED"] as const) }),
    async run(a, p) {
      await assertOwned("branch", a.branch_id, p);
      return branchSummary(await httpSetBranchStatus(p, a.branch_id, a.status));
    },
  },
  {
    name: "project_create_issue", title: "Create issue", required: "WORKING_WRITE", readOnly: false,
    description: "Record a discovered problem, optionally linked to a phase/task/branch in this project.",
    input: z.object({
      title: z.string().min(1),
      description: optStr("细节"),
      severity: enumFrom(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
      source: optStr("在哪里发现的"),
      related_task_id: z.string().uuid().nullish(),
      related_phase_id: z.string().uuid().nullish(),
      related_branch_id: z.string().uuid().nullish(),
    }),
    async run(a, p) {
      const row = await httpCreateIssue(p, {
        title: a.title, description: a.description ?? null, severity: a.severity ?? null,
        source: a.source ?? null, relatedTaskId: a.related_task_id ?? null,
        relatedPhaseId: a.related_phase_id ?? null, relatedBranchId: a.related_branch_id ?? null,
      });
      return issueSummary(row);
    },
  },
  {
    name: "project_create_checkpoint", title: "Create checkpoint", required: "WORKING_WRITE", readOnly: false,
    description: "Snapshot the project state after a work session (completed / unfinished items, current status, next action). The 'save game' point an agent leaves for the next one. §38.",
    input: z.object({
      summary: z.string().min(1),
      task_id: z.string().uuid().nullish(),
      branch_id: z.string().uuid().nullish(),
      completed_items: z.array(z.string()).optional(),
      unfinished_items: z.array(z.string()).optional(),
      new_issues: z.array(z.string()).optional(),
      new_decisions: z.array(z.string()).optional(),
      new_branches: z.array(z.string()).optional(),
      current_status: optStr("当前状态"),
      next_action: optStr("下一步"),
    }),
    async run(a, p) {
      if (a.task_id) await assertOwned("task", a.task_id, p);
      if (a.branch_id) await assertOwned("branch", a.branch_id, p);
      const row = await httpCreateCheckpoint(p, {
        summary: a.summary, taskId: a.task_id ?? null, branchId: a.branch_id ?? null,
        completedItems: a.completed_items, unfinishedItems: a.unfinished_items,
        newIssues: a.new_issues, newDecisions: a.new_decisions, newBranches: a.new_branches,
        currentStatus: a.current_status ?? null, nextAction: a.next_action ?? null,
      });
      return checkpointSummary(row);
    },
  },

  // ───────────── STRUCTURAL_WRITE ─────────────
  {
    name: "project_create_branch", title: "Create branch", required: "STRUCTURAL_WRITE", readOnly: false,
    description: "Open a recyclable side-track off the mainline. Requires source, reason, goal and a return point that exists. §37.",
    input: z.object({
      source_type: enumFrom(["PHASE", "TASK", "BRANCH", "PROJECT"]),
      source_id: uuid(),
      name: z.string().min(1),
      reason: z.string().min(1),
      goal: z.string().min(1),
      success_criteria: optStr("分支的成功标准"),
      return_point_type: enumFrom(["PHASE", "TASK", "BRANCH", "PROJECT"]),
      return_point_id: uuid(),
    }),
    async run(a, p) {
      const row = await httpCreateBranch(p, {
        sourceType: a.source_type, sourceId: a.source_id, name: a.name,
        reason: a.reason, goal: a.goal, successCriteria: a.success_criteria ?? null,
        returnPointType: a.return_point_type, returnPointId: a.return_point_id,
      });
      return branchSummary(row);
    },
  },
  {
    name: "project_close_branch", title: "Close branch", required: "STRUCTURAL_WRITE", readOnly: false,
    description: "Resolve a branch and record the resolution; the project returns to the branch's return point.",
    input: z.object({ branch_id: uuid(), resolution: z.string().min(1).describe("结论 / 回收说明") }),
    async run(a, p) {
      await assertOwned("branch", a.branch_id, p);
      return branchSummary(await httpCloseBranch(p, a.branch_id, a.resolution));
    },
  },
  {
    name: "project_create_proposal", title: "Create proposal", required: "STRUCTURAL_WRITE", readOnly: false,
    description: "Ask to do something OUTSIDE the current scope (e.g. add team permissions). Files as PENDING for a human to decide — never edits governance directly. §39.",
    input: z.object({
      title: z.string().min(1),
      kind: enumFrom(proposalKind.enumValues).optional(),
      reason: optStr("为什么要做"),
      description: optStr("具体想做什么"),
      impact: optStr("影响面"),
      related_task_id: z.string().uuid().nullish(),
    }),
    async run(a, p) {
      if (a.related_task_id) await assertOwned("task", a.related_task_id, p);
      const row = await httpCreateProposal(p, {
        title: a.title, kind: a.kind ?? null, reason: a.reason ?? null,
        description: a.description ?? null, impact: a.impact ?? null, relatedTaskId: a.related_task_id ?? null,
      });
      return { ...proposalSummary(row), note: "已提交为 PENDING，等待人类在 Web 端批准/拒绝" };
    },
  },
];

/**
 * @deprecated Legacy SDK registration path, kept only so the type surface is
 * stable; the stateless gateway (lib/mcp/server.ts) filters tools via
 * allowedTools()/MCP_TOOLS directly and never registers onto an McpServer.
 */
export function registerTools(server: McpServer, principal: McpPrincipal): void {
  for (const spec of MCP_TOOLS) {
    if (!hasPermission(principal.permissionLevel, spec.required)) continue; // chain: Tool ← Permission
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.input,
        annotations: { readOnlyHint: spec.readOnly, destructiveHint: false, idempotentHint: spec.readOnly, openWorldHint: false },
      },
      async (args) => {
        if (!hasPermission(principal.permissionLevel, spec.required)) {
          return { content: [{ type: "text", text: `insufficient permission: ${spec.name} requires ${spec.required}` }], isError: true } as CallToolResult;
        }
        try {
          const data = await spec.run(args, principal);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } as CallToolResult;
        } catch (e) {
          return { content: [{ type: "text", text: `${spec.name} failed: ${(e as Error).message ?? "error"}` }], isError: true } as CallToolResult;
        }
      },
    );
  }
}
