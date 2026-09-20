import { httpProjectCards } from "@/lib/mcp/httpdata";
import { rpcCreateProject, rpcSetProjectStatus } from "@/lib/data/app-rpc";
import type { Actor } from "@/lib/core/audit";
import type { Project } from "@/lib/db/schema";

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

/**
 * Create a project over HTTPS RPC (V0.3b): workspace resolution + unique-slug
 * allocation + insert + audit all happen atomically in `app_create_project`, so
 * "新建项目" never touches the Hyperdrive tunnel that caused HTTP 1101.
 */
export async function createProject(actor: Actor, input: NewProjectInput): Promise<Project> {
  const base =
    input.slug
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  return rpcCreateProject(actor, {
    name: input.name,
    slug: base,
    description: input.description ?? null,
    icon: input.icon ?? null,
    workspaceSlug: input.workspaceSlug,
    createdBy: input.createdBy ?? actor.actorId ?? null,
  });
}

export async function setProjectStatus(actor: Actor, id: string, status: Project["status"]): Promise<void> {
  await rpcSetProjectStatus(actor, id, status);
}
