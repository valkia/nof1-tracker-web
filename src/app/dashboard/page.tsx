import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { fetchAgentOverviews } from "@/server/nof1/service";
import { getTrackerSettings } from "@/server/nof1/settings";
import {
  DashboardTabs,
  type DashboardTabId,
} from "@/components/trading/dashboard-tabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface DashboardPageProps {
  searchParams?: {
    tab?: string;
  };
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const [agents, settings] = await Promise.all([
    fetchAgentOverviews(),
    getTrackerSettings(),
  ]);
  const activeTab = resolveTab(searchParams?.tab);

  return (
    <div className="h-full overflow-y-auto bg-surface-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              实时数据
            </p>
            <h1 className="text-3xl font-semibold text-surface-900">
              跟单控制中心
            </h1>
            <p className="text-sm text-surface-500">
              基于 Nof1 官方 API 的最新 Agent 持仓与风险信号总览
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

        <DashboardTabs
          agents={agents}
          initialSettings={settings}
          activeTab={activeTab}
        />
      </div>
    </div>
  );
}

function resolveTab(tabValue: string | undefined): DashboardTabId {
  if (tabValue === "trading" || tabValue === "settings") {
    return tabValue;
  }
  return "overview";
}
