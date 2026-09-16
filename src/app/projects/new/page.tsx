import Link from "next/link";
import { createProjectAction } from "../actions";

export const metadata = { title: "新建项目 · AcmeTower" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12">
      <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← 返回项目列表
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">新建项目</h1>
      {error === "name" && <p className="mt-2 text-sm text-red-600">项目名称为必填。</p>}

      <form action={createProjectAction} className="mt-6 space-y-4">
        <input type="hidden" name="workspaceSlug" value="personal" />
        <Field label="项目名称" required>
          <input
            name="name"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="例如：AcmeTower 自我治理"
          />
        </Field>
        <Field label="图标 (emoji)">
          <input
            name="icon"
            className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="🗼"
          />
        </Field>
        <Field label="Slug（留空自动生成）">
          <input
            name="slug"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="acmetower"
          />
        </Field>
        <Field label="简介">
          <textarea
            name="description"
            rows={3}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="这个项目要做什么…"
          />
        </Field>
        <button
          type="submit"
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
        >
          创建项目
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
