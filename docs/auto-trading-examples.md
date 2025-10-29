# 自动跟单功能使用示例

本文档提供自动跟单功能的详细使用示例。

## 前端定时轮询示例

### 场景 1：基础使用

1. 访问交易面板页面
2. 在"执行 AI Agent 跟单"区域：
   - 选择目标 Agent（例如：agent-001）
   - 设置价格容忍度：1.0%
   - 设置总保证金：100 USDT
   - 保证金模式：选择"全仓"
3. 点击"启动定时执行"按钮
4. 系统会立即执行一次跟单，然后每 30 秒（默认值）自动执行

### 场景 2：调整轮询周期

1. 点击"快速打开设置"按钮
2. 在"风控参数"区域找到"默认轮询周期"
3. 修改为 60 秒
4. 点击"保存设置"
5. 返回交易面板，重新启动定时执行

### 场景 3：仅风险评估

适合测试阶段，不会真实下单：

1. 在跟单配置中勾选"仅进行风险评估"
2. 启动定时执行
3. 查看执行结果，所有计划都会标记为"风险评估"状态

## 后端 Cron 任务示例

### 示例 1：创建并启动任务

使用 JavaScript/TypeScript：

```typescript
// 1. 创建任务
async function setupAutoTrading() {
  const response = await fetch('/api/cron', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: 'agent-001',
      intervalSeconds: 60,
      options: {
        priceTolerance: 1.0,
        totalMargin: 100,
        marginType: 'CROSSED',
        riskOnly: false,
      },
    }),
  });

  const { data: task } = await response.json();
  console.log('任务已创建:', task.id);

  // 2. 启动任务
  const startResponse = await fetch(`/api/cron/${task.id}/start`, {
    method: 'POST',
  });

  const { data: runningTask } = await startResponse.json();
  console.log('任务已启动:', runningTask);
  
  return task.id;
}

setupAutoTrading();
```

### 示例 2：查看和管理任务

```typescript
// 获取所有任务
async function listTasks() {
  const response = await fetch('/api/cron');
  const { data: tasks } = await response.json();
  
  console.log('所有任务:', tasks);
  
  for (const task of tasks) {
    console.log(`
      任务 ID: ${task.id}
      Agent: ${task.agentId}
      状态: ${task.enabled ? '运行中' : '已停止'}
      执行次数: ${task.executionCount}
      最后执行: ${task.lastExecutedAt || '未执行'}
    `);
  }
  
  return tasks;
}

// 停止任务
async function stopTask(taskId: string) {
  const response = await fetch(`/api/cron/${taskId}/stop`, {
    method: 'POST',
  });
  
  const { data: task } = await response.json();
  console.log('任务已停止:', task);
}

// 删除任务
async function deleteTask(taskId: string) {
  const response = await fetch(`/api/cron/${taskId}`, {
    method: 'DELETE',
  });
  
  console.log('任务已删除');
}
```

### 示例 3：更新任务配置

```typescript
// 更新轮询周期
async function updateTaskInterval(taskId: string, newInterval: number) {
  const response = await fetch(`/api/cron/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intervalSeconds: newInterval,
    }),
  });
  
  const { data: task } = await response.json();
  console.log('任务已更新:', task);
}

