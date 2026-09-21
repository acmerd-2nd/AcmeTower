import { ErrorBanner, SelectField, Submit, TextArea, TextField } from "@/components/form-bits";
import { checkpointAction } from "@/lib/actions/write";
import { listCheckpointRows, taskOptions } from "@/lib/data/reads";

export const dynamic = "force-dynamic";

export default async function CheckpointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const [rows, tasks] = await Promise.all([listCheckpointRows(projectId), taskOptions(projectId)]);

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Checkpoints · 检查点</h2>
      <p className="mt-1 text-sm text-zinc-500">Agent 阶段工作后的项目状态快照，形成可恢复的时间线。</p>
      <ErrorBanner message={error} />

      <form action={checkpointAction} className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <TextField name="summary" label="摘要" required placeholder="这一段完成了什么" />
          </div>
          <SelectField
            name="taskId"
            label="关联任务（可选）"
            options={[{ value: "", label: "— 无 —" }, ...tasks.map((t) => ({ value: t.id, label: t.name }))]}
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextArea name="completedItems" label="完成项（每行一条）" rows={3} placeholder={"- Authentication API\n- Login endpoint"} />
          <TextArea name="unfinishedItems" label="未完成项（每行一条）" rows={3} placeholder={"- Token rotation"} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField name="currentStatus" label="当前状态" placeholder="Task 1.3 = 70%" />
          <TextField name="nextAction" label="下一步" placeholder="验证替代 API" />
        </div>
        <div className="mt-3">
          <Submit label="提交 Checkpoint" />
        </div>
      </form>

      <ul className="mt-6 space-y-4">
        {rows.map((c) => (
          <li key={c.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="font-medium text-zinc-600 dark:text-zinc-300">{c.agentName ?? c.createdByType}</span>
              <span>· {new Date(c.createdAt).toLocaleString("zh-CN")}</span>
              {c.currentStatus && <span>· {c.currentStatus}</span>}
            </div>
            <div className="mt-1 font-medium">{c.summary}</div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
              <List title="完成" items={c.completedItems} tone="text-emerald-600" />
              <List title="未完成" items={c.unfinishedItems} tone="text-amber-600" />
            </div>
            {c.nextAction && <div className="mt-2 text-sm text-zinc-500">下一步：{c.nextAction}</div>}
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-zinc-400">还没有 Checkpoint。</li>}
      </ul>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={`text-xs font-medium ${tone}`}>{title}</div>
      <ul className="mt-1 space-y-0.5">
        {items.map((x, i) => (
          <li key={i} className="text-zinc-600 dark:text-zinc-300">
            · {x}
          </li>
        ))}
      </ul>
    </div>
  );
}
