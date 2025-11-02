import "server-only";

import path from "path";
import fs from "fs-extra";
import { ApiAnalyzer } from "@/server/core/scripts/analyze-api";
import { ConfigManager } from "@/server/core/services/config-manager";
import {
  RiskManager,
  type RiskAssessment,
} from "@/server/core/services/risk-manager";
import {
  TradingExecutor,
  type StopOrderExecutionResult,
} from "@/server/core/services/trading-executor";
import {
  TradeHistoryService,
  type TradeHistoryOptions,
} from "@/server/core/services/trade-history-service";
import {
  BinanceService,
  type UserTrade,
} from "@/server/core/services/binance-service";
import type { FollowPlan } from "@/server/core/types/api";
import type { TradingPlan } from "@/server/core/types/trading";
import type { CommandOptions } from "@/server/core/types/command";
import {
  DATA_DIR,
  getTrackerSettings,
  settingsToBinanceCredentials,
  settingsToCommandOptions,
  settingsToTradingConfig,
  type BinanceCredentials,
  type TrackerSettings,
} from "./settings";
import {
  convertToTradingPlan,
  executeTradeWithHistory,
} from "@/server/core/utils/command-helpers";

export interface FollowExecutionRequest {
  agentId: string;
  options?: Partial<CommandOptions>;
}

export type ExecutionStatus =
  | "blocked"
  | "risk-only"
  | "executed"
  | "skipped"
  | "noop";

export interface PlanExecutionResult {
  plan: FollowPlan;
  tradingPlan: TradingPlan;
  risk: RiskAssessment;
  status: ExecutionStatus;
  execution?: {
    success: boolean;
    orderId?: string;
    takeProfitOrderId?: string;
    stopLossOrderId?: string;
    error?: string;
  };
}

export interface ExecutionSummary {
  total: number;
  executed: number;
  blocked: number;
  skipped: number;
  riskOnly: number;
  noop: number;
}

export interface FollowExecutionResponse {
  agentId: string;
  executedAt: string;
  options: CommandOptions;
  settings: TrackerSettings;
  plans: PlanExecutionResult[];
  summary: ExecutionSummary;
}

export interface TradeHistoryQuery {
  symbol?: string;
  range?: string;
  startTime?: number;
  endTime?: number;
  forceRefresh?: boolean;
}

export interface TradeHistoryPoint {
  time: number;
  realizedPnl: number;
  cumulativePnl: number;
  quantity: number;
  price: number;
  side: "BUY" | "SELL";
  orderId: number;
}

export interface TradeHistoryResult {
  symbol?: string;
  startTime: number;
  endTime: number;
  totalTrades: number;
  totalRealizedPnl: number;
  netQuantity: number;
  points: TradeHistoryPoint[];
}

const TRADE_CACHE_DIR = path.join(DATA_DIR, "trade-cache");
let tradeHistoryService: TradeHistoryService | null = null;
let tradeHistoryCredentials: BinanceCredentials | null = null;

function assertBinanceCredentials(credentials: BinanceCredentials): void {
  if (!credentials.apiKey || !credentials.apiSecret) {
    throw new Error(
      "缺少 Binance API Key 或 Secret，请先在系统设置中配置后再试",
    );
  }
}

async function getTradeHistoryService(): Promise<TradeHistoryService> {
  const settings = await getTrackerSettings();
  const credentials = settingsToBinanceCredentials(settings);
  assertBinanceCredentials(credentials);

  const cacheDir = path.join(
    TRADE_CACHE_DIR,
    credentials.testnet ? "testnet" : "mainnet",
  );

  const changed =
    !tradeHistoryCredentials ||
    tradeHistoryCredentials.apiKey !== credentials.apiKey ||
    tradeHistoryCredentials.apiSecret !== credentials.apiSecret ||
    tradeHistoryCredentials.testnet !== credentials.testnet;

  if (!tradeHistoryService || changed) {
    await fs.ensureDir(cacheDir);
    tradeHistoryService = new TradeHistoryService(
      new BinanceService(
        credentials.apiKey,
        credentials.apiSecret,
        credentials.testnet,
      ),
      cacheDir,
    );
    tradeHistoryCredentials = { ...credentials };
  }

  return tradeHistoryService;
}

