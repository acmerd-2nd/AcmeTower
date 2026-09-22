import { ErrorBanner, Submit, TextArea, TextField } from "@/components/form-bits";
import { northStarAction } from "@/lib/actions/write";
import { httpNorthStar, httpProjectRow } from "@/lib/mcp/httpdata";
import { ProjectSettingsPanel } from "@/components/project-settings-panel";

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
  const [ns, project] = await Promise.all([httpNorthStar(projectId), httpProjectRow(projectId)]);

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

      <div className="mt-4 space-y-4">
        {project && (
          <ProjectSettingsPanel
            projectId={project.id}
            name={project.name}
            slug={project.slug}
            status={project.status}
            version={project.version}
          />
        )}
        <a
          href={`/projects/${projectId}/export`}
          className="inline-block text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          导出本项目全量 JSON（含主线/任务/决策/审计）→
        </a>
      </div>
    </div>
  );
}
