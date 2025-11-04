#!/usr/bin/env pwsh
# Simple Trading System Startup Script (No Emojis)

param(
    [switch]$SkipOllama = $false
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================"
Write-Host "   TRADING SYSTEM STARTUP"
Write-Host "========================================"
Write-Host ""

# Step 1: Check Ollama
if (-not $SkipOllama) {
    Write-Host "[1/4] Checking Ollama..." -ForegroundColor Yellow
    
    $ollamaProcess = Get-Process -Name ollama -ErrorAction SilentlyContinue
    if (-not $ollamaProcess) {
        Write-Host "  [ERROR] Ollama is NOT running!" -ForegroundColor Red
        Write-Host "     Please start Ollama first" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "  [OK] Ollama is running" -ForegroundColor Green
    
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
        Write-Host "  [OK] Ollama API responding" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Ollama API not responding!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[1/4] Skipping Ollama check" -ForegroundColor Gray
}

# Step 2: Check if server is running
Write-Host ""
Write-Host "[2/4] Checking server..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  [OK] Server is running" -ForegroundColor Green
    $serverRunning = $true
} catch {
    Write-Host "  [INFO] Server not detected" -ForegroundColor Gray
    Write-Host "     Please ensure 'npm run dev' is running in another terminal" -ForegroundColor Yellow
    Write-Host "     Press Enter when server is ready..."
    Read-Host
    
    # Try again
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5 -ErrorAction Stop
        Write-Host "  [OK] Server is ready!" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Server still not responding" -ForegroundColor Red
        exit 1
    }
}

# Step 3: Initialize services
Write-Host ""
Write-Host "[3/4] Initializing services..." -ForegroundColor Yellow
Write-Host "  This will take 5-10 minutes (DeepSeek model loading)" -ForegroundColor Gray
Write-Host "  Please wait, do not cancel..." -ForegroundColor Gray
Write-Host ""

try {
    $initResult = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=initialize" -Method Get -TimeoutSec 600 -ErrorAction Stop
    
    if ($initResult.success) {
        Write-Host "  [OK] Services initialized!" -ForegroundColor Green
    } else {
        Write-Host "  [WARNING] Init returned success=false" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [ERROR] Initialization failed" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Verify status
Write-Host ""
Write-Host "[4/4] Verifying system..." -ForegroundColor Yellow

Start-Sleep -Seconds 3

try {
    $status = Invoke-RestMethod -Uri "http://localhost:3000/api/startup?action=status" -Method Get -TimeoutSec 5
    $s = $status.data.status
    
    Write-Host ""
    Write-Host "System Status:" -ForegroundColor Cyan
    Write-Host "  Initialized: $($s.initialized)" -ForegroundColor $(if ($s.initialized) { "Green" } else { "Red" })
    Write-Host "  Agent Runner: $($s.agentRunnerRunning)" -ForegroundColor $(if ($s.agentRunnerRunning) { "Green" } else { "Red" })
    Write-Host "  Active Workflows: $($s.agentRunnerActiveWorkflows)" -ForegroundColor Cyan
    Write-Host "  Balance: Dollar$([math]::Round($s.accountBalance, 2))" -ForegroundColor Cyan
    
    Write-Host ""
    if ($s.initialized -and $s.agentRunnerRunning) {
        Write-Host "========================================"
        Write-Host "   SYSTEM READY TO TRADE!"
        Write-Host "========================================"
        Write-Host ""
        Write-Host "Dashboard: http://localhost:3000" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "What's running:" -ForegroundColor Yellow
        Write-Host "  - Agent Runner (scanning markets)" -ForegroundColor White
        Write-Host "  - Health Monitor (auto-restart)" -ForegroundColor White
        Write-Host "  - Real Balance Service" -ForegroundColor White
        Write-Host "  - Position Monitor" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "========================================"
        Write-Host "   WARNING: NOT FULLY READY"
        Write-Host "========================================"
        Write-Host ""
        Write-Host "Services initialized but not running properly" -ForegroundColor Yellow
        Write-Host "Check server logs for errors" -ForegroundColor Yellow
        Write-Host ""
    }
    
} catch {
    Write-Host "  [ERROR] Status check failed" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

