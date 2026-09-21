// 模拟一次「本地 Agent 通过 MCP 写入」的真实推进演练。
// 前半段：人类 Owner 在网页侧建项目/主线/任务、签发凭证（走应用层，与网页按钮等价）。
// 后半段：Agent 只持有 Bearer 令牌，通过公网 https://project.acmerd.com/mcp
//         按接入协议读取→认领→推进→报 Issue→交 Checkpoint，全程走活体 /mcp。
// 演练项目【保留】，可到网页上查看时间线与主线变化。
//
// 运行：ACC_KEEP_PROXY=1 NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
//       npx tsx scripts/demo-agent-run.ts [BASE]
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

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
const BASE = process.argv[2] || "https://project.acmerd.com";

const W = await import("@/lib/data/writes");
const P = await import("@/lib/data/projects");
const AG = await import("@/lib/data/agents");
const CR = await import("@/lib/data/credentials");
const TL = await import("@/lib/data/timeline");

const owner = { actorType: "HUMAN", actorLabel: "Owner（演练脚本）", source: "WEB" } as const;
const rnd = randomBytes(2).toString("hex");

const human = (s: string) => console.log(`\n👤 人类侧 · ${s}`);
const agent = (s: string) => console.log(`🤖 Agent · ${s}`);
const ok = (s: string) => console.log(`   ✔ ${s}`);

human(`创建演练项目「夜巡演练 ${rnd}」`);
const project = await P.createProject(owner, {
  name: `夜巡演练 ${rnd}`,
  slug: `nightwatch-${rnd}`,
  description: "模拟本地 Agent 通过 MCP 真实推进的一次演练（可整项目删除）",
});
const ph = await W.createPhase(owner, {
  projectId: project.id,
  name: "Phase 1 · 文档夜巡",
  goal: "把 README / help 页与实现现状对齐",
  successCriteria: "三份文档与代码一致，缺口有 Issue 记录",
});
await W.setPhaseStatus(owner, ph.id, "ACTIVE");
await W.setCurrentPhase(owner, project.id, ph.id);
const tA = await W.createTask(owner, { projectId: project.id, phaseId: ph.id, name: "校对 README 安装步骤", purpose: "新人按 README 装不上会流失", successCriteria: "步骤逐条实测通过" });
const tB = await W.createTask(owner, { projectId: project.id, phaseId: ph.id, name: "校对 /help 术语表", purpose: "术语混用让人困惑", successCriteria: "Mission/Checkpoint 等词全站统一" });
const tC = await W.createTask(owner, { projectId: project.id, phaseId: ph.id, name: "汇总缺口清单", purpose: "给下一个 Phase 定输入" });
ok(`项目 ${project.id} · 3 个任务`);

human("创建 Agent「夜巡 Codex」、绑定 WORKING_WRITE、签发 MCP 令牌");
const { agent: agentRow } = await AG.createAndBindAgent(owner, {
  projectId: project.id, name: "夜巡 Codex", provider: "本地 CLI", role: "文档巡检", permissionLevel: "WORKING_WRITE",
});
const cred = await CR.createCredential(owner, { projectId: project.id, name: "nightwatch-token", permissionLevel: "WORKING_WRITE", agentId: agentRow.id });
ok(`令牌 ${cred.token.slice(0, 8)}…（明文不落库）`);

// ── 以下全部动作只经过公网 /mcp，等价于本地 Agent 的视角 ──
const parse = (r: any) => { try { return JSON.parse(r.content?.[0]?.text ?? "null"); } catch { return null; } };
const client = new Client({ name: "nightwatch-codex", version: "1.0" });
const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
  requestInit: { headers: { authorization: `Bearer ${cred.token}` } },
});
await client.connect(transport);
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name} 失败：${(r.content?.[0] as { text?: string })?.text ?? ""}`);
  return parse(r);
};

agent(`连接 ${BASE}/mcp 成功，listTools = ${(await client.listTools()).tools.length} 个工具`);
const me = await call("mcp_whoami");
ok(`whoami → 凭证「${me.credential_name}」· 权限 ${me.permission_level} · token ${me.token_prefix}…`);

const mission = await call("project_get_current_mission");
agent(`读取 Current Mission：当前位于 ${mission.current_position?.phase?.name ?? "（无）"} / objective=${mission.mission?.objective ?? "—"}`);

const roadmap = await call("project_get_roadmap");
const todoTasks = (roadmap.phases ?? []).flatMap((p: any) => p.tasks ?? []).filter((t: any) => t.status === "TODO");
ok(`路线图拿到 ${todoTasks.length} 个 TODO 任务：${todoTasks.map((t: any) => t.name).join("、")}`);

agent(`认领任务「${tA.name}」→ IN_PROGRESS`);
await call("project_update_task", { task_id: tA.id, status: "IN_PROGRESS" });
await call("project_update_task", { task_id: tA.id, progress: 60 });
ok("推进到 60%（模拟逐条实测安装步骤）");
const doneA = await call("project_update_task", { task_id: tA.id, progress: 100, status: "COMPLETED" });
ok(`「${tA.name}」完成（状态 ${doneA.status}）`);

agent(`开始「${tB.name}」`);
await call("project_update_task", { task_id: tB.id, status: "IN_PROGRESS", progress: 40 });
const issue = await call("project_create_issue", {
  title: "/help 中 Mission 与 Milestone 混用",
  description: "第 3 节用 Mission、第 5 节用 Milestone 指同一概念，读者会误解。",
  severity: "MEDIUM",
  source: "夜巡 /help 页",
  related_task_id: tB.id,
});
ok(`发现缺口 → 已报 Issue「${issue.title}」（${issue.id.slice(0, 8)}…）`);
await call("project_update_task", { task_id: tB.id, status: "BLOCKED" });
ok("任务 B 标记 BLOCKED，等人类定术语规范（GOVERNANCE 不由 Agent 定）");

const drift = await call("project_check_drift", {
  current_task: "校对 /help 术语表",
  proposed_work: "把 /help 里 Mission 统一改译为「当前使命」，并同步全站术语表",
});
agent(`漂移自检：${JSON.stringify(drift).slice(0, 160)}`);

const cp = await call("project_create_checkpoint", {
  summary: "夜巡第一轮：README 安装步骤已校对完成；/help 术语统一受阻于待人类决策；缺口清单未开始。",
  task_id: tA.id,
  completed_items: ["README 安装步骤逐条实测通过"],
  unfinished_items: ["/help 术语表校对（受阻）", "汇总缺口清单"],
  new_issues: ["/help 中 Mission 与 Milestone 混用"],
  current_status: "Phase 1 · 1/3 任务完成",
  next_action: "等 Owner 批准术语规范后继续任务 B；任务 C 可由下一个 Agent 直接认领",
});
ok(`Checkpoint 已提交（${cp.id.slice(0, 8)}…）——下一个 Agent 冷启动可从这里接上`);

const recent = await call("project_get_recent_checkpoints");
ok(`回读最近 Checkpoints：${(recent.checkpoints ?? recent.items ?? []).length} 条`);await transport.close();

human("回到网页侧验证审计：Timeline 里 MCP 来源的事件");
const tl = await TL.getTimeline(project.id, { limit: 50 });
const mcpEvents = tl.filter((e) => e.source === "MCP");
console.log(`   ✔ 共 ${tl.length} 条事件，其中 Agent 写入 ${mcpEvents.length} 条：`);
for (const e of mcpEvents.slice(0, 12)) console.log(`     · ${e.action} — ${(e.summary ?? "").slice(0, 46)}`);

console.log(`\n演练项目已保留：${BASE}/projects/${project.id}`);
