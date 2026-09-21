/**
 * 项目导出（右键菜单「导出 JSON」的后端装配）。
 * 全部走 HTTPS 读层（httpdata），不碰 Hyperdrive；不含任何密钥
 * （凭证只导出 name/prefix/权限/撤销时间，绝不含 token_hash）。
 */
import {
  httpProjectRow,
  httpNorthStar,
  httpPhaseRows,
  httpTaskListRows,
  httpBranchRows,
  httpIssueRows,
  httpDecisionRows,
  httpProposalRows,
  httpCheckpointRows,
  httpProjectAgentRows,
  httpCredentialRows,
  httpTimeline,
} from "@/lib/mcp/httpdata";

export const EXPORT_SCHEMA = "acmetower-export@1";

export async function buildProjectExport(projectId: string): Promise<unknown | null> {
  const project = await httpProjectRow(projectId);
  if (!project) return null;
  const [northStar, phases, tasks, branches, issues, decisions, proposals, checkpoints, agents, credentials, timeline] =
    await Promise.all([
      httpNorthStar(projectId),
      httpPhaseRows(projectId),
      httpTaskListRows(projectId),
      httpBranchRows(projectId),
      httpIssueRows(projectId),
      httpDecisionRows(projectId),
      httpProposalRows(projectId),
      httpCheckpointRows(projectId),
      httpProjectAgentRows(projectId),
      httpCredentialRows(projectId),
      httpTimeline(projectId, { limit: 1000 }),
    ]);
  return {
    schema: EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    project,
    northStar,
    phases,
    tasks,
    branches,
    issues,
    decisions,
    proposals,
    checkpoints,
    agents: agents.map((a) => ({
      agentId: a.agentId,
      name: a.name,
      provider: a.provider ?? null,
      role: a.role ?? null,
      permissionLevel: a.permissionLevel,
      enabled: a.enabled,
    })),
    credentials: credentials.map((c) => ({
      id: c.id,
      name: c.name,
      tokenPrefix: c.tokenPrefix,
      permissionLevel: c.permissionLevel,
      revokedAt: c.revokedAt,
      createdAt: c.createdAt,
    })),
    timeline,
  };
}
