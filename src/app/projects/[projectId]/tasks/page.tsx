import { eq } from "drizzle-orm";
import { ActionButton } from "@/components/action-button";
import { ErrorBanner, SelectField, StatusPill, Submit, TextArea, TextField } from "@/components/form-bits";
import { taskAction } from "@/lib/actions/write";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { listTaskRows, phaseOptions } from "@/lib/data/reads";
import { TASK_TRANSITIONS } from "@/lib/core/state-machines";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const [rows, phases] = await Promise.all([listTaskRows(projectId), phaseOptions(projectId)]);
  const db = getDb();
  const [project] = await db
    .select({ currentTaskId: projects.currentTaskId })
    .from(projects)
    .where(eq(projects.id, projectId));

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Tasks</h2>
      <ErrorBanner message={error} />

      {phases.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">请先在 Roadmap 创建 Phase。</p>
      ) : (
        <form action={taskAction} className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="_action" value="add" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField name="name" label="任务名称" required placeholder="Step 3 认证" />
            <SelectField
              name="phaseId"
              label="所属 Phase"
              required
              options={phases.map((p) => ({ value: p.id, label: p.name }))}
            />
            <SelectField
              name="priority"
              label="优先级"
              options={[
                { value: "LOW", label: "LOW" },
                { value: "MEDIUM", label: "MEDIUM" },
                { value: "HIGH", label: "HIGH" },
                { value: "URGENT", label: "URGENT" },
              ]}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextArea name="purpose" label="为什么做" />
            <TextArea name="successCriteria" label="成功标准" />
          </div>
          <div className="mt-3">
            <Submit label="添加任务" />
          </div>
        </form>
      )}

      <ul className="mt-6 space-y-3">
        {rows.map((t) => {
          const isCurrent = t.id === project?.currentTaskId;
          const nexts = TASK_TRANSITIONS[t.status as keyof typeof TASK_TRANSITIONS] ?? [];
          return (
            <li
              key={t.id}
              className={`rounded-xl border p-4 ${
                isCurrent ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusPill status={t.status} />
                    <span className="text-xs text-zinc-400">{t.phaseName}</span>
                    {isCurrent && <span className="text-xs font-medium text-zinc-500">● current</span>}
                  </div>
                  <div className="mt-1 font-medium">{t.name}</div>
                  {t.purpose && <div className="mt-0.5 line-clamp-1 text-sm text-zinc-500">{t.purpose}</div>}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <form action={taskAction} className="inline-flex items-center gap-1">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="_action" value="progress" />
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      type="number"
                      name="progress"
                      min={0}
                      max={100}
                      defaultValue={t.progress}
                      className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <button type="submit" className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
                      %
                    </button>
                  </form>
                  {!isCurrent && (
                    <ActionButton
                      tone="solid"
                      label="设为当前"
                      action={taskAction}
                      fields={[
                        { name: "projectId", value: projectId },
                        { name: "_action", value: "current" },
                        { name: "id", value: t.id },
                      ]}
                    />
                  )}
                  {nexts.map((to) => (
                    <ActionButton
                      key={to}
                      label={to}
                      action={taskAction}
                      fields={[
                        { name: "projectId", value: projectId },
                        { name: "_action", value: "status" },
                        { name: "id", value: t.id },
                        { name: "to", value: to },
                      ]}
                    />
                  ))}
                  <ActionButton
                    tone="danger"
                    label="归档"
                    action={taskAction}
                    fields={[
                      { name: "projectId", value: projectId },
                      { name: "_action", value: "delete" },
                      { name: "id", value: t.id },
                    ]}
                  />
                </div>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && phases.length > 0 && (
          <li className="text-sm text-zinc-400">还没有任务。</li>
        )}
      </ul>
    </div>
  );
}
