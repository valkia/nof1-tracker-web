"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { toast } from "sonner";
import type { TradeHistoryResult } from "@/server/nof1/trading";

const RANGE_OPTIONS = [
  { value: "24h", label: "24 小时" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
];

interface TradeHistoryChartProps {
  symbols: string[];
}

export function TradeHistoryChart({ symbols }: TradeHistoryChartProps) {
  const [range, setRange] = useState("7d");
  const [symbol, setSymbol] = useState("");
  const [history, setHistory] = useState<TradeHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("range", range);
        if (symbol) {
          params.set("symbol", symbol);
        }

        const response = await fetch(`/api/trading/history?${params}`, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok) {
          const message =
            response.status === 412
              ? "缺少 Binance API Key 或 Secret，无法获取交易历史。"
              : payload.error || "请求失败";
          throw new Error(message);
        }

        if (!cancelled) {
          setHistory(payload.data as TradeHistoryResult);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "无法加载交易历史";
        if (!cancelled) {
          setHistory(null);
          setError(message);
        }
        toast.error(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [range, symbol]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) {
      return;
    }

    if (!history || history.points.length === 0) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
      return;
    }

    const chart = createChart(container, {
      height: 320,
      width: container.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1120" },
        textColor: "#94a3b8",
      },
      crosshair: {
        vertLine: { color: "#1e293b", style: 3, width: 1 },
        horzLine: { color: "#1e293b", style: 3, width: 1 },
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: {
        borderColor: "#1e293b",
      },
      timeScale: {
        borderColor: "#1e293b",
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#22c55e",
      topColor: "rgba(34, 197, 94, 0.35)",
      bottomColor: "rgba(34, 197, 94, 0.05)",
    });

    const data = history.points.reduce<
      { time: UTCTimestamp; value: number }[]
    >((acc, point) => {
      const time = Math.floor(point.time / 1000) as UTCTimestamp;
      const last = acc[acc.length - 1];

      if (last && last.time === time) {
        last.value = point.cumulativePnl;
        return acc;
      }

      acc.push({ time, value: point.cumulativePnl });
      return acc;
    }, []);

    series.setData(data);
    chart.timeScale().fitContent();

    chartInstanceRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      if (chartInstanceRef.current && container) {
        chartInstanceRef.current.applyOptions({
          width: container.clientWidth,
        });
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartInstanceRef.current = null;
    };
  }, [history]);

  const stats = useMemo(() => {
    if (!history) {
      return {
        totalTrades: 0,
        totalRealizedPnl: 0,
        netQuantity: 0,
      };
    }

    return {
      totalTrades: history.totalTrades,
      totalRealizedPnl: history.totalRealizedPnl,
      netQuantity: history.netQuantity,
    };
  }, [history]);

  return (
    <section className="rounded-3xl border border-surface-200 bg-white/80 p-6 shadow-sm">
      <header className="flex flex-col gap-4 border-b border-surface-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-surface-900">
            交易表现走势
          </h2>
          <p className="text-xs text-surface-500">
            数据来自 Binance 交易记录，展示累计已实现盈亏。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 text-surface-400">
            范围
            <select
              className="rounded-xl border border-surface-200 bg-white px-3 py-2 text-surface-600 shadow-sm transition hover:border-primary/40"
              value={range}
              onChange={(event) => setRange(event.target.value)}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-surface-400">
            交易对
            <select
              className="min-w-32 rounded-xl border border-surface-200 bg-white px-3 py-2 text-surface-600 shadow-sm transition hover:border-primary/40"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
            >
              <option value="">全部</option>
              {symbols.map((pair) => (
                <option key={pair} value={pair}>
                  {pair}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-3">
        <MetricCard
          label="累计已实现盈亏"
          value={`${stats.totalRealizedPnl >= 0 ? "+" : "-"}$${Math.abs(
            stats.totalRealizedPnl,
          ).toFixed(2)}`}
          accent={stats.totalRealizedPnl >= 0 ? "positive" : "negative"}
        />
        <MetricCard label="成交笔数" value={`${stats.totalTrades} 笔`} />
        <MetricCard
          label="净成交量"
          value={`${stats.netQuantity.toFixed(4)} 张`}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-surface-100 bg-surface-950/90">
        <div ref={chartContainerRef} className="h-[320px] w-full" />
        {loading ? (
          <p className="py-3 text-center text-xs text-surface-400">
            正在加载交易数据...
          </p>
        ) : null}
        {error ? (
          <p className="py-3 text-center text-xs text-rose-400">{error}</p>
        ) : null}
        {!loading && !error && history?.points.length === 0 ? (
          <p className="py-3 text-center text-xs text-surface-400">
            暂无交易数据，等待 Binance 历史同步。
          </p>
        ) : null}
      </div>
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  accent?: "positive" | "negative";
}

function MetricCard({ label, value, accent }: MetricCardProps) {
  const accentClass =
    accent === "positive"
      ? "text-emerald-500"
      : accent === "negative"
        ? "text-rose-500"
        : "text-surface-900";

  return (
    <div className="rounded-2xl border border-surface-100 bg-surface-50/80 p-4">
      <p className="text-xs text-surface-400">{label}</p>
      <p className={`pt-2 text-lg font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}
