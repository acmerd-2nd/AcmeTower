import { cookies } from "next/headers";
import { ActionButton } from "@/components/action-button";
import { CopyButton } from "@/components/copy-button";
import { ErrorBanner, SelectField, Submit, TextField } from "@/components/form-bits";
import {
  createCredentialAction,
  dismissTokenAction,
  revokeCredentialAction,
} from "@/lib/actions/credentials";
import {
  credentialStatus,
  listCredentials,
  projectAgentOptions,
  type CredentialStatus,
} from "@/lib/data/credentials";

export const dynamic = "force-dynamic";

const TOKEN_COOKIE = "acme_mcp_token";

const STATUS_STYLE: Record<CredentialStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  EXPIRED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  REVOKED: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const PERM_STYLE: Record<string, string> = {
  READ: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  WORKING_WRITE: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  STRUCTURAL_WRITE: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
};

function timeAgo(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}
function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("zh-CN") : "—";
}

const PERMISSIONS = [
  { value: "READ", label: "READ — 只读（读取项目上下文/路线图/决策等）" },
  { value: "WORKING_WRITE", label: "WORKING_WRITE — 工作写入（更新任务/分支、创建 Issue、提交 Checkpoint）" },
  { value: "STRUCTURAL_WRITE", label: "STRUCTURAL_WRITE — 结构写入（可回收分支、提交提案）" },
];

export default async function AgentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;
  const [creds, agentOpts, jar] = await Promise.all([
    listCredentials(projectId),
    projectAgentOptions(projectId),
    cookies(),
  ]);

  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") || "";
  const mcpUrl = appUrl ? `${appUrl}/mcp` : "https://<你的域名>/mcp";
  const configSnippet = JSON.stringify(
    {
      mcpServers: {
        acmetower: {
          url: mcpUrl,
          headers: { Authorization: "Bearer <粘贴下方令牌>" },
        },
      },
    },
    null,
    2,
  );

  let reveal: { id: string; name: string; token: string } | null = null;
  try {
    const raw = jar.get(TOKEN_COOKIE)?.value;
    if (raw) reveal = JSON.parse(raw);
  } catch {
    reveal = null;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Agents · MCP Connection</h2>
      <p className="mt-1 text-sm text-zinc-500">
        为 Agent 生成本项目的 MCP 连接凭证。完整令牌只在创建后显示一次；系统仅保存其哈希，可随时撤销或重建。
      </p>
      <ErrorBanner message={error} />

      {reveal && (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            「{reveal.name}」的连接令牌 — 仅此一次，请立即复制
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 select-all break-all rounded-md bg-white/70 px-3 py-2 font-mono text-sm text-zinc-900 dark:bg-zinc-900/60 dark:text-zinc-100">
              {reveal.token}
            </code>
            <CopyButton text={reveal.token} label="复制令牌" />
            <form action={dismissTokenAction} className="inline">
              <input type="hidden" name="projectId" value={projectId} />
              <button
                type="submit"
                className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300"
              >
                我已复制，隐藏
              </button>
            </form>
          </div>
          <p className="mt-2 text-xs text-emerald-700/80 dark:text-emerald-300/70">
            离开本页或点击「隐藏」后将无法再次查看；如遗失请撤销此连接并重新生成。
          </p>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-sm font-medium">连接到统一 MCP Gateway</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <code className="rounded bg-zinc-100 px-2 py-1 font-mono text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">{mcpUrl}</code>
          <CopyButton text={mcpUrl} label="复制地址" />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          单一 Server 服务多项目，权限由令牌决定它能访问哪个项目（§42 / §45）。
        </p>
        <pre className="mt-3 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100 dark:bg-black">
          <code>{configSnippet}</code>
        </pre>
      </div>

      <form
        action={createCredentialAction}
        className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <div className="text-sm font-medium">生成新的连接凭证</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField name="name" label="名称（用途 / Agent）" placeholder="Codex 主开发连接" />
          <SelectField name="permission" label="权限级别" options={PERMISSIONS} required />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            name="expiresDays"
            label="有效期"
            options={[
              { value: "0", label: "永不过期" },
              { value: "30", label: "30 天" },
              { value: "90", label: "90 天" },
            ]}
          />
          <SelectField
            name="agentId"
            label="绑定到已有 Agent（可选，用于审计归属）"
            options={[{ value: "", label: "不绑定" }, ...agentOpts.map((a) => ({ value: a.id, label: a.name }))]}
          />
        </div>
        <div className="mt-3">
          <Submit label="生成令牌" />
        </div>
      </form>

      <div className="mt-6">
        <div className="text-sm font-medium">本项目的连接凭证</div>
        <ul className="mt-2 space-y-2">
          {creds.map((c) => {
            const status = credentialStatus(c);
            return (
              <li
                key={c.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${
                  status === "ACTIVE" ? "border-zinc-200 dark:border-zinc-800" : "border-zinc-100 opacity-70 dark:border-zinc-800/60"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PERM_STYLE[c.permissionLevel] ?? ""}`}>
                      {c.permissionLevel}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{status}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500">
                    <span className="font-mono">{c.tokenPrefix}••••••</span>
                    {c.agentName && <span>Agent：{c.agentName}</span>}
                    <span>创建于 {fmtDate(c.createdAt)}</span>
                    <span>最近使用 {timeAgo(c.lastUsedAt)}</span>
                    {c.expiresAt && <span>到期 {fmtDate(c.expiresAt)}</span>}
                  </div>
                </div>
                {status !== "REVOKED" && (
                  <ActionButton
                    tone="danger"
                    label="撤销"
                    action={revokeCredentialAction}
                    fields={[
                      { name: "projectId", value: projectId },
                      { name: "id", value: c.id },
                    ]}
                  />
                )}
              </li>
            );
          })}
          {creds.length === 0 && <li className="text-sm text-zinc-400">还没有连接。生成一个，配置给你的 Agent。</li>}
        </ul>
      </div>
    </div>
  );
}
