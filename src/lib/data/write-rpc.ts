/**
 * Shared RPC write client (v0.2 write convergence).
 *
 * Single TypeScript surface over the SECURITY DEFINER functions in
 * db/mcp_rpc.sql. Deliberately actor- and project-agnostic: it takes an
 * audit.Actor (HUMAN/web or AGENT/mcp) + the owning projectId and issues ONE
 * atomic HTTPS RPC (project-ownership guard + optimistic version bump +
 * state-machine + activity_events audit all happen inside the SQL). BOTH the web
 * write layer (lib/data/writes.ts) and the /mcp gateway (lib/mcp/httpwrite.ts)
 * call this — that is the "same set of RPC writes" the duplication existed to
 * avoid. Rows come back snake_case (raw table via to_jsonb) and are mapped to the
 * camelCase Drizzle shapes by lib/core/rows.ts.
 *
 * Writes run exactly once (attempts:1): a client deadline does not roll back an
 * already-committed transaction, so a blind retry could double-apply a create.
 */
import { restRpc } from "@/lib/core/rest";
import { mapBranch, mapCheckpoint, mapIssue, mapProposal, mapTask, type Row } from "@/lib/core/rows";
import type { Branch, Checkpoint, Decision, Issue, NorthStar, Phase, Proposal, Task } from "@/lib/db/schema";
import type { Actor } from "@/lib/core/audit";

const unwrap = (v: unknown): Row => (v && typeof v === "object" ? (v as Row) : {});

export function actorJson(a: Actor) {
  return { type: a.actorType, id: a.actorId ?? null, label: a.actorLabel ?? null, source: a.source };
}

// ───────────────────────── Task ─────────────────────────
export async function rpcUpdateTask(
  actor: Actor,
  projectId: string,
  taskId: string,
  patch: Record<string, unknown>,
  expectedVersion?: number,
): Promise<Task> {
  const r = await restRpc(
    "mcp_update_task",
    { p_id: taskId, p_project: projectId, p_patch: patch, p_expected_version: expectedVersion ?? null, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
  return mapTask(unwrap(r));
}

export async function rpcSetTaskStatus(actor: Actor, projectId: string, taskId: string, to: string): Promise<Task> {
  const r = await restRpc(
    "mcp_set_task_status",
    { p_id: taskId, p_project: projectId, p_to: to, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
  return mapTask(unwrap(r));
}

// ───────────────────────── Branch ─────────────────────────
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
export async function rpcCreateBranch(actor: Actor, projectId: string, input: BranchInput): Promise<Branch> {
  const r = await restRpc(
    "mcp_create_branch",
    {
      p_project: projectId,
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
      p_actor: actorJson(actor),
    },
    { attempts: 1 },
  );
  return mapBranch(unwrap(r));
}

export async function rpcSetBranchStatus(actor: Actor, projectId: string, branchId: string, to: string): Promise<Branch> {
  const r = await restRpc(
    "mcp_set_branch_status",
    { p_id: branchId, p_project: projectId, p_to: to, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
  return mapBranch(unwrap(r));
}

export async function rpcCloseBranch(actor: Actor, projectId: string, branchId: string, resolution: string): Promise<Branch> {
  const r = await restRpc(
    "mcp_close_branch",
    { p_id: branchId, p_project: projectId, p_resolution: resolution, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
  return mapBranch(unwrap(r));
}

// ───────────────────────── Issue ─────────────────────────
export interface IssueInput {
  title: string;
  description?: string | null;
  severity?: string | null;
  source?: string | null;
  relatedTaskId?: string | null;
  relatedPhaseId?: string | null;
  relatedBranchId?: string | null;
}
export async function rpcCreateIssue(actor: Actor, projectId: string, input: IssueInput): Promise<Issue> {
  const r = await restRpc(
    "mcp_create_issue",
    {
      p_project: projectId,
      p: {
        title: input.title,
        description: input.description ?? "",
        severity: input.severity ?? "",
        source: input.source ?? "",
        related_task_id: input.relatedTaskId ?? "",
        related_phase_id: input.relatedPhaseId ?? "",
        related_branch_id: input.relatedBranchId ?? "",
      },
      p_actor: actorJson(actor),
    },
    { attempts: 1 },
  );
  return mapIssue(unwrap(r));
}

// ───────────────────────── Checkpoint ─────────────────────────
export interface CheckpointInput {
  summary: string;
  taskId?: string | null;
  branchId?: string | null;
  agentId?: string | null;
  completedItems?: string[];
  unfinishedItems?: string[];
  newIssues?: string[];
  newDecisions?: string[];
  newBranches?: string[];
  currentStatus?: string | null;
  nextAction?: string | null;
}
export async function rpcCreateCheckpoint(actor: Actor, projectId: string, input: CheckpointInput): Promise<Checkpoint & { agentName: string | null }> {
  const r = await restRpc(
    "mcp_create_checkpoint",
    {
      p_project: projectId,
      p: {
        summary: input.summary,
        task_id: input.taskId ?? "",
        branch_id: input.branchId ?? "",
        agent_id: input.agentId ?? "",
        completed_items: input.completedItems ?? [],
        unfinished_items: input.unfinishedItems ?? [],
        new_issues: input.newIssues ?? [],
        new_decisions: input.newDecisions ?? [],
        new_branches: input.newBranches ?? [],
        current_status: input.currentStatus ?? "",
        next_action: input.nextAction ?? "",
      },
      p_actor: actorJson(actor),
    },
    { attempts: 1 },
  );
  return mapCheckpoint(unwrap(r), null);
}

// ───────────────────────── Proposal ─────────────────────────
export interface ProposalInput {
  title: string;
  kind?: string | null;
  reason?: string | null;
  description?: string | null;
  impact?: string | null;
  relatedTaskId?: string | null;
}
export async function rpcCreateProposal(actor: Actor, projectId: string, input: ProposalInput): Promise<Proposal> {
  const r = await restRpc(
    "mcp_create_proposal",
    {
      p_project: projectId,
      p: {
        title: input.title,
        kind: input.kind ?? "",
        reason: input.reason ?? "",
        description: input.description ?? "",
        impact: input.impact ?? "",
        related_task_id: input.relatedTaskId ?? "",
      },
      p_actor: actorJson(actor),
    },
    { attempts: 1 },
  );
  return mapProposal(unwrap(r));
}

// Re-export domain types used by callers so imports stay stable as surface grows.
export type { Decision, NorthStar, Phase };
