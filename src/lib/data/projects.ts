import { and, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  agents,
  branches,
  issues,
  phases,
  projects,
  tasks,
  workspaces,
  type Project,
} from "@/lib/db/schema";

export type ProjectStatusFilter =
  | "ALL"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "ARCHIVED"
  | "RISK";

export interface ListParams {
  q?: string;
  status?: ProjectStatusFilter;
}

/** Aggregate data shown on a Project Home card (v0.1 规格 §6/§7). */
export interface ProjectCard {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  status: Project["status"];
  health: Project["health"];
  currentPhaseName: string | null;
  phaseIndex: number | null; // "x" of "x / y"
  phaseTotal: number;
  currentTaskName: string | null;
  currentAgentName: string | null;
  progress: number; // 0–100
  openBranches: number;
  openIssues: number;
  updatedAt: Date;
}

function statusPredicate(status: ProjectStatusFilter | undefined) {
  switch (status) {
    case "ACTIVE":
      return eq(projects.status, "ACTIVE");
    case "PAUSED":
      return eq(projects.status, "PAUSED");
    case "COMPLETED":
      return eq(projects.status, "COMPLETED");
    case "ARCHIVED":
      return eq(projects.status, "ARCHIVED");
    case "RISK":
      return ne(projects.health, "GREEN");
    default:
      return undefined; // ALL
  }
}

export async function listProjectCards(params: ListParams = {}): Promise<ProjectCard[]> {
  const db = getDb();
  const preds = [isNull(projects.deletedAt)];
  const sp = statusPredicate(params.status);
  if (sp) preds.push(sp);
  if (params.q?.trim()) {
    const like = `%${params.q.trim()}%`;
    const qpred = or(ilike(projects.name, like), ilike(projects.description, like));
    if (qpred) preds.push(qpred);
  }

  const rows = await db
    .select()
    .from(projects)
    .where(and(...preds))
    .orderBy(desc(projects.updatedAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [branchAgg, issueAgg, taskAgg, phaseCount, phaseRows, currentTaskRows] =
    await Promise.all([
      db
        .select({ projectId: branches.projectId, n: count() })
        .from(branches)
        .where(
          and(
            inArray(branches.projectId, ids),
            inArray(branches.status, ["OPEN", "IN_PROGRESS", "BLOCKED"]),
          ),
        )
        .groupBy(branches.projectId),
      db
        .select({ projectId: issues.projectId, n: count() })
        .from(issues)
        .where(
          and(
            inArray(issues.projectId, ids),
            inArray(issues.status, ["OPEN", "IN_PROGRESS"]),
          ),
        )
        .groupBy(issues.projectId),
      db
        .select({
          projectId: tasks.projectId,
          avg: sql<number>`coalesce(round(avg(${tasks.progress})), 0)::int`,
        })
        .from(tasks)
        .where(and(inArray(tasks.projectId, ids), isNull(tasks.deletedAt)))
        .groupBy(tasks.projectId),
      db
        .select({ projectId: phases.projectId, n: count() })
        .from(phases)
        .where(and(inArray(phases.projectId, ids), isNull(phases.deletedAt)))
        .groupBy(phases.projectId),
      db
        .select({
          id: phases.id,
          projectId: phases.projectId,
          name: phases.name,
          orderIndex: phases.orderIndex,
        })
        .from(phases)
        .where(and(inArray(phases.projectId, ids), isNull(phases.deletedAt))),
      db
        .select({
          projectId: projects.id,
          taskName: tasks.name,
          agentName: agents.name,
        })
        .from(projects)
        .leftJoin(tasks, eq(tasks.id, projects.currentTaskId))
        .leftJoin(agents, eq(agents.id, tasks.currentAgentId))
        .where(inArray(projects.id, ids)),
    ]);

  const byId = <T extends { projectId: string }>(arr: T[]) => {
    const m = new Map<string, T>();
    for (const x of arr) m.set(x.projectId, x);
    return m;
  };
  const branchMap = byId(branchAgg);
  const issueMap = byId(issueAgg);
  const taskMap = byId(taskAgg);
  const phaseCountMap = byId(phaseCount);
  const currentTaskMap = byId(currentTaskRows);

  return rows.map((r) => {
    const projPhases = phaseRows
      .filter((p) => p.projectId === r.id)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const currentPhase =
      (r.currentPhaseId && projPhases.find((p) => p.id === r.currentPhaseId)) ||
      projPhases[projPhases.length - 1];
    const phaseIndex = currentPhase
      ? projPhases.findIndex((p) => p.id === currentPhase.id) + 1
      : null;
    const ct = currentTaskMap.get(r.id);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      icon: r.icon,
      description: r.description,
      status: r.status,
      health: r.health,
      currentPhaseName: currentPhase?.name ?? null,
      phaseIndex,
      phaseTotal: phaseCountMap.get(r.id)?.n ?? projPhases.length,
      currentTaskName: ct?.taskName ?? null,
      currentAgentName: ct?.agentName ?? null,
      progress: taskMap.get(r.id)?.avg ?? 0,
      openBranches: branchMap.get(r.id)?.n ?? 0,
      openIssues: issueMap.get(r.id)?.n ?? 0,
      updatedAt: r.updatedAt,
    } satisfies ProjectCard;
  });
}

export interface NewProjectInput {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  workspaceSlug?: string;
  createdBy?: string | null;
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const db = getDb();
  const [w] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, input.workspaceSlug ?? "personal"));
  if (!w) throw new Error(`workspace "${input.workspaceSlug ?? "personal"}" not found`);

  const [row] = await db
    .insert(projects)
    .values({
      workspaceId: w.id,
      name: input.name,
      slug: await uniqueSlug(input.slug),
      description: input.description ?? null,
      icon: input.icon ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  const clean =
    base
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  let candidate = clean;
  for (let i = 0; i < 50; i++) {
    const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, candidate));
    if (!existing) return candidate;
    candidate = `${clean}-${Date.now().toString(36)}${i ? `-${i}` : ""}`;
  }
  throw new Error("could not allocate a unique slug");
}

export async function setProjectStatus(id: string, status: Project["status"]): Promise<void> {
  const db = getDb();
  await db
    .update(projects)
    .set({
      status,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
      version: sql`${projects.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));
}
