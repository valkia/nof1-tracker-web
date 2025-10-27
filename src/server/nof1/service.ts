import "server-only";

import { cache } from "react";
import { ApiClient } from "@/server/core/services/api-client";
import {
  AgentAccount,
  Position,
} from "@/server/core/types/api";
import {
  TIME_CONFIG,
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

const getClient = cache(() => new ApiClient());

/**
 * Fetch the latest trading snapshot for every tracked agent.
 */
export async function fetchAgentOverviews(): Promise<AgentOverview[]> {
  const client = getClient();
  const response = await client.getAccountTotals();

  return response.accountTotals.map(mapAgentAccountToOverview);
}

/**
 * Fetch a single agent with full position details.
 */
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
  const base = TIME_CONFIG.INITIAL_MARKER_TIME;
  const time =
    base.getTime() + marker * TIME_CONFIG.HOUR_IN_MS;
  return new Date(time).toISOString();
}

function average(values: number[]): number {
  const sum = values.reduce((total, current) => total + current, 0);
  return Number((sum / values.length).toFixed(2));
}
