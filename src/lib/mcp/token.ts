/**
 * MCP bearer-token helpers (v0.1设计文档 §42–§43).
 *
 * A project-scoped connection token is a random opaque string. We store ONLY a
 * SHA-256 hex digest in `mcp_credentials.token_hash`; the plaintext is shown once
 * at creation and never persisted. Verification re-hashes the presented token and
 * looks it up by digest — so a leaked DB never yields usable tokens.
 *
 * Web-Crypto based so it behaves identically on Node (dev) and workerd (Cloudflare).
 */

const TOKEN_PREFIX_LEN = 12; // "oak_" + first random chars, for display only

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Deterministic SHA-256 (lowercase hex) of a token's UTF-8 bytes. */
export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

/** Display prefix of a token (never the whole secret). */
export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX_LEN);
}

/**
 * Mint a fresh high-entropy connection token: `oak_` + 40 hex chars.
 * Step 11 (Agent Connection) calls this; the plaintext is returned to the UI once,
 * only `hashToken()` + `tokenPrefix()` are stored.
 */
export function generateToken(): string {
  const buf = new Uint8Array(20); // 40 hex chars
  crypto.getRandomValues(buf);
  const rand = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `oak_${rand}`;
}
