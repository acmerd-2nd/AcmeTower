/**
 * `project_check_drift` — rule-based scope-drift triage (§40–§41).
 *
 * V0.1 explicitly does NOT use an AI model here; it uses transparent rules over
 * the project's own governance text: North Star non-goals, the current phase's
 * scope, and other phases' scopes. Given what the agent is doing now and what it
 * is about to do, it answers { risk, is_drift, reason, recommended_action } so the
 * agent can decide to CONTINUE, open a BRANCH, file a PROPOSAL, or ASK_HUMAN.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { tasks, type Task } from "@/lib/db/schema";
import { getProjectSpace } from "@/lib/data/project";
import { isUuid } from "@/lib/mcp/util";

const STOP = new Set([
  "the","and","for","with","this","that","from","into","your","our","are","was","will",
  "add","make","create","build","implement","work","task","need","should","could","would",
  "about","them","they","their","have","has","not","but","you","all","any","use","using",
]);

function tokens(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9一-龥\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((w) => b.has(w));
}

export interface DriftResult {
  risk: "LOW" | "MEDIUM" | "HIGH";
  is_drift: boolean;
  reason: string;
  recommended_action: "CONTINUE" | "BRANCH" | "PROPOSAL" | "ASK_HUMAN";
  signals: { non_goals: string[]; other_phase: string | null; within_scope: string[] };
}

/** Assess whether `proposed_work` drifts from the agent's current position. */
export async function assessDrift(
  projectId: string,
  input: { currentTask: string; proposedWork: string },
): Promise<DriftResult> {
  const space = await getProjectSpace(projectId);
  const proposed = tokens(input.proposedWork);

  // Anchor = the current task/phase text. currentTask may be a task id or free text.
  const anchorParts: string[] = [];
  let currentPhaseName: string | null = null;
  if (isUuid(input.currentTask)) {
    const [t] = await getDb().select().from(tasks).where(eq(tasks.id, input.currentTask));
    const task: Task | undefined = t;
    if (task && task.projectId === projectId) {
      anchorParts.push(task.name, task.purpose ?? "", task.successCriteria ?? "");
    }
  } else {
    anchorParts.push(input.currentTask);
  }
  const phase = space?.phases.find((p) => p.id === space.currentPhase?.id) ?? space?.currentPhase ?? null;
  if (phase) {
    currentPhaseName = phase.name;
    anchorParts.push(phase.name, phase.scope ?? "", phase.goal ?? "");
  }
  if (space?.mission.doNot) anchorParts.push(space.mission.doNot);
  const anchor = tokens(anchorParts.join(" "));

  const nonGoals = tokens(space?.northStar?.nonGoals);
  const nonGoalHits = overlap(proposed, nonGoals);

  // Does the proposal belong to some OTHER phase's scope? (classic Billing-vs-Auth drift)
  let otherPhase: string | null = null;
  let otherPhaseHits: string[] = [];
  if (space) {
    for (const p of space.phases) {
      if (p.id === phase?.id) continue;
      const hits = overlap(proposed, tokens(`${p.name} ${p.scope ?? ""} ${p.goal ?? ""}`));
      if (hits.length > otherPhaseHits.length) {
        otherPhaseHits = hits;
        otherPhase = p.name;
      }
    }
  }

  const within = overlap(proposed, anchor);

  const signals = { non_goals: nonGoalHits, other_phase: otherPhaseHits.length ? otherPhase : null, within_scope: within };

  // Rules, most severe first.
  if (nonGoalHits.length >= 1) {
    return {
      risk: "HIGH",
      is_drift: true,
      reason: `提议触及 North Star 明确的非目标/禁区（${nonGoalHits.join("、")}）。这是治理层决定，不应由 Agent 直接实施。`,
      recommended_action: "ASK_HUMAN",
      signals,
    };
  }
  if (otherPhaseHits.length >= 2 && within.length < 2) {
    return {
      risk: "HIGH",
      is_drift: true,
      reason: `提议主要指向另一个 Phase「${otherPhase}」的范围，而非当前工作。`,
      recommended_action: "BRANCH",
      signals,
    };
  }
  if (within.length >= 2) {
    return {
      risk: "LOW",
      is_drift: false,
      reason: "提议与当前任务/阶段范围一致，属于正常推进。",
      recommended_action: "CONTINUE",
      signals,
    };
  }
  // No overlap with current scope, no non-goal, no other phase → new but adjacent concern.
  return {
    risk: "MEDIUM",
    is_drift: true,
    reason: "提议落在当前任务范围之外，但未触碰禁区——很可能是范围扩张。",
    recommended_action: "PROPOSAL",
    signals,
  };
}
