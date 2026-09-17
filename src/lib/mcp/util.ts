/** Small shared helpers for the MCP layer. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `s` is a canonical UUID (used to tell entity ids from free text). */
export function isUuid(s: string | null | undefined): s is string {
  return !!s && UUID_RE.test(s);
}
