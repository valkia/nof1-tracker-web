"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
  type Time,
  type BusinessDay,
} from "lightweight-charts";
import type {
  AgentProfitSeries,
  AgentProfitSeriesPayload,
  ProfitRange,
} from "@/types/agents";

interface AgentProfitChartProps {
  profitRange: ProfitRange;
  rangeDescription: string;
  totalEquity: number;
}

const COLOR_PALETTE = [
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#0ea5e9",
  "#facc15",
  "#10b981",
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AgentProfitChart({
  profitRange,
  rangeDescription,
  totalEquity,
}: AgentProfitChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(
    new Map(),
  );

  const [seriesData, setSeriesData] =
    useState<AgentProfitSeries[]>([]);
  const [rangeBounds, setRangeBounds] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endPointLabels, setEndPointLabels] = useState<
    Array<{
      modelId: string;
      x: number;
      y: number;
      value: number;
      color: string;
    }>
  >([]);

  // 统一的标签更新函数
  const updateEndPointLabels = useMemo(
    () => () => {
      const chart = chartRef.current;
      if (!chart) return;

      const labels: Array<{
        modelId: string;
        x: number;
        y: number;
        value: number;
        color: string;
      }> = [];

      for (const [modelId, lineSeries] of seriesMapRef.current.entries()) {
        const data = lineSeries.data();
        if (data.length === 0) continue;

        const lastPoint = data[data.length - 1];
        if (!('value' in lastPoint)) continue;

        const coordinate = lineSeries.priceToCoordinate(lastPoint.value);
        const timeCoordinate = chart
          .timeScale()
          .timeToCoordinate(lastPoint.time as UTCTimestamp);

        if (
          coordinate !== null &&
          timeCoordinate !== null &&
          timeCoordinate !== undefined
        ) {
          labels.push({
            modelId,
            x: timeCoordinate,
            y: coordinate,
            value: lastPoint.value,
            color: colorForAgent(modelId),
          });
        }
      }

      setEndPointLabels(labels);
    },
    [],
  );

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
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => {
          if (typeof time === "string") {
            return time;
          }
          if (typeof time === "number") {
            return formatTickLabel(time as UTCTimestamp);
          }
          const business = time as BusinessDay;
          const month = String(business.month).padStart(2, "0");
          const day = String(business.day).padStart(2, "0");
          return `${month}-${day}`;
        },
      },
    });

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        chart.resize(width, 320);
        requestAnimationFrame(updateEndPointLabels);
      }
    });

    resizeObserver.observe(container);

    // 监听图表缩放和滚动事件
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(updateEndPointLabels);
    });

    return () => {
      resizeObserver.disconnect();
      for (const series of seriesMapRef.current.values()) {
        chart.removeSeries(series);
      }
      seriesMapRef.current.clear();
      chart.remove();
      chartRef.current = null;
    };
  }, [updateEndPointLabels]);

  useEffect(() => {
    let cancelled = false;

    async function loadSeries() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/agents/profit?range=${profitRange}`,
          { cache: "no-store" },
        );
        const payload = await response.json();

        if (!response.ok) {
          const message =
            payload.error ?? "无法加载盈亏走势数据";
          throw new Error(message);
        }

        if (!cancelled) {
          const data = payload.data as AgentProfitSeriesPayload | undefined;
          setSeriesData(data?.series ?? []);
          if (
            data?.rangeStart !== undefined &&
            data?.rangeEnd !== undefined
          ) {
            setRangeBounds({
              from: data.rangeStart,
              to: data.rangeEnd,
            });
          } else {
            setRangeBounds(null);
          }
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "无法加载盈亏走势数据";
        if (!cancelled) {
          setError(message);
          setSeriesData([]);
          setRangeBounds(null);
        }
        toast.error(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSeries();

    return () => {
      cancelled = true;
    };
  }, [profitRange]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    const activeKeys = new Set(
      seriesData.map((series) => series.modelId),
    );

    for (const [key, series] of seriesMapRef.current.entries()) {
      if (!activeKeys.has(key)) {
        chart.removeSeries(series);
        seriesMapRef.current.delete(key);
      }
    }

    seriesData.forEach((series) => {
      let lineSeries = seriesMapRef.current.get(series.modelId);
      if (!lineSeries) {
        lineSeries = chart.addSeries(LineSeries, {
          color: colorForAgent(series.modelId),
          lineWidth: 2,
          crosshairMarkerVisible: true,
          priceLineVisible: false,
        });
        seriesMapRef.current.set(series.modelId, lineSeries);
      }

      const lineData: LineData[] = series.points.map((point) => ({
        time: point.time as UTCTimestamp,
        value: Number(point.value.toFixed(2)),
      }));

      lineSeries.setData(lineData);
    });

    if (seriesData.length > 0) {
      if (rangeBounds) {
        chart.timeScale().setVisibleRange({
          from: rangeBounds.from as UTCTimestamp,
          to: rangeBounds.to as UTCTimestamp,
        });
      } else {
        chart.timeScale().fitContent();
      }
    }

    // 更新端点标签位置
    requestAnimationFrame(updateEndPointLabels);
  }, [seriesData, rangeBounds, updateEndPointLabels]);

  const aggregatedData = useMemo(
    () => mergeSeries(seriesData),
    [seriesData],
  );
  const stats = useMemo(
    () => computeStats(aggregatedData),
    [aggregatedData],
  );

  const showEmptyState =
    !loading &&
    !error &&
    (seriesData.length === 0 ||
      seriesData.every((series) => series.points.length === 0));

  return (
    <section className="space-y-6 rounded-3xl border border-surface-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            盈利走势
          </p>
          <h2 className="text-xl font-semibold text-surface-900">
            {rangeDescription} Agent 盈亏对比
          </h2>
        </div>
        <div className="flex items-baseline gap-2 rounded-2xl bg-surface-50 px-4 py-2 text-right">
          <span className="text-xs font-medium text-surface-400">
            Total floating P&amp;L
          </span>
          <span className="text-lg font-semibold text-surface-900">
            {formatCurrency(totalEquity)}
          </span>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-surface-100 bg-surface-950/90">
        <div className="relative h-[320px] w-full">
          <div ref={containerRef} className="absolute inset-0" />
          {endPointLabels.map((label, index) => {
            // 避免标签重叠，为每个标签添加垂直偏移
            const verticalOffset = index * 24;
            return (
              <div
                key={label.modelId}
                className="pointer-events-none absolute flex items-center gap-1.5 rounded-md bg-slate-900/95 px-2.5 py-1.5 text-[10px] font-semibold text-slate-100 shadow-xl backdrop-blur-sm transition-all"
                style={{
                  left: `${label.x + 10}px`,
                  top: `${Math.max(4, label.y - 12 + verticalOffset)}px`,
                  borderLeft: `3px solid ${label.color}`,
                  maxWidth: "180px",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: label.color }}>{label.modelId}</span>
                <span className="text-[9px] text-slate-300">
                  {formatSignedCurrency(label.value)}
                </span>
              </div>
            );
          })}
        </div>
        {loading ? (
          <p className="py-4 text-center text-xs text-surface-400">
            正在加载盈亏走势数据…
          </p>
        ) : null}
        {error ? (
          <p className="py-4 text-center text-xs text-rose-400">
            {error}
          </p>
        ) : null}
        {showEmptyState ? (
          <p className="py-4 text-center text-xs text-surface-400">
            当前筛选条件下暂无可绘制的盈亏数据，请稍后再试。
          </p>
        ) : null}
      </div>

      <footer className="grid grid-cols-1 gap-3 text-xs text-surface-500 sm:grid-cols-3">
        <StatCard
          label="最新点"
          value={
            stats.latest
              ? `${formatSignedCurrency(stats.latest.value)} · ${formatTimestamp(
                  stats.latest.time as UTCTimestamp,
                )}`
              : "--"
          }
        />
        <StatCard
          label="最高盈利"
          value={
            stats.highest
              ? `${formatSignedCurrency(stats.highest.value)} · ${formatTimestamp(
                  stats.highest.time as UTCTimestamp,
                )}`
              : "--"
          }
        />
        <StatCard
          label="最低盈利"
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

function mergeSeries(
  series: AgentProfitSeries[],
): LineData[] {
  const buckets = new Map<number, number>();

  for (const entry of series) {
    for (const point of entry.points) {
      const current = buckets.get(point.time) ?? 0;
      buckets.set(point.time, current + point.value);
    }
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

function colorForAgent(modelId: string): string {
  let hash = 0;
  for (let i = 0; i < modelId.length; i += 1) {
    hash = (hash * 31 + modelId.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function formatTickLabel(time: UTCTimestamp): string {
  const date = new Date(Number(time) * 1000);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatSignedCurrency(value: number): string {
  const formatted = currencyFormatter.format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
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
