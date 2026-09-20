/**
 * Agent entities + their project bindings (v0.1设计文档 §26–§29) — the human side of
 * Test 7 ("创建 Agent · 绑定 Project · 给权限"). Agents are platform entities; a
 * Project<->Agent binding carries the role + permission an agent holds in that one
 * project. All writes share the audit stream; permission level mirrors §29 and never
 * grants GOVERNANCE to an agent (that stays human-only).
 */
import type { Actor } from "@/lib/core/audit";
import type { Agent } from "@/lib/db/schema";
import {
  httpBoundAgentNames,
  httpProjectAgentRows,
  httpUnboundAgentRows,
} from "@/lib/mcp/httpdata";
import {
  rpcBindAgent,
  rpcCreateAgentBind,
  rpcSetAgentEnabled,
  rpcSetAgentPermission,
  rpcUnbindAgent,
} from "@/lib/data/app-rpc";

type PermissionLevel = "READ" | "WORKING_WRITE" | "STRUCTURAL_WRITE" | "GOVERNANCE";

export interface ProjectAgentRow {
  agentId: string;
  name: string;
  provider: string | null;
  description: string | null;
  role: string | null; // agents.role (default descriptor)
  bindingRole: string | null; // project_agents.role (this project's role)
  permissionLevel: PermissionLevel;
  enabled: boolean;
}

/** Agents bound to this project, with their per-project binding. */
export async function listProjectAgents(projectId: string): Promise<ProjectAgentRow[]> {
  return httpProjectAgentRows(projectId);
}

/** Global agents NOT yet bound to this project (for the "attach" picker). */
export async function unboundAgents(projectId: string) {
  return httpUnboundAgentRows(projectId);
}

/** Create a new Agent AND bind it to the project with a permission — one HTTPS RPC (V0.3b). */
export async function createAndBindAgent(
  actor: Actor,
  input: {
    projectId: string;
    name: string;
    provider?: string | null;
    description?: string | null;
    role?: string | null;
    permissionLevel: PermissionLevel;
  },
): Promise<{ agent: Agent }> {
  const agent = await rpcCreateAgentBind(actor, input.projectId, {
    name: input.name,
    provider: input.provider ?? null,
    description: input.description ?? null,
    role: input.role ?? null,
    permissionLevel: input.permissionLevel,
  });
  return { agent };
}

/** Attach an existing global agent to the project (upsert binding). */
export async function bindExistingAgent(
  actor: Actor,
  projectId: string,
  agentId: string,
  permissionLevel: PermissionLevel,
): Promise<void> {
  await rpcBindAgent(actor, projectId, agentId, permissionLevel);
}

/** Change an agent's permission within this project (§29). */
export async function setAgentPermission(
  actor: Actor,
  projectId: string,
  agentId: string,
  permissionLevel: PermissionLevel,
): Promise<void> {
  await rpcSetAgentPermission(actor, projectId, agentId, permissionLevel);
}

/** Toggle whether the binding is active (soft — keeps history, blocks use). */
export async function setAgentEnabled(
  actor: Actor,
  projectId: string,
  agentId: string,
  enabled: boolean,
): Promise<void> {
  await rpcSetAgentEnabled(actor, projectId, agentId, enabled);
}

/** Remove the project<->agent binding (does not delete the global Agent). */
export async function unbindAgent(actor: Actor, projectId: string, agentId: string): Promise<void> {
  await rpcUnbindAgent(actor, projectId, agentId);
}

/** Names of agents bound to a project (for labels). */
export async function boundAgentNames(projectId: string): Promise<Map<string, string>> {
  return httpBoundAgentNames(projectId);
}
