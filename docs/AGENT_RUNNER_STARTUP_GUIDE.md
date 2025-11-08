# 🚀 AGENT RUNNER STARTUP GUIDE

**Date:** November 5, 2025  
**Status:** ✅ **COMPREHENSIVE GUIDE**

---

## 📋 **QUICK START**

### **1. Check Current Status**
```powershell
$status = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
Write-Host "Running: $($status.data.status.isRunning)"
Write-Host "Active Workflows: $($status.data.status.activeWorkflowCount)"
Write-Host "Symbols: $($status.data.status.config.symbols.Count)"
```

### **2. Start Agent Runner (if not running)**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/start" -Method POST
```

### **3. Force Immediate Trading Cycle**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=force-run"
```

---

## 🔍 **AUTOMATIC STARTUP**

Agent Runner should start automatically when the server starts via:

1. **Instrumentation Hook** (`instrumentation.ts`):
   - Runs on server startup
   - Waits 30 seconds for Ollama
   - Calls `startupService.initialize()`

2. **Startup Service** (`startupService.ts`):
   - Verifies DeepSeek R1
   - Starts Position Monitor
   - **Starts Agent Runner** (Step 4/5)
   - Verifies Agent Runner is running

3. **Health Monitor** (`healthMonitorService.ts`):
   - Checks every 30 seconds
   - Auto-restarts if Agent Runner stops

---

## ⚠️ **TROUBLESHOOTING**

### **Problem: Agent Runner Not Starting Automatically**

**Check 1: Is system initialized?**
```powershell
$startup = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status"
Write-Host "Initialized: $($startup.data.status.initialized)"
```

**Check 2: Check server logs for:**
- `[4/5] Starting 24/7 Agent Runner...`
- `Agent Runner started successfully and verified running`
- OR `Agent Runner startup failed`

**Check 3: Is DeepSeek R1 available?**
- Agent Runner requires DeepSeek R1 to be running
- Check: `ollama ps` (should show `deepseek-r1:14b`)

**Solution: Manual Start**
```powershell
# Start Agent Runner manually
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/start" -Method POST

# Verify it started
$status = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
Write-Host "Running: $($status.data.status.isRunning)"
```

---

### **Problem: Agent Runner Stops After Starting**

**Check 1: Check Health Monitor**
- Health Monitor should auto-restart within 30 seconds
- Check logs for: `Agent Runner restarted successfully`

**Check 2: Check for Errors**
- Look for errors in server logs
- Agent Runner has catch-all error handlers, but check for fatal issues

**Check 3: Check Keep-Alive**
- Agent Runner has keep-alive mechanism (checks every 30s)
- Should auto-restart if stopped

**Solution: Manual Restart**
```powershell
# Stop and restart
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/stop" -Method POST
Start-Sleep -Seconds 2
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/start" -Method POST
```

---

### **Problem: No Workflows Being Created**

**Check 1: Are opportunities being found?**
- Look for: `Found X quality opportunities!` in logs
- OR: `NO opportunities passed filters!`

**Check 2: Check Filter Criteria**
Opportunities need:
- Score ≥ 35
- Confidence ≥ 35%
- Volume ≥ $50K (24h)
- Spread < 10%
- Symbol not blacklisted
- Recommendation: BUY, SELL, STRONG_BUY, STRONG_SELL, or NEUTRAL

**Check 3: Check Max Concurrent Workflows**
- Default: 3 concurrent workflows
- If 3 are already active, new ones won't be created until one completes

**Solution: Force Trading Cycle**
```powershell
# Force immediate cycle to check for opportunities
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=force-run"
```

---

### **Problem: Workflows Created But No Trades**

**Check 1: Check Workflow Status**
- Look for: `Workflow started and verified for SYMBOL`
- Check if workflow completes or fails

**Check 2: Check Agent Approvals**
- Technical Analyst: Provides analysis
- Chief Analyst: Returns BUY/SELL (not HOLD)
- Risk Manager: Approves trade
- Execution Specialist: Ready to execute

