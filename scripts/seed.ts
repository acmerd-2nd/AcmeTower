/**
 * V0.1 seed — creates the default workspace, a demo human owner, and the first
 * real project: AcmeTower managing its OWN development (总纲 §81).
 * Idempotent: existing rows (by slug) are left untouched.
 * Run: npm run db:seed
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import {
  agents,
  northStars,
  phases,
  projectAgents,
  projects,
  tasks,
  users,
  workspaces,
} from "../src/lib/db/schema";

const envPairs: [string, string][] = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .filter((l) => l && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]);
for (const [k, v] of envPairs) {
  if (v) process.env[k] ||= v;
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing — run from the project root where .env.local exists.");
}

const db = getDb();

async function main() {
  // 1. Workspace
  let [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, "personal"));
  if (!ws) {
    [ws] = await db
      .insert(workspaces)
      .values({ name: "Personal", slug: "personal" })
      .returning();
  }
  console.log("workspace:", ws.slug, ws.id);

  // 2. Demo owner (human)
  let [owner] = await db.select().from(users).where(eq(users.email, "owner@acmetower.local"));
  if (!owner) {
    [owner] = await db
      .insert(users)
      .values({ email: "owner@acmetower.local", displayName: "华子哥", isActive: true })
      .returning();
  }
  console.log("owner:", owner.displayName ?? owner.email, owner.id);

  // 3. Self-management project
  const projectSlug = "acmetower";
  let [project] = await db.select().from(projects).where(eq(projects.slug, projectSlug));
  if (project) {
    console.log("project already exists, skipping seed:", project.name);
    return;
  }
  [project] = await db
    .insert(projects)
    .values({
      workspaceId: ws.id,
      name: "AcmeTower — AI Project Control Tower",
      slug: projectSlug,
      icon: "🗼",
      description: "多项目 AI Agent 协作与项目状态控制平台。用本产品治理它自身的开发。",
      status: "ACTIVE",
      health: "GREEN",
      createdBy: owner.id,
    })
    .returning();

  await db.insert(northStars).values({
    projectId: project.id,
    name: "AcmeTower V0.1 — Project Foundation",
    finalGoal:
      "建立一个让多个 AI Agent 长期协作完成复杂项目的平台：项目不失忆、主线清晰、分支可回收、决策可追溯。",
    deliverable: "可部署的 Web 应用（Next.js on Cloudflare）+ 统一 /mcp Gateway。",
    successCriteria:
      "1. 管理多个项目\n2. 管理主线与分支\n3. Agent 通过 MCP 读/写项目\n4. 不同 Agent 可顺利接手\n5. 项目状态可追溯（Checkpoint / Decision / Activity）",
    nonGoals:
      "V0.1 不做：自动规划、Agent 自动调度、复杂 AI Workflow、代码执行、多人团队权限、商业化、移动 App、聊天系统。",
    constraints: "唯一真相源是 Project Core State；Web UI 与 MCP 都只是控制面板。",
  });

  // 4. Phases (总纲/§81)
  const phaseDefs = [
    { name: "Project Foundation", status: "ACTIVE" as const, order: 1 },
    { name: "Project Core", status: "PLANNED" as const, order: 2 },
    { name: "MCP", status: "PLANNED" as const, order: 3 },
    { name: "Agent Integration", status: "PLANNED" as const, order: 4 },
    { name: "Production Deployment", status: "PLANNED" as const, order: 5 },
  ];
  const insertedPhases = await db
    .insert(phases)
    .values(
      phaseDefs.map((p) => ({
        projectId: project.id,
        name: `Phase ${p.order} · ${p.name}`,
        orderIndex: p.order,
        status: p.status,
        goal: p.name,
      })),
    )
    .returning();
  const ph1 = insertedPhases[0];

  // 5. A few tasks in Phase 1 (this is where Step numbers live)
  const t1 = await db
    .insert(tasks)
    .values({
      projectId: project.id,
      phaseId: ph1.id,
      name: "Step 1 工程骨架",
      purpose: "建立可部署、可开发的项目工程与部署管线",
      successCriteria: "next build 与 opennext cf:build 均通过",
      status: "COMPLETED",
      progress: 100,
      priority: "HIGH",
    })
    .returning();
  const t2 = await db
    .insert(tasks)
    .values({
      projectId: project.id,
      phaseId: ph1.id,
      name: "Step 2 数据模型",
      purpose: "固定 V0.1 真相源：数据库 + MCP 接口先行",
      successCriteria: "16 核心表 + 迁移应用到 Supabase，连接可用",
      status: "IN_PROGRESS",
      progress: 60,
      priority: "HIGH",
    })
    .returning();

  // 6. Current position pointers
  await db
    .update(projects)
    .set({ currentPhaseId: ph1.id, currentTaskId: t2[0].id })
    .where(eq(projects.id, project.id));

  // 7. Agents bound to project
  const [codex] = await db
    .insert(agents)
    .values({ name: "Codex", provider: "OpenAI", role: "Developer", status: "ACTIVE" })
    .returning();
  const [qwen] = await db
    .insert(agents)
    .values({ name: "QwenWork", provider: "Qwen", role: "Developer", status: "ACTIVE" })
    .returning();
  await db.insert(projectAgents).values([
    { projectId: project.id, agentId: codex.id, role: "Developer", permissionLevel: "STRUCTURAL_WRITE" },
    { projectId: project.id, agentId: qwen.id, role: "Developer", permissionLevel: "WORKING_WRITE" },
  ]);

  console.log(
    "seeded project:",
    project.name,
    "| tasks:",
    t1[0].name,
    "/",
    t2[0].name,
    "| agents: Codex, QwenWork",
  );
  console.log("✅ seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
