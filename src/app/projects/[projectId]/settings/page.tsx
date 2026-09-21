import { ErrorBanner, Submit, TextArea, TextField } from "@/components/form-bits";
import { northStarAction } from "@/lib/actions/write";
import { httpNorthStar } from "@/lib/mcp/httpdata";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const ns = await httpNorthStar(projectId);

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Settings · 设置</h2>
      <ErrorBanner message={error} />

      <section className="mt-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">North Star</h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            治理级：仅人类可编辑
          </span>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          North Star 是项目最高层真相；Agent 只能提交变更提案（Step 10）。
        </p>
        <form action={northStarAction} className="space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField name="name" label="名称" placeholder={ns?.name ?? "AcmeTower V0.1"} />
            <TextField name="deliverable" label="最终交付" placeholder={ns?.deliverable ?? undefined} />
          </div>
          <TextArea name="finalGoal" label="最终目标" rows={3} placeholder={ns?.finalGoal ?? undefined} />
          <TextArea name="successCriteria" label="成功标准" rows={3} placeholder={ns?.successCriteria ?? undefined} />
          <TextArea name="nonGoals" label="明确不做什么" rows={3} placeholder={ns?.nonGoals ?? undefined} />
          <TextArea name="constraints" label="长期约束" rows={2} placeholder={ns?.constraints ?? undefined} />
          <Submit label="保存 North Star" />
        </form>
      </section>

      <p className="mt-4 text-xs text-zinc-400">项目设置（重命名 / 归档 / 导出 JSON）将在 Step 12 补充。</p>
    </div>
  );
}
