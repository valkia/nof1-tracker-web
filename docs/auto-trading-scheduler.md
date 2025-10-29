# 自动跟单调度功能

本文档介绍自动跟单调度功能的使用方法，包括前端定时轮询和后端 Cron 任务管理。

## 功能概述

系统提供两种自动跟单方式：

1. **前端定时轮询**：在浏览器中运行，适合临时性的自动跟单需求
2. **后端 Cron 任务**：在服务器端运行，适合长期稳定的自动跟单需求（需要登录，预留功能）

## 1. 前端定时轮询

### 使用方法

1. 打开交易面板，配置跟单参数（Agent、价格容忍度、保证金等）
2. 在系统设置中配置"默认轮询周期"（秒）
3. 点击"启动定时执行"按钮
4. 系统将按照设定的周期自动执行跟单操作

### 特点

- ✅ 无需登录，立即可用
- ✅ 实时显示执行状态和倒计时
- ✅ 可随时启动/停止
- ✅ 自动统计执行次数
- ⚠️ 需要保持浏览器窗口打开
- ⚠️ 关闭浏览器后停止执行

### 状态显示

启动后会显示：
- 运行状态指示器（绿色动画点）
- 已执行次数
- 下次执行倒计时
- 轮询周期

### 错误处理

- 如果执行失败，系统会自动停止定时执行
- 错误信息会通过 Toast 通知显示
- 可查看最后一次执行结果

## 2. 后端 Cron 任务（预留）

### 概述

后端 Cron 任务在服务器端运行，不依赖浏览器，适合需要长期稳定运行的场景。

**注意**：此功能需要用户登录后才能使用（当前为预留功能）。

### API 接口

#### 创建任务
```http
POST /api/cron
Content-Type: application/json

{
  "agentId": "agent-123",
  "options": {
    "priceTolerance": 1.0,
    "totalMargin": 100,
    "marginType": "CROSSED",
    "riskOnly": false
  },
  "intervalSeconds": 30
}
```

#### 获取所有任务
```http
GET /api/cron
```

#### 获取单个任务
```http
GET /api/cron/{taskId}
```

#### 启动任务
```http
POST /api/cron/{taskId}/start
```

#### 停止任务
```http
POST /api/cron/{taskId}/stop
```

#### 更新任务
```http
PUT /api/cron/{taskId}
Content-Type: application/json

{
  "intervalSeconds": 60,
  "options": {
    "priceTolerance": 1.5
  }
}
```

#### 删除任务
```http
DELETE /api/cron/{taskId}
```

### 任务数据结构

```typescript
interface CronTask {
  id: string;                    // 任务ID
  agentId: string;               // 跟随的 Agent ID
  options: Record<string, any>;  // 跟单选项
  intervalSeconds: number;       // 执行间隔（秒）
  enabled: boolean;              // 是否启用
  createdAt: string;            // 创建时间
  lastExecutedAt: string | null; // 最后执行时间
  executionCount: number;        // 执行次数
  userId?: string;               // 用户ID（预留）
}
```

### 使用示例

#### 使用 fetch API 创建任务

```javascript
async function createCronTask() {
  const response = await fetch('/api/cron', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentId: 'my-agent',
      intervalSeconds: 30,
      options: {
        priceTolerance: 1.0,
        totalMargin: 100,
        marginType: 'CROSSED',
        riskOnly: false,
      },
    }),
  });
  
  const { data } = await response.json();
  console.log('创建的任务:', data);
  
  // 启动任务
  await fetch(`/api/cron/${data.id}/start`, { method: 'POST' });
}
```

#### 使用 curl 创建任务

```bash
# 创建任务
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-agent",
    "intervalSeconds": 30,
    "options": {
      "priceTolerance": 1.0,
      "totalMargin": 100
    }
  }'

# 启动任务
curl -X POST http://localhost:3000/api/cron/{taskId}/start

# 查看所有任务
curl http://localhost:3000/api/cron

# 停止任务
curl -X POST http://localhost:3000/api/cron/{taskId}/stop

# 删除任务
curl -X DELETE http://localhost:3000/api/cron/{taskId}
```

### 特点

- ✅ 服务器端运行，不依赖浏览器
- ✅ 支持多任务并行
- ✅ 任务状态持久化（TODO）
- ✅ 自动统计执行次数和时间
- ⚠️ 当前版本重启后任务丢失（待实现持久化）
- ⚠️ 需要登录验证（预留功能）

## 配置说明

### 轮询周期

在"系统设置 → 风控参数 → 默认轮询周期"中配置。

- **最小值**：5 秒
- **推荐值**：30-60 秒
- **说明**：周期越短，响应越快，但会增加 API 调用频率和服务器负载

### 跟单选项

以下选项可在创建任务时配置：

- `priceTolerance`: 价格容忍度（%）
- `totalMargin`: 总保证金（USDT）
- `profit`: 盈利目标（%）
- `autoRefollow`: 盈利后自动再次跟随
- `marginType`: 保证金模式（CROSSED/ISOLATED）
- `riskOnly`: 仅进行风险评估（不真实下单）

## 注意事项

### 前端定时轮询

1. 需要保持浏览器标签页打开
2. 电脑休眠或浏览器后台可能影响执行
3. 适合短期测试或临时使用
4. 执行失败会自动停止

### 后端 Cron 任务

1. 当前版本任务存储在内存中，重启后丢失
2. 需要实现用户登录后才能使用
3. 建议设置合理的轮询周期，避免过于频繁
4. 执行失败不会自动停止，需手动管理

## 安全建议

1. **测试环境优先**：先在 Binance 测试网测试
2. **合理设置保证金**：避免过高的资金风险
3. **启用风险评估模式**：测试时开启 `riskOnly`
4. **监控执行结果**：定期检查执行记录和交易结果
5. **设置止损止盈**：配置合理的盈利目标和止损策略

## 未来改进

- [ ] 后端 Cron 任务持久化存储
- [ ] 用户登录和权限管理
- [ ] 任务执行历史记录
- [ ] 任务执行失败告警
- [ ] 多用户任务隔离
- [ ] 任务执行日志查看
- [ ] 任务性能监控
- [ ] WebSocket 实时推送任务状态

## 故障排查

### 前端轮询无法启动

1. 检查是否配置了 Binance API 凭证
2. 检查是否选择了有效的 Agent
3. 查看浏览器控制台是否有错误信息

### 后端任务无法创建

1. 检查 API 请求参数是否正确
2. 确认 `intervalSeconds` 不小于 5
3. 查看服务器日志中的错误信息

### 任务执行失败

1. 检查 Binance API 凭证是否有效
2. 确认账户余额是否充足
3. 查看最后一次执行的错误信息
4. 检查网络连接是否正常

## 技术实现

### 前端定时轮询

- 使用 React hooks (`useCallback`, `useRef`, `useState`)
- `setInterval` 实现定时器
- 组件卸载时自动清理定时器
- Toast 通知提供用户反馈

### 后端 Cron 任务

- 单例模式的任务管理器 (`CronManager`)
- 内存存储任务状态（待持久化）
- Node.js `setInterval` 实现定时执行
- 进程退出时自动清理

## 相关文档

- [快速参考](./quick-reference.md)
- [跟单策略](./follow-strategy.md)
- [风险管理](./trading-risk-review.md)
- [多账户支持](./multi-account-support.md)

