/**
 * Supabase PostgREST client for the /mcp edge path (v0.1 §42, §82).
 *
 * Why: the worker's Postgres-over-TCP path (Hyperdrive → Supabase, Sydney) shows
 * intermittent connection stalls under load that even bounded retries don't fully
 * clear. PostgREST talks to the SAME database over Cloudflare's HTTPS/HTTP-2 path
 * (service_role key), sidestepping the TCP tunnel entirely. Used only by the /mcp
 * gateway; the web app keeps using Drizzle.
 *
 * Reads are REST selects; transactional writes go to SECURITY DEFINER RPC
 * functions (see db/mcp_rpc.sql) so version-guarded updates + audit stay atomic.
 *
 * Every call has a short deadline + bounded retries (each attempt opens a fresh
 * HTTP request — cheap over HTTP/2) so a transient blip self-heals instead of
 * surfacing a raw error.
 */
const BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || "";

function headers(): Record<string, string> {
  if (!BASE || !SERVICE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY not configured for MCP HTTPS path");
  }
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
    prefer: "return=representation",
  };
}

async function fetchWithDeadline(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function withRestRetry<T>(run: () => Promise<T>, timeoutMs: number, attempts: number, label: string): Promise<T> {
  let lastErr: unknown;
  for (let a = 0; a < attempts; a++) {
    try {
      return await run();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`rest ${label}: unreachable`);
}

/**
 * PostgREST select. `filter` is a query-string fragment, e.g. "token_hash=eq.abc&limit=1".
 * `columns` optional (else `*`).
 */
export async function restSelect<T = Record<string, unknown>>(
  table: string,
  filter: string,
  opts: { columns?: string; timeoutMs?: number; attempts?: number } = {},
): Promise<T[]> {
  const { columns = "*", timeoutMs = 4000, attempts = 3 } = opts;
  const qs = filter ? `${columns ? `select=${columns}&` : ""}${filter}` : `select=${columns}`;
  const url = `${BASE}/rest/v1/${table}?${qs}`;
  return withRestRetry(
    async () => {
      const res = await fetchWithDeadline(url, { method: "GET", headers: headers() }, timeoutMs);
      if (!res.ok) throw new Error(`rest ${table}: HTTP ${res.status} ${await safeText(res)}`);
      return (await res.json()) as T[];
    },
    timeoutMs,
    attempts,
    `select ${table}`,
  );
}

/** Call a SECURITY DEFINER RPC function (transactional writes live here). */
export async function restRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  opts: { timeoutMs?: number; attempts?: number } = {},
): Promise<T> {
  const { timeoutMs = 8000, attempts = fn.startsWith("mcp_") ? 2 : 3 } = opts;
  const url = `${BASE}/rest/v1/rpc/${fn}`;
  const body = JSON.stringify(args);
  return withRestRetry(
    async () => {
      const res = await fetchWithDeadline(url, { method: "POST", headers: headers(), body }, timeoutMs);
      if (!res.ok) throw new RestError(res.status, rpcMessage(await safeText(res)), fn);
      // Success body must NOT go through safeText (which truncates to 400 chars for
      // error display) — a full row is longer and would fail JSON.parse mid-string.
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    },
    timeoutMs,
    attempts,
    `rpc ${fn}`,
  );
}

/** A Postgres RAISE surfaces as {code,message}; show the message, not the envelope. */
function rpcMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { message?: string };
    if (j?.message) return j.message;
  } catch {
    /* not JSON — fall through */
  }
  return body || "rpc failed";
}

/** A Postgres-raised error (4xx from rpc) preserves the message so callers can map to domain failures. */
export class RestError extends Error {
  constructor(readonly status: number, message: string, readonly fn: string) {
    super(message);
    this.name = "RestError";
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 400);
  } catch {
    return "";
  }
}
