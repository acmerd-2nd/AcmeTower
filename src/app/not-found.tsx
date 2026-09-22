import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <div className="text-4xl">🔍</div>
      <h1 className="mt-3 text-lg font-semibold tracking-tight">找不到这一页</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
        它可能已被归档或删除，或链接不正确。
      </p>
      <div className="mt-5 flex items-center gap-2">
        <Link
          href="/projects"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
        >
          返回我的项目
        </Link>
        <Link
          href="/help"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          使用指南
        </Link>
      </div>
    </div>
  );
}
