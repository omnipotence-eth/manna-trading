# 📚 API Documentation

**Manna LLM Aster Crypto Trader v7.1.0**

Complete reference for all REST API endpoints.

---

## 📋 Table of Contents

- [Authentication](#authentication)
- [Core Endpoints](#core-endpoints)
- [Health & Diagnostics](#health--diagnostics)
- [Trading Endpoints](#trading-endpoints)
- [Export & Audit](#export--audit)
- [Market Data Endpoints](#market-data-endpoints)
- [AI/ML Endpoints](#aiml-endpoints)
- [Public API & Backtest](#public-api--backtest)
- [WebSocket Streams](#websocket-streams)
- [Error Handling](#error-handling)

---

## 🔐 Authentication

All internal API endpoints are designed for server-to-server communication. Client-side requests go through Next.js API routes which handle authentication internally.

For Aster DEX API calls, authentication uses HMAC-SHA256 signatures:

```typescript
// Signature generation (handled by lib/asterAuth.ts)
const signature = crypto
  .createHmac('sha256', secretKey)
  .update(queryString)
  .digest('hex');
```

---

## 🎯 Core Endpoints

### POST /api/startup

Initialize all trading services.

**Request:**
```bash
curl -X POST http://localhost:3000/api/startup
```

**Response:**
```json
{
  "success": true,
  "message": "All services started successfully",
  "services": {
    "agentRunner": { "status": "running", "interval": 60000 },
    "positionMonitor": { "status": "running", "positions": 0 },
    "websocket": { "status": "connected", "symbols": 3 },
    "healthMonitor": { "status": "active" }
  },
  "timestamp": 1701648000000
}
```

---

### GET /api/trading-status

Get current trading system status.

**Request:**
```bash
curl http://localhost:3000/api/trading-status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "agentRunner": {
      "isRunning": true,
      "currentCycle": 42,
      "lastCycleTime": 1701648000000,
      "symbolsAnalyzed": 100,
      "workflowsCompleted": 156
    },
    "positionMonitor": {
      "isMonitoring": true,
      "openPositions": 2,
      "totalPnL": 12.45
    },
    "websocket": {
      "connected": true,
      "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
      "lastUpdate": 1701648000000
    },
    "account": {
      "balance": 156.78,
      "availableBalance": 134.56,
      "unrealizedPnL": 4.32
    }
  }
}
```

---

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1701648000000,
  "services": {
    "database": "connected",
    "ollama": "available",
    "asterDex": "connected",
    "websocket": "connected"
  }
}
```

---

### GET /api/health/detailed

Detailed health status with metrics.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 86400000,
  "memory": {
    "used": 256000000,
    "total": 512000000,
    "percent": 50
  },
  "services": {
    "database": {
      "status": "connected",
      "latency": 15,
      "connections": 5
    },
    "ollama": {
      "status": "available",
      "model": "deepseek-r1:8b",
      "latency": 120
    },
    "asterDex": {
      "status": "connected",
      "rateLimit": {
        "used": 450,
        "limit": 2400
      }
    }
  }
}
```

---

## 🏥 Health & Diagnostics

### GET /api/health/ready

Readiness check: env and critical services. Returns `ready`, `missing[]`, `warnings[]`, and per-check status. Safe when config is incomplete.

**Response:**
```json
{
  "ready": true,
  "timestamp": "2025-02-28T12:00:00.000Z",
  "missing": [],
  "warnings": [],
  "checks": {
    "aster": true,
    "llm": true,
    "database": true
  }
}
```

---

### GET /api/diagnostics/why-no-trades

Why no trades? Runner status, last cycle diagnostic, and strategy summary (for dashboard “Why no trades?” block).

**Response:**
```json
{
  "ok": true,
  "runner": {
    "isRunning": true,
    "activeWorkflowCount": 0,
    "config": { "intervalMinutes": 2, "enabled": true, "symbolsCount": 25 }
  },
  "lastCycleDiagnostic": {
    "at": "2025-02-28T12:00:00.000Z",
    "totalOpportunities": 5,
    "afterScoreFilter": 2,
    "afterConfidenceFilter": 0,
    "hadOpportunities": false,
    "reason": "All opportunities filtered out",
    "minScoreUsed": 50,
    "confidenceThresholdUsed": 0.7
  },
  "strategySummary": {
    "simulationMode": true,
    "paperPreset": "balanced",
    "minOpportunityScore": 50,
    "confidenceThreshold": 0.7,
    "maxConcurrentWorkflows": 2,
    "maxDailyLossPercent": 10,
    "maxDailyLossUsd": 0
  },
  "message": "No trade: All opportunities filtered out (score/confidence thresholds: 50/70%)."
}
```

---

### GET /api/audit-events

Recent audit events (runner/execution: no_opportunities, opportunities_found, circuit_breaker_triggered).

**Query Parameters:**
- `limit` (optional): Max events (default: 50, max: 200)
- `type` (optional): Filter by type

**Response:**
```json
{
  "success": true,
  "events": [
    {
      "id": "audit_1701648000_abc123",
      "at": "2025-02-28T12:00:00.000Z",
      "type": "no_opportunities",
      "source": "agent_runner",
      "payload": { "totalOpportunities": 5, "afterConfidenceFilter": 0 }
    }
  ]
}
```

---

### GET /api/cron/daily-report

Cron-only: sends daily summary (today’s trades, PnL, account value) to Telegram and optionally Discord. Use `Authorization: Bearer <CRON_SECRET>` or `X-Cron-Secret`.

---

## 📈 Trading Endpoints

### GET /api/positions

Get open positions.

**Response:**
```json
{
  "success": true,
  "data": {
    "positions": [
      {
        "id": "pos_1701648000_abc123",
        "symbol": "BTCUSDT",
        "side": "LONG",
        "entryPrice": 42000.50,
        "currentPrice": 42150.00,
        "size": 0.001,
        "leverage": 10,
        "stopLoss": 40320.48,
        "takeProfit": 47040.56,
        "unrealizedPnL": 1.49,
        "unrealizedPnLPercent": 3.57,
        "openedAt": 1701648000000,
        "status": "OPEN"
      }
    ],
    "totalPositions": 1,
    "totalUnrealizedPnL": 1.49
  }
}
```

---

### POST /api/positions

Add position to monitor (manual).

**Request:**
```json
{
  "action": "add",
  "symbol": "BTCUSDT",
  "side": "LONG",
  "entryPrice": 42000.50,
  "size": 0.001,
  "leverage": 10,
  "stopLoss": 40320.48,
  "takeProfit": 47040.56,
  "orderId": "order_123"
}
```

---

### GET /api/trades

Get trade history.

**Query Parameters:**
- `limit` (optional): Number of trades (default: 50)
- `symbol` (optional): Filter by symbol
- `side` (optional): Filter by LONG/SHORT
- `source` (optional): Filter by `simulation` or `live` (paper vs live)

**Response:**
```json
{
  "success": true,
  "data": {
    "trades": [
      {
        "id": "trade_1701648000",
        "symbol": "BTCUSDT",
        "side": "LONG",
        "entryPrice": 42000.50,
        "exitPrice": 42840.51,
        "size": 0.001,
        "leverage": 10,
        "pnl": 8.40,
        "pnlPercent": 20.0,
        "entryReason": "Multi-Agent Analysis: Strong bullish momentum...",
        "exitReason": "TAKE_PROFIT",
        "duration": 3600000,
        "timestamp": 1701648000000
      }
    ],
    "summary": {
      "totalTrades": 156,
      "winRate": 58.3,
      "totalPnL": 124.56
    }
  }
}
```

---

### GET /api/performance

Get performance metrics.

**Query Parameters:**
- `days` (optional): Lookback period (default: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "metrics": {
      "totalTrades": 156,
      "winningTrades": 91,
      "losingTrades": 65,
      "winRate": 58.33,
      "avgWinAmount": 2.45,
      "avgLossAmount": 1.23,
      "avgProfitPerTrade": 0.79,
      "profitFactor": 1.82,
      "totalPnL": 124.56,
      "maxDrawdown": 15.23,
      "maxDrawdownPercent": 12.5,
      "sharpeRatio": 2.34,
      "sortinoRatio": 3.12,
      "calmarRatio": 4.56,
      "expectedValue": 0.79,
      "bestTrade": 12.45,
      "worstTrade": -8.23,
      "avgTradeDuration": 7200000
    },
    "symbolPerformance": [
      {
        "symbol": "BTCUSDT",
        "trades": 45,
        "winRate": 62.2,
        "totalPnL": 45.67
      }
    ],
    "dailyPerformance": [
      {
        "date": "2024-12-01",
        "trades": 8,
        "pnl": 12.34,
        "winRate": 75.0
      }
    ]
  }
}
```

---

## 📤 Export & Audit

### GET /api/export

Export trades and optional simulation stats.

**Query Parameters:**
- `format`: `json` | `csv` | `tax` | `audit` (default: json)
- `limit`: Max trades (default: 500, max: 2000)
- `days`: Lookback days (default: 30)
- `source`: Filter by `simulation` or `live` (paper vs live)
- `stats`: Include simulation stats when format=json (default: true)

**Response (format=json):**
```json
{
  "success": true,
  "data": {
    "trades": [ { "id": "...", "symbol": "BTCUSDT", "source": "simulation", ... } ],
    "stats": { ... },
    "meta": { "count": 50, "days": 30, "sourceFilter": "all", "exportedAt": "..." }
  }
}
```

CSV/tax/audit downloads include a `source` column. See [TAX_EXPORT.md](./TAX_EXPORT.md).

---

## 📊 Market Data Endpoints

### GET /api/realtime-market

Get unified real-time market data.

**Query Parameters:**
- `symbols` (optional): Comma-separated symbols (default: BTCUSDT,ETHUSDT,SOLUSDT)
- `includeML` (optional): Include ML insights (default: false)
- `includeAPIStats` (optional): Include API key stats (default: false)

**Response:**
```json
{
  "success": true,
  "timestamp": 1701648000000,
  "connection": {
    "connected": true,
    "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    "dataPoints": 3
  },
  "marketData": {
    "BTCUSDT": {
      "symbol": "BTCUSDT",
      "timestamp": 1701648000000,
      "price": 42000.50,
      "priceFormatted": "42000.50",
      "markPrice": 42001.23,
      "indexPrice": 42000.00,
      "priceChange24h": 1250.50,
      "priceChangePercent24h": 3.07,
      "changeFormatted": "+3.07%",
      "volume24h": 15000000000,
      "volumeFormatted": "$15.00B",
      "buyVolume": 8500000000,
      "sellVolume": 6500000000,
      "volumeRatio": 1.31,
      "bestBid": 42000.00,
      "bestAsk": 42001.00,
      "spread": 1.00,
      "spreadPercent": 0.0024,
      "spreadFormatted": "0.0024%",
      "bidLiquidity": 5000000,
      "askLiquidity": 4500000,
      "liquidityImbalance": 0.053,
      "fundingRate": 0.0001,
      "fundingFormatted": "0.0100%",
      "nextFundingTime": 1701662400000,
      "fundingSentiment": "BULLISH",
      "liquidationPressure": "NEUTRAL",
      "totalLiquidationValue24h": 45000000,
      "atr": 420.05,
      "atrPercent": 1.0,
      "volatilityLevel": "LOW",
      "momentum1m": 0.05,
      "momentum5m": 0.12,
      "momentum15m": 0.25,
      "momentum1h": 0.45,
      "overallScore": 72,
      "signalStrength": "BUY",
      "signalColor": "#00cc66"
    }
  },
  "recentLiquidations": [
    {
      "symbol": "BTCUSDT",
      "side": "SELL",
      "price": 41800.00,
      "quantity": 0.5,
      "value": 20900,
      "valueFormatted": "$20.90K",
      "timestamp": 1701647900000,
      "timeAgo": "2m ago"
    }
  ],
  "marketOverview": {
    "avgScore": 58,
    "bullishCount": 45,
    "bearishCount": 12,
    "neutralCount": 43,
    "avgVolatility": 3.2,
    "totalLiquidations24h": 125000000
  },
  "mlInsights": {
    "patterns": [
      {
        "pattern": "high_volume_entry",
        "winRate": 0.67,
        "avgPnl": 2.3,
        "sampleSize": 45,
        "confidence": 0.85,
        "recommendation": "FAVORABLE - Trade aggressively when detected"
      }
    ],
    "featureImportance": [
      {
        "feature": "volumeRatio",
        "importance": 0.85,
        "correlation": 0.45
      }
    ]
  }
}
```

---

### GET /api/prices

Get current prices for symbols.

**Query Parameters:**
- `symbols` (optional): Comma-separated symbols

**Response:**
```json
{
  "success": true,
  "prices": {
    "BTCUSDT": 42000.50,
    "ETHUSDT": 2250.75,
    "SOLUSDT": 65.43
  },
  "timestamp": 1701648000000
}
```

---

### GET /api/market-confidence

Get market confidence scores.

**Response:**
```json
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "symbol": "BTCUSDT",
        "score": 72,
        "signal": "BUY",
        "confidence": 0.68,
        "volumeRatio": 1.8,
        "momentum": 0.45,
        "liquidityScore": 0.92
      }
    ],
    "summary": {
      "scannedSymbols": 100,
      "opportunities": 15,
      "avgScore": 58
    }
  }
}
```

---

## 🧠 AI/ML Endpoints

### POST /api/agent-runner

Control the agent runner.

**Request:**
```json
{
  "action": "start" | "stop" | "status"
}
```

**Response (status):**
```json
{
  "success": true,
  "isRunning": true,
  "currentCycle": 42,
  "lastCycleTime": 1701648000000,
  "stats": {
    "totalCycles": 1250,
    "tradesExecuted": 156,
    "winRate": 58.3
  }
}
```

---

### GET /api/agent-insights

Get AI agent performance insights.

**Response:**
```json
{
  "success": true,
  "data": {
    "agents": {
      "technical": {
        "accuracy": 0.72,
        "avgResponseTime": 1200,
        "totalAnalyses": 5000
      },
      "chief": {
        "accuracy": 0.68,
        "avgResponseTime": 2500,
        "decisionsToday": 45
      },
      "risk": {
        "approvalRate": 0.45,
        "avgPositionSize": 3.2,
        "rejectionReasons": {
          "lowConfidence": 35,
          "highVolatility": 12,
          "maxPositions": 8
        }
      }
    },
    "recentDecisions": [
      {
        "symbol": "BTCUSDT",
        "action": "BUY",
        "confidence": 0.72,
        "approved": true,
        "timestamp": 1701648000000
      }
    ]
  }
}
```

---

### POST /api/multi-agent

Trigger multi-agent analysis.

**Request:**
```json
{
  "symbol": "BTCUSDT"
}
```

**Response:**
```json
{
  "success": true,
  "workflowId": "workflow_1701648000_abc123",
  "status": "running",
  "steps": [
    { "id": "data_gathering", "status": "completed" },
    { "id": "technical_analysis", "status": "running" },
    { "id": "chief_decision", "status": "pending" },
    { "id": "risk_assessment", "status": "pending" },
    { "id": "execution_planning", "status": "pending" },
    { "id": "trade_execution", "status": "pending" }
  ]
}
```

---

## 🌐 Public API & Backtest

### GET /api/public/quote

Minimal public quote/status. When `PUBLIC_API_KEY` is set, requires `X-API-Key` or `Authorization: Bearer <key>` and is rate-limited (60 req/min per key).

**Response:**
```json
{
  "ok": true,
  "service": "Manna",
  "timestamp": "2025-02-28T12:00:00.000Z",
  "message": "Use authenticated endpoints for trading data."
}
```

---

### GET /api/backtest

Backtest: fetch historical klines and run RSI/trend scoring over a sliding window.

**Query Parameters:**
- `symbol` (optional): Symbol (default: BTCUSDT)
- `interval` (optional): Kline interval (default: 1h)
- `limit` (optional): Number of bars (default: 100, max: 500)

**Response:**
```json
{
  "success": true,
  "symbol": "BTCUSDT",
  "interval": "1h",
  "bars": 80,
  "summary": {
    "avgScore": 52.5,
    "maxScore": 75,
    "minScore": 35,
    "bullishBars": 45,
    "bearishBars": 20
  },
  "results": [
    { "time": 1701648000000, "score": 55, "trend": "BULLISH", "rsi": 58.2 }
  ]
}
```

---

## 🔌 WebSocket Streams

The unified data aggregator subscribes to the following Aster DEX WebSocket streams:

### Stream Types

| Stream | Description | Update Rate |
|--------|-------------|-------------|
| `{symbol}@aggTrade` | Aggregate trades | Per trade |
| `{symbol}@markPrice@1s` | Mark price + funding | 1 second |
| `{symbol}@kline_{interval}` | Candlestick data | Per candle close |
| `{symbol}@miniTicker` | Mini ticker | Continuous |
| `{symbol}@bookTicker` | Best bid/ask | Continuous |
| `{symbol}@depth10@100ms` | Top 10 order book | 100ms |
| `!forceOrder@arr` | All liquidations | Real-time |
| `!ticker@arr` | All market tickers | Continuous |

### Connection URL

```
wss://fstream.asterdex.com/stream?streams=btcusdt@aggTrade/btcusdt@markPrice@1s/...
```

---

## ⚠️ Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional context"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `RATE_LIMITED` | 429 | Too many requests |
| `INSUFFICIENT_BALANCE` | 400 | Not enough balance |
| `INVALID_SYMBOL` | 400 | Symbol not found |
| `POSITION_NOT_FOUND` | 404 | Position doesn't exist |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `OLLAMA_UNAVAILABLE` | 503 | DeepSeek R1 not responding |

### Rate Limits

- **Public endpoints**: 2400 weight/minute
- **Authenticated endpoints**: Shared with Aster DEX limits
- **API key pool**: Distributes load across up to 30 keys

---

## 📝 Example: Complete Trading Flow

```typescript
// 1. Start services
await fetch('/api/startup', { method: 'POST' });

// 2. Check status
const status = await fetch('/api/trading-status').then(r => r.json());
console.log('Agent Runner:', status.data.agentRunner.isRunning);

// 3. Get market data
const market = await fetch('/api/realtime-market?symbols=BTCUSDT').then(r => r.json());
console.log('BTC Score:', market.marketData.BTCUSDT.overallScore);

// 4. Monitor positions
const positions = await fetch('/api/positions').then(r => r.json());
console.log('Open Positions:', positions.data.positions.length);

// 5. Check performance
const perf = await fetch('/api/performance').then(r => r.json());
console.log('Win Rate:', perf.data.metrics.winRate + '%');
```

---

**Last Updated**: February 2025 | **Version**: 7.1.0
