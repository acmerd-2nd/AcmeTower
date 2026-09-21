import Link from "next/link";
import {
  entityTypeHref,
  getTimeline,
  type SourceFilter,
  type TimelineEvent,
} from "@/lib/data/timeline";
import { sourceLabel } from "@/lib/core/labels";
import { timeAgo } from "@/lib/core/format";

export const dynamic = "force-dynamic";

const SOURCES: SourceFilter[] = ["ALL", "WEB", "MCP", "HUMAN", "SYSTEM"];
const sourceStyle: Record<string, string> = {
  WEB: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  MCP: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  HUMAN: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  SYSTEM: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ source?: SourceFilter; q?: string }>;
}) {
  const { projectId } = await params;
  const { source, q } = await searchParams;
  const events = await getTimeline(projectId, { source: source ?? "ALL", q });
  const base = `/projects/${projectId}/timeline`;

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Timeline · 项目日志</h2>
      <p className="mt-1 text-sm text-zinc-500">
        谁、什么时候、做了什么。来源：网页 = 你在网站的操作；Agent = 本地 Agent 通过 MCP 的写入。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <form action={base} method="get" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="搜索事件…"
            className="w-52 rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
          />
          {source && source !== "ALL" && <input type="hidden" name="source" value={source} />}
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            搜索
          </button>
        </form>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {SOURCES.map((sf) => {
            const active = (source ?? "ALL") === sf;
            const p = new URLSearchParams();
            if (q) p.set("q", q);
            if (sf !== "ALL") p.set("source", sf);
            const qs = p.toString();
            return (
              <Link
                key={sf}
                href={`${base}${qs ? `?${qs}` : ""}`}
                title={sf}
                className={`rounded-full px-3 py-1 ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {sourceLabel(sf)}
              </Link>
            );
          })}
        </nav>
      </div>

      <ol className="mt-6 space-y-3">
        {events.map((e) => (
          <TimelineRow key={e.id} projectId={projectId} e={e} />
        ))}
        {events.length === 0 &&
          (q || (source && source !== "ALL") ? (
            <li className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
              没有匹配的事件。
              <Link href={base} className="ml-1 text-zinc-700 underline hover:no-underline dark:text-zinc-300">
                清除筛选
              </Link>
            </li>
          ) : (
            <li className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
              <div className="text-2xl">🕰️</div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                还没有事件。你在网站上的每次操作、Agent 的每次 MCP 写入，都会实时记录在这里。
              </p>
            </li>
          ))}
      </ol>
    </div>
  );
}

function TimelineRow({ projectId, e }: { projectId: string; e: TimelineEvent }) {
  const href = entityTypeHref(projectId, e.entityType);
  const hasDiff = (e.before && Object.keys(e.before as object).length) || (e.after && Object.keys(e.after as object).length);
  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${sourceStyle[e.source] ?? ""}`} title={e.source}>
          {sourceLabel(e.source)}
        </span>
        <span className="font-medium text-zinc-700 dark:text-zinc-200">{e.actorLabel ?? e.actorType}</span>
        <span className="text-zinc-400">{timeAgo(e.createdAt)}</span>
        <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">
          {e.action}
        </span>
      </div>
      <div className="mt-1.5 text-sm text-zinc-800 dark:text-zinc-100">
        {href ? (
          <Link href={href} className="hover:underline">
            {e.summary ?? e.action}
          </Link>
        ) : (
          (e.summary ?? e.action)
        )}
      </div>
      {hasDiff ? (
        <details className="mt-1.5 text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">查看变更</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 dark:bg-zinc-950">
{JSON.stringify({ before: e.before ?? null, after: e.after ?? null }, null, 2)}
          </pre>
        </details>
      ) : null}
    </li>
  );
}
