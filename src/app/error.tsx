"use client";

import Link from "next/link";
import { useEffect } from "react";

// Segment-level boundary: catches errors thrown while rendering a page/layout
// under it (e.g. a transient data-read failure). Shows an on-brand, human card
// with retry + navigation instead of a raw runtime error.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console for debugging; users see the friendly card.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <div className="text-4xl">🗼</div>
      <h1 className="mt-3 text-lg font-semibold tracking-tight">出了点问题</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
        服务可能暂时不可用，或这一页的数据没能加载出来。稍等片刻后重试，通常会自动恢复。
      </p>
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={() => reset()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
        >
          重试
        </button>
        <Link
          href="/projects"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          返回我的项目
        </Link>
      </div>
      {error?.digest ? (
        <p className="mt-4 text-[11px] text-zinc-400">
          反馈此编号以便排查：{error.digest}
        </p>
      ) : null}
    </div>
  );
}
