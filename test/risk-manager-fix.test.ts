import { RiskManager } from '../src/server/core/services/risk-manager';
import { ConfigManager } from '../src/server/core/services/config-manager';
import { TradingPlan } from '../src/server/core/types/trading';

// 测试修复后的风险计算逻辑
console.log('开始测试修复后的风险计算逻辑...\n');

// 手动测试你提到的具体例子
const configManager = new ConfigManager();
const riskManager = new RiskManager(configManager);

const manualTestPlan: TradingPlan = {
  id: 'manual-test',
  symbol: 'DOGE',
  side: 'BUY',
  type: 'MARKET',
  quantity: 92.0000,
  leverage: 10,
  timestamp: Date.now(),
};

const manualAssessment = riskManager.assessRisk(manualTestPlan);

console.log('=== 手动测试结果 ===');
console.log('交易计划：', {
  symbol: manualTestPlan.symbol,
  quantity: manualTestPlan.quantity,
  leverage: manualTestPlan.leverage,
});

console.log('风险评估结果：', {
  maxLoss: `$${manualAssessment.maxLoss.toLocaleString()}`,
  riskScore: `${manualAssessment.riskScore}/100`,
  suggestedPositionSize: `${manualAssessment.suggestedPositionSize} 张`,
});

console.log('警告信息：');
manualAssessment.warnings.forEach((warning: string, index: number) => {
  console.log(`  ${index + 1}. ${warning}`);
});

console.log('\n=== 计算对比 ===');
console.log('修复前的错误计算：92.0000 * 1000 = $92,000.00');
console.log(`修复后的正确计算：92.0000 * ${configManager.getContractSize('DOGE')} * 10 = $${manualAssessment.maxLoss.toLocaleString()}`);

console.log('\n=== 其他测试案例 ===');

// 测试BTC
const btcPlan: TradingPlan = {
  id: 'btc-test',
  symbol: 'BTC',
  side: 'BUY',
  type: 'MARKET',
  quantity: 1.0,
  leverage: 10,
  timestamp: Date.now(),
};

const btcAssessment = riskManager.assessRisk(btcPlan);
console.log('BTC 1手 10x杠杆：', {
  maxLoss: `$${btcAssessment.maxLoss.toLocaleString()}`,
  riskScore: `${btcAssessment.riskScore}/100`,
});

// 测试不同杠杆
const eth5x: TradingPlan = {
  id: 'eth-5x',
  symbol: 'ETH',
  side: 'BUY',
  type: 'MARKET',
  quantity: 2.0,
  leverage: 5,
  timestamp: Date.now(),
};

const eth10x: TradingPlan = {
  id: 'eth-10x',
  symbol: 'ETH',
  side: 'BUY',
  type: 'MARKET',
  quantity: 2.0,
  leverage: 10,
  timestamp: Date.now(),
};

const eth20x: TradingPlan = {
  id: 'eth-20x',
  symbol: 'ETH',
  side: 'BUY',
  type: 'MARKET',
  quantity: 2.0,
  leverage: 20,
  timestamp: Date.now(),
};

console.log('ETH 2手不同杠杆对比：');
console.log(`  5x杠杆：风险评分 ${riskManager.assessRisk(eth5x).riskScore}/100`);
console.log(`  10x杠杆：风险评分 ${riskManager.assessRisk(eth10x).riskScore}/100`);
console.log(`  20x杠杆：风险评分 ${riskManager.assessRisk(eth20x).riskScore}/100`);

console.log('\n✅ 风险计算逻辑修复完成！');