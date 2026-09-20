import Link from "next/link";

export const metadata = {
  title: "使用指南 · AcmeTower",
  description: "AcmeTower（橡木塔）使用说明：核心概念、界面地图、上手流程与 Agent（MCP）接入。",
};

// ── content data (kept as data so the layout stays declarative & scannable) ──

const SECTIONS: { id: string; n: string; title: string }[] = [
  { id: "idea", n: "1", title: "这是什么 · 核心理念" },
  { id: "map", n: "2", title: "界面地图（逐页说明）" },
  { id: "glossary", n: "3", title: "关键概念" },
  { id: "start", n: "4", title: "五分钟上手" },
  { id: "agent", n: "5", title: "接入 AI Agent（MCP）" },
  { id: "safety", n: "6", title: "权限与安全" },
  { id: "faq", n: "7", title: "常见问题与最佳实践" },
];

const PAGE_MAP: { page: string; what: string }[] = [
  { page: "Project Home（我的项目）", what: "所有项目的卡片总览：当前阶段、进度、开放分支/问题、健康度；支持搜索与按状态筛选，右上角新建项目。" },
  { page: "Overview（概览）", what: "单个项目的“驾驶舱”：North Star、Current Mission（当前目标/现状/边界/下一步）、当前位置、关键信号与最近决策/检查点。" },
  { page: "Roadmap（主线）", what: "把项目拆成有序的阶段（Phase），每个 Phase 有目标、成功标准与范围约束，设定哪一个是“当前阶段”。" },
  { page: "Tasks（任务）", what: "Phase 下的可执行任务，带状态机（TODO→IN_PROGRESS→BLOCKED→COMPLETED）、进度百分比、优先级与负责人 Agent。" },
  { page: "Branches（分支）", what: "从主线临时派生的探索/实验线，记录来源、原因、目标与回收点；解决后回收并把结论带回主线。" },
  { page: "Decisions（决策）", what: "正式决策记录：背景/原因（Reason）、影响（Impact）、状态。人类在此拍板。" },
  { page: "Issues（问题）", what: "待办与风险登记，带严重程度与状态，供人和 Agent 共同维护。" },
  { page: "Proposals（提案）", what: "Agent 不能直接改动治理性内容时的“申请箱”：Agent 提交提案，人类批准后才生效。" },
  { page: "Checkpoints（检查点）", what: "阶段性的成果快照与交接说明，是“进展的证据”，会进入审计时间线。" },
  { page: "Timeline（时间线）", what: "全量审计流水：谁、何时、对哪个对象、做了什么、来源（人类/Web/MCP/系统），可按来源与关键词筛选。" },
  { page: "Agents（智能体）", what: "管理 AI Agent：创建/绑定 Agent、授予权限级别、签发与撤销 MCP 连接令牌。" },
  { page: "Settings（设置）", what: "项目元信息、North Star 编辑，以及状态（进行中/暂停/完成/归档）等治理操作。" },
];

const GLOSSARY: { term: string; def: string }[] = [
  { term: "Project State（项目状态）", def: "唯一的事实来源。Web 与 Agent 都只是在读写同一份状态，谁都不是“真相”本身。" },
  { term: "North Star（北极星）", def: "项目唯一终极目标：最终目标、交付物、成功标准、非目标、约束。所有工作都应向它对齐。" },
  { term: "Mainline / Phase / Task", def: "主线是达成 North Star 的有序阶段（Phase）；每个阶段拆成任务（Task）。" },
  { term: "Current Mission（当前使命）", def: "此刻这一轮的焦点：目标、成功标准、现状、不要做什么、完成后回到哪里、下一步动作。" },
  { term: "Branch（分支）", def: "从主线派生的一段聚焦探索，带回收点；处理完把结论合并回主线，避免污染主线。" },
  { term: "Checkpoint（检查点）", def: "进展证据与交接记录，回答“现在到哪了、拿到了什么、下一步是什么”。" },
  { term: "Agent & 权限级别", def: "AI 协作者。按项目授权：READ（只读）/ WORKING_WRITE（写内容与工作物）/ STRUCTURAL_WRITE（改结构）。" },
  { term: "MCP 连接（Credential）", def: "Agent 访问本项目的“钥匙”。令牌只生成一次并做哈希存储，可随时撤销。" },
];

