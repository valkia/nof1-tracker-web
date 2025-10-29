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
- **数据接口**：
  - `GET /api/agents` 返回所有 Agent 概览。
  - `GET /api/agents/[id]` 返回指定 Agent 的详细仓位信息。
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

## 下一步建议

- 将 `followAgent` 等执行逻辑封装为受控 API 接口（需鉴权）。
- 引入数据库持久化仓位与收益，以便在 Web 端做更丰富的历史分析。
- 接入实时推送（如 SSE/WebSocket）提升数据刷新体验。

---

欢迎继续完善，构建功能完善的 Web 端跟单系统。*** End Patch*** End Patch
