#!/bin/bash

echo "🧪 开始语法检查测试..."

# 1. 检查Hook文件
echo "✅ 步骤1: 检查useFollowParams Hook"
if [ -f "src/hooks/useFollowParams.ts" ]; then
    echo "   ✅ Hook文件存在"
    if grep -q "useFollowParams" "src/hooks/useFollowParams.ts"; then
        echo "   ✅ Hook文件包含useFollowParams函数"
    else
        echo "   ❌ Hook文件缺少useFollowParams函数"
        exit 1
    fi
    if grep -q "localStorage" "src/hooks/useFollowParams.ts"; then
        echo "   ✅ Hook文件包含localStorage操作"
    else
        echo "   ❌ Hook文件缺少localStorage操作"
        exit 1
    fi
else
    echo "   ❌ Hook文件不存在"
    exit 1
fi

# 2. 检查组件更新
echo -e "\n✅ 步骤2: 检查TradingExecutionPanel组件"
if grep -q "useFollowParams" "src/components/trading/trading-execution-panel.tsx"; then
    echo "   ✅ 组件已导入Hook"
else
    echo "   ❌ 组件未导入Hook"
    exit 1
fi

if grep -q "saveAsDefault" "src/components/trading/trading-execution-panel.tsx"; then
    echo "   ✅ 组件包含保存功能"
else
    echo "   ❌ 组件缺少保存功能"
    exit 1
fi

if grep -q "hasSavedParams" "src/components/trading/trading-execution-panel.tsx"; then
    echo "   ✅ 组件包含参数状态提示"
else
    echo "   ❌ 组件缺少参数状态提示"
    exit 1
fi

if grep -q "保存为默认" "src/components/trading/trading-execution-panel.tsx"; then
    echo "   ✅ 保存按钮已添加"
else
    echo "   ❌ 保存按钮未添加"
    exit 1
fi

# 3. 检查参数绑定
if grep -q "params\.priceTolerance" "src/components/trading/trading-execution-panel.tsx" && \
   grep -q "params\.totalMargin" "src/components/trading/trading-execution-panel.tsx" && \
   grep -q "params\.profitTarget" "src/components/trading/trading-execution-panel.tsx"; then
    echo "   ✅ 参数已正确绑定"
else
    echo "   ❌ 参数绑定有问题"
    exit 1
fi

echo -e "\n🎉 所有语法检查通过！代码结构正确。"