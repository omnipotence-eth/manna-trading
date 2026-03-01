# System Architecture

**Manna LLM Aster Crypto Trader** — Version 7.1.0

Technical architecture for the autonomous AI trading system on Aster DEX.

---

## Table of Contents

- [Overview](#overview)
- [Service Layer](#service-layer)
- [Data Flow](#data-flow)
- [Multi-Agent System](#multi-agent-system)
- [Database Schema](#database-schema)
- [Caching and Resilience](#caching-and-resilience)
- [Error Handling](#error-handling)
- [Security](#security)

---

## Overview

The application uses a modular, service-oriented design inside a single Next.js 14 deployment. Business logic is split into domain services while remaining one deployable unit.

### Technology Stack

| Layer       | Technology              | Purpose                    |
|------------|--------------------------|----------------------------|
| Frontend   | React 18, Next.js 14     | App Router, dashboard UI   |
| Styling    | Tailwind CSS, Framer Motion | Layout and motion       |
| State      | Zustand                  | Client state               |
| API        | Next.js API Routes       | REST API                   |
| AI         | DeepSeek R1 (Ollama)     | Agent decision-making      |
| Database   | PostgreSQL (Supabase)   | Persistence                |
| Real-time  | WebSocket (`ws`)        | Market data                |
| Charts     | Lightweight Charts, Recharts, Tremor | Visualizations   |

---

## Service Layer

### Directory Layout

Services are grouped by domain under `services/`:

```
services/
├── ai/                    # AI and agent orchestration
│   ├── agentCoordinator.ts    # Multi-agent workflow
│   ├── agentRunnerService.ts  # Scheduled trading loop
│   └── deepseekService.ts    # LLM integration
├── exchange/               # Exchange connectivity
│   ├── asterDexService.ts    # Aster DEX REST API
│   └── websocketMarketService.ts  # WebSocket streams
├── trading/               # Trading logic
│   ├── marketScannerService.ts   # Opportunity scanning
│   ├── positionMonitorService.ts # Position and exits
│   ├── mathematicalTradingSystem.ts
│   ├── goalTracker.ts
│   ├── simulationService.ts
│   ├── opportunityRanker.ts
│   ├── realBalanceService.ts
│   └── ...
├── ml/                    # Machine learning
│   ├── mlDataCollector.ts
│   ├── mlTrainingDataService.ts
│   ├── rlTrainingService.ts
│   ├── rlParameterOptimizer.ts
│   ├── tradePatternAnalyzer.ts
│   └── ...
└── monitoring/            # Health and operations
    ├── startupService.ts
    ├── healthMonitorService.ts
    ├── criticalServiceMonitor.ts
    ├── performanceTracker.ts
    ├── dynamicConfigService.ts
    ├── apiKeyOptimizer.ts
    └── ...
```

Optional or legacy: some API routes and the exchange layer reference `services/data/` (e.g. `unifiedDataAggregator`, `apiCache`). When those modules exist, they provide unified real-time aggregation and server-side API caching.

### Service Dependencies

- **Agent Runner** → Market Scanner, Agent Coordinator, Mathematical Trading System
- **Agent Coordinator** → DeepSeek Service, Position Monitor
- **Market Scanner** → Aster DEX Service
- **Position Monitor** → Aster DEX Service
- **Aster DEX Service** → API Key Manager, request/cache utilities in `lib/`
- **WebSocket Service** → feeds real-time data to dashboard and any unified aggregator

### Singleton Usage

Services are exposed as singletons and attached to `globalThis` so a single instance is reused across Next.js hot reloads:

```typescript
const globalForService = globalThis as typeof globalThis & {
  __myService?: MyService;
};

if (!globalForService.__myService) {
  globalForService.__myService = new MyService();
}

export const myService = globalForService.__myService;
```

---

## Data Flow

### Trading Loop

1. **Agent Runner** (`services/ai/agentRunnerService.ts`)  
   Runs on a configurable interval (default 2 minutes). Refreshes symbol universe from Aster (e.g. by volume) and kicks off workflows.

2. **Market Scanner**  
   Fetches symbols, scores opportunities (volume, spread, liquidity), filters and ranks them.

3. **Agent Coordinator**  
   For each opportunity, runs a multi-step workflow (data gathering → technical analysis → chief decision → risk assessment → execution planning → execution). Each step has its own timeout; total workflow is capped (e.g. 10 minutes).

4. **Position Monitor**  
   Runs on a short interval (e.g. every 10 seconds). Updates prices and P&L, checks stop-loss, take-profit, trailing stop, and time-based exit, and executes exits when conditions are met.

### Real-Time Data

- Aster DEX WebSocket (`wss://fstream.asterdex.com/stream` or configured endpoint) provides streams such as `aggTrade`, `markPrice`, `forceOrder`.
- **WebSocket Market Service** consumes these and can feed a unified aggregator when present.
- **`/api/realtime-market`** serves the dashboard; when `services/data/unifiedDataAggregator` exists, it provides unified market data, funding, liquidations, and optional ML/API stats.
- Dashboard components (e.g. `NOF1Dashboard`, `InteractiveChart`, `Positions`, `EnhancedAIChat`) consume this API and the Zustand store.

---

## Multi-Agent System

The Agent Coordinator runs a pipeline of specialized agents (all backed by DeepSeek R1 via `deepseekService`):

| Step   | Role                 | Purpose |
|--------|----------------------|--------|
| 1      | Data gathering       | Collect price, volume, order book, indicators |
| 2      | Technical analyst    | Direction, confidence, patterns, key levels   |
| 3      | Chief analyst        | Action (BUY/SELL/HOLD), targets               |
| 4      | Risk manager         | Position size, leverage, stops, Kelly-based sizing |
| 5      | Execution specialist | Order type, timing                             |
| 6      | Execution            | Place/update orders on Aster                   |

Workflow state: `PENDING` → `RUNNING` → `COMPLETED` or `FAILED`. Steps can retry up to a configured limit; timeouts cause the workflow to fail and skip remaining steps.

---

## Database Schema

Core persistence is PostgreSQL (Supabase). Main concepts:

- **trades** — Closed trade history (symbol, side, sizes, prices, PnL, entry/exit metadata). Optional **source** column (`simulation` | `live`) for paper vs live.
- **audit_events** — Audit trail: agent/runner/execution events (type, source, payload JSON). Used for “why no trade”, circuit breaker, and opportunity counts.
- **open_positions** — Current positions (entry, size, leverage, stop-loss, take-profit, trailing stop, PnL).
- **closed_positions** — Archived closed positions.
- **ml_training_data** — Features and outcomes for ML training.
- **ml_patterns** — Pattern definitions and performance.
- **ai_messages** — Agent messages for the UI.
- **trade_performance** — Performance metrics per trade.

Indexes are defined on symbol, timestamp, side, status, and outcome fields as needed for queries. See schema definitions in the codebase or migration files for exact DDL.

---

## Caching and Resilience

### Caching

- **`lib/requestCache.ts`** — In-memory request cache; TTL and deduplication.
- **`lib/frontendCache.ts`** — Client-side caches and helpers for the dashboard.
- When present, **`services/data/apiCache`** is used by the exchange layer for server-side, per-endpoint caching (e.g. prices, order book, exchange info).

Typical TTL guidance: ticker/prices short (e.g. 1–5 s), order book very short, klines longer, exchange info long (e.g. 10 min).

### Circuit Breaker

- **`lib/circuitBreaker.ts`** exports `circuitBreakers` (e.g. `asterApi`, `database`, `externalApi`).
- API routes and services wrap external calls in `circuitBreakers.*.execute(...)` to avoid cascading failures.
- Health endpoints expose circuit breaker status for monitoring.

---

## Error Handling

- **API routes** use shared helpers (e.g. `createSuccessResponse`, `handleApiError`) and optional performance timers.
- **Error categories**: rate limit (429) → cooldown/retry; server (5xx) → backoff; client (4xx) → log, no retry; network/timeout → retry with backoff.
- Errors are logged via `lib/logger`; frontend uses `lib/frontendLogger` and error boundaries where appropriate.

---

## Security

- **API keys**: Stored and used only on the server; never sent to the client.
- **Database**: Credentials in environment variables; production uses SSL; queries are parameterized.
- **Client**: No secrets in client state; API routes validate inputs; CORS is configured for the production domain.
- **Public API**: Optional `PUBLIC_API_KEY` env; when set, `/api/public/*` (and optionally other endpoints) require `X-API-Key` or `Authorization: Bearer` and are rate-limited (e.g. 60 req/min per key) via `lib/publicApiRateLimit.ts`.

---

## Health, Diagnostics, and Status

- **GET /api/health** — Full health check (services, config, circuit breakers).
- **GET /api/health/ready** — Readiness: `ready` boolean, `missing[]`, `warnings[]`, and checks for Aster, LLM, and database. Safe to call before app is fully configured.
- **GET /api/diagnostics/why-no-trades** — Runner status, last cycle diagnostic (opportunities filtered, circuit breaker, thresholds), and strategy summary. Surfaces “why no trade” in the dashboard (Info tab).
- **GET /api/audit-events** — Recent audit events (no_opportunities, opportunities_found, circuit_breaker_triggered, etc.) from the runner and execution layer.
- **Status page** — `/status` renders a simple UI that calls `/api/health/ready` and `/api/health` and displays readiness, checks, missing, warnings, and links to APIs.

---

## Notifications and Cron

- **Notifications**: Trade open/close events can be sent to **Discord** (`DISCORD_WEBHOOK_URL`), **Telegram** (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`), or a generic webhook (`NOTIFICATION_WEBHOOK_URL`) via `lib/notificationService.ts`.
- **Daily report**: **GET /api/cron/daily-report** (cron-authorized) sends a short daily summary (today’s trades, PnL, account value) to Telegram and optionally Discord. Vercel cron can invoke it (e.g. 20:00 UTC).
- **Trading cycle cron**: **GET /api/cron/trading-cycle** runs one agent cycle (for serverless/cron). Protected by `CRON_SECRET` when set.

---

## Paper Trading and Presets

- **Paper vs live**: Trades are tagged with **source** (`simulation` | `live`) from config at write time. Export supports `?source=simulation|live` and includes `source` in CSV/tax/audit.
- **Paper presets**: When `TRADING_SIMULATION_MODE=true` and **PAPER_PRESET** is set (`conservative` | `balanced` | `aggressive`), **effectiveTradingConfig** in `lib/configService.ts` merges preset overrides (e.g. confidence, min score, stop loss, max positions, daily loss). Runner and diagnostics use this effective config.

---

## Backtest

- **GET /api/backtest** — Fetches historical klines from Aster DEX, runs RSI/trend scoring over a sliding window, and returns per-bar scores and summary (avg/max/min score, bullish/bearish counts). Query params: `symbol`, `interval`, `limit`.

---

*Last updated: February 2025 | Version: 7.1.0*
