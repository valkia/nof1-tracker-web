import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import type {
  AgentProfitSeriesPayload,
  AgentProfitSeries,
  ProfitRange,
} from "@/types/agents";
import { ApiClient } from "@/server/core/services/api-client";
import {
  AgentAccount,
  Position,
} from "@/server/core/types/api";
import {
  TIME_CONFIG,
  getCurrentLastHourlyMarker,
} from "@/server/core/config/constants";

export interface AgentPositionView {
  symbol: string;
  quantity: number;
  side: "LONG" | "SHORT";
  leverage: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  margin: number;
  confidence: number;
  takeProfit?: number;
  stopLoss?: number;
}

export interface AgentOverview {
  id: string;
  modelId: string;
  positions: AgentPositionView[];
  lastUpdated: string;
  stats: {
    positionsCount: number;
    totalExposure: number;
    netUnrealizedPnl: number;
    totalMargin: number;
    totalEquity: number;
    averageConfidence: number | null;
  };
}

const DAY_IN_MS = 24 * TIME_CONFIG.HOUR_IN_MS;
const RANGE_WINDOWS_MS: Record<Exclude<ProfitRange, "total">, number> = {
  month: 30 * DAY_IN_MS,
  week: 7 * DAY_IN_MS,
  day: DAY_IN_MS,
};
const RANGE_WINDOWS_HOURS: Record<Exclude<ProfitRange, "total">, number> = {
  month: 30 * 24,
  week: 7 * 24,
  day: 24,
};

const getClient = cache(() => new ApiClient());

async function loadAgentOverviews(): Promise<AgentOverview[]> {
  const client = getClient();
  const response = await client.getAccountTotals();
  const latestAccounts = selectLatestAccounts(response.accountTotals);
  return latestAccounts.map(mapAgentAccountToOverview);
}

const getCachedAgentOverviews = unstable_cache(
  loadAgentOverviews,
  ["agent-overviews"],
  {
    revalidate: 5,
    tags: ["agent-overviews"],
  },
);

export async function fetchAgentOverviews(options?: {
  force?: boolean;
}): Promise<AgentOverview[]> {
  if (options?.force) {
    return loadAgentOverviews();
  }

  return getCachedAgentOverviews();
}

export async function fetchAgentDetail(
  agentId: string,
): Promise<AgentOverview | null> {
  const client = getClient();
  const agent = await client.getAgentData(agentId);

  if (!agent) {
    return null;
  }

  return mapAgentAccountToOverview(agent);
}

export async function fetchAgentProfitSeries(
  range: ProfitRange = "total",
): Promise<AgentProfitSeriesPayload> {
  const client = getClient();
  const currentMarker = getCurrentLastHourlyMarker();
  const startMarker = resolveStartMarker(range, currentMarker);
  const response = await client.getAccountTotals(startMarker);
  const windowMs =
    range === "total" ? null : RANGE_WINDOWS_MS[range];
  const referenceNow = markerToUnixTimestamp(currentMarker) * 1000;
  const cutoff =
    windowMs === null ? null : referenceNow - windowMs;

  const grouped = groupAccountsByModel(response.accountTotals);
  const series: AgentProfitSeries[] = [];
  let earliestPoint: number | null = null;
  let latestPoint: number | null = null;

  for (const group of grouped.values()) {
    const sorted = group.entries
      .slice()
      .sort(
        (a, b) =>
          a.since_inception_hourly_marker -
          b.since_inception_hourly_marker,
      );

    const points = sorted
      .map((account) => {
        const equity = extractAccountEquity(account) ?? computeTotalExposure(account);
        return {
          time: markerToUnixTimestamp(
            account.since_inception_hourly_marker,
          ),
          value: Number(equity.toFixed(2)),
        };
      })
      .filter((point) =>
        cutoff === null ? true : point.time * 1000 >= cutoff,
      );

    if (points.length === 0) {
      continue;
    }

    const latestAccount = sorted[sorted.length - 1];
    series.push({
      agentId: latestAccount.id,
      modelId: latestAccount.model_id,
      points,
    });

    const localEarliest = points[0]?.time ?? null;
    const localLatest = points[points.length - 1]?.time ?? null;
    if (localEarliest !== null) {
      earliestPoint =
        earliestPoint === null
          ? localEarliest
          : Math.min(earliestPoint, localEarliest);
    }
    if (localLatest !== null) {
      latestPoint =
        latestPoint === null
          ? localLatest
          : Math.max(latestPoint, localLatest);
    }
  }

  // 使用当前时间作为结束点，而不是最新数据点
  const nowTimestamp = markerToUnixTimestamp(currentMarker);
  
  let rangeStart: number;
  let rangeEnd: number;
  
  if (range === "total") {
    // total模式：从最早数据点到现在
    rangeStart = earliestPoint ?? nowTimestamp;
    rangeEnd = nowTimestamp;
  } else {
    // 其他模式：从今天往回推算指定时间范围
    rangeEnd = nowTimestamp;
    rangeStart = nowTimestamp - (RANGE_WINDOWS_MS[range] / 1000);
  }

  return {
    range,
    rangeStart,
    rangeEnd,
    series,
  };
}

