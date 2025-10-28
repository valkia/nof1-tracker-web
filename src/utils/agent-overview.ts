import type { AgentOverview } from "@/server/nof1/service";
import type {
  AgentDashboardSummary,
  ProfitRange,
} from "@/types/agents";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const RANGE_WINDOWS: Record<Exclude<ProfitRange, "total">, number> = {
  month: 30 * DAY_IN_MS,
  week: 7 * DAY_IN_MS,
  day: DAY_IN_MS,
};

interface ProfitRangeMeta {
  label: string;
  description: string;
}

const PROFIT_RANGE_META: Record<ProfitRange, ProfitRangeMeta> = {
  total: { label: "总", description: "全部历史" },
  month: { label: "月", description: "近30天" },
  week: { label: "周", description: "近7天" },
  day: { label: "日", description: "近24小时" },
};

export function summarizeAgents(
  agents: AgentOverview[],
): AgentDashboardSummary {
  const totals = agents.reduce(
    (acc, agent) => {
      acc.agentCount += 1;
      acc.positionsCount += agent.stats.positionsCount;
      acc.totalExposure += agent.stats.totalExposure;
      acc.totalMargin += agent.stats.totalMargin;
      acc.netUnrealized += agent.stats.netUnrealizedPnl;

      if (agent.stats.averageConfidence !== null) {
        acc.confidenceSum += agent.stats.averageConfidence;
        acc.confidenceSamples += 1;
      }

      return acc;
    },
    {
      agentCount: 0,
      positionsCount: 0,
      totalExposure: 0,
      totalMargin: 0,
      netUnrealized: 0,
      confidenceSum: 0,
      confidenceSamples: 0,
    },
  );

  return {
    agentCount: totals.agentCount,
    positionsCount: totals.positionsCount,
    totalExposure: totals.totalExposure,
    totalMargin: totals.totalMargin,
    netUnrealized: totals.netUnrealized,
    averageConfidence:
      totals.confidenceSamples > 0
        ? totals.confidenceSum / totals.confidenceSamples
        : null,
  };
}

export function filterAgentsByRange(
  agents: AgentOverview[],
  range: ProfitRange,
  now: number = Date.now(),
): AgentOverview[] {
  if (range === "total") {
    return agents;
  }

  const window = RANGE_WINDOWS[range];
  const cutoff = now - window;

  return agents.filter((agent) => {
    const updatedAt = Date.parse(agent.lastUpdated);
    if (Number.isNaN(updatedAt)) {
      return false;
    }
    return updatedAt >= cutoff;
  });
}

export function getProfitRangeMeta(
  range: ProfitRange,
): ProfitRangeMeta {
  return PROFIT_RANGE_META[range];
}

export function getProfitRangeOptions(): Array<{
  value: ProfitRange;
  label: string;
}> {
  return [
    { value: "total", label: PROFIT_RANGE_META.total.label },
    { value: "month", label: PROFIT_RANGE_META.month.label },
    { value: "week", label: PROFIT_RANGE_META.week.label },
    { value: "day", label: PROFIT_RANGE_META.day.label },
  ];
}
