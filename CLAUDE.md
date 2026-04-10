# Manna Trading — Claude Code Project Guide

Multi-agent AI cryptocurrency trading system. Read this before making any changes.
Reference LESSONS.md for hard-won architectural insights before touching the agent pipeline.

---

## What This Is

A 4-agent AI pipeline for crypto trading on Aster DEX. DeepSeek R1 reasoning drives decisions.
Runs in simulation mode by default — no real funds at risk unless explicitly configured.

Portfolio value: proves multi-agent orchestration, financial ML (Kelly Criterion, Monte Carlo),
full-stack AI product (Next.js + TypeScript), and real-time data handling (WebSocket).

**Version**: 7.1.0 (package.json shows 7.0.0, VERSION file is canonical)

---

## Architecture

```
WebSocket (Aster DEX real-time data)
    → Technical Analysis Agent  (indicators: RSI, MACD, Bollinger, Chandelier Exit)
    → Chief Agent               (DeepSeek R1 reasoning — coordinates strategy)
    → Risk Management Agent     (Kelly Criterion position sizing, Monte Carlo simulations)
    → Execution Agent           (order placement — simulation mode by default)
    → Live Dashboard            (Next.js real-time visualization)
```

---

## Repo Layout

```
manna-trading/
├── app/                    # Next.js 14 app router
│   ├── api/                # API routes (trading signals, positions, health)
│   └── dashboard/          # Real-time trading dashboard UI
├── components/             # React components (charts, panels, tables)
├── services/
│   ├── ai/                 # AI agent implementations (DeepSeek R1 integration)
│   ├── exchange/           # Aster DEX WebSocket client + REST API
│   ├── ml/                 # Kelly Criterion, Monte Carlo, risk models
│   ├── monitoring/         # Performance tracking, drawdown detection
│   └── trading/            # Order execution (simulation + live)
├── lib/                    # Shared utilities, types, constants
├── types/                  # TypeScript type definitions
├── store/                  # State management
├── __tests__/              # Jest test suite
├── notebooks/              # Jupyter notebooks for strategy research
├── scripts/                # Startup, preload, error collection scripts
├── LESSONS.md              # Hard-won architectural insights — READ FIRST
├── ARCHITECTURE.md         # Full system design
├── STARTUP_GUIDE.md        # Local setup walkthrough
├── STARTUP_GUIDE.md        # Local setup walkthrough
├── DEPLOYMENT_CHECKLIST.md # Production deploy checklist
├── SECURITY.md             # API key handling, simulation mode guard
├── package.json            # v7.1.0, Next.js 14
└── vercel.json             # Vercel deployment config
```

---

## Running

```bash
# Install
npm install

# Copy env and configure
cp .env.example .env.local
# Required: GROQ_API_KEY (free) or OPENAI_API_KEY for cloud inference
# Optional: ASTER_DEX_WS_URL for live WebSocket data

# Development (simulation mode — no real trading)
npm run dev
# → http://localhost:3000

# Production build
npm run build && npm start

# With Ollama (local GPU, DeepSeek R1)
ollama serve && ollama pull deepseek-r1:14b
# Set MODEL_PROVIDER=ollama in .env.local
```

---

## Testing

```bash
# All tests
npm test
# or
jest

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

**Test conventions**:
- Jest + React Testing Library
- Agent logic tests in `__tests__/`
- Mock exchange WebSocket with `jest.mock('./services/exchange')`
- Never test with real exchange credentials — use mock data fixtures

---

## Key Files

| File | Why it matters |
|------|---------------|
| `LESSONS.md` | Hard-won insights — read before any architectural change |
| `services/ai/` | DeepSeek R1 agent implementations — the core differentiator |
| `services/ml/` | Kelly Criterion + Monte Carlo — financial risk models |
| `services/exchange/` | WebSocket client — real-time Aster DEX data |
| `app/api/` | Next.js API routes — signal generation endpoints |
| `vercel.json` | Vercel deployment config |
| `SECURITY.md` | Simulation mode guard — review before any live trading change |

---

## Environment Variables

| Var | Required | Purpose |
|-----|----------|---------|
| `GROQ_API_KEY` | Yes (cloud) | DeepSeek R1 via Groq (free tier) |
| `OPENAI_API_KEY` | Optional | OpenAI fallback |
| `ASTER_DEX_WS_URL` | Optional | Live exchange WebSocket |
| `SIMULATION_MODE` | Default: true | Set false only for live trading |
| `MODEL_PROVIDER` | Default: groq | `groq` / `openai` / `ollama` |

---

## Deployment

```bash
# Vercel (primary)
vercel deploy

# Check Vercel deployment
vercel ls

# Environment variables in Vercel
vercel env add GROQ_API_KEY
```

---

## IMPORTANT Rules

- **SIMULATION_MODE=true by default** — never change to false without explicit intent + DEPLOYMENT_CHECKLIST review
- **Never commit API keys or wallet private keys** — use Vercel env vars for production
- **Read LESSONS.md before changing the agent pipeline** — previous v1–v6 architectural mistakes are documented there
- **Kelly Criterion position sizing is the risk guard** — do not bypass it
- **TypeScript strict mode is on** — `tsconfig.json` enforces this; fix type errors before committing

---

## How Claude Code Should Approach Changes

1. **Read LESSONS.md first** — every major design decision has history
2. Check `types/` before adding new TypeScript types — most are already defined
3. Agent changes: test in simulation mode → verify via dashboard → then deploy
4. Financial logic changes (Kelly, Monte Carlo): add a notebook in `notebooks/` to validate the math before implementing
5. This is TypeScript/Next.js — use `npm` not `uv`; `jest` not pytest
6. `vercel deploy` deploys to production — confirm with user before running
