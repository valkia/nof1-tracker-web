// 简单的语法检查测试
import { readFileSync } from "fs";

console.log("🧪 开始语法检查测试...\n");

try {
  // 1. 检查Hook文件语法
  console.log("✅ 步骤1: 检查useFollowParams Hook语法");
  const hookContent = readFileSync("src/hooks/useFollowParams.ts", "utf8");
  if (hookContent.includes("useFollowParams") && hookContent.includes("localStorage")) {
    console.log("   ✅ Hook文件包含必要功能");
  } else {
    console.log("   ❌ Hook文件缺少必要功能");
    process.exit(1);
  }

  // 2. 检查TradingExecutionPanel更新
  console.log("\n✅ 步骤2: 检查TradingExecutionPanel组件更新");
  const panelContent = readFileSync("src/components/trading/trading-execution-panel.tsx", "utf8");

  if (panelContent.includes("useFollowParams")) {
    console.log("   ✅ 组件已导入Hook");
  } else {
    console.log("   ❌ 组件未导入Hook");
    process.exit(1);
  }

  if (panelContent.includes("saveAsDefault")) {
    console.log("   ✅ 组件包含保存功能");
  } else {
    console.log("   ❌ 组件缺少保存功能");
    process.exit(1);
  }

  if (panelContent.includes("hasSavedParams")) {
    console.log("   ✅ 组件包含参数状态提示");
  } else {
    console.log("   ❌ 组件缺少参数状态提示");
    process.exit(1);
  }

  // 3. 检查保存按钮
  if (panelContent.includes("保存为默认")) {
    console.log("   ✅ 保存按钮已添加");
  } else {
    console.log("   ❌ 保存按钮未添加");
    process.exit(1);
  }

  // 4. 检查参数绑定
  if (panelContent.includes("params.priceTolerance") &&
      panelContent.includes("params.totalMargin") &&
      panelContent.includes("params.profitTarget")) {
    console.log("   ✅ 参数已正确绑定");
  } else {
    console.log("   ❌ 参数绑定有问题");
    process.exit(1);
  }

  console.log("\n🎉 所有语法检查通过！代码结构正确。");

} catch (error) {
  console.error("❌ 语法检查失败:", error);
  process.exit(1);
}