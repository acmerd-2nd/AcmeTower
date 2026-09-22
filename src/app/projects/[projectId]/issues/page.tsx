import { ActionButton } from "@/components/action-button";
import { EnhancedForm } from "@/components/enhanced-form";
import { ErrorBanner, SelectField, StatusPill, Submit, TextArea, TextField } from "@/components/form-bits";
import { issueAction } from "@/lib/actions/write";
import { listIssueRows } from "@/lib/data/reads";
import { ISSUE_TRANSITIONS } from "@/lib/core/state-machines";
import { statusLabel } from "@/lib/core/labels";

export const dynamic = "force-dynamic";

const sev: Record<string, string> = {
  LOW: "text-zinc-500",
  MEDIUM: "text-amber-600",
  HIGH: "text-orange-600",
  CRITICAL: "text-red-600 font-semibold",
};
const sevLabel: Record<string, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  CRITICAL: "危急",
};

export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const rows = await listIssueRows(projectId);

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Issues · 问题</h2>
      <ErrorBanner message={error} />

      <EnhancedForm action={issueAction} done="Issue 已报告 ✓" className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="_action" value="add" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <TextField name="title" label="标题" required placeholder="发现了什么问题" />
          </div>
          <SelectField
            name="severity"
            label="严重度"
            options={[
              { value: "LOW", label: "低" },
              { value: "MEDIUM", label: "中" },
              { value: "HIGH", label: "高" },
              { value: "CRITICAL", label: "危急" },
            ]}
          />
        </div>
        <div className="mt-3">
          <TextArea name="description" label="说明" />
        </div>
        <div className="mt-3">
          <Submit label="报告 Issue" />
        </div>
      </EnhancedForm>

      <ul className="mt-6 space-y-3">
        {rows.map((it) => {
          const nexts = ISSUE_TRANSITIONS[it.status as keyof typeof ISSUE_TRANSITIONS] ?? [];
          return (
            <li key={it.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <StatusPill status={it.status} />
                <span className={`text-xs ${sev[it.severity] ?? ""}`}>{sevLabel[it.severity] ?? it.severity}</span>
              </div>
              <div className="mt-1 font-medium">{it.title}</div>
              {it.description && <div className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{it.description}</div>}
              {it.resolution && <div className="mt-1 text-sm text-emerald-600">结论：{it.resolution}</div>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nexts
                  .filter((t) => t !== "RESOLVED" && t !== "WONT_FIX")
                  .map((t) => (
                    <ActionButton
                      key={t}
                      label={statusLabel(t)}
                      action={issueAction}
                      fields={[
                        { name: "projectId", value: projectId },
                        { name: "_action", value: "status" },
                        { name: "id", value: it.id },
                        { name: "to", value: t },
                      ]}
                    />
                  ))}
                {nexts
                  .filter((t) => t === "RESOLVED" || t === "WONT_FIX")
                  .map((t) => (
                    <EnhancedForm key={t} action={issueAction} done={t === "RESOLVED" ? "已解决 ✓" : "已标记不修 ✓"} focus={false} className="inline-flex items-center gap-1">
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="_action" value="status" />
                      <input type="hidden" name="id" value={it.id} />
                      <input type="hidden" name="to" value={t} />
                      <input
                        name="resolution"
                        placeholder="结论(可选)"
                        className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <button type="submit" className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white">
                        {t === "RESOLVED" ? "解决" : "不修"}
                      </button>
                    </EnhancedForm>
                  ))}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="text-sm text-zinc-400">还没有 Issue。遇到阻塞或偏差时随手记一条，Agent 也能通过 MCP 上报。</li>
        )}
      </ul>
    </div>
  );
}
