Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   TRADING SYSTEM DIAGNOSTIC" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if server is running
Write-Host "[1/6] Checking if server is running..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  Success Server is running" -ForegroundColor Green
} catch {
    Write-Host "  Failed Server is NOT running - Start with: npm run dev" -ForegroundColor Red
    exit
}

# 2. Check if services are initialized
Write-Host "[2/6] Checking service initialization..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status" -TimeoutSec 10 -ErrorAction Stop
    if ($status.data.status.initialized) {
        Write-Host "  Success Services initialized" -ForegroundColor Green
    } else {
        Write-Host "  Failed Services NOT initialized" -ForegroundColor Red
        Write-Host "     Run: Invoke-RestMethod -Uri http://localhost:3000/api/startup?action=initialize -Method Get" -ForegroundColor Yellow
    }
    
    if ($status.data.status.agentRunnerRunning) {
        Write-Host "  Success Agent Runner is running" -ForegroundColor Green
    } else {
        Write-Host "  Failed Agent Runner NOT running" -ForegroundColor Red
    }
    
    $balance = $status.data.status.accountBalance
    if ($balance -gt 0) {
        Write-Host "  Success Balance: Dollar$balance" -ForegroundColor Green
    } else {
        Write-Host "  Failed Balance: Dollar0 - Cannot trade without funds" -ForegroundColor Red
    }
} catch {
    Write-Host "  Failed Could not check status: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Check Account API speed
Write-Host "[3/6] Checking Account API speed..." -ForegroundColor Yellow
try {
    $timer = Measure-Command {
        $account = Invoke-RestMethod -Uri "http://localhost:3000/api/aster/account" -TimeoutSec 60 -ErrorAction Stop
    }
    $seconds = [math]::Round($timer.TotalSeconds, 1)
    
    if ($seconds -lt 5) {
        Write-Host "  Success Account API: ${seconds}s (FAST!)" -ForegroundColor Green
    } elseif ($seconds -lt 30) {
        Write-Host "  Warning Account API: ${seconds}s (a bit slow)" -ForegroundColor Yellow
    } else {
        Write-Host "  Failed Account API: ${seconds}s (TOO SLOW!)" -ForegroundColor Red
        Write-Host "     Solution: Restart server to apply fixes" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Failed Account API timed out or failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DIAGNOSTIC COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
