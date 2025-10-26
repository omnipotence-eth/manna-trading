# 🚀 Deployment Guide - Godspeed Trading System

> **Complete guide to deploying Godspeed to Vercel for 24/7 automated trading**

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Environment Variables](#environment-variables)
- [Vercel CLI Deployment](#vercel-cli-deployment)
- [Vercel Dashboard Deployment](#vercel-dashboard-deployment)
- [Cron Job Configuration](#cron-job-configuration)
- [Custom Domain Setup](#custom-domain-setup)
- [Monitoring & Logs](#monitoring--logs)
- [Troubleshooting](#troubleshooting)
- [Updating the Deployment](#updating-the-deployment)

---

## ✅ Prerequisites

Before deploying, ensure you have:

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Aster DEX API Credentials**:
   - API Key
   - Secret Key
3. **Node.js**: Version 18.x or higher
4. **Git**: For version control
5. **Vercel CLI**: Install globally
   ```bash
   npm install -g vercel
   ```

---

## 🔧 Initial Setup

### 1. Clone and Prepare Repository

```bash
# Clone the repository
git clone https://github.com/your-username/godspeed-trading.git
cd godspeed-trading

# Install dependencies
npm install

# Build to verify everything works
npm run build
```

### 2. Test Locally

```bash
# Create .env.local with your credentials
echo "ASTER_API_KEY=your_api_key_here" > .env.local
echo "ASTER_SECRET_KEY=your_secret_key_here" >> .env.local

# Run development server
npm run dev

# Test in browser
open http://localhost:3000
```

Verify:
- ✅ Dashboard loads
- ✅ Account balance displays
- ✅ Chart renders
- ✅ No console errors

---

## 🔐 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ASTER_API_KEY` | Aster DEX API key | `abc123...` |
| `ASTER_SECRET_KEY` | Aster DEX secret key | `xyz789...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CRON_SECRET` | Cron job authentication | *(optional)* |
| `DATABASE_URL` | PostgreSQL connection string | *(uses memory)* |
| `VERCEL_URL` | Auto-set by Vercel | *(auto)* |

### Getting Aster DEX API Keys

1. **Login to Aster DEX**
   - Go to [asterdex.com](https://asterdex.com)
   - Login to your account

2. **Navigate to API Management**
   - Click on your profile → API Management
   - Or go directly to API settings

3. **Create New API Key**
   - Click "Create API Key"
   - Set permissions: **Trade + Read**
   - Save the API Key and Secret Key securely

⚠️ **IMPORTANT**: 
- Never commit API keys to Git
- Store them in Vercel environment variables only
- Keep your secret key private

---

## 🚀 Vercel CLI Deployment

### Method 1: Quick Deploy

```bash
# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

Follow the prompts:
```
? Set up and deploy "~/godspeed-trading"? [Y/n] y
? Which scope? Your Username
? Link to existing project? [y/N] n
? What's your project's name? godspeed-trading
? In which directory is your code located? ./
```

### Method 2: Deploy to Existing Project

```bash
# Link to existing Vercel project
vercel link

# Deploy to production
vercel --prod
```

### Method 3: Deploy to Specific Domain

```bash
# Deploy to custom domain
vercel --prod --name=manna-trading
```

### Setting Environment Variables via CLI

```bash
# Add production environment variables
vercel env add ASTER_API_KEY production
vercel env add ASTER_SECRET_KEY production
vercel env add CRON_SECRET production

# List all environment variables
vercel env ls
```

---

## 🌐 Vercel Dashboard Deployment

### 1. Import Project

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import your Git repository:
   - GitHub: Connect and select repository
   - GitLab: Connect and select repository
   - Manual: Upload folder

### 2. Configure Project

**Framework Preset:** Next.js

**Build & Development Settings:**
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`
- Development Command: `npm run dev`

**Root Directory:** `./` (leave as is)

### 3. Add Environment Variables

In the project settings:

```
ASTER_API_KEY = your_aster_api_key_here
ASTER_SECRET_KEY = your_aster_secret_key_here
CRON_SECRET = generate_random_secret_here
```

To generate a secure `CRON_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Deploy

Click **"Deploy"**

Wait 2-3 minutes for:
- ✅ Building
- ✅ Deploying
- ✅ Assigning domains

---

## ⏰ Cron Job Configuration

### Automatic Setup

Godspeed's cron job is pre-configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/trading",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

This runs `/api/cron/trading` **every minute** for 24/7 trading.

### Verifying Cron Jobs

#### Check in Vercel Dashboard

1. Go to your project
2. Click **"Cron Jobs"** tab
3. Verify:
   - ✅ Job appears in list
   - ✅ Schedule: `*/1 * * * *`
   - ✅ Path: `/api/cron/trading`
   - ✅ Status: Active

#### Test Manually

```bash
# Test cron endpoint
curl https://your-deployment-url.vercel.app/api/cron/trading \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "message": "Cron trading cycle completed",
  "signals": [...],
  "bestSignal": {...}
}
```

### Cron Job Security

If `CRON_SECRET` is set, the cron endpoint requires authentication:

```typescript
// app/api/cron/trading/route.ts
const authHeader = request.headers.get('authorization');
const cronSecret = process.env.CRON_SECRET;

if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}
```

**Setting CRON_SECRET:**

1. In Vercel Dashboard:
   - Project → Settings → Environment Variables
   - Add `CRON_SECRET` = `your_generated_secret`

2. Redeploy:
   ```bash
   vercel --prod
   ```

---

## 🌍 Custom Domain Setup

### Add Custom Domain

#### Via Vercel Dashboard

1. Go to project → **Settings** → **Domains**
2. Click **"Add"**
3. Enter your domain: `ai.omnipotence.art`
4. Click **"Add"**

Vercel provides DNS records to configure:

```
Type: CNAME
Name: ai
Value: cname.vercel-dns.com
```

#### Via CLI

```bash
vercel domains add ai.omnipotence.art
```

### Configure DNS

1. **Go to your DNS provider** (e.g., Cloudflare, Namecheap)
2. **Add CNAME record**:
   - Type: `CNAME`
   - Name: `ai` (or `@` for root domain)
   - Value: `cname.vercel-dns.com`
   - TTL: `Auto` or `300`
3. **Save changes**

### Verify Domain

```bash
# Check domain status
vercel domains ls

# Test domain
curl https://ai.omnipotence.art/api/trading/status
```

---

## 📊 Monitoring & Logs

### Real-Time Logs

```bash
# Stream live logs
vercel logs your-deployment-url --follow

# Or use custom domain
vercel logs ai.omnipotence.art --follow
```

### Filter Logs

```bash
# Trading activity only
vercel logs ai.omnipotence.art | grep "EXECUTING\|Trade executed\|CLOSED"

# Errors only
vercel logs ai.omnipotence.art | grep "ERROR\|Failed"

# Cron jobs only
vercel logs ai.omnipotence.art | grep "Cron"
```

### Key Log Patterns

| Pattern | Meaning |
|---------|---------|
| `⏰ Cron job triggered` | Trading cycle started |
| `🔍 Analyzing 50 symbols` | Market scan in progress |
| `✅ TRADE APPROVED` | High confidence signal found |
| `🚀 GODSPEED EXECUTING` | Order being placed |
| `✅ GODSPEED TRADE EXECUTED` | Order filled |
| `🚨 CLOSING POSITION` | Stop-loss/take-profit triggered |
| `💾 Trade entry saved` | Trade recorded |
| `❌` or `ERROR` | Something went wrong |

### Dashboard Monitoring

**Vercel Analytics:**
1. Project → **Analytics** tab
2. View:
   - Function execution times
   - Error rates
   - Invocation counts

**Custom Monitoring:**

Access your live dashboard:
```
https://ai.omnipotence.art
```

Monitor:
- ✅ Account balance (updates every 2s)
- ✅ Performance chart (real-time)
- ✅ Trade history
- ✅ Open positions
- ✅ Model chat (Godspeed's decisions)

---

## 🐛 Troubleshooting

### Issue 1: Cron Job Not Running

**Symptoms:**
- No trades being executed
- Logs show no cron activity

**Solutions:**

1. **Check vercel.json exists and is correct**
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/trading",
         "schedule": "*/1 * * * *"
       }
     ]
   }
   ```

2. **Verify cron job in dashboard**
   - Project → Cron Jobs tab
   - Should show active job

3. **Check CRON_SECRET**
   - If set, must match in environment variables
   - If not needed, remove authentication check

4. **Redeploy**
   ```bash
   vercel --prod
   ```

### Issue 2: Environment Variables Not Working

**Symptoms:**
- API returns authentication errors
- Dashboard shows "Invalid API key"

**Solutions:**

1. **Verify variables are set**
   ```bash
   vercel env ls
   ```

2. **Re-add variables**
   ```bash
   vercel env rm ASTER_API_KEY production
   vercel env add ASTER_API_KEY production
   ```

3. **Redeploy to apply changes**
   ```bash
   vercel --prod
   ```

4. **Check variable names are correct**
   - Must be `ASTER_API_KEY` (not `ASTER_API_KEY_PROD`)
   - No typos or extra spaces

### Issue 3: Function Timeout

**Symptoms:**
- Logs show "Function execution timeout"
- Trading cycle doesn't complete

**Solutions:**

1. **Already optimized:**
   - Analyzes only top 50 coins
   - Max execution time: 4.5 minutes
   - Early termination enabled

2. **If still timing out:**
   - Reduce `MAX_SYMBOLS` in `aiTradingService.ts:73`
   - Reduce to 30 or 40 coins

3. **Check Vercel plan limits:**
   - Hobby: 10s max
   - Pro: 60s max
   - **Requires Pro plan for Godspeed**

### Issue 4: Chart Not Updating

**Symptoms:**
- Chart is flat
- Balance doesn't update

**Solutions:**

1. **Check API endpoint**
   ```bash
   curl https://your-url/api/optimized-data
   ```

2. **Check browser console for errors**
   - Open DevTools → Console
   - Look for fetch errors

3. **Verify caching is working**
   - Check `apiCache.ts` TTLs
   - Account info: 1s
   - Positions: 10s

4. **Hard refresh browser**
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

### Issue 5: Precision Errors

**Symptoms:**
- "Precision is over the maximum defined" error
- Orders fail to execute

**Solutions:**

1. **Already fixed in code:**
   - `getSymbolPrecision` fetches correct precision
   - `roundQuantity` rounds to exchange requirements

2. **If still occurring:**
   - Check `asterDexService.ts:1338-1380`
   - Verify `/exchangeInfo` endpoint works
   - Test manually:
     ```bash
     curl https://fapi.asterdex.com/fapi/v1/exchangeInfo
     ```

---

## 🔄 Updating the Deployment

### Method 1: Automatic (Git Push)

If connected to Git:

```bash
# Make changes
git add .
git commit -m "Update trading logic"
git push origin main

# Vercel auto-deploys from main branch
```

### Method 2: Manual (CLI)

```bash
# Make changes locally
npm run build  # Test build works

# Deploy to production
vercel --prod
```

### Method 3: Redeploy Latest

```bash
# Redeploy without changes (e.g., to apply new env vars)
vercel redeploy --prod
```

### Rollback to Previous Deployment

```bash
# List deployments
vercel ls

# Promote a specific deployment to production
vercel promote <deployment-url>
```

---

## 📋 Deployment Checklist

Before going live, verify:

- [ ] **Environment variables set**
  - `ASTER_API_KEY`
  - `ASTER_SECRET_KEY`
  - `CRON_SECRET` (optional)

- [ ] **Build succeeds**
  - Run `npm run build` locally
  - No TypeScript errors
  - No build warnings

- [ ] **Cron job configured**
  - `vercel.json` exists
  - Path: `/api/cron/trading`
  - Schedule: `*/1 * * * *`

- [ ] **Custom domain setup** (optional)
  - DNS CNAME record added
  - SSL certificate active
  - Domain resolves correctly

- [ ] **Testing completed**
  - Dashboard loads
  - Account balance displays
  - Chart renders
  - Trades execute (monitor for 5-10 minutes)

- [ ] **Monitoring active**
  - Vercel logs streaming
  - Dashboard accessible
  - No errors in console

---

## 🎯 Production Best Practices

### 1. Use Vercel Pro

**Why:** Hobby plan has 10s function timeout, Godspeed needs 60s+

**Cost:** $20/month

**Benefits:**
- 60s function timeout
- More bandwidth
- Better analytics

### 2. Set CRON_SECRET

**Why:** Prevents unauthorized cron job execution

**How:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
vercel env add CRON_SECRET production
```

### 3. Monitor Regularly

**Daily:**
- Check dashboard for trades
- Verify account balance updating
- Review Model Chat for decisions

**Weekly:**
- Review trade performance
- Check error logs
- Analyze win rate

### 4. Keep Dependencies Updated

```bash
# Check for updates
npm outdated

# Update minor versions
npm update

# Test locally
npm run build
npm run dev

# Deploy
vercel --prod
```

### 5. Version Control

```bash
# Tag important releases
git tag -a v2.1.0 -m "Improved risk management"
git push origin v2.1.0

# Create changelog
echo "## v2.1.0 - 2025-01-15" >> CHANGELOG.md
echo "- Improved risk management" >> CHANGELOG.md
git add CHANGELOG.md
git commit -m "Update changelog"
git push
```

---

## 📞 Support

### Vercel Support

- **Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Community**: [github.com/vercel/vercel/discussions](https://github.com/vercel/vercel/discussions)
- **Email**: support@vercel.com (Pro plan)

### Godspeed Support

- **GitHub Issues**: [Open an issue](https://github.com/your-username/godspeed-trading/issues)
- **Documentation**: [README.md](README.md) | [GODSPEED.md](GODSPEED.md)

---

**Deploy with confidence! May your trades be profitable! In Jesus' name, Amen!** 🙏✨

