# AcmeTower — AI Project Control Tower (橡木塔)

多项目 AI Agent 协作与项目状态控制平台。**V0.1**。

> Project State 是真相；Web UI 是人类控制面板；MCP 是 Agent 控制面板。

一个平台管理多个长期项目；每个项目有唯一的 North Star、主线（Mainline）、可回收的分支（Branch）、正式决策（Decision）、问题（Issue）、检查点（Checkpoint）；不同 AI Agent 通过统一的 MCP Gateway 读写同一份 Project State。

## 技术栈

- **运行时/部署**：Next.js 16（App Router）+ `@opennextjs/cloudflare` → Cloudflare Workers（单 Worker 同时承载 Web / API / MCP）
- **数据库**：PostgreSQL（Supabase），ORM = **Drizzle**
- **人类登录**：Supabase Auth
- **Agent 接口**：官方 **MCP TypeScript SDK v2**（`@modelcontextprotocol/server`），统一 `/mcp` gateway（不按项目拆 Server）

## 数据访问层（HTTPS 传输）

生产 `/mcp` 曾间歇性 HTTP 1101：Hyperdrive→Postgres 的 TCP 隧道会卡住。根治方案是走 Cloudflare 自身的 HTTPS/HTTP-2 出口——读用 Supabase PostgREST，写用 `SECURITY DEFINER` RPC（`service_role`；表上 RLS 关闭，安全等价于应用层鉴权）。分层与收敛：

- **读（`/mcp`）**：`lib/mcp/httpdata.ts` over `lib/core/rest.ts`（V0.1）。
- **写（共享域）**：`lib/data/write-rpc.ts` → RPC（`db/mcp_rpc.sql`，29 个 `mcp_*` 函数；Web 与 /mcp 复用同一套）（V0.2）。
- **Web 项目数据读**：`lib/data/{project,reads,timeline,agents,credentials,projects}.ts` 的读函数已委派到同一 `httpdata` HTTPS 读层（V0.3）——登录后的页面加载不再依赖 Hyperdrive。
- **仍留在 Drizzle/Hyperdrive（按 V0.2 范围有意保留）**：人类身份鉴权（`auth/session` profile 镜像）、以及仅 Web 侧的身份写操作（Agent 建绑/授权、MCP 凭据签发撤销、项目生命周期）。

部署注意：`next build` 期间 `initOpenNextCloudflareForDev()`（仅 `next dev` 需要）会在 Node 24 下因本地 Hyperdrive 仿真的未处理 rejection 崩溃——已在 `next.config.ts` 用 `NODE_ENV !== "production"` 守卫。`opennextjs-cloudflare build/deploy` 需本地设 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<DATABASE_URL>`（仅构建期仿真用，线上仍用 `HYPERDRIVE` id 绑定）。

## 本地开发

1. 复制 `.env.example` 为 `.env.local` 并填入真实值（本地密码本持有，切勿提交）。
   - `DATABASE_URL`：Supabase 连接串（本地/开发用 session pooler 5432）。
   - `NEXT_PUBLIC_SUPABASE_*`、`SUPABASE_URL` 等。
2. `npm install`
3. `npm run db:push`（或 `db:migrate`）应用 schema
4. `npm run dev` → http://localhost:3000（自动跳转 `/projects`）

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地 Next 开发服务器 |
| `npm run build` / `typecheck` / `lint` | 构建 / 类型 / 静态检查 |
| `npm run db:generate` / `db:push` / `db:migrate` / `db:studio` | Drizzle 迁移与浏览 |
| `npm run db:seed` | 写入示例数据 |
| `npm run cf:build` | 生成 Cloudflare OpenNext bundle（`.open-next/worker.js`） |
| `npm run cf:preview` | 本地用 wrangler 预览生产构建 |
| `npm run cf:deploy` | 部署到 Cloudflare |

## 目录结构（规划）

```
src/
  app/                # 人类 Web UI（Project Home / Project Space ...）+ route handlers
    projects/         # 多项目首页与各项目空间
    mcp/              # MCP Gateway（/mcp）
  lib/
    db/               # Drizzle schema + client
    auth/             # Supabase server/browser clients
    core/             # 领域逻辑：状态机、权限、Current Mission、Drift
    mcp/              # MCP server 与 tools
scripts/              # seed / 运维脚本
```

## 文档

- `总纲.txt` — 产品总体设计与 V0.1–V1.0 路线图
- `v0.1设计文档.txt` — V0.1 开工规格（页面、数据模型、状态机、MCP、权限、验收标准）

## V0.1 范围

见 `v0.1设计文档.txt` §3、§83、§84。核心闭环：
`Project → Mission → Agent → MCP → Update → Checkpoint → Mainline`。
不做：自动规划、Agent 自动调度、复杂 AI Workflow、代码执行、多人团队权限、商业化。
