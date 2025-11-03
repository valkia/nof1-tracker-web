import { TradingPlan } from "../types/trading";
import { ConfigManager } from "./config-manager";

export interface PriceToleranceCheck {
  entryPrice: number;
  currentPrice: number;
  priceDifference: number; // Percentage difference
  tolerance: number; // Tolerance threshold in percentage
  withinTolerance: boolean;
  shouldExecute: boolean;
  reason: string;
}

export interface RiskAssessment {
  isValid: boolean;
  riskScore: number;
  warnings: string[];
  maxLoss: number;
  suggestedPositionSize: number;
  priceTolerance?: PriceToleranceCheck;
}

export class RiskManager {
  private configManager: ConfigManager;

  constructor(configManager?: ConfigManager) {
    this.configManager = configManager || new ConfigManager();
  }

  assessRisk(tradingPlan: TradingPlan, userTotalMargin?: number, currentPrice?: number): RiskAssessment {
    // Basic risk assessment logic
    const riskScore = this.calculateRiskScore(tradingPlan, userTotalMargin, currentPrice);
    const warnings = this.generateWarnings(tradingPlan, riskScore, userTotalMargin, currentPrice);

    // Calculate max loss based on proper contract value and leverage
    const maxLoss = this.calculateMaxLoss(tradingPlan, userTotalMargin, currentPrice);

    return {
      isValid: riskScore <= 100, // Risk score threshold
      riskScore,
      warnings,
      maxLoss,
      suggestedPositionSize: this.calculateSuggestedPositionSize(tradingPlan, userTotalMargin, currentPrice)
    };
  }

  /**
   * 计算建议仓位大小
   * 如果提供了用户总保证金，则根据资金管理逻辑调整仓位规模
   * 如果提供了当前价格，则使用实际价格；否则使用 contractSize 估算
   */
  private calculateSuggestedPositionSize(tradingPlan: TradingPlan, userTotalMargin?: number, currentPrice?: number): number {
    if (!userTotalMargin || userTotalMargin <= 0) {
      // 如果没有提供用户保证金，使用原始数量
      return tradingPlan.quantity;
    }

    // 根据资金分配逻辑重新计算建议仓位
    // 使用实际价格或 contractSize 估算
    const priceEstimate = currentPrice || this.configManager.getContractSize(tradingPlan.symbol);
    const agentOriginalMargin = (tradingPlan.quantity * priceEstimate) / tradingPlan.leverage;

    // 如果用户保证金小于Agent原始保证金，按比例缩小仓位
    if (userTotalMargin < agentOriginalMargin) {
      const allocationRatio = userTotalMargin / agentOriginalMargin;
      return tradingPlan.quantity * allocationRatio;
    }

    // 否则使用原始数量
    return tradingPlan.quantity;
  }
  /**
   * 计算最大亏损
   * 如果提供了当前价格，则使用实际价格精确计算
   * 否则使用 contractSize 作为价格估计值进行粗略计算
   */
  private calculateMaxLoss(tradingPlan: TradingPlan, userTotalMargin?: number, currentPrice?: number): number {
    const suggestedSize = this.calculateSuggestedPositionSize(tradingPlan, userTotalMargin, currentPrice);
    
    if (currentPrice) {
      // 使用实际价格：maxLoss = suggestedSize * currentPrice
      return suggestedSize * currentPrice;
    } else {
      // 使用 contractSize 作为价格估计
      const contractSize = this.configManager.getContractSize(tradingPlan.symbol);
      return suggestedSize * contractSize;
    }
  }

  /**
   * 计算价格差异百分比
   */
  calculatePriceDifference(entryPrice: number, currentPrice: number): number {
    if (entryPrice <= 0) {
      throw new Error('Entry price must be greater than 0');
    }
    return Math.abs((currentPrice - entryPrice) / entryPrice) * 100;
  }

  /**
   * 检查价格是否在容忍范围内
   */
  checkPriceTolerance(
    entryPrice: number,
    currentPrice: number,
    symbol?: string,
    customTolerance?: number
  ): PriceToleranceCheck {
    const tolerance = customTolerance || this.configManager.getPriceTolerance(symbol);
    const priceDifference = this.calculatePriceDifference(entryPrice, currentPrice);
    const withinTolerance = priceDifference <= tolerance;

    return {
      entryPrice,
      currentPrice,
      priceDifference,
      tolerance,
      withinTolerance,
      shouldExecute: withinTolerance,
      reason: withinTolerance
        ? `Price difference ${priceDifference.toFixed(2)}% is within tolerance ${tolerance}%`
        : `Price difference ${priceDifference.toFixed(2)}% exceeds tolerance ${tolerance}%`
    };
  }

