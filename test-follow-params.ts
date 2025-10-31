// 测试用例：验证AI Agent跟单参数保存功能
// 测试文件：test-follow-params.ts

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// 模拟localStorage
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

// 设置全局模拟
(global as any).localStorage = new MockLocalStorage();

// 测试用的设置数据
const mockSettings = {
  priceTolerance: 1.5,
  totalMargin: 100,
  profitTarget: 25,
  autoRefollow: true,
  marginType: "ISOLATED" as const,
  riskOnly: false,
  interval: 30,
  telegram: {
    enabled: false,
    token: "",
    chatId: "",
  },
  binance: {
    apiKey: "test_key",
    apiSecret: "test_secret",
    testnet: true,
  },
};

async function testFollowParams() {
  console.log("🧪 开始测试AI Agent跟单参数保存功能...\n");

  try {
    // 1. 测试Hook导入
    console.log("✅ 步骤1: 测试Hook导入");
    const { useFollowParams } = await import("../src/hooks/useFollowParams");
    console.log("   Hook导入成功");

    // 2. 测试参数初始化
    console.log("\n✅ 步骤2: 测试参数初始化");
    const { params: initialParams } = useFollowParams(mockSettings);
    console.log("   初始参数:", {
      priceTolerance: initialParams.priceTolerance,
      totalMargin: initialParams.totalMargin,
      profitTarget: initialParams.profitTarget,
      autoRefollow: initialParams.autoRefollow,
      marginType: initialParams.marginType,
      riskOnly: initialParams.riskOnly,
    });

    // 3. 测试参数保存
    console.log("\n✅ 步骤3: 测试参数保存");
    const newParams = {
      priceTolerance: 2.0,
      totalMargin: 200,
      profitTarget: "30",
      autoRefollow: false,
      marginType: "CROSSED" as const,
      riskOnly: true,
    };

    // 模拟保存过程
    await new Promise<void>((resolve) => {
      const { saveParams } = useFollowParams(mockSettings);
      saveParams(newParams);
      resolve();
    });
    console.log("   参数保存成功:", newParams);

    // 4. 测试参数加载
    console.log("\n✅ 步骤4: 测试参数加载");
    const { loadParams } = useFollowParams(mockSettings);
    const loadedParams = loadParams();
    console.log("   加载的参数:", loadedParams);

    // 5. 验证参数一致性
    console.log("\n✅ 步骤5: 验证参数一致性");
    const isConsistent =
      loadedParams.priceTolerance === newParams.priceTolerance &&
      loadedParams.totalMargin === newParams.totalMargin &&
      loadedParams.profitTarget === newParams.profitTarget &&
      loadedParams.autoRefollow === newParams.autoRefollow &&
      loadedParams.marginType === newParams.marginType &&
      loadedParams.riskOnly === newParams.riskOnly;

    if (isConsistent) {
      console.log("   ✅ 参数保存和加载一致");
    } else {
      console.log("   ❌ 参数不一致");
      return false;
    }

    // 6. 测试重置功能
    console.log("\n✅ 步骤6: 测试重置功能");
    const { resetToSettings } = useFollowParams(mockSettings);
    resetToSettings();
    const resettedParams = loadParams();
    console.log("   重置后的参数:", resettedParams);

    const isResetCorrect =
      resettedParams.priceTolerance === mockSettings.priceTolerance &&
      resettedParams.totalMargin === mockSettings.totalMargin &&
      resettedParams.profitTarget === mockSettings.profitTarget?.toString() &&
      resettedParams.autoRefollow === mockSettings.autoRefollow &&
      resettedParams.marginType === mockSettings.marginType &&
      resettedParams.riskOnly === mockSettings.riskOnly;

    if (isResetCorrect) {
      console.log("   ✅ 重置功能正常");
    } else {
      console.log("   ❌ 重置功能异常");
      return false;
    }

    console.log("\n🎉 所有测试通过！AI Agent跟单参数保存功能正常工作。");
    return true;

  } catch (error) {
    console.error("❌ 测试失败:", error);
    return false;
  }
}

// 运行测试
testFollowParams().then(success => {
  process.exit(success ? 0 : 1);
});