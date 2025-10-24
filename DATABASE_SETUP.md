# 🗄️ Vercel Postgres Database Setup

## Overview

Your AI trading bot now uses **Vercel Postgres** for permanent trade storage. This means:
- ✅ Trade history persists forever (no more cold-start resets)
- ✅ Fast queries and analytics
- ✅ Automatic backups
- ✅ Scales with your trading volume

---

## Setup Steps

### 1. Create Vercel Postgres Database

1. Go to your Vercel project: https://vercel.com/tremayne-timms-projects/manna-trading
2. Click **"Storage"** tab
3. Click **"Create Database"**
4. Select **"Postgres"**
5. Choose region (closest to your serverless functions - probably `us-east-1`)
6. Click **"Create"**

### 2. Environment Variables (Auto-configured)

Vercel automatically adds these to your project:
```
POSTGRES_URL
POSTGRES_PRISMA_URL
POSTGRES_URL_NON_POOLING
POSTGRES_USER
POSTGRES_HOST
POSTGRES_PASSWORD
POSTGRES_DATABASE
```

**No manual configuration needed!** ✅

### 3. Initialize Database

The database schema is created automatically on first API call. But you can manually initialize:

**Option A: Visit seed endpoint (also adds your SOL trade)**
```
https://ai.omnipotence.art/api/trades/seed
```

**Option B: Just use the app**
The database will auto-create tables on first `/api/trades` call.

---

## Database Schema

### `trades` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(255) PRIMARY KEY | Unique trade ID |
| `timestamp` | TIMESTAMP | Trade entry time |
| `model` | VARCHAR(100) | AI model name (e.g., "DeepSeek R1") |
| `symbol` | VARCHAR(20) | Trading pair (e.g., "SOL/USDT") |
| `side` | VARCHAR(10) | "LONG" or "SHORT" |
| `size` | DECIMAL(20,8) | Position size |
| `entry_price` | DECIMAL(20,2) | Entry price |
| `exit_price` | DECIMAL(20,2) | Exit price |
| `pnl` | DECIMAL(20,2) | Profit/Loss in USD |
| `pnl_percent` | DECIMAL(10,2) | ROE percentage |
| `leverage` | INTEGER | Leverage used |
| `entry_reason` | TEXT | AI's entry analysis |
| `entry_confidence` | DECIMAL(5,2) | Entry confidence % |
| `entry_signals` | JSONB | Signals detected |
| `entry_market_regime` | VARCHAR(50) | Market regime |
| `entry_score` | VARCHAR(20) | AI score |
| `exit_reason` | TEXT | AI's exit analysis |
| `exit_timestamp` | TIMESTAMP | Trade exit time |
| `duration` | INTEGER | Duration in seconds |
| `created_at` | TIMESTAMP | Database insert time |

### Indexes

- `idx_trades_timestamp` - Fast sorting by date
- `idx_trades_symbol` - Filter by trading pair
- `idx_trades_model` - Filter by AI model

---

## API Endpoints

### GET `/api/trades`

Fetch trade history from database.

**Query Parameters:**
- `symbol` (optional) - Filter by trading pair (e.g., `SOL/USDT`)
- `model` (optional) - Filter by AI model (e.g., `DeepSeek R1`)
- `limit` (optional) - Max results (default: 100)

**Example:**
```bash
curl https://ai.omnipotence.art/api/trades?limit=10
```

**Response:**
```json
{
  "success": true,
  "trades": [
    {
      "id": "trade-1234567890",
      "symbol": "SOL/USDT",
      "side": "LONG",
      "pnl": 0.11,
      "pnlPercent": 5.72,
      ...
    }
  ],
  "stats": {
    "totalTrades": 1,
    "wins": 1,
    "losses": 0,
    "winRate": 100,
    "totalPnL": 0.11,
    ...
  },
  "source": "postgres"
}
```

### POST `/api/trades`

Add a trade to database (called automatically by AI).

**Body:**
```json
{
  "id": "trade-xxx",
  "timestamp": "2025-10-24T21:00:00Z",
  "model": "DeepSeek R1",
  "symbol": "SOL/USDT",
  "side": "LONG",
  "size": 0.2,
  "entryPrice": 193.02,
  "exitPrice": 193.78,
  "pnl": 0.11,
  "pnlPercent": 5.72,
  "leverage": 20,
  "entryReason": "AI analysis...",
  "entryConfidence": 45,
  "entrySignals": ["Trend", "Volume"],
  "entryMarketRegime": "RANGING",
  "entryScore": "4/4",
  "exitReason": "Take profit triggered",
  "exitTimestamp": "2025-10-24T22:00:00Z",
  "duration": 3600
}
```

### GET `/api/trades/seed`

Manually add your SOL trade (one-time).

```bash
curl https://ai.omnipotence.art/api/trades/seed
```

---

## How It Works

### When AI Closes Position:

```
1. Position hits take profit/stop loss
   ↓
2. AI closes position on Aster
   ↓
3. Creates trade entry with full analysis
   ↓
4. Saves to Postgres database ✅
   ↓
5. Logs success: "Trade saved to Postgres database"
```

### When You Open Dashboard:

```
1. Browser loads
   ↓
2. Calls /api/trades
   ↓
3. Fetches from Postgres ✅
   ↓
4. Displays in Trade Journal
```

**Result:** All trades persist permanently, even after:
- ✅ Serverless cold starts
- ✅ Browser closes
- ✅ Vercel redeployments
- ✅ Server restarts

---

## Monitoring

### Check Database via Vercel Dashboard

1. Go to **Storage** tab in Vercel
2. Click your Postgres database
3. Click **"Data"** to browse tables
4. Run SQL queries directly

### Query Examples

**See all trades:**
```sql
SELECT * FROM trades ORDER BY timestamp DESC LIMIT 10;
```

**Calculate win rate:**
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
  (SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)::float / COUNT(*) * 100) as win_rate
FROM trades;
```

**Best trades:**
```sql
SELECT symbol, pnl, pnl_percent, timestamp 
FROM trades 
ORDER BY pnl DESC 
LIMIT 5;
```

---

## Backup & Maintenance

### Automatic Backups
Vercel Postgres includes:
- ✅ Point-in-time recovery (last 7 days)
- ✅ Automatic daily backups
- ✅ 99.95% uptime SLA

### Optional: Clean Old Trades

To delete trades older than 90 days:
```typescript
import { deleteOldTrades } from '@/lib/db';

// Delete trades older than 90 days
await deleteOldTrades(90);
```

---

## Migration Complete! ✅

**Before (In-Memory):**
- ❌ Trades lost on cold start (~15 min inactivity)
- ❌ Lost on redeploy
- ❌ Max 100 trades
- ❌ No analytics

**After (Postgres):**
- ✅ Permanent storage
- ✅ Survives all restarts
- ✅ Unlimited trades
- ✅ Full SQL analytics
- ✅ Automatic backups

---

## Next Steps

1. **Deploy to Vercel** (done automatically with next push)
2. **Create Postgres database** in Vercel dashboard
3. **Visit seed endpoint** to add your SOL trade
4. **Check Trade Journal** - should show all trades permanently!

**Your trade history will NEVER be lost again!** 🎉

