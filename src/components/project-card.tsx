"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveProjectAction,
  renameProjectAction,
  restoreProjectAction,
} from "@/app/projects/actions";
import type { ProjectCard as Card } from "@/lib/data/projects";
import { statusLabel } from "@/lib/core/labels";
import { timeAgo } from "@/lib/core/format";
import { useContextMenu } from "@/components/context-menu";
import { Modal } from "@/components/modal";
import { PurgeDialog } from "@/components/purge";

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
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const archived = card.status === "ARCHIVED";

  const { onContextMenu, menu } = useContextMenu([
    { id: "open", label: "打开项目", icon: "↗", href: `/projects/${card.id}` },
    { id: "rename", label: "重命名…", icon: "✏️", onSelect: () => setRenameOpen(true) },
    { id: "copy", label: "复制链接", icon: "🔗", onSelect: copyLink },
    { id: "export", label: "导出 JSON", icon: "⬇", href: `/projects/${card.id}/export`, download: true },
    archived
      ? { id: "restore", label: "恢复项目", icon: "♻️", onSelect: () => run(restoreProjectAction) }
      : { id: "archive", label: "归档（软删）", icon: "🗄", onSelect: () => run(archiveProjectAction), separatorBefore: true, danger: true },
    ...(archived
      ? [{ id: "purge", label: "彻底删除…", icon: "☠️", danger: true, separatorBefore: true, onSelect: () => setPurgeOpen(true) }]
      : []),
  ]);

  function copyLink() {
    navigator.clipboard
      .writeText(`${window.location.origin}/projects/${card.id}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  function run(action: (fd: FormData) => Promise<unknown> | void) {
    start(async () => {
      const fd = new FormData();
      fd.set("id", card.id);
      await action(fd);
      router.refresh();
    });
  }

  return (
    <div
      onContextMenu={onContextMenu}
      className="group relative flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <Link href={`/projects/${card.id}`} className="absolute inset-0" aria-label={`打开 ${card.name}`} />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{card.icon ?? "📁"}</span>
          <h3 className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{card.name}</h3>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300"
          title={`健康度：${healthLabel[card.health]} · 右键卡片有更多操作`}
        >
          <span className={`h-2 w-2 rounded-full ${healthStyle[card.health]}`} />
          {statusLabel(card.status)}
        </span>
      </div>

      {card.description && <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{card.description}</p>}

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

      <div className="relative z-10 mt-3 flex items-center justify-end gap-2">
        {archived ? (
          <>
            <button
              onClick={() => run(restoreProjectAction)}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              恢复
            </button>
            <button
              onClick={() => setPurgeOpen(true)}
              className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              彻底删除
            </button>
          </>
        ) : (
          <button
            onClick={() => run(archiveProjectAction)}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            归档
          </button>
        )}
      </div>

      {menu}
      <PurgeDialog open={purgeOpen} onClose={() => setPurgeOpen(false)} id={card.id} name={card.name} />
      <RenameDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        id={card.id}
        name={card.name}
        onDone={() => {
          setRenameOpen(false);
          router.refresh();
        }}
      />
      {copied && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-1.5 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          已复制链接 ✓
        </div>
      )}
    </div>
  );
}

function RenameDialog({
  open,
  onClose,
  id,
  name,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  name: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const v = value.trim();
    if (!v) return setError("名称不能为空");
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("name", v);
      const r = await renameProjectAction(fd);
      if (r.ok) onDone();
      else setError(r.error);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="重命名项目">
      <div className="space-y-3">
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-100"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={pending || !value.trim()}
            onClick={submit}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
