/**
 * Cron 任务定义
 */
export interface CronTask {
  id: string;
  agentId: string;
  options: Record<string, unknown>;
  intervalSeconds: number;
  enabled: boolean;
  createdAt: string;
  lastExecutedAt: string | null;
  executionCount: number;
  userId?: string; // 预留用于多用户支持
}

/**
 * 创建 Cron 任务的输入参数
 */
export interface CronTaskCreateInput {
  agentId: string;
  options: Record<string, unknown>;
  intervalSeconds: number;
  userId?: string;
}

/**
 * 更新 Cron 任务的输入参数
 */
export interface CronTaskUpdateInput {
  intervalSeconds?: number;
  options?: Record<string, unknown>;
}

/**
 * API 响应类型
 */
export interface CronTaskResponse {
  data: CronTask;
}

export interface CronTaskListResponse {
  data: CronTask[];
}

export interface CronTaskDeleteResponse {
  data: {
    success: boolean;
  };
}

