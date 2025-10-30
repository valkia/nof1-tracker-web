/**
 * 测试直接策略修复效果
 * 验证在使用直接策略时是否避免了"先卖后买"的问题
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

async function testDirectStrategyFix() {
  console.log('🧪 测试直接策略修复效果');
  console.log('='.repeat(50));

  // 创建FollowService实例
  const followService = new FollowService(
    new MockPositionManager() as any,
    new MockOrderHistoryManager() as any,
    new MockRiskManager() as any,
    new MockCapitalManager() as any,
    new MockTradingExecutor() as any
  );

  // 模拟实际持仓数据
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

  // Mock验证结果为需要信任实际持仓
  const originalValidate = followService['validatePositionConsistency'];
  followService['validatePositionConsistency'] = async () => ({
    isValid: true,
    isConsistent: false,
    discrepancies: [],
    actionRequired: 'trust_actual',
    suggestedAction: 'Trust actual positions, treat all as new'
  });

  try {
    console.log('📋 测试直接策略是否避免先卖后买...');

    // 模拟调用followAgent，这应该触发直接策略
    const followPlans = await followService.followAgent('test-agent', currentPositions);

    console.log('📊 生成的跟单计划数量:', followPlans.length);

    // 检查生成的计划
    followPlans.forEach((plan, index) => {
      console.log(`📋 计划 ${index + 1}:`, {
        symbol: plan.symbol,
        action: plan.action,
        reason: plan.reason,
        useDirectStrategy: plan.reason.includes('Direct entry')
      });
    });

    // 验证没有"先卖后买"的循环
    const hasEntryChanged = followPlans.some(plan => plan.reason.includes('Closing existing position'));
    const hasDirectEntry = followPlans.some(plan => plan.reason.includes('Direct entry'));

    if (hasDirectEntry && !hasEntryChanged) {
      console.log('✅ 修复成功：使用直接策略，避免了先卖后买');
    } else if (hasEntryChanged) {
      console.log('❌ 修复失败：仍然存在先卖后买的情况');
    } else {
      console.log('⚠️  需要进一步分析：没有检测到预期的行为');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    // 恢复原始方法
    followService['validatePositionConsistency'] = originalValidate;
  }

  console.log('\\n🎉 直接策略修复测试完成！');
}

// 运行测试
testDirectStrategyFix().catch(console.error);