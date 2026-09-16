"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/auth/client";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dest = next && next.startsWith("/") ? next : "/projects";

  function done() {
    router.replace(dest);
    router.refresh();
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    await start(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(readable(error.message));
      else done();
    });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    await start(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) setError(readable(error.message));
      else if (data.session) done();
      else setNotice("注册成功。请查收确认邮件后登录（或在 Dashboard 关闭邮箱确认）。");
    });
  }

  const busy = pending;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <form onSubmit={signIn} className="space-y-3">
        <Field label="邮箱">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            required
          />
        </Field>
        <Field label="密码">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            required
            minLength={6}
          />
        </Field>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            登录
          </button>
          <button
            type="button"
            onClick={(e) => signUp(e as unknown as React.FormEvent)}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100"
          >
            注册
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function readable(msg: string) {
  const map: Record<string, string> = {
    "Invalid login credentials": "邮箱或密码不正确",
    "Email not confirmed": "邮箱尚未确认",
    "User already registered": "该邮箱已注册",
    "For security, recent signup must be confirmed before another email change": "请先确认邮箱",
  };
  return map[msg] ?? msg;
}