// 更新跟单选项
async function updateTaskOptions(taskId: string) {
  const response = await fetch(`/api/cron/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      options: {
        priceTolerance: 1.5,
        totalMargin: 200,
      },
    }),
  });
  
  const { data: task } = await response.json();
  console.log('任务配置已更新:', task);
}
```

### 示例 4：使用 curl 命令

```bash
# 创建任务
TASK_ID=$(curl -s -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001",
    "intervalSeconds": 60,
    "options": {
      "priceTolerance": 1.0,
      "totalMargin": 100,
      "marginType": "CROSSED"
    }
  }' | jq -r '.data.id')

echo "创建的任务 ID: $TASK_ID"

# 启动任务
curl -X POST "http://localhost:3000/api/cron/$TASK_ID/start"

# 等待一段时间后查看任务状态
sleep 120
curl "http://localhost:3000/api/cron/$TASK_ID" | jq '.data'

# 停止任务
curl -X POST "http://localhost:3000/api/cron/$TASK_ID/stop"

# 删除任务
curl -X DELETE "http://localhost:3000/api/cron/$TASK_ID"
```

## 完整工作流示例

### 场景：设置每分钟自动跟单，运行 1 小时后停止

```typescript
async function autoTradingWorkflow() {
  try {
    // 1. 创建任务（每 60 秒执行一次）
    console.log('创建自动跟单任务...');
    const createResponse = await fetch('/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-001',
        intervalSeconds: 60,
        options: {
          priceTolerance: 1.0,
          totalMargin: 100,
          marginType: 'CROSSED',
          riskOnly: false,
        },
      }),
    });

    const { data: task } = await createResponse.json();
    console.log(`✓ 任务已创建: ${task.id}`);

    // 2. 启动任务
    console.log('启动任务...');
    await fetch(`/api/cron/${task.id}/start`, { method: 'POST' });
    console.log('✓ 任务已启动');

    // 3. 每 10 分钟检查一次任务状态
    const statusCheckInterval = setInterval(async () => {
      const statusResponse = await fetch(`/api/cron/${task.id}`);
      const { data: currentTask } = await statusResponse.json();
      
      console.log(`
        [${new Date().toLocaleTimeString()}] 任务状态:
        - 执行次数: ${currentTask.executionCount}
        - 最后执行: ${currentTask.lastExecutedAt}
        - 状态: ${currentTask.enabled ? '运行中' : '已停止'}
      `);
    }, 10 * 60 * 1000); // 每 10 分钟

    // 4. 1 小时后停止任务
    setTimeout(async () => {
      console.log('1 小时已到，停止任务...');
      
      clearInterval(statusCheckInterval);
      
      await fetch(`/api/cron/${task.id}/stop`, { method: 'POST' });
      console.log('✓ 任务已停止');
      
      // 获取最终统计
      const finalResponse = await fetch(`/api/cron/${task.id}`);
      const { data: finalTask } = await finalResponse.json();
      
      console.log(`
        最终统计:
        - 总执行次数: ${finalTask.executionCount}
        - 预期执行次数: 60 次（每分钟 × 60 分钟）
        - 开始时间: ${finalTask.createdAt}
        - 最后执行: ${finalTask.lastExecutedAt}
      `);
      
      // 可选：删除任务
      // await fetch(`/api/cron/${task.id}`, { method: 'DELETE' });
    }, 60 * 60 * 1000); // 1 小时

  } catch (error) {
    console.error('工作流执行失败:', error);
  }
}

// 执行工作流
autoTradingWorkflow();
```

## React 组件集成示例

### 创建 Cron 管理组件

```tsx
'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { CronTask } from '@/types/cron';

export function CronTaskManager() {
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载任务列表
  async function loadTasks() {
    try {
      const response = await fetch('/api/cron');
      const { data } = await response.json();
      setTasks(data);
    } catch (error) {
      toast.error('加载任务失败');
    } finally {
      setLoading(false);
    }
  }

  // 启动任务
  async function startTask(taskId: string) {
    try {
      await fetch(`/api/cron/${taskId}/start`, { method: 'POST' });
      toast.success('任务已启动');
      loadTasks();
    } catch (error) {
      toast.error('启动失败');
    }
  }

  // 停止任务
  async function stopTask(taskId: string) {
    try {
      await fetch(`/api/cron/${taskId}/stop`, { method: 'POST' });
      toast.success('任务已停止');
      loadTasks();
    } catch (error) {
      toast.error('停止失败');
    }
  }

  // 删除任务
  async function deleteTask(taskId: string) {
    if (!confirm('确定要删除这个任务吗？')) return;
    
    try {
      await fetch(`/api/cron/${taskId}`, { method: 'DELETE' });
      toast.success('任务已删除');
      loadTasks();
    } catch (error) {
      toast.error('删除失败');
    }
  }

  useEffect(() => {
    loadTasks();
    // 每 30 秒刷新一次任务列表
    const interval = setInterval(loadTasks, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div>加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Cron 任务管理</h2>
      
      {tasks.length === 0 ? (
        <p className="text-gray-500">暂无任务</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="border rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-semibold">{task.agentId}</p>
                <p className="text-sm text-gray-500">
                  每 {task.intervalSeconds} 秒执行一次
                </p>
                <p className="text-xs text-gray-400">
                  已执行 {task.executionCount} 次
                  {task.lastExecutedAt && 
                    ` · 最后执行: ${new Date(task.lastExecutedAt).toLocaleString()}`
                  }
                </p>
              </div>
              
              <div className="flex gap-2">
                {task.enabled ? (
                  <button
                    onClick={() => stopTask(task.id)}
                    className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
                  >
                    停止
                  </button>
                ) : (
                  <button
                    onClick={() => startTask(task.id)}
                    className="px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600"
                  >
                    启动
                  </button>
                )}
                
                <button
                  onClick={() => deleteTask(task.id)}
                  className="px-4 py-2 bg-rose-500 text-white rounded hover:bg-rose-600"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## 监控和日志

### 查看执行日志

服务器端日志会记录任务的创建、启动、停止和执行情况：

```
[CronManager] 已初始化
[CronManager] 创建任务: cron_lx3k2p_8a9f1e, Agent: agent-001
[CronManager] 启动任务: cron_lx3k2p_8a9f1e, 间隔: 60s
[CronManager] 执行任务: cron_lx3k2p_8a9f1e, Agent: agent-001
[CronManager] 任务执行成功: cron_lx3k2p_8a9f1e, 累计: 1 次
[CronManager] 执行任务: cron_lx3k2p_8a9f1e, Agent: agent-001
[CronManager] 任务执行成功: cron_lx3k2p_8a9f1e, 累计: 2 次
```

### 错误处理

```typescript
async function robustTaskCreation() {
  try {
    const response = await fetch('/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-001',
        intervalSeconds: 60,
        options: {},
      }),
    });

    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error);
    }

    const { data: task } = await response.json();
    return task;
    
  } catch (error) {
    if (error instanceof Error) {
      console.error('创建任务失败:', error.message);
      
      if (error.message.includes('需要登录')) {
        // 跳转到登录页面
        window.location.href = '/login';
      }
    }
    
    throw error;
  }
}
```

## 最佳实践

1. **测试先行**：在生产环境使用前，先在测试网测试
2. **合理周期**：不要设置过短的轮询周期（建议 ≥ 30 秒）
3. **监控任务**：定期检查任务执行状态和次数
4. **错误处理**：实现完善的错误捕获和通知机制
5. **资源清理**：不再使用的任务及时删除
6. **日志记录**：保留重要的执行记录用于问题排查

## 常见问题

**Q: 为什么前端轮询比后端 Cron 快？**  
A: 前端轮询在浏览器中运行，即时响应；后端 Cron 在服务器端运行，更稳定但可能有轻微延迟。

**Q: 任务执行失败会怎样？**  
A: 前端轮询会自动停止；后端 Cron 会记录错误但继续尝试。

**Q: 可以同时运行多个任务吗？**  
A: 可以，后端 Cron 支持多任务并行。

**Q: 重启服务器后任务会丢失吗？**  
A: 当前版本会丢失，未来会实现持久化存储。

