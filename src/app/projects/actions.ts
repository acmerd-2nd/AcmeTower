"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { createProject, setProjectStatus } from "@/lib/data/projects";

function slugify(s: string) {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

async function requireActor() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function createProjectAction(formData: FormData) {
  const profile = await requireActor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/projects/new?error=name");
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "").trim() || "personal";

  const project = await createProject({
    name,
    slug: slugify(rawSlug || name),
    description,
    icon,
    workspaceSlug,
    createdBy: profile.id,
  });
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function archiveProjectAction(formData: FormData) {
  await requireActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setProjectStatus(id, "ARCHIVED");
  revalidatePath("/projects");
}

export async function restoreProjectAction(formData: FormData) {
  await requireActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setProjectStatus(id, "ACTIVE");
  revalidatePath("/projects");
}
