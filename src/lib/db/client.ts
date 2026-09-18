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
        ? // Hyperdrive multiplexes many client connections onto a small DB pool, so
          // we must allow >1 per isolate — getProjectSpace fires ~10 parallel queries
          // and a max:1 pool deadlocks the request (Workers cancels a hung worker).
          { max: 20, idle_timeout: 20, connect_timeout: 15, prepare: false }
        : { max: 5, idle_timeout: 20, connect_timeout: 15, ssl: { require: true } },
    );
    pool.__acmetowerSql = sql;
    pool.__acmetowerDb = drizzle(sql, { schema, logger: false });
  }
  return pool.__acmetowerDb;
}

export { schema };
export type Db = ReturnType<typeof getDb>;
