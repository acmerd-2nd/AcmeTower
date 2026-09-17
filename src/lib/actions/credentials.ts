"use server";

/**
 * Server Actions for the Agent Connection page (§43–§44).
 *
 * On create, the plaintext token is placed in a SHORT-LIVED, httpOnly cookie
 * scoped to this project's page (NOT the URL, NOT the DB) so the UI can reveal it
 * exactly once; a "hide" action clears it. Every credential row that ever reaches
 * the client carries only the display prefix.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWebActor } from "@/lib/core/actor";
import { createCredential, revokeCredential } from "@/lib/data/credentials";

const TOKEN_COOKIE = "acme_mcp_token";
const ALLOWED = new Set(["READ", "WORKING_WRITE", "STRUCTURAL_WRITE"]); // GOVERNANCE is human-only (§29)

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return v == null ? "" : String(v).trim();
};
const errPath = (pid: string, msg: string) => `/projects/${pid}/agents?error=${encodeURIComponent(msg)}`;

export async function createCredentialAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    const permission = s(fd, "permission") || "READ";
    if (!ALLOWED.has(permission)) throw new Error("非法权限级别");
    const days = Number(s(fd, "expiresDays") || "0");
    const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

    const { row, token } = await createCredential(actor, {
      projectId,
      name: s(fd, "name") || "未命名连接",
      permissionLevel: permission as "READ" | "WORKING_WRITE" | "STRUCTURAL_WRITE",
      agentId: s(fd, "agentId") || null,
      expiresAt,
    });

    const jar = await cookies();
    jar.set(TOKEN_COOKIE, JSON.stringify({ id: row.id, name: row.name, token }), {
      httpOnly: true,
      sameSite: "lax",
      path: `/projects/${projectId}`,
      maxAge: 300, // reveal window only; never persisted server-side
    });
    revalidatePath(`/projects/${projectId}/agents`);
    redirect(`/projects/${projectId}/agents?created=${row.id}`);
  } catch (e) {
    redirect(errPath(projectId, (e as Error).message ?? "操作失败"));
  }
}

export async function revokeCredentialAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    await revokeCredential(actor, s(fd, "id"), projectId);
    revalidatePath(`/projects/${projectId}/agents`);
    redirect(`/projects/${projectId}/agents`);
  } catch (e) {
    redirect(errPath(projectId, (e as Error).message ?? "操作失败"));
  }
}

/** Clear the one-time token cookie once the user has copied it. */
export async function dismissTokenAction(fd: FormData) {
  const projectId = s(fd, "projectId");
  const jar = await cookies();
  jar.delete({ name: TOKEN_COOKIE, path: `/projects/${projectId}` });
  revalidatePath(`/projects/${projectId}/agents`);
  redirect(`/projects/${projectId}/agents`);
}
