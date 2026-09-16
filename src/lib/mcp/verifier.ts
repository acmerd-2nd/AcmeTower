/**
 * MCP bearer-token verifier — the "Token → Project Access" rung of the auth
 * chain (v0.1设计文档 §42–§43). Implements the SDK's OAuthTokenVerifier so the
 * standard `requireBearerAuth` gate can drive it on Cloudflare/workerd.
 *
 * Resolution steps (all must pass, else invalid_token):
 *   1. hash the presented token, find a live mcp_credentials row
 *   2. not revoked, not expired
 *   3. its project still exists, is not deleted, is not archived
 * The winning row's (projectId, permissionLevel) becomes the request principal.
 */
import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { mcpCredentials, projects } from "@/lib/db/schema";
import { hashToken, tokenPrefix } from "@/lib/mcp/token";
import { withPrincipal, type McpPrincipal, type PermissionLevel } from "@/lib/mcp/principal";

function invalid(msg: string): never {
  throw new OAuthError(OAuthErrorCode.InvalidToken, msg);
}

/** Far-future epoch-seconds used when a credential has no explicit expiry. */
const NO_EXPIRY_SECONDS = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;

export const mcpTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (!token || token.length < 8) invalid("missing or malformed token");

    const hash = await hashToken(token);
    const db = getDb();

    const [cred] = await db.select().from(mcpCredentials).where(eq(mcpCredentials.tokenHash, hash));
    if (!cred) invalid("unknown token");

    if (cred.revokedAt) invalid("token revoked");
    if (cred.expiresAt && cred.expiresAt.getTime() <= Date.now()) invalid("token expired");

    const [project] = await db
      .select({ id: projects.id, status: projects.status, deletedAt: projects.deletedAt })
      .from(projects)
      .where(eq(projects.id, cred.projectId));
    if (!project || project.deletedAt) invalid("project unavailable");
    if (project.status === "ARCHIVED") invalid("project archived");

    const principal: McpPrincipal = {
      credentialId: cred.id,
      projectId: cred.projectId,
      agentId: cred.agentId ?? null,
      permissionLevel: cred.permissionLevel as PermissionLevel,
      credentialName: cred.name,
      tokenPrefix: tokenPrefix(token),
    };

    // Best-effort telemetry; never let it break authentication.
    void db
      .update(mcpCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpCredentials.id, cred.id))
      .catch(() => {});

    const expiresAt = cred.expiresAt ? Math.floor(cred.expiresAt.getTime() / 1000) : NO_EXPIRY_SECONDS;

    const auth: AuthInfo = {
      token,
      clientId: cred.id,
      scopes: [principal.permissionLevel],
      expiresAt,
    };
    return withPrincipal(auth, principal);
  },
};
