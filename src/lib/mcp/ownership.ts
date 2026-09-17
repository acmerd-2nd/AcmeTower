/**
 * Cross-project isolation guard for MCP mutations/reads-by-id (§36).
 *
 * The shared write layer trusts its caller and never filters by project, so the
 * MCP boundary must prove an entity id actually belongs to the token's project
 * before handing it over. This closes the "use a project-A token to touch a
 * project-B row" hole — the Project Access rung of the auth chain.
 */
import { eq } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import {
  branches,
  checkpoints,
  decisions,
  issues,
  phases,
  proposals,
  tasks,
} from "@/lib/db/schema";
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

const COLS: Record<string, { table: PgTable; id: PgColumn; projectId: PgColumn }> = {
  task: { table: tasks, id: tasks.id, projectId: tasks.projectId },
  branch: { table: branches, id: branches.id, projectId: branches.projectId },
  issue: { table: issues, id: issues.id, projectId: issues.projectId },
  checkpoint: { table: checkpoints, id: checkpoints.id, projectId: checkpoints.projectId },
  proposal: { table: proposals, id: proposals.id, projectId: proposals.projectId },
  phase: { table: phases, id: phases.id, projectId: phases.projectId },
  decision: { table: decisions, id: decisions.id, projectId: decisions.projectId },
};

/** The owning project id of an entity, or null if it does not exist. */
export async function ownerOfProject(type: keyof typeof COLS, id: string): Promise<string | null> {
  const { table, id: idCol, projectId } = COLS[type];
  const db = getDb();
  const [row] = await db.select({ projectId }).from(table as any).where(eq(idCol, id));
  return row ? String(row.projectId) : null;
}

/** Throw NotFound if absent, Forbidden if it belongs to another project. */
export async function assertOwned(type: keyof typeof COLS, id: string, principal: McpPrincipal): Promise<void> {
  const owner = await ownerOfProject(type, id);
  if (!owner) throw new NotFoundError(type);
  if (owner !== principal.projectId) throw new ForbiddenError(type);
}
