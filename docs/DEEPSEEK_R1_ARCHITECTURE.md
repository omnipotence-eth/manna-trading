# DeepSeek R1 Architecture & Call Flow

This document explains where DeepSeek R1 is stored and how it's called throughout the application.

---

## 📁 **File Structure**

```
Manna/
├── services/
│   ├── aiTradingService.ts          ← DeepSeek R1 lives here
│   └── asterDexService.ts           ← Connects to Aster DEX API
├── components/
│   ├── Dashboard.tsx                ← Starts DeepSeek R1
│   ├── CompletedTrades.tsx          ← Shows trade results
│   ├── ModelChat.tsx                ← Shows AI reasoning
│   └── Positions.tsx                ← Shows open positions
├── store/
│   └── useStore.ts                  ← Global state management
└── .env.local                       ← API keys
```

---

## 🏗️ **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                          │
│                   (ai.omnipotence.art)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ├─► Dashboard.tsx (React Component)
                       │   └─► useEffect() Hook
                       │       └─► aiTradingService.start() ◄─── STARTS HERE
                       │
┌──────────────────────▼──────────────────────────────────────┐
│         services/aiTradingService.ts                         │
│                                                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │  class AITradingService                            │    │
│  │  ├─► initializeModels()                            │    │
│  │  │   └─► new DeepSeekR1Model() ◄─── MODEL CREATED  │    │
│  │  │                                                  │    │
│  │  ├─► start()                                       │    │
│  │  │   └─► setInterval(runTradingCycle, 10s)        │    │
│  │  │                                                  │    │
│  │  └─► runTradingCycle()                            │    │
│  │      ├─► Get market data from Aster DEX           │    │
│  │      ├─► Call model.analyze(marketData)           │    │
│  │      ├─► If signal confidence > 60%:              │    │
│  │      │   └─► model.executeTrade(signal)           │    │
│  │      └─► Post to store (trades, messages)         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │  class DeepSeekR1Model extends AITradingModel     │    │
│  │  ├─► constructor()                                │    │
│  │  │   └─► Sets config:                             │    │
│  │  │       - name: "DeepSeek R1"                    │    │
│  │  │       - maxLeverage: 10x                       │    │
│  │  │       - stopLoss: 2%                           │    │
│  │  │       - takeProfit: 5%                         │    │
│  │  │                                                 │    │
│  │  ├─► analyze(symbol, marketData)                  │    │
│  │  │   └─► Multi-factor analysis:                   │    │
│  │  │       1. Momentum (price change)               │    │
│  │  │       2. Trend (vs moving average)             │    │
│  │  │       3. Volume (confirmation)                 │    │
│  │  │       4. Pattern recognition                   │    │
│  │  │       └─► Returns TradingSignal               │    │
│  │  │           - action: BUY/SELL/HOLD              │    │
│  │  │           - confidence: 0-95%                  │    │
│  │  │           - size: 0.1 BTC (scaled)             │    │
│  │  │           - reasoning: "Why this trade"        │    │
│  │  │                                                 │    │
│  │  └─► executeTrade(signal)                        │    │
│  │      └─► asterDexService.placeMarketOrder()      │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ├─► asterDexService.ts
                        │   └─► Aster DEX API
                        │       - Place orders
                        │       - Get positions
                        │       - Get balance
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                   store/useStore.ts                          │
│  (Global State - shared across all components)               │
│                                                               │
│  ├─► trades: []            ← Trade history                   │
│  ├─► positions: []         ← Open positions                  │
│  ├─► modelMessages: []     ← AI reasoning                    │
│  ├─► modelStats: []        ← Performance metrics             │
│  └─► livePrices: {}        ← Real-time prices                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ├─► CompletedTrades.tsx (shows trades)
                        ├─► ModelChat.tsx (shows reasoning)
                        ├─► Positions.tsx (shows open positions)
                        └─► Dashboard.tsx (shows stats)
