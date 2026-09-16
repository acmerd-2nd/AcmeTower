import { activityEvents } from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";

export interface Actor {
  actorType: "HUMAN" | "AGENT" | "SYSTEM";
  actorId?: string | null;
  actorLabel?: string | null;
  source: "HUMAN" | "WEB" | "MCP" | "SYSTEM";
}

interface LogInput {
  projectId: string | null;
  actor: Actor;
  action: string; // e.g. TASK_CREATED, TASK_UPDATED, BRANCH_RESOLVED ...
  entityType: string; // project|phase|task|branch|issue|decision|proposal|checkpoint|agent
  entityId?: string | null;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Append an audit/timeline event. Pass the SAME client (db or an open tx) so the
 * event is committed atomically with the mutation it describes (§48–§49, §76).
 */
export async function logActivity(
  db: Pick<Db, "insert">,
  e: LogInput,
): Promise<void> {
  await db.insert(activityEvents).values({
    projectId: e.projectId,
    actorType: e.actor.actorType,
    actorId: e.actor.actorId ?? null,
    actorLabel: e.actor.actorLabel ?? null,
    source: e.actor.source,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    summary: e.summary ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
  });
}
