import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  agents,
  branches,
  checkpoints,
  decisions,
  issues,
  phases,
  proposals,
  tasks,
} from "@/lib/db/schema";

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

export async function listIssueRows(projectId: string) {
  const db = getDb();
  return db
    .select({
      id: issues.id,
      title: issues.title,
      description: issues.description,
      severity: issues.severity,
      status: issues.status,
      source: issues.source,
      resolution: issues.resolution,
      relatedTaskId: issues.relatedTaskId,
      relatedPhaseId: issues.relatedPhaseId,
      version: issues.version,
      createdAt: issues.createdAt,
    })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), isNull(issues.deletedAt)))
    .orderBy(desc(issues.createdAt));
}

export async function listDecisionRows(projectId: string) {
  const db = getDb();
  return db
    .select({
      id: decisions.id,
      title: decisions.title,
      decision: decisions.decision,
      reason: decisions.reason,
      alternatives: decisions.alternatives,
      impact: decisions.impact,
      status: decisions.status,
      createdBy: decisions.createdBy,
      version: decisions.version,
      createdAt: decisions.createdAt,
    })
    .from(decisions)
    .where(and(eq(decisions.projectId, projectId), isNull(decisions.deletedAt)))
    .orderBy(desc(decisions.updatedAt));
}

export async function listProposalRows(projectId: string) {
  const db = getDb();
  return db
    .select({
      id: proposals.id,
      kind: proposals.kind,
      title: proposals.title,
      reason: proposals.reason,
      description: proposals.description,
      impact: proposals.impact,
      status: proposals.status,
      relatedTaskId: proposals.relatedTaskId,
      version: proposals.version,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(eq(proposals.projectId, projectId))
    .orderBy(desc(proposals.createdAt));
}

export async function listCheckpointRows(projectId: string) {
  const db = getDb();
  const rows = await db
    .select({
      c: checkpoints,
      agentName: agents.name,
    })
    .from(checkpoints)
    .leftJoin(agents, eq(agents.id, checkpoints.agentId))
    .where(and(eq(checkpoints.projectId, projectId), isNull(checkpoints.deletedAt)))
    .orderBy(desc(checkpoints.createdAt));
  return rows.map((r) => ({ ...r.c, agentName: r.agentName }));
}
