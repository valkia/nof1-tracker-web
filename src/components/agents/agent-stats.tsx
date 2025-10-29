import { TrendingDown, TrendingUp } from "lucide-react";

import type { AgentDashboardSummary } from "@/types/agents";

interface SummaryCardProps {
  label: string;
  value: string;
  description: string;
  highlight?: "positive" | "negative";
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AgentStatsSummary(props: {
  summary: AgentDashboardSummary;
  rangeDescription?: string;
}) {
  const { summary, rangeDescription } = props;

  const netProfitDescription =
    rangeDescription !== undefined
      ? `Floating P&L across positions during ${rangeDescription}`
      : "Floating P&L across all tracked positions";

  const equityDescription =
    rangeDescription !== undefined
      ? `Account equity during ${rangeDescription}`
      : "Current total account equity";

  const cards: SummaryCardProps[] = [
    {
      label: "Active Agents",
      value: summary.agentCount.toString(),
      description: "Agents currently syncing positions",
    },
    {
      label: "Total Margin",
      value: formatCurrency(summary.totalMargin),
      description: "Aggregate margin posted across modes",
    },
    {
      label: "Total Equity",
      value: formatCurrency(summary.totalEquity),
      description: equityDescription,
    },
    {
      label: "Gross Exposure",
      value: formatCurrency(summary.totalExposure),
      description: "Position size computed at latest prices",
    },
    {
      label: "Floating P&L",
      value: formatSignedCurrency(summary.netUnrealized),
      description: netProfitDescription,
      highlight: summary.netUnrealized >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}

      <div className="rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-surface-500">Average Confidence</p>
        <p className="pt-2 text-2xl font-semibold text-surface-900">
          {summary.averageConfidence !== null
            ? `${summary.averageConfidence.toFixed(1)} / 100`
            : "--"}
        </p>
        <p className="pt-1 text-xs text-surface-400">
          Position-weighted confidence score
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
  const badgeClassName =
    "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium";
  const highlightClassName =
    highlight === "positive"
      ? "bg-emerald-50 text-emerald-600"
      : highlight === "negative"
        ? "bg-rose-50 text-rose-600"
        : "";

  return (
    <div className="rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-surface-500">{label}</p>

      <div className="flex items-end gap-2 pt-2">
        <p className="text-2xl font-semibold text-surface-900">{value}</p>

        {highlight ? (
          <span className={`${badgeClassName} ${highlightClassName}`}>
            {highlight === "positive" ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )}
            {highlight === "positive" ? "Gain" : "Loss"}
          </span>
        ) : null}
      </div>

      <p className="pt-1 text-xs text-surface-400">{description}</p>
    </div>
  );
}

function formatSignedCurrency(value: number): string {
  const formatted = currencyFormatter.format(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}
