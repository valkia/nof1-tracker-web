import type { AgentOverview } from "@/server/nof1/service";

interface AgentProfitChartProps {
  agents: AgentOverview[];
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AgentProfitChart(props: AgentProfitChartProps) {
  const { agents } = props;

  if (agents.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-12 text-center text-sm text-surface-500">
        暂无 Agent 数据可用于绘制收益图表。
      </section>
    );
  }

  const sortedAgents = [...agents].sort(
    (a, b) =>
      b.stats.netUnrealizedPnl - a.stats.netUnrealizedPnl,
  );
  const maxAbsoluteProfit =
    sortedAgents.reduce(
      (max, agent) =>
        Math.max(
          max,
          Math.abs(agent.stats.netUnrealizedPnl),
        ),
      0,
    ) || 1;
  const totalProfit = sortedAgents.reduce(
    (sum, agent) => sum + agent.stats.netUnrealizedPnl,
    0,
  );

  return (
    <section className="space-y-6 rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            盈利对比
          </p>
          <h2 className="text-xl font-semibold text-surface-900">
            Agent 总盈利横向对比
          </h2>
        </div>

        <div className="flex items-baseline gap-2 rounded-2xl bg-surface-50 px-4 py-2 text-right">
          <span className="text-xs font-medium text-surface-400">
            累计盈亏
          </span>
          <span
            className={`text-lg font-semibold ${
              totalProfit >= 0
                ? "text-emerald-600"
                : "text-rose-600"
            }`}
          >
            {formatCurrency(totalProfit)}
          </span>
        </div>
      </header>

      <div className="space-y-5">
        {sortedAgents.map((agent) => {
          const profit = agent.stats.netUnrealizedPnl;
          const size = (Math.abs(profit) / maxAbsoluteProfit) * 50;
          const baseLeft =
            profit >= 0 ? 50 : 50 - size;

          return (
            <div
              key={agent.modelId}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-sm font-medium text-surface-600">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-100 text-xs font-semibold text-surface-500">
                    {agent.modelId.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="text-surface-900">
                    {agent.modelId}
                  </span>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    profit >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  {formatCurrency(profit)}
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-surface-100">
                <div className="absolute left-1/2 top-0 h-full w-px bg-surface-200" />
                {profit !== 0 ? (
                  <div
                    className={`absolute top-0 h-full rounded-full ${
                      profit >= 0
                        ? "bg-emerald-500/80"
                        : "bg-rose-500/80"
                    }`}
                    style={{
                      left: `${baseLeft}%`,
                      width: `${size}%`,
                    }}
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-between text-xs text-surface-400">
                <span>
                  保证金 {formatCurrency(agent.stats.totalMargin)}
                </span>
                <span>
                  持仓数 {agent.stats.positionsCount}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="flex flex-wrap items-center gap-3 text-xs text-surface-400">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          正收益
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-600">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          负收益
        </span>
        <span>中线表示盈亏为 0 的基准。</span>
      </footer>
    </section>
  );
}

function formatCurrency(value: number): string {
  const formatted = currencyFormatter.format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}
