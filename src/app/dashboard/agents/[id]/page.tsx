import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Gauge,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { fetchAgentDetail } from "@/server/nof1/service";

interface PageProps {
  params: {
    id: string;
  };
}

export default async function AgentDetailPage({ params }: PageProps) {
  const agent = await fetchAgentDetail(params.id);

  if (!agent) {
    notFound();
  }

  return (
    <div className="h-full overflow-y-auto bg-surface-50">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-8">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-semibold text-primary transition hover:text-primary/80"
            >
              <ArrowLeft size={14} />
              返回仪表盘
            </Link>
            <h1 className="pt-2 text-3xl font-semibold text-surface-900">
              {agent.modelId}
            </h1>
            <p className="text-sm text-surface-500">
              上次更新：{new Date(agent.lastUpdated).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatBadge
              icon={<Gauge size={14} />}
              label="持仓数"
              value={agent.stats.positionsCount.toString()}
            />

            <StatBadge
              icon={<TrendingUp size={14} />}
              label="名义敞口"
              value={`$${agent.stats.totalExposure.toFixed(2)}`}
            />

            <StatBadge
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

            <StatBadge
              icon={<Timer size={14} />}
              label="平均信心"
              value={
                agent.stats.averageConfidence !== null
                  ? `${agent.stats.averageConfidence.toFixed(1)}`
                  : "--"
              }
            />
          </div>
        </header>

        <section className="rounded-3xl border border-surface-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-surface-100 px-6 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">
              持仓详情
            </h2>
            <p className="text-xs text-surface-400">
              按实时行情计算盈亏与敞口
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-surface-600">
              <thead>
                <tr className="bg-surface-50 text-xs uppercase tracking-wide text-surface-400">
                  <th className="px-6 py-3 text-left">Symbol</th>
                  <th className="px-6 py-3 text-left">方向</th>
                  <th className="px-6 py-3 text-left">数量</th>
                  <th className="px-6 py-3 text-left">杠杆</th>
                  <th className="px-6 py-3 text-left">入场价</th>
                  <th className="px-6 py-3 text-left">最新价</th>
                  <th className="px-6 py-3 text-left">保证金</th>
                  <th className="px-6 py-3 text-left">浮动盈亏</th>
                  <th className="px-6 py-3 text-left">止盈/止损</th>
                </tr>
              </thead>
              <tbody>
                {agent.positions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-10 text-center text-sm text-surface-400"
                    >
                      暂无持仓记录。
                    </td>
                  </tr>
                ) : (
                  agent.positions.map((position) => (
                    <tr
                      key={position.symbol}
                      className="border-t border-surface-100 transition hover:bg-surface-50/70"
                    >
                    <td className="px-6 py-4 font-semibold text-surface-800">
                      {position.symbol}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                          position.side === "LONG"
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-rose-100 text-rose-600"
                        }`}
                      >
                        {position.side === "LONG" ? "做多" : "做空"}
                        <ArrowRight size={12} />
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {position.quantity.toFixed(4)}
                    </td>
                    <td className="px-6 py-4">{position.leverage}x</td>
                    <td className="px-6 py-4">
                      ${position.entryPrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      ${position.currentPrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      ${position.margin.toFixed(2)}
                    </td>
                    <td
                      className={`px-6 py-4 font-semibold ${
                        position.unrealizedPnl >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {formatSigned(position.unrealizedPnl)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-xs">
                        <span>
                          TP:{" "}
                          {position.takeProfit
                            ? `$${position.takeProfit.toFixed(2)}`
                            : "--"}
                        </span>
                        <span>
                          SL:{" "}
                          {position.stopLoss
                            ? `$${position.stopLoss.toFixed(2)}`
                            : "--"}
                        </span>
                      </div>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatBadge({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
        tone === "positive"
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : tone === "negative"
            ? "border-rose-200 bg-rose-50 text-rose-600"
            : "border-surface-200 bg-white text-surface-600"
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
