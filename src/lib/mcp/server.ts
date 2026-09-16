/**
 * The AcmeTower MCP server gateway (v0.1设计文档 §30–§31).
 *
 * ONE logical MCP server at /mcp serves MANY projects — the caller's bearer token
 * decides which project it sees (§42, §45). createMcpHandler invokes this factory
 * once per HTTP request, so we build a fresh, fully-isolated McpServer whose tool
 * surface has already been narrowed to the authenticated principal's permission.
 *
 * The entry itself does no auth; the /mcp route verifies the bearer token and
 * hands us ctx.authInfo (with the principal on .extra).
 */
import { createMcpHandler, McpServer, type McpServerFactory } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { principalFromAuth } from "@/lib/mcp/principal";
import { registerTools } from "@/lib/mcp/tools";

const factory: McpServerFactory = (ctx) => {
  const principal = principalFromAuth(ctx.authInfo);
  if (!principal) {
    // The route always verifies the token first; reaching here means a caller got
    // past the gate without a principal — refuse rather than serve an anonymous server.
    throw new Error("MCP factory invoked without an authenticated principal");
  }
  const server = new McpServer(
    { name: "acmetower-mcp", version: "0.1.0" },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  registerTools(server, principal);
  return server;
};

/** Web-standard handler: `mcpHandler.fetch(request, { authInfo })` per request. */
export const mcpHandler = createMcpHandler(factory);
