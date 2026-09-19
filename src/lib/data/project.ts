import { httpProjectSpace } from "@/lib/mcp/httpdata";
import type {
  Branch,
  Checkpoint,
  Decision,
  NorthStar,
  Phase,
  Project,
  Task,
} from "@/lib/db/schema";

export interface PhaseNode extends Phase {
  taskCount: number;
  doneCount: number;
  progress: number; // avg of tasks, 0–100
}

export interface CurrentMission {
  objective: string | null;
  successCriteria: string | null;
  currentState: string | null;
  doNot: string | null;
  returnTo: string | null;
  nextAction: string | null;
}

export interface ProjectSpace {
  project: Project;
  northStar: NorthStar | null;
  phases: PhaseNode[];
  currentPhase: PhaseNode | null;
  currentTask: (Task & { agentName: string | null }) | null;
  currentBranch: Branch | null;
  mission: CurrentMission;
  signals: {
    openBranches: number;
    openIssues: number;
    pendingProposals: number;
    agents: {
      id: string;
      name: string;
      provider: string | null;
      role: string | null; // project_agents.role (binding)
      permissionLevel: string;
    }[];
    recentDecisions: Decision[];
    recentCheckpoints: (Checkpoint & { agentName: string | null })[];
  };
}

/**
 * V0.3 read convergence — the web dashboard read now shares the SAME HTTPS read
 * layer as /mcp (lib/mcp/httpdata.httpProjectSpace), so page loads no longer hit
 * the flaky Hyperdrive TCP tunnel. The interfaces above remain the single
 * definition httpdata's assembler imports; the query+compose lives there.
 */
export function getProjectSpace(projectId: string): Promise<ProjectSpace | null> {
  return httpProjectSpace(projectId);
}
