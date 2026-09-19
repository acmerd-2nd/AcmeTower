import { httpTimeline, type TimelineRow } from "@/lib/mcp/httpdata";

export type SourceFilter = "ALL" | "HUMAN" | "WEB" | "MCP" | "SYSTEM";

export interface TimelineParams {
  source?: SourceFilter;
  q?: string;
  limit?: number;
}

/**
 * Activity Timeline (v0.1 规格 §50 / §76 / Test 11): who · when · what · source.
 * V0.3 — delegates to the shared HTTPS read layer (lib/mcp/httpdata.httpTimeline),
 * so the timeline page no longer touches Hyperdrive.
 */
export async function getTimeline(projectId: string, params: TimelineParams = {}): Promise<TimelineRow[]> {
  return httpTimeline(projectId, params);
}

export type TimelineEvent = TimelineRow;

/** entityType → in-project section route (best-effort deep link). */
export function entityTypeHref(projectId: string, type: string | null): string | null {
  if (!type) return null;
  const map: Record<string, string> = {
    phase: "roadmap",
    task: "tasks",
    branch: "branches",
    decision: "decisions",
    issue: "issues",
    proposal: "proposals",
    checkpoint: "checkpoints",
    north_star: "settings",
    agent: "agents",
  };
  const seg = map[type];
  return seg ? `/projects/${projectId}/${seg}` : `/projects/${projectId}`;
}
