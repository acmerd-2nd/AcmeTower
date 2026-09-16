import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * AcmeTower V0.1 data model.
 * Fixed to v0.1设计文档.txt (§9–§29 entities, §46 tables, §48–§49 audit,
 * §65 soft-delete, §74–§75 optimistic concurrency / version).
 *
 * Design rules honored here:
 *  - Every domain row is scoped by project_id (multi-project isolation, Test 1).
 *  - Key mutable objects carry `version` for optimistic concurrency (Test 12).
 *  - No physical delete of critical rows: `archived_at` / `deleted_at` (soft).
 *  - Polymorphic references (branch source / return point) use *_type + *_id.
 *  - Audit is a single append-only `activity_events` stream (§48–§50, §76).
 */

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export const projectStatus = pgEnum("project_status", [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
]);
export const health = pgEnum("health", ["GREEN", "YELLOW", "RED"]);
export const phaseStatus = pgEnum("phase_status", [
  "PLANNED",
  "ACTIVE",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);
export const taskStatus = pgEnum("task_status", [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);
export const taskPriority = pgEnum("task_priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);
export const branchStatus = pgEnum("branch_status", [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "RESOLVED",
  "ABANDONED",
]);
export const issueSeverity = pgEnum("issue_severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export const issueStatus = pgEnum("issue_status", [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "WONT_FIX",
]);
export const decisionStatus = pgEnum("decision_status", [
  "PROPOSED",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
]);
export const proposalStatus = pgEnum("proposal_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PARKED",
]);
export const proposalKind = pgEnum("proposal_kind", [
  "NORTH_STAR_CHANGE",
  "SCOPE_CHANGE",
  "PARKING_LOT",
  "OTHER",
]);
export const agentStatus = pgEnum("agent_status", ["ACTIVE", "DISABLED"]);
export const sessionStatus = pgEnum("session_status", [
  "ACTIVE",
  "COMPLETED",
  "ABORTED",
]);
export const permissionLevel = pgEnum("permission_level", [
  "READ",
  "WORKING_WRITE",
  "STRUCTURAL_WRITE",
  "GOVERNANCE",
]);
// Who performed an action / created a row.
export const actorType = pgEnum("actor_type", ["HUMAN", "AGENT", "SYSTEM"]);
// Where an action came from (audit source, §49).
export const actionSource = pgEnum("action_source", [
  "HUMAN",
  "WEB",
  "MCP",
  "SYSTEM",
]);
// Polymorphic target types for branch source / return point.
export const nodeType = pgEnum("node_type", [
  "PROJECT",
  "PHASE",
  "TASK",
  "BRANCH",
]);

const ts = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();
const nullableTs = (name: string) => timestamp(name, { withTimezone: true });

// ─────────────────────────────────────────────────────────────
// Workspace / identity
// ─────────────────────────────────────────────────────────────

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerId: uuid("owner_id"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [uniqueIndex("workspaces_slug_ux").on(t.slug)],
);

// Local mirror of a human user; `authUserId` maps to Supabase `auth.users.id`.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id"),
    email: text("email").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("users_email_ux").on(t.email),
    uniqueIndex("users_auth_user_id_ux").on(t.authUserId),
  ],
);

// ─────────────────────────────────────────────────────────────
// Project + North Star
// ─────────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    icon: text("icon"), // emoji or short glyph
    description: text("description"),
    status: projectStatus("status").notNull().default("ACTIVE"),
    health: health("health").notNull().default("GREEN"),
    // Current position (denormalized pointers for fast card/dashboard reads).
    currentPhaseId: uuid("current_phase_id"),
    currentTaskId: uuid("current_task_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    archivedAt: nullableTs("archived_at"),
    deletedAt: nullableTs("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("projects_slug_ux").on(t.slug),
    index("projects_workspace_idx").on(t.workspaceId),
    index("projects_status_idx").on(t.status),
  ],
);

