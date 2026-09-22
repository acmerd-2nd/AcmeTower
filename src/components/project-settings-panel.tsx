"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { projectStatusAction, renameProjectAction } from "@/app/projects/actions";
import { statusLabel } from "@/lib/core/labels";
import { toast } from "@/components/toast";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900",
  PAUSED: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  ARCHIVED: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
};

// 从某状态出发可去的其它状态（归档走回收站，这里也提供直达）
const TARGETS: Record<string, string[]> = {
  ACTIVE: ["PAUSED", "COMPLETED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "COMPLETED", "ARCHIVED"],
  COMPLETED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["ACTIVE"],
};
const ACTION_LABEL: Record<string, string> = {
  ACTIVE: "恢复进行中",
  PAUSED: "暂停",
  COMPLETED: "标记完成",
  ARCHIVED: "归档",
};

export function ProjectSettingsPanel({
  projectId,
  name,
  slug,
  status,
  version,
}: {
  projectId: string;
  name: string;
  slug: string;
  status: string;
  version: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  const [pending, start] = useTransition();

  function rename() {
    const v = draft.trim();
    if (!v || v === name) return;
    start(async () => {
      const fd = new FormData();
      fd.set("id", projectId);
      fd.set("name", v);
      const r = await renameProjectAction(fd);
      toast(r.ok ? "已重命名 ✓" : `失败：${r.error}`);
      if (r.ok) router.refresh();
    });
  }

  function setStatus(to: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("id", projectId);
      fd.set("status", to);
      const r = await projectStatusAction(fd);
      toast(r.ok ? `已设为「${statusLabel(to)}」✓` : `失败：${r.error}`);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">项目信息</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? ""}`} title={status}>
          {statusLabel(status)}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-zinc-400">Slug</dt>
          <dd className="truncate font-mono text-xs text-zinc-600 sm:mt-0.5 dark:text-zinc-300">{slug}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-zinc-400">版本（乐观锁）</dt>
          <dd className="tabular-nums text-zinc-600 sm:mt-0.5 dark:text-zinc-300">v{version}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <label className="block text-xs font-medium text-zinc-500">重命名</label>
        <div className="mt-1 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && rename()}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-100"
          />
          <button
            type="button"
            disabled={pending || !draft.trim() || draft.trim() === name}
            onClick={rename}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            保存
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-zinc-500">状态（治理级 · 仅人类）</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TARGETS[status]?.map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending}
              onClick={() => setStatus(to)}
              className={
                to === "ARCHIVED"
                  ? "rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                  : "rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }
            >
              {ACTION_LABEL[to]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          {status === "ARCHIVED" ? "已归档项目可在回收站恢复或彻底删除。" : "归档后可在「回收站」页彻底删除（不可恢复）。"}
        </p>
      </div>
    </section>
  );
}
