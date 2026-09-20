import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { ProjectNav } from "@/components/project-nav";

export const dynamic = "force-dynamic";

export default async function ProjectSpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id, name: projects.name, icon: projects.icon, status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  if (!project) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <nav className="flex items-center justify-between text-sm text-zinc-500">
        <div>
          <Link href="/projects" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            我的项目
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-800 dark:text-zinc-200">{project.name}</span>
        </div>
        <Link href="/help" className="hover:text-zinc-900 dark:hover:text-zinc-100">
          使用指南
        </Link>
      </nav>

      <header className="mt-2 flex items-center gap-2">
        <span className="text-2xl leading-none">{project.icon ?? "📁"}</span>
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
      </header>

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <aside className="md:w-52 md:shrink-0">
          <ProjectNav projectId={projectId} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
