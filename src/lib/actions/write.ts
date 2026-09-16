"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWebActor } from "@/lib/core/actor";
import {
  closeBranch,
  createBranch,
  createCheckpoint,
  createDecision,
  createIssue,
  createPhase,
  createProposal,
  createTask,
  decideDecision,
  decideProposal,
  setIssueStatus,
  setCurrentPhase,
  setCurrentTask,
  setBranchStatus,
  setPhaseStatus,
  setTaskStatus,
  softDeletePhase,
  softDeleteTask,
  updatePhase,
  updateTask,
  upsertNorthStar,
} from "@/lib/data/writes";

function errPath(projectId: string, seg: string, msg: string) {
  return `/projects/${projectId}/${seg}?error=${encodeURIComponent(msg)}`;
}
function refresh(projectId: string, seg: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/${seg}`);
}
const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return v == null ? "" : String(v).trim();
};

// ───────────── Phase ─────────────
export async function phaseAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  const intent = s(fd, "_action");
  try {
    if (intent === "add") {
      await createPhase(actor, {
        projectId,
        name: s(fd, "name"),
        goal: s(fd, "goal") || null,
        successCriteria: s(fd, "successCriteria") || null,
        scope: s(fd, "scope") || null,
      });
    } else if (intent === "status") {
      await setPhaseStatus(actor, s(fd, "id"), s(fd, "to") as never);
    } else if (intent === "current") {
      await setCurrentPhase(actor, projectId, s(fd, "id"));
    } else if (intent === "delete") {
      await softDeletePhase(actor, s(fd, "id"));
    }
    refresh(projectId, "roadmap");
  } catch (e) {
    redirect(errPath(projectId, "roadmap", (e as Error).message ?? "操作失败"));
  }
}

// ───────────── Task ─────────────
export async function taskAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  const intent = s(fd, "_action");
  try {
    if (intent === "add") {
      await createTask(actor, {
        projectId,
        phaseId: s(fd, "phaseId"),
        name: s(fd, "name"),
        purpose: s(fd, "purpose") || null,
        successCriteria: s(fd, "successCriteria") || null,
        priority: (s(fd, "priority") || "MEDIUM") as never,
      });
    } else if (intent === "status") {
      await setTaskStatus(actor, s(fd, "id"), s(fd, "to") as never);
    } else if (intent === "progress") {
      await updateTask(actor, s(fd, "id"), { progress: Number(s(fd, "progress")) });
    } else if (intent === "current") {
      await setCurrentTask(actor, projectId, s(fd, "id"));
    } else if (intent === "delete") {
      await softDeleteTask(actor, s(fd, "id"));
    }
    refresh(projectId, "tasks");
  } catch (e) {
    redirect(errPath(projectId, "tasks", (e as Error).message ?? "操作失败"));
  }
}

// ───────────── Branch ─────────────
export async function branchAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  const intent = s(fd, "_action");
  try {
    if (intent === "add") {
      const [st, sid] = s(fd, "source").split(":");
      const [rt, rid] = s(fd, "returnPoint").split(":");
      await createBranch(actor, {
        projectId,
        sourceType: (st || "TASK") as never,
        sourceId: sid || s(fd, "sourceId"),
        name: s(fd, "name"),
        reason: s(fd, "reason"),
        goal: s(fd, "goal"),
        successCriteria: s(fd, "successCriteria") || null,
        returnPointType: (rt || "TASK") as never,
        returnPointId: rid || sid,
      });
    } else if (intent === "status") {
      await setBranchStatus(actor, s(fd, "id"), s(fd, "to") as never);
    } else if (intent === "close") {
      await closeBranch(actor, s(fd, "id"), s(fd, "resolution"));
    }
    refresh(projectId, "branches");
  } catch (e) {
    redirect(errPath(projectId, "branches", (e as Error).message ?? "操作失败"));
  }
}

// ───────────── North Star (Web = human governance) ─────────────
export async function northStarAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    await upsertNorthStar(actor, projectId, {
      name: s(fd, "name") || null,
      description: s(fd, "description") || null,
      finalGoal: s(fd, "finalGoal") || null,
      deliverable: s(fd, "deliverable") || null,
      successCriteria: s(fd, "successCriteria") || null,
      nonGoals: s(fd, "nonGoals") || null,
      constraints: s(fd, "constraints") || null,
    });
    refresh(projectId, "settings");
  } catch (e) {
    redirect(errPath(projectId, "settings", (e as Error).message ?? "操作失败"));
  }
}

const lines = (fd: FormData, k: string) =>
  (fd.get(k) ? String(fd.get(k)) : "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

// ───────────── Issue ─────────────
export async function issueAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  const intent = s(fd, "_action");
  try {
    if (intent === "add") {
      await createIssue(actor, {
        projectId,
        title: s(fd, "title"),
        description: s(fd, "description") || null,
        severity: (s(fd, "severity") || "MEDIUM") as never,
        relatedTaskId: s(fd, "relatedTaskId") || null,
        relatedPhaseId: s(fd, "relatedPhaseId") || null,
      });
    } else if (intent === "status") {
      await setIssueStatus(actor, s(fd, "id"), s(fd, "to") as never, s(fd, "resolution") || undefined);
    }
    refresh(projectId, "issues");
  } catch (e) {
    redirect(errPath(projectId, "issues", (e as Error).message ?? "操作失败"));
  }
}

// ───────────── Decision ─────────────
export async function decisionAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  const intent = s(fd, "_action");
  try {
    if (intent === "add") {
      await createDecision(actor, {
        projectId,
        title: s(fd, "title"),
        decision: s(fd, "decision"),
        reason: s(fd, "reason") || null,
        alternatives: s(fd, "alternatives") || null,
        impact: s(fd, "impact") || null,
      });
    } else if (intent === "status") {
      await decideDecision(actor, s(fd, "id"), s(fd, "to") as never);
    }
    refresh(projectId, "decisions");
  } catch (e) {
    redirect(errPath(projectId, "decisions", (e as Error).message ?? "操作失败"));
  }
}

// ───────────── Proposal / Parking Lot ─────────────
export async function proposalAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  const intent = s(fd, "_action");
  try {
    if (intent === "add") {
      await createProposal(actor, {
        projectId,
        kind: (s(fd, "kind") || "OTHER") as never,
        title: s(fd, "title"),
        reason: s(fd, "reason") || null,
        description: s(fd, "description") || null,
        impact: s(fd, "impact") || null,
        relatedTaskId: s(fd, "relatedTaskId") || null,
      });
    } else if (intent === "status") {
      await decideProposal(actor, s(fd, "id"), s(fd, "to") as never);
    }
    refresh(projectId, "proposals");
  } catch (e) {
    redirect(errPath(projectId, "proposals", (e as Error).message ?? "操作失败"));
  }
}

// ───────────── Checkpoint ─────────────
export async function checkpointAction(fd: FormData) {
  const actor = await requireWebActor();
  const projectId = s(fd, "projectId");
  try {
    await createCheckpoint(actor, {
      projectId,
      summary: s(fd, "summary"),
      taskId: s(fd, "taskId") || null,
      completedItems: lines(fd, "completedItems"),
      unfinishedItems: lines(fd, "unfinishedItems"),
      currentStatus: s(fd, "currentStatus") || null,
      nextAction: s(fd, "nextAction") || null,
    });
    refresh(projectId, "checkpoints");
  } catch (e) {
    redirect(errPath(projectId, "checkpoints", (e as Error).message ?? "操作失败"));
  }
}
