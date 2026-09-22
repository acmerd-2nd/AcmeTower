/**
 * 一次性探针：用给定 MCP 令牌调用 project_get_context，打印完整 JSON，
 * 用于人工核对 §34 增强（scope / next_actions / open_issues 列表）是否在真实 /mcp 输出里。
 * 运行：
 *   MCP_TOKEN=xxx ACC_KEEP_PROXY=1 NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
 *     npx tsx scripts/probe-context.ts https://project.acmerd.com
 */
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const BASE = (process.argv[2] || "https://project.acmerd.com").replace(/\/+$/, "");
const token = process.env.MCP_TOKEN;
if (!token) {
  console.error("缺少 MCP_TOKEN 环境变量");
  process.exit(2);
}

const client = new Client({ name: "probe-context", version: "0" });
const tr = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
  requestInit: { headers: { authorization: `Bearer ${token}` } },
});
await client.connect(tr);

const res = await client.callTool({ name: "project_get_context", arguments: {} });
const text = (res.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text ?? "";
let parsed: unknown;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = text;
}
console.log(JSON.stringify(parsed, null, 2));
await client.close();
