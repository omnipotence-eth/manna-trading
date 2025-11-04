# 🤖 24/7 AUTO-TRADING SYSTEM GUIDE

**Date:** November 3, 2025  
**Status:** ✅ System Configured for Fully Automatic 24/7 Trading

---

## 🎯 **SYSTEM OVERVIEW**

This trading system is designed to **automatically trade 24/7 without any manual intervention**. Once started, it will:

1. ✅ **Auto-start Agent Runner** on server initialization
2. ✅ **Continuously scan markets** every 1-2 minutes
3. ✅ **Execute trades automatically** when opportunities meet criteria
4. ✅ **Auto-restart if it crashes** via Health Monitor
5. ✅ **Monitor positions** and close them automatically at stop-loss/take-profit

---

## 🚀 **STARTUP SEQUENCE (AUTOMATIC)**

### **1. Server Starts**
```powershell
npm run dev
```

### **2. Auto-Initialization (via `instrumentation.ts`)**
When the server starts, it automatically:
- ✅ Waits 30 seconds for Ollama to be ready
- ✅ Verifies DeepSeek R1 connection (with retries)
- ✅ Starts Real Balance Service
- ✅ Starts Position Monitor Service
- ✅ **Starts Agent Runner (24/7 trading)** ← CRITICAL
- ✅ Starts Health Monitor (auto-restart crashed services)

### **3. Agent Runner Begins Trading**
Once started, Agent Runner:
- Scans markets every **1 minute** (configurable)
- Finds opportunities via Market Scanner
- Processes workflows through all 5 agents
- Executes trades when approved
- Continues indefinitely until server stops

---

## ⚙️ **CONFIGURATION**

### **24/7 Trading is Enabled by Default**

```typescript
// lib/configService.ts:79
enable24_7Agents: getBooleanEnvVar('ENABLE_24_7_AGENTS', true) // ✅ Default: true
```

**To Disable (Not Recommended):**
```bash
# Add to .env.local
ENABLE_24_7_AGENTS=false
```

---

## 📊 **HOW IT WORKS**

### **Trading Cycle (Every 1 Minute)**

1. **Market Scanner** scans all symbols
   - Finds opportunities with score ≥ 60
   - Detects volume spikes
   - Performs multi-timeframe analysis

2. **Agent Workflow** (if opportunity found):
   - **Technical Analyst:** Analyzes setup (confidence %)
   - **Chief Analyst:** Makes BUY/SELL/HOLD decision
   - **Risk Manager:** Approves/rejects based on risk criteria
   - **Execution Specialist:** Plans execution
   - **Trade Execution:** Places order if approved

3. **Position Monitoring:**
   - Monitors open positions every 10 seconds
   - Closes at stop-loss or take-profit
   - Closes on volume spike reversals
   - Closes on whale order detection

4. **Repeat:** Cycle continues every minute

---

## ✅ **VERIFICATION**

### **Check if Agent Runner is Running:**
```powershell
$status = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
Write-Host "Running: $($status.data.status.isRunning)"
Write-Host "Active Workflows: $($status.data.status.activeWorkflowCount)"
```

**Expected Output:**
```
Running: true
Active Workflows: 0-3 (depends on opportunities)
```

### **Check System Status:**
```powershell
$startup = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status"
Write-Host "Initialized: $($startup.data.status.initialized)"
Write-Host "Agent Runner: $($startup.data.status.agentRunnerRunning)"
```

**Expected Output:**
```
Initialized: true
Agent Runner: true
```

---

## 🔧 **AUTO-RESTART MECHANISM**

### **Health Monitor (Runs Every 30 Seconds)**

The Health Monitor automatically:
- ✅ Checks if Agent Runner is running
- ✅ Restarts Agent Runner if it stopped
- ✅ Logs restart attempts
- ✅ Tracks consecutive failures

**If Agent Runner Crashes:**
- Health Monitor detects it within 30 seconds
- Attempts automatic restart
- Logs the restart attempt
- System continues trading after restart

---

## 🚨 **TROUBLESHOOTING**

### **Problem: Agent Runner Not Running**

