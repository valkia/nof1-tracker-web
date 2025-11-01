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

  assessRisk(tradingPlan: TradingPlan): RiskAssessment {
    // Basic risk assessment logic
    const riskScore = this.calculateRiskScore(tradingPlan);
    const warnings = this.generateWarnings(tradingPlan, riskScore);

    // Calculate max loss based on proper contract value and leverage
    const maxLoss = this.calculateMaxLoss(tradingPlan);

    return {
      isValid: riskScore <= 100, // Risk score threshold
      riskScore,
      warnings,
      maxLoss,
      suggestedPositionSize: tradingPlan.quantity
    };
  }

  /**
   * 计算最大亏损
   * 公式：maxLoss = quantity * contractSize
   * 对于多头仓位，最大亏损是全部保证金（数量 * 合约面值）
   * 杠杆已经体现在保证金计算中，不应在最大亏损计算中重复使用
   */
  private calculateMaxLoss(tradingPlan: TradingPlan): number {
    const contractSize = this.configManager.getContractSize(tradingPlan.symbol);
    const maxLoss = tradingPlan.quantity * contractSize;
    return maxLoss;
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
    customTolerance?: number
  ): RiskAssessment {
    // Get basic risk assessment
    const basicAssessment = this.assessRisk(tradingPlan);

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

  private calculateRiskScore(tradingPlan: TradingPlan): number {
    // 改进的风险评分计算
    // 基于杠杆、仓位大小和保证金比例的综合评估

    const contractSize = this.configManager.getContractSize(tradingPlan.symbol);
    const notionalValue = tradingPlan.quantity * contractSize * tradingPlan.leverage;
    const marginRequired = notionalValue / tradingPlan.leverage; // 保证金 = 名义价值 / 杠杆

    // 基于杠杆的风险分（0-50分）
    const leverageRisk = Math.min(tradingPlan.leverage * 2.5, 50);

    // 基于仓位大小的风险分（0-30分）
    // 假设账户总资金为10000 USDT作为参考
    const accountSize = 10000;
    const positionRisk = Math.min((marginRequired / accountSize) * 30, 30);

    // 基于杠杆和仓位的交互风险（0-20分）
    const interactionRisk = Math.min((tradingPlan.leverage * marginRequired) / (accountSize * 10), 20);

    const baseScore = 20;
    const totalRisk = leverageRisk + positionRisk + interactionRisk;

    return Math.min(baseScore + totalRisk, 100);
  }

  private generateWarnings(tradingPlan: TradingPlan, riskScore: number): string[] {
    const warnings: string[] = [];
    const contractSize = this.configManager.getContractSize(tradingPlan.symbol);
    const notionalValue = tradingPlan.quantity * contractSize * tradingPlan.leverage;
    const marginRequired = notionalValue / tradingPlan.leverage;

    // 基于杠杆的警告
    if (tradingPlan.leverage > 20) {
      warnings.push("高杠杆警告：杠杆倍数超过20x，风险极高");
    } else if (tradingPlan.leverage > 10) {
      warnings.push("中等杠杆：杠杆倍数超过10x，请谨慎操作");
    }

    // 基于仓位大小的警告
    const accountSize = 10000; // 假设账户资金
    const marginPercentage = (marginRequired / accountSize) * 100;
    if (marginPercentage > 50) {
      warnings.push(`重仓警告：保证金占用账户资金${marginPercentage.toFixed(1)}%，风险过高`);
    } else if (marginPercentage > 20) {
      warnings.push(`中等仓位：保证金占用账户资金${marginPercentage.toFixed(1)}%，请注意风险`);
    }

    // 基于风险评分的警告
    if (riskScore > 80) {
      warnings.push("高风险评分：建议降低仓位或杠杆");
    } else if (riskScore > 60) {
      warnings.push("中等风险：请确认风险承受能力");
    }

    // 基于名义价值的警告
    if (notionalValue > 50000) {
      warnings.push(`大额名义价值：名义价值$${notionalValue.toLocaleString()}，市场波动影响显著`);
    }

    return warnings;
  }
}
