import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "登录 · AcmeTower" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl">🗼</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">AcmeTower</h1>
          <p className="text-sm text-zinc-500">AI Project Control Tower</p>
        </div>
        <Suspense>
          <LoginForm next={next} />
        </Suspense>
        <div className="mt-6 text-center">
          <Link href="/help" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            使用指南 →
          </Link>
        </div>
      </div>
    </main>
  );
}
