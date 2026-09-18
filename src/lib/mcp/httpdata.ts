/**
 * HTTPS read + ownership layer for the /mcp edge (v0.1 §34–§36, §42).
 *
 * The /mcp gateway runs in the worker, where the Hyperdrive→Postgres TCP tunnel
 * stalls intermittently (HTTP 1101). Everything /mcp needs to READ therefore goes
 * over Supabase PostgREST (Cloudflare's own HTTPS/HTTP-2 path) via lib/mcp/rest.ts.
 * The web app is untouched and still uses Drizzle/Hyperdrive.
 *
 * Rows come back snake_case; the mappers below turn them into the SAME camelCase
 * shapes as the Drizzle `$inferSelect` types, so the existing tool output mappers
 * (taskSummary/branchSummary/…) and the ProjectSpace assembly stay unchanged —
 * the only swap is WHERE the bytes come from.
 */
import { restSelect } from "@/lib/mcp/rest";
import type {
  Branch,
  Checkpoint,
  Decision,
  Issue,
  NorthStar,
  Phase,
  Project,
  Proposal,
  Task,
} from "@/lib/db/schema";
import type { CurrentMission, PhaseNode, ProjectSpace } from "@/lib/data/project";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown): number => (v == null ? 0 : Number(v));
const asJson = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const enc = (v: string) => encodeURIComponent(v);

const cast = <T>(r: Row): T => r as unknown as T;

export const mapProject = (r: Row): Project =>
  cast<Project>({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    slug: r.slug,
    icon: r.icon ?? null,
    description: r.description ?? null,
    status: r.status,
    health: r.health,
    currentPhaseId: r.current_phase_id ?? null,
    currentTaskId: r.current_task_id ?? null,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at ?? null,
    deletedAt: r.deleted_at ?? null,
    version: n(r.version),
  });

export const mapNorthStar = (r: Row): NorthStar =>
  cast<NorthStar>({
    id: r.id,
    projectId: r.project_id,
    name: r.name ?? null,
    description: r.description ?? null,
    finalGoal: r.final_goal ?? null,
    deliverable: r.deliverable ?? null,
    successCriteria: r.success_criteria ?? null,
    nonGoals: r.non_goals ?? null,
    constraints: r.constraints ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: n(r.version),
  });

export const mapPhase = (r: Row): Phase =>
  cast<Phase>({
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description ?? null,
    orderIndex: n(r.order_index),
    status: r.status,
    goal: r.goal ?? null,
    successCriteria: r.success_criteria ?? null,
    scope: r.scope ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at ?? null,
    version: n(r.version),
  });

export const mapTask = (r: Row): Task =>
  cast<Task>({
    id: r.id,
    projectId: r.project_id,
    phaseId: r.phase_id,
    parentTaskId: r.parent_task_id ?? null,
    name: r.name,
    description: r.description ?? null,
    purpose: r.purpose ?? null,
    successCriteria: r.success_criteria ?? null,
    status: r.status,
    progress: n(r.progress),
    priority: r.priority,
    currentAgentId: r.current_agent_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at ?? null,
    deletedAt: r.deleted_at ?? null,
    version: n(r.version),
  });

export const mapBranch = (r: Row): Branch =>
  cast<Branch>({
    id: r.id,
    projectId: r.project_id,
    sourceType: r.source_type,
    sourceId: r.source_id,
    parentBranchId: r.parent_branch_id ?? null,
    name: r.name,
    reason: r.reason,
    goal: r.goal,
    successCriteria: r.success_criteria ?? null,
    returnPointType: r.return_point_type,
    returnPointId: r.return_point_id,
    status: r.status,
    progress: n(r.progress),
    createdByType: r.created_by_type,
    createdById: r.created_by_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at ?? null,
    resolution: r.resolution ?? null,
    deletedAt: r.deleted_at ?? null,
    version: n(r.version),
  });

export const mapIssue = (r: Row): Issue =>
  cast<Issue>({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description ?? null,
    source: r.source ?? null,
    severity: r.severity,
    status: r.status,
    relatedPhaseId: r.related_phase_id ?? null,
    relatedTaskId: r.related_task_id ?? null,
    relatedBranchId: r.related_branch_id ?? null,
    createdBy: r.created_by ?? null,
    createdById: r.created_by_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at ?? null,
    resolution: r.resolution ?? null,
    deletedAt: r.deleted_at ?? null,
    version: n(r.version),
  });

export const mapDecision = (r: Row): Decision =>
  cast<Decision>({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    decision: r.decision,
    reason: r.reason ?? null,
    alternatives: r.alternatives ?? null,
    impact: r.impact ?? null,
    status: r.status,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    approvedAt: r.approved_at ?? null,
    supersededBy: r.superseded_by ?? null,
    deletedAt: r.deleted_at ?? null,
    version: n(r.version),
  });