function buildTradingPlan(
  followPlan: FollowPlan,
  marginType: CommandOptions["marginType"],
): TradingPlan {
  const plan = convertToTradingPlan(followPlan);
  return {
    ...plan,
    marginType: marginType ?? plan.marginType,
  };
}

function computeRiskAssessment(
  riskManager: RiskManager,
  followPlan: FollowPlan,
  tradingPlan: TradingPlan,
  options: CommandOptions,
): RiskAssessment {
  if (
    followPlan.action === "ENTER" &&
    followPlan.entryPrice !== undefined &&
    followPlan.position?.current_price
  ) {
    return riskManager.assessRiskWithPriceTolerance(
      tradingPlan,
      followPlan.entryPrice,
      followPlan.position.current_price,
      followPlan.symbol,
      options.priceTolerance,
      options?.totalMargin
    );
  }

  return riskManager.assessRisk(tradingPlan, options?.totalMargin);
}

function toSummary(results: PlanExecutionResult[]): ExecutionSummary {
  return results.reduce(
    (acc, result) => {
      acc.total += 1;

      switch (result.status) {
        case "executed":
          acc.executed += 1;
          break;
        case "blocked":
          acc.blocked += 1;
          break;
        case "risk-only":
          acc.riskOnly += 1;
          break;
        case "noop":
          acc.noop += 1;
          break;
        case "skipped":
          acc.skipped += 1;
          break;
        default:
          break;
      }

      return acc;
    },
    {
      total: 0,
      executed: 0,
      blocked: 0,
      skipped: 0,
      riskOnly: 0,
      noop: 0,
    } satisfies ExecutionSummary,
  );
}

function mapExecutionResult(
  execution: StopOrderExecutionResult,
): PlanExecutionResult["execution"] {
  return {
    success: execution.success,
    orderId: execution.orderId,
    takeProfitOrderId: execution.takeProfitOrderId,
    stopLossOrderId: execution.stopLossOrderId,
    error: execution.error,
  };
}

export async function executeFollowAgent(
  request: FollowExecutionRequest,
): Promise<FollowExecutionResponse> {
  const { agentId, options: optionOverrides } = request;
  if (!agentId) {
    throw new Error("agentId is required");
  }

  const settings = await getTrackerSettings();
  const credentials = settingsToBinanceCredentials(settings);
  assertBinanceCredentials(credentials);
  const commandOptions = settingsToCommandOptions(settings, optionOverrides);
  const configManager = new ConfigManager();

  let analyzer: ApiAnalyzer | null = null;
  let tradingExecutor: TradingExecutor | null = null;
  const riskManager = new RiskManager(configManager);

  try {
    analyzer = new ApiAnalyzer(configManager, undefined, {
      binanceApiKey: credentials.apiKey,
      binanceApiSecret: credentials.apiSecret,
      testnet: credentials.testnet,
    });

    // Apply UI-configured tolerances on top of environment defaults
    configManager.reset();
    configManager.importConfig(settingsToTradingConfig(settings));

    tradingExecutor = new TradingExecutor(
      credentials.apiKey,
      credentials.apiSecret,
      credentials.testnet,
      configManager,
    );

    const followOptions = {
      totalMargin: commandOptions.totalMargin,
      profitTarget: commandOptions.profit,
      autoRefollow: commandOptions.autoRefollow,
      marginType: commandOptions.marginType,
    };

    const followPlans = await analyzer.followAgent(agentId, followOptions);
    if (followPlans.length === 0) {
      return {
        agentId,
        executedAt: new Date().toISOString(),
        options: commandOptions,
        settings,
        plans: [],
        summary: {
          total: 0,
          executed: 0,
          blocked: 0,
          skipped: 0,
          riskOnly: 0,
          noop: 0,
        },
      };
    }

    const orderHistoryManager = analyzer.getOrderHistoryManager();
    const results: PlanExecutionResult[] = [];

    for (const followPlan of followPlans) {
      const tradingPlan = buildTradingPlan(
        followPlan,
        commandOptions.marginType,
      );

      const risk = computeRiskAssessment(
        riskManager,
        followPlan,
        tradingPlan,
        commandOptions,
      );

      if (followPlan.action === "HOLD") {
        results.push({
          plan: followPlan,
          tradingPlan,
          risk,
          status: "noop",
        });
        continue;
      }

      if (!risk.isValid) {
        results.push({
          plan: followPlan,
          tradingPlan,
          risk,
          status: "blocked",
        });
        continue;
      }

      if (commandOptions.riskOnly) {
        results.push({
          plan: followPlan,
          tradingPlan,
          risk,
          status: "risk-only",
        });
        continue;
      }

      const execution = await executePlanWithHistorySafe(
        tradingExecutor,
        tradingPlan,
        followPlan,
        orderHistoryManager,
      );

      results.push({
        plan: followPlan,
        tradingPlan,
        risk,
        status: execution.success ? "executed" : "skipped",
        execution: mapExecutionResult(execution),
      });
    }

    return {
      agentId,
      executedAt: new Date().toISOString(),
      options: commandOptions,
      settings,
      plans: results,
      summary: toSummary(results),
    };
  } finally {
    if (analyzer) {
      analyzer.destroy();
    }
    if (tradingExecutor) {
      tradingExecutor.destroy();
    }
  }
}

