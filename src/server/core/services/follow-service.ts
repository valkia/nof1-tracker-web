import { Position, FollowPlan, AgentAccount, FollowOptions } from '../scripts/analyze-api';
import { ProfitExitRecord } from './order-history-manager';
import { PriceToleranceCheck } from './risk-manager';
import { CapitalAllocationResult } from './futures-capital-manager';
import { PositionManager } from './position-manager';
import { OrderHistoryManager } from './order-history-manager';
import { RiskManager } from './risk-manager';
import { FuturesCapitalManager } from './futures-capital-manager';
import { TradingExecutor } from './trading-executor';
import {
  LOGGING_CONFIG,
  TIME_CONFIG,
  LogLevel
} from '../config/constants';
import {
  handleErrors,
  safeExecute
} from '../utils/errors';
import { logInfo, logDebug, logVerbose, logWarn, logError } from '../utils/logger';

/**
 * 仓位变化检测结果
 */
interface PositionChange {
  symbol: string;
  type: 'entry_changed' | 'new_position' | 'position_closed' | 'no_change' | 'profit_target_reached';
  currentPosition?: Position;
  previousPosition?: Position;
  profitPercentage?: number; // 盈利百分比（仅当type为profit_target_reached时有值）
}

/**
 * 持仓验证结果
 */
interface PositionValidationResult {
  isValid: boolean;
  isConsistent: boolean;
  discrepancies: PositionDiscrepancy[];
  actionRequired: 'none' | 'rebuild_history' | 'trust_actual' | 'user_confirmation';
  suggestedAction: string;
}

/**
 * 持仓差异详情
 */
interface PositionDiscrepancy {
  symbol: string;
  type: 'missing_in_history' | 'extra_in_history' | 'quantity_mismatch' | 'price_mismatch';
  actualPosition?: Position;
  historicalPosition?: Position;
  quantityDiff?: number;
  priceDiff?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 用户确认结果
 */
interface UserConfirmationResult {
  confirmed: boolean;
  action: 'trust_actual' | 'rebuild_history' | 'abort';
  timestamp: number;
}

/**
 * 临时的用户确认存储（实际项目中应该使用数据库）
 */
class UserConfirmationManager {
  private static instance: UserConfirmationManager;
  private confirmations = new Map<string, UserConfirmationResult>();

  static getInstance(): UserConfirmationManager {
    if (!UserConfirmationManager.instance) {
      UserConfirmationManager.instance = new UserConfirmationManager();
    }
    return UserConfirmationManager.instance;
  }

  setConfirmation(agentId: string, result: UserConfirmationResult): void {
    this.confirmations.set(agentId, result);
  }

  getConfirmation(agentId: string): UserConfirmationResult | undefined {
    return this.confirmations.get(agentId);
  }

  clearConfirmation(agentId: string): void {
    this.confirmations.delete(agentId);
  }

  hasRecentConfirmation(agentId: string, maxAgeMs: number = 300000): boolean { // 5分钟过期
    const confirmation = this.getConfirmation(agentId);
    if (!confirmation) return false;

    const age = Date.now() - confirmation.timestamp;
    if (age > maxAgeMs) {
      this.clearConfirmation(agentId);
      return false;
    }

    return true;
  }
}
export class FollowService {
  private userConfirmationManager = UserConfirmationManager.getInstance();

  constructor(
    private positionManager: PositionManager,
    private orderHistoryManager: OrderHistoryManager,
    private riskManager: RiskManager,
    private capitalManager: FuturesCapitalManager,
    private tradingExecutor: TradingExecutor
  ) {}

