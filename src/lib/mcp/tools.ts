/**
 * MCP tool registry + wiring (v0.1设计文档 §32–§41).
 *
 * Each tool declares the minimum PermissionLevel it needs (§29). The gateway
 * registers only the tools the caller's principal can use (tools/list reflects the
 * authorization chain), and each handler re-checks the permission as defense in
 * depth before touching the shared data layer. Every mutation flows through the
 * SAME App Logic → Permission → Validation writes as the web UI (no direct DB),
 * with source=MCP auditing (Step 10 adds the write/structure/drift tools).
 *
 * Step 9 ships the READ surface that proves the chain end-to-end. Step 10 appends
 * WORKING_WRITE / STRUCTURAL_WRITE / drift tools to MCP_TOOLS below.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { getProjectSpace } from "@/lib/data/project";
import { hasPermission, principalFromCtx, type McpPrincipal, type PermissionLevel } from "@/lib/mcp/principal";

type Json = Record<string, unknown>;

export interface McpToolSpec {
  name: string;
  title: string;
  description: string;
  required: PermissionLevel;
  readOnly: boolean;
  input: z.ZodTypeAny;
  run: (args: any, principal: McpPrincipal) => Promise<Json>;
}

function text(data: Json): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function projectRow(projectId: string) {
  const [p] = await getDb().select().from(projects).where(eq(projects.id, projectId));
  return p ?? null;
}

export const MCP_TOOLS: McpToolSpec[] = [
  {
    name: "mcp_whoami",
    title: "Who am I",
    description:
      "Return the authenticated MCP identity for this connection: which project it is scoped to, its permission level, and the token prefix. Useful to confirm the auth chain.",
    required: "READ",
    readOnly: true,
    input: z.object({}),
    async run(_args, principal) {
      return {
        project_id: principal.projectId,
        permission_level: principal.permissionLevel,
        credential_name: principal.credentialName,
        credential_id: principal.credentialId,
        agent_id: principal.agentId,
        token_prefix: principal.tokenPrefix,
      };
    },
  },
  {
    name: "project_get",
    title: "Get project",
    description: "Return the authorized project's core record (name, status, health, version, current pointers).",
    required: "READ",
    readOnly: true,
    input: z.object({}),
    async run(_args, principal) {
      const p = await projectRow(principal.projectId);
      if (!p) throw new Error("project not found");
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        status: p.status,
        health: p.health,
        current_phase_id: p.currentPhaseId,
        current_task_id: p.currentTaskId,
        version: p.version,
      };
    },
  },
  {
    name: "project_get_context",
    title: "Get project context",
    description:
      "The flagship read: everything an agent needs to safely resume work — project, North Star, current position (phase/task/branch), current mission, and recent decisions / open issues / checkpoints. §34.",
    required: "READ",
    readOnly: true,
    input: z.object({}),
    async run(_args, principal) {
      const space = await getProjectSpace(principal.projectId);
      if (!space) throw new Error("project not found");
      return {
        project: { id: space.project.id, name: space.project.name, status: space.project.status, health: space.project.health },
        north_star: space.northStar
          ? {
              name: space.northStar.name,
              final_goal: space.northStar.finalGoal,
              deliverable: space.northStar.deliverable,
              success_criteria: space.northStar.successCriteria,
              non_goals: space.northStar.nonGoals,
              constraints: space.northStar.constraints,
            }
          : null,
        current_position: {
          phase: space.currentPhase ? { id: space.currentPhase.id, name: space.currentPhase.name, status: space.currentPhase.status, progress: space.currentPhase.progress } : null,
          task: space.currentTask ? { id: space.currentTask.id, name: space.currentTask.name, status: space.currentTask.status, progress: space.currentTask.progress } : null,
          branch: space.currentBranch ? { id: space.currentBranch.id, name: space.currentBranch.name, status: space.currentBranch.status } : null,
        },
        current_mission: space.mission,
        signals: {
          open_branches: space.signals.openBranches,
          open_issues: space.signals.openIssues,
          pending_proposals: space.signals.pendingProposals,
          recent_decisions: space.signals.recentDecisions.map((d) => ({ id: d.id, title: d.title, status: d.status })),
          recent_checkpoints: space.signals.recentCheckpoints.map((c) => ({ id: c.id, summary: c.summary, created_at: c.createdAt })),
        },
      };
    },
  },
];

/** Register only the tools this principal's permission level allows onto a server. */
export function registerTools(server: McpServer, principal: McpPrincipal): void {
  for (const spec of MCP_TOOLS) {
    if (!hasPermission(principal.permissionLevel, spec.required)) continue; // chain: Tool ← Permission
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.input,
        annotations: { readOnlyHint: spec.readOnly, openWorldHint: false },
      },
      async (args, ctx) => {
        const p = principalFromCtx(ctx) ?? principal; // defense: prefer live ctx
        if (!hasPermission(p.permissionLevel, spec.required)) {
          return fail(`insufficient permission: ${spec.name} requires ${spec.required}`);
        }
        try {
          return text(await spec.run(args, p));
        } catch (e) {
          return fail(`${spec.name} failed: ${(e as Error).message ?? "error"}`);
        }
      },
    );
  }
}
