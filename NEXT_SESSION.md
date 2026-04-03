# Manna Trading — Next Session Pickup

**Last updated:** 2026-04-03
**Current branch:** main
**Last commit:** `8d32d26` feat: add traditional finance support via Alpaca Markets

---

## What We Did This Session

### 1. Cloned repo
- Repo is at `omnipotence-eth/manna-trading` (private) on GitHub
- Cloned to `~/Documents/Project Portfolio/manna-trading`

### 2. Security fixes (`79aa040`)
Fixed four bugs in `lib/security.ts` before making the repo public:
- `validateKey()` auth bypass — now does constant-time comparison against all configured env keys
- CORS contradiction — `Access-Control-Allow-Origin: *` was nullifying the allowlist; now reflects specific origin + adds `Vary: Origin`
- `require('crypto')` inside function bodies — moved to top-level ES import
- `parseInt` radix — fixed to base 10; added comment about Content-Length spoofability

### 3. Traditional finance expansion (`8d32d26`)
Added Alpaca Markets (US equities/ETFs) alongside the existing Aster DEX crypto pipeline:

| New file | What it does |
|----------|--------------|
| `types/market.ts` | Unified `AssetClass`, `UnifiedMarketData`, `UnifiedPosition`, `AccountSummary` |
| `lib/marketHours.ts` | DST-aware US market hours utility |
| `services/exchange/alpacaService.ts` | Full Alpaca connector (account, positions, orders, bars, snapshots) |
| `services/trading/stockScannerService.ts` | 50-symbol watchlist scanner with 5-dimension scoring |
| `app/api/alpaca/{account,positions,order,bars}` | REST endpoints mirroring /api/aster/* |
| `app/api/market-hours` | Current session status (ET time, countdown to open) |
| `app/api/stock-scan` | Scored stock opportunity scan |

Modified: `constants/tradingConstants.ts` (added `EQUITY_CONSTANTS`, `DEFAULT_STOCK_WATCHLIST`), `.env.example` (Alpaca keys + `TRADING_ASSET_CLASS`)

---

## Where We Stopped

We paused **before making the repo public**. The remaining work before that:

---

## Immediate Next Steps (do these in order)

### Step 1 — Wire Alpaca into the agent pipeline
The equities scanner (`stockScannerService.ts`) exists but the 4-agent AI pipeline
(`services/ai/agentRunnerService.ts`) still only calls the crypto scanner.

**Task:** Update `agentRunnerService.ts` to check `TRADING_ASSET_CLASS` env var:
- `'crypto'` → existing crypto flow (default, no change)
- `'equity'` → use `stockScannerService` instead of `marketScannerService`
- `'both'` → run both scanners, merge opportunities, rank by score

Key file: `services/ai/agentRunnerService.ts`
Key import to add: `stockScannerService` from `@/services/trading/stockScannerService`

### Step 2 — Add asset class context to agent prompts
`lib/agentPromptsOptimized.ts` analysis templates are crypto-specific (mentions funding rates, leverage, liquidations).

**Task:** Add an optional `assetClass` param to `analysisTemplate()` functions so the AI agents get equity-appropriate context when analyzing stocks (earnings calendar, sector, PDT rule, no leverage, etc.)

Key file: `lib/agentPromptsOptimized.ts`

### Step 3 — Dashboard asset toggle
Add a simple asset class selector to the trading dashboard so users can switch between Crypto / Equities / Both views.

Key file: `app/trading/page.tsx`
Approach: Add a `useState` toggle at the top of the page that switches which scan API is called (`/api/realtime-market` vs `/api/stock-scan`).

### Step 4 — Add a dashboard screenshot
README says "add screenshot here" but it's still a placeholder. Run locally, take a screenshot of the dashboard, save to `docs/dashboard-screenshot.png`, update README to link it.

### Step 5 — Make repo public
- Review `.env.example` one more time (no secrets in git history)
- Make `omnipotence-eth/manna-trading` public on GitHub
- Deploy to Vercel (one click from GitHub)
- Update README demo link with live Vercel URL

---

## Backlog (lower priority, do after public launch)

| Item | Notes |
|------|-------|
| Alpaca WebSocket stream | Real-time quote streaming for equities (currently polling via REST snapshots) |
| Earnings calendar filter | Skip stocks with earnings in next 24h (high risk) — data from Alpaca `/v2/corporate_actions` or free Nasdaq calendar |
| Backtest on historical data | Alpaca provides 5+ years of daily bars — could run a backtest against the stock scanner strategy |
| PDT rule enforcement | If account < $25k, enforce max 3 day trades per 5 days in the execution layer |
| W&B integration | Wire `wandb` into the ML training data pipeline that already collects 30+ features per trade |
| Python ML microservice | Move RL/ML pipeline to FastAPI + PyTorch (your strength) and expose via internal API |
| SBOM | Run `cyclonedx-bom` before any enterprise job application |

---

## Key Env Vars Needed to Test

```env
# Aster DEX (crypto)
ASTER_API_KEY=
ASTER_SECRET_KEY=

# Alpaca (equities) — sign up free at alpaca.markets
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
ALPACA_PAPER=true

# LLM
LLM_PROVIDER=groq
GROQ_API_KEY=

# Asset class
TRADING_ASSET_CLASS=both   # crypto | equity | both

# Database (optional)
DATABASE_URL=
```

---

## Portfolio Positioning (reminder)

One-liner for resume/LinkedIn:
> *"Full-stack autonomous trading system — four DeepSeek R1 agents, real exchange integration (Aster DEX + Alpaca), Kelly/Monte Carlo risk math, ML feedback loop, deployed on Vercel. Supports both crypto and US equities."*

Target roles: ML Engineer, AI Engineer, LLM Engineer — DFW preferred.

---

## Repo Info

- GitHub: `https://github.com/omnipotence-eth/manna-trading` (currently private)
- Local: `C:\Users\ttimm\Documents\Project Portfolio\manna-trading`
- Deploy target: Vercel (free tier, config already in `vercel.json`)
