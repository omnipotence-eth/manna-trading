# Manna Project: Gaps & Highest-Value Parts

**Purpose:** What’s missing, and what’s most valuable for (1) real-life crypto investing and (2) your work portfolio.

---

## What’s missing

### For real-life crypto investing

| Gap | Why it matters | Effort |
|-----|----------------|--------|
| **No trade alerts / notifications** | You don’t know when a trade opens or closes unless you’re on the dashboard. Discord/Telegram/email would let you react or review from your phone. | Medium – hook into existing “trade executed” / “position closed” logs. |
| **No backtest on historical data** | You can’t see “how would this strategy have done over the last 6 months?” before risking money. Simulation is forward-only. | High – need historical klines + a backtest runner. |
| **No simple “why did we trade?” audit** | For learning and taxes, you want a clear log: “We bought X because …” and “We sold because …” in one place. Some of this exists in DB/chat but isn’t a single, exportable audit trail. | Low – add an audit view/export that ties trade id → workflow summary. |
| **No tax-friendly export** | CSV/JSON export exists (`/api/export`) but isn’t framed as “tax report” (e.g. no cost basis, no “proceeds” column). One clear “tax export” with date, symbol, side, size, price, fees, P&amp;L helps at year-end. | Low – document the export + optionally add a tax-oriented view or second CSV format. |
| **No circuit breaker / daily loss limit** | If the bot has a bad day, there’s no automatic “stop trading after -X% or -$Y.” Important for real money. | Medium – config + check in agent runner or execution layer. |
| **No “paper vs live” comparison** | You can’t easily compare “what simulation did” vs “what live did” on the same period to validate the system. | Medium – same symbols/time, two data sources, one comparison view. |

### For portfolio / employability

| Gap | Why it matters | Effort |
|-----|----------------|--------|
| **No automated tests** | Recruiters and senior devs expect at least a few tests. Right now there are no real unit/integration tests; everything is “it runs.” | Medium – start with 1–2 critical paths (e.g. Kelly sizing, export API). |
| **No live demo story** | “I built an AI trading system” is stronger with “and here’s the live demo” (simulation mode, no real money). One-click deploy + short “Demo” section in README helps. | Low – deploy on Vercel, add README “Demo” link and 1–2 screenshots. |
| **Architecture not summarized in one place** | You have `CODEBASE_STRUCTURE.md` and README; a single “Architecture in 1 page” (data flow: cron → scan → agents → execution → DB) would make the project easier to present. | Low – one new doc or README section. |
| **No “What I learned” or “Trade-offs”** | A short “Lessons learned” or “Trade-offs” section (e.g. “Why simulation first,” “Why Groq vs Ollama”) shows maturity and helps in interviews. | Low – add to README or a separate `LESSONS.md`. |

---

## Most valuable parts for real-life crypto investing

Use these first when you want the project to actually help you as an investor.

1. **Simulation mode + real market data**  
   You can run the full pipeline (scan → score → agents → execution) without risking capital. Use it to see what the system *would* do and tune confidence/score thresholds before going live.

2. **Market scanner + mathematical system**  
   `marketScannerService` + `mathematicalTradingSystem` (RSI, regime, Kelly, risk/reward) give you a structured, rule-based view of opportunities. Even if you don’t auto-trade, the “best opportunities” list is a useful screener.

3. **Export (JSON/CSV) and trade history**  
   `GET /api/export?format=csv` and trade history APIs give you a record of what the system did. Use this for review, learning, and as a base for tax reporting.

4. **Position monitor + Chandelier Exit**  
   Trailing logic and exit reasons (stop/target/Chandelier) are implemented. For real money, this is the kind of risk control that matters most.

5. **Cron-based 24/7 runs**  
   `/api/cron/trading-cycle` runs every 2 minutes on Vercel so the system can act even when you’re not on the app. That’s what makes it “set and forget” (with the right safeguards).

6. **Goal tracker**  
   You can set a target balance and milestones. Good for turning the system into “I’m trying to grow $X to $Y by date Z” instead of abstract trading.

**Next steps for investing:**  
Add alerts (e.g. Discord/Telegram on trade open/close), then a daily loss limit, then a tax-oriented export. Use simulation heavily before enabling live trading.

---

## Most valuable parts for your work portfolio

These are the pieces that tell a strong story in interviews and on your resume.

1. **Multi-agent AI pipeline (Technical → Chief → Risk → Execution)**  
   Clear separation of roles, orchestrated in one workflow. Easy to describe: “Four specialized agents; each does one job and passes to the next.” Shows you can design and implement non-trivial AI systems.

2. **Full-stack, production-style setup**  
   Next.js 14, API routes, PostgreSQL (or in-memory), env-based config, cron on Vercel. Demonstrates you can ship a complete application, not just a script.

3. **Real exchange integration (Aster DEX)**  
   Auth, orders, positions, leverage, klines, WebSockets. Shows you can integrate with external APIs and handle real-world failure modes (rate limits, reconnects, etc.).

4. **Quant-style building blocks**  
   Kelly criterion, Monte Carlo (risk of ruin), Sharpe/Sortino, Chandelier Exit, ATR-based stops, regime detection. Even if underused, they show you can implement and wire up quantitative ideas.

5. **ML/RL and data pipeline**  
   Trade features, ML training data collection, RL parameter optimizer, pattern analyzer. Good keywords and “I built a pipeline that learns from trades” is a strong one-liner.

6. **Documentation and structure**  
   README, `CODEBASE_STRUCTURE.md`, `FUTURE_FEATURES.md`, API docs, mathematical foundations. Shows you can organize and explain a large codebase.

**Portfolio narrative:**  
“I built a full-stack AI trading system: multi-agent workflow, real exchange integration, simulation-first, with quant risk (Kelly, Monte Carlo, trailing stops) and a cron-based 24/7 runner. I use it for my own crypto research and as a portfolio piece.”  
Then point to: repo, live demo (simulation), 1–2 screenshots, and the “Architecture in 1 page” or README diagram.

---

## Quick wins to do first

- **Portfolio:** Add a “Demo” link and 1–2 screenshots to the README; write one “Architecture in 1 page” section or doc; add a short “Lessons learned / Trade-offs” section.
- **Investing:** Add a single notification channel (e.g. Discord webhook) when a trade is opened or closed; document “Tax export” using existing `/api/export`; add a `MAX_DAILY_LOSS_PERCENT` (or similar) and skip new trades when exceeded.

This keeps the project saveable, presentable, and one step closer to something that actually helps you as a crypto investor and as a candidate.
