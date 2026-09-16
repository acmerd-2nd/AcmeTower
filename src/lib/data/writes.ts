import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import {
  branches,
  northStars,
  phases,
  projects,
  tasks,
  type Branch,
  type NorthStar,
  type Phase,
  type Project,
  type Task,
} from "@/lib/db/schema";
import { logActivity, type Actor } from "@/lib/core/audit";
import {
  assertTransit,
  BRANCH_TRANSITIONS,
  PHASE_TRANSITIONS,
  TASK_TRANSITIONS,
} from "@/lib/core/state-machines";

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
  const db = getDb();
  return db.transaction(async (tx) => {
    let order = input.orderIndex;
    if (order === undefined) {
      const [max] = await tx
        .select({ m: sql<number>`coalesce(max(${phases.orderIndex}),0)::int` })
        .from(phases)
        .where(eq(phases.projectId, input.projectId));
      order = (max?.m ?? 0) + 1;
    }
    const [row] = await tx
      .insert(phases)
      .values({
        projectId: input.projectId,
        name: input.name,
        goal: input.goal ?? null,
        successCriteria: input.successCriteria ?? null,
        scope: input.scope ?? null,
        description: input.description ?? null,
        orderIndex: order,
      })
      .returning();
    await logActivity(tx, {
      projectId: input.projectId,
      actor,
      action: "PHASE_CREATED",
      entityType: "phase",
      entityId: row.id,
      summary: `创建 Phase「${row.name}」`,
      after: { name: row.name, orderIndex: row.orderIndex },
    });
    return row;
  });
}

export async function updatePhase(
  actor: Actor,
  id: string,
  patch: Partial<Pick<Phase, "name" | "goal" | "successCriteria" | "scope" | "description" | "orderIndex">>,
  expectedVersion?: number,
): Promise<Phase> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const conds = [eq(phases.id, id)];
    if (expectedVersion != null) conds.push(eq(phases.version, expectedVersion));
    const [row] = await tx
      .update(phases)
      .set({ ...patch, version: sql`${phases.version} + 1`, updatedAt: new Date() })
      .where(and(...conds))
      .returning();
    if (!row) {
      const [exists] = await tx.select({ id: phases.id }).from(phases).where(eq(phases.id, id));
      if (!exists) throw new NotFoundError("Phase");
      throw new ConflictError("Phase");
    }
    await logActivity(tx, {
      projectId: row.projectId,
      actor,
      action: "PHASE_UPDATED",
      entityType: "phase",
      entityId: row.id,
      summary: `更新 Phase「${row.name}」`,
      after: patch,
    });
    return row;
  });
}

export async function setPhaseStatus(
  actor: Actor,
  id: string,
  to: Phase["status"],
): Promise<Phase> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(phases).where(eq(phases.id, id));
    if (!cur) throw new NotFoundError("Phase");
    assertTransit("Phase", PHASE_TRANSITIONS, cur.status, to);
    const [row] = await tx
      .update(phases)
      .set({ status: to, version: sql`${phases.version} + 1`, updatedAt: new Date() })
      .where(eq(phases.id, id))
      .returning();
    await logActivity(tx, {
      projectId: cur.projectId,
      actor,
      action: "PHASE_STATUS",
      entityType: "phase",
      entityId: row.id,
      summary: `Phase「${row.name}」状态 ${cur.status} → ${to}`,
      before: { status: cur.status },
      after: { status: to },
    });
    return row;
  });
}

export async function softDeletePhase(actor: Actor, id: string): Promise<void> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(phases).where(eq(phases.id, id));
    if (!cur) return;
    await tx.update(phases).set({ deletedAt: new Date() }).where(eq(phases.id, id));
    await logActivity(tx, {
      projectId: cur.projectId,
      actor,
      action: "PHASE_DELETED",
      entityType: "phase",
      entityId: id,
      summary: `归档 Phase「${cur.name}」`,
    });
  });
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
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        projectId: input.projectId,
        phaseId: input.phaseId,
        name: input.name,
        purpose: input.purpose ?? null,
        successCriteria: input.successCriteria ?? null,
        description: input.description ?? null,
        priority: input.priority ?? "MEDIUM",
      })
      .returning();
    await logActivity(tx, {
      projectId: input.projectId,
      actor,
      action: "TASK_CREATED",
      entityType: "task",
      entityId: row.id,
      summary: `创建任务「${row.name}」`,
      after: { name: row.name, status: row.status },
    });
    return row;
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
  const db = getDb();
  return db.transaction(async (tx) => {
    const clean = { ...patch };
    if (clean.progress != null) clean.progress = clamp(clean.progress);
    const conds = [eq(tasks.id, id)];
    if (expectedVersion != null) conds.push(eq(tasks.version, expectedVersion));
    const [row] = await tx
      .update(tasks)
      .set({ ...clean, version: sql`${tasks.version} + 1`, updatedAt: new Date() })
      .where(and(...conds))
      .returning();
    if (!row) {
      const [exists] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id));
      if (!exists) throw new NotFoundError("Task");
      throw new ConflictError("Task");
    }
    await logActivity(tx, {
      projectId: row.projectId,
      actor,
      action: "TASK_UPDATED",
      entityType: "task",
      entityId: row.id,
      summary: `更新任务「${row.name}」`,
      after: clean,
    });
    return row;
  });
}

