"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import type { AgentDashboardSummary } from "@/components/agents/agent-stats";
import { AgentStatsSummary } from "@/components/agents/agent-stats";
import { AgentGrid } from "@/components/agents/agent-grid";
import type { AgentOverview } from "@/server/nof1/service";
import type { TrackerSettings } from "@/server/nof1/settings";

export type DashboardTabId = "overview" | "trading" | "settings";

interface DashboardTabsProps {
  agents: AgentOverview[];
  summary: AgentDashboardSummary;
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
  summary,
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
          <AgentStatsSummary summary={summary} />
          <div id="agents">
            <AgentGrid agents={agents} />
          </div>
        </div>
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
