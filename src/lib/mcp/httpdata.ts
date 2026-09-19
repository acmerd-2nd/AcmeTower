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
  n,
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
import type { ProjectCard, ProjectStatusFilter } from "@/lib/data/projects";

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

// ───────────────────────── project cards (Surface E) ─────────────────────────
// Mirrors lib/data/projects.listProjectCards (Project Home) as an HTTPS aggregate:
// one filtered projects read, then batched per-project rollups over `in.(ids)`.
// Count semantics intentionally match the prior SQL: branch/issue open-counts do
// NOT filter soft-deletes, task avg-progress DOES, current-task/agent joins don't.

export async function httpProjectCards(
  params: { q?: string; status?: ProjectStatusFilter } = {},
): Promise<ProjectCard[]> {
  const pp = ["deleted_at=is.null"];
  switch (params.status) {
    case "ACTIVE":
      pp.push("status=eq.ACTIVE");
      break;
    case "PAUSED":
      pp.push("status=eq.PAUSED");
      break;
    case "COMPLETED":
      pp.push("status=eq.COMPLETED");
      break;
    case "ARCHIVED":
      pp.push("status=eq.ARCHIVED");
      break;
    case "RISK":
      pp.push("health=neq.GREEN");
      break;
    default:
      break; // ALL
  }
  if (params.q?.trim()) {
    const like = `*${params.q.trim()}*`;
    pp.push(`or=(name.ilike.${like},description.ilike.${like})`);
  }
  pp.push("order=updated_at.desc");
  const projRows = await restSelect(
    "projects",
    pp.join("&"),
    { columns: "id,name,slug,icon,description,status,health,current_phase_id,current_task_id,updated_at" },
  );
  if (projRows.length === 0) return [];

  const ids = projRows.map((r) => String((r as Row).id));
  const idIn = `in.(${ids.join(",")})`;

  // current-task ids → task name + owning agent (unsoft-delete-filtered, as in SQL).
  const currentTaskIds = projRows
    .map((r) => s((r as Row).current_task_id))
    .filter((x): x is string => !!x);
  const [branchRows, issueRows, taskRows, phaseRows, curTaskRows] = await Promise.all([
    restSelect("branches", `project_id=${idIn}&status=in.(OPEN,IN_PROGRESS,BLOCKED)`, { columns: "project_id" }),
    restSelect("issues", `project_id=${idIn}&status=in.(OPEN,IN_PROGRESS)`, { columns: "project_id" }),
    restSelect("tasks", `project_id=${idIn}&deleted_at=is.null`, { columns: "project_id,progress" }),
    restSelect("phases", `project_id=${idIn}&deleted_at=is.null&order=order_index.asc`, {
      columns: "id,project_id,name,order_index",
    }),
    currentTaskIds.length
      ? restSelect("tasks", `id=in.(${currentTaskIds.join(",")})`, { columns: "id,name,current_agent_id" })
      : Promise.resolve([] as Row[]),
  ]);

  // agents for the current tasks (unsoft-delete-filtered).
  const curAgentIds = curTaskRows
    .map((r) => s((r as Row).current_agent_id))
    .filter((x): x is string => !!x);
  const agentRows = curAgentIds.length
    ? await restSelect("agents", `id=in.(${curAgentIds.join(",")})`, { columns: "id,name" })
    : [];

  const countByProject = (rows: Row[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(String(r.project_id), (m.get(String(r.project_id)) ?? 0) + 1);
    return m;
  };
  const branchMap = countByProject(branchRows);
  const issueMap = countByProject(issueRows);

  const progSum = new Map<string, { sum: number; n: number }>();
  for (const r of taskRows) {
    const pid = String((r as Row).project_id);
    const a = progSum.get(pid) ?? { sum: 0, n: 0 };
    a.sum += n((r as Row).progress);
    a.n += 1;
    progSum.set(pid, a);
  }

  const phasesByProject = new Map<string, Array<{ id: string; name: string; orderIndex: number }>>();
  for (const r of phaseRows) {
    const pid = String((r as Row).project_id);
    const arr = phasesByProject.get(pid) ?? [];
    arr.push({ id: String((r as Row).id), name: String((r as Row).name ?? ""), orderIndex: n((r as Row).order_index) });
    phasesByProject.set(pid, arr);
  }

  const curTaskById = new Map(curTaskRows.map((r) => [String((r as Row).id), r as Row]));
  const agentNameById = new Map(agentRows.map((r) => [String((r as Row).id), String((r as Row).name ?? "")]));

  return projRows.map((raw) => {
    const r = raw as Row;
    const pid = String(r.id);
    const projPhases = phasesByProject.get(pid) ?? [];
    const currentPhaseId = s(r.current_phase_id);
    const currentPhase =
      (currentPhaseId && projPhases.find((p) => p.id === currentPhaseId)) || projPhases[projPhases.length - 1];
    const phaseIndex = currentPhase ? projPhases.findIndex((p) => p.id === currentPhase.id) + 1 : null;

    const curTaskId = s(r.current_task_id);
    const curTask = curTaskId ? curTaskById.get(curTaskId) : undefined;
    const curAgentId = curTask ? s(curTask.current_agent_id) : null;

    const agg = progSum.get(pid);
    return {
      id: pid,
      name: String(r.name ?? ""),
      slug: String(r.slug ?? ""),
      icon: s(r.icon),
      description: s(r.description),
      status: String(r.status) as ProjectCard["status"],
      health: String(r.health) as ProjectCard["health"],
      currentPhaseName: currentPhase?.name ?? null,
      phaseIndex: currentPhase ? phaseIndex : null,
      phaseTotal: projPhases.length,
      currentTaskName: curTask ? s(curTask.name) : null,
      currentAgentName: curAgentId ? agentNameById.get(curAgentId) ?? null : null,
      progress: agg && agg.n ? Math.round(agg.sum / agg.n) : 0,
      openBranches: branchMap.get(pid) ?? 0,
      openIssues: issueMap.get(pid) ?? 0,
      updatedAt: new Date(String(r.updated_at)),
    } satisfies ProjectCard;
  });
}

// ───────────────────────── agents & credentials (Surface D) ─────────────────────────
// Mirror lib/data/agents + lib/data/credentials READS over HTTPS PostgREST so the
// Agents / Credentials page loads stop touching Hyperdrive. Writes & identity ops
// stay on Drizzle (web-only, per V0.2 scope).

export type PermissionLevel = "READ" | "WORKING_WRITE" | "STRUCTURAL_WRITE" | "GOVERNANCE";

export interface HttpProjectAgentRow {
  agentId: string;
  name: string;
  provider: string | null;
  description: string | null;
  role: string | null; // agents.role (default descriptor)
  bindingRole: string | null; // project_agents.role (this project's role)
  permissionLevel: PermissionLevel;
  enabled: boolean;
}

export interface HttpCredentialRow {
  id: string;
  name: string;
  tokenPrefix: string;
  permissionLevel: PermissionLevel;
  agentId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  agentName: string | null;
}

const dt = (v: unknown): Date | null => (v == null ? null : new Date(String(v)));
const plv = (v: unknown): PermissionLevel =>
  (v == null ? "READ" : String(v)) as PermissionLevel;

/** Agents bound to this project (soft-deleted agents filtered client-side), name-ascending. */
export async function httpProjectAgentRows(projectId: string): Promise<HttpProjectAgentRow[]> {
  const rows = await restSelect(`project_agents`, `project_id=eq.${enc(projectId)}`, {
    columns: "role,permission_level,enabled,agents(id,name,provider,description,role,deleted_at)",
  });
  return rows
    .filter((r) => {
      const ag = (r as Row).agents as { deleted_at?: unknown } | null;
      return ag != null && ag.deleted_at == null;
    })
    .map((r) => {
      const ag = ((r as Row).agents ?? {}) as Row;
      return {
        agentId: String(ag.id),
        name: String(ag.name ?? ""),
        provider: s(ag.provider),
        description: s(ag.description),
        role: s(ag.role),
        bindingRole: s((r as Row).role),
        permissionLevel: plv((r as Row).permission_level),
        enabled: (r as Row).enabled !== false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Global live agents NOT bound to this project (the "attach" picker). */
export async function httpUnboundAgentRows(
  projectId: string,
): Promise<Array<{ id: string; name: string; provider: string | null }>> {
  const p = enc(projectId);
  const [bound, all] = await Promise.all([
    restSelect(`project_agents`, `project_id=eq.${p}`, { columns: "agent_id" }),
    restSelect(`agents`, `deleted_at=is.null&order=name.asc`, { columns: "id,name,provider" }),
  ]);
  const boundIds = new Set(bound.map((b) => String((b as Row).agent_id)));
  return all
    .filter((a) => !boundIds.has(String((a as Row).id)))
    .map((a) => ({ id: String((a as Row).id), name: String((a as Row).name ?? ""), provider: s((a as Row).provider) }));
}

/** id → name for agents bound to this project (labels). */
export async function httpBoundAgentNames(projectId: string): Promise<Map<string, string>> {
  const rows = await restSelect(`project_agents`, `project_id=eq.${enc(projectId)}`, {
    columns: "agent_id,agents(name,deleted_at)",
  });
  const m = new Map<string, string>();
  for (const r of rows) {
    const ag = (r as Row).agents as { name?: string; deleted_at?: unknown } | null;
    if (ag && ag.deleted_at == null && ag.name != null) m.set(String((r as Row).agent_id), String(ag.name));
  }
  return m;
}

/** Live agents bound to this project, id+name (credential binding picker). */
export async function httpProjectAgentOptions(
  projectId: string,
): Promise<Array<{ id: string; name: string }>> {
  return (await httpProjectAgentRows(projectId)).map((a) => ({ id: a.agentId, name: a.name }));
}

/** All credentials for a project (newest-first) WITHOUT token_hash. */
export async function httpCredentialRows(projectId: string): Promise<HttpCredentialRow[]> {
  const rows = await restSelect(
    `mcp_credentials`,
    `project_id=eq.${enc(projectId)}&order=created_at.desc`,
    {
      columns:
        "id,name,token_prefix,permission_level,agent_id,created_at,last_used_at,expires_at,revoked_at,agents(name)",
    },
  );
  return rows.map((r) => {
    const ag = (r as Row).agents as { name?: string } | null;
    return {
      id: String((r as Row).id),
      name: String((r as Row).name ?? ""),
      tokenPrefix: String((r as Row).token_prefix ?? ""),
      permissionLevel: plv((r as Row).permission_level),
      agentId: s((r as Row).agent_id),
      createdAt: dt((r as Row).created_at) ?? new Date(0),
      lastUsedAt: dt((r as Row).last_used_at),
      expiresAt: dt((r as Row).expires_at),
      revokedAt: dt((r as Row).revoked_at),
      agentName: ag?.name != null ? String(ag.name) : null,
    };
  });
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
