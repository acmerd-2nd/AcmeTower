/**
 * HTTPS write wrappers for the /mcp edge (v0.1 §36–§39).
 *
 * Thin, typed clients over the SECURITY DEFINER RPC functions in db/mcp_rpc.sql.
 * The transactional logic (project-ownership guard, optimistic version bump,
 * state-machine validation, activity_events audit with source=MCP) lives in SQL
 * so it is atomic over the PostgREST HTTPS path — the worker's Hyperdrive TCP
 * tunnel is never touched. The returned row is snake_case (raw table via
 * to_jsonb); we map it back to the camelCase Drizzle shape the tool mappers use.
 *
 * Errors: restRpc throws RestError carrying the Postgres RAISE message verbatim
 * (版本冲突 / 非法状态转换 / 不存在 / 分支必须有…); the gateway turns it into an
 * isError tool result, mirroring how the Drizzle write layer's domain errors
 * surfaced before.
 */
import { restRpc } from "@/lib/core/rest";
import { mapBranch, mapCheckpoint, mapIssue, mapProposal, mapTask } from "@/lib/core/rows";
import type { Branch, Checkpoint, Issue, Proposal, Task } from "@/lib/db/schema";
import type { McpPrincipal } from "@/lib/mcp/principal";

type Row = Record<string, unknown>;
const unwrap = (v: unknown): Row => (v && typeof v === "object" ? (v as Row) : {});

function actorJson(p: McpPrincipal) {
  return { type: "AGENT", id: p.agentId ?? null, label: p.credentialName, source: "MCP" };
}

export async function httpUpdateTask(
  p: McpPrincipal,
  taskId: string,
  patch: Record<string, unknown>,
  expectedVersion?: number,
): Promise<Task> {
  const r = await restRpc(
    "mcp_update_task",
    { p_id: taskId, p_project: p.projectId, p_patch: patch, p_expected_version: expectedVersion ?? null, p_actor: actorJson(p) },
    { attempts: 1 }, // writes are non-idempotent when a version guard is omitted → run exactly once
  );
  return mapTask(unwrap(r));
}

export async function httpSetTaskStatus(p: McpPrincipal, taskId: string, to: string): Promise<Task> {
  const r = await restRpc(
    "mcp_set_task_status",
    { p_id: taskId, p_project: p.projectId, p_to: to, p_actor: actorJson(p) },
    { attempts: 1 },
  );
  return mapTask(unwrap(r));
}

export interface BranchInput {
  sourceType: string;
  sourceId: string;
  name: string;
  reason: string;
  goal: string;
  successCriteria?: string | null;
  returnPointType: string;
  returnPointId: string;
}
export async function httpCreateBranch(p: McpPrincipal, input: BranchInput): Promise<Branch> {
  const r = await restRpc(
    "mcp_create_branch",
    {
      p_project: p.projectId,
      p: {
        source_type: input.sourceType,
        source_id: input.sourceId,
        name: input.name,
        reason: input.reason,
        goal: input.goal,
        success_criteria: input.successCriteria ?? "",
        return_point_type: input.returnPointType,
        return_point_id: input.returnPointId,
      },
      p_actor: actorJson(p),
    },
    { attempts: 1 },
  );
  return mapBranch(unwrap(r));
}

export async function httpSetBranchStatus(p: McpPrincipal, branchId: string, to: string): Promise<Branch> {
  const r = await restRpc(
    "mcp_set_branch_status",
    { p_id: branchId, p_project: p.projectId, p_to: to, p_actor: actorJson(p) },
    { attempts: 1 },
  );
  return mapBranch(unwrap(r));
}

export async function httpCloseBranch(p: McpPrincipal, branchId: string, resolution: string): Promise<Branch> {
  const r = await restRpc(
    "mcp_close_branch",
    { p_id: branchId, p_project: p.projectId, p_resolution: resolution, p_actor: actorJson(p) },
    { attempts: 1 },
  );
  return mapBranch(unwrap(r));
}

export interface IssueInput {
  title: string;
  description?: string | null;
  severity?: string | null;
  source?: string | null;
  relatedTaskId?: string | null;
  relatedPhaseId?: string | null;
  relatedBranchId?: string | null;
}
export async function httpCreateIssue(p: McpPrincipal, input: IssueInput): Promise<Issue> {
  const r = await restRpc(
    "mcp_create_issue",
    {
      p_project: p.projectId,
      p: {
        title: input.title,
        description: input.description ?? "",
        severity: input.severity ?? "",
        source: input.source ?? "",
        related_task_id: input.relatedTaskId ?? "",
        related_phase_id: input.relatedPhaseId ?? "",
        related_branch_id: input.relatedBranchId ?? "",
      },
      p_actor: actorJson(p),
    },
    { attempts: 1 },
  );
  return mapIssue(unwrap(r));
}

export interface CheckpointInput {
  summary: string;
  taskId?: string | null;
  branchId?: string | null;
  completedItems?: string[];
  unfinishedItems?: string[];
  newIssues?: string[];
  newDecisions?: string[];
  newBranches?: string[];
  currentStatus?: string | null;
  nextAction?: string | null;
}
export async function httpCreateCheckpoint(p: McpPrincipal, input: CheckpointInput): Promise<Checkpoint & { agentName: string | null }> {
  const r = await restRpc(
    "mcp_create_checkpoint",
    {
      p_project: p.projectId,
      p: {
        summary: input.summary,
        task_id: input.taskId ?? "",
        branch_id: input.branchId ?? "",
        agent_id: p.agentId ?? "",
        completed_items: input.completedItems ?? [],
        unfinished_items: input.unfinishedItems ?? [],
        new_issues: input.newIssues ?? [],
        new_decisions: input.newDecisions ?? [],
        new_branches: input.newBranches ?? [],
        current_status: input.currentStatus ?? "",
        next_action: input.nextAction ?? "",
      },
      p_actor: actorJson(p),
    },
    { attempts: 1 },
  );
  return mapCheckpoint(unwrap(r), null);
}

export interface ProposalInput {
  title: string;
  kind?: string | null;
  reason?: string | null;
  description?: string | null;
  impact?: string | null;
  relatedTaskId?: string | null;
}
export async function httpCreateProposal(p: McpPrincipal, input: ProposalInput): Promise<Proposal> {
  const r = await restRpc(
    "mcp_create_proposal",
    {
      p_project: p.projectId,
      p: {
        title: input.title,
        kind: input.kind ?? "",
        reason: input.reason ?? "",
        description: input.description ?? "",
        impact: input.impact ?? "",
        related_task_id: input.relatedTaskId ?? "",
      },
      p_actor: actorJson(p),
    },
    { attempts: 1 },
  );
  return mapProposal(unwrap(r));
}
