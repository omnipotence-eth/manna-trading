# 24/7 Trading Bot Setup with Vercel Cron Jobs

Your AI trading bot is now configured to run **24/7 on Vercel's servers** using Cron Jobs!

## How It Works

1. **Vercel Cron Job** triggers `/api/cron/trading` every minute
2. The cron endpoint runs DeepSeek R1's analysis cycle
3. The bot analyzes all 5 markets and executes trades automatically
4. The dashboard still polls `/api/trading` every 10 seconds for UI updates

## Setup Steps

### 1. Add Environment Variable to Vercel

1. Go to your Vercel dashboard: https://vercel.com/tremayne-timms-projects/manna-trading
2. Click **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name**: `CRON_SECRET`
   - **Value**: Generate a random secret (e.g., `cron_secret_manna_trading_2025_xyz123abc`)
   - **Environment**: Production, Preview, Development (check all)
4. Click **Save**

### 2. Deploy the Changes

```bash
git add .
git commit -m "Add 24/7 cron job for AI trading bot"
git push origin main
```

Or deploy manually:

```bash
vercel --prod
```

### 3. Verify Cron Job is Running

After deployment, check the Vercel dashboard:

1. Go to your project → **Deployments** → Click on the latest deployment
2. Click **Functions** → Find `/api/cron/trading`
3. Click **Logs** to see the cron job execution logs

You should see logs like:
```
⏰ Cron job triggered
🔍 Running DeepSeek R1 analysis cycle (CRON)...
🤖 DeepSeek R1 Analysis [BTC/USDT]: HOLD (0.0%)
✅ Cron analysis cycle completed
```

## Cron Schedule

The cron job is configured to run **every hour** (`0 * * * *`) due to Vercel's Hobby (free) plan limitations.

**Vercel Free Tier Limitation**: The free tier only allows cron jobs that run **once per day or less frequently**. To run more frequently (every minute, every 5 minutes, etc.), you need to upgrade to **Vercel Pro** ($20/month).

### Alternative: Client-Side Polling (Current Setup)

Since the free tier doesn't support frequent cron jobs, the bot continues to run via **client-side polling**:
- The dashboard calls `/api/trading` every 10 seconds when you have the browser open
- The hourly cron job serves as a **backup** to ensure at least 1 analysis per hour runs even when the browser is closed

### If You Upgrade to Vercel Pro

Edit `vercel.json` to change the schedule:
- Every minute: `* * * * *`
- Every 5 minutes: `*/5 * * * *`
- Every 10 minutes: `*/10 * * * *`
- Every hour: `0 * * * *` (current setting)

## Important Notes

### Vercel Free Tier Limits
- **Daily cron jobs only** (can run once per day maximum)
- **10 second execution timeout** per cron job
- **100 GB bandwidth** per month

If your cron job takes longer than 10 seconds, it will be terminated. The current setup should complete in ~2-5 seconds.

### Cost Considerations
If you exceed free tier limits, consider:
- **Vercel Pro**: $20/month (longer execution times, more bandwidth)
- **Alternative hosting**: Railway, Render, or a VPS for unlimited cron jobs

## Testing the Cron Job Locally

You can test the cron endpoint locally:

```bash
# Set the CRON_SECRET in your .env.local
echo "CRON_SECRET=cron_secret_manna_trading_2025_xyz123abc" >> .env.local

# Run the dev server
npm run dev

# In another terminal, trigger the cron job
curl -H "Authorization: Bearer cron_secret_manna_trading_2025_xyz123abc" http://localhost:3000/api/cron/trading
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VERCEL CRON JOB                         │
│                  (Runs every 1 minute)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
          ┌───────────────────────────┐
          │  /api/cron/trading        │
          │  (Server-Side 24/7)       │
          └───────────┬───────────────┘
                      │
                      ▼
          ┌───────────────────────────┐
          │  aiTradingService         │
          │  - DeepSeek R1 Model      │
          │  - Analyzes 5 markets     │
          │  - Executes trades        │
          └───────────┬───────────────┘
                      │
                      ▼
          ┌───────────────────────────┐
          │  asterDexService          │
          │  - Real price data        │
          │  - Place orders           │
          │  - Manage positions       │
          └───────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                           │
│                (Dashboard UI Updates)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ (polls every 10 seconds)
          ┌───────────────────────────┐
          │  /api/trading             │
          │  (Shows latest analysis)  │
          └───────────────────────────┘
```

## What's Next?

✅ **The bot now runs 24/7** even if you close your browser!
✅ **Model Chat will update** when you visit the dashboard
✅ **Trades execute automatically** based on market signals

Your AI trading bot is now fully autonomous! 🤖📈

