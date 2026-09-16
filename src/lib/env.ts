/**
 * Server-only environment access.
 * On Node (local `next dev`) values come from process.env (.env.local).
 * On Cloudflare Workers, OpenNext bridges configured vars/secrets; we fall back
 * to getCloudflareContext().env when process.env is empty.
 * Never import this from client components.
 */

function getProcessEnv(key: string): string | undefined {
  return typeof process !== "undefined" ? process.env[key] : undefined;
}

// Cached CF runtime env (only available when running inside a Worker).
let cfEnv: Record<string, string | undefined> | null = null;
async function getCFEnv(): Promise<Record<string, string | undefined>> {
  if (cfEnv) return cfEnv;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = getCloudflareContext();
    cfEnv = (env ?? {}) as unknown as Record<string, string | undefined>;
  } catch {
    cfEnv = {};
  }
  return cfEnv;
}

export const env = {
  DATABASE_URL: getProcessEnv("DATABASE_URL"),
  SUPABASE_URL: getProcessEnv("SUPABASE_URL"),
  SUPABASE_PUBLISHABLE_KEY: getProcessEnv("SUPABASE_PUBLISHABLE_KEY"),
  SUPABASE_SECRET_KEY: getProcessEnv("SUPABASE_SECRET_KEY"),
  APP_URL: getProcessEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  nodeEnv: getProcessEnv("NODE_ENV") ?? "development",
};

/** Async accessor that also resolves Cloudflare-bound secrets at runtime. */
const CF_ENV_NAME: Record<keyof typeof env, string> = {
  DATABASE_URL: "DATABASE_URL",
  SUPABASE_URL: "SUPABASE_URL",
  SUPABASE_PUBLISHABLE_KEY: "SUPABASE_PUBLISHABLE_KEY",
  SUPABASE_SECRET_KEY: "SUPABASE_SECRET_KEY",
  APP_URL: "NEXT_PUBLIC_APP_URL",
  nodeEnv: "NODE_ENV",
};

export async function requireEnv(key: keyof typeof env): Promise<string> {
  const value = env[key] ?? (await getCFEnv())[CF_ENV_NAME[key]];
  if (!value) throw new Error(`Missing required env: ${String(key)}`);
  return value;
}