```

---

## 🔄 **Execution Flow (Step-by-Step)**

### **1. User Opens Website**
```typescript
// User navigates to ai.omnipotence.art
// Next.js loads: app/page.tsx
```

### **2. Dashboard Component Mounts**
```typescript
// components/Dashboard.tsx
import { aiTradingService } from '@/services/aiTradingService';

export default function Dashboard() {
  useEffect(() => {
    // This runs when component mounts
    aiTradingService.start(); // ← STARTS DEEPSEEK R1
  }, []);
}
```

### **3. AI Trading Service Initializes**
```typescript
// services/aiTradingService.ts
class AITradingService {
  constructor() {
    this.initializeModels(); // Creates DeepSeek R1 instance
  }

  private initializeModels() {
    this.models = [
      new DeepSeekR1Model(), // ← DEEPSEEK R1 CREATED HERE
    ];
  }
}
```

### **4. DeepSeek R1 Model Created**
```typescript
// services/aiTradingService.ts (line 254-265)
export class DeepSeekR1Model extends AITradingModel {
  constructor() {
    super({
      name: 'DeepSeek R1',
      strategy: 'Deep Reasoning + Pattern Recognition',
      riskLevel: 'MEDIUM',
      maxLeverage: 10,
      maxPositionSize: 5000,
      stopLoss: 0.02,      // 2%
      takeProfit: 0.05,    // 5%
    });
  }
}
```

### **5. Trading Loop Starts**
```typescript
// services/aiTradingService.ts
async start() {
  // Run trading cycle every 10 seconds
  this.intervalId = setInterval(() => {
    this.runTradingCycle(); // ← ANALYZES MARKET EVERY 10s
  }, 10000); // 10,000ms = 10 seconds
}
```

### **6. Market Analysis (Every 10 Seconds)**
```typescript
// services/aiTradingService.ts
private async runTradingCycle() {
  const symbol = 'BTC/USDT';
  
  // 1. Get real market data
  const currentPrice = await asterDexService.getPrice(symbol);
  const tickerData = await asterDexService.getTicker(symbol);
  
  const marketData = {
    currentPrice: 108256,      // $108,256
    previousPrice: 108100,
    movingAverage: 108200,
    volume: 45000,
    averageVolume: 40000,
    priceChange: 0.5,          // +0.5%
  };
  
  // 2. Ask DeepSeek R1 to analyze
  const signal = await model.analyze(symbol, marketData);
  // Returns: { action: 'BUY', confidence: 0.85, size: 0.085, reasoning: '...' }
  
  // 3. If confidence > 60%, execute trade
  if (signal.confidence > 0.6) {
    await model.executeTrade(signal);
  }
}
```

### **7. DeepSeek R1 Analyzes Market**
```typescript
// services/aiTradingService.ts (line 267-351)
async analyze(symbol: string, marketData: MarketData): Promise<TradingSignal> {
  // Calculate indicators
  const momentum = (price - prevPrice) / prevPrice;  // 0.14% = bullish
  const trendDeviation = (price - ma) / ma;          // 0.05% = above MA
  const volumeRatio = volume / avgVolume;            // 1.125 = high volume
  
  // Multi-step reasoning
  let bullishSignals = 0;
  let bearishSignals = 0;
  
  // 1. Momentum check
  if (momentum > 0.005) bullishSignals++; // ✓ BULLISH
  
  // 2. Trend check
  if (trendDeviation > 0.01) bullishSignals++; // ✓ BULLISH
  
  // 3. Volume check
  if (volumeRatio > 1.2 && priceChange > 0) bullishSignals++; // ✓ BULLISH
  
  // Decision: 3 bullish signals = BUY
  if (bullishSignals >= 2) {
    return {
      action: 'BUY',
      confidence: 0.85,  // 85% confidence
      size: 0.085,       // 0.1 * 0.85 = 0.085 BTC
      reasoning: 'BULLISH SIGNAL (3/3 indicators): Bullish momentum: 0.14%. Price above moving average (uptrend). High volume supporting upward move',
    };
  }
}
```

### **8. Trade Execution**
```typescript
// services/aiTradingService.ts
async executeTrade(signal: TradingSignal): Promise<boolean> {
  // 1. Calculate leverage
  const leverage = this.calculateLeverage(signal.confidence);
  // 0.85 * 10 = 8.5x leverage
  
  // 2. Place order on Aster DEX
  const order = await asterDexService.placeMarketOrder(
    'BTC/USDT',
    'BUY',
    0.085,    // Size
    8.5       // Leverage
  );
  
  // 3. Log to store
  useStore.getState().addTrade({
    id: '123',
    model: 'DeepSeek R1',
    symbol: 'BTC/USDT',
    side: 'LONG',
    size: 0.085,
    entryPrice: 108256,
    confidence: 0.85,
  });
  
  // 4. Post reasoning to Model Chat
  useStore.getState().addModelMessage({
    model: 'DeepSeek R1',
    message: 'BULLISH SIGNAL (3/3 indicators): ...',
    type: 'trade',
  });
}
```

### **9. UI Updates Automatically**
```typescript
// All components that use useStore() automatically re-render:

