import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ProjectSpaceStub({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  if (!project) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← 我的项目
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {project.icon ?? "📁"} {project.name}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">{project.description ?? "（暂无简介）"}</p>
      <p className="mt-6 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
        Project Space 占位（ID {project.id}）。Dashboard / North Star / Roadmap / Tasks / Branches /
        Decisions / Checkpoints 将在 Step 5–7 落地。
      </p>
    </main>
  );
}
