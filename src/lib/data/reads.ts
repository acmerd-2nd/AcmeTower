/**
 * V0.3 read convergence — the web read helpers delegate to the SAME HTTPS read
 * layer as /mcp (lib/mcp/httpdata). Same public API/shapes for the pages, but no
 * more Hyperdrive on page loads.
 */
import {
  httpBranchRows,
  httpCheckpointRows,
  httpDecisionRows,
  httpIssueRows,
  httpPhaseRows,
  httpProposalRows,
  httpTaskListRows,
} from "@/lib/mcp/httpdata";
import type { Branch, Decision, Issue, Phase, Proposal, Task } from "@/lib/db/schema";

export async function listPhaseRows(projectId: string): Promise<Phase[]> {
  return httpPhaseRows(projectId);
}

export type TaskRow = Pick<
  Task,
  "id" | "name" | "status" | "progress" | "priority" | "purpose" | "successCriteria" | "phaseId" | "version"
> & { phaseName: string };

export async function listTaskRows(projectId: string): Promise<TaskRow[]> {
  const [tasks, phases] = await Promise.all([httpTaskListRows(projectId), httpPhaseRows(projectId)]);
  const nameOf = new Map(phases.map((p) => [p.id, p.name]));
  return tasks.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    progress: r.progress,
    priority: r.priority,
    purpose: r.purpose,
    successCriteria: r.successCriteria,
    phaseId: r.phaseId,
    version: r.version,
    phaseName: nameOf.get(r.phaseId) ?? "?",
  }));
}

export async function listBranchRows(projectId: string): Promise<Branch[]> {
  return httpBranchRows(projectId);
}

export async function phaseOptions(projectId: string): Promise<Array<{ id: string; name: string }>> {
  return (await httpPhaseRows(projectId)).map((p) => ({ id: p.id, name: p.name }));
}

export async function taskOptions(projectId: string): Promise<Array<{ id: string; name: string }>> {
  return (await httpTaskListRows(projectId)).map((t) => ({ id: t.id, name: t.name }));
}

export async function listIssueRows(projectId: string): Promise<Issue[]> {
  return httpIssueRows(projectId);
}

export async function listDecisionRows(projectId: string): Promise<Decision[]> {
  return httpDecisionRows(projectId);
}

export async function listProposalRows(projectId: string): Promise<Proposal[]> {
  return httpProposalRows(projectId);
}

export async function listCheckpointRows(projectId: string) {
  return httpCheckpointRows(projectId);
}
