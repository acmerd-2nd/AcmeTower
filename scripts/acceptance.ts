// V0.1 验收自动化 — §82 的 12 项测试。用真实数据层 + 活体 /mcp（官方 client）驱动，
// 跑完即清理临时项目/Agent。打印 PASS/FAIL 矩阵；任一 FAIL → exit 2。
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// Keep HTTP(S)_PROXY when ACC_KEEP_PROXY=1 (e.g. pointing the MCP client at a
// deployed URL from behind a system proxy); strip it for local-dev runs.
if (!process.env.ACC_KEEP_PROXY) {
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) delete process.env[k];
}
const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
process.env.DATABASE_URL = env.DATABASE_URL;
const BASE = process.argv[2] || "http://localhost:3100";

// real app layers
const W = await import("@/lib/data/writes");
const R = await import("@/lib/data/reads");
const P = await import("@/lib/data/projects");
const SP = await import("@/lib/data/project");
const TL = await import("@/lib/data/timeline");
const AG = await import("@/lib/data/agents");
const CR = await import("@/lib/data/credentials");

const sql = postgres(env.DATABASE_URL, { ssl: { require: true }, max: 1, connect_timeout: 15 });
const webActor = { actorType: "HUMAN", actorLabel: "验收脚本", source: "WEB" } as const;
const rnd = randomBytes(3).toString("hex");

// ── result matrix ──
const results: { n: number; name: string; pass: boolean; detail: string }[] = [];
async function t(n: number, name: string, fn: () => Promise<string | void>) {
  try {
    const detail = (await fn()) ?? "";
    results.push({ n, name, pass: true, detail: String(detail) });
    console.log(`✓ Test ${n}: ${name}${detail ? " — " + detail : ""}`);
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    results.push({ n, name, pass: false, detail: msg });
    console.log(`✗ Test ${n}: ${name} — ${msg}`);
  }
}
const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };

// ── MCP helpers ──
const parse = (r: any) => { try { return JSON.parse(r.content?.[0]?.text ?? "null"); } catch { return r?.content?.[0]?.text; } };
async function withMcp<T>(token: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ name: "acc", version: "0" });
  const tr = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  await c.connect(tr);
  try { return await fn(c); } finally { try { await tr.close(); } catch {} }
}
const call = (c: Client, name: string, args: any) => c.callTool({ name, arguments: args });
const toolNames = async (c: Client) => (await c.listTools()).tools.map((x) => x.name);

