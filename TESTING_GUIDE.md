# 🧪 Testing Guide: Version 3.0 Multi-Agent System

## 📋 Testing Strategy Overview

**Recommendation: Test locally first, then deploy separately**

Since you have version 2.0 running on Vercel, here's the best approach:

### ✅ DO NOT DELETE Vercel Deployment
- Keep version 2.0 running on Vercel (it's stable)
- Test version 3.0 locally first
- Deploy version 3.0 to a **separate Vercel project** when ready

---

## 🎯 Testing Phases

### Phase 1: Local Testing (Recommended First) ⭐

**Why Test Locally:**
- ✅ Uses your local GPU (RTX 5070 Ti) - best performance
- ✅ Easy to debug and monitor logs
- ✅ No Vercel deployment needed
- ✅ Can stop/start instantly
- ✅ Free to test (no cloud costs)

**Setup:**

1. **Ensure Ollama is Running:**
```bash
# Check Ollama is running
ollama list

# Verify DeepSeek R1 is available
ollama list | grep deepseek-r1

# If not installed:
ollama pull deepseek-r1:32b
```

2. **Start Local Development Server:**
```bash
# Navigate to project directory
cd C:\Users\ttimm\Desktop\Manna

# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

3. **Access Dashboard:**
- Open browser: `http://localhost:3000`
- Dashboard will be available locally

4. **Start Trading System:**
- Go to dashboard
- Click "Start Trading" or use API endpoint:
```bash
# Start via API
curl http://localhost:3000/api/trading/start
```

5. **Monitor System:**
- Watch logs in terminal
- Check dashboard for agent insights
- Monitor positions in real-time
- Review trade history

**What to Test:**
- [ ] System starts without errors
- [ ] Ollama connection works
- [ ] Market scanner finds opportunities
- [ ] AI agents make decisions
- [ ] Risk manager calculates position sizes
- [ ] Trades execute (test with small amounts)
- [ ] Position monitoring works
- [ ] Dashboard displays data correctly

---

### Phase 2: Separate Vercel Project (When Ready)

**Why Separate Project:**
- ✅ Version 2.0 stays running (production)
- ✅ Version 3.0 tested independently
- ✅ Can compare performance side-by-side
- ✅ Easy rollback if needed

**Setup:**

1. **Create New Vercel Project:**
   - Go to Vercel dashboard
   - Click "Add New Project"
   - Import same GitHub repo
   - Name it: `manna-v3-test` or `manna-multi-agent`

2. **Configure Environment Variables:**
   - Copy from version 2.0 project
   - Add `OLLAMA_BASE_URL` pointing to your tunnel (see Option 2 below)

3. **Choose LLM Option:**

   **Option A: Use Tunnel (Easiest for Testing)**
   ```bash
   # Install ngrok (if not installed)
   # Download from: https://ngrok.com/download
   
   # Start tunnel to Ollama
   ngrok http 11434
   
   # Copy HTTPS URL (e.g., https://abc123.ngrok.io)
   # Set in Vercel: OLLAMA_BASE_URL=https://abc123.ngrok.io
   ```

   **Option B: Deploy to VPS (Better for Production)**
   - Deploy Ollama to VPS with GPU
   - Set `OLLAMA_BASE_URL=https://your-vps.com`

4. **Deploy and Test:**
   - Push code to GitHub
   - Vercel auto-deploys
   - Monitor logs in Vercel dashboard
   - Compare with local version

---

## 🚀 Quick Start: Local Testing

### Step-by-Step Checklist

```bash
# 1. Verify Prerequisites
✓ Node.js 18+ installed
✓ Ollama running (localhost:11434)
✓ DeepSeek R1 model available
✓ PostgreSQL database accessible
✓ Aster DEX API credentials ready

# 2. Setup Environment
cd C:\Users\ttimm\Desktop\Manna
npm install

# 3. Create .env file (if not exists)
# Copy from version 2.0 or create new with:
ASTER_API_KEY=your_key
ASTER_SECRET_KEY=your_secret
DATABASE_URL=your_database_url
OLLAMA_BASE_URL=http://localhost:11434
ENABLE_24_7_AGENTS=true

# 4. Start Development Server
npm run dev

# 5. Open Dashboard
# Browser: http://localhost:3000

# 6. Initialize System
# Visit: http://localhost:3000/api/startup
# Or click "Start Trading" in dashboard

# 7. Monitor
# - Watch terminal logs
# - Check dashboard for agent insights
# - Monitor positions
```

---

## 🔍 What to Monitor During Testing

### 1. System Health
- Check Ollama connection: `http://localhost:3000/api/multi-agent?action=test-deepseek`
- Verify database connection
- Check Aster DEX API connectivity

### 2. Agent Performance
- Agent insights appear in dashboard
- Technical analysis quality
- Risk assessment accuracy
- Execution decisions

### 3. Trading Activity
- Market scanner finds opportunities
- Trades execute correctly
- Position sizes are appropriate
- Stop-loss/take-profit work

### 4. Data Flow
- Positions update in real-time
- Trade history saves correctly
- Dashboard displays accurate data
- Performance metrics calculate

---

## 🐛 Troubleshooting Local Testing

### Ollama Not Connecting
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama if needed
ollama serve

# Verify model is available
ollama list | grep deepseek-r1
```

### Database Connection Issues
```bash
# Test database connection
# Check DATABASE_URL in .env
# Verify SSL settings for Neon/Supabase
```

### System Won't Start
```bash
# Check logs in terminal
# Verify all environment variables set
# Check port 3000 is available
# Try: npm run build (check for errors)
```

### No Trades Executing
- Lower confidence threshold (try 0.45-0.50)
- Check minimum balance requirements
- Verify symbol is not blacklisted
- Check logs for rejection reasons

---

## 📊 Comparison: Version 2.0 vs Version 3.0

### Version 2.0 (Current Vercel)
- Algorithm-based trading
- Simple logic
- Proven stable
- ✅ Keep running

### Version 3.0 (Testing)
- Multi-agent AI system
- DeepSeek R1 LLM reasoning
- Advanced risk management
- More sophisticated decision-making

**Test Metrics to Compare:**
- Win rate
- Average profit per trade
- Risk-adjusted returns
- Trade frequency
- Position sizing accuracy

---

## 🎯 Recommended Testing Workflow

### Week 1: Local Testing
1. Run locally for 24-48 hours
2. Monitor all system components
3. Test with small positions
4. Document any issues
5. Fix bugs before deploying

### Week 2: Separate Vercel Deployment
1. Deploy to new Vercel project
2. Use tunnel for Ollama (quick setup)
3. Run parallel to version 2.0
4. Compare performance
5. Collect data for 1 week

### Week 3: Production Decision
1. Analyze results
2. Compare version 2.0 vs 3.0
3. Decide which to use
4. Either:
   - Keep both running
   - Switch version 2.0 to 3.0
   - Keep version 2.0, archive 3.0

---

## ⚠️ Important Notes

### Don't Delete Version 2.0
- It's your proven system
- Keep it running as backup
- Easy to switch back if needed
- Compare performance side-by-side

### Start Small
- Test with minimal positions first
- Gradually increase after confidence
- Monitor closely for first week
- Keep risk management strict

### Use Separate Database
- Consider using separate database for testing
- Or use different environment
- Prevents data conflicts
- Easier to compare results

---

## 🚀 Quick Start Commands

```bash
# Start everything locally
npm run dev

# Test Ollama connection
curl http://localhost:11434/api/tags

# Start trading system
curl http://localhost:3000/api/trading/start

# Check system status
curl http://localhost:3000/api/trading/status

# View logs
# Check terminal where npm run dev is running
```

---

## ✅ Testing Checklist

Before going to production:

- [ ] System starts without errors locally
- [ ] All agents initialize correctly
- [ ] Ollama connection works
- [ ] Market scanner finds opportunities
- [ ] AI agents make decisions
- [ ] Risk manager calculates correctly
- [ ] Trades execute successfully
- [ ] Positions monitor correctly
- [ ] Dashboard displays data
- [ ] Database saves trades
- [ ] Performance metrics accurate
- [ ] Tested for 24-48 hours minimum
- [ ] No critical errors
- [ ] Performance acceptable

---

## 📞 Next Steps

1. **Start Local Testing Now** ⭐
   - Run `npm run dev`
   - Monitor for 24-48 hours
   - Document any issues

2. **When Ready for Cloud Testing**
   - Deploy to separate Vercel project
   - Use tunnel for Ollama
   - Compare with version 2.0

3. **Production Decision**
   - After sufficient testing
   - Compare metrics
   - Decide on deployment strategy

**Remember: Keep version 2.0 running as backup!**

