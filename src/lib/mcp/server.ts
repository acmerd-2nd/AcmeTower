/**
 * The AcmeTower MCP gateway (v0.1设计文档 §30–§31).
 *
 * ONE logical MCP server at /mcp serves MANY projects — the caller's bearer token
 * decides which project it sees (§42, §45). The /mcp route verifies the token and
 * hands us the principal via ctx.authInfo.
 *
 * WHY hand-rolled instead of @modelcontextprotocol/server's createMcpHandler /
 * WebStandardStreamableHTTPServerTransport:
 * Those are session- and stream-oriented. On Cloudflare/workerd they proved
 * unusable for us — a long-lived SSE body or a per-request server/transport
 * lifecycle left the isolate in a state where the *next* request intermittently
 * died with HTTP 1101 ("hung"/"threw exception"), even when that next request was
 * trivial. Under `next dev`/Node it survived, which is why §82 passed locally but
 * not deployed. An MCP "stateless" exchange is, at the wire level, just JSON-RPC
 * over POST, so we serve the handful of methods we actually use directly and
 * return a fully-buffered `application/json` (or a 202) every time — no open
 * stream, no keep-alive timer, no server/transport lifecycle to leak. This is
 * entirely stateless: each request carries only the bearer-authenticated principal
 * already resolved by the route.
 */
import { z } from "zod";
import { hasPermission, type McpPrincipal } from "@/lib/mcp/principal";
import type { McpToolSpec } from "@/lib/mcp/tools";

const LATEST_PROTOCOL = "2025-11-25";
const SUPPORTED_PROTOCOLS = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"]);

type Json = Record<string, unknown>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);

function inputSchema(schema: z.ZodTypeAny): unknown {
  try {
    return z.toJSONSchema(schema, { target: "draft-7" });
  } catch {
    try {
      return z.toJSONSchema(schema);
    } catch {
      return { type: "object", properties: {} };
    }
  }
}

const allowedTools = (p: McpPrincipal, tools: McpToolSpec[]) =>
  tools.filter((s) => hasPermission(p.permissionLevel, s.required));

/** A single JSON-RPC message → HTTP Response (null for notifications). */
async function serveMessage(msg: Json, principal: McpPrincipal, tools: McpToolSpec[]): Promise<Response | null> {
  const method = msg.method as string | undefined;
  const id = msg.id; // undefined for notifications
  const params = (msg.params ?? {}) as Json;
  const isRequest = id !== undefined;

  switch (method) {
    case "initialize": {
      const requested = (params.protocolVersion as string | undefined) ?? LATEST_PROTOCOL;
      const negotiated = SUPPORTED_PROTOCOLS.has(requested) ? requested : LATEST_PROTOCOL;
      return rpcResult(id, {
        protocolVersion: negotiated,
        capabilities: { tools: {} },
        serverInfo: { name: "acmetower-mcp", version: "0.1.0" },
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: allowedTools(principal, tools).map((s) => ({
          name: s.name,
          title: s.title,
          description: s.description,
          inputSchema: inputSchema(s.input),
          annotations: { readOnlyHint: s.readOnly, destructiveHint: false, idempotentHint: s.readOnly, openWorldHint: false },
        })),
      });

    case "tools/call": {
      const name = params.name as string;
      const args = (params.arguments ?? {}) as Json;
      const spec = allowedTools(principal, tools).find((s) => s.name === name);
      if (!spec) {
        return rpcError(id, -32602, `tool not found: ${String(name)}`);
      }
      let parsedArgs: unknown = args;
      try {
        parsedArgs = spec.input.parse(args);
      } catch (e) {
        return rpcResult(id, {
          content: [{ type: "text", text: `invalid arguments for ${name}: ${(e as Error).message ?? "error"}` }],
          isError: true,
        });
      }
      try {
        // Tool DB access is now HTTPS/PostgREST: reads retry inside lib/mcp/rest.ts,
        // writes run exactly once (non-idempotent). No outer retry layer.
        const data = await spec.run(parsedArgs, principal);
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (e) {
        return rpcResult(id, { content: [{ type: "text", text: `${name} failed: ${(e as Error).message ?? "error"}` }], isError: true });
      }
    }

    // Declared no-op capability lists so well-behaved clients that probe them get empty.
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });

    // Notifications (no id): acknowledge with 202 and nothing to send back.
    default:
      if (!isRequest) return new Response(null, { status: 202 });
      return rpcError(id, -32601, `method not found: ${String(method)}`);
  }
}

/** Route-facing entry. */
export async function handleMcp(req: Request, principal: McpPrincipal | null): Promise<Response> {
  if (!principal) return rpcError(null, -32001, "unauthorized", 401);

  // Stateless: no server-initiated SSE channel, and no session to terminate.
  if (req.method === "GET") return new Response("Method not allowed.", { status: 405, headers: { allow: "POST, DELETE, OPTIONS" } });
  if (req.method === "DELETE") return new Response(null, { status: 200 });
  if (req.method !== "POST") return new Response("Method not allowed.", { status: 405, headers: { allow: "POST, DELETE, OPTIONS" } });

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return rpcError(null, -32700, "could not read request body", 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return rpcError(null, -32700, "parse error: invalid JSON", 400);
  }

  const msgs: Json[] = Array.isArray(parsed) ? (parsed as Json[]) : [parsed as Json];
  const needsTools = msgs.some((m) => m.method === "tools/list" || m.method === "tools/call");
  const tools: McpToolSpec[] = needsTools ? (await import("@/lib/mcp/tools")).MCP_TOOLS : [];
  const responses = await Promise.all(msgs.map((m) => serveMessage(m, principal, tools)));

  if (Array.isArray(parsed)) {
    const bodies = responses.filter((r): r is Response => r !== null);
    if (bodies.length === 0) return new Response(null, { status: 202 });
    // Batch: one combined JSON-RPC array.
    const combined = await Promise.all(bodies.map(async (b) => await b.json()));
    return json(combined);
  }
  return responses[0] ?? new Response(null, { status: 202 });
}
