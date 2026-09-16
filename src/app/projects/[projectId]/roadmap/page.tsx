import { eq } from "drizzle-orm";
import { ActionButton } from "@/components/action-button";
import { ErrorBanner, StatusPill, Submit, TextArea, TextField } from "@/components/form-bits";
import { phaseAction } from "@/lib/actions/write";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { listPhaseRows } from "@/lib/data/reads";
import { PHASE_TRANSITIONS } from "@/lib/core/state-machines";

export const dynamic = "force-dynamic";

export default async function RoadmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const rows = await listPhaseRows(projectId);
  const db = getDb();
  const [project] = await db
    .select({ currentPhaseId: projects.currentPhaseId })
    .from(projects)
    .where(eq(projects.id, projectId));

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Roadmap · Mainline</h2>
      <ErrorBanner message={error} />

      <form action={phaseAction} className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="_action" value="add" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField name="name" label="Phase 名称" required placeholder="Phase 6 · ..." />
          <TextField name="goal" label="目标" placeholder="本 Phase 要达成什么" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextArea name="successCriteria" label="成功标准" />
          <TextArea name="scope" label="范围 / 约束（Do Not）" />
        </div>
        <div className="mt-3">
          <Submit label="添加 Phase" />
        </div>
      </form>

      <ol className="mt-6 space-y-3">
        {rows.map((p, i) => {
          const isCurrent = p.id === project?.currentPhaseId;
          const nexts = PHASE_TRANSITIONS[p.status as keyof typeof PHASE_TRANSITIONS] ?? [];
          return (
            <li
              key={p.id}
              className={`rounded-xl border p-4 ${
                isCurrent
                  ? "border-zinc-900 dark:border-zinc-100"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Phase {i + 1}</span>
                    <StatusPill status={p.status} />
                    {isCurrent && <span className="text-xs font-medium text-zinc-500">● current</span>}
                  </div>
                  <div className="mt-1 truncate font-medium">{p.name}</div>
                  {p.goal && <div className="mt-0.5 truncate text-sm text-zinc-500">{p.goal}</div>}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {!isCurrent && (
                    <ActionButton
                      tone="solid"
                      label="设为当前"
                      action={phaseAction}
                      fields={[
                        { name: "projectId", value: projectId },
                        { name: "_action", value: "current" },
                        { name: "id", value: p.id },
                      ]}
                    />
                  )}
                  {nexts.map((to) => (
                    <ActionButton
                      key={to}
                      label={to}
                      action={phaseAction}
                      fields={[
                        { name: "projectId", value: projectId },
                        { name: "_action", value: "status" },
                        { name: "id", value: p.id },
                        { name: "to", value: to },
                      ]}
                    />
                  ))}
                  <ActionButton
                    tone="danger"
                    label="归档"
                    action={phaseAction}
                    fields={[
                      { name: "projectId", value: projectId },
                      { name: "_action", value: "delete" },
                      { name: "id", value: p.id },
                    ]}
                  />
                </div>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-sm text-zinc-400">还没有 Phase。</li>}
      </ol>
    </div>
  );
}
