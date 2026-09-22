"use client";

import { useTransition } from "react";
import { taskAction } from "@/lib/actions/write";
import { toast } from "@/components/toast";

/** 任务进度条内联表单：提交后弹 toast，pending 防连点（步骤7 反馈补齐）。 */
export function ProgressForm({ projectId, taskId, value }: { projectId: string; taskId: string; value: number }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="inline-flex items-center gap-1"
      action={(fd) =>
        start(async () => {
          const v = fd.get("progress");
          await taskAction(fd);
          toast(`进度已更新 → ${v}% ✓`);
        })
      }
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="_action" value="progress" />
      <input type="hidden" name="id" value={taskId} />
      <input
        type="number"
        name="progress"
        min={0}
        max={100}
        defaultValue={value}
        className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
      >
        {pending ? "…" : "%"}
      </button>
    </form>
  );
}
