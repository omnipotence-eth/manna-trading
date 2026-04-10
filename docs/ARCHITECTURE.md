# Manna LLM Aster Crypto Trader — Architecture

This document describes how the system is built, how data and control flow through it, and how the main pieces fit together.

---

## 1. What the System Does

Manna is an **autonomous crypto trading system** that:

- Connects to **Aster DEX** for spot/futures and real-time market data.
- Uses a **multi-agent AI pipeline** (DeepSeek R1 via Ollama) to analyze markets, decide actions, size risk, and plan execution.
- Runs a **continuous trading loop** (Agent Runner) that scans opportunities, runs the pipeline, and manages open positions with stop-loss, take-profit, and time-based exits.
- Exposes a **Next.js dashboard** for monitoring positions, P&L, agent messages, and market data.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS APPLICATION                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Frontend (React)          │  API Routes (REST)        │  Server-side    │
│  • Dashboard (/trading)    │  • /api/agent-runner      │  • Services     │
│  • Charts, Positions      │  • /api/aster/*           │  • DB (Pg)      │
│  • Agent insights / chat   │  • /api/realtime-market  │  • WebSocket    │
│  • Zustand store           │  • /api/health, etc.     │  • Singletons   │
└─────────────────────────────────────────────────────────────────────────┘
         │                                │                        │
         │                                │                        │
         ▼                                ▼                        ▼
┌─────────────────┐            ┌─────────────────┐      ┌─────────────────┐
│  Aster DEX      │            │  Ollama          │      │  PostgreSQL     │
│  REST + WS      │            │  (DeepSeek R1)   │      │  (Supabase)     │
└─────────────────┘            └─────────────────┘      └─────────────────┘
```

- **Single deployable**: One Next.js app (frontend + API + server-side services).
- **Layered**: UI → API routes → services → external systems (Aster, Ollama, DB).

---

## 3. Main Components

### 3.1 Frontend

- **Routes**: `/` (landing/portfolio), `/trading` (main app), `/whitepaper` (docs).
- **Trading UI**: `NOF1Dashboard`, `Positions`, `InteractiveChart`, `PriceTicker`, `EnhancedAIChat`, `AgentsSystem`, quant/analytics views.
- **State**: Zustand (`store/useStore.ts`) for connection status, live prices, trades, positions, model messages, account value.
- **Startup**: `StartupInitializer` in the root layout; `instrumentation.ts` runs env validation on the server.

### 3.2 API Layer

Next.js API routes under `app/api/`:

- **Control**: `agent-runner` (start/stop/status/force-run), `startup`, `trading-status`.
- **Trading**: `aster/account`, `aster/positions`, `aster/leverage`, `aster/order`, `aster/exchange-info`, `positions`, `trades`, `real-balance`.
- **Data**: `prices`, `realtime-market`, `optimized-data`, `quant-data`, `market-confidence`.
- **Agents**: `multi-agent`, `agent-insights`, `model-message`.
- **Operations**: `health`, `health/detailed`, `websocket-status`, `critical-monitor`, `diagnostics`, `errors`.
- **Analytics**: `performance`, `trade-analysis`, `portfolio`, `goal`, `growth`, `simulation`, `ml-rl-self-test`, `self-test`.
- **Setup**: `setup/database`.

Responses use shared helpers (`createSuccessResponse`, `handleApiError`). Critical paths use circuit breakers and optional performance timers.

### 3.3 Service Layer

All under `services/`, by domain:

| Domain      | Role |
|------------|------|
| **ai/**    | `agentCoordinator` (workflow), `agentRunnerService` (loop), `deepseekService` (LLM). |
| **exchange/** | `asterDexService` (REST), `websocketMarketService` (streams). |
| **trading/**  | `marketScannerService`, `positionMonitorService`, `mathematicalTradingSystem`, `goalTracker`, `simulationService`, etc. |
| **ml/**    | `mlDataCollector`, `mlTrainingDataService`, `rlTrainingService`, `rlParameterOptimizer`, pattern/forecast services. |
| **monitoring/** | `startupService`, `healthMonitorService`, `criticalServiceMonitor`, `performanceTracker`, `apiKeyOptimizer`, etc. |

Services are singletons (using `globalThis`) so one instance survives Next.js hot reload.

### 3.4 Shared Libraries

- **lib/configService.ts** — Central config (Aster API, Ollama, DB, trading defaults).
- **lib/logger.ts**, **lib/frontendLogger.ts** — Logging.
- **lib/errorHandler.ts**, **lib/frontendErrorHandler.ts** — Error handling.
- **lib/circuitBreaker.ts** — Circuit breakers for Aster API, DB, external API.
- **lib/requestCache.ts**, **lib/frontendCache.ts** — Caching.
- **lib/db.ts** — PostgreSQL client.
- **lib/workflowTypes.ts**, **lib/agentPrompts.ts** — Agent workflow types and prompts.
- **lib/hooks/** — React hooks (e.g. polling, debounce, localStorage).
- **lib/utils/** — Formatting, validation, async helpers.

---

## 4. Trading Flow (End to End)

1. **Agent Runner** starts (via API or startup) and runs on a timer (e.g. every 2 minutes).
2. It loads the symbol list from Aster (e.g. top by volume), respecting a blacklist.
3. **Market Scanner** scores and filters opportunities (volume, spread, liquidity).
4. For each selected opportunity, **Agent Coordinator** runs the pipeline:
   - Gather data (prices, order book, indicators).
   - Technical analyst → chief analyst → risk manager → execution specialist.
   - If approved, place order via **Aster DEX Service**.
5. **Position Monitor** runs on a short interval: updates P&L, checks stop-loss, take-profit, trailing stop, timeout; closes positions when conditions are met.
6. Trades and positions are persisted (DB), reflected in the API, and shown in the dashboard.

---

## 5. Data and Real-Time

- **Market data**: Aster WebSocket streams (e.g. aggTrade, markPrice) are consumed by `websocketMarketService`. When present, a `services/data/unifiedDataAggregator` can aggregate and expose unified market state.
- **`/api/realtime-market`** serves the dashboard; it may use the aggregator for symbols, funding, liquidations, and optional ML/API stats.
- **Dashboard** polls or streams from these APIs and updates the Zustand store and components.

---

## 6. Resilience and Security

- **Circuit breakers** protect Aster API, DB, and external API calls; health endpoints expose their status.
- **Caching** (e.g. `lib/requestCache`, `lib/frontendCache`, and optional `services/data/apiCache`) reduces load and improves latency.
- **API keys** stay server-side; DB uses env config and parameterized queries; client does not receive secrets.

---

## 7. Where to Read More

- **Code layout**: `CODEBASE_STRUCTURE.md`
- **Detailed design**: `docs/SYSTEM_ARCHITECTURE.md` (services, DB schema, caching, errors)
- **APIs**: `docs/API_DOCUMENTATION.md`
- **Operations**: `docs/MASTER_GUIDE.md`, `STARTUP_GUIDE.md`

---

*Version 7.1.0 | Last updated February 2025*
