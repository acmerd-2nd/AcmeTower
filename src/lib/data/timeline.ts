import { and, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activityEvents } from "@/lib/db/schema";

export type SourceFilter = "ALL" | "HUMAN" | "WEB" | "MCP" | "SYSTEM";

export interface TimelineParams {
  source?: SourceFilter;
  q?: string;
  limit?: number;
}

/** Activity Timeline (v0.1 规格 §50 / §76 / Test 11): who · when · what · source. */
export async function getTimeline(projectId: string, params: TimelineParams = {}) {
  const db = getDb();
  const preds = [eq(activityEvents.projectId, projectId)];
  if (params.source && params.source !== "ALL") preds.push(eq(activityEvents.source, params.source));
  if (params.q?.trim()) {
    const l = `%${params.q.trim()}%`;
    const p = or(like(activityEvents.summary, l), like(activityEvents.action, l));
    if (p) preds.push(p);
  }
  return db
    .select({
      id: activityEvents.id,
      actorType: activityEvents.actorType,
      actorLabel: activityEvents.actorLabel,
      source: activityEvents.source,
      action: activityEvents.action,
      entityType: activityEvents.entityType,
      entityId: activityEvents.entityId,
      summary: activityEvents.summary,
      before: activityEvents.before,
      after: activityEvents.after,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(and(...preds))
    .orderBy(desc(activityEvents.createdAt))
    .limit(params.limit ?? 200);
}

export type TimelineEvent = Awaited<ReturnType<typeof getTimeline>>[number];

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