async function executePlanWithHistorySafe(
  executor: TradingExecutor | null,
  tradingPlan: TradingPlan,
  followPlan: FollowPlan,
  orderHistoryManager: ReturnType<ApiAnalyzer["getOrderHistoryManager"]>,
): Promise<StopOrderExecutionResult> {
  if (!executor) {
    return {
      success: false,
      error: "Trading executor not initialised",
    };
  }

  try {
    return await executeTradeWithHistory(
      executor,
      tradingPlan,
      followPlan,
      orderHistoryManager,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown execution error";
    console.error("Failed to execute trading plan", message);
    return {
      success: false,
      error: message,
    };
  }
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildPoints(trades: UserTrade[]): TradeHistoryPoint[] {
  let cumulative = 0;
  return trades
    .map((trade) => {
      const realized = toNumber(trade.realizedPnl);
      cumulative += realized;

      return {
        time: trade.time,
        realizedPnl: realized,
        cumulativePnl: Number(cumulative.toFixed(8)),
        quantity: toNumber(trade.qty),
        price: toNumber(trade.price),
        side: trade.side,
        orderId: trade.orderId,
      } satisfies TradeHistoryPoint;
    })
    .sort((a, b) => a.time - b.time);
}

export async function getTradeHistory(
  query: TradeHistoryQuery,
): Promise<TradeHistoryResult> {
  const service = await getTradeHistoryService();

  let startTime: number | undefined = query.startTime;
  let endTime: number | undefined = query.endTime;

  if (!startTime || !endTime) {
    const range = query.range ?? "7d";
    const rangeResult = TradeHistoryService.parseTimeFilter(range);
    startTime = startTime ?? rangeResult.startTime;
    endTime = endTime ?? rangeResult.endTime;
  }

  if (!startTime || !endTime) {
    throw new Error("Unable to determine time range for trade history");
  }

  const options: TradeHistoryOptions = {
    symbol: query.symbol,
    startTime,
    endTime,
    forceRefresh: query.forceRefresh,
  };

  const trades = await service.getTrades(options);
  const points = buildPoints(trades);

  const totalRealizedPnl = points.reduce(
    (acc, point) => acc + point.realizedPnl,
    0,
  );
  const netQuantity = points.reduce(
    (acc, point) =>
      acc + (point.side === "BUY" ? point.quantity : -point.quantity),
    0,
  );

  return {
    symbol: query.symbol,
    startTime,
    endTime,
    totalTrades: trades.length,
    totalRealizedPnl: Number(totalRealizedPnl.toFixed(8)),
    netQuantity: Number(netQuantity.toFixed(8)),
    points,
  };
}
