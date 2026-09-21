"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWebActor } from "@/lib/core/actor";
import { createProject, setProjectStatus, renameProject, purgeProject } from "@/lib/data/projects";

function slugify(s: string) {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

export async function createProjectAction(formData: FormData) {
  const actor = await requireWebActor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/projects/new?error=name");
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "").trim() || "personal";

  let projectId: string;
  try {
    const project = await createProject(actor, {
      name,
      slug: slugify(rawSlug || name),
      description,
      icon,
      workspaceSlug,
      createdBy: actor.actorId,
    });
    projectId = project.id;
  } catch (e) {
    redirect(`/projects/new?error=${encodeURIComponent((e as Error).message ?? "创建失败")}`);
  }
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function archiveProjectAction(formData: FormData) {
  const actor = await requireWebActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setProjectStatus(actor, id, "ARCHIVED");
  revalidatePath("/projects");
}

export async function restoreProjectAction(formData: FormData) {
  const actor = await requireWebActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setProjectStatus(actor, id, "ACTIVE");
  revalidatePath("/projects");
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function renameProjectAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireWebActor();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { ok: false, error: "名称不能为空" };
  try {
    await renameProject(actor, id, name);
  } catch (e) {
    return { ok: false, error: (e as Error).message || "重命名失败" };
  }
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}

/**
 * 彻底删除（回收站专属）。两阶段护栏在 RPC 内：非 ARCHIVED 一律拒绝。
 * 仅人类 Web 会话可触发；不注册为 /mcp 工具，Agent 永远碰不到。
 */
export async function purgeProjectAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireWebActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "缺少项目 id" };
  try {
    await purgeProject(actor, id);
  } catch (e) {
    return { ok: false, error: (e as Error).message || "删除失败" };
  }
  revalidatePath("/projects");
  revalidatePath("/projects/trash");
  return { ok: true };
}
