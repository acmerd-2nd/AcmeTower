/**
 * Unified MCP endpoint — https://<domain>/mcp (v0.1设计文档 §30, §42).
 *
 * Mounts the SDK's web-standard MCP handler behind the official Bearer-auth gate.
 * The request pipeline realizes the auth chain:
 *   1. (prod) Host-header / DNS-rebinding guard when APP_URL is configured
 *   2. requireBearerAuth → mcpTokenVerifier resolves Token → Project + Permission
 *      (returns a 401 WWW-Authenticate challenge on failure)
 *   3. hand the verified AuthInfo to createMcpHandler, whose per-request factory
 *      exposes only the Permission-appropriate Tools
 *
 * Handles POST (JSON-RPC), GET (legacy SSE), DELETE (session teardown); OPTIONS
 * answers CORS preflight.
 */
import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { mcpHandler } from "@/lib/mcp/server";
import { mcpTokenVerifier } from "@/lib/mcp/verifier";

export const dynamic = "force-dynamic";

const gate = requireBearerAuth({ verifier: mcpTokenVerifier });

function hostGuardRejected(req: Request): Response | undefined {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return undefined; // dev/preview: skip, avoids self-lockout
  try {
    const host = new URL(appUrl).hostname;
    return hostHeaderValidationResponse(req, [host, ...localhostAllowedHostnames()]);
  } catch {
    return undefined;
  }
}

async function handle(req: Request): Promise<Response> {
  const rejected = hostGuardRejected(req);
  if (rejected) return rejected;

  const auth = await gate(req);
  if (auth instanceof Response) return auth; // 401 / 403 challenge

  return mcpHandler.fetch(req, { authInfo: auth });
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { allow: "GET, POST, DELETE, OPTIONS" },
  });
}
