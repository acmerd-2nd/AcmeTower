import { count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { requireProfile } from "@/lib/auth/session";

// Protected (see middleware). Step 3 smoke: shows who is logged in + live DB read.
// Real Project Home arrives in Step 4.
export default async function ProjectsPage() {
  const profile = await requireProfile();
  const db = getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(projects)
    .where(isNull(projects.deletedAt));

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">我的项目</h1>
        <form action="/auth/signout" method="post">
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
            退出
          </button>
        </form>
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        已登录：<span className="font-medium text-zinc-800 dark:text-zinc-200">{profile.email}</span>
        {" · "}当前项目数：<span className="font-medium">{n}</span>（DB 读取正常）
      </p>
      <p className="mt-6 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
        骨架已就位（Step 3 认证通过）。项目卡片、新建/归档、搜索与筛选将在 Step 4 落地。
      </p>
    </main>
  );
}