// 1:1 North Star — the project's highest-level truth (Governance-protected).
export const northStars = pgTable(
  "north_star",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name"),
    description: text("description"),
    finalGoal: text("final_goal"),
    deliverable: text("deliverable"),
    successCriteria: text("success_criteria"), // markdown text
    nonGoals: text("non_goals"), // markdown text ("明确不做什么")
    constraints: text("constraints"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [uniqueIndex("north_star_project_ux").on(t.projectId)],
);

// ─────────────────────────────────────────────────────────────
// Roadmap: Phase → Task → Branch
// ─────────────────────────────────────────────────────────────

export const phases = pgTable(
  "phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    status: phaseStatus("status").notNull().default("PLANNED"),
    goal: text("goal"),
    successCriteria: text("success_criteria"),
    scope: text("scope"), // scope lock text — what this phase covers / excludes
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    deletedAt: nullableTs("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("phases_project_order_idx").on(t.projectId, t.orderIndex)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "restrict" }),
    parentTaskId: uuid("parent_task_id").references((): any => tasks.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    purpose: text("purpose"), // "为什么做" (§13)
    successCriteria: text("success_criteria"),
    status: taskStatus("status").notNull().default("TODO"),
    progress: integer("progress").notNull().default(0), // 0–100
    priority: taskPriority("priority").notNull().default("MEDIUM"),
    currentAgentId: uuid("current_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    completedAt: nullableTs("completed_at"),
    deletedAt: nullableTs("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_phase_idx").on(t.phaseId),
    index("tasks_status_idx").on(t.status),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceType: nodeType("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    parentBranchId: uuid("parent_branch_id").references((): any => branches.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    reason: text("reason").notNull(), // why the branch exists (§16)
    goal: text("goal").notNull(),
    successCriteria: text("success_criteria"),
    returnPointType: nodeType("return_point_type").notNull().default("TASK"),
    returnPointId: uuid("return_point_id").notNull(), // must exist (§37)
    status: branchStatus("status").notNull().default("OPEN"),
    progress: integer("progress").notNull().default(0),
    createdByType: actorType("created_by_type").notNull().default("AGENT"),
    createdById: uuid("created_by_id"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    closedAt: nullableTs("closed_at"),
    resolution: text("resolution"), // recorded on close (§17)
    deletedAt: nullableTs("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    index("branches_project_idx").on(t.projectId),
    index("branches_status_idx").on(t.status),
    index("branches_source_idx").on(t.sourceType, t.sourceId),
  ],
);

// ─────────────────────────────────────────────────────────────
// Issues / Decisions / Proposals / Checkpoints
// ─────────────────────────────────────────────────────────────

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    source: text("source"), // where it was discovered
    severity: issueSeverity("severity").notNull().default("MEDIUM"),
    status: issueStatus("status").notNull().default("OPEN"),
    relatedPhaseId: uuid("related_phase_id").references(() => phases.id, {
      onDelete: "set null",
    }),
    relatedTaskId: uuid("related_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    relatedBranchId: uuid("related_branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id),
    createdById: uuid("created_by_id"), // may be an agent id too
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    resolvedAt: nullableTs("resolved_at"),
    resolution: text("resolution"),
    deletedAt: nullableTs("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    index("issues_project_idx").on(t.projectId),
    index("issues_status_idx").on(t.status),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    alternatives: text("alternatives"),
    impact: text("impact"),
    status: decisionStatus("status").notNull().default("PROPOSED"),
    createdBy: text("created_by"), // "Human" | agent name
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    approvedAt: nullableTs("approved_at"),
    supersededBy: uuid("superseded_by").references((): any => decisions.id, {
      onDelete: "set null",
    }),
    deletedAt: nullableTs("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("decisions_project_idx").on(t.projectId)],
);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: proposalKind("kind").notNull().default("OTHER"),
    title: text("title").notNull(),
    reason: text("reason"),
    description: text("description"),
    impact: text("impact"),
    relatedTaskId: uuid("related_task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    status: proposalStatus("status").notNull().default("PENDING"),
    createdByType: actorType("created_by_type").notNull().default("AGENT"),
    createdById: uuid("created_by_id"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: nullableTs("decided_at"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    index("proposals_project_idx").on(t.projectId),
    index("proposals_status_idx").on(t.status),
  ],
);

export const checkpoints = pgTable(
  "checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    sessionId: uuid("session_id"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    completedItems: jsonb("completed_items").$type<string[]>().notNull().default([]),
    unfinishedItems: jsonb("unfinished_items").$type<string[]>().notNull().default([]),
    newIssues: jsonb("new_issues").$type<string[]>().notNull().default([]),
    newDecisions: jsonb("new_decisions").$type<string[]>().notNull().default([]),
    newBranches: jsonb("new_branches").$type<string[]>().notNull().default([]),
    currentStatus: text("current_status"),
    nextAction: text("next_action"),
    createdByType: actorType("created_by_type").notNull().default("AGENT"),
    createdById: uuid("created_by_id"),
    createdAt: ts("created_at"),
    deletedAt: nullableTs("deleted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [index("checkpoints_project_idx").on(t.projectId)],
);

// ─────────────────────────────────────────────────────────────
// Agents / sessions / project bindings / MCP credentials
// ─────────────────────────────────────────────────────────────

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    provider: text("provider"), // "OpenAI", "Anthropic", ... (descriptive only)
    description: text("description"),
    role: text("role"), // Developer / Planner / Reviewer / Researcher / General
    status: agentStatus("status").notNull().default("ACTIVE"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    deletedAt: nullableTs("deleted_at"),
  },
  (t) => [index("agents_name_idx").on(t.name)],
);

export const projectAgents = pgTable(
  "project_agents",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    role: text("role"),
    permissionLevel: permissionLevel("permission_level").notNull().default("READ"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("project_agents_pk").on(t.projectId, t.agentId),
    index("project_agents_agent_idx").on(t.agentId),
  ],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    status: sessionStatus("status").notNull().default("ACTIVE"),
    startedAt: ts("started_at"),
    endedAt: nullableTs("ended_at"),
    lastActivityAt: ts("last_activity_at"),
  },
  (t) => [index("agent_sessions_project_idx").on(t.projectId)],
);

// MCP connection credential. Token is stored ONLY as a SHA-256 hash; the plaintext
// is shown once at creation. A credential is scoped to one project (Test 10, §42–§43).
export const mcpCredentials = pgTable(
  "mcp_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(), // first 8 chars for display only
    permissionLevel: permissionLevel("permission_level").notNull().default("READ"),
    createdAt: ts("created_at"),
    lastUsedAt: nullableTs("last_used_at"),
    expiresAt: nullableTs("expires_at"),
    revokedAt: nullableTs("revoked_at"),
  },
  (t) => [
    uniqueIndex("mcp_credentials_hash_ux").on(t.tokenHash),
    index("mcp_credentials_project_idx").on(t.projectId),
  ],
);

// ─────────────────────────────────────────────────────────────
// Audit / timeline
// ─────────────────────────────────────────────────────────────

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    actorType: actorType("actor_type").notNull(),
    actorId: uuid("actor_id"), // user or agent id
    actorLabel: text("actor_label"), // display name
    source: actionSource("source").notNull(), // HUMAN | WEB | MCP | SYSTEM
    action: text("action").notNull(), // e.g. TASK_UPDATED, BRANCH_CREATED ...
    entityType: text("entity_type"), // project|phase|task|branch|issue|decision|proposal|checkpoint|agent
    entityId: uuid("entity_id"),
    summary: text("summary"),
    before: jsonb("before"),
    after: jsonb("after"),
    meta: jsonb("meta"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("activity_events_project_idx").on(t.projectId),
    index("activity_events_created_idx").on(t.createdAt),
  ],
);

// ─────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type NorthStar = typeof northStars.$inferSelect;
export type Phase = typeof phases.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
export type Issue = typeof issues.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type Checkpoint = typeof checkpoints.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type ProjectAgent = typeof projectAgents.$inferSelect;
export type AgentSession = typeof agentSessions.$inferSelect;
export type McpCredential = typeof mcpCredentials.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
