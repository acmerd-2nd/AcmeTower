/**
 * MCP authorization model (v0.1设计文档 §29 permissions, §42 auth chain).
 *
 * The fixed chain is:
 *   Token / OAuth Identity  →  Project Access  →  Permission  →  Tool
 *
 * A bearer token resolves (in the verifier) to exactly ONE project + one
 * permission level carried on `AuthInfo.extra.principal`. Every tool declares the
 * minimum permission it needs; the gateway only registers (and re-checks) the
 * tools the principal's level allows. GOVERNANCE is reserved for humans (§29):
 * it is never a grantable MCP level in V0.1, and no MCP tool requires it.
 */
import type { AuthInfo, ServerContext } from "@modelcontextprotocol/server";

export type PermissionLevel = "READ" | "WORKING_WRITE" | "STRUCTURAL_WRITE" | "GOVERNANCE";

/** Ordinal rank — a higher level implies all lower levels' tools. */
export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  READ: 0,
  WORKING_WRITE: 1,
  STRUCTURAL_WRITE: 2,
  GOVERNANCE: 3,
};

/** True when `granted` satisfies `required`. */
export function hasPermission(granted: PermissionLevel, required: PermissionLevel): boolean {
  return PERMISSION_RANK[granted] >= PERMISSION_RANK[required];
}

/**
 * The resolved, authenticated caller for one MCP request. Built by the token
 * verifier after a successful `mcp_credentials` lookup; immutable for the request.
 */
export interface McpPrincipal {
  credentialId: string;
  projectId: string;
  agentId: string | null;
  permissionLevel: PermissionLevel;
  /** Credential display name (e.g. "Codex connection"). */
  credentialName: string;
  /** Safe display prefix of the token (never the secret). */
  tokenPrefix: string;
}

// The principal rides on AuthInfo.extra under this key.
const PRINCIPAL_KEY = "acmetower";

/** Attach a principal to a freshly verified AuthInfo. */
export function withPrincipal(auth: AuthInfo, principal: McpPrincipal): AuthInfo {
  return { ...auth, extra: { ...auth.extra, [PRINCIPAL_KEY]: principal } };
}

/** Pull the principal out of an AuthInfo (verifier path). */
export function principalFromAuth(auth: AuthInfo | undefined): McpPrincipal | null {
  const p = (auth?.extra as Record<string, unknown> | undefined)?.[PRINCIPAL_KEY];
  return p ? (p as McpPrincipal) : null;
}

/**
 * Pull the principal out of a tool handler's ServerContext. The SDK surfaces the
 * AuthInfo we passed to `handler.fetch` at `ctx.http.authInfo`.
 */
export function principalFromCtx(ctx: ServerContext): McpPrincipal | null {
  return principalFromAuth(ctx.http?.authInfo);
}

/** An MCP agent actor for the audit layer (source = MCP, actorType = AGENT). */
export function mcpActor(principal: McpPrincipal): {
  actorType: "AGENT";
  actorId: string | null;
  actorLabel: string;
  source: "MCP";
} {
  return {
    actorType: "AGENT",
    actorId: principal.agentId,
    actorLabel: principal.credentialName,
    source: "MCP",
  };
}
