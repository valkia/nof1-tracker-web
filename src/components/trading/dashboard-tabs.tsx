"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { AgentStatsSummary } from "@/components/agents/agent-stats";
import { AgentGrid } from "@/components/agents/agent-grid";
import { AgentProfitChart } from "@/components/agents/agent-profit-chart";
import { BinanceGuide } from "@/components/trading/binance-guide";
import type { AgentOverview } from "@/server/nof1/service";
import type { TrackerSettings } from "@/server/nof1/settings";
import type { ProfitRange } from "@/types/agents";
import {
  filterAgentsByRange,
  getProfitRangeMeta,
  getProfitRangeOptions,
  summarizeAgents,
} from "@/utils/agent-overview";

const PROFIT_RANGE_OPTIONS = getProfitRangeOptions();

export type DashboardTabId = "overview" | "trading" | "settings" | "guide";

interface DashboardTabsProps {
  agents: AgentOverview[];
  initialSettings: TrackerSettings;
  activeTab: DashboardTabId;
}

type LazyTradeHistoryChartProps = {
  symbols: string[];
};

type LazyTradingExecutionPanelProps = {
  agents: AgentOverview[];
  settings: TrackerSettings;
  onOpenSettings: () => void;
};

type LazySettingsFormProps = {
  settings: TrackerSettings;
  onSaved?: (settings: TrackerSettings) => void;
};

const TradeHistoryChart = dynamic<LazyTradeHistoryChartProps>(
  () =>
    import("./trade-history-chart").then(
      (module) => module.TradeHistoryChart,
    ),
  {
    ssr: false,
    loading: () => <PanelPlaceholder minHeight={360} />,
  },
);

const TradingExecutionPanel = dynamic<LazyTradingExecutionPanelProps>(
  () =>
    import("./trading-execution-panel").then(
      (module) => module.TradingExecutionPanel,
    ),
  {
    ssr: false,
    loading: () => <PanelPlaceholder minHeight={320} />,
  },
);

const SettingsForm = dynamic<LazySettingsFormProps>(
  () =>
    import("./settings-form").then(
      (module) => module.SettingsForm,
    ),
  {
    ssr: false,
    loading: () => <PanelPlaceholder minHeight={320} />,
  },
);

export function DashboardTabs({
  agents,
  initialSettings,
  activeTab,
}: DashboardTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentTab, setCurrentTab] =
    useState<DashboardTabId>(activeTab);
  const [settings, setSettings] =
    useState<TrackerSettings>(initialSettings);
  const [profitRange, setProfitRange] =
    useState<ProfitRange>("total");

  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]);

  const symbols = useMemo(() => {
    const unique = new Set<string>();
    agents.forEach((agent) => {
      agent.positions.forEach((position) => {
        unique.add(position.symbol);
      });
    });
    return Array.from(unique).sort();
  }, [agents]);

  const filteredAgents = useMemo(
    () => filterAgentsByRange(agents, profitRange),
    [agents, profitRange],
  );

  const rangeMeta = useMemo(
    () => getProfitRangeMeta(profitRange),
    [profitRange],
  );

  const summaryForRange = useMemo(
    () => summarizeAgents(filteredAgents),
    [filteredAgents],
  );

  const navigateToTab = useCallback(
    (nextTab: DashboardTabId, options?: { replace?: boolean }) => {
      setCurrentTab(nextTab);

      const params = new URLSearchParams(searchParams.toString());
      if (nextTab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", nextTab);
      }

      const query = params.toString();
      const target = query ? `${pathname}?${query}` : pathname;

      if (options?.replace) {
        router.replace(target, { scroll: false });
      } else {
        router.push(target, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  return (
    <section className="space-y-6">
      {currentTab === "overview" ? (
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  资产维度
                </p>
                <h2 className="text-lg font-semibold text-surface-900">
                  {rangeMeta.description} 账户权益统计
                </h2>
              </div>
              <ProfitRangeFilter
                value={profitRange}
                onChange={(next) => setProfitRange(next)}
              />
            </div>
            <AgentStatsSummary
              summary={summaryForRange}
              rangeDescription={rangeMeta.description}
            />
          </div>
          <AgentProfitChart
            profitRange={profitRange}
            rangeDescription={rangeMeta.description}
            totalEquity={summaryForRange.totalEquity}
          />
          <div id="agents">
            <AgentGrid agents={agents} />
          </div>
        </div>
      ) : null}

      {currentTab === "guide" ? (
        <BinanceGuide onOpenSettings={() => navigateToTab("settings")} />
      ) : null}

      {currentTab === "trading" ? (
        <div className="space-y-6">
          <TradeHistoryChart symbols={symbols} />
          <TradingExecutionPanel
            agents={agents}
            settings={settings}
            onOpenSettings={() => navigateToTab("settings")}
          />
        </div>
      ) : null}

      {currentTab === "settings" ? (
        <SettingsForm
          settings={settings}
          onSaved={(updated) => {
            setSettings(updated);
            navigateToTab("trading", { replace: true });
          }}
        />
      ) : null}
    </section>
  );
}

function PanelPlaceholder({
  minHeight = 280,
}: {
  minHeight?: number;
}) {
  return (
    <div
      className="animate-pulse rounded-3xl border border-surface-200 bg-white/70 p-6 shadow-sm"
      style={{ minHeight }}
    >
      <div className="h-4 w-1/3 rounded-full bg-surface-100" />
      <div className="mt-4 space-y-3">
        <div className="h-4 w-full rounded-full bg-surface-100" />
        <div className="h-4 w-5/6 rounded-full bg-surface-100" />
        <div className="h-4 w-2/3 rounded-full bg-surface-100" />
      </div>
    </div>
  );
}

function ProfitRangeFilter({
  value,
  onChange,
}: {
  value: ProfitRange;
  onChange: (next: ProfitRange) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-surface-200 bg-white p-1 shadow-sm">
      {PROFIT_RANGE_OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              isActive
                ? "bg-primary text-white shadow-sm"
                : "text-surface-500 hover:bg-primary/10 hover:text-primary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
