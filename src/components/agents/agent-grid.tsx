import Link from "next/link";
import {
  ArrowRight,
  Gauge,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { AgentOverview } from "@/server/nof1/service";

export function AgentGrid(props: { agents: AgentOverview[] }) {
  const { agents } = props;

  if (agents.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-12 text-center text-surface-500">
        暂无 Agent 数据。请确认 API 连接配置是否正确。
      </section>
    );
  }

  return (
    <section
      id="agents"
      className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2"
    >
      {agents.map((agent) => (
        <article
          key={agent.modelId}
          className="group flex h-full flex-col justify-between rounded-3xl border border-surface-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-surface-900">
                {agent.modelId}
              </h2>
              <p className="text-xs text-surface-400">
                最后更新：{new Date(agent.lastUpdated).toLocaleString()}
              </p>
            </div>

            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Timer size={14} />
              Marker {agent.lastUpdated.slice(11, 16)}
            </span>
          </header>

          <div className="mt-4 flex flex-wrap gap-4">
            <SummaryPill
              icon={<Gauge size={14} />}
              label="持仓数"
              value={agent.stats.positionsCount.toString()}
            />

            <SummaryPill
              icon={<TrendingUp size={14} />}
              label="名义敞口"
              value={`$${agent.stats.totalExposure.toFixed(2)}`}
            />

            <SummaryPill
              icon={
                agent.stats.netUnrealizedPnl >= 0 ? (
                  <TrendingUp size={14} />
                ) : (
                  <TrendingDown size={14} />
                )
              }
              label="浮动盈亏"
              value={formatSigned(agent.stats.netUnrealizedPnl)}
              tone={agent.stats.netUnrealizedPnl >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="mt-6 space-y-4">
            {agent.positions.slice(0, 3).map((position) => (
              <div
                key={position.symbol}
                className="flex items-center justify-between rounded-2xl border border-surface-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-surface-800">
                    {position.symbol}
                  </p>
                  <p className="text-xs text-surface-400">
                    {position.side === "LONG" ? "做多" : "做空"} · 杠杆{" "}
                    {position.leverage}x · 数量 {position.quantity.toFixed(4)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-surface-700">
                    入场 ${position.entryPrice.toFixed(2)}
                  </p>
                  <p
                    className={`text-xs ${
                      position.unrealizedPnl >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {formatSigned(position.unrealizedPnl)}
                  </p>
                </div>
              </div>
            ))}

            {agent.positions.length > 3 ? (
              <p className="text-xs text-surface-400">
                仅展示最近 3 个仓位，更多详情请查看 Agent 页面。
              </p>
            ) : null}
          </div>

          <footer className="mt-6 flex items-center justify-between">
            <div className="text-xs text-surface-400">
              平均信心{" "}
              {agent.stats.averageConfidence !== null
                ? `${agent.stats.averageConfidence.toFixed(1)}`
                : "--"}
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

function SummaryPill(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const { icon, label, value, tone } = props;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${
        tone === "positive"
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : tone === "negative"
            ? "border-rose-200 bg-rose-50 text-rose-600"
            : "border-surface-200 bg-surface-50 text-surface-500"
      }`}
    >
      {icon}
      {label} · {value}
    </span>
  );
}

function formatSigned(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}
