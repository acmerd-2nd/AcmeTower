import { ActionButton } from "@/components/action-button";
import {
  ErrorBanner,
  SelectField,
  StatusPill,
  Submit,
  TextArea,
  TextField,
} from "@/components/form-bits";
import { proposalAction } from "@/lib/actions/write";
import { listProposalRows, taskOptions } from "@/lib/data/reads";
import { PROPOSAL_TRANSITIONS } from "@/lib/core/state-machines";
import { statusLabel } from "@/lib/core/labels";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  NORTH_STAR_CHANGE: "North Star 变更",
  SCOPE_CHANGE: "范围变更",
  PARKING_LOT: "停车场",
  OTHER: "其它",
};

export default async function ProposalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const [rows, tasks] = await Promise.all([listProposalRows(projectId), taskOptions(projectId)]);
  const pending = rows.filter((p) => p.status === "PENDING" && p.kind !== "PARKING_LOT");
  const parked = rows.filter((p) => p.status === "PARKED" || p.kind === "PARKING_LOT");

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Proposals · 提案</h2>
      <p className="mt-1 text-sm text-zinc-500">Agent 想做范围外的事 → 提交提案，由人类批准 / 拒绝 / 延期（Parking Lot）。</p>
      <ErrorBanner message={error} />

      <form action={proposalAction} className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="_action" value="add" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <TextField name="title" label="标题" required placeholder="例如：新增团队权限系统" />
          </div>
          <SelectField
            name="kind"
            label="类型"
            options={[
              { value: "OTHER", label: "其它" },
              { value: "SCOPE_CHANGE", label: "范围变更" },
              { value: "NORTH_STAR_CHANGE", label: "North Star 变更" },
              { value: "PARKING_LOT", label: "停车场" },
            ]}
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextArea name="reason" label="原因 Reason" />
          <TextArea name="impact" label="影响 Impact" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextArea name="description" label="描述" />
          <SelectField
            name="relatedTaskId"
            label="关联任务（可选）"
            options={[{ value: "", label: "— 无 —" }, ...tasks.map((t) => ({ value: t.id, label: t.name }))]}
          />
        </div>
        <div className="mt-3">
          <Submit label="提交提案" />
        </div>
      </form>

      <Section title="待批准" rows={pending} projectId={projectId} empty="没有待批准提案。" />
      <Section title="Parking Lot（停车场）" rows={parked} projectId={projectId} empty="停车场为空。" />
    </div>
  );
}

function Section({
  title,
  rows,
  projectId,
  empty,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof listProposalRows>>;
  projectId: string;
  empty: string;
}) {
  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
      <ul className="mt-3 space-y-3">
        {rows.map((p) => {
          const nexts = PROPOSAL_TRANSITIONS[p.status as keyof typeof PROPOSAL_TRANSITIONS] ?? [];
          return (
            <li key={p.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusPill status={p.status} />
                    <span className="text-xs text-zinc-400">{KIND_LABEL[p.kind] ?? p.kind}</span>
                  </div>
                  <div className="mt-1 font-medium">{p.title}</div>
                  {p.reason && <div className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{p.reason}</div>}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {nexts.map((to) => (
                    <ActionButton
                      key={to}
                      tone={to === "APPROVED" ? "solid" : to === "REJECTED" ? "danger" : "ghost"}
                      label={to === "PARKED" ? "停到停车场" : to === "PENDING" ? "回到待批准" : statusLabel(to)}
                      action={proposalAction}
                      fields={[
                        { name: "projectId", value: projectId },
                        { name: "_action", value: "status" },
                        { name: "id", value: p.id },
                        { name: "to", value: to },
                      ]}
                    />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-sm text-zinc-400">{empty}</li>}
      </ul>
    </div>
  );
}
