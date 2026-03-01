# Comprehensive Quant Data Sources

## How to Get Real Data for Maximum Trading Performance

This document explains every data point your system tracks and the **best sources** to get real, live data.

---

## 📊 1. PRICE & OHLCV DATA

### Current Source: Aster DEX API
Already integrated via WebSocket and REST API.

### Data Points:
| Metric | Source | API Endpoint |
|--------|--------|--------------|
| OHLCV | Aster DEX | `GET /fapi/v1/klines` |
| Ticker | Aster DEX | `GET /fapi/v1/ticker/24hr` |
| VWAP | Calculated | From kline data |
| Price Changes | Calculated | From historical prices |

### WebSocket Streams (Already Integrated):
```javascript
// Subscribe to these streams for real-time data
ws.subscribe('<symbol>@aggTrade')     // Real-time trades
ws.subscribe('<symbol>@kline_1m')     // 1-minute candles
ws.subscribe('<symbol>@miniTicker')   // 24hr stats
ws.subscribe('!miniTicker@arr')       // All symbols
```

---

## 📈 2. ORDER BOOK DATA

### Current Source: Aster DEX API
```javascript
// REST endpoint
GET /fapi/v1/depth?symbol=BTCUSDT&limit=100

// WebSocket streams
ws.subscribe('<symbol>@depth')        // Depth updates
ws.subscribe('<symbol>@bookTicker')   // Best bid/ask
```

### Key Metrics to Calculate:
- **Book Imbalance**: `(bidVolume - askVolume) / totalVolume`
- **Slippage Estimation**: Simulate order execution through book
- **Wall Detection**: Find price levels with >3x average order size

---

## 🔧 3. TECHNICAL INDICATORS

### Current: Calculated In-House
All technical indicators are calculated from OHLCV data.

### To Improve Accuracy:
1. **Use TA-Lib** for professional-grade calculations:
   ```bash
   npm install talib-binding
   ```

2. **Alternative: TradingView Webhooks**
   - Set up alerts on TradingView
   - Receive signals via webhook
   - More accurate pattern recognition

---

## 📉 4. DERIVATIVES DATA (Critical for Edge)

### Current Source: Aster DEX
```javascript
// Funding Rate
GET /fapi/v1/fundingRate?symbol=BTCUSDT

// Open Interest
GET /fapi/v1/openInterest?symbol=BTCUSDT

// Long/Short Ratio (if available)
GET /futures/data/globalLongShortAccountRatio
```

### 🔥 UPGRADE: Add Coinglass API for Better Data
**Coinglass** provides the best derivatives data:

```javascript
// Free tier available
const COINGLASS_API = 'https://open-api.coinglass.com/public/v2';

// Funding Rate History
GET /public/v2/funding

// Open Interest
GET /public/v2/open_interest

// Liquidation Data (CRITICAL!)
GET /public/v2/liquidation_history

// Long/Short Ratio
GET /public/v2/long_short_ratio
```

**Sign up**: https://www.coinglass.com/

---

## 💰 5. LIQUIDATION DATA (High Alpha)

### Why It Matters:
- Liquidation cascades cause massive price moves
- Predicting liquidation levels = predicting volatility
- "Liquidity hunts" target stop-loss clusters

### Best Sources:

#### Option 1: Coinglass (Recommended)
```javascript
GET https://open-api.coinglass.com/public/v2/liquidation_history
```

#### Option 2: Bybit/Binance WebSocket
```javascript
// All liquidation orders
ws.subscribe('!forceOrder@arr')
```

### Liquidation Level Calculation:
```javascript
// Long liquidation price = Entry × (1 - 1/Leverage)
// Short liquidation price = Entry × (1 + 1/Leverage)

function estimateLiquidationLevels(openInterest, avgLeverage, currentPrice) {
  const levels = [];
  for (let leverage of [5, 10, 20, 50, 100]) {
    levels.push({
      price: currentPrice * (1 - 1/leverage), // Long liquidations
      type: 'LONG'
    });
    levels.push({
      price: currentPrice * (1 + 1/leverage), // Short liquidations  
      type: 'SHORT'
    });
  }
  return levels;
}
```

---

## 🐋 6. WHALE & SENTIMENT DATA

### Option 1: Whale Alert API
```javascript
// Track large transactions
GET https://api.whale-alert.io/v1/transactions
```
**Sign up**: https://whale-alert.io/

### Option 2: Santiment (Professional)
```javascript
// Social sentiment
GET https://api.santiment.net/graphql

// Queries:
- socialVolume
- sentiment
- devActivity
- exchangeFlows
```
**Sign up**: https://santiment.net/

### Option 3: LunarCrush (Social Metrics)
```javascript
GET https://api.lunarcrush.com/v2/assets
```
**Sign up**: https://lunarcrush.com/

### Option 4: Fear & Greed Index (Free)
```javascript
GET https://api.alternative.me/fng/
```

---

## 🔄 7. EXCHANGE FLOWS (On-Chain)