  /**
   * 验证实际持仓与历史记录的一致性
   * @param agentId Agent ID
   * @param currentPositions 当前实际持仓
   * @returns 验证结果
   */
  async validatePositionConsistency(agentId: string, currentPositions: Position[]): Promise<PositionValidationResult> {
    logInfo(`${LOGGING_CONFIG.EMOJIS.SEARCH} Validating position consistency for agent ${agentId}`);

    try {
      // 重建历史仓位状态
      const historicalPositions = this.rebuildLastPositionsFromHistory(agentId, currentPositions);

      const discrepancies: PositionDiscrepancy[] = [];
      const currentPositionsMap = new Map(currentPositions.map(p => [p.symbol, p]));
      const historicalPositionsMap = new Map(historicalPositions.map(p => [p.symbol, p]));

      // 检查实际持仓中每个币种
      for (const [symbol, actualPosition] of currentPositionsMap) {
        const historicalPosition = historicalPositionsMap.get(symbol);

        if (!historicalPosition) {
          // 实际持仓在历史记录中不存在
          discrepancies.push({
            symbol,
            type: 'missing_in_history',
            actualPosition,
            severity: 'high'
          });
        } else {
          // 比较数量和价格
          const quantityDiff = Math.abs(actualPosition.quantity - historicalPosition.quantity);
          const priceDiff = Math.abs(actualPosition.entry_price - historicalPosition.entry_price);

          if (quantityDiff > 0.000001) { // 忽略微小差异
            discrepancies.push({
              symbol,
              type: 'quantity_mismatch',
              actualPosition,
              historicalPosition,
              quantityDiff,
              severity: quantityDiff > Math.abs(actualPosition.quantity) * 0.1 ? 'critical' : 'medium'
            });
          }

          if (priceDiff > 0.01) { // 价格差异超过1分
            discrepancies.push({
              symbol,
              type: 'price_mismatch',
              actualPosition,
              historicalPosition,
              priceDiff,
              severity: priceDiff > actualPosition.entry_price * 0.05 ? 'high' : 'low'
            });
          }
        }
      }

      // 检查历史记录中存在但实际没有的仓位
      for (const [symbol, historicalPosition] of historicalPositionsMap) {
        if (!currentPositionsMap.has(symbol)) {
          discrepancies.push({
            symbol,
            type: 'extra_in_history',
            historicalPosition,
            severity: 'medium'
          });
        }
      }

      // 确定处理策略
      const result = this.determineValidationAction(discrepancies, currentPositions, historicalPositions);

      logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Position validation completed: ${discrepancies.length} discrepancies found`);
      if (discrepancies.length > 0) {
        discrepancies.forEach(d => {
          logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} ${d.type} for ${d.symbol}: ${d.severity} severity`);
        });
      }

      return result;
    } catch (error) {
      logError(`${LOGGING_CONFIG.EMOJIS.ERROR} Failed to validate position consistency: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        isValid: false,
        isConsistent: false,
        discrepancies: [],
        actionRequired: 'user_confirmation',
        suggestedAction: 'Validation failed, please check logs and decide manually'
      };
    }
  }

  /**
   * 检查是否需要用户确认
   */
  async needsUserConfirmation(agentId: string, currentPositions: Position[]): Promise<boolean> {
    const validationResult = await this.validatePositionConsistency(agentId, currentPositions);
    return validationResult.actionRequired === 'user_confirmation' &&
           !this.userConfirmationManager.hasRecentConfirmation(agentId);
  }

  /**
   * 获取需要用户确认的信息
   */
  async getConfirmationRequiredInfo(agentId: string, currentPositions: Position[]): Promise<{
    message: string;
    discrepancies: PositionDiscrepancy[];
    options: Array<{value: string; label: string; description: string}>;
  }> {
    const validationResult = await this.validatePositionConsistency(agentId, currentPositions);

    return {
      message: validationResult.suggestedAction,
      discrepancies: validationResult.discrepancies,
      options: [
        {
          value: 'trust_actual',
          label: '信任实际持仓',
          description: '忽略历史记录差异，直接跟随当前实际持仓'
        },
        {
          value: 'rebuild_history',
          label: '重建历史记录',
          description: '基于当前持仓重新构建历史记录'
        },
        {
          value: 'abort',
          label: '中止操作',
          description: '暂停跟单，需要手动检查'
        }
      ]
    };
  }

  /**
   * 处理用户确认结果
   */
  handleUserConfirmation(agentId: string, action: 'trust_actual' | 'rebuild_history' | 'abort'): void {
    this.userConfirmationManager.setConfirmation(agentId, {
      confirmed: true,
      action,
      timestamp: Date.now()
    });
  }
  private determineValidationAction(
    discrepancies: PositionDiscrepancy[],
    currentPositions: Position[],
    historicalPositions: Position[]
  ): PositionValidationResult {
    if (discrepancies.length === 0) {
      return {
        isValid: true,
        isConsistent: true,
        discrepancies: [],
        actionRequired: 'none',
        suggestedAction: 'Positions are consistent, continue with normal processing'
      };
    }

    // 按严重程度分组
    const criticalIssues = discrepancies.filter(d => d.severity === 'critical');
    const highIssues = discrepancies.filter(d => d.severity === 'high');
    const mediumIssues = discrepancies.filter(d => d.severity === 'medium');

    // 如果有严重问题，需要用户确认
    if (criticalIssues.length > 0) {
      return {
        isValid: true, // 改为true，允许继续执行
        isConsistent: false,
        discrepancies,
        actionRequired: 'user_confirmation',
        suggestedAction: `Found ${criticalIssues.length} critical issues. Please review and confirm action.`
      };
    }

    // 如果实际持仓很多但历史记录很少，优先信任实际持仓
    if (currentPositions.length > 0 && historicalPositions.length === 0) {
      return {
        isValid: true,
        isConsistent: false,
        discrepancies,
        actionRequired: 'trust_actual',
        suggestedAction: 'No historical data found, will trust actual positions and rebuild history'
      };
    }

    // 如果历史记录显示有持仓但实际没有，可能是已平仓，重建历史
    const extraInHistory = discrepancies.filter(d => d.type === 'extra_in_history');
    if (extraInHistory.length > mediumIssues.length) {
      return {
        isValid: true,
        isConsistent: false,
        discrepancies,
        actionRequired: 'rebuild_history',
        suggestedAction: 'Historical data may be outdated, will rebuild history from actual positions'
      };
    }

    // 默认情况下，优先信任实际持仓
    return {
      isValid: true,
      isConsistent: false,
      discrepancies,
      actionRequired: 'trust_actual',
      suggestedAction: 'Minor inconsistencies found, will trust actual positions and update history'
    };
  }
  private rebuildLastPositionsFromHistory(agentId: string, currentPositions: Position[]): Position[] {
    const processedOrders = this.orderHistoryManager.getProcessedOrdersByAgent(agentId);
    
    if (!processedOrders || processedOrders.length === 0) {
      logDebug(`📚 No order history found for agent ${agentId}, treating all positions as new`);
      return [];
    }

    // 根据订单历史重建上次的仓位状态
    const lastPositionsMap = new Map<string, Position>();
    
    // 遍历当前仓位，查找对应的历史订单
    for (const currentPos of currentPositions) {
      // 查找该交易对最近的已处理订单
      const symbolOrders = processedOrders
        .filter(order => order.symbol === currentPos.symbol)
        .sort((a, b) => b.timestamp - a.timestamp); // 按时间倒序
      
      if (symbolOrders.length > 0) {
        const lastOrder = symbolOrders[0];
        
        // 重建上次的仓位信息
        lastPositionsMap.set(currentPos.symbol, {
          symbol: currentPos.symbol,
          entry_price: lastOrder.price || currentPos.entry_price,
          quantity: lastOrder.side === 'BUY' ? lastOrder.quantity : -lastOrder.quantity,
          leverage: currentPos.leverage,
          entry_oid: lastOrder.entryOid,
          tp_oid: 0, // 历史数据中没有止盈订单ID
          sl_oid: 0, // 历史数据中没有止损订单ID
          margin: 0, // 历史数据中没有保证金信息
          current_price: currentPos.current_price,
          unrealized_pnl: 0,
          confidence: currentPos.confidence,
          exit_plan: currentPos.exit_plan
        });
      }
    }

    const rebuiltPositions = Array.from(lastPositionsMap.values());
    logDebug(`📚 Rebuilt ${rebuiltPositions.length} positions from order history for agent ${agentId}`);
    
    return rebuiltPositions;
  }

  /**
   * 跟单特定 AI Agent
   */
  @handleErrors(Error, 'FollowService.followAgent')
  async followAgent(
    agentId: string,
    currentPositions: Position[],
    options?: FollowOptions
  ): Promise<FollowPlan[]> {
    logInfo(`${LOGGING_CONFIG.EMOJIS.ROBOT} Following agent: ${agentId}`);

    // 验证和显示跟单配置信息
    if (options?.profitTarget) {
      if (options.profitTarget <= 0 || options.profitTarget > 1000) {
        logWarn(`⚠️ Invalid profit target: ${options.profitTarget}%. Must be between 0 and 1000. Using default behavior.`);
        options.profitTarget = undefined;
      } else {
        logInfo(`${LOGGING_CONFIG.EMOJIS.TARGET} Profit target enabled: ${options.profitTarget}%`);
        if (options?.autoRefollow) {
          logInfo(`${LOGGING_CONFIG.EMOJIS.CLOSING} Auto-refollow enabled: will reset order status after profit target exit`);
        } else {
          logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Auto-refollow disabled: will not refollow after profit target exit`);
        }
      }
    } else {
      logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Profit target disabled: using agent's original exit plan only`);
    }

    // 0. 清理孤立的挂单 (没有对应仓位的止盈止损单)
    await this.positionManager.cleanOrphanedOrders();

    // 1. 新增：验证持仓一致性
    logInfo(`${LOGGING_CONFIG.EMOJIS.SEARCH} Validating position consistency before processing`);
    const validationResult = await this.validatePositionConsistency(agentId, currentPositions);

    if (!validationResult.isValid) {
      logError(`${LOGGING_CONFIG.EMOJIS.ERROR} Position validation failed: ${validationResult.suggestedAction}`);
      throw new Error(`Position validation failed: ${validationResult.suggestedAction}`);
    }

    // 初始化变量
    let previousPositions: Position[] = [];
    let useActualPositions = false;

    // 检查是否需要用户确认
    if (validationResult.actionRequired === 'user_confirmation') {
      const hasRecentConfirmation = this.userConfirmationManager.hasRecentConfirmation(agentId);
      if (!hasRecentConfirmation) {
        logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} ${validationResult.suggestedAction}, defaulting to trust actual positions as safe fallback`);
        // 不抛出错误，而是使用默认的安全策略：信任实际持仓
        previousPositions = [];
        useActualPositions = true;
      } else {
        // 使用用户的确认结果
        const confirmation = this.userConfirmationManager.getConfirmation(agentId)!;
        logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Using user confirmation for agent ${agentId}: ${confirmation.action}`);

        // 根据用户选择调整验证结果
        if (confirmation.action === 'trust_actual') {
          validationResult.actionRequired = 'trust_actual';
        } else if (confirmation.action === 'rebuild_history') {
          validationResult.actionRequired = 'rebuild_history';
        } else if (confirmation.action === 'abort') {
          throw new Error('User chose to abort the operation');
        }
      }
    }

    // 2. 根据验证结果决定使用哪种状态
    if (useActualPositions === false) {
      if (validationResult.isConsistent) {
        // 状态一致，使用历史重建的位置
        previousPositions = this.rebuildLastPositionsFromHistory(agentId, currentPositions);
        logInfo(`${LOGGING_CONFIG.EMOJIS.SUCCESS} Positions are consistent, using historical data`);
      } else {
        // 状态不一致，根据策略决定
        switch (validationResult.actionRequired) {
          case 'trust_actual':
            // 优先信任实际持仓，不使用历史重建
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Trusting actual positions, treating all as new`);
            previousPositions = [];
            useActualPositions = true;
            break;

          case 'rebuild_history':
            // 重建历史，基于实际持仓
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Rebuilding history from actual positions`);
            previousPositions = this.rebuildLastPositionsFromHistory(agentId, currentPositions);
            break;

          case 'user_confirmation':
            // 这种情况应该在上面的用户确认检查中已经处理了
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} User confirmation case already handled, using default trust_actual strategy`);
            break;

          default:
            // 默认使用历史数据
            previousPositions = this.rebuildLastPositionsFromHistory(agentId, currentPositions);
        }
      }
    }

    const followPlans: FollowPlan[] = [];

    // 3. 检测仓位变化 - 如果信任实际持仓，则跳过对比直接生成跟随计划
    let changes: PositionChange[];
    if (useActualPositions) {
      // 直接基于实际持仓生成进入计划（避免先卖后买的循环）
      changes = await this.generateDirectEntryChanges(currentPositions, options);
      logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Using direct entry strategy for ${changes.length} positions`);
    } else {
      changes = await this.detectPositionChanges(currentPositions, previousPositions || [], options);
    }

    // 4. 处理每种变化
    for (const change of changes) {
      const plans = await this.handlePositionChange(change, agentId, options, useActualPositions, currentPositions);
      followPlans.push(...plans);
    }

    // 5. 检查止盈止损条件
    const exitPlans = this.checkExitConditions(currentPositions, agentId);
    followPlans.push(...exitPlans);

    // 6. 应用资金分配
    if (options?.totalMargin && options.totalMargin > 0) {
      await this.applyCapitalAllocation(followPlans, currentPositions, options!.totalMargin, agentId);
    }

    logInfo(`${LOGGING_CONFIG.EMOJIS.SUCCESS} Generated ${followPlans.length} follow plan(s) for agent ${agentId}`);
    return followPlans;
  }

  /**
   * 直接基于实际持仓生成进入计划（避免先卖后买的循环）
   */
  private async generateDirectEntryChanges(
    currentPositions: Position[],
    options?: FollowOptions
  ): Promise<PositionChange[]> {
    const changes: PositionChange[] = [];

    // 记录总的currentPositions信息
    logDebug(`${LOGGING_CONFIG.EMOJIS.SEARCH} generateDirectEntryChanges: Processing ${currentPositions.length} positions`);
    currentPositions.forEach(pos => {
      logDebug(`${LOGGING_CONFIG.EMOJIS.INFO}   - ${pos.symbol}: qty=${pos.quantity}, entry=${pos.entry_price}, current=${pos.current_price}`);
    });

    for (const currentPosition of currentPositions) {
      if (currentPosition.quantity !== 0) {
        logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Processing ${currentPosition.symbol}: qty=${currentPosition.quantity}, entry=${currentPosition.entry_price}, current=${currentPosition.current_price}`);

        // 检查盈利目标
        if (options?.profitTarget) {
          const profitPercentage = await this.calculateProfitPercentage(currentPosition);
          if (profitPercentage >= options.profitTarget) {
            logInfo(`${LOGGING_CONFIG.EMOJIS.MONEY} ${currentPosition.symbol} profit target reached: ${profitPercentage.toFixed(2)}% >= ${options.profitTarget}%`);
            changes.push({
              symbol: currentPosition.symbol,
              type: 'profit_target_reached',
              currentPosition,
              profitPercentage
            });
            continue;
          } else {
            logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} profit check: ${profitPercentage.toFixed(2)}% < ${options.profitTarget}% (not reached)`);
          }
        } else {
          logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} profit target check skipped (not set)`);
        }

        // 检查是否已经有相同的仓位在Binance上，避免重复建仓
        let existingPosition = null;
        let positionAmt = 0;
        let currentPositionSign = 0;
        let existingPositionSign = 0;

        try {
          const binancePositions = await this.positionManager['binanceService'].getPositions();
          logDebug(`${LOGGING_CONFIG.EMOJIS.SEARCH} Binance positions for ${currentPosition.symbol}:`);
          binancePositions.forEach(pos => {
            logDebug(`${LOGGING_CONFIG.EMOJIS.DATA}   - ${pos.symbol}: amt=${pos.positionAmt}, entry=${pos.entryPrice}, leverage=${pos.leverage}`);
          });

          const targetSymbol = this.positionManager['binanceService'].convertSymbol(currentPosition.symbol);
          logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Converting ${currentPosition.symbol} -> ${targetSymbol}`);

          existingPosition = binancePositions.find(
            p => p.symbol === targetSymbol && parseFloat(p.positionAmt) !== 0
          );

          if (existingPosition) {
            logInfo(`${LOGGING_CONFIG.EMOJIS.WARNING} Found existing position for ${currentPosition.symbol}: ${existingPosition.symbol} amt=${existingPosition.positionAmt}, entry=${existingPosition.entryPrice}`);

            // 如果Binance上已经有仓位，检查是否需要调整
            positionAmt = parseFloat(existingPosition.positionAmt);
            currentPositionSign = Math.sign(currentPosition.quantity);
            existingPositionSign = Math.sign(positionAmt);

            logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} sign check: current=${currentPositionSign}, existing=${existingPositionSign}`);

            // 如果方向相同，且数量相近，跳过这个仓位
            if (currentPositionSign === existingPositionSign) {
              // 计算保证金而不是直接比较数量
              const existingMargin = Math.abs(positionAmt * parseFloat(existingPosition.entryPrice)) / parseFloat(existingPosition.leverage);
              const currentMargin = Math.abs(currentPosition.quantity * currentPosition.entry_price) / currentPosition.leverage;

              const marginDiff = Math.abs(currentMargin - existingMargin);
              const entryPriceDiff = Math.abs(currentPosition.entry_price - parseFloat(existingPosition.entryPrice));
              const marginThreshold = currentMargin * 0.1;
              const priceThreshold = currentPosition.entry_price * 0.05;

              logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} margin check: diff=${marginDiff}, threshold=${marginThreshold}, price diff=${entryPriceDiff}, threshold=${priceThreshold}`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Position Comparison:`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Current Position Quantity: ${Math.abs(currentPosition.quantity)}`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Existing Position Quantity: ${Math.abs(positionAmt)}`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Current Margin: $${currentMargin.toFixed(2)}`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Existing Margin: $${existingMargin.toFixed(2)}`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Margin Ratio: ${(currentMargin / existingMargin).toFixed(2)}x`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Current Entry Price: ${currentPosition.entry_price}`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Existing Entry Price: ${parseFloat(existingPosition.entryPrice)}`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Price Difference: ${entryPriceDiff.toFixed(2)}`);

              // 如果保证金和价格都很接近，认为是同一个仓位，跳过
              if (marginDiff < marginThreshold && entryPriceDiff < priceThreshold) {
                logInfo(`${LOGGING_CONFIG.EMOJIS.WARNING} SKIPPING ${currentPosition.symbol} - existing position matches current position`);
                continue; // 跳过这个仓位，不生成计划
              } else {
                logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} thresholds not met - will create plan`);
                // 即使保证金不匹配，也要检查是否需要调整仓位
                const requiredMargin = currentMargin;
                const currentMarginExisting = existingMargin;
                const marginDifference = requiredMargin - currentMarginExisting;

                // 如果需要增加仓位且方向相同
                if (marginDifference > 1) { // 最小保证金阈值
                  logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} needs position adjustment: adding $${marginDifference.toFixed(2)} margin`);
                } else if (marginDifference < -1) { // 需要减少仓位
                  logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} needs position reduction: removing $${Math.abs(marginDifference).toFixed(2)} margin`);
                }
              }
            } else {
              logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} direction different - will create plan`);
              // 方向不同，需要先平仓再开仓
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} position direction changed - will close existing and open new`);
            }
          } else {
            logInfo(`${LOGGING_CONFIG.EMOJIS.SUCCESS} NO existing position found for ${currentPosition.symbol} - will create plan`);
          }
        } catch (error) {
          logError(`${LOGGING_CONFIG.EMOJIS.ERROR} Failed to check existing Binance positions for ${currentPosition.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // 只有在没有现有仓位或需要调整仓位时才生成进入计划
        let shouldGeneratePlan = false;
        if (!existingPosition) {
          // 没有现有仓位，生成新仓位计划
          shouldGeneratePlan = true;
        } else if (currentPositionSign !== existingPositionSign) {
          // 方向不同，需要先平仓再开仓
          shouldGeneratePlan = true;
        } else {
          // 方向相同，检查是否需要调整仓位
          const quantityDiff = Math.abs(Math.abs(currentPosition.quantity) - Math.abs(positionAmt));
          const entryPriceDiff = Math.abs(currentPosition.entry_price - parseFloat(existingPosition?.entryPrice || 0));
          const quantityThreshold = Math.abs(currentPosition.quantity) * 0.1;
          const priceThreshold = currentPosition.entry_price * 0.05;

          // 如果数量或价格差异较大，需要调整仓位
          if (quantityDiff >= quantityThreshold || entryPriceDiff >= priceThreshold) {
            shouldGeneratePlan = true;
          }
        }

        if (shouldGeneratePlan) {
          // 直接生成进入计划，不与历史对比
          logInfo(`${LOGGING_CONFIG.EMOJIS.TREND_UP} GENERATING plan for ${currentPosition.symbol}`);
          changes.push({
            symbol: currentPosition.symbol,
            type: 'new_position',
            currentPosition
          });
        }
      } else {
        logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Skipping ${currentPosition.symbol} - quantity is 0`);
      }
    }

    logInfo(`${LOGGING_CONFIG.EMOJIS.SUCCESS} generateDirectEntryChanges completed: ${changes.length} changes generated`);
    changes.forEach(change => {
      logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   - ${change.symbol}: ${change.type}`);
    });

    // 添加关键调试信息：显示哪些位置被跳过以及原因
    const allSymbols = currentPositions.map(p => p.symbol);
    const processedSymbols = changes.map(c => c.symbol);
    const skippedSymbols = allSymbols.filter(symbol => !processedSymbols.includes(symbol));

    if (skippedSymbols.length > 0) {
      logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} The following symbols were skipped in generateDirectEntryChanges: ${skippedSymbols.join(', ')}`);
      skippedSymbols.forEach(symbol => {
        const position = currentPositions.find(p => p.symbol === symbol);
        if (position) {
          logWarn(`${LOGGING_CONFIG.EMOJIS.INFO}   ${symbol}: quantity=${position.quantity}, entry_price=${position.entry_price}, current_price=${position.current_price}`);
        }
      });
    }

    return changes;
  }

  /**
   * 同步计算盈利百分比（用于直接进入策略）
   */
  private calculateProfitPercentageSync(currentPosition: Position): number {
    const priceDiff = currentPosition.current_price - currentPosition.entry_price;
    const pnl = priceDiff * currentPosition.quantity;
    const margin = Math.abs(currentPosition.quantity) * currentPosition.entry_price / currentPosition.leverage;

    if (margin === 0) return 0;
    return (pnl / margin) * 100;
  }

  /**
   * 检测仓位变化
   */
  private async detectPositionChanges(
    currentPositions: Position[],
    previousPositions: Position[],
    options?: FollowOptions
  ): Promise<PositionChange[]> {
    const changes: PositionChange[] = [];
    const currentPositionsMap = new Map(currentPositions.map(p => [p.symbol, p]));
    const previousPositionsMap = new Map(previousPositions.map(p => [p.symbol, p]));

    // 检查当前所有仓位
    for (const [symbol, currentPosition] of currentPositionsMap) {
      const previousPosition = previousPositionsMap.get(symbol);

      // 检查盈利目标 (仅在当前有仓位时)
      if (options?.profitTarget && currentPosition.quantity !== 0) {
        const profitPercentage = await this.calculateProfitPercentage(currentPosition);
        logInfo(`💰 ${symbol} current profit: ${profitPercentage.toFixed(2)}% (target: ${options.profitTarget}%)`);

        if (profitPercentage >= options.profitTarget) {
          logInfo(`🎯 Profit target reached for ${symbol}: ${profitPercentage.toFixed(2)}% >= ${options.profitTarget}%`);
          changes.push({
            symbol,
            type: 'profit_target_reached',
            currentPosition,
            previousPosition,
            profitPercentage
          });
          continue; // 如果已达到盈利目标，跳过其他变化检测
        }
      }

      if (!previousPosition) {
        // 新仓位
        if (currentPosition.quantity !== 0) {
          changes.push({
            symbol,
            type: 'new_position',
            currentPosition,
            previousPosition
          });
        }
      } else {
        // 检查 entry_oid 变化（先平仓再开仓）
        if (previousPosition.entry_oid !== currentPosition.entry_oid && currentPosition.quantity !== 0) {
          logInfo(`🔍 Detected OID change for ${symbol}: ${previousPosition.entry_oid} → ${currentPosition.entry_oid}`);
          changes.push({
            symbol,
            type: 'entry_changed',
            currentPosition,
            previousPosition
          });
        } else if (previousPosition.quantity !== 0 && currentPosition.quantity === 0) {
          // 仓位已平
          changes.push({
            symbol,
            type: 'position_closed',
            currentPosition,
            previousPosition
          });
        } else {
          // 调试: 显示为什么没有检测到变化
          logVerbose(`🔍 ${symbol}: Previous OID=${previousPosition.entry_oid}, Current OID=${currentPosition.entry_oid}, Qty=${currentPosition.quantity}`);
        }
      }
    }

    return changes;
  }

  /**
   * 计算仓位盈利百分比（使用币安真实数据）
   */
  private async calculateProfitPercentage(position: Position): Promise<number> {
    try {
      if (position.quantity === 0) {
        return 0;
      }

      // 从币安API获取真实仓位数据
      const binancePositions = await this.positionManager['binanceService'].getAllPositions();
      const targetSymbol = this.positionManager['binanceService'].convertSymbol(position.symbol);
      const binancePosition = binancePositions.find(p => p.symbol === targetSymbol && parseFloat(p.positionAmt) !== 0);

      if (!binancePosition) {
        logWarn(`⚠️ No binance position found for ${position.symbol} (${targetSymbol})`);
        return 0;
      }

      // 使用币安的真实未实现盈亏数据
      const unrealizedProfit = parseFloat(binancePosition.unRealizedProfit);
      const entryPrice = parseFloat(binancePosition.entryPrice);
      const positionAmt = parseFloat(binancePosition.positionAmt);
      const marginType = binancePosition.marginType;

      // 计算保证金基础
      let marginBase = 0;
      if (marginType === 'ISOLATED') {
        marginBase = parseFloat(binancePosition.isolatedMargin);
      } else {
        // 交叉保证金，使用实际占用保证金
        marginBase = Math.abs(positionAmt * entryPrice) / parseFloat(binancePosition.leverage);
      }

      // 计算盈利百分比
      const profitPercentage = marginBase > 0 ? (unrealizedProfit / marginBase) * 100 : 0;

      // 调试信息
      logInfo(`📈 ${position.symbol} Binance profit data:`);
      logInfo(`   💰 Unrealized P&L: $${unrealizedProfit.toFixed(2)}`);
      logInfo(`   💰 Margin: $${marginBase.toFixed(2)} (${marginType})`);
      logInfo(`   📊 Profit %: ${profitPercentage.toFixed(2)}%`);
      logInfo(`   📊 Binance entry: $${entryPrice.toFixed(2)}, Agent entry: $${position.entry_price}`);

      // 检查计算结果的合理性
      if (!isFinite(profitPercentage)) {
        logWarn(`⚠️ Invalid profit calculation for ${position.symbol}: ${profitPercentage}`);
        return 0;
      }

      return profitPercentage;
    } catch (error) {
      logError(`❌ Error calculating profit percentage for ${position.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 0;
    }
  }

  /**
   * 处理仓位变化
   */
  private async handlePositionChange(
    change: PositionChange,
    agentId: string,
    options?: FollowOptions,
    useDirectStrategy: boolean = false,
    currentPositions?: Position[]
  ): Promise<FollowPlan[]> {
    const plans: FollowPlan[] = [];

    switch (change.type) {
      case 'entry_changed':
        await this.handleEntryChanged(change, agentId, plans, options);
        break;

      case 'new_position':
        await this.handleNewPosition(change, agentId, plans, options, useDirectStrategy, currentPositions);
        break;

      case 'position_closed':
        this.handlePositionClosed(change, agentId, plans, options);
        break;

      case 'profit_target_reached':
        await this.handleProfitTargetReached(change, agentId, plans, options);
        break;

      case 'no_change':
        // 不处理
        break;
    }

    return plans;
  }

  /**
   * 处理 entry_oid 变化(先平仓再开仓)
   */
  private async handleEntryChanged(
    change: PositionChange,
    agentId: string,
    plans: FollowPlan[],
    options?: FollowOptions
  ): Promise<void> {
    const { previousPosition, currentPosition } = change;
    if (!previousPosition || !currentPosition) return;

    // 注释掉本地订单历史文件检查，完全依赖Binance API
    // if (this.orderHistoryManager.isOrderProcessed(currentPosition.entry_oid, currentPosition.symbol)) {
    //   logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} SKIPPED: ${currentPosition.symbol} new entry (OID: ${currentPosition.entry_oid}) already processed`);
    //   return;
    // }

    // 检查 Binance 是否真的有该币种的仓位
    let hasActualPosition = false;
    let releasedMargin: number | undefined;
    
    try {
      const binancePositions = await this.positionManager['binanceService'].getPositions();
      const targetSymbol = this.positionManager['binanceService'].convertSymbol(currentPosition.symbol);
      
      const existingPosition = binancePositions.find(
        p => p.symbol === targetSymbol && parseFloat(p.positionAmt) !== 0
      );
      
      hasActualPosition = !!existingPosition;
      
      if (existingPosition) {
        const positionAmt = parseFloat(existingPosition.positionAmt);
        logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Found existing position on Binance: ${existingPosition.symbol} ${positionAmt > 0 ? 'LONG' : 'SHORT'} ${Math.abs(positionAmt)}`);
      } else {
        logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} No existing position found on Binance for ${targetSymbol}`);
      }
    } catch (error) {
      console.warn(`${LOGGING_CONFIG.EMOJIS.WARNING} Failed to check existing positions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 只有在真的有仓位时才执行平仓操作
    if (hasActualPosition) {
      // 1. 平仓前获取账户余额
      let balanceBeforeClose: number | undefined;
      try {
        const accountInfo = await this.tradingExecutor.getAccountInfo();
        balanceBeforeClose = parseFloat(accountInfo.availableBalance);
        logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Balance before closing: $${balanceBeforeClose.toFixed(2)} USDT`);
      } catch (error) {
        logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} Failed to get balance before close: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      const closeReason = `Entry order changed (old: ${previousPosition.entry_oid} → new: ${currentPosition.entry_oid}) - closing old position`;

      // 2. 平仓旧仓位
      const closeResult = await this.positionManager.closePosition(previousPosition.symbol, closeReason);

      if (closeResult.success) {
        // closePosition 内部已经包含验证逻辑(等待2秒并验证仓位关闭),无需额外等待

        // 3. 平仓后获取账户余额,计算释放的资金
        if (balanceBeforeClose !== undefined) {
          try {
            const accountInfo = await this.tradingExecutor.getAccountInfo();
            const balanceAfterClose = parseFloat(accountInfo.availableBalance);
            releasedMargin = balanceAfterClose - balanceBeforeClose;
            logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Balance after closing: $${balanceAfterClose.toFixed(2)} USDT`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.MONEY} Released margin from closing: $${releasedMargin.toFixed(2)} USDT (${releasedMargin >= 0 ? 'Profit' : 'Loss'})`);
            
            // 如果释放的资金为负数(亏损)或太小,则不使用
            if (releasedMargin <= 0) {
              logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} Position closed with loss, insufficient margin released. Will use normal capital allocation.`);
              releasedMargin = undefined;
            }
          } catch (error) {
            logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} Failed to get balance after close: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      } else {
        logError(`${LOGGING_CONFIG.EMOJIS.ERROR} Failed to close old position for ${currentPosition.symbol}, skipping new position opening`);
        return;
      }
    } else {
      logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} No actual position to close, will use normal capital allocation for new position`);
    }

    // 添加价格容忍度检查
    const priceTolerance = this.riskManager.checkPriceTolerance(
      currentPosition.entry_price,
      currentPosition.current_price,
      currentPosition.symbol
    );

    if (!priceTolerance.shouldExecute) {
      logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} SKIPPED: ${currentPosition.symbol} - Price not acceptable: ${priceTolerance.reason}`);
      return;
    }

    // 统一生成 FollowPlan,携带 releasedMargin 信息
    const followPlan: FollowPlan = {
      action: "ENTER",
      symbol: currentPosition.symbol,
      side: currentPosition.quantity > 0 ? "BUY" : "SELL",
      type: "MARKET",
      quantity: Math.abs(currentPosition.quantity),
      leverage: currentPosition.leverage,
      entryPrice: currentPosition.entry_price,
      reason: releasedMargin && releasedMargin > 0 
        ? `Reopening with released margin $${releasedMargin.toFixed(2)} (OID: ${currentPosition.entry_oid}) by ${agentId}`
        : `Entry order changed (OID: ${currentPosition.entry_oid}) by ${agentId}`,
      agent: agentId,
      timestamp: Date.now(),
      position: currentPosition,
      priceTolerance,
      releasedMargin: releasedMargin && releasedMargin > 0 ? releasedMargin : undefined,
      marginType: options?.marginType
    };

    plans.push(followPlan);
    
    if (releasedMargin && releasedMargin > 0) {
      logInfo(`${LOGGING_CONFIG.EMOJIS.TREND_UP} ENTRY CHANGED (with released margin $${releasedMargin.toFixed(2)}): ${currentPosition.symbol} ${followPlan.side} ${followPlan.quantity} @ ${currentPosition.entry_price} (OID: ${currentPosition.entry_oid})`);
    } else {
      logInfo(`${LOGGING_CONFIG.EMOJIS.TREND_UP} ENTRY CHANGED: ${currentPosition.symbol} ${followPlan.side} ${followPlan.quantity} @ ${currentPosition.entry_price} (OID: ${currentPosition.entry_oid})`);
    }
    logDebug(`${LOGGING_CONFIG.EMOJIS.MONEY} Price Check: Entry $${currentPosition.entry_price} vs Current $${currentPosition.current_price} - ${priceTolerance.reason}`);
  }

  /**
   * 处理新仓位
   */
  private async handleNewPosition(
    change: PositionChange,
    agentId: string,
    plans: FollowPlan[],
    options?: FollowOptions,
    useDirectStrategy: boolean = false,
    currentPositions?: Position[]
  ): Promise<void> {
    const { currentPosition } = change;
    if (!currentPosition) return;

    logInfo(`${LOGGING_CONFIG.EMOJIS.SEARCH} handleNewPosition START for ${currentPosition.symbol} (useDirectStrategy: ${useDirectStrategy})`);

    // 记录当前持仓的详细信息
    logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Current position details: ${currentPosition.symbol}`);
    logDebug(`${LOGGING_CONFIG.EMOJIS.INFO}   Quantity: ${currentPosition.quantity}`);
    logDebug(`${LOGGING_CONFIG.EMOJIS.INFO}   Entry Price: ${currentPosition.entry_price}`);
    logDebug(`${LOGGING_CONFIG.EMOJIS.INFO}   Current Price: ${currentPosition.current_price}`);
    logDebug(`${LOGGING_CONFIG.EMOJIS.INFO}   Leverage: ${currentPosition.leverage}`);
    logDebug(`${LOGGING_CONFIG.EMOJIS.INFO}   Entry OID: ${currentPosition.entry_oid}`);

    // 注释掉本地订单历史文件检查，完全依赖Binance API
    // if (this.orderHistoryManager.isOrderProcessed(currentPosition.entry_oid, currentPosition.symbol)) {
    //   logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} SKIPPED: ${currentPosition.symbol} position (OID: ${currentPosition.entry_oid}) already processed`);
    //   return;
    // }

    // 初始化 releasedMargin 变量
    let releasedMargin: number | undefined;

    // 如果使用直接策略，需要检查Binance现有仓位（避免重复购买）
    let directStrategyProcessed = false;
    if (useDirectStrategy) {
      // 检查 Binance 是否已有该币种的仓位
      try {
        const binancePositions = await this.positionManager['binanceService'].getPositions();
        const targetSymbol = this.positionManager['binanceService'].convertSymbol(currentPosition.symbol);

        logDebug(`${LOGGING_CONFIG.EMOJIS.SEARCH} Checking for existing positions on Binance for ${currentPosition.symbol} (converted: ${targetSymbol})...`);
        logVerbose(`${LOGGING_CONFIG.EMOJIS.DATA} Found ${binancePositions.length} total position(s) on Binance`);
        binancePositions.forEach(pos => {
          logVerbose(`${LOGGING_CONFIG.EMOJIS.DATA}   - ${pos.symbol}: amt=${pos.positionAmt}, entry=${pos.entryPrice}`);
        });

        const existingPosition = binancePositions.find(
          p => p.symbol === targetSymbol && parseFloat(p.positionAmt) !== 0
        );

        if (existingPosition) {
          const positionAmt = parseFloat(existingPosition.positionAmt);
          logInfo(`${LOGGING_CONFIG.EMOJIS.WARNING} Found existing position on Binance: ${existingPosition.symbol} ${positionAmt > 0 ? 'LONG' : 'SHORT'} ${Math.abs(positionAmt)}`);

          // 检查是否需要调整仓位而不是完全跳过
          const currentPositionSign = Math.sign(currentPosition.quantity);
          const existingPositionSign = Math.sign(positionAmt);

          if (currentPositionSign === existingPositionSign) {
            // 计算保证金而不是直接比较数量
            const existingMargin = Math.abs(positionAmt * parseFloat(existingPosition.entryPrice)) / parseFloat(existingPosition.leverage);
            const currentMargin = Math.abs(currentPosition.quantity * currentPosition.entry_price) / currentPosition.leverage;

            const marginDiff = Math.abs(currentMargin - existingMargin);
            const entryPriceDiff = Math.abs(currentPosition.entry_price - parseFloat(existingPosition.entryPrice));
            const marginThreshold = currentMargin * 0.1;
            const priceThreshold = currentPosition.entry_price * 0.05;

            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Position Comparison:`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Current Position Quantity: ${Math.abs(currentPosition.quantity)}`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Existing Position Quantity: ${Math.abs(positionAmt)}`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Current Margin: $${currentMargin.toFixed(2)}`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Existing Margin: $${existingMargin.toFixed(2)}`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Margin Ratio: ${(currentMargin / existingMargin).toFixed(2)}x`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Current Entry Price: ${currentPosition.entry_price}`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Existing Entry Price: ${parseFloat(existingPosition.entryPrice)}`);
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Price Difference: ${entryPriceDiff.toFixed(2)}`);

            // 如果保证金和价格都很接近，跳过这个仓位
            if (marginDiff < marginThreshold && entryPriceDiff < priceThreshold) {
              logInfo(`${LOGGING_CONFIG.EMOJIS.WARNING} SKIPPING ${currentPosition.symbol} - existing position matches current position (direct strategy)`);
              return; // 跳过这个仓位，不生成计划
            }

            // 如果现有仓位保证金更大，且差异显著，考虑减少下单量或跳过
            if (existingMargin > currentMargin * 1.2) {
              logInfo(`${LOGGING_CONFIG.EMOJIS.WARNING} Existing position margin ($${existingMargin.toFixed(2)}) is significantly larger than current position margin ($${currentMargin.toFixed(2)})`);
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Existing position already exceeds required margin, skipping additional buy`);
              return; // 跳过，因为现有仓位已经足够
            } else if (existingMargin < currentMargin * 0.8) {
              // 现有仓位保证金明显小于目标仓位，可能是加仓操作
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Existing position margin ($${existingMargin.toFixed(2)}) is significantly smaller than current position margin ($${currentMargin.toFixed(2)}) - likely a position increase`);

              // 计算agent的总保证金（从所有currentPositions计算）
              const agentTotalMargin = currentPositions.reduce((sum, pos) => {
                const posMargin = Math.abs(pos.quantity * pos.entry_price) / pos.leverage;
                return sum + posMargin;
              }, 0);

              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Agent total margin: $${agentTotalMargin.toFixed(2)} (sum of all positions)`);

              // 计算用户保证金与agent保证金的比例 - 这是核心的修复
              const userMarginRatio = (options?.totalMargin || 50) / agentTotalMargin;
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   User margin ratio: ${(userMarginRatio * 100).toFixed(2)}% (User: ${options?.totalMargin || 50} / Agent: ${agentTotalMargin.toFixed(2)})`);

              // 计算用户应该持有的目标保证金量
              const targetUserMargin = currentMargin * userMarginRatio;
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Target user margin for this position: $${targetUserMargin.toFixed(2)} (Current margin: $${currentMargin.toFixed(2)} * User ratio: ${(userMarginRatio * 100).toFixed(2)}%)`);

              // 计算还需要增加的保证金量（考虑现有仓位）
              const additionalMarginNeeded = targetUserMargin - existingMargin;
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Additional margin needed: $${additionalMarginNeeded.toFixed(2)} (Target: $${targetUserMargin.toFixed(2)} - Existing: $${existingMargin.toFixed(2)})`);

              if (additionalMarginNeeded > 0) {
                // 计算调整后的数量（基于需要增加的保证金）
                const adjustedQuantity = Math.sign(currentPosition.quantity) * additionalMarginNeeded * currentPosition.leverage / currentPosition.entry_price;
                logInfo(`${LOGGING_CONFIG.EMOJIS.INFO}   Adjusted quantity for additional margin: ${adjustedQuantity.toFixed(4)} (vs original: ${currentPosition.quantity.toFixed(4)})`);

                // 创建调整后的仓位
                const adjustedPosition = {
                  ...currentPosition,
                  quantity: adjustedQuantity
                };

                // 使用调整后的仓位生成跟单计划
                await this.generateFollowPlanForPositionDirect(adjustedPosition, agentId, plans, useDirectStrategy, releasedMargin);
                directStrategyProcessed = true; // 标记为已处理
                return; // 完成后直接返回，避免重复处理
              } else {
                logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} No additional margin needed (existing position already meets target), skipping position increase`);
                return;
              }
            } else {
              // 保证金比例在合理范围内（0.8 - 1.2），跳过这个仓位
              logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} Existing position margin is within acceptable range (80%-120%), skipping duplicate purchase`);
              return;
            }
          } else {
            logInfo(`${LOGGING_CONFIG.EMOJIS.INFO} ${currentPosition.symbol} position direction changed in direct strategy - will close existing and open new`);
          }
        }
      } catch (error) {
        logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} Failed to check existing positions in direct strategy: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // 如果直接策略已经处理过，则跳过通用逻辑
    if (directStrategyProcessed) {
      return;
    }

    // 添加价格容忍度检查
    const priceTolerance = this.riskManager.checkPriceTolerance(
      currentPosition.entry_price,
      currentPosition.current_price,
      currentPosition.symbol
    );

    // 统一生成 FollowPlan,携带 releasedMargin 信息
    const followPlan: FollowPlan = {
      action: "ENTER",
      symbol: currentPosition.symbol,
      side: currentPosition.quantity > 0 ? "BUY" : "SELL",
      type: "MARKET",
      quantity: Math.abs(currentPosition.quantity),
      leverage: currentPosition.leverage,
      entryPrice: currentPosition.entry_price,
      reason: useDirectStrategy
        ? `Direct entry based on actual position (OID: ${currentPosition.entry_oid}) by ${agentId}`
        : (releasedMargin && releasedMargin > 0
          ? `Reopening with released margin $${releasedMargin.toFixed(2)} (OID: ${currentPosition.entry_oid}) by ${agentId}`
          : `New position opened by ${agentId} (OID: ${currentPosition.entry_oid})`),
      agent: agentId,
      timestamp: Date.now(),
      position: currentPosition,
      priceTolerance,
      releasedMargin: releasedMargin && releasedMargin > 0 ? releasedMargin : undefined,
      marginType: options?.marginType
    };

    plans.push(followPlan);

    if (releasedMargin && releasedMargin > 0) {
      logInfo(`${LOGGING_CONFIG.EMOJIS.TREND_UP} NEW POSITION (with released margin $${releasedMargin.toFixed(2)}): ${currentPosition.symbol} ${followPlan.side} ${followPlan.quantity} @ ${currentPosition.entry_price} (OID: ${currentPosition.entry_oid})`);
    } else {
      logInfo(`${LOGGING_CONFIG.EMOJIS.TREND_UP} NEW POSITION: ${currentPosition.symbol} ${followPlan.side} ${followPlan.quantity} @ ${currentPosition.entry_price} (OID: ${currentPosition.entry_oid})`);
    }
    logDebug(`${LOGGING_CONFIG.EMOJIS.MONEY} Price Check: Entry $${currentPosition.entry_price} vs Current $${currentPosition.current_price} - ${priceTolerance.reason}`);

    logInfo(`${LOGGING_CONFIG.EMOJIS.SUCCESS} handleNewPosition END for ${currentPosition.symbol}`);
  }

  /**
   * 为调整后的仓位生成跟单计划（直接策略专用）
   */
  private async generateFollowPlanForPositionDirect(
    position: Position,
    agentId: string,
    plans: FollowPlan[],
    useDirectStrategy: boolean,
    releasedMargin?: number
  ): Promise<void> {
    // 添加价格容忍度检查
    const priceTolerance = this.riskManager.checkPriceTolerance(
      position.entry_price,
      position.current_price,
      position.symbol
    );

    // 生成 FollowPlan
    const followPlan: FollowPlan = {
      action: "ENTER",
      symbol: position.symbol,
      side: position.quantity > 0 ? "BUY" : "SELL",
      type: "MARKET",
      quantity: Math.abs(position.quantity),
      leverage: position.leverage,
      entryPrice: position.entry_price,
      reason: useDirectStrategy
        ? `Direct entry based on actual position (OID: ${position.entry_oid}) by ${agentId}`
        : (releasedMargin && releasedMargin > 0
          ? `Reopening with released margin $${releasedMargin.toFixed(2)} (OID: ${position.entry_oid}) by ${agentId}`
          : `New position opened by ${agentId} (OID: ${position.entry_oid})`),
      agent: agentId,
      timestamp: Date.now(),
      position: position,
      priceTolerance,
      releasedMargin: releasedMargin && releasedMargin > 0 ? releasedMargin : undefined,
      marginType: undefined,
      // 标记这是直接策略的调整量，避免在资金分配时被重新计算
      isDirectStrategyAdjustment: true
    };

    plans.push(followPlan);

    if (releasedMargin && releasedMargin > 0) {
      logInfo(`${LOGGING_CONFIG.EMOJIS.TREND_UP} NEW POSITION (with released margin $${releasedMargin.toFixed(2)}): ${position.symbol} ${followPlan.side} ${followPlan.quantity} @ ${position.entry_price} (OID: ${position.entry_oid})`);
    } else {
      logInfo(`${LOGGING_CONFIG.EMOJIS.TREND_UP} NEW POSITION: ${position.symbol} ${followPlan.side} ${followPlan.quantity} @ ${position.entry_price} (OID: ${position.entry_oid})`);
    }
    logDebug(`${LOGGING_CONFIG.EMOJIS.MONEY} Price Check: Entry $${position.entry_price} vs Current $${position.current_price} - ${priceTolerance.reason}`);
  }

  /**
   * 处理仓位关闭
   */
  private handlePositionClosed(
    change: PositionChange,
    agentId: string,
    plans: FollowPlan[],
    options?: FollowOptions
  ): void {
    const { previousPosition, currentPosition } = change;
    if (!previousPosition || !currentPosition) return;

    const followPlan: FollowPlan = {
      action: "EXIT",
      symbol: currentPosition.symbol,
      side: previousPosition.quantity > 0 ? "SELL" : "BUY", // 平仓方向相反
      type: "MARKET",
      quantity: Math.abs(previousPosition.quantity),
      leverage: previousPosition.leverage,
      exitPrice: currentPosition.current_price,
      reason: `Position closed by ${agentId}`,
      agent: agentId,
      timestamp: Date.now(),
      marginType: options?.marginType
    };

    plans.push(followPlan);
    logInfo(`${LOGGING_CONFIG.EMOJIS.TREND_DOWN} POSITION CLOSED: ${currentPosition.symbol} ${followPlan.side} ${followPlan.quantity} @ ${currentPosition.current_price}`);
  }

  /**
   * 处理盈利目标达到
   */
  private async handleProfitTargetReached(
    change: PositionChange,
    agentId: string,
    plans: FollowPlan[],
    options?: FollowOptions
  ): Promise<void> {
    const { currentPosition, profitPercentage } = change;
    if (!currentPosition || profitPercentage === undefined) return;

    logInfo(`${LOGGING_CONFIG.EMOJIS.MONEY} PROFIT TARGET REACHED: ${currentPosition.symbol} - Closing position at ${profitPercentage.toFixed(2)}% profit`);

    // 直接执行平仓操作
    try {
      const closeReason = `Profit target reached: ${profitPercentage.toFixed(2)}% by ${agentId}`;
      const closeResult = await this.positionManager.closePosition(currentPosition.symbol, closeReason);

      if (!closeResult.success) {
        logError(`${LOGGING_CONFIG.EMOJIS.ERROR} Failed to close position for profit target: ${currentPosition.symbol} - ${closeResult.error}`);
        return;
      }

      logInfo(`${LOGGING_CONFIG.EMOJIS.SUCCESS} Successfully closed position for profit target: ${currentPosition.symbol}`);

      // 记录盈利退出事件到历史
      this.orderHistoryManager.addProfitExitRecord({
        symbol: currentPosition.symbol,
        entryOid: currentPosition.entry_oid,
        exitPrice: currentPosition.current_price,
        profitPercentage,
        reason: `Profit target ${profitPercentage.toFixed(2)}% reached`
      });

      // 如果启用自动重新跟单，重置订单状态
      if (options?.autoRefollow) {
        logInfo(`🔄 Auto-refollow enabled: Resetting order status for ${currentPosition.symbol} to allow refollowing`);
        this.orderHistoryManager.resetSymbolOrderStatus(currentPosition.symbol, currentPosition.entry_oid);
        logInfo(`📝 Note: ${currentPosition.symbol} will be refollowed in the next polling cycle when oid change is detected`);
      } else {
        logInfo(`📊 Auto-refollow disabled: ${currentPosition.symbol} will not be refollowed automatically`);
      }

    } catch (error) {
      logError(`❌ Error handling profit target for ${currentPosition.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 检查止盈止损条件
   */
  private checkExitConditions(
    currentPositions: Position[],
    agentId: string
  ): FollowPlan[] {
    const plans: FollowPlan[] = [];

    for (const position of currentPositions) {
      if (position.quantity !== 0 && this.positionManager.shouldExitPosition(position)) {
        const followPlan: FollowPlan = {
          action: "EXIT",
          symbol: position.symbol,
          side: position.quantity > 0 ? "SELL" : "BUY",
          type: "MARKET",
          quantity: Math.abs(position.quantity),
          leverage: position.leverage,
          exitPrice: position.current_price,
          reason: this.positionManager.getExitReason(position),
          agent: agentId,
          timestamp: Date.now()
        };
        plans.push(followPlan);
        logInfo(`${LOGGING_CONFIG.EMOJIS.TARGET} EXIT SIGNAL: ${position.symbol} - ${followPlan.reason}`);
      }
    }

    return plans;
  }

  /**
   * 应用资金分配到 ENTER 操作的跟单计划
   */
  private async applyCapitalAllocation(
    followPlans: FollowPlan[],
    currentPositions: Position[],
    totalMargin: number,
    agentId: string
  ): Promise<void> {
    const enterPlans = followPlans.filter(plan => plan.action === "ENTER");

    if (enterPlans.length === 0) {
      return;
    }

    // 获取对应的仓位信息
    const positionsForAllocation: Position[] = [];
    for (const plan of enterPlans) {
      const position = currentPositions.find(p => p.symbol === plan.symbol);
      if (position && position.margin > 0) {
        positionsForAllocation.push(position);
      }
    }

    if (positionsForAllocation.length === 0) {
      return;
    }

    // 获取可用余额和持仓信息来计算净资产
    let availableBalance: number | undefined;
    let netWorth: number | undefined;
    try {
      const accountInfo = await this.tradingExecutor.getAccountInfo();
      availableBalance = parseFloat(accountInfo.availableBalance);

      // 获取持仓信息计算净资产
      const positions = await this.tradingExecutor.getPositions();
      const totalPositionMargin = positions.reduce((sum, pos) => {
        const positionAmt = Math.abs(parseFloat(pos.positionAmt));
        const entryPrice = parseFloat(pos.entryPrice);
        const leverage = parseFloat(pos.leverage);
        const margin = (positionAmt * entryPrice) / leverage;
        return sum + margin;
      }, 0);

      const totalUnrealizedPnL = positions.reduce((sum, pos) => {
        return sum + parseFloat(pos.unRealizedProfit);
      }, 0);

      // 计算净资产 = 可用余额 + 持仓保证金 + 浮动盈亏
      netWorth = availableBalance + totalPositionMargin + totalUnrealizedPnL;

      logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Available balance: ${availableBalance.toFixed(2)} USDT`);
      logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Total position margin: ${totalPositionMargin.toFixed(2)} USDT`);
      logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Total unrealized P&L: ${totalUnrealizedPnL.toFixed(2)} USDT`);
      logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Net worth: ${netWorth.toFixed(2)} USDT`);
    } catch (balanceError) {
      logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} Failed to get account balance: ${balanceError instanceof Error ? balanceError.message : 'Unknown error'}`);
    }

    // 检查是否有足够的保证金来执行所有计划
    const totalRequiredMargin = enterPlans.reduce((sum, plan) => {
      // 计算每个计划所需的保证金
      const notionalValue = plan.quantity * plan.entryPrice;
      const requiredMargin = notionalValue / plan.leverage;
      return sum + requiredMargin;
    }, 0);

    logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Total required margin for all plans: ${totalRequiredMargin.toFixed(2)} USDT`);

    // 如果净资产不足以覆盖所有计划，按比例缩减
    if (netWorth !== undefined && netWorth > 0 && totalRequiredMargin > netWorth) {
      const reductionRatio = netWorth / totalRequiredMargin;
      logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} Insufficient net worth for all plans: Required ${totalRequiredMargin.toFixed(2)} USDT, Net worth: ${netWorth.toFixed(2)} USDT`);
      logWarn(`${LOGGING_CONFIG.EMOJIS.WARNING} Reducing all plans by ratio: ${reductionRatio.toFixed(4)} (${(reductionRatio * 100).toFixed(2)}%)`);

      // 按比例缩减所有计划的数量
      for (const plan of enterPlans) {
        const originalNotionalValue = plan.quantity * plan.entryPrice;
        const originalMargin = originalNotionalValue / plan.leverage;
        const reducedMargin = originalMargin * reductionRatio;
        const reducedQuantity = (reducedMargin * plan.leverage) / plan.entryPrice;

        plan.quantity = Math.max(0, reducedQuantity);
        plan.allocatedMargin = reducedMargin;
        plan.notionalValue = plan.quantity * plan.entryPrice;
      }
    }

    // 执行资金分配（优先使用净资产）
    const allocationResult = this.capitalManager.allocateMargin(positionsForAllocation, totalMargin, availableBalance, netWorth);

    // 显示分配信息
    this.displayCapitalAllocation(allocationResult, agentId);

    // 将分配结果应用到跟单计划
    this.applyAllocationToPlans(allocationResult, enterPlans);
  }

  /**
   * 显示资金分配信息
   */
  private displayCapitalAllocation(allocationResult: CapitalAllocationResult, agentId: string): void {
    logDebug(`\n${LOGGING_CONFIG.EMOJIS.MONEY} Capital Allocation for ${agentId}:`);
    logDebug('==========================================');
    logDebug(`${LOGGING_CONFIG.EMOJIS.MONEY} Total Agent Margin: $${allocationResult.totalOriginalMargin.toFixed(2)}`);
    logDebug(`${LOGGING_CONFIG.EMOJIS.MONEY} Total User Margin: $${allocationResult.totalAllocatedMargin.toFixed(2)}`);
    logDebug(`${LOGGING_CONFIG.EMOJIS.TREND_UP} Total Notional Value: $${allocationResult.totalNotionalValue.toFixed(2)}`);
    logDebug('');

    for (const allocation of allocationResult.allocations) {
      const scaleRatio = allocation.originalMargin > 0 
        ? (allocation.allocatedMargin / allocation.originalMargin) * 100 
        : 0;
      logDebug(`${allocation.symbol} - ${allocation.leverage}x leverage`);
      logDebug(`   ${LOGGING_CONFIG.EMOJIS.CHART} Agent Margin: $${allocation.originalMargin.toFixed(2)}`);
      logDebug(`   ${LOGGING_CONFIG.EMOJIS.MONEY} User Margin: $${allocation.allocatedMargin.toFixed(2)} (${scaleRatio.toFixed(2)}% of Agent)`);
      logDebug(`   ${LOGGING_CONFIG.EMOJIS.TREND_UP} Notional Value: $${allocation.notionalValue.toFixed(2)}`);
      logDebug(`   ${LOGGING_CONFIG.EMOJIS.INFO} Adjusted Quantity: ${allocation.adjustedQuantity.toFixed(4)}`);
      logDebug('');
    }

    logDebug('==========================================');
  }

  /**
   * 将分配结果应用到跟单计划
   */
  private applyAllocationToPlans(
    allocationResult: CapitalAllocationResult,
    enterPlans: FollowPlan[]
  ): void {
    for (const allocation of allocationResult.allocations) {
      const followPlan = enterPlans.find(plan => plan.symbol === allocation.symbol);
      if (followPlan) {
        // 如果是直接策略的调整量，则保留原始计算的数量，不进行资金分配的重新调整
        if (followPlan.isDirectStrategyAdjustment) {
          logDebug(`${LOGGING_CONFIG.EMOJIS.INFO} Skipping capital allocation for direct strategy adjustment: ${followPlan.symbol} (quantity: ${followPlan.quantity})`);
          // 仍然更新资金分配信息用于显示，但不改变交易数量
          followPlan.originalMargin = allocation.originalMargin;
          followPlan.allocatedMargin = allocation.allocatedMargin;
          followPlan.notionalValue = allocation.notionalValue;
          followPlan.adjustedQuantity = followPlan.quantity; // 保持原始计算的数量
          followPlan.allocationRatio = allocation.allocationRatio;
        } else {
          // 更新资金分配信息
          followPlan.originalMargin = allocation.originalMargin;
          followPlan.allocatedMargin = allocation.allocatedMargin;
          followPlan.notionalValue = allocation.notionalValue;
          followPlan.adjustedQuantity = allocation.adjustedQuantity;
          followPlan.allocationRatio = allocation.allocationRatio;

          // 更新交易数量为调整后的数量
          followPlan.quantity = allocation.adjustedQuantity;
        }
      }
    }
  }

  /**
   * 获取指定 agent 的历史仓位（从订单历史重建）
   * @deprecated 不再需要此方法，直接调用 rebuildLastPositionsFromHistory
   */
  getLastPositions(agentId: string, currentPositions: Position[] = []): Position[] {
    return this.rebuildLastPositionsFromHistory(agentId, currentPositions);
  }

  /**
   * 清除指定 agent 的订单历史
   * @deprecated 历史数据现在存储在 order-history.json 中
   * 如需清除，请手动编辑该文件或使用 OrderHistoryManager
   */
  clearLastPositions(agentId: string): void {
    logWarn(`⚠️ clearLastPositions is deprecated. History is now in order-history.json`);
  }

  /**
   * 清除所有历史仓位
   * @deprecated 历史数据现在存储在 order-history.json 中
   * 如需清除，请手动删除该文件
   */
  clearAllLastPositions(): void {
    logWarn(`⚠️ clearAllLastPositions is deprecated. History is now in order-history.json`);
  }
}