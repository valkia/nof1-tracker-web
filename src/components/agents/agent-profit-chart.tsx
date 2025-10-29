"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ColorType,
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  type Time,
  type BusinessDay,
} from "lightweight-charts";
import type {
  AgentProfitSeries,
  AgentProfitSeriesPayload,
  ProfitRange,
} from "@/types/agents";
import type { AgentProfitPoint } from "@/types/agents";

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
  const seriesMapRef = useRef<Map<string, ISeriesApi<"Candlestick">>>(
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

      // console.log('Updating endpoint labels...', {
      //   seriesCount: seriesMapRef.current.size,
      //   seriesData: Array.from(seriesMapRef.current.keys())
      // });

      for (const [modelId, lineSeries] of seriesMapRef.current.entries()) {
        const data = lineSeries.data();
        // console.log(`Processing model ${modelId}:`, {
        //   dataLength: data.length,
        //   lastPoint: data.length > 0 ? data[data.length - 1] : null
        // });

        if (data.length === 0) continue;

        const lastPoint = data[data.length - 1];
        if (!('close' in lastPoint)) continue;

        const coordinate = lineSeries.priceToCoordinate(lastPoint.close);
        const timeCoordinate = chart
          .timeScale()
          .timeToCoordinate(lastPoint.time as UTCTimestamp);

        // console.log(`Coordinate calculation for ${modelId}:`, {
        //   value: lastPoint.close,
        //   time: lastPoint.time,
        //   coordinate,
        //   timeCoordinate
        // });

        if (
          coordinate !== null &&
          timeCoordinate !== null &&
          timeCoordinate !== undefined
        ) {
          // 确保标签在容器内显示
          const containerWidth = chart.options().width || 800;
          const containerHeight = 500;

          // 调整位置，确保标签在可见区域内
          const adjustedX = Math.min(timeCoordinate, containerWidth - 200); // 留出标签宽度空间
          const adjustedY = Math.max(30, Math.min(coordinate, containerHeight - 30)); // 避免超出边界

          // console.log(`Position adjustment for ${modelId}:`, {
            //   original: { x: timeCoordinate, y: coordinate },
            //   adjusted: { x: adjustedX, y: adjustedY },
            //   containerSize: { width: containerWidth, height: containerHeight }
            // });

          labels.push({
            modelId,
            x: adjustedX,
            y: adjustedY,
            value: lastPoint.close,
            color: colorForAgent(modelId),
          });
        }
      }

      // console.log('Final labels:', labels);
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
      height: 500,
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
        chart.resize(width, 500);
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
            payload.error ?? "无法加载总敞口走势数据";
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
            : "无法加载总敞口走势数据";
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
      let candlestickSeries = seriesMapRef.current.get(series.modelId);
      if (!candlestickSeries) {
        candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: colorForAgent(series.modelId),
          downColor: colorForAgent(series.modelId),
          borderVisible: true,
          wickUpColor: colorForAgent(series.modelId),
          wickDownColor: colorForAgent(series.modelId),
        });
        seriesMapRef.current.set(series.modelId, candlestickSeries);
      }

      const candlestickData: CandlestickData[] = convertToCandlestickData(series.points);
      candlestickSeries.setData(candlestickData);
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

  // 将折线数据转换为K线数据
  const convertToCandlestickData = (points: AgentProfitPoint[]): CandlestickData[] => {
    if (points.length === 0) return [];

    const sortedPoints = points.sort((a, b) => a.time - b.time);
    const candlestickData: CandlestickData[] = [];

    for (let i = 0; i < sortedPoints.length; i++) {
      const currentPoint = sortedPoints[i];
      const value = Number(currentPoint.value.toFixed(2));

      // 为单个数据点创建OHLC数据
      // 开盘价和收盘价使用相同值，最高最低价也使用相同值
      // 这样会显示为一条横线，但保留了K线的视觉效果
      const candlestick: CandlestickData = {
        time: currentPoint.time as UTCTimestamp,
        open: value,
        high: value,
        low: value,
        close: value,
      };

      // 如果有多个数据点，可以创建更真实的K线效果
      if (i > 0) {
        const prevPoint = sortedPoints[i - 1];
        const prevValue = Number(prevPoint.value.toFixed(2));

        // 设置开盘价为前一个点的收盘价
        candlestick.open = prevValue;

        // 根据涨跌设置高低价
        if (value > prevValue) {
          // 上涨
          candlestick.high = value;
          candlestick.low = prevValue;
        } else if (value < prevValue) {
          // 下跌
          candlestick.high = prevValue;
          candlestick.low = value;
        } else {
          // 持平
          candlestick.high = value + (value * 0.001); // 添加0.1%的波动
          candlestick.low = value - (value * 0.001);
        }
      } else if (i < sortedPoints.length - 1) {
        // 对于第一个点，如果还有后续点，可以预估下一个点的趋势
        const nextPoint = sortedPoints[i + 1];
        const nextValue = Number(nextPoint.value.toFixed(2));

        if (nextValue > value) {
          candlestick.high = nextValue;
          candlestick.low = value;
        } else if (nextValue < value) {
          candlestick.high = value;
          candlestick.low = nextValue;
        } else {
          candlestick.high = value + (value * 0.001);
          candlestick.low = value - (value * 0.001);
        }
      }

      candlestickData.push(candlestick);
    }

    return candlestickData;
  };

  const aggregatedData = useMemo(
    () => mergeSeriesForCandlestick(seriesData),
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
            总敞口走势
          </p>
          <h2 className="text-xl font-semibold text-surface-900">
            {rangeDescription} Agent 敞口对比
          </h2>
        </div>
        <div className="flex items-baseline gap-2 rounded-2xl bg-surface-50 px-4 py-2 text-right">
          <span className="text-xs font-medium text-surface-400">
            Total Current Exposure
          </span>
          <span className="text-lg font-semibold text-surface-900">
            {formatCurrency(totalEquity)}
          </span>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-surface-100 bg-surface-950/90">
        <div className="relative h-[500px] w-full">
          <div ref={containerRef} className="absolute inset-0" />
          {endPointLabels.length === 0 && seriesData.length > 0 && (
            <div className="absolute top-4 left-4 text-xs text-yellow-400 bg-black/50 px-2 py-1 rounded">
              调试：有 {seriesData.length} 个series数据但无标签
            </div>
          )}
          {endPointLabels.map((label, index) => {
            // 避免标签重叠，为每个标签添加垂直偏移
            const verticalOffset = index * 24;
            // console.log(`Rendering label ${index}:`, {
            //   modelId: label.modelId,
            //   x: label.x,
            //   y: label.y,
            //   finalTop: Math.max(4, label.y - 12 + verticalOffset),
            //   finalLeft: label.x + 10
            // });
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
                  zIndex: 10,
                }}
              >
                <span style={{ color: label.color }}>{label.modelId}</span>
                <span className="text-[9px] text-slate-300">
                  {formatCurrency(label.value)}
                </span>
              </div>
            );
          })}
        </div>
        {loading ? (
          <p className="py-4 text-center text-xs text-surface-400">
            正在加载总敞口走势数据…
          </p>
        ) : null}
        {error ? (
          <p className="py-4 text-center text-xs text-rose-400">
            {error}
          </p>
        ) : null}
        {showEmptyState ? (
          <p className="py-4 text-center text-xs text-surface-400">
            当前筛选条件下暂无可绘制的总敞口数据，请稍后再试。
          </p>
        ) : null}
      </div>

      <footer className="grid grid-cols-1 gap-3 text-xs text-surface-500 sm:grid-cols-3">
        <StatCard
          label="最新敞口"
          value={
            stats.latest
              ? `${formatCurrency(stats.latest.close)} · ${formatTimestamp(
                  stats.latest.time as UTCTimestamp,
                )}`
              : "--"
          }
        />
        <StatCard
          label="最高敞口"
          value={
            stats.highest
              ? `${formatCurrency(stats.highest.close)} · ${formatTimestamp(
                  stats.highest.time as UTCTimestamp,
                )}`
              : "--"
          }
        />
        <StatCard
          label="最低敞口"
          value={
            stats.lowest
              ? `${formatCurrency(stats.lowest.close)} · ${formatTimestamp(
                  stats.lowest.time as UTCTimestamp,
                )}`
              : "--"
          }
        />
      </footer>
    </section>
  );
}

function mergeSeriesForCandlestick(
  series: AgentProfitSeries[],
): CandlestickData[] {
  const buckets = new Map<number, number>();

  for (const entry of series) {
    for (const point of entry.points) {
      const current = buckets.get(point.time) ?? 0;
      buckets.set(point.time, current + point.value);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => {
      const numValue = Number(value.toFixed(2));
      return {
        time: time as UTCTimestamp,
        open: numValue,
        high: numValue,
        low: numValue,
        close: numValue,
      } satisfies CandlestickData;
    });
}


function computeStats(data: CandlestickData[]) {
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
    if (point.close > highest.close) {
      highest = point;
    }
    if (point.close < lowest.close) {
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
