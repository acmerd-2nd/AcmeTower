import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Drizzle client over postgres.js.
 * - Local dev / drizzle-kit: connects through the Supabase SESSION pooler
 *   (port 5432) — see .env.local. Direct db.<ref> host does not resolve here.
 * - Cloudflare runtime: same driver works under nodejs_compat (TCP). If we later
 *   switch to the TRANSACTION pooler (6543) or Hyperdrive, add `prepare: false`
 *   to avoid prepared-statement errors behind PgBouncer.
 */

const pool = globalThis as unknown as {
  __acmetowerSql?: ReturnType<typeof postgres>;
  __acmetowerDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local (or set the Cloudflare secret).",
    );
  }
  return url;
}

export function getDb() {
  if (!pool.__acmetowerDb) {
    const sql = postgres(connectionString(), {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: { require: true },
    });
    pool.__acmetowerSql = sql;
    pool.__acmetowerDb = drizzle(sql, { schema, logger: false });
  }
  return pool.__acmetowerDb;
}

export { schema };
export type Db = ReturnType<typeof getDb>;
