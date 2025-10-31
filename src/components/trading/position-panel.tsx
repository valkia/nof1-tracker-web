import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { BinanceService } from "@/services/binance-service";
import type { PositionResponse } from "@/server/core/services/binance-service";

interface PositionPanelProps {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

interface PositionData {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  leverage: number;
  marginType: string;
  isolatedMargin: number;
  positionSide: string;
  notional: number;
  updateTime: number;
}

export function PositionPanel({ apiKey, apiSecret, testnet }: PositionPanelProps) {
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalUnrealizedPnl, setTotalUnrealizedPnl] = useState<number>(0);
  const [totalNotional, setTotalNotional] = useState<number>(0);
  const [refreshInterval, setRefreshInterval] = useState<number>(30); // 默认30秒刷新
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);

  // 防抖定时器引用
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(0);

  const formatSymbol = (symbol: string): string => {
    if (symbol.endsWith('USDT')) {
      return symbol.replace('USDT', '');
    }
    return symbol;
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const getColorClass = (value: number): string => {
    if (value > 0) return "text-emerald-600";
    if (value < 0) return "text-rose-600";
    return "text-surface-600";
  };

  const loadPositions = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshRef.current;

    // 如果距离上次刷新不到5秒，跳过本次刷新（防抖）
    if (timeSinceLastRefresh < 5000 && positions.length > 0 && !forceRefresh) {
      return;
    }

    if (!apiKey || !apiSecret) {
      setPositions([]);
      return;
    }

    // 只有在没有数据或者强制刷新时才显示loading
    const shouldShowLoading = positions.length === 0 || forceRefresh;
    if (shouldShowLoading) {
      setLoading(true);
    }

    try {
      const binanceService = new BinanceService(apiKey, apiSecret, testnet);
      const rawPositions = await binanceService.getPositions();

      const formattedPositions = rawPositions
        .map((pos: PositionResponse) => ({
          symbol: formatSymbol(pos.symbol),
          positionAmt: parseFloat(pos.positionAmt),
          entryPrice: parseFloat(pos.entryPrice),
          markPrice: parseFloat(pos.markPrice),
          unrealizedPnl: parseFloat(pos.unRealizedProfit),
          liquidationPrice: parseFloat(pos.liquidationPrice),
          leverage: parseInt(pos.leverage),
          marginType: pos.marginType,
          isolatedMargin: parseFloat(pos.isolatedMargin),
          positionSide: pos.positionSide,
          notional: parseFloat(pos.notional),
          updateTime: pos.updateTime,
        }))
        .filter(pos => pos.positionAmt !== 0); // 只显示有持仓的

      // 计算汇总数据
      const totalPnl = formattedPositions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
      const totalNotionalValue = formattedPositions.reduce((sum, pos) => sum + pos.notional, 0);

      setTotalUnrealizedPnl(totalPnl);
      setTotalNotional(totalNotionalValue);
      setPositions(formattedPositions);
      lastRefreshRef.current = now;

    } catch (error) {
      console.error("获取持仓失败:", error);
      toast.error("获取持仓信息失败，请检查API配置");
      setPositions([]);
      setTotalUnrealizedPnl(0);
      setTotalNotional(0);
    } finally {
      if (shouldShowLoading) {
        setLoading(false);
      }
    }
  }, [apiKey, apiSecret, testnet, positions.length]);

  useEffect(() => {
    if (isAutoRefresh) {
      loadPositions();

      const interval = setInterval(() => {
        loadPositions();
      }, refreshInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, refreshInterval, loadPositions]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAutoRefresh) {
      loadPositions();
    }
  }, [isAutoRefresh, loadPositions]);

  const handleManualRefresh = () => {
    loadPositions(true);
  };

  const handleRefreshIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (value >= 5 && value <= 300) {
      setRefreshInterval(value);
    }
  };

  return (
    <div className="rounded-3xl border border-surface-200 bg-white/90 p-6 shadow-sm">
      <header className="flex flex-col gap-3 border-b border-surface-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-surface-900">
            当前持仓
          </h2>
          <p className="text-xs text-surface-500">
            显示币安期货账户的实时持仓信息
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-surface-500">
            <span>刷新间隔:</span>
            <input
              type="number"
              min="5"
              max="300"
              value={refreshInterval}
              onChange={handleRefreshIntervalChange}
              disabled={!isAutoRefresh}
              className="w-16 rounded-xl border border-surface-200 bg-white px-2 py-1 text-xs text-surface-700 disabled:bg-surface-50 disabled:text-surface-400"
            />
            <span>秒</span>
          </div>

          <label className="inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-surface-600 transition hover:border-primary/40">
            <input
              type="checkbox"
              checked={isAutoRefresh}
              onChange={(e) => setIsAutoRefresh(e.target.checked)}
            />
            自动刷新
          </label>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loading}
            className="inline-flex items-center rounded-xl border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-surface-200 disabled:text-surface-400"
          >
            {loading ? "刷新中..." : "手动刷新"}
          </button>
        </div>
      </header>

      {/* 汇总信息 */}
      {positions.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs text-emerald-600">总盈亏</p>
            <p className={`text-lg font-semibold ${getColorClass(totalUnrealizedPnl)}`}>
              ${formatNumber(totalUnrealizedPnl, 2)}
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs text-blue-600">持仓名义价值</p>
            <p className="text-lg font-semibold text-blue-700">
              ${formatNumber(totalNotional, 2)}
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-600">持仓数量</p>
            <p className="text-lg font-semibold text-amber-700">
              {positions.length}
            </p>
          </div>
        </div>
      )}

      {/* 持仓列表 */}
      <div className="mt-6">
        {loading ? (
          <div className="animate-pulse space-y-3 opacity-70">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-surface-100"></div>
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-sm text-surface-500">
              {apiKey && apiSecret ? "暂无持仓" : "请先配置币安API"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map((position) => {
              const pnlPercentage = position.entryPrice > 0
                ? ((position.markPrice - position.entryPrice) / position.entryPrice) * position.leverage * (position.positionAmt > 0 ? 1 : -1)
                : 0;

              return (
                <div
                  key={`${position.symbol}-${position.positionSide}`}
                  className="rounded-xl border border-surface-100 bg-white p-4 shadow-sm transition-all duration-300 ease-in-out hover:shadow-md"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${position.positionAmt > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-surface-900">
                            {position.symbol}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            position.positionAmt > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {position.positionAmt > 0 ? '多头' : '空头'}
                          </span>
                          <span className="text-xs text-surface-500">
                            {position.marginType === 'CROSSED' ? '全仓' : '逐仓'}
                          </span>
                        </div>
                        <div className="text-xs text-surface-500">
                          杠杆: {position.leverage}x | 方向: {position.positionSide}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-right">
                      <div>
                        <p className="text-xs text-surface-500">数量</p>
                        <p className="text-sm font-medium text-surface-900">
                          {formatNumber(Math.abs(position.positionAmt), 3)}张
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-surface-500">开仓价</p>
                        <p className="text-sm font-medium text-surface-900">
                          ${formatNumber(position.entryPrice, 2)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-surface-500">标记价</p>
                        <p className="text-sm font-medium text-surface-900">
                          ${formatNumber(position.markPrice, 2)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-surface-500">盈亏</p>
                        <p className={`text-sm font-medium ${getColorClass(position.unrealizedPnl)}`}>
                          ${formatNumber(position.unrealizedPnl, 2)}
                          <span className="ml-1 text-xs text-surface-400">
                            ({formatNumber(pnlPercentage, 2)}%)
                          </span>
                        </p>
                      </div>

                      {position.marginType === 'ISOLATED' && (
                        <div>
                          <p className="text-xs text-surface-500">逐仓保证金</p>
                          <p className="text-sm font-medium text-surface-900">
                            ${formatNumber(position.isolatedMargin, 2)}
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="text-xs text-surface-500">强平价</p>
                        <p className="text-sm font-medium text-amber-600">
                          ${formatNumber(position.liquidationPrice, 2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 进度条显示当前价格相对于开仓价和强平价的位置 */}
                  <div className="mt-3">
                    <div className="w-full bg-surface-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-blue-500 relative transition-all duration-500 ease-in-out"
                        style={{
                          width: `${Math.min(Math.max(0, ((position.markPrice - position.liquidationPrice) / (position.entryPrice - position.liquidationPrice)) * 100), 100)}%`
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-end pr-1">
                          <div className="w-1 h-3 bg-red-500 rounded"></div>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-surface-400 mt-1">
                      <span>强平价 ${formatNumber(position.liquidationPrice, 2)}</span>
                      <span>标记价 ${formatNumber(position.markPrice, 2)}</span>
                      <span>开仓价 ${formatNumber(position.entryPrice, 2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 环境提示 */}
      <div className="mt-4 flex items-center justify-center text-xs text-surface-400">
        {testnet ? "测试网环境" : "正式环境"} |
        最后更新: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}