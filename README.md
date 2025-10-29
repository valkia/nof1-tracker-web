# Nof1 Tracker Web

基于 Next.js 14、Tailwind CSS 与 TypeScript 构建的 Nof1 AI Agent 跟单控制台。
项目在原有纯 TypeScript CLI 的基础上，整合了 Web 前端与 API 服务，
可视化展示 Agent 仓位、风控指标，并提供后端接口以便扩展跟单执行能力。

## 技术栈

- **Next.js 14**（App Router + Server Actions）
- **TypeScript**（端到端类型安全）
- **Tailwind CSS**（可定制的 UI 体系）
- **React 18**（Server Components）
- **Axios / fs-extra / node-telegram-bot-api**（沿用原 CLI 的核心依赖）

### 目录结构

```
src/
├── app/                  # Next.js 页面与 API Routes
│   ├── api/agents        # Agent 数据接口
│   ├── dashboard         # 控制台页面与布局
│   └── page.tsx          # 登陆页 / 概览
├── components/           # 前端 UI 组件
│   └── agents/           # Agent 概览与卡片组件
├── lib/                  # 通用工具函数
└── server/
    ├── core/             # 迁移自 CLI 的交易服务核心逻辑
    └── nof1/             # 新增的服务封装，桥接 Next 与核心逻辑
```

`src/server/core` 保留了原 CLI 的所有业务能力（Binance 集成、风险控制、收益分析等），
可在后续按需接入到 API Routes 或 Server Actions。

## 快速开始

```bash
# 1. 安装依赖（使用 npm）
npm install

# 2. 创建环境变量文件
cp .env.example .env

# 3. 根据需求配置 API / Binance / Telegram 等参数

# 4. 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看控制台。

## 核心功能

- **Agent 总览页**：展示所有 AI Agent 当前仓位、名义敞口、浮动盈亏与置信度。
- **手动跟单**：在交易面板中配置参数，点击按钮执行单次跟单操作。
- **自动跟单调度**：
  - **前端定时轮询**：在浏览器中按设定周期自动执行跟单，适合临时使用。
  - **后端 Cron 任务**：在服务器端运行定时任务，支持多任务并行（预留登录功能）。
- **数据接口**：
  - `GET /api/agents` 返回所有 Agent 概览。
  - `GET /api/agents/[id]` 返回指定 Agent 的详细仓位信息。
  - `POST /api/trading/follow` 执行跟单操作。
  - `GET/POST /api/cron` 管理 Cron 定时任务。
- **服务封装**：`src/server/nof1/service.ts` 中提供 `fetchAgentOverviews`、`fetchAgentDetail` 等方法，
  在 Server Component、Server Action 或 Edge Runtime 中复用。

## 环境变量

`.env.example` 中提供了所有必填/可选项，主要包含：

- `NOF1_API_BASE_URL`：Nof1 数据接口地址（默认 `https://nof1.ai/api`）。
- `BINANCE_API_KEY` / `BINANCE_API_SECRET`：现已在控制台“系统设置”中配置，无需修改 `.env`
- `BINANCE_TESTNET`：是否启用测试网。
- `TELEGRAM_*`：告警通知配置（可选）。

## 开发提示

- 如需扩展后端逻辑，可直接复用 `src/server/core` 下的服务，
  并通过 Server Actions 或 API Routes 调用。
- `refreshDashboard` Server Action 可用于在外部任务完成后刷新仪表盘缓存。
- 若引入新的第三方依赖，请确保更新 `package.json` 并运行 `npm install`。

## 文档

- [自动跟单调度功能](./docs/auto-trading-scheduler.md) - 定时轮询和 Cron 任务使用指南
- [使用示例](./docs/auto-trading-examples.md) - 详细的代码示例和场景演示
- [快速参考](./docs/quick-reference.md) - 常用命令和配置
- [跟单策略](./docs/follow-strategy.md) - 跟单逻辑说明
- [风险管理](./docs/trading-risk-review.md) - 风控机制介绍

## 自动跟单功能

### 前端定时轮询

在交易面板中点击"启动定时执行"按钮，系统会按照设置的轮询周期自动执行跟单。

**特点**：
- ✅ 无需登录，立即可用
- ✅ 实时显示状态和倒计时
- ⚠️ 需保持浏览器打开

**配置**：在"系统设置"中调整"默认轮询周期（秒）"。

### 后端 Cron 任务

通过 API 创建和管理服务器端定时任务，适合长期稳定运行。

**API 端点**：
- `POST /api/cron` - 创建任务
- `GET /api/cron` - 获取任务列表
- `POST /api/cron/[id]/start` - 启动任务
- `POST /api/cron/[id]/stop` - 停止任务
- `DELETE /api/cron/[id]` - 删除任务

**注意**：此功能需要用户登录（当前为预留功能）。

详细使用方法请参阅[自动跟单文档](./docs/auto-trading-scheduler.md)。

## 下一步建议

- ✅ 前端定时轮询功能已实现
- ✅ 后端 Cron 任务管理已实现（预留登录验证）
- 引入用户登录和权限管理系统
- 实现 Cron 任务持久化存储
- 引入数据库持久化仓位与收益，以便在 Web 端做更丰富的历史分析
- 接入实时推送（如 SSE/WebSocket）提升数据刷新体验

---

欢迎继续完善，构建功能完善的 Web 端跟单系统。
