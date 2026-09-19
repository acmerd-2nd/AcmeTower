import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  branches,
  checkpoints,
  decisions,
  issues,
  northStars,
  phases,
  projects,
  proposals,
  tasks,
  type Branch,
  type Checkpoint,
  type Decision,
  type Issue,
  type NorthStar,
  type Phase,
  type Project,
  type Proposal,
  type Task,
} from "@/lib/db/schema";
import { logActivity, type Actor } from "@/lib/core/audit";
import {
  assertTransit,
  BRANCH_TRANSITIONS,
  DECISION_TRANSITIONS,
  ISSUE_TRANSITIONS,
  PHASE_TRANSITIONS,
  PROPOSAL_TRANSITIONS,
  TASK_TRANSITIONS,
} from "@/lib/core/state-machines";
import {
  rpcCreateBranch,
  rpcCreateIssue,
  rpcCreatePhase,
  rpcCreateTask,
  rpcCloseBranch,
  rpcDeletePhase,
  rpcDeleteTask,
  rpcProjectOf,
  rpcSetBranchStatus,
  rpcSetCurrentPhase,
  rpcSetCurrentTask,
  rpcSetIssueStatus,
  rpcSetPhaseStatus,
  rpcSetTaskStatus,
  rpcUpdatePhase,
  rpcUpdateTask,
} from "@/lib/data/write-rpc";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} 不存在`);
    this.name = "NotFoundError";
  }
}
export class ConflictError extends Error {
  constructor(entity: string) {
    super(`${entity} 已被其它改动更新（版本冲突），请刷新后重试`);
    this.name = "ConflictError";
  }
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n || 0)));
}

// ───────────────────────── Phase ─────────────────────────
export interface PhaseCreate {
  projectId: string;
  name: string;
  goal?: string | null;
  successCriteria?: string | null;
  scope?: string | null;
  description?: string | null;
  orderIndex?: number;
}

export async function createPhase(actor: Actor, input: PhaseCreate): Promise<Phase> {
  return rpcCreatePhase(actor, input.projectId, {
    name: input.name,
    goal: input.goal ?? null,
    successCriteria: input.successCriteria ?? null,
    scope: input.scope ?? null,
    description: input.description ?? null,
    orderIndex: input.orderIndex,
  });
}

export async function updatePhase(
  actor: Actor,
  id: string,
  patch: Partial<Pick<Phase, "name" | "goal" | "successCriteria" | "scope" | "description" | "orderIndex">>,
  expectedVersion?: number,
): Promise<Phase> {
  const project = await rpcProjectOf("phases", id);
  if (!project) throw new NotFoundError("Phase");
  const p: Record<string, unknown> = {};
  if (patch.name != null) p.name = patch.name;
  if (patch.goal !== undefined) p.goal = patch.goal;
  if (patch.successCriteria !== undefined) p.success_criteria = patch.successCriteria;
  if (patch.scope !== undefined) p.scope = patch.scope;
  if (patch.description !== undefined) p.description = patch.description;
  if (patch.orderIndex !== undefined) p.order_index = patch.orderIndex;
  return rpcUpdatePhase(actor, project, id, p, expectedVersion);
}

export async function setPhaseStatus(
  actor: Actor,
  id: string,
  to: Phase["status"],
): Promise<Phase> {
  const project = await rpcProjectOf("phases", id);
  if (!project) throw new NotFoundError("Phase");
  return rpcSetPhaseStatus(actor, project, id, to);
}

export async function softDeletePhase(actor: Actor, id: string): Promise<void> {
  const project = await rpcProjectOf("phases", id);
  if (!project) return;
  await rpcDeletePhase(actor, project, id);
}

// ───────────────────────── Task ─────────────────────────
export interface TaskCreate {
  projectId: string;
  phaseId: string;
  name: string;
  purpose?: string | null;
  successCriteria?: string | null;
  description?: string | null;
  priority?: Task["priority"];
}

export async function createTask(actor: Actor, input: TaskCreate): Promise<Task> {
  return rpcCreateTask(actor, input.projectId, {
    phaseId: input.phaseId,
    name: input.name,
    purpose: input.purpose ?? null,
    successCriteria: input.successCriteria ?? null,
    description: input.description ?? null,
    priority: input.priority ?? "MEDIUM",
  });
}

export async function updateTask(
  actor: Actor,
  id: string,
  patch: Partial<
    Pick<Task, "name" | "purpose" | "successCriteria" | "description" | "priority" | "progress">
  >,
  expectedVersion?: number,
): Promise<Task> {
  // Web call sites carry no projectId; resolve the owner so the RPC can keep its
  // project-ownership guard. camel patch → snake (RPC reads snake keys).
  const project = await rpcProjectOf("tasks", id);
  if (!project) throw new NotFoundError("Task");
  const p: Record<string, unknown> = {};
  if (patch.name != null) p.name = patch.name;
  if (patch.purpose !== undefined) p.purpose = patch.purpose;
  if (patch.successCriteria !== undefined) p.success_criteria = patch.successCriteria;
  if (patch.description !== undefined) p.description = patch.description;
  if (patch.priority != null) p.priority = patch.priority;
  if (patch.progress != null) p.progress = clamp(patch.progress);
  return rpcUpdateTask(actor, project, id, p, expectedVersion);
}

export async function setTaskStatus(
  actor: Actor,
  id: string,
  to: Task["status"],
): Promise<Task> {
  const project = await rpcProjectOf("tasks", id);
  if (!project) throw new NotFoundError("Task");
  return rpcSetTaskStatus(actor, project, id, to);
}

export async function softDeleteTask(actor: Actor, id: string): Promise<void> {
  const project = await rpcProjectOf("tasks", id);
  if (!project) return; // absent / already gone — no-op, matching prior behavior
  await rpcDeleteTask(actor, project, id);
}

// ───────────────────────── Current position ─────────────────────────
export async function setCurrentPhase(
  actor: Actor,
  projectId: string,
  phaseId: string,
): Promise<void> {
  await rpcSetCurrentPhase(actor, projectId, phaseId);
}

export async function setCurrentTask(
  actor: Actor,
  projectId: string,
  taskId: string,
): Promise<void> {
  await rpcSetCurrentTask(actor, projectId, taskId);
}

// ───────────────────────── Branch ─────────────────────────
export interface BranchCreate {
  projectId: string;
  sourceType: Branch["sourceType"];
  sourceId: string;
  name: string;
  reason: string;
  goal: string;
  successCriteria?: string | null;
  returnPointType: Branch["returnPointType"];
  returnPointId: string;
}

export async function createBranch(actor: Actor, input: BranchCreate): Promise<Branch> {
  // source/goal/reason presence + node-existence (§37) are enforced inside the RPC.
  return rpcCreateBranch(actor, input.projectId, {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    name: input.name,
    reason: input.reason,
    goal: input.goal,
    successCriteria: input.successCriteria ?? null,
    returnPointType: input.returnPointType,
    returnPointId: input.returnPointId,
  });
}

export async function setBranchStatus(
  actor: Actor,
  id: string,
  to: Branch["status"],
): Promise<Branch> {
  const project = await rpcProjectOf("branches", id);
  if (!project) throw new NotFoundError("Branch");
  return rpcSetBranchStatus(actor, project, id, to);
}

export async function closeBranch(
  actor: Actor,
  id: string,
  resolution: string,
): Promise<Branch> {
  const project = await rpcProjectOf("branches", id);
  if (!project) throw new NotFoundError("Branch");
  return rpcCloseBranch(actor, project, id, resolution);
}

// ───────────────────────── North Star (governance; Web = human) ─────────────────────────
export async function upsertNorthStar(
  actor: Actor,
  projectId: string,
  patch: Partial<Omit<NorthStar, "id" | "projectId" | "createdAt" | "updatedAt" | "version">>,
): Promise<NorthStar> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(northStars).where(eq(northStars.projectId, projectId));
    let row: NorthStar;
    if (cur) {
      [row] = await tx
        .update(northStars)
        .set({ ...patch, version: sql`${northStars.version} + 1`, updatedAt: new Date() })
        .where(eq(northStars.id, cur.id))
        .returning();
    } else {
      [row] = await tx
        .insert(northStars)
        .values({ projectId, ...patch })
        .returning();
    }
    await logActivity(tx, {
      projectId,
      actor,
      action: cur ? "NORTH_STAR_UPDATED" : "NORTH_STAR_CREATED",
      entityType: "north_star",
      entityId: row.id,
      summary: cur ? "更新 North Star" : "创建 North Star",
      after: patch,
    });
    return row;
  });
}

// re-export for callers needing project existence checks
export async function assertProjectExists(projectId: string): Promise<Project> {
  const db = getDb();
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  if (!p) throw new NotFoundError("Project");
  return p;
}

// ───────────────────────── Issue ─────────────────────────
export interface IssueCreate {
  projectId: string;
  title: string;
  description?: string | null;
  severity?: Issue["severity"];
  source?: string | null;
  relatedPhaseId?: string | null;
  relatedTaskId?: string | null;
  relatedBranchId?: string | null;
}

export async function createIssue(actor: Actor, input: IssueCreate): Promise<Issue> {
  return rpcCreateIssue(actor, input.projectId, {
    title: input.title,
    description: input.description ?? null,
    severity: input.severity ?? null,
    source: input.source ?? null,
    relatedTaskId: input.relatedTaskId ?? null,
    relatedPhaseId: input.relatedPhaseId ?? null,
    relatedBranchId: input.relatedBranchId ?? null,
  });
}

export async function setIssueStatus(
  actor: Actor,
  id: string,
  to: Issue["status"],
  resolution?: string,
): Promise<Issue> {
  const project = await rpcProjectOf("issues", id);
  if (!project) throw new NotFoundError("Issue");
  return rpcSetIssueStatus(actor, project, id, to, resolution ?? null);
}

// ───────────────────────── Decision ─────────────────────────
export interface DecisionCreate {
  projectId: string;
  title: string;
  decision: string;
  reason?: string | null;
  alternatives?: string | null;
  impact?: string | null;
  createdByLabel?: string;
}

export async function createDecision(actor: Actor, input: DecisionCreate): Promise<Decision> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(decisions)
      .values({
        projectId: input.projectId,
        title: input.title,
        decision: input.decision,
        reason: input.reason ?? null,
        alternatives: input.alternatives ?? null,
        impact: input.impact ?? null,
        status: "PROPOSED",
        createdBy: input.createdByLabel ?? actor.actorLabel ?? null,
      })
      .returning();
    await logActivity(tx, {
      projectId: input.projectId,
      actor,
      action: "DECISION_CREATED",
      entityType: "decision",
      entityId: row.id,
      summary: `提出 Decision「${row.title}」`,
      after: { title: row.title },
    });
    return row;
  });
}

export async function decideDecision(
  actor: Actor,
  id: string,
  to: Decision["status"],
): Promise<Decision> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(decisions).where(eq(decisions.id, id));
    if (!cur) throw new NotFoundError("Decision");
    assertTransit("Decision", DECISION_TRANSITIONS, cur.status, to);
    const [row] = await tx
      .update(decisions)
      .set({
        status: to,
        approvedAt: to === "APPROVED" ? new Date() : cur.approvedAt,
        version: sql`${decisions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(decisions.id, id))
      .returning();
    await logActivity(tx, {
      projectId: cur.projectId,
      actor,
      action: to === "APPROVED" ? "DECISION_APPROVED" : "DECISION_STATUS",
      entityType: "decision",
      entityId: row.id,
      summary: `Decision「${row.title}」${cur.status} → ${to}`,
      before: { status: cur.status },
      after: { status: to },
    });
    return row;
  });
}

