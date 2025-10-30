/**
 * FollowService 测试脚本
 * 用于验证持仓验证机制和状态重建逻辑
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Position, FollowPlan } from '../src/server/core/scripts/analyze-api';
import { FollowService } from '../src/server/core/services/follow-service';

// Mock 依赖服务
const mockPositionManager = {
  cleanOrphanedOrders: jest.fn().mockResolvedValue(undefined),
  closePosition: jest.fn().mockResolvedValue({ success: true }),
  getAllPositions: jest.fn().mockResolvedValue([]),
  getPositions: jest.fn().mockResolvedValue([]),
  shouldExitPosition: jest.fn().mockReturnValue(false),
  getExitReason: jest.fn().mockReturnValue('Test reason')
};

const mockOrderHistoryManager = {
  reloadHistory: jest.fn(),
  getProcessedOrdersByAgent: jest.fn().mockReturnValue([]),
  isOrderProcessed: jest.fn().mockReturnValue(false),
  addProfitExitRecord: jest.fn(),
  resetSymbolOrderStatus: jest.fn()
};

const mockRiskManager = {
  checkPriceTolerance: jest.fn().mockReturnValue({ shouldExecute: true, reason: 'Price acceptable' })
};

const mockCapitalManager = {
  allocateMargin: jest.fn().mockReturnValue({
    totalOriginalMargin: 1000,
    totalAllocatedMargin: 1000,
    totalNotionalValue: 10000,
    allocations: []
  })
};

const mockTradingExecutor = {
  getAccountInfo: jest.fn().mockResolvedValue({ availableBalance: '10000' }),
  executeOrder: jest.fn().mockResolvedValue({ success: true, orderId: '12345' })
};

// 测试用的持仓数据
const mockCurrentPositions: Position[] = [
  {
    symbol: 'BTC',
    entry_price: 50000,
    quantity: 0.01,
    leverage: 10,
    entry_oid: 123456789,
    tp_oid: 0,
    sl_oid: 0,
    margin: 500,
    current_price: 51000,
    unrealized_pnl: 100,
    confidence: 0.9,
    exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
  }
];

const mockHistoricalPositions: Position[] = [
  {
    symbol: 'BTC',
    entry_price: 49000,
    quantity: 0.01,
    leverage: 10,
    entry_oid: 987654321,
    tp_oid: 0,
    sl_oid: 0,
    margin: 490,
    current_price: 51000,
    unrealized_pnl: 200,
    confidence: 0.8,
    exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
  }
];

describe('FollowService 持仓验证机制测试', () => {
  let followService: FollowService;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();

    // 创建FollowService实例
    followService = new FollowService(
      mockPositionManager as any,
      mockOrderHistoryManager as any,
      mockRiskManager as any,
      mockCapitalManager as any,
      mockTradingExecutor as any
    );
  });

  describe('持仓一致性验证', () => {
    it('应该检测到价格不匹配', async () => {
      const currentPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 50000,
        quantity: 0.01,
        leverage: 10,
        entry_oid: 123456789,
        tp_oid: 0,
        sl_oid: 0,
        margin: 500,
        current_price: 51000,
        unrealized_pnl: 100,
        confidence: 0.9,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      const historicalPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 49000, // 价格不同
        quantity: 0.01,
        leverage: 10,
        entry_oid: 987654321,
        tp_oid: 0,
        sl_oid: 0,
        margin: 490,
        current_price: 51000,
        unrealized_pnl: 200,
        confidence: 0.8,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      // Mock重建历史持仓的方法
      jest.spyOn(followService as any, 'rebuildLastPositionsFromHistory')
        .mockReturnValue(historicalPositions);

      const result = await followService.validatePositionConsistency('test-agent', currentPositions);

      expect(result.isValid).toBe(true);
      expect(result.isConsistent).toBe(false);
      expect(result.actionRequired).toBe('trust_actual');
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('price_mismatch');
      expect(result.discrepancies[0].severity).toBe('low');
    });

    it('应该检测到数量不匹配', async () => {
      const currentPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 50000,
        quantity: 0.02, // 数量不同
        leverage: 10,
        entry_oid: 123456789,
        tp_oid: 0,
        sl_oid: 0,
        margin: 1000,
        current_price: 51000,
        unrealized_pnl: 200,
        confidence: 0.9,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      const historicalPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 50000,
        quantity: 0.01,
        leverage: 10,
        entry_oid: 987654321,
        tp_oid: 0,
        sl_oid: 0,
        margin: 500,
        current_price: 51000,
        unrealized_pnl: 100,
        confidence: 0.8,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      jest.spyOn(followService as any, 'rebuildLastPositionsFromHistory')
        .mockReturnValue(historicalPositions);

      const result = await followService.validatePositionConsistency('test-agent', currentPositions);

      expect(result.isValid).toBe(true);
      expect(result.isConsistent).toBe(false);
      expect(result.actionRequired).toBe('trust_actual');
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('quantity_mismatch');
      expect(result.discrepancies[0].severity).toBe('medium');
    });

    it('应该检测到实际持仓在历史记录中不存在', async () => {
      const currentPositions: Position[] = [{
        symbol: 'ETH',
        entry_price: 3000,
        quantity: 0.1,
        leverage: 10,
        entry_oid: 123456789,
        tp_oid: 0,
        sl_oid: 0,
        margin: 300,
        current_price: 3100,
        unrealized_pnl: 10,
        confidence: 0.9,
        exit_plan: { type: 'TAKE_PROFIT', price: 3500 }
      }];

      const historicalPositions: Position[] = []; // 历史记录为空

      jest.spyOn(followService as any, 'rebuildLastPositionsFromHistory')
        .mockReturnValue(historicalPositions);

      const result = await followService.validatePositionConsistency('test-agent', currentPositions);

      expect(result.isValid).toBe(true);
      expect(result.isConsistent).toBe(false);
      expect(result.actionRequired).toBe('trust_actual');
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('missing_in_history');
      expect(result.discrepancies[0].severity).toBe('high');
    });

    it('应该检测到历史记录中存在但实际没有的持仓', async () => {
      const currentPositions: Position[] = []; // 实际没有持仓

      const historicalPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 50000,
        quantity: 0.01,
        leverage: 10,
        entry_oid: 987654321,
        tp_oid: 0,
        sl_oid: 0,
        margin: 500,
        current_price: 51000,
        unrealized_pnl: 100,
        confidence: 0.8,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      jest.spyOn(followService as any, 'rebuildLastPositionsFromHistory')
        .mockReturnValue(historicalPositions);

      const result = await followService.validatePositionConsistency('test-agent', currentPositions);

      expect(result.isValid).toBe(true);
      expect(result.isConsistent).toBe(false);
      expect(result.actionRequired).toBe('rebuild_history');
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].type).toBe('extra_in_history');
      expect(result.discrepancies[0].severity).toBe('medium');
    });

    it('应该正确处理完全一致的持仓', async () => {
      const currentPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 50000,
        quantity: 0.01,
        leverage: 10,
        entry_oid: 123456789,
        tp_oid: 0,
        sl_oid: 0,
        margin: 500,
        current_price: 51000,
        unrealized_pnl: 100,
        confidence: 0.9,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      const historicalPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 50000,
        quantity: 0.01,
        leverage: 10,
        entry_oid: 123456789,
        tp_oid: 0,
        sl_oid: 0,
        margin: 500,
        current_price: 51000,
        unrealized_pnl: 100,
        confidence: 0.9,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      jest.spyOn(followService as any, 'rebuildLastPositionsFromHistory')
        .mockReturnValue(historicalPositions);

      const result = await followService.validatePositionConsistency('test-agent', currentPositions);

      expect(result.isValid).toBe(true);
      expect(result.isConsistent).toBe(true);
      expect(result.actionRequired).toBe('none');
      expect(result.discrepancies).toHaveLength(0);
      expect(result.suggestedAction).toBe('Positions are consistent, continue with normal processing');
    });

    it('应该检测到关键问题并要求用户确认', async () => {
      const currentPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 50000,
        quantity: 0.01,
        leverage: 10,
        entry_oid: 123456789,
        tp_oid: 0,
        sl_oid: 0,
        margin: 500,
        current_price: 51000,
        unrealized_pnl: 100,
        confidence: 0.9,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      const historicalPositions: Position[] = [{
        symbol: 'BTC',
        entry_price: 40000, // 价格差异巨大
        quantity: 0.001, // 数量差异巨大
        leverage: 10,
        entry_oid: 987654321,
        tp_oid: 0,
        sl_oid: 0,
        margin: 40,
        current_price: 51000,
        unrealized_pnl: 10,
        confidence: 0.8,
        exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
      }];

      jest.spyOn(followService as any, 'rebuildLastPositionsFromHistory')
        .mockReturnValue(historicalPositions);

      const result = await followService.validatePositionConsistency('test-agent', currentPositions);

      expect(result.isValid).toBe(false);
      expect(result.isConsistent).toBe(false);
      expect(result.actionRequired).toBe('user_confirmation');
      expect(result.discrepancies).toHaveLength(2);

      // 检查是否有关键问题
      const criticalIssues = result.discrepancies.filter(d => d.severity === 'critical');
      expect(criticalIssues).toHaveLength(1);
    });
  });

  describe('用户确认机制', () => {
    it('应该正确处理用户确认', async () => {
      // 添加确认
      followService.handleUserConfirmation('test-agent', 'trust_actual');

      // 检查是否需要确认
      const needsConfirmation = await followService.needsUserConfirmation('test-agent', mockCurrentPositions);
      expect(needsConfirmation).toBe(false);
    });

    it('应该正确获取确认所需信息', async () => {
      // Mock验证结果
      const mockValidationResult = {
        isValid: false,
        isConsistent: false,
        discrepancies: [
          {
            symbol: 'BTC',
            type: 'price_mismatch' as const,
            actualPosition: mockCurrentPositions[0],
            historicalPosition: mockHistoricalPositions[0],
            priceDiff: 1000,
            severity: 'low' as const
          }
        ],
        actionRequired: 'user_confirmation' as const,
        suggestedAction: 'Found 1 critical issues. Please review and confirm action.'
      };

      jest.spyOn(followService, 'validatePositionConsistency')
        .mockResolvedValue(mockValidationResult);

      const confirmationInfo = await followService.getConfirmationRequiredInfo('test-agent', mockCurrentPositions);

      expect(confirmationInfo.message).toBe(mockValidationResult.suggestedAction);
      expect(confirmationInfo.discrepancies).toBe(mockValidationResult.discrepancies);
      expect(confirmationInfo.options).toHaveLength(3);
      expect(confirmationInfo.options[0].value).toBe('trust_actual');
      expect(confirmationInfo.options[1].value).toBe('rebuild_history');
      expect(confirmationInfo.options[2].value).toBe('abort');
    });
  });

  describe('跟单流程集成测试', () => {
    it('应该在持仓不一致时优先信任实际持仓', async () => {
      // Mock重建历史持仓返回不一致的数据
      jest.spyOn(followService as any, 'rebuildLastPositionsFromHistory')
        .mockReturnValue(mockHistoricalPositions);

      // Mock验证结果为需要信任实际持仓
      const mockValidationResult = {
        isValid: true,
        isConsistent: false,
        discrepancies: [
          {
            symbol: 'BTC',
            type: 'price_mismatch' as const,
            actualPosition: mockCurrentPositions[0],
            historicalPosition: mockHistoricalPositions[0],
            priceDiff: 1000,
            severity: 'low' as const
          }
        ],
        actionRequired: 'trust_actual' as const,
        suggestedAction: 'Minor inconsistencies found, will trust actual positions and update history'
      };

      jest.spyOn(followService, 'validatePositionConsistency')
        .mockResolvedValue(mockValidationResult);

      // Mock直接生成进入计划
      const mockFollowPlans: FollowPlan[] = [{
        action: 'ENTER',
        symbol: 'BTC',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.01,
        leverage: 10,
        entryPrice: 50000,
        reason: 'New position opened by test-agent (OID: 123456789)',
        agent: 'test-agent',
        timestamp: Date.now(),
        position: mockCurrentPositions[0],
        priceTolerance: { shouldExecute: true, reason: 'Price acceptable' },
        marginType: 'CROSSED'
      }];

      jest.spyOn(followService as any, 'generateDirectEntryChanges')
        .mockReturnValue([{
          symbol: 'BTC',
          type: 'new_position' as const,
          currentPosition: mockCurrentPositions[0]
        }]);

      jest.spyOn(followService as any, 'handlePositionChange')
        .mockResolvedValue(mockFollowPlans);

      const result = await followService.followAgent('test-agent', mockCurrentPositions);

      expect(result).toBe(mockFollowPlans);

      // 验证使用了直接进入策略而不是检测变化
      expect(followService['generateDirectEntryChanges']).toHaveBeenCalled();
    });

    it('应该在有用户确认时使用确认结果', async () => {
      // 先添加确认
      followService.handleUserConfirmation('test-agent', 'trust_actual');

      // Mock验证结果为需要用户确认，但有最近确认
      const mockValidationResult = {
        isValid: true,
        isConsistent: false,
        discrepancies: [],
        actionRequired: 'user_confirmation' as const,
        suggestedAction: 'User confirmation required'
      };

      jest.spyOn(followService, 'validatePositionConsistency')
        .mockResolvedValue(mockValidationResult);

      // Mock直接生成进入计划
      const mockFollowPlans: FollowPlan[] = [{
        action: 'ENTER',
        symbol: 'BTC',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.01,
        leverage: 10,
        entryPrice: 50000,
        reason: 'New position opened by test-agent (OID: 123456789)',
        agent: 'test-agent',
        timestamp: Date.now(),
        position: mockCurrentPositions[0],
        priceTolerance: { shouldExecute: true, reason: 'Price acceptable' },
        marginType: 'CROSSED'
      }];

      jest.spyOn(followService as any, 'generateDirectEntryChanges')
        .mockReturnValue([{
          symbol: 'BTC',
          type: 'new_position' as const,
          currentPosition: mockCurrentPositions[0]
        }]);

      jest.spyOn(followService as any, 'handlePositionChange')
        .mockResolvedValue(mockFollowPlans);

      const result = await followService.followAgent('test-agent', mockCurrentPositions);

      expect(result).toBe(mockFollowPlans);
    });
  });
});

export {};