/**
 * MCP bearer-token authentication — the "Token → Project Access" rung of the
 * auth chain (v0.1设计文档 §42–§43).
 *
 * Deliberately free of any @modelcontextprotocol/server runtime import: bundling
 * that SDK into the worker was measured to trigger intermittent HTTP 1101s on
 * Cloudflare/workerd. The gateway is hand-rolled (see lib/mcp/server.ts), so here
 * we only need to resolve an opaque `oak_…` token to a principal. On any failure
 * we return null and let the route answer 401.
 *
 * Resolution steps (all must pass, else null):
 *   1. hash the presented token, find a live mcp_credentials row
 *   2. not revoked, not expired
 *   3. its project still exists, is not deleted, is not archived
 * The winning row's (projectId, permissionLevel) becomes the request principal.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { withDbRetry } from "@/lib/db/retry";
import { mcpCredentials, projects } from "@/lib/db/schema";
import { hashToken, tokenPrefix } from "@/lib/mcp/token";
import type { McpPrincipal, PermissionLevel } from "@/lib/mcp/principal";

export async function resolveMcpPrincipal(token: string | null): Promise<McpPrincipal | null> {
  if (!token || token.length < 8) return null;

  const hash = await hashToken(token);
  const db = getDb();

  const [cred] = await withDbRetry(
    () => db.select().from(mcpCredentials).where(eq(mcpCredentials.tokenHash, hash)),
    { label: "cred-lookup" },
  );
  if (!cred) return null;

  if (cred.revokedAt) return null;
  if (cred.expiresAt && cred.expiresAt.getTime() <= Date.now()) return null;

  const [project] = await withDbRetry(
    () =>
      db
        .select({ id: projects.id, status: projects.status, deletedAt: projects.deletedAt })
        .from(projects)
        .where(eq(projects.id, cred.projectId)),
    { label: "project-lookup" },
  );
  if (!project || project.deletedAt) return null;
  if (project.status === "ARCHIVED") return null;

  return {
    credentialId: cred.id,
    projectId: cred.projectId,
    agentId: cred.agentId ?? null,
    permissionLevel: cred.permissionLevel as PermissionLevel,
    credentialName: cred.name,
    tokenPrefix: tokenPrefix(token),
  };
}

/** Pull a `Bearer` token out of an Authorization header value. */
export function bearerFromHeader(authorization: string | null): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m ? m[1].trim() : null;
}
