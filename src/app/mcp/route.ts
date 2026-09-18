/**
 * Unified MCP endpoint — https://<domain>/mcp (v0.1设计文档 §30, §42).
 *
 * Realizes the auth chain at the edge, hand-rolled (no @modelcontextprotocol/server
 * runtime):
 *   1. (prod) Host-header / DNS-rebinding guard when APP_URL is configured
 *   2. Bearer token → resolveMcpPrincipal (Token → Project + Permission); 401 on miss
 *   3. verified principal handed to the stateless JSON-RPC gateway (lib/mcp/server.ts)
 */
import { handleMcp } from "@/lib/mcp/server";
import { bearerFromHeader, resolveMcpPrincipal } from "@/lib/mcp/verifier";

export const dynamic = "force-dynamic";

function hostGuardRejected(req: Request): Response | undefined {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return undefined; // dev/preview: skip, avoids self-lockout
  try {
    const expected = new URL(appUrl).hostname;
    const got = new URL(req.url).hostname;
    if (got === expected || got === "localhost" || got === "127.0.0.1") return undefined;
    return new Response("Bad Request: host not allowed", { status: 400 });
  } catch {
    return undefined;
  }
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "invalid_token" } }),
    { status: 401, headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="acmetower"' } },
  );
}

async function handle(req: Request): Promise<Response> {
  const rejected = hostGuardRejected(req);
  if (rejected) return rejected;

  try {
    const principal = await resolveMcpPrincipal(bearerFromHeader(req.headers.get("authorization")));
    if (!principal) return unauthorized();

    return await handleMcp(req, principal);
  } catch {
    // Backing store transiently unavailable (e.g. a retry-exhausted Hyperdrive
    // stall): a clean JSON-RPC 503 + Retry-After so clients back off and retry,
    // instead of surfacing a raw runtime error.
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "service unavailable" } }),
      { status: 503, headers: { "content-type": "application/json", "retry-after": "2" } },
    );
  }
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { allow: "GET, POST, DELETE, OPTIONS" } });
}