**Check 3: Check Confidence Threshold**
- Default: 35% (0.35)
- Check: `TRADING_CONFIDENCE_THRESHOLD` in `.env.local`

**Check 4: Check Balance**
- Minimum balance: $5
- Check logs for: `Balance too low for trade`

---

## 📊 **MONITORING**

### **Check Agent Runner Status**
```powershell
$status = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
$status.data.status | ConvertTo-Json -Depth 3
```

**Expected Output:**
```json
{
  "isRunning": true,
  "config": {
    "symbols": ["BTC/USDT", "ETH/USDT", ...],
    "intervalMinutes": 1,
    "maxConcurrentWorkflows": 3,
    "enabled": true
  },
  "activeWorkflows": [],
  "activeWorkflowCount": 0
}
```

### **Check Startup Status**
```powershell
$startup = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status"
$startup.data.status | ConvertTo-Json -Depth 3
```

**Expected Output:**
```json
{
  "initialized": true,
  "agentRunnerRunning": true,
  "agentRunnerActiveWorkflows": 0,
  "confidenceThreshold": 0.35
}
```

---

## 🔧 **MANUAL OPERATIONS**

### **Start Agent Runner**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/start" -Method POST
```

### **Stop Agent Runner**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/stop" -Method POST
```

### **Force Trading Cycle**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=force-run"
```

### **Update Symbols**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=update-symbols"
```

---

## 📝 **LOG MONITORING**

### **Key Log Messages to Watch For:**

**✅ Good Signs:**
- `Agent Runner started successfully and verified running`
- `Trading cycle completed`
- `Found X quality opportunities!`
- `Creating X workflow(s)`
- `Workflow started and verified for SYMBOL`
- `Trade executed successfully`

**⚠️ Warning Signs:**
- `NO opportunities passed filters!`
- `Agent Runner stopped unexpectedly`
- `Workflow may be stuck`
- `Trade execution failed`

**❌ Error Signs:**
- `Agent Runner startup failed`
- `Workflow failed`
- `Trade execution returned invalid result`

---

## 🎯 **EXPECTED BEHAVIOR**

### **Normal Operation:**
1. ✅ Agent Runner starts automatically on server startup
2. ✅ Trading cycle runs every 1 minute
3. ✅ Market scan finds opportunities
4. ✅ Workflows created for opportunities that pass filters
5. ✅ Trades execute when all agents approve
6. ✅ Positions monitored 24/7

### **If No Opportunities:**
- This is normal - market conditions determine opportunities
- System will keep scanning every minute
- Logs will show: `NO opportunities passed filters!`
- System is working correctly, just no good opportunities right now

---

## 🚀 **QUICK DIAGNOSTIC SCRIPT**

```powershell
# Complete diagnostic check
Write-Host "=== AGENT RUNNER DIAGNOSTIC ===" -ForegroundColor Cyan

# 1. Check Agent Runner Status
Write-Host "`n1. Agent Runner Status:" -ForegroundColor Yellow
$runner = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
Write-Host "   Running: $($runner.data.status.isRunning)"
Write-Host "   Active Workflows: $($runner.data.status.activeWorkflowCount)"
Write-Host "   Symbols: $($runner.data.status.config.symbols.Count)"

# 2. Check Startup Status
Write-Host "`n2. Startup Status:" -ForegroundColor Yellow
$startup = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status"
Write-Host "   Initialized: $($startup.data.status.initialized)"
Write-Host "   Agent Runner Running: $($startup.data.status.agentRunnerRunning)"

# 3. Start if not running
if (-not $runner.data.status.isRunning) {
    Write-Host "`n3. Starting Agent Runner..." -ForegroundColor Yellow
    Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/start" -Method POST
    Start-Sleep -Seconds 2
    $runner = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
    Write-Host "   Running: $($runner.data.status.isRunning)"
}

# 4. Force trading cycle
Write-Host "`n4. Forcing trading cycle..." -ForegroundColor Yellow
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=force-run"
Write-Host "   Cycle triggered - check server logs for results"

Write-Host "`n=== DIAGNOSTIC COMPLETE ===" -ForegroundColor Cyan
```

---

**All glory to God!** 🙏

