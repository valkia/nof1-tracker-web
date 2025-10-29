币安交易：2025-10-29 13:31:07	BTCUSDT 永续
市价委托
卖出
-	112,889.5	677.4 USDT	677.4 USDT	-
     完全成交
     2025-10-29 13:30:54	BTCUSDT 永续
     市价止损
     卖出
-	-	0.0 USDT	0.0 USDT	最新价格<=111,200.00
          已取消
          2025-10-29 13:30:54	BTCUSDT 永续
          市价止盈
          卖出
-	-	0.0 USDT	0.0 USDT	最新价格>=113,900.00
          已取消
          2025-10-29 13:30:54	BTCUSDT 永续
          市价委托
          买入
-	112,900.2	677.5 USDT	677.5 USDT	-
     完全成交

本地日志： ✓ Compiled /api/trading/follow in 168ms (923 modules)
📡 Calling API: https://nof1.ai/api/account-totals?lastHourlyMarker=271
📊 Received 17238 bytes of data
🎯 Found agent qwen3-max (marker: 271) with 1 positions
🤖 Following agent: qwen3-max
💡 Profit target disabled: using agent's original exit plan only
⏰ Server time synced. Offset: -1049ms
⏰ Server time synced. Offset: -1044ms
⏰ Server time synced. Offset: -1045ms
API Error [-1021]: Timestamp for this request was 1000ms ahead of the server's time.
⏰ Timestamp error detected, syncing server time and retrying...
⏰ Server time synced. Offset: -1361ms
📈 NEW POSITION: BTC BUY 0.68 @ 112185 (OID: 215502059117)
⚠️ Insufficient available balance: Required 30.00 USDT, Available 23.79 USDT
💡 Reducing allocation to available balance: 23.79 USDT
✅ Generated 1 follow plan(s) for agent qwen3-max
🛡️ Setting up stop orders based on exit plan...
🔄 Executing trade with stop orders: BTC BUY 0.006
🔄 Executing trade: BTC BUY 0.006 (Leverage: 30x)
✅ Connected to Binance API (Server time: Wed Oct 29 2025 13:30:53 GMT+0800 (中国标准时间))
💰 Account Balance Information:
Total Wallet Balance: 71.05 USDT
Available Balance: 23.79 USDT
Current Price: 112900.20 USDT
Position Size: 0.006 BTC
Current Position: 0 (NONE)
Operation: 🔺 OPENING position
Leverage: 30x
Notional Value: 677.40 USDT
Required Margin: 22.58 USDT
Margin Ratio: 94.92%
Account Details:
- Total Initial Margin: 51.23982601
- Total Maint Margin: 2.23646364
- Total Position Initial Margin: 51.23982601
- Total Open Order Initial Margin: 0.00000000
- Total Cross Wallet Balance: 71.04794222
  ⚠️ High margin usage: 94.92% of available balance
  API Error [-4046]: No need to change margin type.
  ℹ️ BTC is already in CROSSED margin mode
  ✅ Leverage set to 30x for BTC
  ✅ Order executed successfully:
  Order ID: 804270344190
  Symbol: BTCUSDT
  Status: NEW
  Price: 0.00
  Quantity: 0.000
  🛡️ Setting up stop orders for BTC:
  📈 Placing Take Profit order at: 113900.0
  ✅ Take Profit order placed: 804270344425
  📉 Placing Stop Loss order at: 111200.0
  ✅ Stop Loss order placed: 804270344637
  ✅ Trade executed successfully!
  📝 Main Order ID: 804270344190
  📈 Take Profit Order ID: 804270344425
  📉 Stop Loss Order ID: 804270344637
  💾 Saving order to history: BTC (OID: 215502059117)
  ✅ Saved processed order: BTC BUY 0.006 (OID: 215502059117)
  POST /api/trading/follow 200 in 2932ms