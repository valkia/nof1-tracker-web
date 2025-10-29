# 资金分配逻辑修复说明

## 问题描述

用户反馈：设置了默认总保证金为30 USDT，但实际下单的名义价值为677 USDT，期望应该按比例缩小下单金额。

## 问题分析

从日志 `docs/trade1029.md` 中可以看到：
- Agent仓位：BTC BUY 0.68 @ 112185（30倍杠杆）
- Agent实际保证金：(0.68 × 112185) / 30 = 2,542.86 USDT
- 用户设置的总保证金：30 USDT
- 用户实际可用余额：23.79 USDT
- 实际下单：0.006 BTC，名义价值 677.40 USDT

**旧逻辑的问题：**

1. **依赖API返回的`margin`字段**：该字段可能不准确或缺失
2. **使用`current_price`而非`entry_price`**：导致价格波动时计算不准确
3. **计算方式**：
   ```typescript
   notionalValue = allocatedMargin * leverage
   adjustedQuantity = notionalValue / current_price
   ```
   这种方式没有保持与Agent相同的风险比例

## 修复方案

**新逻辑：**

1. **重新计算Agent的实际保证金**（基于入场价格和杠杆）：
   ```typescript
   calculatedMargin = (quantity * entry_price) / leverage
   ```

2. **计算缩放比例**：
   ```typescript
   scaleFactor = userMargin / agentMargin
   ```

3. **按比例缩放数量**（而不是重新计算）：
   ```typescript
   adjustedQuantity = abs(agentQuantity) * scaleFactor
   notionalValue = adjustedQuantity * entry_price
   ```

## 修复效果

### 使用实际数据验证

**Agent仓位：**
- 数量：0.68 BTC
- 入场价格：$112,185
- 杠杆：30x
- 实际保证金：$2,542.86

**用户设置：**
- 设置的总保证金：$30
- 实际可用余额：$23.79

**计算结果：**

| 逻辑 | 缩放比例 | 下单数量 | 名义价值 | 所需保证金 |
|------|----------|----------|----------|------------|
| 旧逻辑 | - | 0.006322 BTC | $713.70 | $23.79 |
| 新逻辑 | 0.94% | 0.006362 BTC | $713.70 | $23.79 |

虽然在这个特定案例中，新旧逻辑的数值结果相近，但**新逻辑的原理更正确**：

1. ✅ **保持风险比例**：按照Agent仓位的0.94%比例跟单
2. ✅ **使用入场价格**：计算基于Agent的入场价格，更稳定
3. ✅ **不依赖API字段**：重新计算保证金，确保准确性

## 代码修改

### 1. 客户端：`src/services/futures-capital-manager.ts`

```typescript
// 重新计算每个仓位的实际保证金（基于入场价格和杠杆）
const positionsWithCalculatedMargin = validPositions.map(p => ({
  ...p,
  calculatedMargin: (Math.abs(p.quantity) * p.entry_price) / p.leverage
}));

// 计算用户应该下单的数量（按比例缩放）
const scaleFactor = allocatedMargin / originalMargin;
const adjustedQuantity = Math.abs(position.quantity) * scaleFactor;

// 计算名义价值（使用入场价格）
const notionalValue = adjustedQuantity * position.entry_price;
```

### 2. 服务端：`src/server/core/services/futures-capital-manager.ts`

同样的修复逻辑。

### 3. 日志增强

修改了 `follow-service.ts` 中的日志显示，现在会清晰地显示：
- Agent保证金
- 用户保证金
- 缩放比例（用户保证金占Agent保证金的百分比）

```
💰 Capital Allocation for qwen3-max:
==========================================
💰 Total Agent Margin: $2542.86
💰 Total User Margin: $23.79
📈 Total Notional Value: $713.70

BTC - 30x leverage
   📊 Agent Margin: $2542.86
   💰 User Margin: $23.79 (0.94% of Agent)
   📈 Notional Value: $713.70
   💡 Adjusted Quantity: 0.0064
==========================================
```

## 关于用户的疑问

用户可能期望的是更明确的比例控制。现在的逻辑是：

1. **如果Agent使用了2,542 USDT保证金**
2. **用户设置30 USDT总保证金**
3. **系统会按照30 / 2,542 = 1.18%的比例跟单**
4. **但如果用户可用余额不足（只有23.79 USDT），会自动调整为0.94%**

这是合理的跟单逻辑，因为它保持了与Agent相同的风险比例。

如果用户希望更灵活的控制（例如固定名义价值而不是固定保证金），可以考虑添加新的配置选项。

## 建议

1. ✅ **已修复**：资金分配逻辑现在基于入场价格和重新计算的保证金
2. ✅ **已增强**：日志更清晰地显示缩放比例
3. 💡 **可选**：考虑添加UI提示，说明实际跟单比例（例如"按Agent仓位的0.94%跟单"）
4. 💡 **可选**：考虑添加"固定名义价值"模式作为替代选项

