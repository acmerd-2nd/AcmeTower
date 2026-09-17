"use server";

/**
 * Server Actions for Agent entities + project bindings (Test 7). Every intent runs
 * through requireWebActor → the shared write layer → audit, and revalidates the
 * Agents page. GOVERNANCE is never offered to an agent (§29).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWebActor } from "@/lib/core/actor";
import {
  bindExistingAgent,
  createAndBindAgent,
  setAgentEnabled,
  setAgentPermission,
  unbindAgent,
} from "@/lib/data/agents";

const AGENT_PERMS = new Set(["READ", "WORKING_WRITE", "STRUCTURAL_WRITE"]);
const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return v == null ? "" : String(v).trim();
};
const errPath = (pid: string, msg: string) => `/projects/${pid}/agents?error=${encodeURIComponent(msg)}`;
const done = (pid: string) => {
  revalidatePath(`/projects/${pid}`);
  revalidatePath(`/projects/${pid}/agents`);
};
const perm = (v: string) => (AGENT_PERMS.has(v) ? v : "READ") as "READ" | "WORKING_WRITE" | "STRUCTURAL_WRITE";

export async function createAgentAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    await createAndBindAgent(actor, {
      projectId,
      name: s(fd, "name") || "未命名 Agent",
      provider: s(fd, "provider") || null,
      description: s(fd, "description") || null,
      role: s(fd, "role") || null,
      permissionLevel: perm(s(fd, "permission")),
    });
    done(projectId);
  } catch (e) {
    redirect(errPath(projectId, (e as Error).message ?? "操作失败"));
  }
}

export async function attachAgentAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    await bindExistingAgent(actor, projectId, s(fd, "agentId"), perm(s(fd, "permission")));
    done(projectId);
  } catch (e) {
    redirect(errPath(projectId, (e as Error).message ?? "操作失败"));
  }
}

export async function agentPermissionAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    await setAgentPermission(actor, projectId, s(fd, "agentId"), perm(s(fd, "permission")));
    done(projectId);
  } catch (e) {
    redirect(errPath(projectId, (e as Error).message ?? "操作失败"));
  }
}

export async function agentToggleAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    await setAgentEnabled(actor, projectId, s(fd, "agentId"), s(fd, "enabled") !== "true");
    done(projectId);
  } catch (e) {
    redirect(errPath(projectId, (e as Error).message ?? "操作失败"));
  }
}

export async function unbindAgentAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    await unbindAgent(actor, projectId, s(fd, "agentId"));
    done(projectId);
  } catch (e) {
    redirect(errPath(projectId, (e as Error).message ?? "操作失败"));
  }
}
