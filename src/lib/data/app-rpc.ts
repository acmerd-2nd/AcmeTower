/**
 * Web identity/auth write client (V0.3b — finish moving the web off Hyperdrive).
 *
 * Thin TS surface over the `app_*` SECURITY DEFINER functions in db/mcp_rpc.sql:
 * login profile mirror, project lifecycle, agent binding/permission/toggle/unbind,
 * and MCP credential issue/revoke. These are the web-only writes that have no
 * /mcp counterpart; routing them here means create/archive/agent/credential/login
 * never open the Hyperdrive TCP tunnel that caused intermittent HTTP 1101.
 *
 * Rows come back snake_case (to_jsonb) and are mapped here / by callers. Writes
 * run exactly once (attempts:1) — a committed RPC must not be blind-retried.
 */
import { restRpc } from "@/lib/core/rest";
import { mapProject, type Row } from "@/lib/core/rows";
import { actorJson } from "@/lib/data/write-rpc";
import type { Actor } from "@/lib/core/audit";
import type { Agent, Project, User } from "@/lib/db/schema";

type PermissionLevel = "READ" | "WORKING_WRITE" | "STRUCTURAL_WRITE" | "GOVERNANCE";
const unwrap = (v: unknown): Row => (v && typeof v === "object" ? (v as Row) : {});
const cast = <T>(r: Row): T => r as unknown as T;
const e = (v: string | null | undefined): string => v ?? "";

// ── auth profile mirror ──────────────────────────────────────────────────────
export async function rpcEnsureProfile(authUserId: string, email: string, name?: string | null): Promise<User> {
  const r = await restRpc(
    "app_ensure_profile",
    { p_auth_user_id: authUserId, p_email: email, p_name: name ?? null },
    { attempts: 1 },
  );
  return cast<User>(unwrap(r));
}

// ── project lifecycle ────────────────────────────────────────────────────────
export interface ProjectCreateInput {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  workspaceSlug?: string;
  createdBy?: string | null;
}
export async function rpcCreateProject(actor: Actor, input: ProjectCreateInput): Promise<Project> {
  const r = await restRpc(
    "app_create_project",
    {
      p: {
        name: e(input.name),
        slug: e(input.slug),
        description: e(input.description),
        icon: e(input.icon),
        workspace_slug: e(input.workspaceSlug),
        created_by: e(input.createdBy),
      },
      p_actor: actorJson(actor),
    },
    { attempts: 1 },
  );
  return mapProject(unwrap(r));
}

export async function rpcSetProjectStatus(actor: Actor, projectId: string, status: string): Promise<void> {
  await restRpc(
    "app_set_project_status",
    { p_project: projectId, p_status: status, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
}

// ── agents + bindings ────────────────────────────────────────────────────────
export interface AgentCreateInput {
  name: string;
  provider?: string | null;
  description?: string | null;
  role?: string | null;
  permissionLevel: PermissionLevel;
}
export async function rpcCreateAgentBind(actor: Actor, projectId: string, input: AgentCreateInput): Promise<Agent> {
  const r = await restRpc(
    "app_create_agent_and_bind",
    {
      p_project: projectId,
      p: {
        name: e(input.name),
        provider: e(input.provider),
        description: e(input.description),
        role: e(input.role),
        permission_level: input.permissionLevel,
      },
      p_actor: actorJson(actor),
    },
    { attempts: 1 },
  );
  return cast<Agent>(unwrap(r));
}

export async function rpcBindAgent(actor: Actor, projectId: string, agentId: string, level: PermissionLevel): Promise<void> {
  await restRpc(
    "app_bind_agent",
    { p_project: projectId, p_agent: agentId, p_level: level, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
}

export async function rpcSetAgentPermission(actor: Actor, projectId: string, agentId: string, level: PermissionLevel): Promise<void> {
  await restRpc(
    "app_set_agent_permission",
    { p_project: projectId, p_agent: agentId, p_level: level, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
}

export async function rpcSetAgentEnabled(actor: Actor, projectId: string, agentId: string, enabled: boolean): Promise<void> {
  await restRpc(
    "app_set_agent_enabled",
    { p_project: projectId, p_agent: agentId, p_enabled: enabled, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
}

export async function rpcUnbindAgent(actor: Actor, projectId: string, agentId: string): Promise<void> {
  await restRpc(
    "app_unbind_agent",
    { p_project: projectId, p_agent: agentId, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
}

// ── MCP credentials (token hashed app-side; only hash + prefix persist) ──────
export interface CredentialCreateInput {
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  permissionLevel: PermissionLevel;
  agentId?: string | null;
  expiresAt?: Date | null;
}
/** Returns the raw (snake_case, NON-secret) created row; the caller maps to CredentialRow. */
export async function rpcCreateCredential(actor: Actor, projectId: string, input: CredentialCreateInput): Promise<Row> {
  const r = await restRpc(
    "app_create_credential",
    {
      p_project: projectId,
      p: {
        name: e(input.name),
        token_hash: input.tokenHash,
        token_prefix: e(input.tokenPrefix),
        permission_level: input.permissionLevel,
        agent_id: e(input.agentId),
        expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
      },
      p_actor: actorJson(actor),
    },
    { attempts: 1 },
  );
  return unwrap(r);
}

export async function rpcRevokeCredential(actor: Actor, id: string, projectId: string): Promise<void> {
  await restRpc(
    "app_revoke_credential",
    { p_id: id, p_project: projectId, p_actor: actorJson(actor) },
    { attempts: 1 },
  );
}
