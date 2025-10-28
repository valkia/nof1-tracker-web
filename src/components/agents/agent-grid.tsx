import Link from "next/link";
import {
  ArrowRight,
  Gauge,
  LineChart,
  PiggyBank,
  Timer,
} from "lucide-react";
import type { AgentOverview } from "@/server/nof1/service";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AgentGrid(props: { agents: AgentOverview[] }) {
  const { agents } = props;

  if (agents.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-12 text-center text-sm text-surface-500">
        暂无 Agent 数据，请检查 API 配置或刷新后重试。
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {agents.map((agent) => (
        <article
          key={agent.modelId}
          className="group flex h-full flex-col rounded-3xl border border-surface-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
        >
          <Header agent={agent} />

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetricCard
              icon={<Gauge size={16} />}
              label="持仓数量"
              value={`${agent.stats.positionsCount} 个`}
            />
            <MetricCard
              icon={<PiggyBank size={16} />}
              label="总保证金"
              value={formatCurrency(agent.stats.totalMargin)}
            />
            <MetricCard
              icon={<LineChart size={16} />}
              label="名义敞口"
              value={formatCurrency(agent.stats.totalExposure)}
            />
            <MetricCard
              icon={<Timer size={16} />}
              label="平均信心"
              value={
                agent.stats.averageConfidence !== null
                  ? `${agent.stats.averageConfidence.toFixed(1)} / 100`
                  : "--"
              }
            />
          </div>

          <ConfidenceMeter
            value={agent.stats.averageConfidence}
          />

          <PositionsPreview agent={agent} />

          <footer className="mt-6 flex items-center justify-between">
            <div className="text-xs text-surface-400">
              最后同步于 {formatLastUpdated(agent.lastUpdated)}
            </div>
            <Link
              href={`/dashboard/agents/${agent.modelId}`}
              className="inline-flex items-center gap-2 rounded-full border border-surface-200 px-4 py-2 text-xs font-semibold text-surface-600 transition group-hover:border-primary/40 group-hover:text-primary"
            >
              查看详情
              <ArrowRight size={14} />
            </Link>
          </footer>
        </article>
      ))}
    </section>
  );
}

function Header({ agent }: { agent: AgentOverview }) {
  const profit = agent.stats.netUnrealizedPnl;
  const profitTone =
    profit >= 0 ? "text-emerald-600" : "text-rose-600";

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Agent
        </p>
        <h2 className="text-lg font-semibold text-surface-900">
          {agent.modelId}
        </h2>
        <p className="text-xs text-surface-400">
          ID: {agent.id}
        </p>
      </div>

      <div className="rounded-2xl bg-surface-50 px-4 py-3 text-right">
        <p className="text-xs text-surface-400">浮动盈亏</p>
        <p className={`text-lg font-semibold ${profitTone}`}>
          {formatSignedCurrency(profit)}
        </p>
        <p className="text-[11px] text-surface-400">
          总敞口 {formatCurrency(agent.stats.totalExposure)}
        </p>
      </div>
    </header>
  );
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const { icon, label, value } = props;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-surface-100 bg-surface-50/50 px-4 py-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary shadow-sm">
        {icon}
      </span>
      <div>
        <p className="text-xs uppercase tracking-wide text-surface-400">
          {label}
        </p>
        <p className="text-sm font-semibold text-surface-800">
          {value}
        </p>
      </div>
    </div>
  );
}

function ConfidenceMeter({
  value,
}: {
  value: number | null;
}) {
  const percentage = value ?? 0;
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between text-xs text-surface-400">
        <span>置信度分布</span>
        <span>
          {value !== null
            ? `${value.toFixed(1)} / 100`
            : "暂无数据"}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-surface-100">
        {value !== null ? (
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${Math.min(
                100,
                Math.max(0, percentage),
              )}%`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function PositionsPreview({ agent }: { agent: AgentOverview }) {
  const topPositions = agent.positions.slice(0, 3);

  if (topPositions.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-surface-200 bg-surface-50 px-4 py-6 text-center text-xs text-surface-400">
        当前 Agent 暂无持仓。
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between text-xs text-surface-400">
        <span>主要持仓（最多显示 3 个）</span>
        {agent.positions.length > 3 ? (
          <span>
            其余 {agent.positions.length - 3} 个持仓请查看详情
          </span>
        ) : null}
      </div>
      <div className="space-y-3">
        {topPositions.map((position) => (
          <div
            key={`${agent.modelId}-${position.symbol}`}
            className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.6fr)] items-center gap-4 rounded-2xl border border-surface-100 bg-surface-50/60 px-4 py-3 text-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                    position.side === "LONG"
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-rose-100 text-rose-600"
                  }`}
                >
                  {position.side === "LONG" ? "做多" : "做空"}
                </span>
                <span className="font-semibold text-surface-800">
                  {position.symbol}
                </span>
              </div>
              <p className="text-xs text-surface-400">
                数量 {formatQuantity(position.quantity)} · 杠杆{" "}
                {position.leverage}x
              </p>
            </div>

            <div className="text-xs text-surface-400">
              <div className="flex items-center justify-between">
                <span>入场价</span>
                <span className="font-semibold text-surface-700">
                  ${position.entryPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>当前价</span>
                <span className="font-semibold text-surface-700">
                  ${position.currentPrice.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[11px] text-surface-400">
                浮动盈亏
              </p>
              <p
                className={`text-sm font-semibold ${
                  position.unrealizedPnl >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {formatSignedCurrency(position.unrealizedPnl)}
              </p>
              <p className="text-[11px] text-surface-400">
                保证金 {formatCurrency(position.margin)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatSignedCurrency(value: number): string {
  const formatted = currencyFormatter.format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function formatQuantity(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}

function formatLastUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
}