  /**
   * 包含价格容忍度检查的风险评估
   */
  assessRiskWithPriceTolerance(
    tradingPlan: TradingPlan,
    entryPrice: number,
    currentPrice: number,
    symbol?: string,
    customTolerance?: number,
    userTotalMargin?: number
  ): RiskAssessment {
    // Get basic risk assessment with current price for accurate maxLoss calculation
    const basicAssessment = this.assessRisk(tradingPlan, userTotalMargin, currentPrice);

    // Add price tolerance check
    const priceTolerance = this.checkPriceTolerance(entryPrice, currentPrice, symbol, customTolerance);

    // Combine warnings
    const combinedWarnings = [...basicAssessment.warnings];
    if (!priceTolerance.withinTolerance) {
      combinedWarnings.push(`Price tolerance check failed: ${priceTolerance.reason}`);
    }

    return {
      ...basicAssessment,
      warnings: combinedWarnings,
      priceTolerance,
      isValid: basicAssessment.isValid && priceTolerance.withinTolerance
    };
  }

  /**
   * 获取配置管理器
   */
  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  /**
   * 计算风险评分（更新版本，支持用户保证金参数和价格参数）
   */
  private calculateRiskScore(tradingPlan: TradingPlan, userTotalMargin?: number, currentPrice?: number): number {
    // 改进的风险评分计算
    // 基于杠杆、仓位大小和保证金比例的综合评估

    const priceEstimate = currentPrice || this.configManager.getContractSize(tradingPlan.symbol);

    // 使用原始交易计划数量计算风险评分（反映实际交易的风险）
    const originalNotionalValue = tradingPlan.quantity * priceEstimate * tradingPlan.leverage;
    const originalMarginRequired = originalNotionalValue / tradingPlan.leverage;

    // 基于杠杆的风险分（0-50分）
    const leverageRisk = Math.min(tradingPlan.leverage * 2.5, 50);

    // 基于仓位大小的风险分（0-30分）
    // 如果提供了用户总保证金，使用用户保证金作为账户大小参考
    const accountSize = userTotalMargin && userTotalMargin > 0 ? userTotalMargin : 10000;
    const positionRisk = Math.min((originalMarginRequired / accountSize) * 30, 30);

    // 基于杠杆和仓位的交互风险（0-20分）
    const interactionRisk = Math.min((tradingPlan.leverage * originalMarginRequired) / (accountSize * 10), 20);

    const baseScore = 20;
    const totalRisk = leverageRisk + positionRisk + interactionRisk;

    return Math.min(baseScore + totalRisk, 100);
  }

  /**
   * 生成风险警告（更新版本，支持用户保证金参数和价格参数）
   */
  private generateWarnings(tradingPlan: TradingPlan, riskScore: number, userTotalMargin?: number, currentPrice?: number): string[] {
    const warnings: string[] = [];
    const priceEstimate = currentPrice || this.configManager.getContractSize(tradingPlan.symbol);

    // 基于杠杆的警告
    if (tradingPlan.leverage > 20) {
      warnings.push("高杠杆警告：杠杆倍数超过20x，风险极高");
    } else if (tradingPlan.leverage > 10) {
      warnings.push("中等杠杆：杠杆倍数超过10x，请谨慎操作");
    }

    // 基于建议仓位的保证金警告（反映用户实际会交易的仓位）
    const suggestedSize = this.calculateSuggestedPositionSize(tradingPlan, userTotalMargin, currentPrice);
    const suggestedNotionalValue = suggestedSize * priceEstimate;
    const suggestedMarginRequired = suggestedNotionalValue / tradingPlan.leverage;

    if (userTotalMargin && userTotalMargin > 0) {
      const suggestedMarginPercentage = (suggestedMarginRequired / userTotalMargin) * 100;
      if (suggestedMarginPercentage > 50) {
        warnings.push(`重仓警告：保证金占用账户资金${suggestedMarginPercentage.toFixed(1)}%，风险过高`);
      } else if (suggestedMarginPercentage > 20) {
        warnings.push(`中等仓位：保证金占用账户资金${suggestedMarginPercentage.toFixed(1)}%，请注意风险`);
      }
    } else {
      // 如果没有用户提供保证金，使用默认账户大小计算警告
      const accountSize = 10000; // 默认账户大小
      const marginPercentage = (suggestedMarginRequired / accountSize) * 100;
      if (marginPercentage > 50) {
        warnings.push(`重仓警告：保证金占用账户资金${marginPercentage.toFixed(1)}%，风险过高`);
      } else if (marginPercentage > 20) {
        warnings.push(`中等仓位：保证金占用账户资金${marginPercentage.toFixed(1)}%，请注意风险`);
      }
    }

    // 基于风险评分的警告
    if (riskScore > 80) {
      warnings.push("高风险评分：建议降低仓位或杠杆");
    } else if (riskScore > 60) {
      warnings.push("中等风险：请确认风险承受能力");
    }

    // 基于名义价值的警告（使用建议仓位计算）
    if (suggestedNotionalValue > 50000) {
      warnings.push(`大额名义价值：名义价值$${suggestedNotionalValue.toLocaleString()}，市场波动影响显著`);
    }

    return warnings;
  }
}
