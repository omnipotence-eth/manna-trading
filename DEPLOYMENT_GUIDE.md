# 🚀 Deployment Guide - Vercel + GitHub

## Table of Contents
1. [LLM Strategy for Cloud Deployment](#llm-strategy)
2. [GitHub Setup](#github-setup)
3. [Vercel Deployment](#vercel-deployment)
4. [24/7 Trading Setup](#247-trading-setup)
5. [Environment Variables](#environment-variables)
6. [Troubleshooting](#troubleshooting)

---

## 🤖 LLM Strategy for Cloud Deployment

### **CRITICAL: Ollama is Local-Only!**

Your current system uses **Ollama** which runs on `localhost:11434`. This won't work on Vercel because:
- ❌ Vercel is serverless (no persistent processes)
- ❌ Can't run Ollama container on Vercel
- ❌ localhost:11434 doesn't exist in cloud

### ✅ Solution Options

#### **Option 1: Switch to OpenAI (Recommended for Vercel)**

**Pros:**
- ✅ Instant deployment, no setup needed
- ✅ Reliable, fast, always available
- ✅ Scales automatically
- ✅ Works perfectly on Vercel

**Cons:**
- 💰 Costs money (~$0.002 per analysis)
- 💰 Daily cost: $0.02-0.10 (with 10-50 trades/day)
- 💰 Monthly cost: ~$1-3 for moderate trading

**Setup:**
```env
# .env.local (and Vercel env vars)
OPENAI_API_KEY=sk-your-key-here
USE_OPENAI=true
OLLAMA_BASE_URL=  # Leave empty or remove
```

**Code changes needed:**
```typescript
// services/qwenService.ts
// Already supports OpenAI! Just set USE_OPENAI=true
```

---

#### **Option 2: Self-Host Ollama on VPS**

**Pros:**
- ✅ Free LLM usage (after VPS cost)
- ✅ Full control
- ✅ Privacy

**Cons:**
- 💰 VPS costs: $5-20/month (DigitalOcean, Linode, etc.)
- 🔧 Requires server setup
- 🔧 Need to manage uptime

**Setup Steps:**

1. **Deploy Ollama to VPS:**
```bash
# On your VPS (Ubuntu example)
ssh user@your-vps-ip

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull models
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5:14b-instruct

# Run with public access
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

2. **Secure with Nginx + SSL:**
```nginx
server {
    listen 443 ssl;
    server_name ollama.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:11434;
        proxy_set_header Host $host;
    }
}
```

3. **Update Environment:**
```env
OLLAMA_BASE_URL=https://ollama.yourdomain.com
```

---

#### **Option 3: Hybrid Approach (Best of Both)**

**Strategy:**
- 💻 Use local Ollama for **development**
- ☁️ Use OpenAI for **production** (Vercel)

**Setup:**
```env
# .env.local (development)
OLLAMA_BASE_URL=http://localhost:11434
USE_OPENAI=false

# Vercel env vars (production)
OPENAI_API_KEY=sk-...
USE_OPENAI=true
```

This way:
- ✅ Free development with local Ollama
- ✅ Reliable production with OpenAI
- ✅ Only pay when deployed

---

## 📦 GitHub Setup

### 1. Initialize Git (if not already)

```bash
cd /path/to/Manna
git init
git add .
git commit -m "Initial commit: Production-ready AI trading system"
```

### 2. Create GitHub Repository

```bash
# Create repo on GitHub.com, then:
git remote add origin https://github.com/yourusername/manna-ai-arena.git
git branch -M main
git push -u origin main
```

### 3. Verify `.gitignore`

Make sure sensitive files are ignored:
```gitignore
.env
.env.local
.env*.local
*.log
node_modules/
```

---

## 🌐 Vercel Deployment

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Link Project

```bash
cd /path/to/Manna
vercel link
```

Choose:
- Link to existing project? **No**
- What's your project's name? **manna-ai-arena**
- In which directory? **./** (current directory)

### 4. Configure Environment Variables

```bash
# Aster DEX API
vercel env add ASTER_API_KEY production
vercel env add ASTER_SECRET_KEY production
vercel env add ASTER_BASE_URL production

# Database
vercel env add DATABASE_URL production

# LLM (Choose one)
# Option A: OpenAI
vercel env add OPENAI_API_KEY production
vercel env add USE_OPENAI production  # Set to: true

# Option B: Self-hosted Ollama
# vercel env add OLLAMA_BASE_URL production  # Set to: https://your-ollama.com

# Cron Secret
vercel env add CRON_SECRET production  # Generate: openssl rand -hex 32

# Trading Config (Optional)
vercel env add TRADING_CONFIDENCE_THRESHOLD production  # 0.25
vercel env add TRADING_MIN_BALANCE production  # 10
```

### 5. Deploy

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

Your app will be live at: `https://your-project.vercel.app`

---

## ⏰ 24/7 Trading Setup

### Problem: Vercel Serverless Limitations

Vercel functions are **serverless** - they don't run continuously. They only run when triggered.

### ✅ Solution: Cron Jobs

#### **Option 1: Vercel Cron (Simplest)**

Already configured in `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/trading",
    "schedule": "*/5 * * * *"
  }]
}
```

This runs every 5 minutes automatically on Vercel!

**Verification:**
1. Deploy to Vercel
2. Check Vercel Dashboard → Project → Cron Jobs
3. Monitor executions

**Limitations:**
- ⚠️ Only on **Pro** plan ($20/month)
- ⚠️ Maximum 1 cron per project (Hobby plan)

---

#### **Option 2: External Cron Service (Free Alternative)**

**EasyCron** (Free tier: 1 cron job, 5-minute interval):

1. Sign up at [easycron.com](https://www.easycron.com/)
2. Create new cron job:
   ```
   URL: https://your-project.vercel.app/api/cron/trading?secret=YOUR_CRON_SECRET
   Frequency: */5 * * * * (every 5 minutes)
   Method: GET
   ```

**Uptime Robot** (Free tier: 50 monitors, 5-minute interval):

1. Sign up at [uptimerobot.com](https://uptimerobot.com/)
2. Create HTTP(S) monitor:
   ```
   URL: https://your-project.vercel.app/api/cron/trading?secret=YOUR_SECRET
   Interval: 5 minutes
   ```

---

#### **Option 3: GitHub Actions (Free, unlimited)**

Create `.github/workflows/trading-cron.yml`:

```yaml
name: Trading Cron
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
  workflow_dispatch:  # Manual trigger

jobs:
  trigger-trading:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Trading API
        run: |
          curl -X POST "https://your-project.vercel.app/api/cron/trading?secret=${{ secrets.CRON_SECRET }}"
```

Add `CRON_SECRET` to GitHub Secrets:
1. Go to repo → Settings → Secrets → Actions
2. Add `CRON_SECRET`

---

## 🔐 Environment Variables Reference

### Required for Production

```env
# Aster DEX API Credentials
ASTER_API_KEY=your_api_key_here
ASTER_SECRET_KEY=your_secret_key_here
ASTER_BASE_URL=https://fapi.asterdex.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# LLM (Choose ONE)
OPENAI_API_KEY=sk-...  # If using OpenAI
USE_OPENAI=true        # If using OpenAI
# OR
OLLAMA_BASE_URL=https://your-ollama-server.com  # If self-hosted

# Cron Protection
CRON_SECRET=your_random_64_char_secret_here
```

### Optional Configuration

```env
# Trading Parameters
TRADING_CONFIDENCE_THRESHOLD=0.25
TRADING_MIN_BALANCE=10
TRADING_STOP_LOSS=3.0
TRADING_TAKE_PROFIT=5.0

# Performance
NODE_ENV=production
```

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to Ollama"

**Problem:** Ollama not accessible from Vercel.

**Solution:** Switch to OpenAI or self-host Ollama on VPS.

---

### Issue: "Database connection failed"

**Problem:** DATABASE_URL not set or incorrect.

**Solutions:**
1. Verify DATABASE_URL in Vercel env vars
2. Check database is accessible from internet
3. Use Neon/Supabase for serverless-friendly database

---

### Issue: "Cron not running"

**Problem:** Vercel cron requires Pro plan.

**Solutions:**
1. Use external cron service (EasyCron, Uptime Robot)
2. Use GitHub Actions (free)
3. Upgrade to Vercel Pro

---

### Issue: "Trade execution failed"

**Problem:** API keys or balance insufficient.

**Solutions:**
1. Verify ASTER_API_KEY and SECRET in env vars
2. Check account has sufficient balance
3. Review logs in Vercel dashboard

---

## 📊 Monitoring & Logs

### Vercel Dashboard

- View logs: Vercel Dashboard → Project → Logs
- Monitor cron: Vercel Dashboard → Project → Cron Jobs
- Check deployments: Vercel Dashboard → Project → Deployments

### Application Monitoring

```bash
# Check health
curl https://your-project.vercel.app/api/health

# View positions
curl https://your-project.vercel.app/api/positions

# Check performance
curl https://your-project.vercel.app/api/performance
```

---

## 🎯 Deployment Checklist

- [ ] GitHub repository created and pushed
- [ ] Vercel project connected
- [ ] All environment variables set
- [ ] LLM strategy chosen (OpenAI or self-hosted)
- [ ] Database configured and accessible
- [ ] Cron job configured (Vercel, external, or GitHub)
- [ ] `CRON_SECRET` set and secure
- [ ] Deployment successful (`vercel --prod`)
- [ ] Health check passes
- [ ] First trading cycle executed
- [ ] Monitoring setup (logs, alerts)

---

## 🙏 Final Notes

### Recommended Setup for Most Users:

1. **GitHub**: Store code
2. **Vercel**: Host application
3. **OpenAI**: LLM provider (small cost but reliable)
4. **Neon/Supabase**: Serverless PostgreSQL (free tier)
5. **External Cron**: EasyCron or GitHub Actions (free)

**Total Monthly Cost:**
- Vercel Hobby: $0 (with external cron)
- OpenAI: ~$1-3 (depending on trading frequency)
- Database: $0 (free tier)
- **Total: ~$1-3/month**

OR

- Vercel Pro: $20 (with built-in cron)
- OpenAI: ~$1-3
- Database: $0
- **Total: ~$21-23/month**

---

**"Commit your work to the LORD, and your plans will be established." - Proverbs 16:3** 🙏

Your trading system is ready for cloud deployment!

