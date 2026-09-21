// V0.2 web-write smoke test — the shared-RPC convergence for the human/web write
// path, focused on the entities the §82 MCP suite doesn't exercise end-to-end
// (North Star upsert) and asserting web writes audit as source=WEB. Run:
//   npx tsx scripts/test-web-writes.ts   (needs .env.local with DATABASE_URL +
//   SUPABASE_URL + SUPABASE_SECRET_KEY; web writes go over HTTPS RPC now).
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

if (!process.env.ACC_KEEP_PROXY) {
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) delete process.env[k];
}
const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
process.env.SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY || "";

const P = await import("@/lib/data/projects");
const W = await import("@/lib/data/writes");
const TL = await import("@/lib/data/timeline");
const AG = await import("@/lib/data/agents");
const CR = await import("@/lib/data/credentials");
const { httpNorthStar } = await import("@/lib/mcp/httpdata");
const { buildProjectExport } = await import("@/lib/data/export");

const sql = postgres(env.DATABASE_URL, { ssl: { require: true }, max: 1, connect_timeout: 25 });
const human = { actorType: "HUMAN", actorLabel: "web-write-test", source: "WEB" } as const;
const rnd = randomBytes(3).toString("hex");
const proj = await P.createProject(human, { name: `ww ${rnd}`, slug: `ww-${rnd}` });

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
};

try {
  // North Star: create then partial update must keep unspecified fields.
  const created = await W.upsertNorthStar(human, proj.id, { name: "北极星", finalGoal: "做出 V0.1", nonGoals: "不做通用任务管理" });
  const mid = await httpNorthStar(proj.id);
  check("north_star 创建 v1", created.version === 1 && mid?.name === "北极星" && mid?.finalGoal === "做出 V0.1");
  const updated = await W.upsertNorthStar(human, proj.id, { deliverable: "Web+MCP 平台" });
  const after = await httpNorthStar(proj.id);
  check("north_star 部分更新保留旧值 + v2", updated.version === 2 && after?.name === "北极星" && after?.deliverable === "Web+MCP 平台");

  // Task + Branch via the web (human) write path.
  const ph = await W.createPhase(human, { projectId: proj.id, name: "P1" });
  const tk = await W.createTask(human, { projectId: proj.id, phaseId: ph.id, name: "T1" });
  await W.setTaskStatus(human, tk.id, "IN_PROGRESS");
  await W.updateTask(human, tk.id, { progress: 42 });
  const br = await W.createBranch(human, { projectId: proj.id, sourceType: "TASK", sourceId: tk.id, name: "B1", reason: "r", goal: "g", returnPointType: "TASK", returnPointId: tk.id });
  const closed = await W.closeBranch(human, br.id, "结论");
  const cp = await W.createCheckpoint(human, { projectId: proj.id, summary: "cp", taskId: tk.id });
  check("web 写 branch 创建/回收 + checkpoint", br.status === "OPEN" && closed.status === "RESOLVED" && !!cp.id);

  // Every web write above must land in the audit stream as source=WEB.
  const tl = await TL.getTimeline(proj.id, { source: "WEB", limit: 100 });
  const actions = new Set(tl.map((e) => e.action));
  for (const a of ["NORTH_STAR_UPDATED", "PHASE_CREATED", "TASK_CREATED", "TASK_STATUS", "TASK_UPDATED", "BRANCH_CREATED", "BRANCH_RESOLVED", "CHECKPOINT_CREATED"]) {
    check(`审计 source=WEB 含 ${a}`, actions.has(a));
  }

  // ── rename（右键菜单「重命名」）：改名 + version++ + 审计 PROJECT_RENAMED ──
  const renamed = await P.renameProject(human, proj.id, `ww ${rnd}-改名`);
  const renTl = await TL.getTimeline(proj.id, { limit: 100 });
  check(
    "rename 改名 + v++ + 审计",
    renamed.name === `ww ${rnd}-改名` && renamed.version === proj.version + 1 && renTl.some((e) => e.action === "PROJECT_RENAMED"),
  );
  let renameThrew = false;
  try { await P.renameProject(human, proj.id, "   "); } catch { renameThrew = true; }
  check("rename 空名被拒", renameThrew);

  // ── export（右键菜单「导出 JSON」）：装配完整且绝不含 token_hash ──
  const { agent: ag } = await AG.createAndBindAgent(human, { projectId: proj.id, name: "ww-agent-" + rnd, permissionLevel: "WORKING_WRITE" });
  await CR.createCredential(human, { projectId: proj.id, name: "ww-cred", permissionLevel: "WORKING_WRITE", agentId: ag.id });
  const exp = (await buildProjectExport(proj.id)) as {
    schema: string; project: { id: string }; tasks: unknown[]; credentials: { tokenPrefix?: string; token_hash?: string }[];
  };
  check("export schema + project + tasks 非空", exp.schema === "acmetower-export@1" && exp.project.id === proj.id && exp.tasks.length >= 1);
  check("export 凭证不含 token_hash", exp.credentials.length >= 1 && exp.credentials.every((c) => !("token_hash" in c) && !!c.tokenPrefix));

  // ── purge（回收站「彻底删除」）：两阶段护栏 + 级联清空 + 孤儿 Agent 回收 ──
  const pp = await P.createProject(human, { name: `purge ${rnd}`, slug: `purge-${rnd}` });
  const pph = await W.createPhase(human, { projectId: pp.id, name: "P1" });
  const ptk = await W.createTask(human, { projectId: pp.id, phaseId: pph.id, name: "T1" });
  const { agent: pag } = await AG.createAndBindAgent(human, { projectId: pp.id, name: "purge-agent-" + rnd, permissionLevel: "READ" });
  let purgeThrew = false;
  try { await P.purgeProject(human, pp.id); } catch { purgeThrew = true; }
  check("purge 未归档被拒（两阶段护栏）", purgeThrew);
  await P.setProjectStatus(human, pp.id, "ARCHIVED");
  const summary = await P.purgeProject(human, pp.id);
  const gone = await sql`select 1 from projects where id=${pp.id}`;
  const taskGone = await sql`select 1 from tasks where id=${ptk.id}`;
  const agentGone = await sql`select 1 from agents where id=${pag.id}`;
  check(
    "purge 级联清空项目+任务+孤儿 Agent",
    summary.name === `purge ${rnd}` && +summary.deleted.tasks === 1 && gone.length === 0 && taskGone.length === 0 && agentGone.length === 0,
  );
} finally {
  await sql`delete from projects where id=${proj.id}`.catch(() => {});
  await sql.end();
}

console.log(`\n===== web-write 冒烟：${failures === 0 ? "PASS" : `FAIL (${failures})`} =====`);
process.exit(failures === 0 ? 0 : 2);
