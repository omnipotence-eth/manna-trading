# 🚀 COMPLETE STARTUP COMMANDS GUIDE

**In Jesus name, amen! All glory to God in heaven!** 🙏

---

## 📋 **QUICK START (Copy & Paste)**

### **1. Install Dependencies**
```powershell
npm install
```

### **2. Configure Environment**
```powershell
# Create .env.local file with your API keys
# Required: ASTER_API_KEY, ASTER_SECRET_KEY, ASTER_KEY_POOL, DATABASE_URL
# See .env.local for example structure
```

### **3. Start Development Server**
```powershell
npm run dev
```

**✅ ONE COMMAND - EVERYTHING STARTS AUTOMATICALLY!**

The server will automatically (in one terminal, no separate commands needed):
1. ✅ Wait 30 seconds for Ollama to be ready
2. ✅ Initialize all services (Real Balance, Position Monitor, etc.)
3. ✅ **Start Agent Runner (24/7 trading) - AUTOMATIC!**
4. ✅ Start Health Monitor (auto-restart if services crash)
5. ✅ Verify DeepSeek R1 connection

**Timeline:**
- Server starts: ~2-3 seconds
- Waits for Ollama: 30 seconds
- Initialization: 30-90 seconds (includes Agent Runner startup)
- **Total time to fully running: ~60-120 seconds**

**Server URL:** http://localhost:3000

**Note:** You do NOT need to run Agent Runner in a separate terminal - it starts automatically!

---

## 🔧 **DETAILED COMMANDS**

### **Development Commands**

```powershell
# Start development server (auto-initializes everything)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### **Diagnostic Commands**

```powershell
# Comprehensive system diagnostic
.\scripts\debug_trading_system.ps1

# Check Agent Runner status
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status" | ConvertTo-Json -Depth 3

# Check startup status
Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status" | ConvertTo-Json -Depth 3

# Force trading cycle
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=force-run"

# Start Agent Runner manually
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/start" -Method POST

# Stop Agent Runner
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/stop" -Method POST
```

### **Database Commands**

```powershell
# Create tables (if needed)
# Run the SQL scripts in scripts/ folder via your database client

# Clean test positions (if needed)
# Run scripts/clean-test-positions.sql
```

### **Log Monitoring**

```powershell
# Monitor live logs
.\scripts\capture_live_logs.ps1

# Capture logs to file
.\scripts\capture_logs.ps1

# View logs directly
Get-Content logs\server_logs_trading.log -Tail 50 -Wait
```

---

## 🎯 **STEP-BY-STEP STARTUP PROCEDURE**

### **Step 1: Prerequisites Check**

```powershell
# Check Node.js version (requires 18+)
node --version

# Check npm version
npm --version

# Verify .env.local exists
Test-Path .env.local
```

### **Step 2: Install Dependencies**

```powershell
# Install all packages
npm install

# If you get errors, try:
npm install --force
```

### **Step 3: Verify Environment Variables**

```powershell
# Check if required variables are set
Get-Content .env.local | Select-String "ASTER_API_KEY"
Get-Content .env.local | Select-String "ASTER_SECRET_KEY"
Get-Content .env.local | Select-String "DATABASE_URL"
```

**Required Variables:**
- `ASTER_API_KEY` - Your Aster DEX API key
- `ASTER_SECRET_KEY` - Your Aster DEX secret key
- `DATABASE_URL` - PostgreSQL connection string
- `ASTER_BASE_URL` - https://fapi.asterdex.com (default)

### **Step 4: Start Server**

```powershell
# Start development server
npm run dev
```

**Expected Output:**
```
> manna-ai-arena@3.5.0 dev
> next dev

  ▲ Next.js 14.2.33
  - Local:        http://localhost:3000
  - Network:      http://192.168.x.x:3000

  ✓ Starting...
  ✓ Ready in 2.3s
  [SERVER STARTUP] Instrumentation hook registered
  [SERVER STARTUP] Initializing services...
  [SERVER STARTUP] DeepSeek R1 verified
  [SERVER STARTUP] Agent Runner started
  [SERVER STARTUP] Position Monitor started
  [SERVER STARTUP] All services initialized successfully
```

### **Step 5: Verify System Status**

```powershell
# Check Agent Runner status
$status = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
Write-Host "Running: $($status.data.status.isRunning)"
Write-Host "Active Workflows: $($status.data.status.activeWorkflowCount)"

# Check startup status
$startup = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status"
Write-Host "Initialized: $($startup.data.status.initialized)"
Write-Host "Balance: $($startup.data.status.accountBalance)"
```

### **Step 6: Monitor Trading Activity**

```powershell
# Open browser to dashboard
Start-Process "http://localhost:3000"

# Monitor logs in separate terminal
Get-Content logs\server_logs_trading.log -Tail 50 -Wait
```

---

## 🔍 **TROUBLESHOOTING COMMANDS**

### **If Agent Runner Not Starting**

```powershell
# Check status
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"

