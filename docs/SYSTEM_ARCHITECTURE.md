# System Architecture

## Overview

Manna is an **AI-powered automated cryptocurrency trading system** that uses DeepSeek R1 for intelligent trade analysis and execution on Aster DEX.

**CRITICAL:** This system uses **ONLY Aster DEX API** for all market data and trading operations. No external APIs (CoinGecko, Binance, etc.) are used to ensure price accuracy and eliminate external dependencies.

```
┌─────────────────────────────────────────────────────────────┐
│                     MANNA TRADING SYSTEM                     │
│                   Enterprise MVP Architecture                │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Web Frontend   │────▶│   Next.js API    │────▶│  Aster DEX API   │
│   (React/Next)   │     │   (Server-Side)  │     │  (30-Key Pool)   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │                          │
         │                        │                          │
         ▼                        ▼                          ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  State Manager   │     │  Service Layer   │     │  PostgreSQL DB   │
│   (Zustand)      │     │  - Agent Runner  │     │   (Neon.tech)    │
└──────────────────┘     │  - Real Balance  │     └──────────────────┘
                         │  - Pos. Monitor  │
                         └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │  DeepSeek R1 AI  │
                         │   (Ollama)       │
                         └──────────────────┘
```

---

## Core Components

### 1. Frontend Layer

**Technology:** Next.js 14 + React + TypeScript + Tailwind CSS

**Components:**
- `NOF1Dashboard.tsx` - Main trading dashboard
- `InteractiveChart.tsx` - Real-time balance chart
- `EnhancedAIChat.tsx` - AI agent thoughts display
- `PriceTicker.tsx` - Live crypto prices
- `TradingPanel.tsx` - Trade execution interface

**Features:**
- Real-time updates (30-second polling)
- Responsive design
- Circuit breaker pattern for API resilience
- Multi-layer caching (client + server)

---

### 2. API Layer

**Technology:** Next.js API Routes

**Key Endpoints:**
- `/api/startup` - System initialization & status
- `/api/aster/account` - Account balance & info
- `/api/aster/positions` - Open positions
- `/api/prices` - Real-time price data
- `/api/agent-insights` - AI agent thoughts
- `/api/real-balance` - Balance for charts

**Architecture Pattern:**
- Rate limiting (30-key pool: 600 req/sec)
- Request deduplication
- Circuit breakers (3-strike pattern)
- Timeout protection (configurable)
- Error handling & retry logic

---

### 3. Service Layer

#### 3.1 Agent Runner Service

**File:** `services/agentRunnerService.ts`

**Purpose:** 24/7 automated trading orchestration

**Process:**
```
Every 60 seconds:
1. Scan markets for opportunities
2. Filter by confidence threshold (35%)
3. Create workflows for top opportunities
4. Monitor workflow execution
5. Log results
```

**Configuration:**
- Max concurrent workflows: 3
- Cycle interval: 60 seconds
- Confidence threshold: 35%

#### 3.2 Market Scanner Service

**File:** `services/marketScannerService.ts`

**Purpose:** Identify trading opportunities

**Process:**
1. Fetch all symbols from Aster DEX
2. Get 24-hour ticker data
3. Calculate confidence scores (momentum + volatility)
4. Filter by blacklist & thresholds
5. Return top opportunities sorted by score

#### 3.3 Agent Coordinator Service

**File:** `services/agentCoordinator.ts`

**Purpose:** Multi-agent AI orchestration

**Workflow:**
```
Symbol: ASTER/USDT
  ↓
[1] Market Data Collector
    → Fetch OHLCV, orderbook, volume
  ↓
[2] Technical Analyst (DeepSeek R1)
    → Analyze RSI, MACD, volume, support/resistance
    → Recommend: BUY/SELL/HOLD
  ↓
[3] Chief Analyst (DeepSeek R1)
    → Review technical analysis
    → Make final decision
    → Output: Action + confidence
  ↓
[4] Risk Manager (DeepSeek R1)
    → Calculate position size
    → Verify risk limits
    → Set stop-loss & take-profit
    → Approve/reject trade
  ↓
[5] Execution Specialist
    → If approved: Place order on Aster DEX
    → Monitor order status
    → Log execution
```

#### 3.4 Real Balance Service

**File:** `services/realBalanceService.ts`

**Purpose:** Track account balance in real-time

**Features:**
- Fetches balance every 30 seconds
- Caches for performance
- Provides data for charts & dashboard
- Updates P&L calculations

#### 3.5 Position Monitor Service

**File:** `services/positionMonitorService.ts`

**Purpose:** Track open positions & P&L

**Features:**
- Monitors all open positions
- Tracks stop-loss & take-profit levels
- Calculates unrealized P&L
- Alerts on position changes

---

### 4. AI Engine (DeepSeek R1)

**Technology:** Ollama + DeepSeek R1 (14B parameters)

**Model:** `deepseek-r1:14b`

**Why DeepSeek R1?**
- Chain-of-Thought reasoning (thinks through problems)
- Excellent for complex analysis
- Local execution (no API costs)
- Fast inference with proper prewarming

**Integration:**
- `services/deepseekService.ts` - Core AI service
- `lib/agentPromptsOptimized.ts` - Optimized prompts
- Timeout protection (60 seconds)
- JSON output parsing
- Error handling & retries

**Usage:**
```typescript
const analysis = await deepseekService.chat(
  technicalAnalystPrompt,
  marketData,
  {
    format: 'json',
    temperature: 0.6,
    max_tokens: 2000
  }
);
```

---

### 5. Exchange Integration (Aster DEX)

