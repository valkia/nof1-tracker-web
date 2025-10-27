import { TrendingDown, TrendingUp } from "lucide-react";

export interface AgentDashboardSummary {
  agentCount: number;
  positionsCount: number;
  totalExposure: number;
  totalMargin: number;
  netUnrealized: number;
  averageConfidence: number | null;
}

interface SummaryCardProps {
  label: string;
  value: string;
  description: string;
  highlight?: "positive" | "negative";
}

export function AgentStatsSummary(props: { summary: AgentDashboardSummary }) {
  const { summary } = props;

  const cards: SummaryCardProps[] = [
    {
      label: "活跃 Agent",
      value: summary.agentCount.toString(),
      description: `当前同步的 AI 交易模型，${summary.positionsCount} 个持仓`,
    },
    {
      label: "总保证金",
      value: `$${summary.totalMargin.toFixed(2)}`,
      description: "累计投入保证金（含逐仓与全仓）",
    },
    {
      label: "总名义敞口",
      value: `$${summary.totalExposure.toFixed(2)}`,
      description: "按当前价格统计的仓位规模",
    },
    {
      label: "总浮动盈亏",
      value: formatSignedCurrency(summary.netUnrealized),
      description: "所有仓位的实时盈亏表现",
      highlight: summary.netUnrealized >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}

      <div className="rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-surface-500">平均信心</p>
        <p className="pt-2 text-2xl font-semibold text-surface-900">
          {summary.averageConfidence !== null
            ? `${summary.averageConfidence.toFixed(1)} / 100`
            : "--"}
        </p>
        <p className="pt-1 text-xs text-surface-400">
          基于仓位的置信度评分
        </p>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  description,
  highlight,
}: SummaryCardProps) {
  return (
    <div className="rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-surface-500">{label}</p>

      <div className="flex items-end gap-2 pt-2">
        <p className="text-2xl font-semibold text-surface-900">{value}</p>

        {highlight ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
              highlight === "positive"
                ? "bg-emerald-100 text-emerald-600"
                : "bg-rose-100 text-rose-600"
            }`}
          >
            {highlight === "positive" ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )}
            {highlight === "positive" ? "收益" : "亏损"}
          </span>
        ) : null}
      </div>

      <p className="pt-1 text-xs text-surface-400">{description}</p>
    </div>
  );
}

function formatSignedCurrency(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}
