// 测试ConfigManager的reset方法是否正确初始化contractSizes
const { ConfigManager } = require('../src/server/core/services/config-manager');

console.log('开始测试ConfigManager reset方法...\n');

// 创建ConfigManager实例
const configManager = new ConfigManager();

// 测试重置前的contractSizes
console.log('重置前的contractSizes:');
console.log(configManager.getConfig().contractSizes);

// 调用reset方法
configManager.reset();

// 测试重置后的contractSizes
const config = configManager.getConfig();
console.log('\n重置后的contractSizes:');
console.log(config.contractSizes);

// 验证SOL是否存在
if (config.contractSizes && config.contractSizes.SOL) {
  console.log('\n✅ SOL合约面值正确初始化:', config.contractSizes.SOL);
} else {
  console.log('\n❌ SOL合约面值未正确初始化');
}

// 测试getContractSize方法
const solSize = configManager.getContractSize('SOL');
console.log('\n通过getContractSize方法获取SOL合约面值:', solSize);

// 测试其他币种
const testSymbols = ['BTC', 'ETH', 'DOGE', 'SOL', 'AVAX'];
console.log('\n测试各币种合约面值:');
testSymbols.forEach(symbol => {
  const size = configManager.getContractSize(symbol);
  console.log(`  ${symbol}: ${size}`);
});

console.log('\n✅ ConfigManager reset方法测试完成！');