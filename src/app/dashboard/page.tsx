import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AgentGrid } from "@/components/agents/agent-grid";
import {
  AgentStatsSummary,
  type AgentDashboardSummary,
} from "@/components/agents/agent-stats";
import { fetchAgentOverviews } from "@/server/nof1/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const agents = await fetchAgentOverviews();
  const summary = buildSummary(agents);

  return (
    <div className="h-full overflow-y-auto bg-surface-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              实时数据
            </p>
            <h1 className="text-3xl font-semibold text-surface-900">
              跟单控制台
            </h1>
            <p className="text-sm text-surface-500">
              来自 Nof1 官方 API 的最新 Agent 持仓与风险信号。
            </p>
          </div>

          <Link
            href="https://docs.nof1.ai"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-surface-200 px-4 py-2 text-xs font-semibold text-surface-600 transition hover:border-primary/40 hover:text-primary"
          >
            API 文档
            <ArrowUpRight size={14} />
          </Link>
        </header>

        <AgentStatsSummary summary={summary} />
        <AgentGrid agents={agents} />
      </div>
    </div>
  );
}

function buildSummary(agents: Awaited<ReturnType<typeof fetchAgentOverviews>>): AgentDashboardSummary {
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
