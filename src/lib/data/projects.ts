import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects, workspaces, type Project } from "@/lib/db/schema";
import { httpProjectCards } from "@/lib/mcp/httpdata";

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

/**
 * Project Home cards (v0.1 规格 §6/§7). V0.3 Surface E: converged onto the same
 * HTTPS read layer as /mcp — page loads no longer touch the Hyperdrive TCP tunnel.
 */
export async function listProjectCards(params: ListParams = {}): Promise<ProjectCard[]> {
  return httpProjectCards(params);
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
