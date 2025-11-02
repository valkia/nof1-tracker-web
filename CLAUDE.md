# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 任何项目都务必遵守的规则（极其重要！！！）

## Communication

- 永远使用简体中文进行思考和对话
- 你所在的环境是windows，请务必使用正确的命令行符号，否则可能导致命令无法执行。

## Documentation

- 编写 .md 文档时，也要用中文
- 正式文档写到项目的 docs/ 目录下
- 用于讨论和评审的计划、方案等文档，写到项目的 discuss/ 目录下

## Code Architecture

- 编写代码的硬性指标，包括以下原则：
  （1）对于 Python、JavaScript、TypeScript 等动态语言，尽可能确保每个代码文件不要超过 300 行
  （2）对于 Java、Go、Rust 等静态语言，尽可能确保每个代码文件不要超过 400 行
  （3）每层文件夹中的文件，尽可能不超过 8 个。如有超过，需要规划为多层子文件夹
- 除了硬性指标以外，还需要时刻关注优雅的架构设计，避免出现以下可能侵蚀我们代码质量的「坏味道」：
  （1）僵化 (Rigidity): 系统难以变更，任何微小的改动都会引发一连串的连锁修改。
  （2）冗余 (Redundancy): 同样的代码逻辑在多处重复出现，导致维护困难且容易产生不一致。
  （3）循环依赖 (Circular Dependency): 两个或多个模块互相纠缠，形成无法解耦的“死结”，导致难以测试与复用。
  （4）脆弱性 (Fragility): 对代码一处的修改，导致了系统中其他看似无关部分功能的意外损坏。
  （5）晦涩性 (Obscurity): 代码意图不明，结构混乱，导致阅读者难以理解其功能和设计。
  （6）数据泥团 (Data Clump): 多个数据项总是一起出现在不同方法的参数中，暗示着它们应该被组合成一个独立的对象。
  （7）不必要的复杂性 (Needless Complexity): 用“杀牛刀”去解决“杀鸡”的问题，过度设计使系统变得臃肿且难以理解。
- 【非常重要！！】无论是你自己编写代码，还是阅读或审核他人代码时，都要严格遵守上述硬性指标，以及时刻关注优雅的架构设计。
- 【非常重要！！】无论何时，一旦你识别出那些可能侵蚀我们代码质量的「坏味道」，都应当立即询问用户是否需要优化，并给出合理的优化建议。

## 🚀 Key Development Commands

### Core Development Workflow
- `npm install` - Install dependencies
- `npm run dev` - Start development server (Next.js)
- `npm run build` - Build production bundle
- `npm start` - Start production server
- `npm run lint` - Run ESLint for code quality
- `npm run format` - Check code formatting with Prettier
- `npm run format:fix` - Auto-fix code formatting
- `npm run typecheck` - Run TypeScript type checking

### Testing Commands
- `npm test` - Run all tests (Jest configuration in jest.config.js)
- `npm test -- --coverage` - Run tests with coverage report
- `npm test -- --watch` - Run tests in watch mode
- Custom test files: `test-syntax.ts`, `test-functionality.ts`, `test-follow-params.ts`, `test-browser.ts`

## 🏗️ High-Level Architecture Overview

### Project Structure
```
src/
├── app/                    # Next.js 14 App Router
│   ├── api/agents/         # Agent data endpoints
│   ├── api/trading/        # Trading execution endpoints
│   ├── api/cron/           # Cron job management
│   └── dashboard/          # Web interface pages
├── server/
│   ├── core/              # Original CLI business logic
│   │   ├── services/       # Trading, API clients, risk management
│   │   └── types/          # Core domain types
│   └── nof1/              # Web integration layer
│       ├── services/       # Service wrappers for Next.js
│       └── trading.ts      # Main trading execution logic
├── components/            # React UI components
├── services/              # Shared service utilities
└── types/                 # TypeScript type definitions
```

### Core Architecture Layers

1. **Web Layer (Next.js 14)**: Modern React frontend with Server Components, API Routes, and Server Actions
2. **Integration Layer**: Bridges between web and core trading logic
3. **Core Trading Engine**: Original CLI functionality for Binance futures trading
4. **Risk Management**: Multi-layered risk assessment and capital allocation

### Key Components and Their Roles

#### Trading Execution Flow
- `src/server/core/services/trading-executor.ts` - Main trading execution logic
- `src/server/core/services/futures-capital-manager.ts` - Capital allocation and margin management
- `src/server/core/services/risk-manager.ts` - Risk assessment and position sizing
- `src/server/nof1/trading.ts` - Web-integrated trading entry point

#### API Integration
- `src/server/core/services/api-client.ts` - Nof1.ai API client
- `src/server/core/services/binance-service.ts` - Binance futures API wrapper
- `src/app/api/trading/follow/route.ts` - HTTP endpoint for manual follow trades

#### Risk and Capital Management
- **Risk Assessment**: Multi-factor risk scoring with position limits
- **Capital Allocation**: Per-agent capital distribution with exposure controls
- **Margin Management**: Isolated margin mode with automatic adjustments

### Critical Business Logic

#### Agent Trading Strategy
- Supports 7 AI agents: gpt-5, gemini-2.5-pro, grok-4, qwen3-max, deepseek-chat-v3.1, claude-sonnet-4-5, buynhold_btc
- Each agent has independent capital allocation and risk parameters
- Position synchronization with Nof1.ai API data

#### Order Management
- LONG/SHORT position tracking with leverage support
- Stop-loss and take-profit order management
- Position closing logic with quantity validation
- Order ID (OID) mechanism for trade correlation

#### Risk Controls
- Price tolerance checks for entry prices
- Maximum position size limits per agent
- Total portfolio exposure caps
- Margin requirement validation
- Automatic position sizing based on risk score

### Data Flow
1. **Agent Data**: Nof1.ai API → Cache (Next.js) → Agent Overviews
2. **Trading Signals**: Agent positions → Risk assessment → Capital allocation → Binance execution
3. **Status Updates**: Binance webhooks/events → Position updates → UI refresh

### Configuration and Environment
- Environment variables in `.env.example` (API keys, trading parameters)
- Risk parameters configurable via web interface
- Trading behavior controlled by capital allocation and risk thresholds

### Testing Strategy
- Unit tests for core services (risk manager, capital manager)
- Integration tests for trading execution
- End-to-end tests for web interface workflows
- Custom verification scripts for trading logic validation

This architecture enables both manual web-based trading and automated agent following with comprehensive risk controls.