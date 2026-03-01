# Lessons learned & trade-offs

Design decisions and trade-offs from building Manna. Useful for maintainers, contributors, and portfolio discussions.

## Why simulation first

- **Default is simulation** so the app can be shown as a portfolio piece and tuned without risking money.
- Real market data (Aster DEX) is used; only order execution is simulated. That keeps the pipeline realistic.

## Why Groq vs Ollama

- **Groq** – Free cloud API, works on Vercel, no GPU. Good for demos and production when you don’t want to run a server.
- **Ollama** – Local GPU, no rate limits, better for heavy local backtesting. Not available on serverless.

## Why cron runs once per day on Vercel (free)

- **Vercel Hobby** allows only **one cron run per day** (e.g. `0 12 * * *`). Hourly or every-2-min crons require **Pro**.
- So on the free tier, trading cycles run once per day. For more frequent runs: upgrade to Pro or use an external cron (e.g. cron-job.org) calling `/api/cron/trading-cycle` with `CRON_SECRET`.

## Why serverless needs “run one cycle” without “runner”

- On Vercel there is no long-lived process; each request is a new instance. So the in-memory “Agent Runner” is not “running” between requests.
- The cron endpoint uses **runOneCycleForCron()**, which runs one full cycle without requiring `isRunning`. That way every cron hit does scan → score → workflow → possible trade.

## Trade-offs

- **No backtester (yet)** – Simulation is forward-only. Historical backtest would need stored klines and a separate runner.
- **Alerts are best-effort** – Discord/webhook notifications are fire-and-forget; if the webhook fails, we don’t retry (to keep the pipeline simple).
- **Daily loss limit uses DB** – Circuit breaker uses “today’s realized PnL” from the database. Without a DB, it doesn’t trigger (acceptable for local/simulation).

## What we’d do differently

- Add **tests** from day one for at least: export API, Kelly sizing, and one agent-runner path.
- Add **one notification channel** (e.g. Discord) earlier — it makes the system feel “alive” and helps debugging.
- Document **Vercel free-tier cron limit** in the README from the start to set expectations.
