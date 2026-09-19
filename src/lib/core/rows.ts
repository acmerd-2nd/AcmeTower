/**
 * Shared PostgREST row → camelCase mappers (v0.1 §46 data model).
 *
 * PostgREST returns snake_case; both the /mcp read layer (lib/mcp/httpdata.ts)
 * and the converged web/RPC write layer (lib/data/writes.ts + write-rpc.ts) turn
 * rows into the SAME camelCase shapes as the Drizzle `$inferSelect` types, so the
 * domain types stay the single source of truth regardless of transport.
 * Lives in lib/core (transport-neutral), not under mcp/, because web now shares it.
 */
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

export type Row = Record<string, unknown>;

export const s = (v: unknown): string | null => (v == null ? null : String(v));
export const n = (v: unknown): number => (v == null ? 0 : Number(v));
export const enc = (v: string): string => encodeURIComponent(v);
const asJson = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
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
