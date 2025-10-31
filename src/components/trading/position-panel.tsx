import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
  isolatedWallet: number; // 新增：逐仓钱包余额
  positionSide: string;
  notional: number;
  updateTime: number;
}

export function PositionPanel({ apiKey, apiSecret, testnet }: PositionPanelProps) {
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalUnrealizedPnl, setTotalUnrealizedPnl] = useState<number>(0);
  const [totalNotional, setTotalNotional] = useState<number>(0);
  const [totalMargin, setTotalMargin] = useState<number>(0); // 新增：总保证金
  const [refreshInterval, setRefreshInterval] = useState<number>(30); // 默认30秒刷新
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [sortConfig, setSortConfig] = useState<{ key: keyof PositionData; direction: 'asc' | 'desc' }>({
    key: 'symbol',
    direction: 'asc'
  });

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
      const [rawPositions, accountInfo] = await Promise.all([
        binanceService.getPositions(),
        binanceService.getAccountInfo()
      ]);

      // 从账户信息中获取保证金余额
      const marginBalance = accountInfo.totalMarginBalance || accountInfo.totalWalletBalance || 0;

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
          isolatedWallet: parseFloat(pos.isolatedWallet),
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
      setTotalMargin(parseFloat(marginBalance)); // 使用账户级别的保证金余额
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

  const sortedPositions = useMemo(() => {
    const sorted = [...positions].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // 处理不同数据类型的排序
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [positions, sortConfig]);

  const requestSort = (key: keyof PositionData) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: keyof PositionData) => {
    if (sortConfig.key !== key) {
      return '⇅';
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

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
            <p className="text-xs text-blue-600">保证金余额</p>
            <p className="text-lg font-semibold text-blue-700">
              ${formatNumber(totalMargin, 2)}
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
            {/* 表头 */}
                  <div className="flex items-center justify-between gap-4 px-4 py-2 bg-surface-50 border-b border-surface-100">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-2 h-2 rounded-full opacity-0"></div>
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => requestSort('symbol')}
                            className="text-xs font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap"
                          >
                            交易对 {getSortIndicator('symbol')}
                          </button>
                          <span className="text-xs text-surface-400">方向</span>
                          <span className="text-xs text-surface-400">类型</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-surface-400">
                          <span>杠杆</span>
                        </div>
                      </div>
                    </div>

                    {/* 表头网格 - 与数据行完全对齐 */}
                    <div className="grid grid-cols-6 gap-6 flex-shrink-0 w-[640px]">
                      <div className="text-right">
                        <button
                          onClick={() => requestSort('positionAmt')}
                          className="text-xs font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap"
                        >
                          数量 {getSortIndicator('positionAmt')}
                        </button>
                      </div>

                      <div className="text-right">
                        <button
                          onClick={() => requestSort('entryPrice')}
                          className="text-xs font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap"
                        >
                          开仓 {getSortIndicator('entryPrice')}
                        </button>
                      </div>

                      <div className="text-right">
                        <button
                          onClick={() => requestSort('markPrice')}
                          className="text-xs font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap"
                        >
                          标记 {getSortIndicator('markPrice')}
                        </button>
                      </div>

                      <div className="text-right">
                        <button
                          onClick={() => requestSort('unrealizedPnl')}
                          className="text-xs font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap"
                        >
                          盈亏 {getSortIndicator('unrealizedPnl')}
                        </button>
                      </div>

                      <div className="text-right">
                        <button
                          onClick={() => requestSort('liquidationPrice')}
                          className="text-xs font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap"
                        >
                          强平 {getSortIndicator('liquidationPrice')}
                        </button>
                      </div>

                      <div className="text-right">
                        <button
                          onClick={() => requestSort('isolatedMargin')}
                          className="text-xs font-medium text-surface-600 hover:text-surface-900 transition-colors whitespace-nowrap"
                        >
                          保证金 {getSortIndicator('isolatedMargin')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 持仓列表 */}
                  {sortedPositions.map((position) => {
                    const pnlPercentage = position.entryPrice > 0
                      ? ((position.markPrice - position.entryPrice) / position.entryPrice) * position.leverage * 100 * (position.positionAmt > 0 ? 1 : -1)
                      : 0;

                    return (
                      <div
                        key={`${position.symbol}-${position.positionSide}`}
                        className="flex items-center justify-between gap-4 px-4 py-3 border-b border-surface-100 last:border-b-0 hover:bg-surface-50 transition-colors duration-150 ease-in-out"
                      >
                        {/* 左侧：基本信息 */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${position.positionAmt > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-surface-900 truncate">
                                {position.symbol}
                              </span>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                position.positionAmt > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                              }`}>
                                {position.positionAmt > 0 ? '多' : '空'}
                              </span>
                              <span className="text-xs text-surface-500">
                                {position.marginType === 'CROSSED' ? '全仓' : '逐仓'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-surface-500">
                              <span>杠杆 {position.leverage}x</span>
                              <span>方向 {position.positionSide}</span>
                            </div>
                          </div>
                        </div>

                        {/* 右侧：核心数据 - 网格对齐 */}
                        <div className="grid grid-cols-6 gap-6 flex-shrink-0 w-[640px]">
                          <div className="text-right">
                            <p className="text-sm font-medium text-surface-900">
                              ${formatNumber(Math.abs(position.positionAmt) * position.entryPrice, 2)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-medium text-surface-900">
                              ${formatNumber(position.entryPrice, 2)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-medium text-surface-900">
                              ${formatNumber(position.markPrice, 2)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className={`text-sm font-medium ${getColorClass(position.unrealizedPnl)}`}>
                              ${formatNumber(position.unrealizedPnl, 2)}
                              {pnlPercentage !== 0 && (
                                <span className="ml-1 text-xs text-surface-400">
                                  ({formatNumber(pnlPercentage, 1)}%)
                                </span>
                              )}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-medium text-amber-600">
                              ${formatNumber(position.liquidationPrice, 2)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-medium text-surface-900">
                              ${formatNumber(position.isolatedMargin > 0 ? position.isolatedMargin : position.notional / position.leverage, 2)}
                            </p>
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