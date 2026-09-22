import { ActionButton } from "@/components/action-button";
import { ErrorBanner, StatusPill, Submit, TextArea, TextField } from "@/components/form-bits";
import { decisionAction } from "@/lib/actions/write";
import { listDecisionRows } from "@/lib/data/reads";
import { DECISION_TRANSITIONS } from "@/lib/core/state-machines";
import { statusLabel } from "@/lib/core/labels";

export const dynamic = "force-dynamic";

export default async function DecisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const rows = await listDecisionRows(projectId);

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Decisions · 决策</h2>
      <ErrorBanner message={error} />

      <form action={decisionAction} className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="_action" value="add" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField name="title" label="决策标题" required placeholder="使用 PostgreSQL" />
          <TextField name="decision" label="决策内容" required placeholder="决定是什么" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextArea name="reason" label="原因 Reason" />
          <TextArea name="alternatives" label="备选 Alternatives" />
          <TextArea name="impact" label="影响 Impact" />
        </div>
        <div className="mt-3">
          <Submit label="提出 Decision" />
        </div>
      </form>

      <ul className="mt-6 space-y-3">
        {rows.map((d) => {
          const nexts = DECISION_TRANSITIONS[d.status as keyof typeof DECISION_TRANSITIONS] ?? [];
          return (
            <li key={d.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusPill status={d.status} />
                    <span className="text-xs text-zinc-400">by {d.createdBy ?? "—"}</span>
                  </div>
                  <div className="mt-1 font-medium">{d.title}</div>
                  <div className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">{d.decision}</div>
                  {d.reason && <div className="mt-1 line-clamp-2 text-sm text-zinc-500">原因：{d.reason}</div>}
                  {d.impact && <div className="mt-0.5 text-xs text-zinc-400">影响：{d.impact}</div>}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {nexts.map((to) => (
                    <ActionButton
                      key={to}
                      tone={to === "APPROVED" ? "solid" : to === "REJECTED" ? "danger" : "ghost"}
                      label={statusLabel(to)}
                      action={decisionAction}
                      fields={[
                        { name: "projectId", value: projectId },
                        { name: "_action", value: "status" },
                        { name: "id", value: d.id },
                        { name: "to", value: to },
                      ]}
                    />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
            <div className="text-2xl">⚖️</div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              还没有 Decision。技术选型、范围取舍这类要留痕的拍板，用上方表单记录：标题 + 决策内容 + 原因 + 影响。
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}
