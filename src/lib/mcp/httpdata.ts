/**
 * HTTPS read + ownership-support layer for the /mcp edge (v0.1 §34–§36, §42).
 *
 * The /mcp gateway runs in the worker, where the Hyperdrive→Postgres TCP tunnel
 * stalls intermittently (HTTP 1101). Everything /mcp needs to READ therefore goes
 * over Supabase PostgREST (Cloudflare's own HTTPS/HTTP-2 path) via lib/core/rest.ts.
 * The web app's READS still use Drizzle/Hyperdrive (V0.1); V0.2 converges its
 * WRITES onto the same RPC functions (lib/data/writes.ts → lib/data/write-rpc.ts).
 *
 * Row → camel mappers live in lib/core/rows.ts (shared with the web write layer).
 */
import { restSelect } from "@/lib/core/rest";
import {
  enc,
  mapBranch,
  mapCheckpoint,
  mapDecision,
  mapIssue,
  mapNorthStar,
  mapPhase,
  mapProject,
  mapProposal,
  mapTask,
  s,
  type Row,
} from "@/lib/core/rows";
import type {
  Branch,
  Checkpoint,
  Decision,
  Issue,
  NorthStar,
  Phase,
  Project,
  Proposal,
  Task,
} from "@/lib/db/schema";
import type { CurrentMission, PhaseNode, ProjectSpace } from "@/lib/data/project";

// ───────────────────────── targeted reads (per tool) ─────────────────────────

export async function httpProjectRow(projectId: string): Promise<Project | null> {
  const rows = await restSelect(`projects`, `id=eq.${enc(projectId)}&deleted_at=is.null&limit=1`);
  return rows[0] ? mapProject(rows[0]) : null;
}

export async function httpTaskRow(projectId: string, taskId: string): Promise<Task | null> {
  const rows = await restSelect(
    `tasks`,
    `id=eq.${enc(taskId)}&project_id=eq.${enc(projectId)}&deleted_at=is.null&limit=1`,
  );
  return rows[0] ? mapTask(rows[0]) : null;
}

/** Task's owning project id (ignoring project filter) — to distinguish NotFound vs Forbidden. */
export async function taskOwner(taskId: string): Promise<string | null> {
  const rows = await restSelect(`tasks`, `id=eq.${enc(taskId)}&limit=1`, { columns: "project_id" });
  return rows[0] ? s(rows[0].project_id) : null;
}

export async function httpPhaseRows(projectId: string): Promise<Phase[]> {
  const rows = await restSelect(`phases`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=order_index.asc`);
  return rows.map(mapPhase);
}

export async function httpTaskListRows(projectId: string): Promise<Task[]> {
  const rows = await restSelect(`tasks`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=created_at.asc`);
  return rows.map(mapTask);
}

export async function httpBranchRows(projectId: string): Promise<Branch[]> {
  const rows = await restSelect(`branches`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=created_at.asc`);
  return rows.map(mapBranch);
}

export async function httpDecisionRows(projectId: string): Promise<Decision[]> {
  const rows = await restSelect(`decisions`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=updated_at.desc`);
  return rows.map(mapDecision);
}

export async function httpIssueRows(projectId: string): Promise<Issue[]> {
  const rows = await restSelect(`issues`, `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=created_at.desc`);
  return rows.map(mapIssue);
}

export async function httpCheckpointRows(projectId: string): Promise<Array<Checkpoint & { agentName: string | null }>> {
  const rows = await restSelect(
    `checkpoints`,
    `project_id=eq.${enc(projectId)}&deleted_at=is.null&order=created_at.desc`,
    { columns: "*,agents(name)" },
  );
  return rows.map((r) => mapCheckpoint(r, ((r as Row).agents as { name?: string } | null)?.name ?? null));
}

export async function httpNorthStar(projectId: string): Promise<NorthStar | null> {
  const rows = await restSelect(`north_star`, `project_id=eq.${enc(projectId)}&limit=1`);
  return rows[0] ? mapNorthStar(rows[0]) : null;
}

export async function httpProposalRows(projectId: string): Promise<Proposal[]> {
  const rows = await restSelect(`proposals`, `project_id=eq.${enc(projectId)}&order=created_at.desc`);
  return rows.map(mapProposal);
}

// ───────────────────────── activity timeline ─────────────────────────
// Mirrors lib/data/timeline.getTimeline (V0.3): project-scoped, optional source
// filter, optional free-text q over summary/action, newest-first, bounded.

