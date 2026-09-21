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
  agentPermissionAction,
  agentToggleAction,
  attachAgentAction,
  createAgentAction,
  unbindAgentAction,
} from "@/lib/actions/agents";
import {
  credentialStatus,
  listCredentials,
  projectAgentOptions,
  type CredentialStatus,
} from "@/lib/data/credentials";
import { listProjectAgents, unboundAgents } from "@/lib/data/agents";
import { httpProjectRow } from "@/lib/mcp/httpdata";

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

const AGENT_PERM = [
  { value: "READ", label: "READ" },
  { value: "WORKING_WRITE", label: "WORKING_WRITE" },
  { value: "STRUCTURAL_WRITE", label: "STRUCTURAL_WRITE" },
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
  const [creds, agentOpts, boundAgents, attachable, project, jar] = await Promise.all([
    listCredentials(projectId),
    projectAgentOptions(projectId),
    listProjectAgents(projectId),
    unboundAgents(projectId),
    httpProjectRow(projectId),
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

  // 一键接入包：中文操作指引 + 含令牌的 MCP 配置，用户复制后直接转发给本地 Agent。
  const projectName = project?.name ?? "本项目";
  const bearerToken = reveal?.token ?? "<在此粘贴下方生成的令牌>";
  const configWithToken = JSON.stringify(
    { mcpServers: { acmetower: { url: mcpUrl, headers: { Authorization: `Bearer ${bearerToken}` } } } },
    null,
    2,
  );
  const onboardingText = [
    `你正在通过 AcmeTower 的 MCP 网关管理项目「${projectName}」，与人类共享同一份项目状态。请按以下方式工作：`,
    `1. 开工前先调用 project_get_context 和 project_get_current_mission，读清 North Star、当前阶段(Phase)/任务(Task)，以及“当前使命”（目标、成功标准、不要做什么、完成后回到哪里）。`,
    `2. 严守范围：只做当前使命/任务范围内的事；拿不准是否偏航就 project_check_drift；需要改变方向，或触碰 North Star / 决策等治理内容时，用 project_create_proposal 提交给人批准，不要擅自更改。`,
    `3. 推进：用 project_update_task 更新任务状态与进度；需要探索时 project_create_branch，得出结论后用 project_close_branch 回收、把结果带回主线。`,
    `4. 汇报：阶段性成果或告一段落，用 project_create_checkpoint 记录进展；发现问题用 project_create_issue。`,
    `5. 并发：写操作遵循乐观锁(version)；若报版本冲突，先重新读取最新状态再改。只使用你被授予的权限。`,
    `6. 全程用中文，简洁说明你做了什么、结果如何、下一步是什么。`,
    ``,
    `【MCP 连接配置】把下面这段并入你的 MCP 客户端配置即可连接（不同客户端字段名略有差异，含义一致）：`,
    configWithToken,
  ].join("\n");

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Agents · 智能体与 MCP 接入</h2>
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

      {/* Agents in this project */}
      <div className="mt-6">
        <div className="text-sm font-medium">Agents（本项目）</div>
        <p className="mt-0.5 text-xs text-zinc-500">Agent 是平台实体；在此创建、绑定到本项目并授予权限（§26–§29，GOVERNANCE 仅人类）。</p>

        <ul className="mt-2 space-y-2">
          {boundAgents.map((a) => (
            <li key={a.agentId} className={`rounded-xl border p-3 ${a.enabled ? "border-zinc-200 dark:border-zinc-800" : "border-zinc-100 opacity-60 dark:border-zinc-800/60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PERM_STYLE[a.permissionLevel] ?? ""}`}>{a.permissionLevel}</span>
                    {!a.enabled && <span className="text-xs text-zinc-400">已停用</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {a.provider ? `${a.provider} · ` : ""}
                    {a.bindingRole || a.role || "—"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={agentPermissionAction} className="flex items-center gap-1">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="agentId" value={a.agentId} />
                    <select name="permission" defaultValue={a.permissionLevel} className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950">
                      {AGENT_PERM.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">设权限</button>
                  </form>
                  <ActionButton
                    label={a.enabled ? "停用" : "启用"}
                    action={agentToggleAction}
                    fields={[
                      { name: "projectId", value: projectId },
                      { name: "agentId", value: a.agentId },
                      { name: "enabled", value: String(a.enabled) },
                    ]}
                  />
                  <ActionButton
                    tone="danger"
                    label="解绑"
                    action={unbindAgentAction}
                    fields={[
                      { name: "projectId", value: projectId },
                      { name: "agentId", value: a.agentId },
                    ]}
                  />
                </div>
              </div>
            </li>
          ))}
          {boundAgents.length === 0 && <li className="text-sm text-zinc-400">还没有 Agent 绑定到本项目。</li>}
        </ul>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <form action={createAgentAction} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="text-xs font-medium text-zinc-500">新建 Agent</div>
            <div className="mt-2 grid gap-2">
              <TextField name="name" label="名称 *" placeholder="Codex" required />
              <TextField name="provider" label="Provider（可选）" placeholder="OpenAI / Anthropic …" />
              <TextField name="role" label="角色（可选）" placeholder="Developer / Reviewer …" />
              <SelectField name="permission" label="权限" options={AGENT_PERM} />
              <Submit label="创建并绑定" />
            </div>
          </form>

          <form action={attachAgentAction} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="text-xs font-medium text-zinc-500">绑定已有 Agent 到本项目</div>
            {attachable.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-400">没有可绑定的其它 Agent。</p>
            ) : (
              <div className="mt-2 grid gap-2">
                <SelectField name="agentId" label="选择 Agent" options={attachable.map((a) => ({ value: a.id, label: a.provider ? `${a.name} · ${a.provider}` : a.name }))} required />
                <SelectField name="permission" label="权限" options={AGENT_PERM} />
                <Submit label="绑定" />
              </div>
            )}
          </form>
        </div>
      </div>

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

      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">转发给本地 Agent · 一键接入</div>
          <CopyButton text={onboardingText} label="复制全部（直接发给 Agent）" />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          把下面整段复制，直接发给你电脑上装了 MCP 的 Agent（Claude / Cursor / QoderWork 等）。它读完就知道如何连接本项目并推进工作。
          {reveal ? " 当前配置已包含刚生成的真实令牌，复制即用。" : " 先在下方「生成令牌」，回到本页后配置里会自动带上真实令牌。"}
        </p>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-zinc-950 p-3 text-[12.5px] leading-relaxed text-zinc-100 dark:bg-black">
          <code>{onboardingText}</code>
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
