"use client";

import { useTransition } from "react";
import { toast } from "@/components/toast";

/**
 * 一个提交到 Server Action 的小表单按钮（状态流转 / 设为当前 / 归档）。
 * 步骤6：pending 期间禁用防连点，成功后弹 toast 给即时反馈。
 */
export function ActionButton({
  action,
  fields,
  label,
  tone = "ghost",
  done,
}: {
  action: (fd: FormData) => Promise<void>;
  fields: { name: string; value: string }[];
  label: string;
  tone?: "ghost" | "solid" | "danger";
  done?: string;
}) {
  const [pending, start] = useTransition();
  const cls =
    (tone === "solid"
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
      : tone === "danger"
        ? "border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800") +
    (pending ? " cursor-wait opacity-50" : "");
  return (
    <form
      className="inline"
      action={(fd) =>
        start(async () => {
          await action(fd);
          toast(done ?? `${label} ✓`);
        })
      }
    >
      {fields.map((f) => (
        <input key={f.name} type="hidden" name={f.name} value={f.value} />
      ))}
      <button type="submit" disabled={pending} className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-xs ${cls}`}>
        {label}
      </button>
    </form>
  );
}
