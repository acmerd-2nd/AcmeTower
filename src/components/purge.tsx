"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./modal";
import { purgeProjectAction } from "@/app/projects/actions";

/**
 * 彻底删除确认弹窗：必须逐字输入项目名才能点「不可恢复地删除」。
 * 后端 RPC 还有第二道护栏（仅 ARCHIVED 可 purge），这里是前端的防误删层。
 */
export function PurgeDialog({ open, onClose, id, name }: { open: boolean; onClose: () => void; id: string; name: string }) {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ready = confirmText === name && !pending;

  function submit() {
    if (!ready) return;
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const r = await purgeProjectAction(fd);
      if (r.ok) {
        onClose();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="彻底删除项目">
      <div className="space-y-3 text-sm">
        <p className="text-zinc-600 dark:text-zinc-300">
          此操作<span className="font-semibold text-red-600 dark:text-red-400">不可恢复</span>
          ：项目的主线、任务、分支、Issue、决策、Checkpoint、MCP 连接与全部审计事件都会被永久删除。
        </p>
        <p className="text-zinc-600 dark:text-zinc-300">
          请输入项目名 <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">{name}</code> 以确认：
        </p>
        <input
          value={confirmText}
          onChange={(e) => {
            setConfirmText(e.target.value);
            setError(null);
          }}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-950"
          placeholder={name}
        />
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={submit}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "删除中…" : "不可恢复地删除"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function PurgeButton({ id, name, label = "彻底删除", className }: { id: string; name: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
        }
      >
        {label}
      </button>
      <PurgeDialog open={open} onClose={() => setOpen(false)} id={id} name={name} />
    </>
  );
}