**Technology:** RESTful API + HMAC SHA256 Authentication

**File:** `services/asterDexService.ts`

**Features:**

1. **30-Key Load Balancing**
   - 600 req/sec total capacity (20 req/sec × 30 keys)
   - "Least-used" strategy
   - Automatic failover

2. **Request Management**
   - Rate limiting per key
   - Request deduplication
   - Caching (configurable TTL)
   - Timeout protection

3. **API Operations**
   - Account info
   - Position management
   - Order placement (MARKET/LIMIT)
   - Price data & tickers
   - Trade history

**Key Manager:**
```typescript
// lib/apiKeyManager.ts
- loadKeysFromEnvironment() - Load 30 keys from .env.local
- getNextKey() - Select least-used healthy key
- recordSuccess/Error() - Track key health
- healthChecks() - Monitor key status every 60s
```

---

### 6. Data Layer

**Technology:** PostgreSQL (Neon.tech serverless)

**Tables:**
- `trading_opportunities` - Market scan results
- `open_positions` - Active trades
- `trade_history` - Completed trades
- `agent_thoughts` - AI analysis logs
- `system_logs` - Application logs

**ORM:** Neon Serverless Driver (direct SQL)

**Features:**
- Serverless auto-scaling
- Connection pooling (30 connections)
- SSL encryption
- Automatic backups

---

## Data Flow

### Trading Cycle (60 seconds)

```
T+0s:  Agent Runner starts cycle
T+5s:  Market Scanner fetches 337 symbols from Aster DEX
T+10s: Calculate confidence scores for all symbols
T+15s: Filter & sort top opportunities
T+20s: Create workflows for top 3 opportunities
       (or fewer if < 3 meet threshold)

Per Workflow (2-5 minutes):
T+0s:  Collect market data (OHLCV, orderbook, volume)
T+30s: Technical Analyst (DeepSeek R1) analyzes
T+90s: Chief Analyst (DeepSeek R1) decides
T+150s: Risk Manager (DeepSeek R1) approves
T+180s: Execution Specialist places order
T+185s: Workflow complete, log results

Next Cycle:
T+60s: Repeat from T+0s
```

### Balance Update (30 seconds)

```
Every 30 seconds:
1. Real Balance Service fetches account data
2. Cache result (30-second TTL)
3. Update frontend chart
4. Calculate P&L for open positions
```

---

## Configuration

### Environment Variables

**File:** `.env.local`

**Required:**
```bash
# Aster DEX (Single key fallback)
ASTER_API_KEY=your_key
ASTER_SECRET_KEY=your_secret

# Multi-Key Pool (30 keys)
ASTER_KEY_POOL={"keys":[...]}
USE_MULTI_KEY_API=true

# Database
DATABASE_URL=postgresql://...

# AI Model
DEEPSEEK_MODEL=deepseek-r1:14b
```

**Optional:**
```bash
# Trading Configuration
TRADING_CONFIDENCE_THRESHOLD=0.35
TRADING_STOP_LOSS=4.0
TRADING_TAKE_PROFIT=12.0
MAX_CONCURRENT_WORKFLOWS=3

# Performance Tuning
RATE_LIMIT_PER_KEY_RPS=20
API_KEY_STRATEGY=least-used
```

---

## Security

### API Key Management

- Keys stored in `.env.local` (not committed to git)
- Multi-key rotation prevents rate limiting
- Automatic key health checks
- Keys never exposed to client-side

### Authentication

- HMAC SHA256 signatures for Aster DEX
- Timestamp validation
- Query parameter signing
- No keys in URLs or logs

### Data Protection

- PostgreSQL SSL encryption
- Environment variable isolation
- No sensitive data in frontend
- Secure WebSocket connections

---

## Performance Optimizations

### Caching Strategy

**Level 1: In-Memory Cache**
- Exchange info: 5 minutes
- Order book: 2 seconds
- Balance: 30 seconds

**Level 2: Request Deduplication**
- Concurrent identical requests share result
- Prevents API spam
- Reduces latency

**Level 3: Circuit Breakers**
- 3-strike pattern
- 5-minute cooldown
- Prevents cascading failures

### Multi-Key Architecture

**Before (Single Key):**
- 20 req/sec → bottleneck
- Account API: 308 seconds
- Live chart: broken

**After (30 Keys):**
- 600 req/sec → no bottleneck
- Account API: 3 seconds
- All systems operational

---

## Scalability

### Current Capacity

- **API throughput:** 600 req/sec
- **Concurrent workflows:** 3
- **Concurrent positions:** 2 (max)
- **Database connections:** 30
- **Trading cycles:** 60/min

### Scaling Options

1. **Horizontal Scaling**
   - Add more API keys (currently 30, can add more)
   - Increase concurrent workflows (currently 3)
   - Deploy multiple instances

2. **Vertical Scaling**
   - Increase DeepSeek model size (14B → 32B)
   - Allocate more RAM for model
   - Faster CPU for inference

3. **Database Scaling**
   - Neon auto-scales automatically
   - Connection pooling handles load
   - Read replicas for analytics

---

## Monitoring & Logging

### Log Levels

- **ERROR** - Critical failures
- **WARN** - Warnings & degraded performance
- **INFO** - Normal operations
- **DEBUG** - Detailed debugging info

### Key Metrics

- Agent Runner cycles per minute
- Workflow completion rate
- API response times
- Balance accuracy
- Trade execution success rate

### Health Checks

- `/api/health` - Server health
- `/api/startup?action=status` - Service status
- `diagnose_trading.ps1` - Full diagnostic

---

All glory to God for this architecture! 🙏