export const mapProposal = (r: Row): Proposal =>
  cast<Proposal>({
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    title: r.title,
    reason: r.reason ?? null,
    description: r.description ?? null,
    impact: r.impact ?? null,
    relatedTaskId: r.related_task_id ?? null,
    status: r.status,
    createdByType: r.created_by_type,
    createdById: r.created_by_id ?? null,
    decidedBy: r.decided_by ?? null,
    decidedAt: r.decided_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: n(r.version),
  });

export const mapCheckpoint = (r: Row, agentName?: string | null): Checkpoint & { agentName: string | null } =>
  cast<Checkpoint & { agentName: string | null }>({
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id ?? null,
    sessionId: r.session_id ?? null,
    taskId: r.task_id ?? null,
    branchId: r.branch_id ?? null,
    summary: r.summary,
    completedItems: asJson(r.completed_items),
    unfinishedItems: asJson(r.unfinished_items),
    newIssues: asJson(r.new_issues),
    newDecisions: asJson(r.new_decisions),
    newBranches: asJson(r.new_branches),
    currentStatus: r.current_status ?? null,
    nextAction: r.next_action ?? null,
    createdByType: r.created_by_type,
    createdById: r.created_by_id ?? null,
    createdAt: r.created_at,
    deletedAt: r.deleted_at ?? null,
    version: n(r.version),
    agentName: agentName ?? null,
  });

// ───────────────────────── targeted reads (per tool) ─────────────────────────

export async function httpProjectRow(projectId: string): Promise<Project | null> {
  const rows = await restSelect(`projects`, `id=eq.${enc(projectId)}&deleted_at=is.null&limit=1`);
  return rows[0] ? mapProject(rows[0]) : null;
}

export async function httpTaskRow(projectId: string, taskId: string): Promise<Task | null> {
  const rows = await restSelect(
    `tasks`,
    `id=eq.${enc(taskId)}&project_id=eq.${enc(projectId)}&deleted_at=is.null&limit=1`,
  );
  return rows[0] ? mapTask(rows[0]) : null;
}

/** Task's owning project id (ignoring project filter) — to distinguish NotFound vs Forbidden. */
export async function taskOwner(taskId: string): Promise<string | null> {
  const rows = await restSelect(`tasks`, `id=eq.${enc(taskId)}&limit=1`, { columns: "project_id" });
  return rows[0] ? s(rows[0].project_id) : null;
}

export async function httpPhaseRows(projectId: string): Promise<Phase[]> {
  const rows = await restSelect(`phases`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=order_index.asc`);
  return rows.map(mapPhase);
}

export async function httpTaskListRows(projectId: string): Promise<Task[]> {
  const rows = await restSelect(`tasks`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=created_at.asc`);
  return rows.map(mapTask);
}

export async function httpBranchRows(projectId: string): Promise<Branch[]> {
  const rows = await restSelect(`branches`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=created_at.asc`);
  return rows.map(mapBranch);
}

export async function httpDecisionRows(projectId: string): Promise<Decision[]> {
  const rows = await restSelect(`decisions`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=updated_at.desc`);
  return rows.map(mapDecision);
}

