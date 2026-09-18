/**
 * Cross-project isolation guard for MCP mutations/reads-by-id (§36).
 *
 * The shared write layer trusts its caller and never filters by project, so the
 * MCP boundary must prove an entity id actually belongs to the token's project
 * before handing it over. This closes the "use a project-A token to touch a
 * project-B row" hole — the Project Access rung of the auth chain.
 *
 * Runs over the HTTPS PostgREST path (lib/mcp/rest.ts) so the guard itself never
 * hits the flaky Hyperdrive TCP tunnel.
 */
import { restSelect } from "@/lib/mcp/rest";
import type { McpPrincipal } from "@/lib/mcp/principal";

export class ForbiddenError extends Error {
  constructor(type: string) {
    super(`${type} 不属于本令牌授权的项目（跨项目访问被拒绝）`);
    this.name = "ForbiddenError";
  }
}
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} 不存在`);
    this.name = "NotFoundError";
  }
}

// Logical entity type → physical table (each carries a project_id column).
const TABLE: Record<string, string> = {
  task: "tasks",
  branch: "branches",
  issue: "issues",
  checkpoint: "checkpoints",
  proposal: "proposals",
  phase: "phases",
  decision: "decisions",
};

/** The owning project id of an entity, or null if it does not exist. */
export async function ownerOfProject(type: keyof typeof TABLE | string, id: string): Promise<string | null> {
  const table = TABLE[type];
  if (!table) return null;
  const rows = await restSelect(table, `id=eq.${encodeURIComponent(id)}&limit=1`, { columns: "project_id" });
  const v = rows[0]?.project_id;
  return v == null ? null : String(v);
}

/** Throw NotFound if absent, Forbidden if it belongs to another project. */
export async function assertOwned(type: keyof typeof TABLE | string, id: string, principal: McpPrincipal): Promise<void> {
  const owner = await ownerOfProject(type, id);
  if (!owner) throw new NotFoundError(String(type));
  if (owner !== principal.projectId) throw new ForbiddenError(String(type));
}
