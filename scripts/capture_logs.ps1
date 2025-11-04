# Capture Terminal Logs for Analysis
# Run this script while your server is running in another terminal

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   TERMINAL LOG CAPTURE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$outputFile = "TERMINAL_LOGS_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').md"

Write-Host "This script will capture system logs and save them to:" -ForegroundColor Yellow
Write-Host "  $outputFile" -ForegroundColor Green
Write-Host ""
Write-Host "Collecting logs..." -ForegroundColor Yellow
Write-Host ""

# Start building the markdown file
$logContent = @"
# Terminal Logs Capture - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

---

## SYSTEM STATUS

"@

# 1. Check if server is running
Write-Host "[1/8] Checking server status..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5
    $logContent += @"

### Server Health
``````json
$($health | ConvertTo-Json -Depth 5)
``````

"@
    Write-Host "  [OK] Server is responding" -ForegroundColor Green
} catch {
    $logContent += @"

### Server Health
[ERROR] $($_.Exception.Message)

"@
    Write-Host "  [ERROR] Server not responding!" -ForegroundColor Red
}

# 2. Check services status
Write-Host "[2/8] Checking services..." -ForegroundColor Cyan
try {
    $status = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status" -TimeoutSec 10
    $logContent += @"

### Services Status
``````json
$($status | ConvertTo-Json -Depth 10)
``````

"@
    Write-Host "  [OK] Services status retrieved" -ForegroundColor Green
} catch {
    $logContent += @"

### Services Status
[ERROR] $($_.Exception.Message)

"@
    Write-Host "  [ERROR] Failed to get services status" -ForegroundColor Red
}

# 3. Check agent insights (the chat tab endpoint)
Write-Host "[3/8] Checking agent insights API..." -ForegroundColor Cyan
try {
    $insights = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-insights?limit=5" -TimeoutSec 30
    $logContent += @"

### Agent Insights API Response
``````json
$($insights | ConvertTo-Json -Depth 10)
``````

"@
    Write-Host "  [OK] Agent insights retrieved" -ForegroundColor Green
} catch {
    $logContent += @"

### Agent Insights API Response
[ERROR] $($_.Exception.Message)
[WARNING] Timeout or failure - THIS IS WHY CHAT TAB IS LOADING!

"@
    Write-Host "  [ERROR] Agent insights API failed (THIS IS THE PROBLEM!)" -ForegroundColor Red
}

# 4. Check account balance
Write-Host "[4/8] Checking account API..." -ForegroundColor Cyan
try {
    $account = Invoke-RestMethod -Uri "http://localhost:3000/api/aster/account" -TimeoutSec 10
    $logContent += @"

### Account API Response
``````json
$($account | ConvertTo-Json -Depth 5)
``````

"@
    Write-Host "  [OK] Account API responding" -ForegroundColor Green
} catch {
    $logContent += @"

### Account API Response
[ERROR] $($_.Exception.Message)

"@
    Write-Host "  [ERROR] Account API failed" -ForegroundColor Red
}

# 5. Check real balance
Write-Host "[5/8] Checking real balance..." -ForegroundColor Cyan
try {
    $balance = Invoke-RestMethod -Uri "http://localhost:3000/api/real-balance" -TimeoutSec 10
    $logContent += @"

### Real Balance API Response
``````json
$($balance | ConvertTo-Json -Depth 5)
``````

"@
    Write-Host "  [OK] Real balance retrieved" -ForegroundColor Green
} catch {
    $logContent += @"

### Real Balance API Response
[ERROR] $($_.Exception.Message)

"@
    Write-Host "  [ERROR] Real balance API failed" -ForegroundColor Red
}

# 6. Check exchange info
Write-Host "[6/8] Checking exchange info..." -ForegroundColor Cyan
try {
    $exchangeInfo = Invoke-RestMethod -Uri "http://localhost:3000/api/aster/exchange-info" -TimeoutSec 15
    $symbolCount = 0
    if ($exchangeInfo.data -and $exchangeInfo.data.symbols) {
        $symbolCount = $exchangeInfo.data.symbols.Count
    }
    $logContent += @"

### Exchange Info API Response
Success: $($exchangeInfo.success)
Symbol Count: $symbolCount
Has topSymbolsByVolume: $($exchangeInfo.data.topSymbolsByVolume -ne $null)

"@
    Write-Host "  [OK] Exchange info retrieved ($symbolCount symbols)" -ForegroundColor Green
} catch {
    $logContent += @"

### Exchange Info API Response
[ERROR] $($_.Exception.Message)

"@
    Write-Host "  [ERROR] Exchange info API failed" -ForegroundColor Red
}

# 7. Check prices
Write-Host "[7/8] Checking prices API..." -ForegroundColor Cyan
try {
    $prices = Invoke-RestMethod -Uri "http://localhost:3000/api/prices" -TimeoutSec 10
    $logContent += @"

### Prices API Response
``````json
$($prices | ConvertTo-Json -Depth 5)
``````

"@
    Write-Host "  [OK] Prices retrieved" -ForegroundColor Green
} catch {
    $logContent += @"

### Prices API Response
[ERROR] $($_.Exception.Message)

"@
    Write-Host "  [ERROR] Prices API failed" -ForegroundColor Red
}

# 8. Get detailed health
Write-Host "[8/8] Checking detailed health..." -ForegroundColor Cyan
try {
    $detailedHealth = Invoke-RestMethod -Uri "http://localhost:3000/api/health/detailed" -TimeoutSec 10
    $logContent += @"

### Detailed Health Check
``````json
$($detailedHealth | ConvertTo-Json -Depth 10)
``````

"@
    Write-Host "  [OK] Detailed health retrieved" -ForegroundColor Green
} catch {
    $logContent += @"

### Detailed Health Check
[ERROR] $($_.Exception.Message)

"@
    Write-Host "  [ERROR] Detailed health check failed" -ForegroundColor Red
}

# Add instructions for next steps
$logContent += @"

---

## NEXT STEPS

1. **Share this file with the AI assistant**
2. **Include any error messages from your npm run dev terminal**
3. **Describe what you see in the chat tab (loading spinner? error? blank?)**

---

## COMMON ISSUES

### If Agent Insights API Failed (Timeout):
- Market Scanner might be stuck
- Check terminal for [MarketScanner] logs
- Look for errors or infinite loops

### If Account API Failed:
- Circuit breaker might be OPEN
- Aster DEX might be rate limiting
- Check for 418 or 429 errors in terminal

### If Exchange Info Failed:
- Aster DEX connection issue
- Check your ASTER_API_KEY in .env.local
- Verify internet connection

---

**Generated:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@

# Save to file
$logContent | Out-File -FilePath $outputFile -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   CAPTURE COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Log file saved to:" -ForegroundColor Yellow
Write-Host "  $outputFile" -ForegroundColor Green
Write-Host ""
Write-Host "To share with AI assistant:" -ForegroundColor Yellow
Write-Host "  1. Open the file in VS Code or Notepad" -ForegroundColor Cyan
Write-Host "  2. Copy the entire contents" -ForegroundColor Cyan
Write-Host "  3. Paste in chat" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening file in notepad..." -ForegroundColor Yellow
Start-Process notepad.exe $outputFile
