import Link from "next/link";
import { ProjectCard } from "@/components/project-card";
import { listProjectCards } from "@/lib/data/projects";

export const metadata = { title: "回收站 · AcmeTower" };
export const dynamic = "force-dynamic";

/**
 * 回收站 = 两阶段删除的第二站：这里只有已归档项目，
 * 提供「恢复」与「彻底删除」（后者需输入项目名确认 + RPC 端 ARCHIVED 护栏）。
 */
export default async function TrashPage() {
  const cards = await listProjectCards({ status: "ARCHIVED" });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">回收站</h1>
          <p className="mt-1 text-sm text-zinc-500">
            已归档的 {cards.length} 个项目 · 归档只是收起（软删除），随时可恢复；「彻底删除」才不可恢复。
          </p>
        </div>
        <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← 返回我的项目
        </Link>
      </header>

      {cards.length === 0 ? (
        <div className="mt-16 rounded-xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          <div className="text-2xl">🗑️</div>
          <p className="mt-2 text-sm">回收站是空的。归档的项目会出现在这里。</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <ProjectCard key={c.id} card={c} />
          ))}
        </div>
      )}
    </main>
  );
}
