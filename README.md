<div align="center">

# Manna LLM Aster Crypto Trader

**Multi-agent AI trading system — DeepSeek R1 reasoning on Aster DEX**

[![CI](https://img.shields.io/github/actions/workflow/status/omnipotence-eth/manna-trading/ci.yml?style=flat-square&label=CI)](https://github.com/omnipotence-eth/manna-trading/actions/workflows/ci.yml)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-brightgreen?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ESLint](https://img.shields.io/badge/code%20style-ESLint-4B32C3?style=flat-square&logo=eslint)](https://eslint.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

[Quick Start](#quick-start) | [Architecture](#architecture) | [Configuration](#configuration) | [API Reference](#api-reference) | [Documentation](#documentation)

</div>

---

## What Is This

A full-stack AI trading system that scans markets, scores opportunities, runs a four-agent pipeline (Technical → Chief → Risk → Execution), and places or simulates trades on Aster DEX. Includes a live dashboard, tax/audit export, Discord/Telegram alerts, daily loss circuit breaker, and optional backtest — all configurable for simulation (default) or live trading.

## Why

Most AI trading bots are toy demos — a single LLM call with no risk management, no position sizing, no real market data. Manna exists to prove that multi-agent AI orchestration works in a domain where mistakes cost money. Each agent has a distinct responsibility (analysis, strategy, risk, execution), and the pipeline enforces discipline: Kelly Criterion sizes positions mathematically, circuit breakers halt trading during drawdowns, and the system runs in simulation mode by default so you can validate before risking capital. This is what production AI looks like when the stakes are real.

---

## Overview

Manna is an autonomous trading system that combines:

- **Multi-Agent AI Framework** — Four specialized AI agents working in concert
- **Mathematical Precision** — Kelly Criterion, Chandelier Exit, Monte Carlo simulations
- **Real-Time Data Pipeline** — WebSocket streams for market data, liquidations, funding rates
- **Machine Learning Pipeline** — Continuous learning from trade outcomes
- **Modern Dashboard** — Real-time visualization with smooth animations

> **Note:** The system runs in **simulation mode** by default. It uses real market data from Aster DEX but does not place real orders or risk actual funds. Set `TRADING_SIMULATION_MODE=false` to enable live trading.

---

## Features

### Multi-Agent AI System

| Agent | Role | Model |
|-------|------|-------|
| **Technical Analyst** | Chart patterns, volume analysis, multi-timeframe confluence | DeepSeek R1 (via Groq or Ollama) |
| **Chief Analyst** | Synthesizes data, makes BUY/SELL/HOLD decisions | DeepSeek R1 (via Groq or Ollama) |
| **Risk Manager** | Kelly Criterion sizing, ATR stops, portfolio risk | DeepSeek R1 (via Groq or Ollama) |
| **Execution Specialist** | Optimal order timing, slippage protection | DeepSeek R1 (via Groq or Ollama) |

### Real-Time Data Aggregation

- **WebSocket Streams** — All tickers, order book depth, mark prices
- **Funding Rate Analysis** — Sentiment detection from funding direction
- **Liquidation Monitoring** — Detect long/short squeezes
- **Multi-Timeframe Analysis** — 1m, 5m, 15m, 1h, 4h confluence

### Mathematical Foundations

| Algorithm | Application |
|-----------|-------------|
| Kelly Criterion | Optimal position sizing based on edge |
| Chandelier Exit | Volatility-adjusted trailing stops (3× ATR) |
| Sharpe/Sortino Ratio | Risk-adjusted performance measurement |
| Monte Carlo Simulation | Risk of ruin analysis |
| ATR-Based Stops | Dynamic stop-loss calculation |

### Machine Learning Pipeline

- **30+ Features Per Trade** — Market context, AI decisions, outcomes
- **Pattern Recognition** — Auto-detection of profitable setups
- **Feature Importance** — Identifies which indicators matter most
- **Continuous Learning** — System improves with every trade

### Modern Dashboard

- **Real-Time Charts** — Live portfolio tracking with smooth animations
- **Position Monitor** — Current positions with P&L (simulation or live)
- **AI Chat** — Agent reasoning in real-time
- **Performance Metrics** — Win rate, profit factor, Sharpe ratio
- **Analytics & Export** — `/trading/analytics` and `GET /api/export?format=json|csv|tax|audit` for trade data. Use **format=tax** for tax-style CSV; **format=audit** for "why did we trade?" (see [Tax export](docs/TAX_EXPORT.md)).

---

## Architecture

**Data flow in one sentence:** Cron or app load → startup → Agent Runner (market scan → score/filter → multi-agent workflow: Technical → Chief → Risk → Execution) → place order (or simulate) → Position Monitor (Chandelier/stops) → DB + notifications.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Dashboard   │  │   Charts     │  │  Positions   │  │   AI Chat    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                          React 18 + Next.js 14 + Framer Motion              │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                API LAYER                                     │
│  /api/startup    /api/trading-status    /api/realtime-market    /api/...   │
│                            Next.js API Routes                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA AGGREGATION LAYER                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │  WebSocket    │  │   Funding     │  │  Liquidation  │  │  Order Book │  │
│  │   Streams     │  │    Rates      │  │    Monitor    │  │    Depth    │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘  │
│                         Unified Data Aggregator                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INTELLIGENCE LAYER                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │    Kelly      │  │    Market     │  │      ML       │  │     RL      │  │
│  │  Criterion    │  │    Regime     │  │   Pipeline    │  │  Optimizer  │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MULTI-AGENT COORDINATOR                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │   Technical   │  │     Chief     │  │     Risk      │  │  Execution  │  │
│  │   Analyst     │─▶│    Analyst    │─▶│    Manager    │─▶│  Specialist │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘  │
│                        DeepSeek R1 (Groq or Ollama)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EXECUTION LAYER                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │  Aster DEX    │  │   Position    │  │  Chandelier   │  │ Performance │  │
│  │   Service     │  │    Monitor    │  │     Exit      │  │   Tracker   │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERSISTENCE LAYER                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      PostgreSQL (Supabase/Neon)                        │  │
│  │     trades  │  open_positions  │  ml_training_data  │  ai_messages    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | 18+ | Runtime |
| npm | 9+ | Package manager |
| LLM | — | **Groq** (cloud, for Vercel) or **Ollama** (local) for DeepSeek R1 |
| PostgreSQL | 14+ | Database (optional; recommended for persistence and circuit breaker) |

### Installation

```bash
# 1. Clone repository
git clone https://github.com/omnipotence-eth/manna-trading.git
cd manna-trading

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your credentials
```

### Environment Configuration

Create `.env.local` with the following:

```env
# ═══════════════════════════════════════════════════════════════
# ASTER DEX API (Required)
# ═══════════════════════════════════════════════════════════════
ASTER_API_KEY=your_api_key
ASTER_SECRET_KEY=your_secret_key
ASTER_BASE_URL=https://fapi.asterdex.com

# ═══════════════════════════════════════════════════════════════
# DATABASE (Optional - for persistence)
# ═══════════════════════════════════════════════════════════════
POSTGRES_URL=postgresql://user:pass@host:5432/db
DATABASE_SSL=true

# ═══════════════════════════════════════════════════════════════
# AI MODEL (DeepSeek R1 via Ollama)
# ═══════════════════════════════════════════════════════════════
OLLAMA_BASE_URL=http://localhost:11434
DEEPSEEK_MODEL=deepseek-r1:14b

# ═══════════════════════════════════════════════════════════════
# TRADING PARAMETERS
# ═══════════════════════════════════════════════════════════════
TRADING_CONFIDENCE_THRESHOLD=0.40
TRADING_STOP_LOSS=4.0
TRADING_TAKE_PROFIT=12.0
MAX_CONCURRENT_POSITIONS=2
```

### Start Services

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Pull DeepSeek R1 model (one-time)
ollama pull deepseek-r1:14b

# Terminal 3: Start the application
npm run dev
```

### Access Dashboard

Open http://localhost:3000 — The system auto-initializes and begins simulated trading.

---

## Demo

**Live demo (simulation mode):** Deploy to Vercel and open your project URL. No real orders are placed; the dashboard shows real market data and simulated trades.

| Step | Action |
|------|--------|
| Deploy | [Deploy with Vercel](https://vercel.com/new) → Import `https://github.com/omnipotence-eth/manna-trading` and add environment variables (see [Configuration](#-configuration)). |
| Demo URL | After deployment, your app will be available at `https://your-project.vercel.app`. Use this link in your portfolio or resume. |

---

## Configuration

### Trading Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TRADING_CONFIDENCE_THRESHOLD` | 0.40 | Minimum AI confidence to execute |
| `TRADING_STOP_LOSS` | 4.0 | Stop-loss percentage (ATR-adjusted) |
| `TRADING_TAKE_PROFIT` | 12.0 | Take-profit percentage (3:1 R:R) |
| `MAX_CONCURRENT_POSITIONS` | 2 | Maximum open positions |
| `MAX_PORTFOLIO_RISK` | 10 | Maximum total portfolio risk % |
| `AGENT_RUNNER_INTERVAL` | 1 | Market scan interval (minutes) |

### Account Size Limits

The system automatically adjusts risk based on account size:

| Account Size | Max Position | Max Risk | Min R:R | Max Positions |
|--------------|--------------|----------|---------|---------------|
| < $100 | 3% | 5% | 2.5:1 | 1 |
| $100-$500 | 5% | 8% | 2.0:1 | 2 |
| $500-$2000 | 8% | 10% | 1.5:1 | 3 |
| > $2000 | 12% | 15% | 1.5:1 | 5 |

### API Key Pool (Optional)

For higher throughput, configure multiple API keys:

```env
API_KEY_COUNT=5
ASTER_API_KEY_1=key1
ASTER_API_SECRET_1=secret1
ASTER_API_KEY_2=key2
ASTER_API_SECRET_2=secret2
# ... up to 30 keys for 600 req/sec capacity
```

---

## Trading System

### Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     TRADING WORKFLOW                             │
├─────────────────────────────────────────────────────────────────┤
│  1. MARKET SCANNER                                               │
│     └─ Scans top 100 symbols by volume                          │
│     └─ Filters: volume > 1.5x avg, spread < 0.5%, liquidity     │
│                                                                  │
│  2. TECHNICAL ANALYST (DeepSeek R1)                             │
│     └─ Multi-timeframe analysis (1m, 5m, 15m, 1h, 4h)           │
│     └─ Pattern recognition, support/resistance                  │
│                                                                  │
│  3. CHIEF ANALYST (DeepSeek R1)                                 │
│     └─ Synthesizes all data                                     │
│     └─ Makes BUY/SELL/HOLD decision with confidence             │
│                                                                  │
│  4. RISK MANAGER (DeepSeek R1)                                  │
│     └─ Kelly Criterion position sizing                          │
│     └─ ATR-based stop-loss/take-profit                          │
│     └─ Portfolio risk validation                                │
│                                                                  │
│  5. EXECUTION SPECIALIST (DeepSeek R1)                          │
│     └─ Optimal order timing                                     │
│     └─ Slippage protection                                      │
│                                                                  │
│  6. POSITION MONITOR (24/7)                                     │
│     └─ Chandelier Exit trailing stops                           │
│     └─ Stop-loss/take-profit monitoring                         │
│     └─ Timeout exits (24 hours max)                             │
└─────────────────────────────────────────────────────────────────┘
```

### Entry Criteria

- Confidence ≥ 40% from Chief Analyst
- Volume ≥ 1.5x average
- Spread < 0.5%
- Liquidity score > 0.7
- Multi-timeframe alignment
- Risk/Reward ≥ 2:1

### Exit Criteria

- **Stop-Loss**: ATR-based (2.5× volatility)
- **Take-Profit**: 2:1 to 3:1 R:R ratio
- **Trailing Stop**: Chandelier Exit (3× ATR from high)
- **Time Exit**: 24-hour maximum hold

---

## Mathematical Foundations

### Kelly Criterion

Optimal position sizing:

```
f* = (bp - q) / b

where:
  f* = fraction of capital to risk
  b  = win/loss ratio
  p  = probability of winning
  q  = probability of losing (1 - p)
```

We use **15% fractional Kelly** for safety:

```
Position Size = Full Kelly × 0.15 × Vol Adj × Regime Adj
```

### Chandelier Exit

Volatility-adjusted trailing stop:

```
LONG:  Stop = Highest High(n) - 3 × ATR(n)
SHORT: Stop = Lowest Low(n) + 3 × ATR(n)
```

### Risk Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Sharpe Ratio | (Rp - Rf) / σp | > 2.0 |
| Sortino Ratio | (Rp - Rf) / σd | > 2.5 |
| Profit Factor | Gross Wins / Gross Losses | > 1.5 |
| Expected Value | (Win% × AvgWin) - (Loss% × AvgLoss) | > 0.5% |

See [Mathematical Foundations](docs/MATHEMATICAL_FOUNDATIONS.md) for complete documentation.

---

## API Reference

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/startup` | POST | Initialize all services |
| `/api/trading-status` | GET | Current trading status |
| `/api/realtime-market` | GET | Unified market data |
| `/api/positions` | GET | Open positions |
| `/api/trades` | GET | Trade history |
| `/api/performance` | GET | Performance metrics |
| `/api/health` | GET | System health check |

### Real-Time Market Data

```typescript
GET /api/realtime-market?symbols=BTCUSDT,ETHUSDT&includeML=true

Response:
{
  "success": true,
  "timestamp": 1701648000000,
  "marketData": {
    "BTCUSDT": {
      "price": 42000.50,
      "fundingRate": 0.0001,
      "fundingSentiment": "BULLISH",
      "overallScore": 72,
      "signalStrength": "BUY"
    }
  },
  "mlInsights": { ... }
}
```

See [API Documentation](docs/API_DOCUMENTATION.md) for complete reference.

---

## Project Structure

For codebase layout and navigation, see **[CODEBASE_STRUCTURE.md](./CODEBASE_STRUCTURE.md)**. For an architecture overview, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```
manna-llm-aster-crypto-trader/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── startup/             # Service initialization
│   │   ├── trading-status/      # Status endpoint
│   │   ├── realtime-market/      # Market data
│   │   ├── positions/            # Position management
│   │   └── ...
│   ├── page.tsx                  # Landing page
│   ├── trading/page.tsx         # Trading dashboard
│   └── layout.tsx
├── components/                   # React components
│   ├── NOF1Dashboard.tsx        # Main dashboard
│   ├── InteractiveChart.tsx     # Portfolio chart
│   ├── Positions.tsx            # Position display
│   ├── EnhancedAIChat.tsx       # AI chat
│   └── ...
├── services/                     # Core services (by domain)
│   ├── ai/                       # Agent coordinator, runner, DeepSeek
│   ├── exchange/                 # Aster DEX REST + WebSocket
│   ├── trading/                  # Scanner, position monitor, math system
│   ├── ml/                       # ML/RL training and analysis
│   └── monitoring/               # Startup, health, performance
├── lib/                          # Utilities, config, caching, circuit breakers
├── constants/                    # Trading and polling constants
├── types/                        # TypeScript types
├── store/                        # Zustand state
├── docs/                         # Documentation
└── ...
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Documentation Index](docs/README.md) | Entry point for all docs |
| [Architecture](docs/ARCHITECTURE.md) | High-level architecture |
| [Quick Start Guide](docs/QUICK_START.md) | Detailed setup |
| [System Architecture](docs/SYSTEM_ARCHITECTURE.md) | Technical deep-dive |
| [Codebase Structure](CODEBASE_STRUCTURE.md) | Repository layout |
| [Mathematical Foundations](docs/MATHEMATICAL_FOUNDATIONS.md) | Kelly, Chandelier, Monte Carlo |
| [API Documentation](docs/API_DOCUMENTATION.md) | API reference |
| [Tax Export](docs/TAX_EXPORT.md) | Tax and audit CSV export |
| [Production Deployment](docs/PRODUCTION_DEPLOYMENT.md) | Deployment guide |
| [Lessons Learned](LESSONS.md) | Design trade-offs and notes |
| `notebooks/manna_trade_analysis.ipynb` | Jupyter: load trades via `/api/export` and run analytics |

---

## Troubleshooting

### DeepSeek R1 Not Responding

```bash
# Ensure Ollama is running
ollama serve

# Check model is installed
ollama list

# Test the model
ollama run deepseek-r1:14b "Hello"
```

### Database Connection Failed

```bash
# For Supabase/Neon, ensure SSL is enabled
DATABASE_SSL=true

# Test connection
psql $POSTGRES_URL -c "SELECT 1"
```

### Rate Limit Exceeded

- Add more API keys (up to 30)
- Reduce `TRADING_BATCH_SIZE` in `.env.local`
- Use `API_KEY_STRATEGY=least-used`

### No Trades Executing

Trades only run when **all** of these are true:

1. **Agent Runner is running** — Startup starts it; first cycle runs ~30s after load, then every 2 min. Check `GET /api/agent-runner?action=status` → `isRunning: true`.
2. **Market scan finds opportunities** — Scanner needs exchange data (Aster DEX). If the API fails (e.g. timestamp/network errors), symbols may be empty or scan can return no opportunities.
3. **Opportunities pass filters** — Each opportunity must have:
   - **Score** ≥ `TRADING_MIN_OPPORTUNITY_SCORE` (default **50**; was 70, now configurable).
   - **Confidence** ≥ `TRADING_CONFIDENCE_THRESHOLD` (default **0.70**).
   - Volume/liquidity/spread within limits.
4. **Workflow runs and AI approves** — Technical → Chief → Risk → Execution. If Chief says HOLD or Risk rejects, no order is placed.

**To get more simulation/demo trades:**

- Set in `.env.local`: `TRADING_MIN_OPPORTUNITY_SCORE=50` (default now) and optionally `TRADING_CONFIDENCE_THRESHOLD=0.55`.
- Ensure LLM is reachable (Groq key set, or Ollama running with model loaded).
- Wait at least 30 seconds after app load for the first cycle, or trigger manually: `GET /api/agent-runner?action=force-run`.

If still no trades, check server logs for `NO opportunities passed filters!` (filter counts and thresholds are logged).

**Trading when you're away (24/7)**  
On Vercel (or any serverless host) there is no long-lived process, so the in-app Agent Runner interval does not run when nobody visits. The app uses a **cron job** that calls `/api/cron/trading-cycle`. **Vercel Hobby (free):** cron can run only **once per day** (e.g. noon UTC); the repo is set to `0 12 * * *`. For **every 2 minutes** you need Vercel Pro or an external cron (e.g. cron-job.org) hitting the same URL with `CRON_SECRET` in the header. Each cron invocation runs one full trading cycle.

---

## Deployment

### Vercel (Recommended)

**Is it 100% free?** On **Vercel Hobby (free)** you get: 100 GB bandwidth, 1M serverless invocations/month, and **one cron run per day** (this repo uses `0 12 * * *`). So hosting the app and running one trading cycle per day is free. You may still pay for: **Groq API** (free tier has limits), **Neon/Supabase** (free tier available), **Aster DEX** (exchange/API is free; trading fees apply if you disable simulation). For **more frequent cron** (e.g. every 2 min) you need **Vercel Pro** or an external cron service; see [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

The repo includes a **Vercel Cron** that hits `/api/cron/trading-cycle` once per day (noon UTC). Optional: set `CRON_SECRET` in Vercel env if you also call the endpoint from an external scheduler.

```bash
npm i -g vercel
vercel --prod
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2 (VPS)

```bash
npm run build
pm2 start npm --name "manna-trader" -- start
pm2 save
pm2 startup
```

See [Production Deployment](docs/PRODUCTION_DEPLOYMENT.md) for complete guide.

---

## License

This software is licensed under the MIT License. See [LICENSE](LICENSE) for terms.

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Security

For security concerns, please see our [Security Policy](SECURITY.md). **Do not** report security vulnerabilities through public GitHub issues.

---

<div align="center">

**Built with precision using DeepSeek R1, Next.js, and Aster DEX**

Version 7.1.0 | February 2025

</div>
