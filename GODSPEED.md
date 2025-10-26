# 🤖 GODSPEED AI Trading System - Technical Documentation

> **Advanced technical analysis and trading execution engine**

---

## Table of Contents

- [System Overview](#system-overview)
- [Trading Philosophy](#trading-philosophy)
- [Technical Architecture](#technical-architecture)
- [Analysis Engine](#analysis-engine)
- [Signal Generation](#signal-generation)
- [Risk Management](#risk-management)
- [Trade Execution](#trade-execution)
- [Position Monitoring](#position-monitoring)
- [Performance Optimization](#performance-optimization)
- [Configuration Reference](#configuration-reference)

---

## 🎯 System Overview

Godspeed is a sophisticated AI trading system that combines multiple technical analysis strategies with aggressive risk management to maximize profitability on Aster DEX futures markets.

### Core Principles

1. **High Confidence Trading**: Only execute trades with 50%+ confidence
2. **Maximum Capital Efficiency**: Use 100% of available margin
3. **Dynamic Leverage**: Automatically use maximum leverage per coin (20x-100x)
4. **Strict Risk Management**: 2% stop-loss, 6% take-profit, trailing stops
5. **Single Position Focus**: One trade at a time for maximum control
6. **24/7 Operation**: Serverless execution via Vercel Cron

---

## 💡 Trading Philosophy

### Aggressive Mode (Current)

Godspeed operates in **Aggressive Mode** to capture more trading opportunities in low-volatility markets:

| Parameter | Conservative | **Aggressive** | Reason |
|-----------|--------------|----------------|--------|
| **Min Confidence** | 55% | **50%** | Capture more opportunities |
| **RSI Oversold** | <30 | **<40** | Earlier entry on dips |
| **RSI Overbought** | >70 | **>60** | Earlier entry on peaks |
| **Volume Threshold** | 1.5x | **1.2x** | Accept more trades |
| **Trend Strength** | >0.7 | **>0.6** | Accept weaker trends |
| **Volatility Penalty** | 30% | **15%** | Less penalization |

### Why Aggressive?

- **Market Conditions**: Low volatility requires lower thresholds
- **Risk Management**: Tight stop-loss (-2%) protects capital
- **Profit Target**: 3:1 risk/reward ratio ensures profitability
- **Trailing Stops**: Protect gains on explosive moves

---

## 🏗️ Technical Architecture

### Service Layer

```typescript
// services/aiTradingService.ts
class AITradingService {
  private model: GodspeedModel;           // Analysis engine
  private isRunning: boolean;             // Trading state
  
  async start()                            // Initialize trading
  async stop()                             // Halt trading
  async runSingleCycle()                   // Execute one trading cycle
  private async runTradingCycle()          // Analyze market & select trade
  private async monitorPositions()         // Check stop-loss/take-profit
  private async executeTrade()             // Place orders
  private selectMostProfitableSignal()     // Choose best opportunity
}
```

### Model Layer

```typescript
// services/aiTradingModels.ts
export class GodspeedModel implements AITradingModel {
  async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal>
  
  private calculateRSI()                   // RSI indicator
  private getTrendStrength()               // Trend analysis
  private calculateVolatility()            // Price volatility
}
```

### Exchange Layer

```typescript
// services/asterDexService.ts
class AsterDexService {
  async getSymbols()                       // List all trading pairs
  async getTicker()                        // Get 24h price/volume data
  async getPrice()                         // Get current price
  async getAccountInfo()                   // Get balance & margin
  async getPositions()                     // Get open positions
  async placeMarketOrder()                 // Execute market order
  async setLeverage()                      // Set leverage for symbol
  async getMaxLeverage()                   // Get max leverage for coin
  async getSymbolPrecision()               // Get quantity precision
  roundQuantity()                          // Round to exchange requirements
}
```

---

## 🔍 Analysis Engine

### Market Data Collection

For each symbol, Godspeed collects:

```typescript
interface MarketData {
  currentPrice: number;          // Latest price
  previousPrice: number;         // 24h ago price
  movingAverage: number;         // Simple MA
  volume: number;                // 24h volume
  averageVolume: number;         // Average volume
  priceChange: number;           // 24h change %
  highPrice: number;             // 24h high
  lowPrice: number;              // 24h low
  openPrice: number;             // 24h open
  volatility: number;            // Price volatility
}
```

### Technical Indicators

#### 1. RSI (Relative Strength Index)

```typescript
calculateRSI(priceChange: number, volatility: number): number {
  // Normalize price change to 0-100 scale
  let rsi = 50 + (priceChange * 2);
  
  // Adjust for volatility
  if (volatility > 5) {
    const volatilityDamper = Math.min(volatility / 10, 0.3);
    rsi = rsi * (1 - volatilityDamper) + 50 * volatilityDamper;
  }
  
  return Math.max(0, Math.min(100, rsi));
}
```

**Interpretation:**
- **< 40**: Oversold (potential BUY)
- **40-60**: Neutral range
- **> 60**: Overbought (potential SELL)

#### 2. Trend Analysis

```typescript
getTrendStrength(currentPrice: number, movingAverage: number, priceChange: number) {
  const deviation = ((currentPrice - movingAverage) / movingAverage) * 100;
  const strength = Math.abs(deviation) / 5; // Normalize
  
  if (deviation > 2 && priceChange > 3) return { trend: 'STRONG_BULL', strength };
  if (deviation > 1 && priceChange > 1) return { trend: 'BULL', strength };
  if (deviation < -2 && priceChange < -3) return { trend: 'STRONG_BEAR', strength };
  if (deviation < -1 && priceChange < -1) return { trend: 'BEAR', strength };
  return { trend: 'NEUTRAL', strength: 0.3 };
}
```

#### 3. Volume Analysis

```typescript
const volumeRatio = volume / averageVolume;

const hasHighVolume = volumeRatio > 1.2;      // 20% above average
const hasVeryHighVolume = volumeRatio > 2.0;  // 100% above average
```

#### 4. Volatility Calculation

```typescript
calculateVolatility(high: number, low: number, current: number): number {
  const range = high - low;
  return (range / current) * 100;
}
```

---

## 📊 Signal Generation

### Strategy Framework

Godspeed uses 5 core strategies, evaluated in priority order:

#### **Strategy 1: High Confidence Breakout** (70%+ confidence)

```typescript
if (isOversold && hasVeryHighVolume && isBullish) {
  action = 'BUY';
  confidence = 0.70;
  reasoning = "🚀 HIGH CONFIDENCE BUY: Oversold + Very high volume...";
}
```

**Conditions:**
- RSI < 40 (oversold)
- Volume > 2x average
- Bullish trend

**Why it works:** Strong buying pressure on oversold assets = reversal

#### **Strategy 2: Mean Reversion** (62%+ confidence)

```typescript
if (isOversold && hasHighVolume && isBullish) {
  action = 'BUY';
  confidence = 0.62;
  reasoning = "💎 MEAN REVERSION BUY: Oversold with volume spike...";
}
```

**Conditions:**
- RSI < 40 or > 60
- Volume > 1.2x average
- Trend confirmation

**Why it works:** Prices revert to mean after extremes

#### **Strategy 3: Strong Trend Following** (65%+ confidence)

```typescript
if (isStrongTrend && isBullish && isBullishMomentum && hasHighVolume) {
  action = 'BUY';
  confidence = 0.65;
  reasoning = "📈 STRONG TREND: Riding bullish momentum...";
}
```

**Conditions:**
- Strong trend (>0.6 strength)
- RSI momentum aligned
- High volume confirmation

**Why it works:** Strong trends continue longer than expected

#### **Strategy 4: Moderate Trend Following** (52%+ confidence)

```typescript
if (isBullish && isBullishMomentum && volumeRatio > 1.0) {
  action = 'BUY';
  confidence = 0.52;
  reasoning = "📈 Moderate BUY: Bullish trend, RSI 60, Volume 1.2x...";
}
```

**Conditions:**
- Bullish/bearish trend
- RSI momentum
- Normal volume

**Why it works:** Sustained trends with momentum

#### **Strategy 5: Aggressive Range Trading** (51%+ confidence) - NEW

```typescript
if ((rsi < 45 || rsi > 55) && volumeRatio > 0.8) {
  if (rsi < 45 && priceChange < 0) {
    action = 'BUY';
    confidence = 0.51;
    reasoning = "🎯 RANGE BUY: RSI 43 near support, -2% pullback";
  }
}
```

**Conditions:**
- RSI 45-55 (near neutral)
- Volume > 0.8x average
- Recent price movement

**Why it works:** Captures opportunities in sideways markets

### Confidence Boosting

#### Strong Movement Boost

```typescript
if (Math.abs(priceChange) > 3) {
  const momentumBoost = Math.min(0.12, Math.abs(priceChange) / 100);
  confidence = Math.min(confidence * (1 + momentumBoost), 0.95);
}
```

**Effect:** +12% max boost for coins moving >3% in 24h

### Risk Filtering

```typescript
// Reject low confidence
if (confidence < 0.35) {
  action = 'HOLD';
  reasoning = "🛑 REJECTED: Confidence too low";
}

// Penalize high volatility
if (volatility >= 10) {
  confidence *= 0.85; // -15% confidence
  reasoning += " [High volatility warning]";
}
```

---

## 🛡️ Risk Management

### Position Sizing

**100% Margin Utilization:**

```typescript
const allocationPercent = 1.0;  // 100% of available margin
const marginToUse = availableBalance * allocationPercent;
const positionValue = marginToUse * maxLeverage;
const quantity = positionValue / currentPrice;
```

**Example:**
- Available Balance: $50
- Max Leverage: 20x
- Price: $1000
- → Position Size: $50 × 20 = $1000
- → Quantity: $1000 / $1000 = 1.0

### Stop-Loss Logic

**Triggers at -2% ROE:**

```typescript
const roePnlPercent = (unrealizedPnl / marginUsed) * 100;

if (roePnlPercent <= -2.0) {
  shouldClose = true;
  reason = "🛑 STOP-LOSS: ROE down -2.15%";
}
```

**Why -2%?**
- Cuts losses quickly
- With 20x leverage, -2% ROE = -0.1% price move
- Prevents margin calls

### Take-Profit Logic

**Triggers at +6% ROE:**

```typescript
if (roePnlPercent >= 6.0) {
  shouldClose = true;
  reason = "💰 TAKE-PROFIT: ROE up +6.23%";
}
```

**Why +6%?**
- 3:1 risk/reward ratio (risk 2%, gain 6%)
- Ensures long-term profitability
- Even with 50% win rate, system is profitable

### Trailing Stop Logic

**Triggers at +4% ROE (after hitting +8%):**

```typescript
if (roePnlPercent >= 4.0 && unrealizedPnl > (marginUsed * 0.08)) {
  shouldClose = true;
  reason = "📈 TRAILING STOP: Securing profits at ROE +4.56%";
}
```

**Why trailing?**
- Protects gains on explosive moves
- Lets winners run past +6%
- Locks in minimum +4% if it drops back

### ROE Calculation

**ROE (Return on Equity) = Actual profit/loss on margin:**

```typescript
const positionValue = size * entryPrice;
const marginUsed = positionValue / leverage;
const roePnlPercent = (unrealizedPnl / marginUsed) * 100;
```

**Example:**
- Entry: 1.0 BTC @ $50,000, 20x leverage
- Position Value: $50,000
- Margin Used: $50,000 / 20 = $2,500
- Current: $51,000
- Unrealized P&L: $1,000
- **ROE: ($1,000 / $2,500) × 100 = +40%** ✅ Take-profit triggered!

---

## ⚡ Trade Execution

### Pre-Execution Checks

```typescript
// 1. Check available balance
const accountInfo = await asterDexService.getAccountInfo();
if (accountInfo.availableBalance <= 0) return;

// 2. Get current price
const currentPrice = await asterDexService.getPrice(symbol);
if (currentPrice <= 0) return;

// 3. Get max leverage for this coin
const maxLeverage = await asterDexService.getMaxLeverage(symbol);

// 4. Calculate position size
const marginToUse = availableBalance * 1.0; // 100%
const positionValue = marginToUse * maxLeverage;
let quantity = positionValue / currentPrice;

// 5. Round quantity to exchange precision
const precisionInfo = await asterDexService.getSymbolPrecision(symbol);
quantity = asterDexService.roundQuantity(quantity, precisionInfo.quantityPrecision);
```

### Order Placement

```typescript
// 1. Set leverage BEFORE placing order (Aster DEX requirement)
await asterDexService.setLeverage(symbol, maxLeverage);

// 2. Place market order
const order = await asterDexService.placeMarketOrder(
  symbol,
  signal.action, // 'BUY' or 'SELL'
  quantity,
  maxLeverage,
  false // reduceOnly = false (opening position)
);
```

### Post-Execution Actions

```typescript
if (order) {
  // 1. Save trade entry to database
  const tradeRecord = {
    id: `trade-${order.orderId}-${Date.now()}`,
    symbol,
    side: signal.action,
    entryPrice: currentPrice,
    size: quantity,
    leverage: maxLeverage,
    pnl: 0,
    status: 'open',
    model: 'Godspeed',
    confidence: signal.confidence,
    reasoning: signal.reasoning,
  };
  await fetch('/api/trades', { method: 'POST', body: JSON.stringify(tradeRecord) });
  
  // 2. Send decision to Model Chat
  const messagePayload = {
    model: 'Godspeed',
    type: 'trade',
    message: `🚀 ${signal.action} ${symbol}\n💰 ${maxLeverage}x Leverage...\n📊 REASONING:\n${signal.reasoning}`,
  };
  await fetch('/api/model-message', { method: 'POST', body: JSON.stringify(messagePayload) });
}
```

---

## 📈 Position Monitoring

### Monitoring Loop

**Runs every minute via Vercel Cron:**

```typescript
async monitorPositions() {
  const positions = await asterDexService.getPositions();
  
  for (const position of positions) {
    const currentPrice = await asterDexService.getPrice(position.symbol);
    const roePnlPercent = (position.unrealizedPnl / marginUsed) * 100;
    
    // Check exit conditions
    if (roePnlPercent <= -2.0) {
      // Stop-loss
      await this.closePosition(position, 'STOP-LOSS');
    }
    else if (roePnlPercent >= 6.0) {
      // Take-profit
      await this.closePosition(position, 'TAKE-PROFIT');
    }
    else if (roePnlPercent >= 4.0 && position.unrealizedPnl > (marginUsed * 0.08)) {
      // Trailing stop
      await this.closePosition(position, 'TRAILING STOP');
    }
  }
}
```

### Position Closing

```typescript
private async closePosition(position: AsterPosition, reason: string) {
  // 1. Place opposite order to close
  const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
  const closeOrder = await asterDexService.placeMarketOrder(
    position.symbol,
    closeSide,
    position.size,
    position.leverage,
    true // reduceOnly = true (closing position)
  );
  
  // 2. Save completed trade
  const completedTrade = {
    id: `trade-close-${closeOrder.orderId}-${Date.now()}`,
    symbol: position.symbol,
    side: position.side === 'LONG' ? 'BUY' : 'SELL',
    entryPrice: position.entryPrice,
    exitPrice: currentPrice,
    size: position.size,
    pnl: position.unrealizedPnl,
    status: 'completed',
    exitReason: reason,
  };
  await fetch('/api/trades', { method: 'POST', body: JSON.stringify(completedTrade) });
  
  // 3. Send close message to chat
  const messagePayload = {
    model: 'Godspeed',
    type: 'trade',
    message: `${position.unrealizedPnl >= 0 ? '💚' : '❤️'} CLOSED ${position.symbol}\n💰 P&L: ${position.unrealizedPnl.toFixed(2)}\n🚨 REASON: ${reason}`,
  };
  await fetch('/api/model-message', { method: 'POST', body: JSON.stringify(messagePayload) });
}
```

---

## 🚀 Performance Optimization

### 1. Symbol Filtering

**Only analyze top 50 coins by volume:**

```typescript
const allSymbols = await asterDexService.getSymbols();
const symbolsToAnalyze = allSymbols.slice(0, 50);
```

**Benefit:** Reduces analysis time from ~300s to ~45s

### 2. API Caching

```typescript
// services/apiCache.ts
const cache = new Map<string, { data: any, expiry: number }>();

set(key: string, value: any, ttlSeconds: number) {
  cache.set(key, { data: value, expiry: Date.now() + (ttlSeconds * 1000) });
}

get<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiry) return undefined;
  return entry.data as T;
}
```

**Cache TTLs:**
- Account Info: 1 second
- Positions: 10 seconds
- Symbol Precision: 1 hour
- Ticker Data: 5 seconds

### 3. Rate Limiting

```typescript
private lastRequestTime = 0;
private readonly MIN_REQUEST_DELAY = 100; // ms

private async rateLimitDelay() {
  const now = Date.now();
  const timeSinceLastRequest = now - this.lastRequestTime;
  if (timeSinceLastRequest < this.MIN_REQUEST_DELAY) {
    await new Promise(resolve => 
      setTimeout(resolve, this.MIN_REQUEST_DELAY - timeSinceLastRequest)
    );
  }
  this.lastRequestTime = Date.now();
}
```

### 4. Parallel Processing

```typescript
// Fetch ticker data in parallel
const tickerPromises = symbolsToAnalyze.map(symbol => 
  asterDexService.getTicker(symbol)
);
const tickers = await Promise.allSettled(tickerPromises);
```

### 5. Early Termination

```typescript
const MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes
const startTime = Date.now();

for (const symbol of symbols) {
  if (Date.now() - startTime > MAX_EXECUTION_TIME) {
    logger.warn('⚠️ MAX EXECUTION TIME REACHED');
    break;
  }
  // ... analyze symbol
}
```

**Benefit:** Prevents Vercel timeout (5 min limit)

---

## ⚙️ Configuration Reference

### Trading Parameters

| Parameter | Value | Location | Description |
|-----------|-------|----------|-------------|
| `allocationPercent` | 1.0 (100%) | `aiTradingService.ts:465` | Margin usage per trade |
| `MIN_CONFIDENCE` | 0.50 | `aiTradingService.ts:369` | Minimum signal confidence |
| `STOP_LOSS_ROE` | -2.0% | `aiTradingService.ts:290` | Stop-loss threshold |
| `TAKE_PROFIT_ROE` | +6.0% | `aiTradingService.ts:295` | Take-profit threshold |
| `TRAILING_STOP_ROE` | +4.0% | `aiTradingService.ts:300` | Trailing stop after +8% |
| `MAX_SYMBOLS` | 50 | `aiTradingService.ts:73` | Coins to analyze per cycle |
| `MAX_EXECUTION_TIME` | 4.5 min | `aiTradingService.ts:70` | Timeout protection |

### Model Parameters

| Parameter | Value | Location | Description |
|-----------|-------|----------|-------------|
| `RSI_OVERSOLD` | 40 | `aiTradingModels.ts:68` | Oversold threshold |
| `RSI_OVERBOUGHT` | 60 | `aiTradingModels.ts:69` | Overbought threshold |
| `HIGH_VOLUME` | 1.2x | `aiTradingModels.ts:74` | Volume spike detection |
| `VERY_HIGH_VOLUME` | 2.0x | `aiTradingModels.ts:75` | Strong volume spike |
| `STRONG_TREND` | 0.6 | `aiTradingModels.ts:78` | Trend strength threshold |
| `HIGH_VOLATILITY` | 10 | `aiTradingModels.ts:84` | Volatility filter |
| `VOLATILITY_PENALTY` | 0.85 (15%) | `aiTradingModels.ts:206` | High vol confidence reduction |

### API Optimization

| Parameter | Value | Location | Description |
|-----------|-------|----------|-------------|
| `MIN_REQUEST_DELAY` | 100ms | `asterDexService.ts:52` | Rate limit delay |
| `MAX_REQUESTS_PER_MINUTE` | 300 | `asterDexService.ts:53` | Rate limit cap |
| `ACCOUNT_INFO_TTL` | 1s | `asterDexService.ts:1004` | Account cache |
| `POSITIONS_TTL` | 10s | `apiCache.ts:35` | Positions cache |
| `TICKER_TTL` | 5s | `apiCache.ts:36` | Ticker cache |

---

## 📞 Support

For technical questions or issues:

- See [README.md](README.md) for general documentation
- See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment guides
- Open an issue on GitHub for bugs or feature requests

---

**Built with precision and powered by faith** 🙏✨

**May Godspeed trade profitably! In Jesus' name, Amen!**

