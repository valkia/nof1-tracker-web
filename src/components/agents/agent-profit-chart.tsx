"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { AgentOverview } from "@/server/nof1/service";

interface AgentProfitChartProps {
  agents: AgentOverview[];
  rangeDescription: string;
  totalProfit: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AgentProfitChart({
  agents,
  rangeDescription,
  totalProfit,
}: AgentProfitChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const data = useMemo<LineData[]>(() => buildLineData(agents), [agents]);
  const stats = useMemo(() => computeStats(data), [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      height: 320,
      width: container.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: "#0f172a" },
        textColor: "#cbd5f5",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        vertLine: { color: "#334155", style: 3, width: 1 },
        horzLine: { color: "#334155", style: 3, width: 1 },
      },
      rightPriceScale: {
        borderColor: "#1e293b",
      },
      timeScale: {
        borderColor: "#1e293b",
        rightOffset: 2,
        barSpacing: 8,
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#22c55e",
      lineWidth: 3,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        chart.resize(width, 320);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) {
      return;
    }

    if (data.length === 0) {
      series.setData([]);
      return;
    }

    series.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  const showEmptyState = agents.length === 0 || data.length === 0;

  return (
    <section className="space-y-6 rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {"\u76c8\u5229\u8d70\u52bf"}
          </p>
          <h2 className="text-xl font-semibold text-surface-900">
            {`${rangeDescription} Agent \u76c8\u5229\u6298\u7ebf\u5bf9\u6bd4`}
          </h2>
        </div>

        <div className="flex items-baseline gap-2 rounded-2xl bg-surface-50 px-4 py-2 text-right">
          <span className="text-xs font-medium text-surface-400">
            {"\u7d2f\u8ba1\u76c8\u4e8f"}
          </span>
          <span
            className={`text-lg font-semibold ${
              totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {formatSignedCurrency(totalProfit)}
          </span>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-surface-100 bg-surface-950/90">
        <div ref={containerRef} className="h-[320px] w-full" />
        {showEmptyState ? (
          <p className="py-4 text-center text-xs text-surface-400">
            {
              "\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6682\u65e0\u53ef\u7ed8\u5236\u7684\u6536\u76ca\u6570\u636e\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002"
            }
          </p>
        ) : null}
      </div>

      <footer className="grid grid-cols-1 gap-3 text-xs text-surface-500 sm:grid-cols-3">
        <StatCard
          label="\u6700\u65b0\u70b9"
          value={
            stats.latest
              ? `${formatSignedCurrency(stats.latest.value)} · ${formatTimestamp(
                  stats.latest.time as UTCTimestamp,
                )}`
              : "--"
          }
        />
        <StatCard
          label="\u6700\u9ad8\u76c8\u5229"
          value={
            stats.highest
              ? `${formatSignedCurrency(stats.highest.value)} · ${formatTimestamp(
                  stats.highest.time as UTCTimestamp,
                )}`
              : "--"
          }
        />
        <StatCard
          label="\u6700\u4f4e\u76c8\u5229"
          value={
            stats.lowest
              ? `${formatSignedCurrency(stats.lowest.value)} · ${formatTimestamp(
                  stats.lowest.time as UTCTimestamp,
                )}`
              : "--"
          }
        />
      </footer>
    </section>
  );
}

function buildLineData(agents: AgentOverview[]): LineData[] {
  const buckets = new Map<number, number>();

  for (const agent of agents) {
    const timestamp = Date.parse(agent.lastUpdated);
    if (Number.isNaN(timestamp)) {
      continue;
    }
    const unixSeconds = Math.floor(timestamp / 1000);
    const current = buckets.get(unixSeconds) ?? 0;
    buckets.set(unixSeconds, current + agent.stats.netUnrealizedPnl);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(
      ([time, value]) =>
        ({
          time: time as UTCTimestamp,
          value: Number(value.toFixed(2)),
        }) satisfies LineData,
    );
}

function computeStats(data: LineData[]) {
  if (data.length === 0) {
    return {
      latest: null,
      highest: null,
      lowest: null,
    };
  }

  let highest = data[0];
  let lowest = data[0];

  for (const point of data) {
    if (point.value > highest.value) {
      highest = point;
    }
    if (point.value < lowest.value) {
      lowest = point;
    }
  }

  return {
    latest: data[data.length - 1],
    highest,
    lowest,
  };
}

function formatSignedCurrency(value: number): string {
  const formatted = currencyFormatter.format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function formatTimestamp(time: UTCTimestamp): string {
  const date = new Date(time * 1000);
  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-100 bg-surface-50/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-400">
        {label}
      </p>
      <p className="pt-1 text-sm font-semibold text-surface-700">
        {value}
      </p>
    </div>
  );
}
