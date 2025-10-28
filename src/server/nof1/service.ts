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
      .map((account) => ({
        time: markerToUnixTimestamp(
          account.since_inception_hourly_marker,
        ),
        value: Number(
          computeNetUnrealizedPnl(account).toFixed(2),
        ),
      }))
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

  const defaultStart =
    startMarker !== undefined
      ? markerToUnixTimestamp(startMarker)
      : earliestPoint ?? markerToUnixTimestamp(currentMarker);

  const rangeStart =
    range === "total"
      ? earliestPoint ?? defaultStart
      : Math.min(
          defaultStart,
          earliestPoint ?? markerToUnixTimestamp(currentMarker),
        );
  const rangeEnd =
    latestPoint ?? markerToUnixTimestamp(currentMarker);

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