const createdProjects: string[] = [];
const createdAgents: string[] = [];
try {
  // fixtures: 3 fresh projects
  const mk = async (i: number) => {
    const x = await P.createProject({ name: `验收 P${i + 1} ${rnd}`, slug: `acc-p${i + 1}-${rnd}`, description: "acceptance" });
    createdProjects.push(x.id);
    return x;
  };
  const [P1, P2, P3] = [await mk(0), await mk(1), await mk(2)];

  // shared handles populated as tests proceed
  let phase1Id = "";
  let task1Id = "";
  let branch1Id = "";
  let decisionTitle = "选 Drizzle + postgres.js";

  await t(1, "多项目 — 三项目独立、互不污染", async () => {
    const cards = await P.listProjectCards({});
    const ids = new Set(cards.map((c) => c.id));
    assert([P1, P2, P3].every((p) => ids.has(p.id)), "三项目未同时出现在列表");
    // 用 P2 令牌改 P1 的任务 → 跨项目拒绝（写入 Test 9 会先建 P1 task；这里直接建一个来验隔离）
    const ph = await W.createPhase(webActor, { projectId: P1.id, name: "Phase 隔离" });
    const tk = await W.createTask(webActor, { projectId: P1.id, phaseId: ph.id, name: "隔离任务" });
    const cred = await CR.createCredential(webActor, { projectId: P2.id, name: "acc-struct-p2", permissionLevel: "STRUCTURAL_WRITE" });
    const r = await withMcp(cred.token, (c) => call(c, "project_update_task", { task_id: tk.id, progress: 5 }));
    assert(r.isError === true && /不属于|跨项目|forbidden/i.test((r.content[0] as { text?: string }).text ?? ""), "跨项目写未被拒绝");
    return "3 卡片可见；P2 令牌改 P1 任务被拒";
  });

  await t(2, "主线 — Phase 1–10、设 Active、显示当前位置", async () => {
    for (let i = 1; i <= 10; i++) {
      const ph = await W.createPhase(webActor, { projectId: P1.id, name: `Phase ${i}`, goal: `目标 ${i}` });
      if (i === 1) phase1Id = ph.id;
    }
    await W.setPhaseStatus(webActor, phase1Id, "ACTIVE");
    await W.setCurrentPhase(webActor, P1.id, phase1Id);
    const space = await SP.getProjectSpace(P1.id);
    assert(space && (space.phases.length ?? 0) >= 10, "Phase 数不足 10");
    assert(space?.currentPhase?.id === phase1Id, "当前主线位置不正确");
    assert(space?.currentPhase?.status === "ACTIVE", "当前 Phase 非 ACTIVE");
    return "10 Phase；Phase1=ACTIVE 且为当前位置";
  });

  await t(3, "Task 状态机 TODO→IN_PROGRESS→BLOCKED→IN_PROGRESS→COMPLETED", async () => {
    const ph = await W.createPhase(webActor, { projectId: P1.id, name: "Task 载体" });
    let tk = await W.createTask(webActor, { projectId: P1.id, phaseId: ph.id, name: "任务状态测试" });
    task1Id = tk.id;
    tk = await W.setTaskStatus(webActor, tk.id, "IN_PROGRESS"); assert(tk.status === "IN_PROGRESS", "→IN_PROGRESS 失败");
    tk = await W.setTaskStatus(webActor, tk.id, "BLOCKED"); assert(tk.status === "BLOCKED", "→BLOCKED 失败");
    tk = await W.setTaskStatus(webActor, tk.id, "IN_PROGRESS"); assert(tk.status === "IN_PROGRESS", "BLOCKED→IN_PROGRESS 失败");
    tk = await W.setTaskStatus(webActor, tk.id, "COMPLETED"); assert(tk.status === "COMPLETED" && tk.progress === 100, "→COMPLETED 失败");
    let threw = false;
    try { await W.setTaskStatus(webActor, tk.id, "TODO"); } catch { threw = true; }
    assert(threw, "COMPLETED→TODO 应被拒");
    return "全链路转换 + 非法转换被拒";
  });

  await t(4, "Branch — 记录 Source/Reason/Goal/Return Point 且可回收", async () => {
    const br = await W.createBranch(webActor, {
      projectId: P1.id, sourceType: "TASK", sourceId: task1Id, name: "B1 验证替代 API",
      reason: "第三方限制", goal: "确定可行方案", successCriteria: "形成结论",
      returnPointType: "TASK", returnPointId: task1Id,
    });
    branch1Id = br.id;
    assert(br.status === "OPEN" && br.sourceId === task1Id && br.returnPointId === task1Id, "分支字段不全");
    const closed = await W.closeBranch(webActor, br.id, "结论：走方案 B");
    assert(closed.status === "RESOLVED" && closed.resolution === "结论：走方案 B", "关闭/回收失败");
    return "含来源·原因·目标·Return Point，回收为 RESOLVED";
  });

  await t(5, "Decision — Reason/Impact/Status 可见", async () => {
    const d = await W.createDecision(webActor, { projectId: P1.id, title: decisionTitle, decision: "采用 Drizzle", reason: "类型安全", impact: "全站数据访问" });
    const decided = await W.decideDecision(webActor, d.id, "APPROVED");
    const rows = await R.listDecisionRows(P1.id);
    const found = rows.find((x) => x.id === d.id)!;
    assert(found.reason === "类型安全" && found.impact === "全站数据访问" && decided.status === "APPROVED", "Decision 字段/状态不全");
    return "Reason+Impact+Status 齐备，可批准";
  });

  await t(6, "Checkpoint → 网页 Timeline 出现记录", async () => {
    await W.createCheckpoint(webActor, { projectId: P1.id, summary: "Step12 验收检查点", taskId: task1Id, completedItems: ["a", "b"], nextAction: "继续" });
    const tl = await TL.getTimeline(P1.id, { limit: 50 });
    const ev = tl.find((e) => e.action === "CHECKPOINT_CREATED");
    assert(ev && ev.source === "WEB", "Timeline 未记录 Checkpoint");
    return "Checkpoint 已进入审计时间线";
  });

  await t(7, "Agent Connection — 建 Agent·绑定·授权·生成 MCP 连接", async () => {
    const { agent } = await AG.createAndBindAgent(webActor, { projectId: P1.id, name: "验收 Codex " + rnd, provider: "OpenAI", role: "Developer", permissionLevel: "READ" });
    createdAgents.push(agent.id);
    let bound = await AG.listProjectAgents(P1.id);
    assert(bound.some((b) => b.agentId === agent.id && b.permissionLevel === "READ"), "未绑定/权限未设");
    await AG.setAgentPermission(webActor, P1.id, agent.id, "WORKING_WRITE");
    bound = await AG.listProjectAgents(P1.id);
    assert(bound.find((b) => b.agentId === agent.id)?.permissionLevel === "WORKING_WRITE", "权限未更新");
    const cred = await CR.createCredential(webActor, { projectId: P1.id, name: "acc-read-p1", permissionLevel: "READ", agentId: agent.id });
    const creds = await CR.listCredentials(P1.id);
    assert(creds.some((c) => c.id === cred.row.id && c.tokenPrefix !== cred.token), "连接凭证未生成/未隐藏明文");
    (globalThis as any).__acc = { readToken: cred.token };
    return "Agent 已建+绑定+授权，MCP 连接已生成（明文不落库）";
  });

  const readToken: string = (globalThis as any).__acc?.readToken ?? "";

  await t(8, "MCP Read — 读取项目/Current Mission/Task/Branch/Decision", async () => {
    assert(readToken, "缺 READ 令牌");
    await withMcp(readToken, async (c) => {
      const names = await toolNames(c);
      for (const want of ["project_get", "project_get_current_mission", "project_get_task", "project_get_branch", "project_get_decisions"]) {
        assert(names.includes(want), `读工具缺失 ${want}`);
      }
      for (const [nm, args] of [["project_get", {}], ["project_get_current_mission", {}], ["project_get_task", { task_id: task1Id }], ["project_get_branch", { branch_id: branch1Id }], ["project_get_decisions", {}]] as const) {
        const r = await call(c, nm, args);
        assert(r.isError !== true, `${nm} 读取失败`);
      }
    });
    return "五类读全部成功";
  });

  await t(9, "MCP Write — 更新Task/建Branch/建Issue/交Checkpoint 且网页即时反映", async () => {
    const ph = await W.createPhase(webActor, { projectId: P2.id, name: "P2 Phase" });
    const tk = await W.createTask(webActor, { projectId: P2.id, phaseId: ph.id, name: "P2 task" });
    const cred = await CR.createCredential(webActor, { projectId: P2.id, name: "acc-struct-w", permissionLevel: "STRUCTURAL_WRITE" });
    await withMcp(cred.token, async (c) => {
      let r = await call(c, "project_update_task", { task_id: tk.id, status: "IN_PROGRESS", progress: 55 });
      assert(r.isError !== true && parse(r).status === "IN_PROGRESS", "MCP update_task 失败");
      r = await call(c, "project_create_branch", { source_type: "PHASE", source_id: ph.id, name: "MCP 分支", reason: "意外", goal: "探究", return_point_type: "PHASE", return_point_id: ph.id });
      assert(r.isError !== true && parse(r).status === "OPEN", "MCP create_branch 失败");
      r = await call(c, "project_create_issue", { title: "MCP 发现的问题", severity: "HIGH" });
      assert(r.isError !== true, "MCP create_issue 失败");
      r = await call(c, "project_create_checkpoint", { summary: "来自 MCP 的检查点", task_id: tk.id, completed_items: ["x"] });
      assert(r.isError !== true, "MCP create_checkpoint 失败");
    });
    // 网页读取即时反映（同一 DB / 读层）
    const issues = await R.listIssueRows(P2.id);
    assert(issues.some((i) => i.title === "MCP 发现的问题" && i.severity === "HIGH"), "网页侧 Issue 未反映");
    const brs = await R.listBranchRows(P2.id);
    assert(brs.some((b) => b.name === "MCP 分支"), "网页侧 Branch 未反映");
    const fresh = (await R.listTaskRows(P2.id)).find((x) => x.id === tk.id);
    assert(fresh?.status === "IN_PROGRESS" && fresh?.progress === 55, "网页侧 Task 未反映");
    return "写成功且读层立即可见";
  });

  await t(10, "权限 — READ 只读、WORKING_WRITE 不碰 North Star", async () => {
    const cred = await CR.createCredential(webActor, { projectId: P2.id, name: "acc-work", permissionLevel: "WORKING_WRITE" });
    await withMcp(readToken, async (c) => {
      const names = await toolNames(c);
      assert(!names.includes("project_update_task") && !names.includes("project_create_issue") && !names.includes("project_create_branch"), "READ 令牌出现了写工具");
    });
    await withMcp(cred.token, async (c) => {
      const names = await toolNames(c);
      assert(names.includes("project_update_task"), "WORKING_WRITE 缺 update_task");
      assert(!names.includes("project_create_branch"), "WORKING_WRITE 不应有 create_branch");
      const GOV_MUTATIONS = ["project_update_north_star", "project_upsert_north_star", "project_decide_decision", "project_approve_decision", "project_archive", "project_set_phase", "project_change_scope"];
      assert(names.every((n) => !GOV_MUTATIONS.includes(n)), "出现了治理类变更工具");
    });
    return "READ 无写权；WORKING_WRITE 有写、无治理";
  });

  await t(11, "审计 — MCP 修改可看 Who/When/What/Source", async () => {
    const tl = await TL.getTimeline(P2.id, { source: "MCP", limit: 100 });
    assert(tl.length > 0, "无 MCP 审计记录");
    const e = tl[0];
    assert(e.source === "MCP" && !!e.actorLabel && !!e.createdAt && !!e.action, "MCP 审计字段不全");
    return `${tl.length} 条 MCP 事件（actor=${e.actorLabel}, action=${e.action}）`;
  });

  await t(12, "并发 — 两个更新同一任务不丢写（乐观锁）", async () => {
    const [cur] = await sql`select version from tasks where id=${task1Id}`;
    const v = cur.version as number;
    await W.updateTask(webActor, task1Id, { progress: 40 }, v); // 甲：命中当前版本
    let conflicted = false;
    try { await W.updateTask(webActor, task1Id, { progress: 60 }, v); } catch (e) { conflicted = /冲突|conflict/i.test((e as Error).message); }
    assert(conflicted, "陈旧版本应触发冲突而非静默覆盖");
    const [after] = await sql`select progress from tasks where id=${task1Id}`;
    assert(after.progress === 40, "被静默丢失（progress 应仍为甲的 40）");
    return "陈旧写被拒绝，未丢更新";
  });
} catch (e) {
  console.error("HARNESS CRASH:", (e as Error)?.message || e);
} finally {
  for (const id of createdProjects) await sql`delete from projects where id = ${id}`.catch(() => {}); // cascades phases/tasks/.../creds/bindings
  for (const id of createdAgents) await sql`delete from agents where id = ${id}`.catch(() => {});
  const leftoverP = await sql`select count(*)::int n from projects where slug like 'acc-p%'`.then((r) => r[0].n);
  const leftoverCred = await sql`select count(*)::int n from mcp_credentials where name like 'acc-%'`.then((r) => r[0].n);
  console.log(`\n[cleanup] leftover acc projects=${leftoverP} creds=${leftoverCred}`);
  await sql.end();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n===== V0.1 验收：${passed}/${results.length} PASS =====`);
const allPass = passed === 12 && results.length === 12;
process.exit(allPass ? 0 : 2);