export async function httpIssueRows(projectId: string): Promise<Issue[]> {
  const rows = await restSelect(`issues`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=created_at.desc`);
  return rows.map(mapIssue);
}

export async function httpCheckpointRows(projectId: string): Promise<Array<Checkpoint & { agentName: string | null }>> {
  const rows = await restSelect(
    `checkpoints`,
    `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=created_at.desc`,
    { columns: "*,agents(name)" },
  );
  return rows.map((r) => mapCheckpoint(r, ((r as Row).agents as { name?: string } | null)?.name ?? null));
}

export async function httpNorthStar(projectId: string): Promise<NorthStar | null> {
  const rows = await restSelect(`north_star`, `project_id=eq.${enc(projectId)}&limit=1`);
  return rows[0] ? mapNorthStar(rows[0]) : null;
}

// ───────────────────────── assembled project space ─────────────────────────
// Mirrors lib/data/project.getProjectSpace, but every query is an HTTPS read.

const OPEN_BRANCH = "OPEN,IN_PROGRESS,BLOCKED";
const OPEN_ISSUE = "OPEN,IN_PROGRESS";

function buildMission(
  task: (Task & { agentName: string | null }) | null,
  phase: PhaseNode | null,
  branch: Branch | null,
): CurrentMission {
  if (branch) {
    return {
      objective: branch.goal,
      successCriteria: branch.successCriteria,
      currentState: `分支「${branch.name}」(${branch.status})：${branch.reason}`,
      doNot: `这是从主线派生的分支，只处理该分支目标；不要改动主线其它任务。`,
      returnTo: `完成后回到 ${branch.returnPointType}（${branch.returnPointId}）`,
      nextAction: branch.status === "OPEN" ? "开始分支调查 / 实验" : "推进分支至 RESOLVED 并记录 resolution",
    };
  }
  if (!task) {
    return {
      objective: phase?.goal ?? null,
      successCriteria: phase?.successCriteria ?? null,
      currentState: phase ? `当前在 ${phase.name}（${phase.status}）` : "尚未设定当前任务",
      doNot: phase?.scope ? `范围约束：${phase.scope}` : "不要扩张到其它 Phase",
      returnTo: null,
      nextAction: "在 Phase 下创建或选择当前任务",
    };
  }
  return {
    objective: task.purpose ?? task.name,
    successCriteria: task.successCriteria,
    currentState: `${task.status} · ${task.progress}%`,
    doNot: phase?.scope ? `范围约束：${phase.scope}` : "不要扩张到当前 Phase/任务范围之外",
    returnTo: null,
    nextAction: task.status === "BLOCKED" ? "解除阻塞" : `推进「${task.name}」`,
  };
}

export async function httpProjectSpace(projectId: string): Promise<ProjectSpace | null> {
  const [project] = await restSelect(`projects`, `id=eq.${enc(projectId)}&deleted_at=is.null&limit=1`);
  if (!project) return null;
  const proj = mapProject(project);
  const p = enc(projectId);

  const [
    northStar,
    phasesMapped,
    tasksMapped,
    openBranchRaw,
    openIssueRaw,
    pendingProposalRaw,
    decisionRaw,
    checkpointRaw,
    agentRaw,
    currentTaskRaw,
  ] = await Promise.all([
    httpNorthStar(projectId),
    restSelect(`phases`, `project_id=eq.${p}&deleted_at=is.null&order=order_index.asc`),
    restSelect(`tasks`, `project_id=eq.${p}&deleted_at=is.null&order=created_at.asc`),
    restSelect(`branches`, `project_id=eq.${p}&status=in.(${OPEN_BRANCH})&deleted_at=is.null&order=updated_at.desc`),
    restSelect(`issues`, `project_id=eq.${p}&status=in.(${OPEN_ISSUE})`, { columns: "id" }),
    restSelect(`proposals`, `project_id=eq.${p}&status=eq.PENDING`, { columns: "id" }),
    restSelect(`decisions`, `project_id=eq.${p}&deleted_at=is.null&order=updated_at.desc&limit=5`),
    restSelect(`checkpoints`, `project_id=eq.${p}&deleted_at=is.null&order=created_at.desc&limit=3`, { columns: "*,agents(name)" }),
    restSelect(`project_agents`, `project_id=eq.${p}`, { columns: "role,permission_level,agents(id,name,provider)" }),
    proj.currentTaskId
      ? restSelect(`tasks`, `id=eq.${enc(String(proj.currentTaskId))}&limit=1`, { columns: "*,agents(name)" }).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const phases = phasesMapped.map(mapPhase);
  const tasks = tasksMapped.map(mapTask);

  const byPhase = new Map<string, Task[]>();
  for (const t of tasks) {
    const arr = byPhase.get(t.phaseId) ?? [];
    arr.push(t);
    byPhase.set(t.phaseId, arr);
  }
  const phaseNodes: PhaseNode[] = phases.map((ph) => {
    const ts = byPhase.get(ph.id) ?? [];
    const done = ts.filter((t) => t.status === "COMPLETED").length;
    const progress = ts.length
      ? Math.round(ts.reduce((a, t) => a + t.progress, 0) / ts.length)
      : ph.status === "COMPLETED"
        ? 100
        : 0;
    return { ...ph, taskCount: ts.length, doneCount: done, progress };
  });

  const openBranches = openBranchRaw.map(mapBranch);
  const currentPhase =
    phaseNodes.find((x) => x.id === proj.currentPhaseId) ??
    phaseNodes.find((x) => x.status === "ACTIVE") ??
    phaseNodes[0] ??
    null;

  let currentTask: (Task & { agentName: string | null }) | null = null;
  if (currentTaskRaw) {
    const agent = (currentTaskRaw as Row).agents as { name?: string } | null;
    currentTask = { ...mapTask(currentTaskRaw), agentName: agent?.name ?? null };
  }
  const currentBranch = openBranches[0] ?? null;
  const mission = buildMission(currentTask, currentPhase, currentBranch);

  return {
    project: proj,
    northStar,
    phases: phaseNodes,
    currentPhase,
    currentTask,
    currentBranch,
    mission,
    signals: {
      openBranches: openBranches.length,
      openIssues: openIssueRaw.length,
      pendingProposals: pendingProposalRaw.length,
      agents: agentRaw.map((a) => {
        const ag = (a as Row).agents as { id?: string; name?: string; provider?: string | null } | null;
        return {
          id: s(ag?.id) ?? "",
          name: s(ag?.name) ?? "",
          provider: ag?.provider != null ? String(ag.provider) : null,
          role: (a as Row).role != null ? String((a as Row).role) : null,
          permissionLevel: s((a as Row).permission_level) ?? "READ",
        };
      }),
      recentDecisions: decisionRaw.map(mapDecision),
      recentCheckpoints: checkpointRaw.map((r) => mapCheckpoint(r, ((r as Row).agents as { name?: string } | null)?.name ?? null)),
    },
  };
}