const PERMISSIONS: { level: string; scope: string; can: string }[] = [
  { level: "READ", scope: "只读观察", can: "读取项目上下文、主线、当前使命、任务、分支、决策、开放问题、最近检查点、范围漂移检查。不能写。" },
  { level: "WORKING_WRITE", scope: "工作产出", can: "在 READ 之上：更新任务、推进/更新分支、登记问题、提交检查点、提交提案。不触碰治理与结构。" },
  { level: "STRUCTURAL_WRITE", scope: "结构调整", can: "在 WORKING_WRITE 之上：调整主线结构等更“动骨架”的写操作（按项目授权范围）。" },
  { level: "GOVERNANCE", scope: "治理（人类专属）", can: "批准决策/提案、编辑 North Star、变更项目状态等治理动作——不授予 Agent，只能在 Web 由人操作。" },
];

const AGENT_TOOLS_READ = [
  "project_get / project_get_context",
  "project_get_north_star",
  "project_get_roadmap",
  "project_get_current_mission",
  "project_get_task / project_get_branch",
  "project_get_decisions / project_get_open_issues",
  "project_get_recent_checkpoints",
  "project_check_drift（范围漂移检查）",
];
const AGENT_TOOLS_WRITE = [
  "project_update_task",
  "project_create_branch / project_update_branch / project_close_branch",
  "project_create_issue",
  "project_create_checkpoint",
  "project_create_proposal（提案给人类批准）",
];

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "acmetower": {
      "url": "https://project.acmerd.com/mcp",
      "headers": { "Authorization": "Bearer <粘贴生成的令牌>" }
    }
  }
}`;

// ── small presentational helpers ──

function Heading({ id, n, children }: { id: string; n: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-6 flex items-baseline gap-3 text-xl font-semibold tracking-tight">
      <span className="text-sm font-mono text-zinc-400 dark:text-zinc-600">{n}</span>
      {children}
    </h2>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-10">
      <span className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
        {n}
      </span>
      <div className="pt-0.5">
        <div className="font-medium">{title}</div>
        <div className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</div>
      </div>
    </li>
  );
}

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header>
        <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← 返回我的项目
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-3xl leading-none">🗼</span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AcmeTower 使用指南</h1>
            <p className="mt-1 text-sm text-zinc-500">多项目 AI Agent 协作与项目状态控制平台 · 怎么用</p>
          </div>
        </div>
        <p className="mt-5 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          一句话：<strong>Project State 是真相，Web 是人类控制面板，MCP 是 Agent 控制面板。</strong>{" "}
          你和多个 AI Agent 读写同一份项目状态，围绕每个项目唯一的{" "}
          <Link href="#glossary" className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:decoration-zinc-700">
            North Star
          </Link>{" "}
          持续推进，形成闭环：
          <span className="mx-1 font-mono text-[13px]">Project → Mission → Agent → MCP → Update → Checkpoint → Mainline</span>。
        </p>
      </header>

      {/* Table of contents */}
      <nav className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">目录</div>
        <ol className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <Link href={`#${s.id}`} className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                <span className="font-mono text-zinc-400">{s.n}.</span> {s.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-14">
        {/* 1 — idea */}
        <section>
          <Heading id="idea" n="1">
            这是什么 · 核心理念
          </Heading>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
            <p>
              AcmeTower 用来管理<strong>多个长期项目</strong>，并让人类与多个 AI Agent 在<strong>同一份项目状态</strong>上协作。
              它不是待办清单，而是“项目控制塔”：明确每个项目要往哪去（North Star）、此刻在做什么（Current Mission）、
              进展如何（Checkpoints/Timeline）、该由谁做（Agents），以及人和 Agent 如何安全地共同推进。
            </p>
            <ul className="list-disc space-y-1.5 pl-5 marker:text-zinc-400">
              <li>一个平台管多个项目；每个项目有唯一 North Star、有序主线（Phase → Task）。</li>
              <li>需要探索时可开<strong>分支（Branch）</strong>，解决后回收、把结论带回主线，主线始终干净。</li>
              <li>不同 Agent 通过统一的 <strong>MCP 网关</strong>读写同一个项目，各按其权限级别行动。</li>
              <li>关键对象都有<strong>版本号（乐观并发）</strong>、<strong>软删除</strong>，所有变更进入<strong>审计时间线</strong>。</li>
            </ul>
          </div>
        </section>

        {/* 2 — map */}
        <section>
          <Heading id="map" n="2">
            界面地图（逐页说明）
          </Heading>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
            登录后进入 <strong>Project Home</strong>，点进任一项目后左侧是它的工作区导航。各页面职责：
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-100 text-left dark:bg-zinc-900">
                  <th className="w-44 px-4 py-2.5 font-medium">页面</th>
                  <th className="px-4 py-2.5 font-medium">用来做什么</th>
                </tr>
              </thead>
              <tbody>
                {PAGE_MAP.map((r) => (
                  <tr key={r.page} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{r.page}</td>
                    <td className="px-4 py-2.5 leading-relaxed text-zinc-600 dark:text-zinc-400">{r.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3 — glossary */}
        <section>
          <Heading id="glossary" n="3">
            关键概念
          </Heading>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <dt className="font-medium text-zinc-900 dark:text-zinc-100">{g.term}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{g.def}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 4 — start */}
        <section>
          <Heading id="start" n="4">
            五分钟上手
          </Heading>
          <ol className="mt-5 space-y-6">
            <Step n={1} title="新建项目">
              在 Project Home 点 <span className="font-mono text-[13px]">+ 新建项目</span>，填名称/标识/描述即可。
            </Step>
            <Step n={2} title="写下 North Star">
              进入项目 → <strong>Settings</strong> 或 <strong>Overview</strong>，确定最终目标、交付物、成功标准、非目标与约束。这是所有判断的锚点。
            </Step>
            <Step n={3} title="规划主线 Roadmap">
              在 <strong>Roadmap</strong> 按阶段拆分（Phase 1、2、3…），为每个阶段写目标与成功标准，并把“当前阶段”设为进行中。
            </Step>
            <Step n={4} title="拆任务 Tasks">
              在当前阶段下建 <strong>Tasks</strong>，逐个推进状态与进度；任务可指派给某个 Agent。
            </Step>
            <Step n={5} title="对齐 Current Mission">
              <strong>Overview</strong> 会汇总此刻的目标、现状、边界（不要做什么）、完成后回到哪里、下一步——开工前先看它。
            </Step>
            <Step n={6} title="接入 Agent 并授权">
              在 <strong>Agents</strong> 创建/绑定 Agent、授予权限级别、签发 MCP 连接令牌（见下一节），让 Agent 通过 MCP 开始读写。
            </Step>
            <Step n={7} title="回收进展">
              Agent 提交 <strong>Checkpoint</strong> 汇报进展；遇到需要拍板的事走 <strong>Proposal → 人类在 Decisions 批准</strong>；
              一切都能在 <strong>Timeline</strong> 追溯。需要探索就开 <strong>Branch</strong>，完成后回收回主线。
            </Step>
          </ol>
        </section>

        {/* 5 — agent */}
        <section>
          <Heading id="agent" n="5">
            接入 AI Agent（MCP）
          </Heading>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
            <p>
              Agent 不是登录网页，而是通过统一的 <strong>MCP 网关</strong>（每个项目共享同一入口）接入。步骤在项目的{" "}
              <strong>Agents</strong> 页完成：
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 marker:text-zinc-400 marker:font-mono">
              <li>创建 Agent（或直接绑定一个已有 Agent 到本项目）。</li>
              <li>为它在<strong>本项目</strong>授予一个权限级别（不同项目可不同）。</li>
              <li>点“生成 MCP 连接”，得到一枚令牌——<strong>只显示一次</strong>，请立即复制保存。</li>
              <li>最省事：Agents 页有「转发给本地 Agent · 一键接入」块，一键复制“操作指引 + 该项目的 mcpServers 配置 + 令牌”，把这段直接发给装在你电脑上的 Agent，它就知道如何连接本项目并推进；撤销随时可在此页进行。</li>
            </ol>

            <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-[13px] leading-relaxed text-zinc-100 dark:border-zinc-800">
              <code>{CONFIG_SNIPPET}</code>
            </pre>
            <p className="text-sm text-zinc-500">
              其中 <span className="font-mono">url</span> 为本站域名加 <span className="font-mono">/mcp</span>；
              <span className="font-mono"> Authorization</span> 头里填入你生成的令牌（Bearer）。
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-sm font-semibold">Agent 能读取的工具</div>
                <ul className="mt-2 space-y-1 font-mono text-[12.5px] text-zinc-600 dark:text-zinc-400">
                  {AGENT_TOOLS_READ.map((t) => (
                    <li key={t}>· {t}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-sm font-semibold">Agent 能写入的工具（受权限约束）</div>
                <ul className="mt-2 space-y-1 font-mono text-[12.5px] text-zinc-600 dark:text-zinc-400">
                  {AGENT_TOOLS_WRITE.map((t) => (
                    <li key={t}>· {t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 6 — safety */}
        <section>
          <Heading id="safety" n="6">
            权限与安全
          </Heading>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
            每一次写操作都经过 <strong>应用逻辑 → 权限校验 → 数据校验</strong>，LLM/Agent 从不直接写数据库。
            权限按“项目 × Agent”授予，级别如下（逐级包含）：
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-100 text-left dark:bg-zinc-900">
                  <th className="w-40 px-4 py-2.5 font-medium">级别</th>
                  <th className="w-32 px-4 py-2.5 font-medium">范围</th>
                  <th className="px-4 py-2.5 font-medium">能做什么</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((p) => (
                  <tr key={p.level} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="px-4 py-2.5 font-mono text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{p.level}</td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{p.scope}</td>
                    <td className="px-4 py-2.5 leading-relaxed text-zinc-600 dark:text-zinc-400">{p.can}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-zinc-700 marker:text-zinc-400 dark:text-zinc-300">
            <li><strong>乐观并发：</strong>对象带 <span className="font-mono text-[13px]">version</span>；两个更新同一任务时，陈旧写入会被拒绝，不丢更新。</li>
            <li><strong>软删除：</strong>删除只打标记（<span className="font-mono text-[13px]">deleted_at</span>），历史与审计保留。</li>
            <li><strong>全量审计：</strong>谁、何时、改了什么、来源——都在 Timeline；治理性动作（GOVERNANCE）只有人能操作。</li>
            <li><strong>令牌安全：</strong>MCP 令牌只在生成时明文出现一次，系统仅存哈希与前缀；怀疑泄露立即撤销并重签。</li>
          </ul>
        </section>

        {/* 7 — faq */}
        <section>
          <Heading id="faq" n="7">
            常见问题与最佳实践
          </Heading>
          <div className="mt-4 space-y-5">
            <div>
              <div className="font-medium">先写 North Star，再谈执行。</div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                没有清晰 North Star，Agent 很容易“跑偏”。范围漂移检查（drift）也是以它为基准。
              </p>
            </div>
            <div>
              <div className="font-medium">把大目标拆成小任务，用 Current Mission 对齐当下。</div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                一个阶段对应若干任务；每次开工先看 Overview 的“当前使命”，明确“这一步要什么、不要碰什么、完成后回哪”。
              </p>
            </div>
            <div>
              <div className="font-medium">需要探索就开 Branch，别把主线弄乱。</div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                不确定的调查、并行方案都放到分支；得出结论后回收，把有效结果带回主线并记录结论。
              </p>
            </div>
            <div>
              <div className="font-medium">让 Agent 用最小够用权限。</div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                观察类 Agent 给 READ；执行类给 WORKING_WRITE；确有需要再给 STRUCTURAL_WRITE。治理永远留在人手里。
              </p>
            </div>
            <div>
              <div className="font-medium">频繁 Checkpoint，进展更可追溯。</div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                每次交付/告一段落就交一个检查点，Timeline 会自动记录，交接与复盘都靠它。
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
              遇到具体报错或想反馈问题，可用窗口右上角的反馈按钮提交。准备开始？{" "}
              <Link href="/projects" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100">
                前往我的项目 →
              </Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="mt-16 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        AcmeTower · AI Project Control Tower —— 让人类与 AI Agent 在同一份项目状态上，朝同一个 North Star 推进。
      </footer>
    </main>
  );
}
