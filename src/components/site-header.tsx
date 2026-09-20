import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/session";

/**
 * Global app chrome — the single, consistent top bar across every page. Adds the
 * brand, primary navigation (项目 / 使用指南) and the signed-in identity + 退出,
 * which the app previously lacked (pages floated with no shared wayfinding).
 */
export async function SiteHeader() {
  const user = await getCurrentProfile();
  const who = user?.displayName || user?.email || "";

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <Link href="/projects" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span aria-hidden>🗼</span>
            AcmeTower
          </Link>
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <Link
              href="/projects"
              className="rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              项目
            </Link>
            <Link
              href="/help"
              className="rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              使用指南
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden max-w-[16rem] truncate text-sm text-zinc-500 md:inline" title={who}>
                {who}
              </span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  退出
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
