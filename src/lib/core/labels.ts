/**
 * 全站共享的状态/来源中文标签（步骤 5b）。
 * UI 展示中文，值本身仍是数据库枚举（表单提交、URL 参数一律用英文枚举）。
 */

export const STATUS_LABELS: Record<string, string> = {
  // project
  ACTIVE: "进行中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  ARCHIVED: "已归档",
  // phase / task
  PLANNED: "计划中",
  TODO: "待开始",
  IN_PROGRESS: "进行中",
  BLOCKED: "受阻",
  CANCELLED: "已取消",
  // branch / issue
  OPEN: "未关闭",
  RESOLVED: "已解决",
  ABANDONED: "已放弃",
  WONT_FIX: "不修复",
  // decision / proposal
  PROPOSED: "已提出",
  APPROVED: "已批准",
  REJECTED: "已拒绝",
  SUPERSEDED: "已被取代",
  PENDING: "待审议",
  PARKED: "已搁置",
  // health
  GREEN: "健康",
  YELLOW: "有风险",
  RED: "危险",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** activity_events.source：谁干的 */
export const SOURCE_LABELS: Record<string, string> = {
  ALL: "全部",
  WEB: "网页",
  MCP: "Agent",
  HUMAN: "人工",
  SYSTEM: "系统",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
