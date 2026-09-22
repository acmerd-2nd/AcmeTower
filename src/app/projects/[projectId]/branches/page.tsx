import { ActionButton } from "@/components/action-button";
import { EnhancedForm } from "@/components/enhanced-form";
import {
  ErrorBanner,
  SelectField,
  StatusPill,
  Submit,
  TextArea,
  TextField,
} from "@/components/form-bits";
import { branchAction } from "@/lib/actions/write";
import { listBranchRows, phaseOptions, taskOptions } from "@/lib/data/reads";
import { BRANCH_TRANSITIONS } from "@/lib/core/state-machines";
import { statusLabel } from "@/lib/core/labels";

export const dynamic = "force-dynamic";

export default async function BranchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const [branches, phases, tasks] = await Promise.all([
    listBranchRows(projectId),
    phaseOptions(projectId),
    taskOptions(projectId),
  ]);

  const nodeOptions = [
    { value: `PROJECT:${projectId}`, label: "Project（本项目）" },
    ...phases.map((p) => ({ value: `PHASE:${p.id}`, label: `Phase · ${p.name}` })),
    ...tasks.map((t) => ({ value: `TASK:${t.id}`, label: `Task · ${t.name}` })),
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Branches · 分支</h2>
      <p className="mt-1 text-sm text-zinc-500">
        分支用于处理意外，必须记录来源·原因·目标与 Return Point；完成后回收，不破坏主线。
      </p>
      <ErrorBanner message={error} />

      {nodeOptions.length <= 1 ? (
        <p className="mt-4 text-sm text-zinc-500">需要至少一个 Phase/Task 作为来源。</p>
      ) : (
        <EnhancedForm action={branchAction} done="分支已创建 ✓" className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="_action" value="add" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField name="name" label="分支名称" required placeholder="1.3-A 验证替代 API" />
            <SelectField name="source" label="来源 Source" required options={nodeOptions} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextArea name="reason" label="产生原因 Reason *" />
            <TextArea name="goal" label="目标 Goal" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextArea name="successCriteria" label="成功标准" />
            <SelectField name="returnPoint" label="Return Point（回哪里）" required options={nodeOptions} />
          </div>
          <div className="mt-3">
            <Submit label="创建分支" />
          </div>
        </EnhancedForm>
      )}

      <ul className="mt-6 space-y-3">
        {branches.map((b) => {
          const nexts = BRANCH_TRANSITIONS[b.status as keyof typeof BRANCH_TRANSITIONS] ?? [];
          const open = b.status !== "RESOLVED" && b.status !== "ABANDONED";
          return (
            <li
              key={b.id}
              className={`rounded-xl border p-4 ${
                open ? "border-zinc-200 dark:border-zinc-800" : "border-zinc-100 opacity-70 dark:border-zinc-800/60"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusPill status={b.status} />
                    <span className="text-xs text-zinc-400">
                      来源 {b.sourceType} → 回到 {b.returnPointType}
                    </span>
                  </div>
                  <div className="mt-1 font-medium">{b.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{b.reason}</div>
                  {b.resolution && (
                    <div className="mt-1 text-sm text-emerald-600">结论：{b.resolution}</div>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {nexts
                    .filter((to) => to !== "RESOLVED")
                    .map((to) => (
                      <ActionButton
                        key={to}
                        label={statusLabel(to)}
                        action={branchAction}
                        fields={[
                          { name: "projectId", value: projectId },
                          { name: "_action", value: "status" },
                          { name: "id", value: b.id },
                          { name: "to", value: to },
                        ]}
                      />
                    ))}
                  {open && (
                    <EnhancedForm action={branchAction} done="分支已回收 ✓" focus={false} className="inline-flex items-center gap-1">
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="_action" value="close" />
                      <input type="hidden" name="id" value={b.id} />
                      <input
                        name="resolution"
                        required
                        placeholder="结论 / resolution"
                        className="w-40 rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <button type="submit" className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white">
                        回收
                      </button>
                    </EnhancedForm>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {branches.length === 0 && (
          <li className="text-sm text-zinc-400">还没有分支。主线之外要处理意外时，从这里开一条，并写好回主线的 Return Point。</li>
        )}
      </ul>
    </div>
  );
}
