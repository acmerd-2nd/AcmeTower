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

// ── §34：真实 Agent 冷启动第一动作就是 project_get_context，断言旗舰读工具的关键结构齐全 ──
const ctx = await call("project_get_context");
const needCtx = ["project", "current_position", "current_mission", "scope", "next_actions", "open_issues"];
const missingCtx = needCtx.filter((k) => ctx?.[k] === undefined);
if (missingCtx.length) throw new Error(`§34 project_get_context 缺字段：${missingCtx.join(", ")}`);
ok(`get_context §34 齐备：position=${ctx.current_position?.phase?.name}/${ctx.current_position?.task?.name ?? "—"} · scope.do_not=「${ctx.scope?.do_not ?? "—"}」 · next_actions ${ctx.next_actions?.length} 条`);

const mission = await call("project_get_current_mission");
agent(`读取 Current Mission：当前位于 ${mission.current_position?.phase?.name ?? "（无）"} / objective=${mission.mission?.objective ?? "—"}`);

const roadmap = await call("project_get_roadmap");
const todoTasks = (roadmap.phases ?? []).flatMap((p: any) => p.tasks ?? []).filter((t: any) => t.status === "TODO");
ok(`路线图拿到 ${todoTasks.length} 个 TODO 任务：${todoTasks.map((t: any) => t.name).join("、")}`);

agent(`认领任务「${tA.name}」→ IN_PROGRESS`);
await call("project_update_task", { task_id: tA.id, status: "IN_PROGRESS" });
// §36：带状态注记（summary/next_action/blockers）——应落进审计、Timeline 可见，绝不静默丢弃
await call("project_update_task", {
  task_id: tA.id, progress: 60,
  summary: "安装步骤逐条实测中：node 22 与 wrangler 版本要求已在 README 补注",
  next_action: "补完 Cloudflare 部署章节后交 Checkpoint",
  blockers: ["README 缺少 opennext 构建步骤说明"],
});
ok("推进到 60%（§36 状态注记已写入审计）");
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
ok(`回读最近 Checkpoints：${(recent.checkpoints ?? recent.items ?? []).length} 条`);

// ── §37 之一：权限门控——WORKING_WRITE 令牌不应拿到 create_branch ──
let permGated = false;
try {
  const r = await client.callTool({ name: "project_create_branch", arguments: { source_type: "TASK", source_id: tC.id, name: "x", reason: "x", goal: "x", return_point_type: "TASK", return_point_id: tC.id } });
  permGated = !!r.isError;
} catch { permGated = true; }
ok(`WORKING_WRITE 调 create_branch 被拒（权限门控）：${permGated ? "是 ✔" : "否 ✗（异常）"}`);
await transport.close();

// ── §37 之二：STRUCTURAL_WRITE 才能真正建分支；且 return point 不存在必须被服务端拒绝 ──
human("签发 STRUCTURAL_WRITE 令牌，验证分支的创建/回收与 return point 存在性校验");
const credS = await CR.createCredential(owner, { projectId: project.id, name: "struct-token", permissionLevel: "STRUCTURAL_WRITE", agentId: agentRow.id });
const clientS = new Client({ name: "nightwatch-struct", version: "1.0" });
const trS = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { authorization: `Bearer ${credS.token}` } } });
await clientS.connect(trS);
const callS = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await clientS.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name} 失败：${(r.content?.[0] as { text?: string })?.text ?? ""}`);
  return parse(r);
};
const bogus = "00000000-0000-0000-0000-000000000000";
let rejected = false;
try {
  await callS("project_create_branch", { source_type: "TASK", source_id: tC.id, name: "幽灵分支", reason: "应被拒", goal: "return point 不存在", return_point_type: "TASK", return_point_id: bogus });
} catch (e) { rejected = /Return Point|不存在|forbidden|not/i.test(String((e as Error).message)); }
ok(`return point 不存在的 create_branch 被服务端拒绝（§37）：${rejected ? "是 ✔" : "否 ✗"}`);
if (!rejected) throw new Error("§37 校验未生效：非法 return point 竟被接受");

const br = await callS("project_create_branch", {
  source_type: "TASK", source_id: tC.id, name: "调研文档自动化", reason: "缺口清单需要可复用的校对流程",
  goal: "评估是否引入 lint 校验 README 命令块", success_criteria: "给出可行/不可行结论 + 成本",
  return_point_type: "TASK", return_point_id: tC.id,
});
ok(`分支「${br.name}」已创建（${br.id.slice(0, 8)}…，回到 ${br.return_point_type ?? "TASK"}）`);
const brClosed = await callS("project_close_branch", { branch_id: br.id, resolution: "结论：先手写规范，自动化留待 V0.2 评估" });
ok(`分支已回收（状态 ${brClosed.status ?? "RESOLVED"}），主线回到任务 C`);
await trS.close();


human("回到网页侧验证审计：Timeline 里 MCP 来源的事件");
const tl = await TL.getTimeline(project.id, { limit: 50 });
const mcpEvents = tl.filter((e) => e.source === "MCP");
console.log(`   ✔ 共 ${tl.length} 条事件，其中 Agent 写入 ${mcpEvents.length} 条：`);
for (const e of mcpEvents.slice(0, 12)) console.log(`     · ${e.action} — ${(e.summary ?? "").slice(0, 46)}`);

// §36：状态注记必须织进审计 summary（Timeline 可见），否则视为静默丢弃 → 断言失败
const noteEvt = mcpEvents.find((e) => e.action === "TASK_UPDATED" && /下一步/.test(e.summary ?? "") && /阻塞/.test(e.summary ?? ""));
if (!noteEvt) throw new Error("§36 注记未进入审计 summary（summary/next_action/blockers 被丢弃）");
ok(`§36 注记已入审计：「${(noteEvt.summary ?? "").slice(0, 60)}…」`);
// §37：分支创建 + 回收两条 MCP 事件应在时间线留下痕迹
const branchEvts = mcpEvents.filter((e) => /BRANCH/i.test(e.action));
ok(`§37 分支审计事件 ${branchEvts.length} 条：${branchEvts.map((e) => e.action).join("、")}`);


console.log(`\n演练项目已保留：${BASE}/projects/${project.id}`);
