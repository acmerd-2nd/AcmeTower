// 兜底回收：按项目 id 走两阶段（归档→彻底删除）。
// 供 CI 在脚本内 finally 未跑到（超时/中断）时，读取 .e2e-project-id 精确清理本次演练项目。
// 运行：npx tsx scripts/purge-project-by-id.ts <projectId>
// env：优先 process.env（CI Secrets）；本地也可放 .env.local。
import { existsSync, readFileSync } from "node:fs";
const fileEnv: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) fileEnv[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const pick = (k: string) => process.env[k] || fileEnv[k] || "";
process.env.DATABASE_URL = pick("DATABASE_URL");
process.env.SUPABASE_URL = pick("SUPABASE_URL") || pick("NEXT_PUBLIC_SUPABASE_URL");
process.env.SUPABASE_SECRET_KEY = pick("SUPABASE_SECRET_KEY");

const id = (process.argv[2] || "").trim();
if (!id) {
  console.error("用法：npx tsx scripts/purge-project-by-id.ts <projectId>");
  process.exit(2);
}
const P = await import("@/lib/data/projects");
const human = { actorType: "HUMAN", actorLabel: "ci-fallback-cleanup", source: "WEB" } as const;
await P.setProjectStatus(human, id, "ARCHIVED");
const s = await P.purgeProject(human, id);
const d = s.deleted ?? ({} as Record<string, number>);
console.log(`✔ 已回收 ${s.name ?? id}（tasks ${d.tasks ?? "?"} / events ${d.events ?? "?"} / creds ${d.credentials ?? "?"}）`);
