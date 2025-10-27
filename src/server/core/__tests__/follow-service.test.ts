import { FollowService } from '../services/follow-service';
import { PositionManager } from '../services/position-manager';
import { OrderHistoryManager } from '../services/order-history-manager';
import { RiskManager } from '../services/risk-manager';
import { FuturesCapitalManager } from '../services/futures-capital-manager';
import { TradingExecutor } from '../services/trading-executor';
import { Position, FollowPlan } from '../scripts/analyze-api';

// Mock all dependencies
jest.mock('../services/position-manager');
jest.mock('../services/order-history-manager');
jest.mock('../services/risk-manager');
jest.mock('../services/futures-capital-manager');
jest.mock('../services/trading-executor');

// Mock logger functions
jest.mock('../utils/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  logVerbose: jest.fn()
}));

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('FollowService', () => {
  let followService: FollowService;
  let mockPositionManager: jest.Mocked<PositionManager>;
  let mockOrderHistoryManager: jest.Mocked<OrderHistoryManager>;
  let mockRiskManager: jest.Mocked<RiskManager>;
  let mockCapitalManager: jest.Mocked<FuturesCapitalManager>;
  let mockTradingExecutor: jest.Mocked<TradingExecutor>;

  const mockPosition: Position = {
    symbol: 'BTCUSDT',
    entry_price: 50000,
    quantity: 0.1,
    leverage: 10,
    current_price: 51000,
    unrealized_pnl: 100,
    confidence: 0.85,
    entry_oid: 12345,
    tp_oid: -1,
    sl_oid: -1,
    margin: 500,
    exit_plan: {
      profit_target: 52000,
      stop_loss: 48000,
      invalidation_condition: 'price_below_stop_loss'
    }
  };

  beforeEach(() => {
    // 使用 fake timers 加速测试
    jest.useFakeTimers();
    // Create mocked instances
    mockPositionManager = new PositionManager(null as any, null as any, null as any) as jest.Mocked<PositionManager>;
    mockOrderHistoryManager = new OrderHistoryManager() as jest.Mocked<OrderHistoryManager>;
    mockRiskManager = new RiskManager() as jest.Mocked<RiskManager>;
    mockCapitalManager = new FuturesCapitalManager() as jest.Mocked<FuturesCapitalManager>;
    mockTradingExecutor = new TradingExecutor() as jest.Mocked<TradingExecutor>;

    // Setup default mocks
    mockOrderHistoryManager.isOrderProcessed = jest.fn().mockReturnValue(false);
    mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([]);
    mockOrderHistoryManager.reloadHistory = jest.fn().mockReturnValue(undefined);
    mockRiskManager.checkPriceTolerance = jest.fn().mockReturnValue({
      shouldExecute: true,
      reason: 'Price within tolerance',
      entryPrice: 50000,
      currentPrice: 51000,
      priceDifference: 2,
      tolerance: 5,
      withinTolerance: true
    });
    mockPositionManager.shouldExitPosition = jest.fn().mockReturnValue(false);
    mockPositionManager.getExitReason = jest.fn().mockReturnValue('No exit condition met');
    mockPositionManager.closePosition = jest.fn().mockResolvedValue({ success: true, symbol: 'BTCUSDT', operation: 'close' });
    mockPositionManager.openPosition = jest.fn().mockResolvedValue({ success: true, symbol: 'BTCUSDT', operation: 'open' });
    mockPositionManager.cleanOrphanedOrders = jest.fn().mockResolvedValue(undefined);
    
    // Mock binanceService for position checks
    (mockPositionManager as any).binanceService = {
      getPositions: jest.fn().mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]),
      convertSymbol: jest.fn((symbol: string) => symbol)
    };
    
    mockCapitalManager.allocateMargin = jest.fn().mockReturnValue({
      allocations: [],
      totalAllocatedMargin: 0,
      totalNotionalValue: 0
    });
    mockCapitalManager.formatPercentage = jest.fn().mockReturnValue('100%');
    mockTradingExecutor.getAccountInfo = jest.fn().mockResolvedValue({
      availableBalance: '10000.0',
      totalWalletBalance: '10000.0'
    });

    followService = new FollowService(
      mockPositionManager,
      mockOrderHistoryManager,
      mockRiskManager,
      mockCapitalManager,
      mockTradingExecutor
    );

    // Suppress console output
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    jest.clearAllMocks();
    // 恢复真实 timers
    jest.useRealTimers();
  });

  describe('Constructor', () => {
    it('should create FollowService instance', () => {
      expect(followService).toBeInstanceOf(FollowService);
    });
  });

  describe('followAgent', () => {
    it('should follow agent with new position', async () => {
      const currentPositions: Position[] = [mockPosition];
      const agentId = 'test-agent';

      const resultPromise = followService.followAgent(agentId, currentPositions);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('ENTER');
      expect(result[0].symbol).toBe('BTCUSDT');
      expect(result[0].side).toBe('BUY');
      expect(result[0].quantity).toBe(0.1);
    });

    it('should handle empty positions', async () => {
      const resultPromise = followService.followAgent('test-agent', []);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(0);
    });

    it('should detect position closed', async () => {
      const agentId = 'test-agent';
      
      // Mock 订单历史：之前有一个 BUY 订单
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: agentId,
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);

      // 现在仓位已关闭（quantity = 0）
      const closedPosition: Position = { ...mockPosition, quantity: 0 };
      const resultPromise = followService.followAgent(agentId, [closedPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('EXIT');
      expect(result[0].side).toBe('SELL'); // Opposite of original BUY
    });

    it('should detect entry_oid change', async () => {
      const agentId = 'test-agent';
      
      // Mock order history to have a previous position with entry_oid = 12345
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: agentId,
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);
      
      // Mock binanceService to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);
      
      // Mock getAccountInfo to return same balance (no profit, so releasedMargin will be 0)
      mockTradingExecutor.getAccountInfo.mockResolvedValue({
        availableBalance: '10000.0',
        totalWalletBalance: '10000.0'
      });

      // 现在 entry_oid 变了，说明平仓后重新开仓
      const changedPosition: Position = { ...mockPosition, entry_oid: 67890 };
      const resultPromise = followService.followAgent(agentId, [changedPosition]);
      
      // 快进所有 timers
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(mockPositionManager.closePosition).toHaveBeenCalled();
      // openPosition should be called (either directly or via plan)
      expect(result.length).toBeGreaterThan(0);
    });

    it('should apply capital allocation when totalMargin provided', async () => {
      mockCapitalManager.allocateMargin.mockReturnValue({
        allocations: [{
          symbol: 'BTCUSDT',
          originalMargin: 500,
          allocatedMargin: 400,
          notionalValue: 4000,
          adjustedQuantity: 0.08,
          allocationRatio: 0.8,
          leverage: 10,
          side: 'BUY'
        }],
        totalAllocatedMargin: 400,
        totalNotionalValue: 4000,
        totalOriginalMargin: 500
      });

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { totalMargin: 1000 });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(mockCapitalManager.allocateMargin).toHaveBeenCalled();
      expect(result[0].quantity).toBe(0.08); // Adjusted quantity
      expect(result[0].allocatedMargin).toBe(400);
    });

    it('should skip capital allocation when totalMargin is 0', async () => {
      const resultPromise = followService.followAgent('test-agent', [mockPosition], { totalMargin: 0 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(mockCapitalManager.allocateMargin).not.toHaveBeenCalled();
    });

    it('should skip capital allocation when totalMargin is undefined', async () => {
      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(mockCapitalManager.allocateMargin).not.toHaveBeenCalled();
    });
  });

  describe('detectPositionChanges', () => {
    it('should detect new position', async () => {
      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('ENTER');
    });

    it('should detect position with zero quantity as no change', async () => {
      const zeroPosition: Position = { ...mockPosition, quantity: 0 };
      const resultPromise = followService.followAgent('test-agent', [zeroPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(0);
    });

    it('should detect entry_oid change', async () => {
      // Mock binanceService to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);
      
      // Mock 订单历史
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);
      
      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPositionManager.closePosition).toHaveBeenCalled();
    });

    it('should detect position closed', async () => {
      // Mock 订单历史
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);
      
      const closedPosition: Position = { ...mockPosition, quantity: 0 };
      const resultPromise = followService.followAgent('test-agent', [closedPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].action).toBe('EXIT');
    });
  });

  describe('handleEntryChanged', () => {
    it('should close old position and open new position', async () => {
      // Mock order history to have a previous position
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);
      
      // Mock binanceService to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);
      
      // Mock getAccountInfo to return same balance (no profit/loss)
      // This prevents releasedMargin from being calculated
      mockTradingExecutor.getAccountInfo.mockResolvedValue({
        availableBalance: '10000.0',
        totalWalletBalance: '10000.0'
      });
      
      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(mockPositionManager.closePosition).toHaveBeenCalledWith('BTCUSDT', expect.any(String));
      // Should return a plan for the new position
      expect(result.length).toBeGreaterThan(0);
    });

    it('should skip if order already processed', async () => {
      mockOrderHistoryManager.isOrderProcessed.mockReturnValue(true);
      
      const promise1 = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      await promise1;
      
      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPositionManager.openPosition).not.toHaveBeenCalled();
    });

    it('should skip if price not acceptable', async () => {
      mockRiskManager.checkPriceTolerance.mockReturnValue({
        shouldExecute: false,
        reason: 'Price difference too large',
        entryPrice: 50000,
        currentPrice: 55000,
        priceDifference: 10,
        tolerance: 5,
        withinTolerance: false
      });

      const promise1 = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      await promise1;
      
      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPositionManager.openPosition).not.toHaveBeenCalled();
    });

    it('should handle close position failure', async () => {
      const { logError } = require('../utils/logger');
      
      mockPositionManager.closePosition.mockResolvedValue({ success: false, symbol: 'BTCUSDT', operation: 'close', error: 'Close failed' });

      // Mock 订单历史
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);
      
      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPositionManager.openPosition).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to close old position'));
    });

    it('should generate plan with releasedMargin when position changed', async () => {
      // Mock binanceService to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);
      
      // Mock getAccountInfo to return profit, so releasedMargin > 0
      mockTradingExecutor.getAccountInfo
        .mockResolvedValueOnce({ availableBalance: '10000.0', totalWalletBalance: '10000.0' })
        .mockResolvedValueOnce({ availableBalance: '10100.0', totalWalletBalance: '10100.0' });

      // Mock 订单历史
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);
      
      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      const result = await promise;

      // 应该生成一个带有 releasedMargin 的 plan
      expect(result).toHaveLength(1);
      expect(result[0].releasedMargin).toBe(100); // 10100 - 10000
      expect(result[0].action).toBe('ENTER');
    });
  });

  describe('handleNewPosition', () => {
    it('should create ENTER plan for new position', async () => {
      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('ENTER');
      expect(result[0].symbol).toBe('BTCUSDT');
      expect(result[0].side).toBe('BUY');
    });

    it('should create SELL plan for short position', async () => {
      const shortPosition: Position = { ...mockPosition, quantity: -0.1 };
      const resultPromise = followService.followAgent('test-agent', [shortPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].side).toBe('SELL');
      expect(result[0].quantity).toBe(0.1); // Absolute value
    });

    it('should skip if order already processed', async () => {
      mockOrderHistoryManager.isOrderProcessed.mockReturnValue(true);
      
      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(0);
    });

    it('should include price tolerance check', async () => {
      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].priceTolerance).toBeDefined();
      expect(result[0].priceTolerance?.shouldExecute).toBe(true);
    });
  });

  describe('handlePositionClosed', () => {
    it('should create EXIT plan when position closed', async () => {
      // Mock 订单历史：之前有一个 BUY 订单
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);
      
      const closedPosition: Position = { ...mockPosition, quantity: 0 };
      const resultPromise = followService.followAgent('test-agent', [closedPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('EXIT');
      expect(result[0].side).toBe('SELL');
    });

    it('should create BUY plan when closing short position', async () => {
      // Mock 订单历史：之前有一个 SELL 订单
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'SELL',
          quantity: 0.1,
          price: 50000
        }
      ]);
      
      const closedPosition: Position = { ...mockPosition, quantity: 0 };
      const resultPromise = followService.followAgent('test-agent', [closedPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].side).toBe('BUY'); // Opposite of SELL
    });
  });

  describe('checkExitConditions', () => {
    it('should create exit plan when exit condition met', async () => {
      mockPositionManager.shouldExitPosition.mockReturnValue(true);
      mockPositionManager.getExitReason.mockReturnValue('Stop loss triggered');

      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(2); // 1 ENTER + 1 EXIT
      const exitPlan = result.find(p => p.action === 'EXIT');
      expect(exitPlan).toBeDefined();
      expect(exitPlan?.reason).toBe('Stop loss triggered');
    });

    it('should not create exit plan for zero quantity position', async () => {
      mockPositionManager.shouldExitPosition.mockReturnValue(true);
      const zeroPosition: Position = { ...mockPosition, quantity: 0 };

      const resultPromise = followService.followAgent('test-agent', [zeroPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(0);
    });

    it('should not create exit plan when no exit condition', async () => {
      mockPositionManager.shouldExitPosition.mockReturnValue(false);

      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      const exitPlan = result.find(p => p.action === 'EXIT');
      expect(exitPlan).toBeUndefined();
    });
  });

  describe('applyCapitalAllocation', () => {
    it('should skip when no ENTER plans', async () => {
      // Create a scenario with only EXIT plan by using a closed position
      const closedPosition: Position = { ...mockPosition, quantity: 0 };
      
      // First set up a position
      const promise1 = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      await promise1;
      
      // Then close it
      const promise2 = followService.followAgent('test-agent', [closedPosition], { totalMargin: 1000 });
      await jest.runAllTimersAsync();
      await promise2;

      // Only EXIT plan, no ENTER plan
      expect(mockCapitalManager.allocateMargin).not.toHaveBeenCalled();
    });

    it('should skip when no positions with margin', async () => {
      const noMarginPosition: Position = { ...mockPosition, margin: 0 };
      
      const resultPromise = followService.followAgent('test-agent', [noMarginPosition], { totalMargin: 1000 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(mockCapitalManager.allocateMargin).not.toHaveBeenCalled();
    });

    it('should handle getAccountInfo failure gracefully', async () => {
      const { logWarn } = require('../utils/logger');
      
      mockTradingExecutor.getAccountInfo.mockRejectedValue(new Error('API error'));

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { totalMargin: 1000 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to get account balance'));
      expect(mockCapitalManager.allocateMargin).toHaveBeenCalled();
    });

    it('should handle getAccountInfo with non-Error', async () => {
      const { logWarn } = require('../utils/logger');
      
      mockTradingExecutor.getAccountInfo.mockRejectedValue('Unknown error');

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { totalMargin: 1000 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Unknown error'));
    });

    it('should apply allocation to plans', async () => {
      mockCapitalManager.allocateMargin.mockReturnValue({
        allocations: [{
          symbol: 'BTCUSDT',
          originalMargin: 500,
          allocatedMargin: 400,
          notionalValue: 4000,
          adjustedQuantity: 0.08,
          allocationRatio: 0.8,
          leverage: 10,
          side: 'BUY'
        }],
        totalAllocatedMargin: 400,
        totalNotionalValue: 4000,
        totalOriginalMargin: 500
      });

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { totalMargin: 1000 });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].originalMargin).toBe(500);
      expect(result[0].allocatedMargin).toBe(400);
      expect(result[0].notionalValue).toBe(4000);
      expect(result[0].adjustedQuantity).toBe(0.08);
      expect(result[0].allocationRatio).toBe(0.8);
      expect(result[0].quantity).toBe(0.08);
    });

    it('should display capital allocation info', async () => {
      const { logDebug } = require('../utils/logger');
      
      mockCapitalManager.allocateMargin.mockReturnValue({
        allocations: [{
          symbol: 'BTCUSDT',
          originalMargin: 500,
          allocatedMargin: 400,
          notionalValue: 4000,
          adjustedQuantity: 0.08,
          allocationRatio: 0.8,
          leverage: 10,
          side: 'BUY'
        }],
        totalAllocatedMargin: 400,
        totalNotionalValue: 4000,
        totalOriginalMargin: 500
      });

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { totalMargin: 1000 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logDebug).toHaveBeenCalledWith(expect.stringContaining('Capital Allocation'));
      expect(logDebug).toHaveBeenCalledWith(expect.stringContaining('Total Margin'));
    });
  });

  describe('getLastPositions', () => {
    it('should return empty array for unknown agent', () => {
      const result = followService.getLastPositions('unknown-agent', [mockPosition]);

      expect(result).toEqual([]);
    });

    it('should return last positions for agent', async () => {
      // Mock 订单历史
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);

      const result = followService.getLastPositions('test-agent', [mockPosition]);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('BTCUSDT');
    });
  });

  describe('clearLastPositions', () => {
    it('should clear positions for specific agent', async () => {
      const { logWarn } = require('../utils/logger');
      
      followService.clearLastPositions('test-agent');
      const result = followService.getLastPositions('test-agent', [mockPosition]);

      // 现在 clearLastPositions 只是打印警告，不实际删除数据
      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
    });

    it('should not affect other agents', async () => {
      const { logWarn } = require('../utils/logger');
      
      followService.clearLastPositions('agent-1');

      // 现在 clearLastPositions 只是打印警告
      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
    });
  });

  describe('clearAllLastPositions', () => {
    it('should clear all positions', async () => {
      const { logWarn } = require('../utils/logger');
      
      followService.clearAllLastPositions();

      // 现在 clearAllLastPositions 只是打印警告
      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple positions', async () => {
      const position2: Position = { ...mockPosition, symbol: 'ETHUSDT', entry_oid: 54321 };
      const resultPromise = followService.followAgent('test-agent', [mockPosition, position2]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('BTCUSDT');
      expect(result[1].symbol).toBe('ETHUSDT');
    });

    it('should handle position without exit_plan', async () => {
      const noExitPlanPosition: Position = { ...mockPosition, exit_plan: undefined as any };
      const resultPromise = followService.followAgent('test-agent', [noExitPlanPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
    });

    it('should handle very small quantities', async () => {
      const smallPosition: Position = { ...mockPosition, quantity: 0.00001 };
      const resultPromise = followService.followAgent('test-agent', [smallPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].quantity).toBe(0.00001);
    });

    it('should handle very large quantities', async () => {
      const largePosition: Position = { ...mockPosition, quantity: 1000 };
      const resultPromise = followService.followAgent('test-agent', [largePosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].quantity).toBe(1000);
    });

    it('should handle negative prices', async () => {
      const negativePrice: Position = { ...mockPosition, entry_price: -100 };
      const resultPromise = followService.followAgent('test-agent', [negativePrice]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result[0].entryPrice).toBe(-100);
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined position in handleEntryChanged', async () => {
      // This tests the early return when position is undefined
      const promise1 = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      await promise1;
      
      // Manually trigger with undefined - this is an edge case
      const resultPromise = followService.followAgent('test-agent', []);
      await jest.runAllTimersAsync();
      const result = await resultPromise;
      
      expect(result).toHaveLength(0);
    });
  });

  describe('Profit Target Feature', () => {
    it('should validate profit target range', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Test invalid profit target (too high)
      const resultPromise1 = followService.followAgent('test-agent', [mockPosition], { profitTarget: 1500 });
      await jest.runAllTimersAsync();
      await resultPromise1;
      
      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Invalid profit target'));
    });

    it('should validate profit target range (negative)', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Test invalid profit target (negative)
      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: -10 });
      await jest.runAllTimersAsync();
      await resultPromise;
      
      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Invalid profit target'));
    });

    it('should log profit target enabled message', async () => {
      const { logInfo } = require('../utils/logger');
      
      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: 50 });
      await jest.runAllTimersAsync();
      await resultPromise;
      
      expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Profit target enabled: 50%'));
    });

    it('should log auto-refollow enabled message', async () => {
      const { logInfo } = require('../utils/logger');
      
      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: 50, autoRefollow: true });
      await jest.runAllTimersAsync();
      await resultPromise;
      
      expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Auto-refollow enabled'));
    });

    it('should log auto-refollow disabled message', async () => {
      const { logInfo } = require('../utils/logger');
      
      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: 50, autoRefollow: false });
      await jest.runAllTimersAsync();
      await resultPromise;
      
      expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Auto-refollow disabled'));
    });

    it('should detect profit target reached', async () => {
      // Mock getAllPositions to return position with profit
      (mockPositionManager as any).binanceService.getAllPositions = jest.fn().mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '55000',
          unRealizedProfit: '500',
          leverage: '10',
          marginType: 'ISOLATED',
          isolatedMargin: '500'
        }
      ]);

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: 50 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(mockPositionManager.closePosition).toHaveBeenCalled();
    });

    it('should handle profit calculation error', async () => {
      const { logError } = require('../utils/logger');
      
      // Mock getAllPositions to throw error
      (mockPositionManager as any).binanceService.getAllPositions = jest.fn().mockRejectedValue(new Error('API error'));

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: 50 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Error calculating profit percentage'));
    });

    it('should handle no binance position found', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Mock getAllPositions to return empty array
      (mockPositionManager as any).binanceService.getAllPositions = jest.fn().mockResolvedValue([]);

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: 50 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('No binance position found'));
    });

    it('should handle zero margin (returns 0% profit)', async () => {
      // Mock order history to have existing position
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);

      // Mock getAllPositions to return position with zero margin
      (mockPositionManager as any).binanceService.getAllPositions = jest.fn().mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '55000',
          unRealizedProfit: '100',
          leverage: '10',
          marginType: 'ISOLATED',
          isolatedMargin: '0'
        }
      ]);

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: 50 });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      // When margin is 0, profitPercentage is 0 (not Infinity due to ternary operator)
      // So profit target won't be reached and no action should be taken
      expect(result.length).toBe(0);
    });

    it('should handle profit target close failure', async () => {
      const { logError } = require('../utils/logger');
      
      // Mock getAllPositions to return position with high profit
      (mockPositionManager as any).binanceService.getAllPositions = jest.fn().mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '60000',
          unRealizedProfit: '1000',
          leverage: '10',
          marginType: 'ISOLATED',
          isolatedMargin: '500'
        }
      ]);

      // Mock closePosition to fail
      mockPositionManager.closePosition.mockResolvedValue({ success: false, symbol: 'BTCUSDT', operation: 'close', error: 'Close failed' });

      const resultPromise = followService.followAgent('test-agent', [mockPosition], { profitTarget: 50 });
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to close position for profit target'));
    });
  });

  describe('Entry Changed with Error Handling', () => {
    it('should handle getPositions error when checking existing position', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Mock binanceService.getPositions to throw error
      (mockPositionManager as any).binanceService.getPositions.mockRejectedValue(new Error('API error'));

      // Mock order history
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);

      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      await promise;

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to check existing positions'));
    });

    it('should handle getAccountInfo error before close', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Mock binanceService.getPositions to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);

      // Mock getAccountInfo to throw error
      mockTradingExecutor.getAccountInfo.mockRejectedValueOnce(new Error('API error'));

      // Mock order history
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);

      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      await promise;

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to get balance before close'));
    });

    it('should handle getAccountInfo error after close', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Mock binanceService.getPositions to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);

      // Mock getAccountInfo: first call succeeds, second call fails
      mockTradingExecutor.getAccountInfo
        .mockResolvedValueOnce({ availableBalance: '10000.0', totalWalletBalance: '10000.0' })
        .mockRejectedValueOnce(new Error('API error'));

      // Mock order history
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);

      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      await promise;

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to get balance after close'));
    });

    it('should handle negative released margin', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Mock binanceService.getPositions to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);

      // Mock getAccountInfo to show loss (negative released margin)
      mockTradingExecutor.getAccountInfo
        .mockResolvedValueOnce({ availableBalance: '10000.0', totalWalletBalance: '10000.0' })
        .mockResolvedValueOnce({ availableBalance: '9900.0', totalWalletBalance: '9900.0' });

      // Mock order history
      mockOrderHistoryManager.getProcessedOrdersByAgent = jest.fn().mockReturnValue([
        {
          entryOid: 12345,
          symbol: 'BTCUSDT',
          agent: 'test-agent',
          timestamp: Date.now() - 1000,
          side: 'BUY',
          quantity: 0.1,
          price: 50000
        }
      ]);

      const changedPosition: Position = { ...mockPosition, entry_oid: 99999 };
      const promise = followService.followAgent('test-agent', [changedPosition]);
      await jest.runAllTimersAsync();
      await promise;

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Position closed with loss'));
    });
  });

  describe('New Position with Error Handling', () => {
    it('should handle close position failure when existing position found', async () => {
      const { logError } = require('../utils/logger');
      
      // Mock binanceService.getPositions to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);

      // Mock closePosition to fail
      mockPositionManager.closePosition.mockResolvedValue({ success: false, symbol: 'BTCUSDT', operation: 'close', error: 'Close failed' });

      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to close existing position'));
      expect(result).toHaveLength(0);
    });

    it('should handle getAccountInfo error when closing existing position', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Mock binanceService.getPositions to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);

      // Mock getAccountInfo to throw error
      mockTradingExecutor.getAccountInfo.mockRejectedValue(new Error('API error'));

      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to get balance'));
    });

    it('should handle negative released margin when closing existing position', async () => {
      const { logWarn } = require('../utils/logger');
      
      // Mock binanceService.getPositions to return existing position
      (mockPositionManager as any).binanceService.getPositions.mockResolvedValue([
        {
          symbol: 'BTCUSDT',
          positionAmt: '0.1',
          entryPrice: '50000',
          markPrice: '51000',
          unRealizedProfit: '100',
          leverage: '10'
        }
      ]);

      // Mock getAccountInfo to show loss
      mockTradingExecutor.getAccountInfo
        .mockResolvedValueOnce({ availableBalance: '10000.0', totalWalletBalance: '10000.0' })
        .mockResolvedValueOnce({ availableBalance: '9900.0', totalWalletBalance: '9900.0' });

      const resultPromise = followService.followAgent('test-agent', [mockPosition]);
      await jest.runAllTimersAsync();
      await resultPromise;

      expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Position closed with loss'));
    });
  });
});
