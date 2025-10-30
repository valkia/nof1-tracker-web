/**
 * 测试修复后的持仓验证逻辑
 */

import { Position } from '../src/server/core/scripts/analyze-api';
import { FollowService } from '../src/server/core/services/follow-service';

// 简化的服务模拟
class MockPositionManager {
  async cleanOrphanedOrders() {}
  async closePosition() { return { success: true }; }
  async getAllPositions() { return []; }
  async getPositions() { return []; }
  shouldExitPosition() { return false; }
  getExitReason() { return 'Test'; }
}

class MockOrderHistoryManager {
  reloadHistory() {}
  getProcessedOrdersByAgent() { return []; }
  isOrderProcessed() { return false; }
  addProfitExitRecord() {}
  resetSymbolOrderStatus() {}
}

class MockRiskManager {
  checkPriceTolerance() {
    return { shouldExecute: true, reason: 'Price acceptable' };
  }
}

class MockCapitalManager {
  allocateMargin() {
    return {
      totalOriginalMargin: 1000,
      totalAllocatedMargin: 1000,
      totalNotionalValue: 10000,
      allocations: []
    };
  }
}

class MockTradingExecutor {
  async getAccountInfo() { return { availableBalance: '10000' }; }
  async executeOrder() { return { success: true, orderId: '12345' }; }
}

async function testCriticalIssuesHandling() {
  console.log('🧪 测试关键问题处理逻辑');
  console.log('='.repeat(50));

  // 创建FollowService实例
  const followService = new FollowService(
    new MockPositionManager() as any,
    new MockOrderHistoryManager() as any,
    new MockRiskManager() as any,
    new MockCapitalManager() as any,
    new MockTradingExecutor() as any
  );

  // 模拟有关键问题的持仓数据
  const currentPositions: Position[] = [
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
    },
    {
      symbol: 'ETH',
      entry_price: 3000,
      quantity: 0.1,
      leverage: 10,
      entry_oid: 987654321,
      tp_oid: 0,
      sl_oid: 0,
      margin: 300,
      current_price: 3100,
      unrealized_pnl: 10,
      confidence: 0.8,
      exit_plan: { type: 'TAKE_PROFIT', price: 3500 }
    }
  ];

  // Mock重建历史持仓返回不一致的数据（模拟关键问题）
  const originalRebuild = followService['rebuildLastPositionsFromHistory'];
  followService['rebuildLastPositionsFromHistory'] = () => [
    {
      symbol: 'BTC',
      entry_price: 30000, // 价格差异巨大 (>40%)
      quantity: 0.001, // 数量差异巨大 (>90%)
      leverage: 10,
      entry_oid: 111111111,
      tp_oid: 0,
      sl_oid: 0,
      margin: 30,
      current_price: 51000,
      unrealized_pnl: 10,
      confidence: 0.8,
      exit_plan: { type: 'TAKE_PROFIT', price: 55000 }
    }
    // 注意：缺少ETH的历史记录，模拟missing_in_history
  ];

  try {
    console.log('📋 开始验证持仓一致性...');

    // 测试持仓验证
    const validationResult = await followService.validatePositionConsistency('test-agent', currentPositions);

    console.log('📊 验证结果:', {
      isValid: validationResult.isValid,
      isConsistent: validationResult.isConsistent,
      actionRequired: validationResult.actionRequired,
      discrepancies: validationResult.discrepancies.map(d => ({
        symbol: d.symbol,
        type: d.type,
        severity: d.severity
      }))
    });

    // 检查修复是否生效
    if (validationResult.isValid) {
      console.log('✅ 修复生效：isValid = true，允许继续执行');
    } else {
      console.log('❌ 修复未生效：isValid = false，会抛出错误');
    }

    if (validationResult.actionRequired === 'user_confirmation') {
      console.log('✅ 正确检测到需要用户确认');

      // 测试用户确认处理
      console.log('\n👤 测试用户确认处理...');
      const hasRecentConfirmation = followService['userConfirmationManager'].hasRecentConfirmation('test-agent');

      if (!hasRecentConfirmation) {
        console.log('✅ 检测到没有最近确认，应该使用默认安全策略');
      } else {
        console.log('❌ 意外：有最近确认');
      }
    }

    // 测试完整的followAgent流程（模拟）
    console.log('\n🚀 测试完整的跟单流程...');

    // 检查是否需要用户确认的逻辑
    const hasRecentConfirmation = followService['userConfirmationManager'].hasRecentConfirmation('test-agent');

    if (!hasRecentConfirmation) {
      console.log('✅ 没有最近确认，应该使用默认信任实际持仓策略');
      console.log('✅ 这意味着系统会直接基于实际持仓生成计划，避免"先卖后买"');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    // 恢复原始方法
    followService['rebuildLastPositionsFromHistory'] = originalRebuild;
  }

  console.log('\n🎉 测试完成！');
}

// 运行测试
testCriticalIssuesHandling().catch(console.error);