export interface TimelineRow {
  id: string;
  actorType: string;
  actorLabel: string | null;
  source: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

const OPEN_TL_SOURCE = new Set(["HUMAN", "WEB", "MCP", "SYSTEM"]);

export async function httpTimeline(
  projectId: string,
  params: { source?: string; q?: string; limit?: number } = {},
): Promise<TimelineRow[]> {
  const preds = [`project_id=eq.${enc(projectId)}`];
  const src = params.source;
  if (src && src !== "ALL" && OPEN_TL_SOURCE.has(src)) preds.push(`source=eq.${enc(src)}`);
  if (params.q?.trim()) {
    const like = `*${params.q.trim()}*`;
    preds.push(`or=(summary.ilike.${like},action.ilike.${like})`);
  }
  const limit = params.limit ?? 200;
  preds.push(`order=created_at.desc`, `limit=${limit}`);
  const rows = await restSelect(
    `activity_events`,
    preds.join("&"),
    { columns: "id,actor_type,actor_label,source,action,entity_type,entity_id,summary,before,after,created_at" },
  );
  return rows.map((r) => ({
    id: String(r.id),
    actorType: String(r.actor_type),
    actorLabel: s(r.actor_label),
    source: String(r.source),
    action: String(r.action),
    entityType: s(r.entity_type),
    entityId: s(r.entity_id),
    summary: s(r.summary),
    before: r.before ?? null,
    after: r.after ?? null,
    createdAt: new Date(String(r.created_at)),
  }));
}

// ───────────────────────── assembled project space ─────────────────────────
// Mirrors lib/data/project.getProjectSpace, but every query is an HTTPS read.

const OPEN_BRANCH = "OPEN,IN_PROGRESS,BLOCKED";
const OPEN_ISSUE = "OPEN,IN_PROGRESS";

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

export async function httpProjectSpace(projectId: string): Promise<ProjectSpace | null> {
  const [project] = await restSelect(`projects`, `id=eq.${enc(projectId)}&deleted_at=is.null&limit=1`);
  if (!project) return null;
  const proj = mapProject(project);
  const p = enc(projectId);

  const [
    northStar,
    phasesMapped,
    tasksMapped,
    openBranchRaw,
    openIssueRaw,
    pendingProposalRaw,
    decisionRaw,
    checkpointRaw,
    agentRaw,
    currentTaskRaw,
  ] = await Promise.all([
    httpNorthStar(projectId),
    restSelect(`phases`, `project_id=eq.${p}&deleted_at=is.null&order=order_index.asc`),
    restSelect(`tasks`, `project_id=eq.${p}&deleted_at=is.null&order=created_at.asc`),
    restSelect(`branches`, `project_id=eq.${p}&status=in.(${OPEN_BRANCH})&deleted_at=is.null&order=updated_at.desc`),
    restSelect(`issues`, `project_id=eq.${p}&status=in.(${OPEN_ISSUE})`, { columns: "id" }),
    restSelect(`proposals`, `project_id=eq.${p}&status=eq.PENDING`, { columns: "id" }),
    restSelect(`decisions`, `project_id=eq.${p}&deleted_at=is.null&order=updated_at.desc&limit=5`),
    restSelect(`checkpoints`, `project_id=eq.${p}&deleted_at=is.null&order=created_at.desc&limit=3`, { columns: "*,agents(name)" }),
    restSelect(`project_agents`, `project_id=eq.${p}`, { columns: "role,permission_level,agents(id,name,provider)" }),
    proj.currentTaskId
      ? restSelect(`tasks`, `id=eq.${enc(String(proj.currentTaskId))}&limit=1`, { columns: "*,agents(name)" }).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const phases = phasesMapped.map(mapPhase);
  const tasks = tasksMapped.map(mapTask);

  const byPhase = new Map<string, Task[]>();
  for (const t of tasks) {
    const arr = byPhase.get(t.phaseId) ?? [];
    arr.push(t);
    byPhase.set(t.phaseId, arr);
  }
  const phaseNodes: PhaseNode[] = phases.map((ph) => {
    const ts = byPhase.get(ph.id) ?? [];
    const done = ts.filter((t) => t.status === "COMPLETED").length;
    const progress = ts.length
      ? Math.round(ts.reduce((a, t) => a + t.progress, 0) / ts.length)
      : ph.status === "COMPLETED"
        ? 100
        : 0;
    return { ...ph, taskCount: ts.length, doneCount: done, progress };
  });

  const openBranches = openBranchRaw.map(mapBranch);
  const currentPhase =
    phaseNodes.find((x) => x.id === proj.currentPhaseId) ??
    phaseNodes.find((x) => x.status === "ACTIVE") ??
    phaseNodes[0] ??
    null;

  let currentTask: (Task & { agentName: string | null }) | null = null;
  if (currentTaskRaw) {
    const agent = (currentTaskRaw as Row).agents as { name?: string } | null;
    currentTask = { ...mapTask(currentTaskRaw), agentName: agent?.name ?? null };
  }
  const currentBranch = openBranches[0] ?? null;
  const mission = buildMission(currentTask, currentPhase, currentBranch);

  return {
    project: proj,
    northStar,
    phases: phaseNodes,
    currentPhase,
    currentTask,
    currentBranch,
    mission,
    signals: {
      openBranches: openBranches.length,
      openIssues: openIssueRaw.length,
      pendingProposals: pendingProposalRaw.length,
      agents: agentRaw.map((a) => {
        const ag = (a as Row).agents as { id?: string; name?: string; provider?: string | null } | null;
        return {
          id: s(ag?.id) ?? "",
          name: s(ag?.name) ?? "",
          provider: ag?.provider != null ? String(ag.provider) : null,
          role: (a as Row).role != null ? String((a as Row).role) : null,
          permissionLevel: s((a as Row).permission_level) ?? "READ",
        };
      }),
      recentDecisions: decisionRaw.map(mapDecision),
      recentCheckpoints: checkpointRaw.map((r) => mapCheckpoint(r, ((r as Row).agents as { name?: string } | null)?.name ?? null)),
    },
  };
}
