import { Position } from "../scripts/analyze-api";

export interface CapitalAllocation {
  symbol: string;
  originalMargin: number;
  allocatedMargin: number;
  notionalValue: number;
  adjustedQuantity: number;
  allocationRatio: number;
  leverage: number;
  side: "BUY" | "SELL";
}

export interface CapitalAllocationResult {
  totalOriginalMargin: number;
  totalAllocatedMargin: number;
  totalNotionalValue: number;
  allocations: CapitalAllocation[];
}

export class FuturesCapitalManager {
  private defaultTotalMargin: number = 10; // Ĭ���ܱ�֤��10 USDT

  /**
   * ���䱣֤�𵽸�����λ
   * @param positions Agent�Ĳ�λ��Ϣ
   * @param totalMargin �û��趨���ܱ�֤��
   * @param availableBalance ��������ѡ�����ڼ���Ƿ����㹻�ʽ�
   * @param maxLeverage �������ܸˣ���ѡ������ѹ����λ�ܸˣ�
   */
  allocateMargin(
    positions: Position[],
    totalMargin?: number,
    availableBalance?: number,
    maxLeverage?: number,
  ): CapitalAllocationResult {
    let totalMarginToUse = totalMargin ?? this.defaultTotalMargin;

    if (availableBalance !== undefined && availableBalance > 0 && totalMarginToUse > availableBalance) {
      console.warn(`?? Insufficient available balance: Required ${totalMarginToUse.toFixed(2)} USDT, Available ${availableBalance.toFixed(2)} USDT`);
      console.warn(`?? Reducing allocation to available balance: ${availableBalance.toFixed(2)} USDT`);
      totalMarginToUse = availableBalance;
    }

    const prepared = positions
      .map((position) => {
        const absQuantity = Math.abs(position.quantity);
        const price = position.current_price;
        const baseLeverage = position.leverage > 0 ? position.leverage : 1;
        const effectiveLeverage = maxLeverage && maxLeverage > 0
          ? Math.min(baseLeverage, maxLeverage)
          : baseLeverage;

        const fallbackMargin =
          absQuantity > 0 && price > 0 && baseLeverage > 0
            ? (absQuantity * price) / baseLeverage
            : 0;

        const effectiveMargin = position.margin > 0 ? position.margin : fallbackMargin;

        return {
          position,
          effectiveMargin,
          effectiveLeverage,
        };
      })
      .filter((entry) => entry.effectiveMargin > 0 && entry.position.current_price > 0);

    if (prepared.length === 0) {
      return {
        totalOriginalMargin: 0,
        totalAllocatedMargin: 0,
        totalNotionalValue: 0,
        allocations: [],
      };
    }

    const totalOriginalMargin = prepared.reduce((sum, entry) => sum + entry.effectiveMargin, 0);
    if (totalOriginalMargin <= 0) {
      return {
        totalOriginalMargin: 0,
        totalAllocatedMargin: 0,
        totalNotionalValue: 0,
        allocations: [],
      };
    }

    const allocations: CapitalAllocation[] = prepared.map((entry) => {
      const { position, effectiveMargin, effectiveLeverage } = entry;
      const allocationRatio = effectiveMargin / totalOriginalMargin;
      const targetMargin = totalMarginToUse * allocationRatio;
      const rawNotional = targetMargin * effectiveLeverage;
      const rawQuantity = rawNotional / position.current_price;

      const roundedQuantity = this.roundQuantity(rawQuantity, position.symbol);
      const safeQuantity = Math.max(0, Math.min(roundedQuantity, rawQuantity));
      const notionalValue = safeQuantity * position.current_price;
      const allocatedMargin = effectiveLeverage > 0 ? notionalValue / effectiveLeverage : 0;
      const side = position.quantity > 0 ? "BUY" : "SELL";

      return {
        symbol: position.symbol,
        originalMargin: effectiveMargin,
        allocatedMargin,
        notionalValue,
        adjustedQuantity: safeQuantity,
        allocationRatio,
        leverage: effectiveLeverage,
        side,
      };
    });

    const totalAllocatedMargin = allocations.reduce((sum, allocation) => sum + allocation.allocatedMargin, 0);
    const totalNotionalValue = allocations.reduce((sum, allocation) => sum + allocation.notionalValue, 0);

    return {
      totalOriginalMargin,
      totalAllocatedMargin,
      totalNotionalValue,
      allocations,
    };
  }

  /**
   * ��ȡĬ���ܱ�֤��
   */
  getDefaultTotalMargin(): number {
    return this.defaultTotalMargin;
  }

  /**
   * ����Ĭ���ܱ�֤��
   */
  setDefaultTotalMargin(margin: number): void {
    if (margin <= 0) {
      throw new Error("Total margin must be positive");
    }
    this.defaultTotalMargin = margin;
  }

  /**
   * ��ʽ�������ʾ
   */
  formatAmount(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * ��ʽ���ٷֱ���ʾ
   */
  formatPercentage(ratio: number): string {
    return `${(ratio * 100).toFixed(2)}%`;
  }

  /**
   * ���ݽ��׶Ծ��ȸ�ʽ������
   */
  private roundQuantity(quantity: number, symbol: string): number {
    // ��������ӳ�䣬���ڸ������ֵ���С���׵�λ
    const quantityPrecisionMap: Record<string, number> = {
      'BTCUSDT': 3, // BTC: ����3λС������С0.001
      'ETHUSDT': 3, // ETH: ����3λС������С0.001
      'BNBUSDT': 2, // BNB: ����2λС������С0.01
      'XRPUSDT': 1, // XRP: ����1λС������С0.1
      'ADAUSDT': 0, // ADA: ����0λС������С1
      'DOGEUSDT': 0, // DOGE: ����0λС������С10
      'SOLUSDT': 2, // SOL: ����2λС������С0.01
      'AVAXUSDT': 2, // AVAX: ����2λС������С0.01
      'MATICUSDT': 1, // MATIC: ����1λС������С0.1
      'DOTUSDT': 2, // DOT: ����2λС������С0.01
      'LINKUSDT': 2, // LINK: ����2λС������С0.01
      'UNIUSDT': 2, // UNI: ����2λС������С0.01
    };

    const binanceSymbol = symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
    const precision = quantityPrecisionMap[binanceSymbol] ?? 3;

    const factor = Math.pow(10, precision);
    return Math.round(quantity * factor) / factor;
  }

  /**
   * ��֤������
   */
  validateAllocation(result: CapitalAllocationResult): boolean {
    const expectedMargin = result.totalAllocatedMargin;
    const actualMargin = this.defaultTotalMargin;
    const difference = Math.abs(expectedMargin - actualMargin);

    if (difference > 10) {
      console.warn(`Margin allocation mismatch: expected ${actualMargin}, got ${expectedMargin}, difference: ${difference}`);
      return false;
    }

    const totalRatio = result.allocations.reduce((sum, allocation) => sum + allocation.allocationRatio, 0);
    if (Math.abs(totalRatio - 1.0) > 0.001) {
      console.warn(`Allocation ratio sum is not 1.0: ${totalRatio}`);
      return false;
    }

    return true;
  }
}
