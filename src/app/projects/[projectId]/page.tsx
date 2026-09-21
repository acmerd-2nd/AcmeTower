import { notFound } from "next/navigation";
import { getProjectSpace, type ProjectSpace } from "@/lib/data/project";
import { statusLabel } from "@/lib/core/labels";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const space = await getProjectSpace(projectId);
  if (!space) notFound();

  return (
    <div className="space-y-6">
      <PositionBar space={space} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <NorthStarCard space={space} />
          <Mainline space={space} />
          <CurrentMission space={space} />
        </div>
        <Signals space={space} />
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const phaseStatusStyle: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  ACTIVE: "bg-zinc-900 dark:bg-zinc-100",
  BLOCKED: "bg-red-500",
  PLANNED: "bg-zinc-300 dark:bg-zinc-600",
  CANCELLED: "bg-zinc-300 dark:bg-zinc-600",
};

function PositionBar({ space }: { space: ProjectSpace }) {
  const { project, currentPhase, currentTask, currentBranch } = space;
  const bits = [
    currentPhase ? currentPhase.name : null,
    currentTask ? currentTask.name : null,
    currentBranch ? `分支 ${currentBranch.name}` : null,
    currentTask?.agentName ? `Agent：${currentTask.agentName}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-md bg-zinc-100 px-2 py-1 font-medium dark:bg-zinc-800">{statusLabel(project.status)}</span>
      {bits.length ? (
        <span className="text-zinc-600 dark:text-zinc-300">{bits.join("  ·  ")}</span>
      ) : (
        <span className="text-zinc-400">尚未设定当前位置</span>
      )}
    </div>
  );
}

function NorthStarCard({ space }: { space: ProjectSpace }) {
  const ns = space.northStar;
  if (!ns) {
    return (
      <Card title="North Star · 北极星">
        <p className="text-sm text-zinc-500">
          尚无 North Star。它由人类拥有；Agent 只能提交变更提案。
        </p>
      </Card>
    );
  }
  return (
    <Card title="North Star · 北极星">
      <div className="space-y-3 text-sm">
        {ns.finalGoal && <Line label="最终目标" value={ns.finalGoal} />}
        {ns.deliverable && <Line label="最终交付" value={ns.deliverable} />}
        {ns.successCriteria && <Line label="成功标准" value={ns.successCriteria} />}
        {ns.nonGoals && <Line label="明确不做" value={ns.nonGoals} />}
        {ns.constraints && <Line label="长期约束" value={ns.constraints} />}
      </div>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="whitespace-pre-line text-zinc-800 dark:text-zinc-200">{value}</div>
    </div>
  );
}

function Mainline({ space }: { space: ProjectSpace }) {
  if (space.phases.length === 0) {
    return (
      <Card title="Mainline · 主线">
        <p className="text-sm text-zinc-500">还没有 Phase。</p>
      </Card>
    );
  }
  return (
    <Card title="Mainline · 主线">
      <ol className="space-y-2">
        {space.phases.map((p, i) => {
          const isCurrent = p.id === space.currentPhase?.id;
          return (
            <li key={p.id} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs text-zinc-400">Phase {i + 1}</span>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${phaseStatusStyle[p.status] ?? ""}`} />
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  isCurrent ? "font-semibold" : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {p.name}
                {isCurrent && <span className="ml-2 text-xs text-zinc-400">● current</span>}
              </span>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-400">
                {p.doneCount}/{p.taskCount} · {p.progress}%
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function CurrentMission({ space }: { space: ProjectSpace }) {
  const m = space.mission;
  return (
    <Card title="Current Mission · 当前使命">
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Line label="Objective" value={m.objective ?? "—"} />
        <Line label="Success Criteria" value={m.successCriteria ?? "—"} />
        <Line label="Current State" value={m.currentState ?? "—"} />
        <Line label="Next Action" value={m.nextAction ?? "—"} />
        <div className="sm:col-span-2">
          <div className="text-xs text-zinc-400">Do Not</div>
          <div className="whitespace-pre-line rounded-md bg-zinc-50 p-2 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
            {m.doNot ?? "—"}
          </div>
        </div>
        {m.returnTo && <Line label="Return To" value={m.returnTo} />}
      </div>
    </Card>
  );
}

function Signals({ space }: { space: ProjectSpace }) {
  const s = space.signals;
  return (
    <div className="space-y-6">
      <Card title="Signals · 信号">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="分支" value={s.openBranches} />
          <Stat label="Issue" value={s.openIssues} />
          <Stat label="提案" value={s.pendingProposals} />
        </div>
        {s.agents.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {s.agents.map((a) => (
              <span
                key={a.id}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {a.name} · {a.permissionLevel}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="Recent Decisions · 最近决策">
        {s.recentDecisions.length === 0 ? <Empty /> : (
          <ul className="space-y-2 text-sm">
            {s.recentDecisions.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{d.title}</span>
                <span className="shrink-0 text-xs text-zinc-400">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent Checkpoints · 最近检查点">
        {s.recentCheckpoints.length === 0 ? <Empty /> : (
          <ul className="space-y-3 text-sm">
            {s.recentCheckpoints.map((c) => (
              <li key={c.id}>
                <div className="text-xs text-zinc-400">
                  {c.agentName ?? "system"} · {new Date(c.createdAt).toLocaleString("zh-CN")}
                </div>
                <div className="line-clamp-2 text-zinc-700 dark:text-zinc-300">{c.summary}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-zinc-400">暂无</p>;
}
