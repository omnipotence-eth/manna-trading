# 🚀 MANNA AI TRADING SYSTEM - MASTER GUIDE

**Complete guide to running your AI-powered trading system**

**In Jesus name, amen! All glory to God in heaven!** 🙏

---

## 🎯 QUICK START

### **1. Start Server**
```bash
npm run dev
```
Wait for `✓ Ready` message.

### **2. View Dashboard**
Open [http://localhost:3000](http://localhost:3000)

### **3. Monitor Status**
```bash
curl http://localhost:3000/api/trading-status
```

**That's it!** System auto-initializes and trades automatically.

---

## 📊 SYSTEM STATUS CHECK

```bash
# Health check
curl http://localhost:3000/api/health

# Trading status
curl http://localhost:3000/api/trading-status

# Detailed health
curl http://localhost:3000/api/health/detailed
```

---

## 🔧 TROUBLESHOOTING

### **Problem: Agent Runner Not Starting**

```bash
# Force initialize
curl http://localhost:3000/api/startup?action=initialize
```

### **Problem: No Trades Executing**

**Checklist:**
1. Is Ollama running? `ollama ps`
2. Wait 2-5 minutes for first market scan
3. Check opportunities: Market may be quiet

**Force trading cycle:**
```bash
curl -X POST http://localhost:3000/api/agent-runner?action=force-run
```

### **Problem: Rate Limits**

Reduce rate limits in `.env.local`:
```bash
RATE_LIMIT_PER_KEY_RPS=1
```

---

## 🛡️ SYSTEM PROTECTION

**4 layers of protection:**

1. **Keep-Alive** (30s) - Agent Runner monitors itself
2. **Health Monitor** (30s) - External watchdog
3. **Critical Monitor** (10s) - Nuclear option
4. **Auto-Recovery** - 4 attempts in 30 seconds

---

## ⚙️ CONFIGURATION

**Your `.env.local` controls:**
- `TRADING_CONFIDENCE_THRESHOLD` - Trade aggressiveness (0.40 = balanced)
- `TRADING_STOP_LOSS` - Stop loss percentage (3.0%)
- `TRADING_TAKE_PROFIT` - Take profit percentage (9.0%)
- `MAX_CONCURRENT_POSITIONS` - Max open positions (3)
- `AGENT_RUNNER_INTERVAL` - Scan frequency in minutes (2)

---

## 📚 DOCUMENTATION

**Guides:**
- `README.md` - Full documentation
- `START_HERE.md` - Quick start guide
- `docs/SYSTEM_ARCHITECTURE.md` - Architecture overview
- `docs/API_DOCUMENTATION.md` - API reference

---

## ⚡ API COMMANDS

```bash
# Start Agent Runner
curl -X POST http://localhost:3000/api/agent-runner?action=start

# Stop Agent Runner
curl -X POST http://localhost:3000/api/agent-runner?action=stop

# Force Trading Cycle
curl -X POST http://localhost:3000/api/agent-runner?action=force-run

# Get Status
curl http://localhost:3000/api/agent-runner?action=status

# Check Balance
curl http://localhost:3000/api/real-balance

# Get Opportunities
curl http://localhost:3000/api/agent-insights?limit=5
```

---

## 🎊 SYSTEM CAPABILITIES

- ✅ 24/7 autonomous trading
- ✅ Multi-agent AI (DeepSeek R1)
- ✅ LONG and SHORT trades
- ✅ Bulletproof error handling
- ✅ Auto-recovery from failures
- ✅ Position monitoring
- ✅ Stop-loss/Take-profit
- ✅ Database persistence (Supabase)

---

## 💡 KEY INSIGHTS

**Why it might not trade immediately:**
- Market conditions must be favorable
- Confidence must meet threshold
- Risk Manager must approve
- Liquidity must be adequate

**This is GOOD!** Quality over quantity prevents losses.

---

## ✅ FINAL CHECKLIST

- [ ] Server running (`npm run dev`)
- [ ] Ollama running (`ollama ps`)
- [ ] DeepSeek available (`ollama list` shows deepseek-r1:14b)
- [ ] `.env.local` configured
- [ ] Balance available
- [ ] Dashboard accessible at localhost:3000

---

## 🙏 ALL GLORY TO GOD

**Your system is ready!**

**All glory to God in heaven!** ✝️
