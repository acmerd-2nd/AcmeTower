import {
  branchStatus,
  decisionStatus,
  issueStatus,
  phaseStatus,
  proposalStatus,
  taskStatus,
} from "@/lib/db/schema";

type TaskSt = (typeof taskStatus.enumValues)[number];
type PhaseSt = (typeof phaseStatus.enumValues)[number];
type BranchSt = (typeof branchStatus.enumValues)[number];
type IssueSt = (typeof issueStatus.enumValues)[number];
type DecisionSt = (typeof decisionStatus.enumValues)[number];
type ProposalSt = (typeof proposalStatus.enumValues)[number];

// v0.1设计文档 §51 Task / §52 Branch / §53 Proposal / §54 Decision.
export const TASK_TRANSITIONS: Record<TaskSt, TaskSt[]> = {
  TODO: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "COMPLETED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: ["TODO"],
};

export const PHASE_TRANSITIONS: Record<PhaseSt, PhaseSt[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["BLOCKED", "COMPLETED", "CANCELLED"],
  BLOCKED: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: ["PLANNED"],
};

export const BRANCH_TRANSITIONS: Record<BranchSt, BranchSt[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "ABANDONED"],
  IN_PROGRESS: ["BLOCKED", "RESOLVED", "ABANDONED"],
  BLOCKED: ["IN_PROGRESS", "RESOLVED", "ABANDONED"],
  RESOLVED: [],
  ABANDONED: [],
};

export const DECISION_TRANSITIONS: Record<DecisionSt, DecisionSt[]> = {
  PROPOSED: ["APPROVED", "REJECTED"],
  APPROVED: ["SUPERSEDED"],
  REJECTED: [],
  SUPERSEDED: [],
};

export const PROPOSAL_TRANSITIONS: Record<ProposalSt, ProposalSt[]> = {
  PENDING: ["APPROVED", "REJECTED", "PARKED"],
  APPROVED: [],
  REJECTED: [],
  PARKED: ["PENDING"],
};

export const ISSUE_TRANSITIONS: Record<IssueSt, IssueSt[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "WONT_FIX"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "WONT_FIX"],
  RESOLVED: ["OPEN"],
  WONT_FIX: ["OPEN"],
};

/** A no-op (same status) is always allowed; otherwise the edge must exist. */
export function canTransit<S extends string>(
  table: Record<S, S[]>,
  from: S,
  to: S,
): boolean {
  return from === to || (table[from]?.includes(to) ?? false);
}

export class InvalidTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`非法状态转换：${entity} ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransit<S extends string>(
  entity: string,
  table: Record<S, S[]>,
  from: S,
  to: S,
) {
  if (!canTransit(table, from, to)) throw new InvalidTransitionError(entity, from, to);
}