export async function setTaskStatus(
  actor: Actor,
  id: string,
  to: Task["status"],
): Promise<Task> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(tasks).where(eq(tasks.id, id));
    if (!cur) throw new NotFoundError("Task");
    assertTransit("Task", TASK_TRANSITIONS, cur.status, to);
    const [row] = await tx
      .update(tasks)
      .set({
        status: to,
        progress: to === "COMPLETED" ? 100 : cur.progress,
        completedAt: to === "COMPLETED" ? new Date() : cur.completedAt,
        version: sql`${tasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    await logActivity(tx, {
      projectId: cur.projectId,
      actor,
      action: "TASK_STATUS",
      entityType: "task",
      entityId: row.id,
      summary: `任务「${row.name}」状态 ${cur.status} → ${to}`,
      before: { status: cur.status },
      after: { status: to },
    });
    return row;
  });
}

export async function softDeleteTask(actor: Actor, id: string): Promise<void> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(tasks).where(eq(tasks.id, id));
    if (!cur) return;
    await tx.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, id));
    await logActivity(tx, {
      projectId: cur.projectId,
      actor,
      action: "TASK_DELETED",
      entityType: "task",
      entityId: id,
      summary: `归档任务「${cur.name}」`,
    });
  });
}

// ───────────────────────── Current position ─────────────────────────
export async function setCurrentPhase(
  actor: Actor,
  projectId: string,
  phaseId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(projects)
    .set({ currentPhaseId: phaseId, version: sql`${projects.version} + 1`, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  await logActivity(db, {
    projectId,
    actor,
    action: "PROJECT_SET_PHASE",
    entityType: "project",
    entityId: projectId,
    summary: `当前 Phase 设为 ${phaseId}`,
  });
}

export async function setCurrentTask(
  actor: Actor,
  projectId: string,
  taskId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(projects)
    .set({ currentTaskId: taskId, version: sql`${projects.version} + 1`, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  await logActivity(db, {
    projectId,
    actor,
    action: "PROJECT_SET_TASK",
    entityType: "project",
    entityId: projectId,
    summary: `当前 Task 设为 ${taskId}`,
  });
}

// ───────────────────────── Branch ─────────────────────────
async function nodeExists(
  tx: Pick<Db, "select">,
  type: "PHASE" | "TASK" | "BRANCH",
  id: string,
): Promise<boolean> {
  if (type === "PHASE") {
    const [r] = await tx.select({ id: phases.id }).from(phases).where(eq(phases.id, id));
    return !!r;
  }
  if (type === "TASK") {
    const [r] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id));
    return !!r;
  }
  const [r] = await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, id));
  return !!r;
}

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
  if (!input.sourceType || !input.reason?.trim() || !input.goal?.trim()) {
    throw new Error("分支必须有 Source、Reason 与 Goal");
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    if (input.sourceType !== "PROJECT" && !(await nodeExists(tx, input.sourceType, input.sourceId))) {
      throw new NotFoundError(`来源 ${input.sourceType} ${input.sourceId}`);
    }
    if (
      input.returnPointType !== "PROJECT" &&
      !(await nodeExists(tx, input.returnPointType, input.returnPointId))
    ) {
      throw new Error(`INVALID_RETURN_POINT：Return Point ${input.returnPointType} ${input.returnPointId} 不存在`);
    }
    const [row] = await tx
      .insert(branches)
      .values({
        projectId: input.projectId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        name: input.name,
        reason: input.reason,
        goal: input.goal,
        successCriteria: input.successCriteria ?? null,
        returnPointType: input.returnPointType,
        returnPointId: input.returnPointId,
        createdByType: actor.actorType === "AGENT" ? "AGENT" : "HUMAN",
        createdById: actor.actorId ?? null,
      })
      .returning();
    await logActivity(tx, {
      projectId: input.projectId,
      actor,
      action: "BRANCH_CREATED",
      entityType: "branch",
      entityId: row.id,
      summary: `创建分支「${row.name}」（来源 ${row.sourceType}，回到 ${row.returnPointType}）`,
      after: { name: row.name, reason: row.reason, goal: row.goal },
    });
    return row;
  });
}

export async function setBranchStatus(
  actor: Actor,
  id: string,
  to: Branch["status"],
): Promise<Branch> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(branches).where(eq(branches.id, id));
    if (!cur) throw new NotFoundError("Branch");
    assertTransit("Branch", BRANCH_TRANSITIONS, cur.status, to);
    const [row] = await tx
      .update(branches)
      .set({
        status: to,
        closedAt: to === "RESOLVED" || to === "ABANDONED" ? new Date() : cur.closedAt,
        version: sql`${branches.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(branches.id, id))
      .returning();
    await logActivity(tx, {
      projectId: cur.projectId,
      actor,
      action: "BRANCH_STATUS",
      entityType: "branch",
      entityId: row.id,
      summary: `分支「${row.name}」状态 ${cur.status} → ${to}`,
      before: { status: cur.status },
      after: { status: to },
    });
    return row;
  });
}

export async function closeBranch(
  actor: Actor,
  id: string,
  resolution: string,
): Promise<Branch> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(branches).where(eq(branches.id, id));
    if (!cur) throw new NotFoundError("Branch");
    assertTransit("Branch", BRANCH_TRANSITIONS, cur.status, "RESOLVED");
    const [row] = await tx
      .update(branches)
      .set({
        status: "RESOLVED",
        resolution,
        closedAt: new Date(),
        version: sql`${branches.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(branches.id, id))
      .returning();
    await logActivity(tx, {
      projectId: cur.projectId,
      actor,
      action: "BRANCH_RESOLVED",
      entityType: "branch",
      entityId: row.id,
      summary: `关闭分支「${row.name}」并回到 ${row.returnPointType}`,
      after: { resolution },
    });
    return row;
  });
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
