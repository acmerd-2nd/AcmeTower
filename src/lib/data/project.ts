import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  agents,
  branches,
  checkpoints,
  decisions,
  issues,
  northStars,
  phases,
  projectAgents,
  projects,
  proposals,
  tasks,
  type Branch,
  type Checkpoint,
  type Decision,
  type NorthStar,
  type Phase,
  type Project,
  type Task,
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

const OPEN_BRANCH = ["OPEN", "IN_PROGRESS", "BLOCKED"] as const;
const OPEN_ISSUE = ["OPEN", "IN_PROGRESS"] as const;

export async function getProjectSpace(projectId: string): Promise<ProjectSpace | null> {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
  if (!project) return null;

  const [
    northStar,
    phaseRows,
    taskRows,
    openBranchRows,
    [issueAgg],
    [proposalAgg],
    decisionRows,
    checkpointRows,
    agentRows,
    currentTaskRow,
  ] = await Promise.all([
    db.select().from(northStars).where(eq(northStars.projectId, projectId)).then((r) => r[0] ?? null),
    db
      .select()
      .from(phases)
      .where(and(eq(phases.projectId, projectId), isNull(phases.deletedAt)))
      .orderBy(asc(phases.orderIndex)),
    db.select().from(tasks).where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))),
    db
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.projectId, projectId),
          inArray(branches.status, [...OPEN_BRANCH]),
          isNull(branches.deletedAt),
        ),
      )
      .orderBy(desc(branches.updatedAt)),
    db
      .select({ n: count() })
      .from(issues)
      .where(and(eq(issues.projectId, projectId), inArray(issues.status, [...OPEN_ISSUE]))),
    db
      .select({ n: count() })
      .from(proposals)
      .where(and(eq(proposals.projectId, projectId), eq(proposals.status, "PENDING"))),
    db
      .select()
      .from(decisions)
      .where(and(eq(decisions.projectId, projectId), isNull(decisions.deletedAt)))
      .orderBy(desc(decisions.updatedAt))
      .limit(5),
    db
      .select({
        c: checkpoints,
        agentName: agents.name,
      })
      .from(checkpoints)
      .leftJoin(agents, eq(agents.id, checkpoints.agentId))
      .where(and(eq(checkpoints.projectId, projectId), isNull(checkpoints.deletedAt)))
      .orderBy(desc(checkpoints.createdAt))
      .limit(3),
    db
      .select({
        id: agents.id,
        name: agents.name,
        provider: agents.provider,
        role: projectAgents.role,
        permissionLevel: projectAgents.permissionLevel,
      })
      .from(projectAgents)
      .innerJoin(agents, eq(agents.id, projectAgents.agentId))
      .where(eq(projectAgents.projectId, projectId)),
    project.currentTaskId
      ? db
          .select({ t: tasks, agentName: agents.name })
          .from(tasks)
          .leftJoin(agents, eq(agents.id, tasks.currentAgentId))
          .where(eq(tasks.id, project.currentTaskId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  // Compose phase nodes with per-phase task rollups.
  const byPhase = new Map<string, Task[]>();
  for (const t of taskRows) {
    const arr = byPhase.get(t.phaseId) ?? [];
    arr.push(t);
    byPhase.set(t.phaseId, arr);
  }
  const phaseNodes: PhaseNode[] = phaseRows.map((p) => {
    const ts = byPhase.get(p.id) ?? [];
    const done = ts.filter((t) => t.status === "COMPLETED").length;
    const progress = ts.length
      ? Math.round(ts.reduce((a, t) => a + t.progress, 0) / ts.length)
      : p.status === "COMPLETED"
        ? 100
        : 0;
    return { ...p, taskCount: ts.length, doneCount: done, progress };
  });

  const currentPhase =
    phaseNodes.find((p) => p.id === project.currentPhaseId) ??
    phaseNodes.find((p) => p.status === "ACTIVE") ??
    phaseNodes[0] ??
    null;

  const currentTask = currentTaskRow ? { ...currentTaskRow.t, agentName: currentTaskRow.agentName } : null;
  const currentBranch = openBranchRows[0] ?? null;

  const mission = buildMission(currentTask, currentPhase, currentBranch);

  return {
    project,
    northStar,
    phases: phaseNodes,
    currentPhase,
    currentTask,
    currentBranch,
    mission,
    signals: {
      openBranches: openBranchRows.length,
      openIssues: issueAgg?.n ?? 0,
      pendingProposals: proposalAgg?.n ?? 0,
      agents: agentRows.map((a) => ({
        id: a.id,
        name: a.name,
        provider: a.provider,
        role: a.role,
        permissionLevel: a.permissionLevel ?? "READ",
      })),
      recentDecisions: decisionRows,
      recentCheckpoints: checkpointRows.map((r) => ({ ...r.c, agentName: r.agentName })),
    },
  };
}

function buildMission(
  task: (Task & { agentName: string | null }) | null,
  phase: PhaseNode | null,
  branch: Branch | null,
): CurrentMission {
  if (branch) {
    return {
      objective: branch.goal,
      successCriteria: branch.successCriteria,
      currentState: `分支「${branch.name}」(${branch.status})：${branch.reason}`,
      doNot: `这是从主线派生的分支，只处理该分支目标；不要改动主线其它任务。`,
      returnTo: `完成后回到 ${branch.returnPointType}（${branch.returnPointId}）`,
      nextAction: branch.status === "OPEN" ? "开始分支调查 / 实验" : "推进分支至 RESOLVED 并记录 resolution",
    };
  }
  if (!task) {
    return {
      objective: phase?.goal ?? null,
      successCriteria: phase?.successCriteria ?? null,
      currentState: phase ? `当前在 ${phase.name}（${phase.status}）` : "尚未设定当前任务",
      doNot: phase?.scope ? `范围约束：${phase.scope}` : "不要扩张到其它 Phase",
      returnTo: null,
      nextAction: "在 Phase 下创建或选择当前任务",
    };
  }
  return {
    objective: task.purpose ?? task.name,
    successCriteria: task.successCriteria,
    currentState: `${task.status} · ${task.progress}%`,
    doNot: phase?.scope ? `范围约束：${phase.scope}` : "不要扩张到当前 Phase/任务范围之外",
    returnTo: null,
    nextAction: task.status === "BLOCKED" ? "解除阻塞" : `推进「${task.name}」`,
  };
}
