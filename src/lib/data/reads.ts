import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { branches, phases, tasks } from "@/lib/db/schema";

export async function listPhaseRows(projectId: string) {
  const db = getDb();
  return db
    .select({
      id: phases.id,
      name: phases.name,
      status: phases.status,
      orderIndex: phases.orderIndex,
      goal: phases.goal,
      successCriteria: phases.successCriteria,
      scope: phases.scope,
      version: phases.version,
    })
    .from(phases)
    .where(and(eq(phases.projectId, projectId), isNull(phases.deletedAt)))
    .orderBy(asc(phases.orderIndex));
}

export async function listTaskRows(projectId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      status: tasks.status,
      progress: tasks.progress,
      priority: tasks.priority,
      purpose: tasks.purpose,
      successCriteria: tasks.successCriteria,
      phaseId: tasks.phaseId,
      version: tasks.version,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.createdAt));
  const phaseIds = [...new Set(rows.map((r) => r.phaseId))];
  const ph = phaseIds.length
    ? await db
        .select({ id: phases.id, name: phases.name })
        .from(phases)
        .where(inArray(phases.id, phaseIds))
    : [];
  const nameOf = new Map(ph.map((p) => [p.id, p.name]));
  return rows.map((r) => ({ ...r, phaseName: nameOf.get(r.phaseId) ?? "?" }));
}

export async function listBranchRows(projectId: string) {
  const db = getDb();
  return db
    .select({
      id: branches.id,
      name: branches.name,
      status: branches.status,
      reason: branches.reason,
      goal: branches.goal,
      sourceType: branches.sourceType,
      sourceId: branches.sourceId,
      returnPointType: branches.returnPointType,
      returnPointId: branches.returnPointId,
      progress: branches.progress,
      resolution: branches.resolution,
      version: branches.version,
      closedAt: branches.closedAt,
    })
    .from(branches)
    .where(and(eq(branches.projectId, projectId), isNull(branches.deletedAt)))
    .orderBy(asc(branches.createdAt));
}

export async function phaseOptions(projectId: string) {
  const db = getDb();
  return db
    .select({ id: phases.id, name: phases.name })
    .from(phases)
    .where(and(eq(phases.projectId, projectId), isNull(phases.deletedAt)))
    .orderBy(asc(phases.orderIndex));
}

export async function taskOptions(projectId: string) {
  const db = getDb();
  return db
    .select({ id: tasks.id, name: tasks.name })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.createdAt));
}
