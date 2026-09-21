import Link from "next/link";
import { ProjectCard } from "@/components/project-card";
import { listProjectCards, type ProjectStatusFilter } from "@/lib/data/projects";

export const metadata = { title: "我的项目 · AcmeTower" };
// Read fresh per request (search + status come from the URL).
export const dynamic = "force-dynamic";

const FILTERS: { key: ProjectStatusFilter; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "ACTIVE", label: "进行中" },
  { key: "PAUSED", label: "暂停" },
  { key: "COMPLETED", label: "已完成" },
  { key: "RISK", label: "风险" },
  { key: "ARCHIVED", label: "归档" },
];

function hrefFor(status: ProjectStatusFilter, q?: string) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (status && status !== "ALL") p.set("status", status);
  const qs = p.toString();
  return `/projects${qs ? `?${qs}` : ""}`;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: ProjectStatusFilter }>;
}) {
  const { q, status } = await searchParams;
  const cards = await listProjectCards({ q, status: status ?? "ALL" });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">我的项目</h1>
          <p className="mt-1 text-sm text-zinc-500">Project Home · 共 {cards.length} 个</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/projects/trash"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            回收站
          </Link>
          <Link
            href="/help"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            使用指南
          </Link>
          <Link
            href="/projects/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
          >
            + 新建项目
          </Link>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <form action="/projects" method="get" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="搜索项目…"
            className="w-56 rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
          />
          {status && status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            搜索
          </button>
        </form>

        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {FILTERS.map((f) => {
            const active = (status ?? "ALL") === f.key;
            return (
              <Link
                key={f.key}
                href={hrefFor(f.key, q)}
                className={`rounded-full px-3 py-1 ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {cards.length === 0 ? (
        (() => {
          const filtering = !!q?.trim() || (!!status && status !== "ALL");
          return filtering ? (
            <div className="mt-16 flex flex-col items-center rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
              <div className="text-3xl" aria-hidden>🔍</div>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">没有匹配的项目。</p>
              <Link href="/projects" className="mt-4 text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100">
                清除筛选条件
              </Link>
            </div>
          ) : (
            <div className="mt-12 flex flex-col items-center rounded-2xl border border-zinc-200 bg-zinc-50/60 px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="text-4xl" aria-hidden>🗼</div>
              <h2 className="mt-4 text-lg font-semibold tracking-tight">从第一个项目开始</h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-500">
                为项目写下唯一的 North Star，拆出主线与任务，再让你电脑上的 AI Agent 通过 MCP 连接进来，与你一起持续推进、随时回收进展。
              </p>
              <Link
                href="/projects/new"
                className="mt-6 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
              >
                + 新建项目
              </Link>
              <Link href="/help" className="mt-3 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                看看使用指南 →
              </Link>
            </div>
          );
        })()
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
