import Link from "next/link";
import { archiveProjectAction, restoreProjectAction } from "@/app/projects/actions";
import type { ProjectCard as Card } from "@/lib/data/projects";
import { statusLabel } from "@/lib/core/labels";
import { timeAgo } from "@/lib/core/format";

const healthStyle: Record<Card["health"], string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-500",
  RED: "bg-red-500",
};
const healthLabel: Record<Card["health"], string> = {
  GREEN: "正常",
  YELLOW: "有风险",
  RED: "危险",
};

export function ProjectCard({ card }: { card: Card }) {
  return (
    <div className="group relative flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <Link href={`/projects/${card.id}`} className="absolute inset-0" aria-label={`打开 ${card.name}`} />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{card.icon ?? "📁"}</span>
          <h3 className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{card.name}</h3>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300`}
          title={`健康度：${healthLabel[card.health]}`}
        >
          <span className={`h-2 w-2 rounded-full ${healthStyle[card.health]}`} />
          {statusLabel(card.status)}
        </span>
      </div>

      {card.description && (
        <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{card.description}</p>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-zinc-600 dark:text-zinc-300">
          {card.phaseTotal > 0 ? `Phase ${card.phaseIndex ?? "?"} / ${card.phaseTotal}` : "无 Phase"}
        </span>
        <span className="tabular-nums text-zinc-500">{card.progress}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
          style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-500">
        <div className="truncate">
          <dt className="sr-only">当前任务</dt>
          <dd className="truncate">
            当前：<span className="text-zinc-700 dark:text-zinc-300">{card.currentTaskName ?? "—"}</span>
          </dd>
        </div>
        <div className="truncate text-right">
          <dt className="sr-only">Agent</dt>
          <dd className="truncate">
            Agent：<span className="text-zinc-700 dark:text-zinc-300">{card.currentAgentName ?? "—"}</span>
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800">
        <span className="flex items-center gap-3">
          <span title="未关闭分支">分支 {card.openBranches}</span>
          <span title="未关闭 Issue">Issue {card.openIssues}</span>
        </span>
        <span>{timeAgo(card.updatedAt)}</span>
      </div>

      <div className="relative z-10 mt-3 flex justify-end">
        {card.status === "ARCHIVED" ? (
          <form action={restoreProjectAction}>
            <input type="hidden" name="id" value={card.id} />
            <button className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              恢复
            </button>
          </form>
        ) : (
          <form action={archiveProjectAction}>
            <input type="hidden" name="id" value={card.id} />
            <button className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              归档
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