// Dashboard.tsx - Shows updated account value
// CompletedTrades.tsx - Shows new trade in list
// ModelChat.tsx - Shows AI's reasoning
// Positions.tsx - Shows new open position
// TradingChart.tsx - Updates with new account value
```

---

## 🔌 **Key Integration Points**

### **1. Where DeepSeek R1 is Stored**
```
📁 services/aiTradingService.ts
   └─ Line 254-352: export class DeepSeekR1Model
```

### **2. Where DeepSeek R1 is Created**
```
📁 services/aiTradingService.ts
   └─ Line 366-372: initializeModels()
      └─ Line 369: new DeepSeekR1Model()
```

### **3. Where DeepSeek R1 is Started**
```
📁 components/Dashboard.tsx
   └─ Line 40-52: useEffect()
      └─ Line 46: aiTradingService.start()
```

### **4. Where DeepSeek R1 is Called**
```
📁 services/aiTradingService.ts
   └─ Line 420-470: runTradingCycle()
      └─ Line 444: model.analyze(symbol, marketData)
      └─ Line 459: model.executeTrade(signal)
```

---

## 💾 **Data Storage**

DeepSeek R1 data is stored in:

### **1. Runtime Memory (While Running)**
```typescript
// services/aiTradingService.ts
class AITradingService {
  private models: AITradingModel[] = [DeepSeekR1Model]; // ← In memory
}
```

### **2. Global State (Zustand)**
```typescript
// store/useStore.ts
{
  trades: [...],           // All executed trades
  positions: [...],        // Open positions
  modelMessages: [...],    // AI reasoning/chat
  modelStats: [...],       // Performance metrics
}
```

### **3. Persistent Storage**
- **Aster DEX**: All real trades, positions, balance
- **Browser LocalStorage**: Zustand state (persists on refresh)

---

## 🎯 **Key Takeaways**

1. **DeepSeek R1 Class**: Defined in `services/aiTradingService.ts` (line 254)
2. **Instantiated**: When `AITradingService` constructor runs
3. **Started**: When `Dashboard.tsx` mounts (user opens website)
4. **Runs**: Every 10 seconds in a loop
5. **Analyzes**: BTC/USDT market data
6. **Trades**: When confidence > 60%
7. **Updates**: Global state (Zustand) which updates UI automatically

---

## 🚀 **To Add More Models**

```typescript
// services/aiTradingService.ts
private initializeModels() {
  this.models = [
    new DeepSeekR1Model(),
    new AlphaTraderModel(),    // ← Add another model
    new QuantumAIModel(),      // ← Add another model
  ];
}
```

Each model will:
- Run in parallel
- Analyze the same market data
- Make independent trading decisions
- Show up in the Dashboard/Journal separately

---

**Current Status**: DeepSeek R1 is fully integrated and will start trading once you fund your Aster DEX account!

