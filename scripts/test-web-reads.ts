// V0.3 web-READ convergence smoke (Surface D): the Agents / Credentials page reads
// now go over the SAME HTTPS PostgREST read layer as /mcp — no Hyperdrive on page
// load. This exercises lib/data/agents + lib/data/credentials reads against a throw
// away project with a real bound agent + credential, and asserts shapes, Date
// timestamps, correct permission enums, agent-name joins, unbound filtering, and
// that token_hash NEVER leaves the read layer.
//
// Run:  npx tsx scripts/test-web-reads.ts   (needs .env.local with DATABASE_URL +
//   SUPABASE_URL + SUPABASE_SECRET_KEY).
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
const AG = await import("@/lib/data/agents");
const CR = await import("@/lib/data/credentials");

const sql = postgres(env.DATABASE_URL, { ssl: { require: true }, max: 1, connect_timeout: 25 });
const human = { actorType: "HUMAN", actorLabel: "web-read-test", source: "WEB" } as const;
const rnd = randomBytes(3).toString("hex");

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
};

const proj = await P.createProject({ name: `wr ${rnd}`, slug: `wr-${rnd}` });
const agentName = `ag-${rnd}`;
const { agent } = await AG.createAndBindAgent(human, {
  projectId: proj.id,
  name: agentName,
  provider: "OpenAI",
  description: "smoke agent",
  role: "Developer",
  permissionLevel: "WORKING_WRITE",
});
const { row: credRow } = await CR.createCredential(human, {
  projectId: proj.id,
  name: "conn",
  permissionLevel: "WORKING_WRITE",
  agentId: agent.id,
});

try {
  // listProjectAgents: shape, permission enum, enabled default, provider/desc join.
  const bound = await AG.listProjectAgents(proj.id);
  const me = bound.find((r) => r.agentId === agent.id);
  check(
    "listProjectAgents 绑定行齐备 (WORKING_WRITE/enabled/provider)",
    !!me && me.name === agentName && me.permissionLevel === "WORKING_WRITE" && me.enabled === true && me.provider === "OpenAI" && me.description === "smoke agent",
  );
  check("listProjectAgents 名称升序", bound.every((r, i) => i === 0 || bound[i - 1].name.localeCompare(r.name) <= 0));

  // projectAgentOptions: {id,name} for the credential binding picker.
  const opts = await CR.projectAgentOptions(proj.id);
  check(
    "projectAgentOptions 含绑定 Agent",
    opts.some((o) => o.id === agent.id && o.name === agentName),
  );

  // boundAgentNames: agentId → name map for labels.
  const names = await AG.boundAgentNames(proj.id);
  check("boundAgentNames 返回 agentId→name", names.get(agent.id) === agentName);

  // unboundAgents: our bound agent must NOT appear (still a live global agent).
  const unbound = await AG.unboundAgents(proj.id);
  check("unboundAgents 过滤掉已绑定 Agent", !unbound.some((a) => a.id === agent.id));

  // listCredentials: newest-first, agent-name join, Date timestamps, token_hash NEVER present.
  const creds = await CR.listCredentials(proj.id);
  const c0 = creds.find((c) => c.id === credRow.id);
  check("listCredentials 命中新建连接", !!c0);
  check(
    "listCredentials 字段/权限/agentName 连接",
    !!c0 && c0.name === "conn" && c0.permissionLevel === "WORKING_WRITE" && c0.agentId === agent.id && c0.agentName === agentName,
  );
  check(
    "listCredentials createdAt 为 Date 且 revokedAt=null",
    !!c0 && c0.createdAt instanceof Date && !Number.isNaN(c0.createdAt.getTime()) && c0.revokedAt === null,
  );
  check(
    "listCredentials 从不返回 token_hash",
    creds.every((c) => !("tokenHash" in c) && !("token_hash" in c)) && typeof c0?.tokenPrefix === "string" && c0!.tokenPrefix.length > 0,
  );
  check("credentialStatus(未过期未撤销) = ACTIVE", c0 ? CR.credentialStatus(c0) === "ACTIVE" : false);
} finally {
  await sql`delete from mcp_credentials where project_id=${proj.id}`.catch(() => {});
  await sql`delete from project_agents where project_id=${proj.id}`.catch(() => {});
  await sql`delete from agents where id=${agent.id}`.catch(() => {});
  await sql`delete from projects where id=${proj.id}`.catch(() => {});
  await sql.end();
}

console.log(`\n===== web-read 冒烟（Surface D）：${failures === 0 ? "PASS" : `FAIL (${failures})`} =====`);
process.exit(failures === 0 ? 0 : 2);
