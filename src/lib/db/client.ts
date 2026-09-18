import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/**
 * Drizzle client over postgres.js.
 *
 * Two runtimes, one interface:
 *  - Cloudflare Workers CANNOT open raw TCP to Postgres, so on the CF runtime we
 *    connect through a bound **Hyperdrive** (`env.HYPERDRIVE.connectionString`),
 *    which proxies the Postgres wire protocol. Hyperdrive terminates TLS itself,
 *    so we must NOT force `ssl` there, and keep `max: 1` per isolate.
 *  - Local dev / drizzle-kit / Node: connect directly to the Supabase SESSION
 *    pooler (port 5432) over TLS — see .env.local.
 *
 * getDb() is only ever called inside a request/handler, where
 * getCloudflareContext() is available; outside CF it throws and we fall back.
 */

const pool = globalThis as unknown as {
  __acmetowerSql?: ReturnType<typeof postgres>;
  __acmetowerDb?: ReturnType<typeof drizzle<typeof schema>>;
};

interface Resolved {
  url: string;
  viaHyperdrive: boolean;
}

function resolveConnection(): Resolved {
  try {
    const { env } = getCloudflareContext();
    const hd = (env as { HYPERDRIVE?: { connectionString?: string } })?.HYPERDRIVE?.connectionString;
    if (hd) return { url: hd, viaHyperdrive: true };
  } catch {
    /* not running on Cloudflare (local dev / build) — fall through */
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local (or bind a Hyperdrive on Cloudflare).",
    );
  }
  return { url, viaHyperdrive: false };
}

export function getDb() {
  if (!pool.__acmetowerDb) {
    const { url, viaHyperdrive } = resolveConnection();
    const sql = postgres(
      url,
      viaHyperdrive
        ? // Over Hyperdrive, keep a SMALL per-isolate pool: Hyperdrive itself pools and
          // multiplexes client connections onto the origin, and it queues additional
          // requests internally. A large per-isolate pool (e.g. 20) makes every warm
          // isolate open many TCP/Postgres setups at once, which intermittently stalls
          // awaiting a connection → workerd cancels the request (HTTP 1101). postgres.js
          // queues beyond `max` (it serializes, it does not deadlock), so a small pool is
          // both correct and safe. prepare:false because Hyperdrive/the pooler forbid
          // server-side prepared statements.
          { max: 2, idle_timeout: 20, connect_timeout: 8, max_lifetime: 4 * 60 * 60, prepare: false }
        : { max: 5, idle_timeout: 20, connect_timeout: 15, ssl: { require: true } },
    );
    pool.__acmetowerSql = sql;
    pool.__acmetowerDb = drizzle(sql, { schema, logger: false });
  }
  return pool.__acmetowerDb;
}

export { schema };
export type Db = ReturnType<typeof getDb>;
