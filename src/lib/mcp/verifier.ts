/**
 * MCP bearer-token authentication — the "Token → Project Access" rung of the
 * auth chain (v0.1设计文档 §42–§43).
 *
 * Runs entirely over the Supabase PostgREST HTTPS path (see lib/mcp/rest.ts):
 * the worker's Hyperdrive→Postgres TCP tunnel stalls intermittently, and the
 * very first thing every /mcp request does is look up the token. Putting this
 * read on Cloudflare's HTTP/2 path makes the auth gate itself stable, and it
 * keeps /mcp free of any @modelcontextprotocol/server runtime import.
 * The web app is unaffected and still uses Drizzle.
 *
 * Resolution steps (all must pass, else null → route answers 401):
 *   1. hash the presented token, find a live mcp_credentials row
 *   2. not revoked, not expired
 *   3. its project still exists, is not deleted, is not archived
 * The winning row's (projectId, permissionLevel) becomes the request principal.
 */
import { restSelect } from "@/lib/mcp/rest";
import { hashToken, tokenPrefix } from "@/lib/mcp/token";
import type { McpPrincipal, PermissionLevel } from "@/lib/mcp/principal";

interface CredRow {
  id: string;
  project_id: string;
  agent_id: string | null;
  name: string;
  permission_level: string;
  revoked_at: string | null;
  expires_at: string | null;
}

interface ProjectRow {
  id: string;
  status: string;
  deleted_at: string | null;
}

export async function resolveMcpPrincipal(token: string | null): Promise<McpPrincipal | null> {
  if (!token || token.length < 8) return null;

  const hash = await hashToken(token);

  const [cred] = await restSelect<CredRow>(
    "mcp_credentials",
    `token_hash=eq.${encodeURIComponent(hash)}&limit=1`,
    { columns: "id,project_id,agent_id,name,permission_level,revoked_at,expires_at" },
  );
  if (!cred) return null;

  if (cred.revoked_at) return null;
  if (cred.expires_at && new Date(cred.expires_at).getTime() <= Date.now()) return null;

  const [project] = await restSelect<ProjectRow>(
    "projects",
    `id=eq.${encodeURIComponent(String(cred.project_id))}&limit=1`,
    { columns: "id,status,deleted_at" },
  );
  if (!project || project.deleted_at) return null;
  if (project.status === "ARCHIVED") return null;

  return {
    credentialId: cred.id,
    projectId: cred.project_id,
    agentId: cred.agent_id ?? null,
    permissionLevel: cred.permission_level as PermissionLevel,
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
