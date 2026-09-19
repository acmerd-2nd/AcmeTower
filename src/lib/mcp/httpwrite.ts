/**
 * /mcp write wrappers — principal → shared RPC client (v0.2).
 *
 * The real write logic now lives in lib/data/write-rpc.ts (shared with the web).
 * This layer only adapts an McpPrincipal (which carries projectId + the AGENT
 * actor + agentId) into the (actor, projectId) form write-rpc expects, and keeps
 * the tool-facing function names/shape stable for lib/mcp/tools.ts.
 */
import type { Branch, Checkpoint, Issue, Proposal, Task } from "@/lib/db/schema";
import type { McpPrincipal } from "@/lib/mcp/principal";
import { mcpActor } from "@/lib/mcp/principal";
import {
  rpcCloseBranch,
  rpcCreateBranch,
  rpcCreateCheckpoint,
  rpcCreateIssue,
  rpcCreateProposal,
  rpcSetBranchStatus,
  rpcSetTaskStatus,
  rpcUpdateTask,
  type BranchInput,
  type CheckpointInput,
  type IssueInput,
  type ProposalInput,
} from "@/lib/data/write-rpc";

export type { BranchInput, CheckpointInput, IssueInput, ProposalInput };

const actor = (p: McpPrincipal) => mcpActor(p);

export function httpUpdateTask(p: McpPrincipal, taskId: string, patch: Record<string, unknown>, expectedVersion?: number): Promise<Task> {
  return rpcUpdateTask(actor(p), p.projectId, taskId, patch, expectedVersion);
}
export function httpSetTaskStatus(p: McpPrincipal, taskId: string, to: string): Promise<Task> {
  return rpcSetTaskStatus(actor(p), p.projectId, taskId, to);
}
export function httpCreateBranch(p: McpPrincipal, input: BranchInput): Promise<Branch> {
  return rpcCreateBranch(actor(p), p.projectId, input);
}
export function httpSetBranchStatus(p: McpPrincipal, branchId: string, to: string): Promise<Branch> {
  return rpcSetBranchStatus(actor(p), p.projectId, branchId, to);
}
export function httpCloseBranch(p: McpPrincipal, branchId: string, resolution: string): Promise<Branch> {
  return rpcCloseBranch(actor(p), p.projectId, branchId, resolution);
}
export function httpCreateIssue(p: McpPrincipal, input: IssueInput): Promise<Issue> {
  return rpcCreateIssue(actor(p), p.projectId, input);
}
export function httpCreateCheckpoint(p: McpPrincipal, input: CheckpointInput): Promise<Checkpoint & { agentName: string | null }> {
  // checkpoint's owning agent = the credential's bound agent (principal.agentId).
  return rpcCreateCheckpoint(actor(p), p.projectId, { ...input, agentId: p.agentId });
}
export function httpCreateProposal(p: McpPrincipal, input: ProposalInput): Promise<Proposal> {
  return rpcCreateProposal(actor(p), p.projectId, input);
}