// ───────────────────────── Proposal (+ Parking Lot) ─────────────────────────
export interface ProposalCreate {
  projectId: string;
  kind?: Proposal["kind"];
  title: string;
  reason?: string | null;
  description?: string | null;
  impact?: string | null;
  relatedTaskId?: string | null;
}

export async function createProposal(actor: Actor, input: ProposalCreate): Promise<Proposal> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(proposals)
      .values({
        projectId: input.projectId,
        kind: input.kind ?? "OTHER",
        title: input.title,
        reason: input.reason ?? null,
        description: input.description ?? null,
        impact: input.impact ?? null,
        relatedTaskId: input.relatedTaskId ?? null,
        createdByType: actor.actorType === "AGENT" ? "AGENT" : "HUMAN",
        createdById: actor.actorId ?? null,
      })
      .returning();
    await logActivity(tx, {
      projectId: input.projectId,
      actor,
      action: "PROPOSAL_CREATED",
      entityType: "proposal",
      entityId: row.id,
      summary: `提交提案「${row.title}」(${row.kind})`,
      after: { title: row.title, kind: row.kind },
    });
    return row;
  });
}

export async function decideProposal(
  actor: Actor,
  id: string,
  to: Proposal["status"],
): Promise<Proposal> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(proposals).where(eq(proposals.id, id));
    if (!cur) throw new NotFoundError("Proposal");
    assertTransit("Proposal", PROPOSAL_TRANSITIONS, cur.status, to);
    const [row] = await tx
      .update(proposals)
      .set({
        status: to,
        decidedBy: actor.actorType === "HUMAN" ? actor.actorId ?? null : cur.decidedBy,
        decidedAt: new Date(),
        version: sql`${proposals.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .returning();
    await logActivity(tx, {
      projectId: cur.projectId,
      actor,
      action:
        to === "APPROVED" ? "PROPOSAL_APPROVED" : to === "REJECTED" ? "PROPOSAL_REJECTED" : "PROPOSAL_STATUS",
      entityType: "proposal",
      entityId: row.id,
      summary: `提案「${row.title}」${cur.status} → ${to}`,
      before: { status: cur.status },
      after: { status: to },
    });
    return row;
  });
}

// ───────────────────────── Checkpoint (append-only snapshot) ─────────────────────────
export interface CheckpointCreate {
  projectId: string;
  summary: string;
  taskId?: string | null;
  branchId?: string | null;
  agentId?: string | null;
  sessionId?: string | null;
  completedItems?: string[];
  unfinishedItems?: string[];
  newIssues?: string[];
  newDecisions?: string[];
  newBranches?: string[];
  currentStatus?: string | null;
  nextAction?: string | null;
}

export async function createCheckpoint(
  actor: Actor,
  input: CheckpointCreate,
): Promise<Checkpoint> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(checkpoints)
      .values({
        projectId: input.projectId,
        summary: input.summary,
        taskId: input.taskId ?? null,
        branchId: input.branchId ?? null,
        agentId: input.agentId ?? null,
        sessionId: input.sessionId ?? null,
        completedItems: input.completedItems ?? [],
        unfinishedItems: input.unfinishedItems ?? [],
        newIssues: input.newIssues ?? [],
        newDecisions: input.newDecisions ?? [],
        newBranches: input.newBranches ?? [],
        currentStatus: input.currentStatus ?? null,
        nextAction: input.nextAction ?? null,
        createdByType: actor.actorType === "AGENT" ? "AGENT" : "HUMAN",
        createdById: actor.actorId ?? null,
      })
      .returning();
    await logActivity(tx, {
      projectId: input.projectId,
      actor,
      action: "CHECKPOINT_CREATED",
      entityType: "checkpoint",
      entityId: row.id,
      summary: `Checkpoint：${row.summary.slice(0, 60)}`,
      after: { completed: row.completedItems.length, unfinished: row.unfinishedItems.length },
    });
    return row;
  });
}
