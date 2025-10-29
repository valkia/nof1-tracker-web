import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Gauge,
  LineChart,
  PiggyBank,
  Target,
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

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

export default async function AgentDetailPage({
  params,
}: PageProps) {
  const agent = await fetchAgentDetail(params.id);

  if (!agent) {
    notFound();
  }

  const longPositions = agent.positions.filter(
    (position) => position.side === "LONG",
  ).length;
  const shortPositions = agent.positions.length - longPositions;

  return (
    <div className="h-full overflow-y-auto bg-surface-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-6 pb-8 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-semibold text-primary transition hover:text-primary/80"
            >
              <ArrowLeft size={14} />
              返回仪表板
            </Link>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Agent 详情
              </p>
              <h1 className="text-3xl font-semibold text-surface-900">
                {agent.modelId}
              </h1>
              <p className="text-sm text-surface-500">
                最后同步时间：{formatLastUpdated(agent.lastUpdated)}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-surface-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-surface-400">
              浮动盈亏
            </p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                agent.stats.netUnrealizedPnl >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}
            >
              {formatSignedCurrency(agent.stats.netUnrealizedPnl)}
            </p>
            <p className="mt-2 text-xs text-surface-400">
              实时盈亏合计（含所有持仓）
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-4">
          <HighlightCard
            icon={
              agent.stats.netUnrealizedPnl >= 0 ? (
                <TrendingUp size={18} />
              ) : (
                <TrendingDown size={18} />
              )
            }
            label="浮动盈亏"
            value={formatSignedCurrency(agent.stats.netUnrealizedPnl)}
            tone={
              agent.stats.netUnrealizedPnl >= 0
                ? "positive"
                : "negative"
            }
            helper="实时盈亏趋势"
          />

          <HighlightCard
            icon={<PiggyBank size={18} />}
            label="总保证金"
            value={formatCurrency(agent.stats.totalMargin)}
            helper="当前占用保证金"
          />

          <HighlightCard
            icon={<LineChart size={18} />}
            label="名义敞口"
            value={formatCurrency(agent.stats.totalExposure)}
            helper="按最新价格统计的仓位规模"
          />

          <HighlightCard
            icon={<Gauge size={18} />}
            label="持仓数量"
            value={`${agent.stats.positionsCount} 个`}
            helper={`多头 ${longPositions} · 空头 ${shortPositions}`}
          />
        </section>

        <section className="space-y-6 pb-10">
          <ConfidencePanel
            averageConfidence={agent.stats.averageConfidence}
          />

          <PositionsTable agent={agent} />
        </section>
      </div>
    </div>
  );
}

function HighlightCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  tone?: "positive" | "negative";
}) {
  const { icon, label, value, helper, tone } = props;
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : "text-surface-900";

  return (
    <div className="rounded-3xl border border-surface-200 bg-white p-5 shadow-sm">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="pt-3 text-xs uppercase tracking-wide text-surface-400">
        {label}
      </p>
      <p className={`pt-1 text-xl font-semibold ${toneClass}`}>
        {value}
      </p>
      <p className="pt-2 text-xs text-surface-400">{helper}</p>
    </div>
  );
}

function ConfidencePanel({
  averageConfidence,
}: {
  averageConfidence: number | null;
}) {
  const hasConfidence = averageConfidence !== null;
  const percentage = hasConfidence
    ? Math.min(100, Math.max(0, averageConfidence ?? 0))
    : 0;

  return (
    <section className="rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-surface-400">
            平均信心
          </p>
          <p className="pt-2 text-2xl font-semibold text-surface-900">
            {hasConfidence
              ? `${averageConfidence?.toFixed(1)} / 100`
              : "--"}
          </p>
          <p className="pt-2 text-xs text-surface-400">
            信心越高，模型在当前行情下的持仓越稳定。
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-surface-50 px-3 py-2 text-xs text-surface-500">
          <Target size={14} />
          理想区间 ≥ 70
        </div>
      </div>

      <div className="mt-5 h-3 rounded-full bg-surface-100">
        {hasConfidence ? (
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percentage}%` }}
          />
        ) : null}
      </div>
    </section>
  );
}

function PositionsTable({
  agent,
}: {
  agent: Awaited<ReturnType<typeof fetchAgentDetail>>;
}) {
  if (!agent || agent.positions.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-12 text-center text-sm text-surface-400">
        当前 Agent 暂无持仓记录。
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-surface-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-100 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">
            持仓详情
          </h2>
          <p className="text-xs text-surface-400">
            实时价格由 API 返回，单位均为 USDT。
          </p>
        </div>
        <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-semibold text-surface-500">
          共 {agent.positions.length} 个持仓
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-100 text-sm text-surface-600">
          <thead className="bg-surface-50 text-xs uppercase tracking-wide text-surface-400">
            <tr>
              <th className="px-6 py-3 text-left">Symbol</th>
              <th className="px-6 py-3 text-left">方向</th>
              <th className="px-6 py-3 text-right">数量</th>
              <th className="px-6 py-3 text-right">杠杆</th>
              <th className="px-6 py-3 text-right">入场价</th>
              <th className="px-6 py-3 text-right">最新价</th>
              <th className="px-6 py-3 text-right">保证金</th>
              <th className="px-6 py-3 text-right">浮动盈亏</th>
              <th className="px-6 py-3 text-right">止盈</th>
              <th className="px-6 py-3 text-right">止损</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {agent.positions.map((position) => (
              <tr
                key={position.symbol}
                className="transition hover:bg-surface-50/70"
              >
                <td className="px-6 py-4 text-sm font-semibold text-surface-800">
                  {position.symbol}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                      position.side === "LONG"
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-rose-100 text-rose-600"
                    }`}
                  >
                    {position.side === "LONG" ? "做多" : "做空"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {quantityFormatter.format(position.quantity)}
                </td>
                <td className="px-6 py-4 text-right">
                  {position.leverage}x
                </td>
                <td className="px-6 py-4 text-right">
                  ${position.entryPrice.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-right">
                  ${position.currentPrice.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-right">
                  {formatCurrency(position.margin)}
                </td>
                <td
                  className={`px-6 py-4 text-right font-semibold ${
                    position.unrealizedPnl >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  {formatSignedCurrency(position.unrealizedPnl)}
                </td>
                <td className="px-6 py-4 text-right">
                  {formatStopLevel(position.takeProfit)}
                </td>
                <td className="px-6 py-4 text-right">
                  {formatStopLevel(position.stopLoss)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatSignedCurrency(value: number): string {
  const formatted = currencyFormatter.format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function formatStopLevel(value: number | undefined): string {
  if (value === undefined) {
    return "--";
  }
  return `$${value.toFixed(2)}`;
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
