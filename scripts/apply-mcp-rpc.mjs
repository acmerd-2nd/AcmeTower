import { readFileSync } from "node:fs";
import postgres from "postgres";
const env = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const sql = postgres(env.DATABASE_URL, { ssl: { require: true }, max: 1, connect_timeout: 25 });
try {
  await sql.unsafe(readFileSync("db/mcp_rpc.sql", "utf8")).simple();
  await sql.unsafe("NOTIFY pgrst, 'reload schema';").simple();
  const rows = await sql`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname like 'mcp_%' order by 1`;
  console.log("APPLIED", rows.length, "functions:", rows.map((r) => r.proname).join(", "));
} catch (e) {
  console.error("APPLY FAILED:", e?.message || e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