# Force start
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/start" -Method POST

# Wait 2 seconds and check again
Start-Sleep -Seconds 2
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
```

### **If No Trades Executing**

```powershell
# Run comprehensive diagnostic
.\scripts\debug_trading_system.ps1

# Force trading cycle
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=force-run"

# Check opportunities
$insights = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-insights?limit=5"
Write-Host "Opportunities: $($insights.data.scanResult.opportunitiesCount)"
```

### **If DeepSeek R1 Not Connecting**

```powershell
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check if DeepSeek model is loaded
ollama ps

# Pull model if needed
ollama pull deepseek-r1:32b
```

### **If Database Connection Issues**

```powershell
# Test database connection
# Use your PostgreSQL client to connect with DATABASE_URL from .env.local

# Check if tables exist
# Run scripts/create-trades-table.sql and scripts/create-position-tables.sql
```

### **If Rate Limit Errors**

```powershell
# Check current rate limit settings
Get-Content .env.local | Select-String "RATE_LIMIT"

# Current settings (ultra-conservative):
# RATE_LIMIT_PER_KEY_RPS=1
# RATE_LIMIT_PER_KEY_RPM=60
```

---

## 📊 **MONITORING COMMANDS**

### **Real-Time Monitoring**

```powershell
# Monitor logs live
Get-Content logs\server_logs_trading.log -Tail 20 -Wait

# Monitor Agent Runner status (every 10 seconds)
while ($true) {
    Clear-Host
    $status = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner?action=status"
    Write-Host "=== Agent Runner Status ===" -ForegroundColor Cyan
    Write-Host "Running: $($status.data.status.isRunning)" -ForegroundColor $(if ($status.data.status.isRunning) { "Green" } else { "Red" })
    Write-Host "Active Workflows: $($status.data.status.activeWorkflowCount)"
    Write-Host "Last Cycle: $($status.data.status.lastCycleTime)"
    Write-Host "Next Cycle: $($status.data.status.nextCycleTime)"
    Start-Sleep -Seconds 10
}
```

### **Check Trading Opportunities**

```powershell
# Get current opportunities
$insights = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-insights?limit=10"
$insights.data.scanResult.opportunities | ForEach-Object {
    Write-Host "$($_.symbol): Score=$($_.score), Confidence=$([math]::Round($_.confidence * 100))%, Recommendation=$($_.recommendation)"
}
```

### **Check Open Positions**

```powershell
# Get open positions
$positions = Invoke-RestMethod -Uri "http://localhost:3000/api/positions"
$positions.data.positions | ForEach-Object {
    Write-Host "$($_.symbol) $($_.side): Entry=$$($_.entryPrice), P&L=$($_.unrealizedPnLPercent)%"
}
```

---

## 🔄 **MAINTENANCE COMMANDS**

### **Restart Services**

```powershell
# Restart Agent Runner
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/stop" -Method POST
Start-Sleep -Seconds 2
Invoke-RestMethod -Uri "http://localhost:3000/api/agent-runner/start" -Method POST
```

### **Clear Logs**

```powershell
# Clear trading logs (backup first if needed)
Copy-Item logs\server_logs_trading.log logs\server_logs_trading_$(Get-Date -Format 'yyyyMMdd_HHmmss').log
Clear-Content logs\server_logs_trading.log
```

### **Update Configuration**

```powershell
# Edit .env.local
notepad .env.local

# After changes, restart server
# Ctrl+C to stop, then: npm run dev
```

---

## 🎯 **PRODUCTION DEPLOYMENT**

### **Build for Production**

```powershell
# Build optimized production bundle
npm run build

# Start production server
npm start
```

### **Environment Variables for Production**

Set these in your hosting platform (Vercel, Railway, etc.):
- `ASTER_API_KEY`
- `ASTER_SECRET_KEY`
- `DATABASE_URL`
- `ASTER_BASE_URL`
- `ENABLE_24_7_AGENTS=true`
- `TRADING_CONFIDENCE_THRESHOLD=0.35`

---

## 📚 **ADDITIONAL RESOURCES**

- **Quick Commands**: `docs/QUICK_COMMANDS.md`
- **System Architecture**: `docs/SYSTEM_ARCHITECTURE.md`
- **API Documentation**: `docs/API_DOCUMENTATION.md`
- **Troubleshooting**: `docs/COMPREHENSIVE_TRADING_DEBUG.md`
- **Production Deployment**: `docs/PRODUCTION_DEPLOYMENT.md`

---

## ✅ **VERIFICATION CHECKLIST**

After startup, verify:

- [ ] Server running on http://localhost:3000
- [ ] Agent Runner status shows `isRunning: true`
- [ ] Startup status shows `initialized: true`
- [ ] Account balance > 0
- [ ] Market Scanner finding opportunities
- [ ] No critical errors in logs
- [ ] DeepSeek R1 model loaded
- [ ] Database connection working

---

**All glory to God in heaven!** 🙏

