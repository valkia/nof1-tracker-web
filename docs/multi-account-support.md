# 多用户 / 多 API Key 支持方案速记

## 现状概述

- 当前 CLI 与 Web 服务层只会加载一组 `BINANCE_API_KEY` / `BINANCE_API_SECRET` 环境变量，所有 agent 的轮询与下单都透传到同一个币安合约账户。
- `totalMargin` 等参数仅用于按比例缩放单个 agent 的持仓规模，无法实现真正的资金隔离。
- `OrderHistoryManager`、`PositionManager`、`FollowService` 等核心服务都假设单账户上下文；订单历史保存在 `data/order-history.json`，没有区分用户或密钥的命名空间。

> 结论：要支持多用户或多组 Binance API Key，就必须把整个链路改造成“多租户”架构，并把资金、历史记录、调度任务与凭据隔离开来。

## 后端改造要点

- **凭据与配置管理**
  - 引入数据存储（数据库或加密文件仓库）记录用户、API Key、代理配置、风控参数。推荐结构：`users` → `api_credentials` → `tracker_settings`。
  - 将 `ConfigManager`、`TradingExecutor`、`ApiAnalyzer` 等构造函数改写为显式接收凭据对象，不再直接读进程级环境变量。
  - 敏感信息使用 KMS/DPAPI 或至少本地加密（AES + KDF），防止明文落盘。

- **作业调度与实例管理**
  - 每个活跃的 credential 维护独立的轮询任务队列；可用 BullMQ / agenda / node-cron + Redis 实现，或在 CLI 中实现多进程调度。
  - `ApiAnalyzer`、`FollowService`、`TradingExecutor`、`OrderHistoryManager` 等服务需要按用户实例化；可以构建 `ServiceRegistry`，按 `userId+credentialId` 缓存并复用实例。
  - 订单历史、资金分配结果等持久化数据需要加命名空间（如 `data/<userId>/<credentialId>/order-history.json`），避免不同账户互相污染。

- **交易执行与风险隔离**
  - `TradingExecutor` 扩展为支持并发执行：每次 `executePlan` 时注入当前凭据、保证金模式等，而不是共享状态。
  - `FollowService` 的资金分配逻辑要改为读取“用户级”余额（每个 credential 单独调用 `getAccountInfo`），同时允许用户配置逐仓 / 全仓策略。
  - 风险控制（止盈止损、价格容忍度）改造成 per-user 配置，并确保预警/日志带上用户标识，方便审计。

- **API / CLI 接口**
  - Web API（`src/server/nof1/`）需要增加用户身份认证（JWT / session），并在请求上下文解析出要使用的 credential。
  - CLI 模式可以引入 `--profile <name>` 或 `.nof1rc` 配置，映射到本地加密存储的凭据；执行命令时加载对应 profile。
  - 新增管理接口用于创建/更新/禁用 API Key，触发轮询任务，以及查看各账户的执行历史。

- **并发与容错**
  - 统一的调度器需要有“单账户串行、跨账户并行”的执行策略，避免同一币安账户内的请求竞态。
  - 增加速率限制与重试策略，防止多账户高频触发 API 限流。
  - 日志与错误处理需包含 `userId`、`credentialId`；建议输出到集中式日志（例如 pino + Elastic/Loki）。

## 前端改造要点

- **用户与凭据管理 UI**
  - 新增凭据管理页面：录入 API Key/Secret、测试连接、指定是主账户还是子账户、设置默认保证金模式、是否走测试网。
  - 在现有的 tracker 设置面板上增加“选择凭据”“多账户轮询开关”“总保证金额度”等控件，并允许为不同凭据配置独立的参数。
  - 对敏感字段采取遮罩展示，支持一键复制/重新生成；提醒用户安全事项。

- **任务与状态展示**
  - 仪表盘需要按用户/凭据分组展示持仓、保证金占用、历史订单和执行日志，避免不同账户数据混在一起。
  - 提供多账户的汇总视图（总权益、风险警报、活跃 agent 列表），以及下钻到单账户的详细视图。
  - 支持在 UI 中启停某个凭据的轮询作业，并查看最近的错误/重试情况。

- **鉴权与多租户控制**
  - 前端登录后获取用户 token，所有后端请求附带 token/credentialId。
  - 确保 WebSocket/实时推送也遵循 credential 隔离，只广播给对应用户。

## 渐进式落地建议

1. **抽象凭据层**：先让核心服务（`ApiAnalyzer`、`TradingExecutor`、`FollowService`）支持显式传入 Binance 凭据，验证单进程多实例可正常运作。
2. **重构持久化**：把订单历史、配置文件改成 `data/<profile>/...` 或数据库存储，完成数据隔离。
3. **调度器与作业管理**：实现多账户轮询、任务队列和串行执行策略。
4. **前端 UI & API 认证**：补齐用户体系、凭据管理和 UI 控制面板。
5. **监控与审计**：补完日志、报警、操作审计，确保排障简单。

完成以上步骤后，系统就可以在一套部署中为多位用户或多组 API Key 提供独立的轮询和交易执行能力，同时保持保证金与风险隔离。***
