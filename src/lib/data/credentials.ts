/**
 * MCP connection credentials (v0.1设计文档 §43–§44) — the human "Agent Connection"
 * surface. A credential is scoped to one project + one permission level; its bearer
 * token is generated here, hashed, and returned ONCE. Only the SHA-256 digest and a
 * display prefix are ever stored — the plaintext is never persisted or re-listed.
 * Creation/revocation are audited through the same logActivity as everything else.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { mcpCredentials } from "@/lib/db/schema";
import { logActivity, type Actor } from "@/lib/core/audit";
import { NotFoundError } from "@/lib/data/writes";
import { generateToken, hashToken, tokenPrefix } from "@/lib/mcp/token";
import { httpCredentialRows, httpProjectAgentOptions } from "@/lib/mcp/httpdata";

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

/** Mint a credential; returns the stored row AND the plaintext token (shown once). */
export async function createCredential(
  actor: Actor,
  input: CredentialCreate,
): Promise<{ row: CredentialRow; token: string }> {
  const token = generateToken();
  const hash = await hashToken(token);
  const prefix = tokenPrefix(token);
  const db = getDb();
  const row = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(mcpCredentials)
      .values({
        projectId: input.projectId,
        name: input.name,
        tokenHash: hash,
        tokenPrefix: prefix,
        permissionLevel: input.permissionLevel,
        agentId: input.agentId ?? null,
        expiresAt: input.expiresAt ?? null,
      })
      .returning({
        id: mcpCredentials.id,
        name: mcpCredentials.name,
        tokenPrefix: mcpCredentials.tokenPrefix,
        permissionLevel: mcpCredentials.permissionLevel,
        agentId: mcpCredentials.agentId,
        createdAt: mcpCredentials.createdAt,
        lastUsedAt: mcpCredentials.lastUsedAt,
        expiresAt: mcpCredentials.expiresAt,
        revokedAt: mcpCredentials.revokedAt,
      });
    // Audit the CREATION only — never the token, hash, or full value.
    await logActivity(tx, {
      projectId: input.projectId,
      actor,
      action: "MCP_CREDENTIAL_CREATED",
      entityType: "mcp_credential",
      entityId: r.id,
      summary: `创建 MCP 连接「${r.name}」(${r.permissionLevel})`,
      after: { permissionLevel: r.permissionLevel, prefix: r.tokenPrefix },
    });
    return { ...r, agentName: null as string | null };
  });
  return { row, token };
}

/** Revoke a credential (must belong to this project). Idempotent. */
export async function revokeCredential(actor: Actor, id: string, projectId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(mcpCredentials)
      .where(and(eq(mcpCredentials.id, id), eq(mcpCredentials.projectId, projectId)));
    if (!cur) throw new NotFoundError("MCP 连接");
    if (!cur.revokedAt) {
      await tx.update(mcpCredentials).set({ revokedAt: new Date() }).where(eq(mcpCredentials.id, id));
      await logActivity(tx, {
        projectId,
        actor,
        action: "MCP_CREDENTIAL_REVOKED",
        entityType: "mcp_credential",
        entityId: id,
        summary: `撤销 MCP 连接「${cur.name}」`,
      });
    }
  });
}
