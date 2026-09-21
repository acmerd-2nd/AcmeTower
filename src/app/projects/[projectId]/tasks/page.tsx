import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { ErrorBanner, SelectField, StatusPill, Submit, TextArea, TextField } from "@/components/form-bits";
import { taskAction } from "@/lib/actions/write";
import { httpProjectRow } from "@/lib/mcp/httpdata";
import { listTaskRows, phaseOptions } from "@/lib/data/reads";
import { TASK_TRANSITIONS } from "@/lib/core/state-machines";
import { statusLabel } from "@/lib/core/labels";

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
  const project = await httpProjectRow(projectId);

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Tasks · 任务</h2>
      <ErrorBanner message={error} />

      {phases.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
          <div className="text-2xl">📋</div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            任务需要先挂在一个 Phase 下。先去 <strong>Roadmap</strong> 创建阶段，再回来拆任务。
          </p>
          <Link
            href={`/projects/${projectId}/roadmap`}
            className="mt-3 inline-block rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
          >
            去 Roadmap 创建 Phase →
          </Link>
        </div>
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
                { value: "LOW", label: "低" },
                { value: "MEDIUM", label: "中" },
                { value: "HIGH", label: "高" },
                { value: "URGENT", label: "紧急" },
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
                      label={statusLabel(to)}
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
          <li className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
            <div className="text-2xl">🧩</div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              还没有任务。在上方表单把当前 Phase 拆成几件小事——每件写清「为什么做」和「成功标准」，Agent 就能通过 MCP 认领并推进。
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}