function mapAgentAccountToOverview(account: AgentAccount): AgentOverview {
  const positions = Object.values(account.positions || {}).map(mapPosition);

  const stats = positions.reduce(
    (acc, position) => {
      const notional = Math.abs(position.quantity) * position.currentPrice;
      acc.totalExposure += notional;
      acc.netUnrealizedPnl += position.unrealizedPnl;
      acc.totalMargin += position.margin;
      acc.confidenceSamples.push(position.confidence);
      return acc;
    },
    {
      totalExposure: 0,
      netUnrealizedPnl: 0,
      totalMargin: 0,
      confidenceSamples: [] as number[],
    },
  );

  const totalEquity =
    extractAccountEquity(account) ??
    stats.totalMargin + stats.netUnrealizedPnl;

  return {
    id: account.id,
    modelId: account.model_id,
    positions,
    lastUpdated: markerToISO(account.since_inception_hourly_marker),
    stats: {
      positionsCount: positions.length,
      totalExposure: stats.totalExposure,
      netUnrealizedPnl: stats.netUnrealizedPnl,
      totalMargin: stats.totalMargin,
      totalEquity,
      averageConfidence:
        stats.confidenceSamples.length > 0
          ? average(stats.confidenceSamples)
          : null,
    },
  };
}

function mapPosition(position: Position): AgentPositionView {
  const side = position.quantity >= 0 ? "LONG" : "SHORT";
  const takeProfit = position.exit_plan?.profit_target;
  const stopLoss = position.exit_plan?.stop_loss;

  return {
    symbol: position.symbol,
    quantity: Math.abs(position.quantity),
    side,
    leverage: position.leverage,
    entryPrice: position.entry_price,
    currentPrice: position.current_price,
    unrealizedPnl: position.unrealized_pnl,
    margin: position.margin ?? 0,
    confidence: position.confidence,
    takeProfit: takeProfit ?? undefined,
    stopLoss: stopLoss ?? undefined,
  };
}

function markerToISO(marker: number): string {
  const date = markerToDate(marker);
  return date.toISOString();
}

function markerToUnixTimestamp(marker: number): number {
  const date = markerToDate(marker);
  return Math.floor(date.getTime() / 1000);
}

function markerToDate(marker: number): Date {
  const base = TIME_CONFIG.INITIAL_MARKER_TIME;
  const time =
    base.getTime() + marker * TIME_CONFIG.HOUR_IN_MS;
  return new Date(time);
}

function average(values: number[]): number {
  const sum = values.reduce((total, current) => total + current, 0);
  return Number((sum / values.length).toFixed(2));
}

function selectLatestAccounts(
  accounts: AgentAccount[],
): AgentAccount[] {
  const latest = new Map<string, AgentAccount>();

  for (const account of accounts) {
    const existing = latest.get(account.model_id);
    if (
      !existing ||
      account.since_inception_hourly_marker >
        existing.since_inception_hourly_marker
    ) {
      latest.set(account.model_id, account);
    }
  }

  return Array.from(latest.values());
}

function groupAccountsByModel(
  accounts: AgentAccount[],
): Map<
  string,
  {
    agentId: string;
    modelId: string;
    entries: AgentAccount[];
  }
> {
  const grouped = new Map<
    string,
    {
      agentId: string;
      modelId: string;
      entries: AgentAccount[];
    }
  >();

  for (const account of accounts) {
    const existing = grouped.get(account.model_id);
    if (existing) {
      existing.entries.push(account);
    } else {
      grouped.set(account.model_id, {
        agentId: account.id,
        modelId: account.model_id,
        entries: [account],
      });
    }
  }

  return grouped;
}

function computeNetUnrealizedPnl(account: AgentAccount): number {
  const positions = Object.values(account.positions || {});
  return positions.reduce(
    (total, position) => total + position.unrealized_pnl,
    0,
  );
}

function computeTotalEquity(account: AgentAccount): number {
  const extracted = extractAccountEquity(account);
  if (extracted !== null) {
    return extracted;
  }

  const positions = Object.values(account.positions || {});
  let totalMargin = 0;
  let netUnrealized = 0;

  for (const position of positions) {
    totalMargin += position.margin ?? 0;
    netUnrealized += position.unrealized_pnl ?? 0;
  }

  return totalMargin + netUnrealized;
}

function computeTotalExposure(account: AgentAccount): number {
  const positions = Object.values(account.positions || {});
  let totalExposure = 0;

  for (const position of positions) {
    const notional = Math.abs(position.quantity) * position.current_price;
    totalExposure += notional;
  }

  return totalExposure;
}

function extractAccountEquity(account: AgentAccount): number | null {
  const candidateKeys: string[] = [
    "dollar_equity",
    "total_equity",
    "account_total_equity",
    "account_total_value",
    "account_value",
    "total_wallet_balance",
    "totalWalletBalance",
  ];

  for (const key of candidateKeys) {
    const rawValue = (account as unknown as Record<string, unknown>)[key as string];
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }
    if (
      typeof rawValue === "string" &&
      rawValue.trim().length > 0
    ) {
      const parsed = Number.parseFloat(rawValue);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function resolveStartMarker(
  range: ProfitRange,
  currentMarker: number,
): number | undefined {
  if (range === "total") {
    return 0;
  }

  const offset = RANGE_WINDOWS_HOURS[range];
  return Math.max(0, currentMarker - offset);
}
