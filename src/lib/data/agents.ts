/**
 * Agent entities + their project bindings (v0.1设计文档 §26–§29) — the human side of
 * Test 7 ("创建 Agent · 绑定 Project · 给权限"). Agents are platform entities; a
 * Project<->Agent binding carries the role + permission an agent holds in that one
 * project. All writes share the audit stream; permission level mirrors §29 and never
 * grants GOVERNANCE to an agent (that stays human-only).
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agents, projectAgents, type Agent } from "@/lib/db/schema";
import { logActivity, type Actor } from "@/lib/core/audit";
import { NotFoundError } from "@/lib/data/writes";
import {
  httpBoundAgentNames,
  httpProjectAgentRows,
  httpUnboundAgentRows,
} from "@/lib/mcp/httpdata";

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

/** Create a new Agent AND bind it to the project with a permission in one tx. */
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
  const db = getDb();
  return db.transaction(async (tx) => {
    const [agent] = await tx
      .insert(agents)
      .values({
        name: input.name,
        provider: input.provider ?? null,
        description: input.description ?? null,
        role: input.role ?? null,
      })
      .returning();
    await tx.insert(projectAgents).values({
      projectId: input.projectId,
      agentId: agent.id,
      role: input.role ?? null,
      permissionLevel: input.permissionLevel,
    });
    await logActivity(tx, {
      projectId: input.projectId,
      actor,
      action: "AGENT_BOUND",
      entityType: "agent",
      entityId: agent.id,
      summary: `创建并绑定 Agent「${agent.name}」(${input.permissionLevel})`,
      after: { name: agent.name, permissionLevel: input.permissionLevel },
    });
    return { agent };
  });
}

/** Attach an existing global agent to the project. No-op if already bound. */
export async function bindExistingAgent(
  actor: Actor,
  projectId: string,
  agentId: string,
  permissionLevel: PermissionLevel,
): Promise<void> {
  const db = getDb();
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) throw new NotFoundError("Agent");
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ agentId: projectAgents.agentId })
      .from(projectAgents)
      .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId)));
    if (!existing) {
      await tx.insert(projectAgents).values({ projectId, agentId, permissionLevel });
    } else {
      await tx
        .update(projectAgents)
        .set({ permissionLevel, enabled: true })
        .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId)));
    }
    await logActivity(tx, {
      projectId,
      actor,
      action: "AGENT_BOUND",
      entityType: "agent",
      entityId: agentId,
      summary: `绑定 Agent「${agent.name}」(${permissionLevel})`,
      after: { name: agent.name, permissionLevel },
    });
  });
}

/** Change an agent's permission within this project (§29). */
export async function setAgentPermission(
  actor: Actor,
  projectId: string,
  agentId: string,
  permissionLevel: PermissionLevel,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(projectAgents)
      .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId)));
    if (!cur) throw new NotFoundError("绑定");
    await tx
      .update(projectAgents)
      .set({ permissionLevel })
      .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId)));
    await logActivity(tx, {
      projectId,
      actor,
      action: "AGENT_PERMISSION",
      entityType: "agent",
      entityId: agentId,
      summary: `调整 Agent 权限 ${cur.permissionLevel} → ${permissionLevel}`,
      before: { permissionLevel: cur.permissionLevel },
      after: { permissionLevel },
    });
  });
}

/** Toggle whether the binding is active (soft — keeps history, blocks use). */
export async function setAgentEnabled(
  actor: Actor,
  projectId: string,
  agentId: string,
  enabled: boolean,
): Promise<void> {
  const db = getDb();
  await db
    .update(projectAgents)
    .set({ enabled })
    .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId)));
  await logActivity(db, {
    projectId,
    actor,
    action: enabled ? "AGENT_ENABLED" : "AGENT_DISABLED",
    entityType: "agent",
    entityId: agentId,
    summary: `${enabled ? "启用" : "停用"} Agent 绑定`,
  });
}

/** Remove the project<->agent binding (does not delete the global Agent). */
export async function unbindAgent(actor: Actor, projectId: string, agentId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select({ name: agents.name })
      .from(projectAgents)
      .innerJoin(agents, eq(agents.id, projectAgents.agentId))
      .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId)));
    await tx
      .delete(projectAgents)
      .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId)));
    await logActivity(tx, {
      projectId,
      actor,
      action: "AGENT_UNBOUND",
      entityType: "agent",
      entityId: agentId,
      summary: `解绑 Agent${cur?.name ? `「${cur.name}」` : ""}`,
    });
  });
}

/** Names of agents bound to a project (for labels). */
export async function boundAgentNames(projectId: string): Promise<Map<string, string>> {
  return httpBoundAgentNames(projectId);
}
