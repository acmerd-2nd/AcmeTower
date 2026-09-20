/**
 * MCP connection credentials (v0.1设计文档 §43–§44) — the human "Agent Connection"
 * surface. A credential is scoped to one project + one permission level; its bearer
 * token is generated here, hashed, and returned ONCE. Only the SHA-256 digest and a
 * display prefix are ever stored — the plaintext is never persisted or re-listed.
 * Creation/revocation are audited through the same activity_events stream, but via
 * the HTTPS SECURITY DEFINER `app_create_credential` / `app_revoke_credential` RPCs
 * (V0.3b) so this web-only path never touches Hyperdrive.
 */
import type { Actor } from "@/lib/core/audit";
import type { Row } from "@/lib/core/rows";
import { generateToken, hashToken, tokenPrefix } from "@/lib/mcp/token";
import { httpCredentialRows, httpProjectAgentOptions } from "@/lib/mcp/httpdata";
import { rpcCreateCredential, rpcRevokeCredential } from "@/lib/data/app-rpc";

export type CredentialStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface CredentialRow {
  id: string;
  name: string;
  tokenPrefix: string;
  permissionLevel: "READ" | "WORKING_WRITE" | "STRUCTURAL_WRITE" | "GOVERNANCE";
  agentId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  agentName: string | null;
}

export function credentialStatus(c: { revokedAt: Date | null; expiresAt: Date | null }): CredentialStatus {
  if (c.revokedAt) return "REVOKED";
  if (c.expiresAt && c.expiresAt.getTime() <= Date.now()) return "EXPIRED";
  return "ACTIVE";
}

/** All credentials for a project (newest first), WITHOUT the token hash. */
export async function listCredentials(projectId: string): Promise<CredentialRow[]> {
  return httpCredentialRows(projectId);
}

/** Editable agents already attached to this project (for optional binding). */
export async function projectAgentOptions(projectId: string) {
  return httpProjectAgentOptions(projectId);
}

export interface CredentialCreate {
  projectId: string;
  name: string;
  permissionLevel: "READ" | "WORKING_WRITE" | "STRUCTURAL_WRITE";
  agentId?: string | null;
  expiresAt?: Date | null;
}

/** Map the RPC's safe (non-secret) snake row into CredentialRow. */
function toCredential(r: Row): CredentialRow {
  const d = (v: unknown): Date | null => (v == null ? null : new Date(String(v)));
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    tokenPrefix: String(r.token_prefix ?? ""),
    permissionLevel: (r.permission_level ?? "READ") as CredentialRow["permissionLevel"],
    agentId: r.agent_id == null ? null : String(r.agent_id),
    createdAt: d(r.created_at) ?? new Date(),
    lastUsedAt: d(r.last_used_at),
    expiresAt: d(r.expires_at),
    revokedAt: d(r.revoked_at),
    agentName: null,
  };
}

/** Mint a credential; returns the stored row AND the plaintext token (shown once). */
export async function createCredential(
  actor: Actor,
  input: CredentialCreate,
): Promise<{ row: CredentialRow; token: string }> {
  const token = generateToken();
  const hash = await hashToken(token);
  const prefix = tokenPrefix(token);
  const row = await rpcCreateCredential(actor, input.projectId, {
    name: input.name,
    tokenHash: hash,
    tokenPrefix: prefix,
    permissionLevel: input.permissionLevel,
    agentId: input.agentId ?? null,
    expiresAt: input.expiresAt ?? null,
  });
  return { row: toCredential(row), token };
}

/** Revoke a credential (must belong to this project). Idempotent. */
export async function revokeCredential(actor: Actor, id: string, projectId: string): Promise<void> {
  await rpcRevokeCredential(actor, id, projectId);
}