### Why It Matters:
- **Inflows** = selling pressure (moving to sell)
- **Outflows** = accumulation (moving to HODL)

### Best Sources:

#### Option 1: CryptoQuant API
```javascript
GET https://api.cryptoquant.com/v1/exchange-flows
```
**Sign up**: https://cryptoquant.com/

#### Option 2: Glassnode (Professional)
```javascript
// Exchange balance
GET https://api.glassnode.com/v1/metrics/distribution/exchange_net_position_change
```
**Sign up**: https://glassnode.com/

---

## 📱 8. SOCIAL SENTIMENT

### Twitter/X Sentiment:
1. **Twitter API v2** (expensive)
2. **Santiment** (aggregated)
3. **LunarCrush** (processed metrics)

### Reddit Sentiment:
```javascript
// Reddit API
GET https://oauth.reddit.com/r/cryptocurrency/hot
```

---

## ⚡ 9. VOLATILITY SURFACES (Advanced)

### Implied Volatility from Options:
- **Deribit API** for crypto options IV
- Calculate volatility smile/skew

```javascript
// Deribit options data
GET https://www.deribit.com/api/v2/public/get_book_summary_by_currency
```

---

## 🎯 IMPLEMENTATION PRIORITY

### Phase 1: Immediate (Free/Existing)
1. ✅ Aster DEX price/volume (already done)
2. ✅ Technical indicators (already done)
3. ✅ Order book depth (already done)
4. 🆕 Add Fear & Greed Index (free)
5. 🆕 Add liquidation stream from Aster

### Phase 2: High Impact (Low Cost)
1. **Coinglass Free Tier** - Liquidations, OI, Funding
2. **Alternative.me** - Fear & Greed Index
3. Calculate more indicators in-house

### Phase 3: Professional Edge (Paid APIs)
1. **Santiment** - Social sentiment
2. **CryptoQuant** - On-chain flows
3. **Glassnode** - Whale activity

---

## 🚀 QUICK INTEGRATION GUIDE

### Add Fear & Greed Index (5 minutes):
```typescript
async function getFearGreedIndex(): Promise<number> {
  const res = await fetch('https://api.alternative.me/fng/');
  const data = await res.json();
  return parseInt(data.data[0].value);
}
```

### Add Coinglass Liquidations (10 minutes):
```typescript
const COINGLASS_KEY = process.env.COINGLASS_API_KEY;

async function getLiquidations(symbol: string): Promise<any> {
  const res = await fetch(
    `https://open-api.coinglass.com/public/v2/liquidation_history?symbol=${symbol}`,
    { headers: { 'coinglassSecret': COINGLASS_KEY } }
  );
  return res.json();
}
```

### Add Funding Rate History:
```typescript
async function getFundingHistory(symbol: string): Promise<any> {
  const { asterDexService } = await import('./asterDexService');
  // Already available via:
  return asterDexService.getFundingRate(symbol);
}
```

---

## 📊 DATA QUALITY CHECKLIST

For each data source, ensure:
- [ ] **Freshness**: < 1 second for trading signals
- [ ] **Completeness**: All required fields present
- [ ] **Accuracy**: Validated against multiple sources
- [ ] **Reliability**: Fallback sources configured
- [ ] **Rate Limits**: Proper handling and caching

---

## 🏆 THE EDGE STACK

The best crypto trading systems use this data stack:

| Layer | Data | Source |
|-------|------|--------|
| **Core** | Price, Volume, Order Book | Exchange API (Aster) |
| **Derivatives** | Funding, OI, Liquidations | Coinglass |
| **Sentiment** | Fear/Greed, Social | Alternative.me + LunarCrush |
| **On-Chain** | Whale Flows, Exchange Balance | CryptoQuant |
| **Technical** | Indicators, Patterns | In-house calculation |

---

## 💡 ALPHA TIPS

1. **Funding Rate Arbitrage**: When funding is extremely positive, shorts get paid. Consider counter-trend trades.

2. **Liquidation Hunting**: Price tends to wick to liquidation clusters before reversing.

3. **OI Divergence**: Price up + OI down = weak rally (shorts closing). Price up + OI up = strong rally (new longs).

4. **Exchange Flows**: Large outflows often precede rallies (supply shock).

5. **Fear & Greed Extremes**: 
   - < 20 = Extreme Fear = BUY zone
   - > 80 = Extreme Greed = SELL zone

---

## 🔗 API Keys to Get

1. **Coinglass**: https://www.coinglass.com/ (Free tier available)
2. **Whale Alert**: https://whale-alert.io/ (Free tier)
3. **Santiment**: https://santiment.net/ (Paid, but powerful)
4. **LunarCrush**: https://lunarcrush.com/ (Free tier)
5. **CryptoQuant**: https://cryptoquant.com/ (Paid, on-chain data)

Add these to your `.env.local`:
```env
COINGLASS_API_KEY=your_key
WHALE_ALERT_API_KEY=your_key
SANTIMENT_API_KEY=your_key
LUNARCRUSH_API_KEY=your_key
CRYPTOQUANT_API_KEY=your_key
```