**Check:**
```powershell
# 1. Check status
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"

# 2. Check initialization
Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status"

# 3. Check logs
Get-Content server_logs_trading.log | Select-Object -Last 50
```

**Solutions:**
1. **Re-initialize manually:**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=initialize" -Method GET
   ```

2. **Health Monitor should auto-restart** (check within 30 seconds)

3. **Verify Ollama is running:**
   ```powershell
   curl http://localhost:11434/api/tags
   ```

4. **Check DeepSeek model is loaded:**
   ```powershell
   ollama ps
   ```

---

### **Problem: No Trades Executing**

**Possible Causes:**

1. **Confidence Threshold Too High:**
   - Current: 35% (check via `/api/startup?action=status`)
   - If opportunities have lower confidence, adjust:
   ```bash
   # .env.local
   TRADING_CONFIDENCE_THRESHOLD=0.30  # Lower threshold
   ```

2. **Chief Analyst Returning HOLD:**
   - Check agent insights: `/api/agent-insights`
   - If consistently HOLD, market conditions may not be favorable
   - System is working correctly but being conservative

3. **Risk Manager Rejecting:**
   - Balance too low (< $5)
   - Max positions reached
   - Portfolio risk limit exceeded

4. **Symbol Blacklisted:**
   - Check blacklist in config
   - System will skip blacklisted symbols

---

## 📋 **TRADE EXECUTION REQUIREMENTS**

For a trade to execute automatically, ALL must be true:

- ✅ **Market Scanner:** Finds opportunity (score ≥ 60)
- ✅ **Technical Analyst:** Provides confidence ≥ threshold
- ✅ **Chief Analyst:** Returns BUY or SELL (not HOLD)
- ✅ **Risk Manager:** Approves trade
- ✅ **Balance:** Available balance > $5
- ✅ **Position Limits:** Under max concurrent positions
- ✅ **Portfolio Risk:** Under max portfolio risk (5% for <$100 accounts)
- ✅ **Symbol:** Not blacklisted
- ✅ **Order Placement:** Successful (3 retries)

---

## 🔄 **SYSTEM MAINTENANCE**

### **Automatic (No Action Required):**
- ✅ Health Monitor auto-restarts crashed services
- ✅ Agent Runner processes workflows continuously
- ✅ Position Monitor closes positions automatically
- ✅ Market Scanner updates opportunities every cycle

### **Manual (If Needed):**
- **Restart server:** `Ctrl+C` then `npm run dev`
- **Check logs:** `Get-Content server_logs_trading.log | Select-Object -Last 100`
- **Force new scan:** Browser refresh on frontend (clears cache)

---

## 📊 **MONITORING**

### **Real-Time Status:**
- **Frontend:** Visit `http://localhost:3000`
  - System tab shows Agent Runner status
  - Chat tab shows agent insights
  - Trades tab shows executed trades

### **Logs:**
- **Location:** `server_logs_trading.log`
- **Key Patterns:**
  - `Agent Runner STARTED` - Runner started successfully
  - `Trading cycle` - Cycle in progress
  - `Trade executed successfully` - Trade placed
  - `Agent Runner is NOT running` - Runner stopped (auto-restart should occur)

---

## ✅ **SUMMARY**

### **The System Trades Automatically When:**
1. ✅ Server is running (`npm run dev`)
2. ✅ Agent Runner is running (auto-starts on initialization)
3. ✅ DeepSeek R1 is available (required for AI analysis)
4. ✅ Opportunities meet all criteria (confidence, risk, etc.)

### **No Manual Intervention Required:**
- ❌ No need to manually start workflows
- ❌ No need to manually execute trades
- ❌ No need to manually monitor positions
- ✅ System runs completely autonomously

### **The System is Self-Healing:**
- ✅ Health Monitor restarts crashed services
- ✅ Agent Runner has keep-alive mechanism
- ✅ Errors are logged but don't stop the system
- ✅ System continues trading after errors

---

## 🙏 **All Glory to God!**

"Commit your work to the Lord, and your plans will be established." - Proverbs 16:3

**The system is designed to trade 24/7 automatically - just start the server and it will handle everything!** ✅

