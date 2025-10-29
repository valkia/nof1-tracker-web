import "server-only";

import type { CommandOptions } from "@/server/core/types/command";
import { executeFollowAgent } from "./trading";
import type { CronTask, CronTaskCreateInput } from "@/types/cron";

// 重新导出类型以便服务器端代码使用
export type { CronTask, CronTaskCreateInput };

/**
 * Cron 任务管理器
 * 用于管理定时执行的跟单任务
 * 
 * 注意：当前实现为内存存储，重启后会丢失
 * TODO: 后续可以添加持久化存储（JSON 文件或数据库）
 */
class CronManager {
  private tasks: Map<string, CronTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;
  private executingTasks: Set<string> = new Set(); // 执行锁，防止重叠执行

  /**
   * 初始化管理器（可用于加载持久化数据）
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // TODO: 从持久化存储加载任务
    this.isInitialized = true;
    console.log("[CronManager] 已初始化");
  }

  /**
   * 创建新的 cron 任务
   */
  async createTask(input: CronTaskCreateInput): Promise<CronTask> {
    await this.initialize();

    const task: CronTask = {
      id: this.generateTaskId(),
      agentId: input.agentId,
      options: input.options,
      intervalSeconds: input.intervalSeconds,
      enabled: false, // 默认不启用，需要手动启动
      createdAt: new Date().toISOString(),
      lastExecutedAt: null,
      executionCount: 0,
      userId: input.userId,
    };

    this.tasks.set(task.id, task);
    console.log(`[CronManager] 创建任务: ${task.id}, Agent: ${task.agentId}`);

    // TODO: 持久化保存任务
    return task;
  }

  /**
   * 获取所有任务（可按用户过滤）
   */
  async getAllTasks(userId?: string): Promise<CronTask[]> {
    await this.initialize();

    const allTasks = Array.from(this.tasks.values());
    
    if (userId) {
      return allTasks.filter((task) => task.userId === userId);
    }

    return allTasks;
  }

  /**
   * 获取单个任务
   */
  async getTask(taskId: string, userId?: string): Promise<CronTask | null> {
    await this.initialize();

    const task = this.tasks.get(taskId);
    
    if (!task) {
      return null;
    }

    // 如果指定了 userId，验证权限
    if (userId && task.userId !== userId) {
      return null;
    }

    return task;
  }

  /**
   * 启动任务
   */
  async startTask(taskId: string, userId?: string): Promise<CronTask> {
    await this.initialize();

    const task = await this.getTask(taskId, userId);
    
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    if (task.enabled) {
      return task; // 已经在运行
    }

    task.enabled = true;
    this.tasks.set(taskId, task);

    // 设置定时器
    const timer = setInterval(() => {
      this.executeTask(taskId);
    }, task.intervalSeconds * 1000);

    this.timers.set(taskId, timer);
    console.log(`[CronManager] 启动任务: ${taskId}, 间隔: ${task.intervalSeconds}s`);

    // TODO: 持久化更新任务状态
    return task;
  }

  /**
   * 停止任务
   */
  async stopTask(taskId: string, userId?: string): Promise<CronTask> {
    await this.initialize();

    const task = await this.getTask(taskId, userId);
    
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    if (!task.enabled) {
      return task; // 已经停止
    }

    task.enabled = false;
    this.tasks.set(taskId, task);

    // 清除定时器
    const timer = this.timers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(taskId);
    }

    console.log(`[CronManager] 停止任务: ${taskId}`);

    // TODO: 持久化更新任务状态
    return task;
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string, userId?: string): Promise<void> {
    await this.initialize();

    const task = await this.getTask(taskId, userId);
    
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    // 如果任务正在运行，先停止
    if (task.enabled) {
      await this.stopTask(taskId, userId);
    }

    this.tasks.delete(taskId);
    console.log(`[CronManager] 删除任务: ${taskId}`);

    // TODO: 从持久化存储删除
  }

  /**
   * 更新任务配置
   */
  async updateTask(
    taskId: string,
    updates: Partial<Pick<CronTask, "intervalSeconds" | "options">>,
    userId?: string,
  ): Promise<CronTask> {
    await this.initialize();

    const task = await this.getTask(taskId, userId);
    
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    const wasEnabled = task.enabled;

    // 如果任务在运行且要更新间隔，需要重启
    if (wasEnabled && updates.intervalSeconds !== undefined) {
      await this.stopTask(taskId, userId);
    }

    // 更新配置
    if (updates.intervalSeconds !== undefined) {
      task.intervalSeconds = updates.intervalSeconds;
    }
    if (updates.options !== undefined) {
      task.options = { ...task.options, ...updates.options };
    }

    this.tasks.set(taskId, task);

    // 如果之前在运行，重新启动
    if (wasEnabled && updates.intervalSeconds !== undefined) {
      await this.startTask(taskId, userId);
    }

    console.log(`[CronManager] 更新任务: ${taskId}`);

    // TODO: 持久化更新
    return task;
  }

  /**
   * 执行任务（内部方法）
   */
  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);

    if (!task || !task.enabled) {
      return;
    }

    // 检查执行锁，防止重叠执行
    if (this.executingTasks.has(taskId)) {
      console.log(`[CronManager] 任务 ${taskId} 上次执行还未完成，跳过本次执行`);
      return;
    }

    console.log(`[CronManager] 执行任务: ${taskId}, Agent: ${task.agentId}`);

    // 设置执行锁
    this.executingTasks.add(taskId);

    try {
      await executeFollowAgent({
        agentId: task.agentId,
        options: task.options,
      });

      // 更新执行统计
      task.lastExecutedAt = new Date().toISOString();
      task.executionCount += 1;
      this.tasks.set(taskId, task);

      console.log(
        `[CronManager] 任务执行成功: ${taskId}, 累计: ${task.executionCount} 次`,
      );

      // TODO: 持久化更新统计信息
    } catch (error) {
      console.error(`[CronManager] 任务执行失败: ${taskId}`, error);

      // 可选：连续失败多次后自动停止任务
      // 这里暂不自动停止，让用户决定
    } finally {
      // 释放执行锁
      this.executingTasks.delete(taskId);
    }
  }

  /**
   * 停止所有任务（用于程序关闭时清理）
   */
  async stopAll(): Promise<void> {
    console.log("[CronManager] 停止所有任务");

    for (const taskId of this.timers.keys()) {
      await this.stopTask(taskId);
    }
  }

  /**
   * 生成任务 ID
   */
  private generateTaskId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `cron_${timestamp}_${random}`;
  }
}

// 单例实例
export const cronManager = new CronManager();

// 进程退出时清理
if (typeof process !== "undefined") {
  process.on("SIGTERM", () => {
    cronManager.stopAll();
  });
  
  process.on("SIGINT", () => {
    cronManager.stopAll();
  });
}

