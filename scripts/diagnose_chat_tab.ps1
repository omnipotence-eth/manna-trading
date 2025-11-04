# Quick Diagnostic for Chat Tab Issue
# Run this to find out why chat tab is stuck loading

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   CHAT TAB DIAGNOSTIC" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test the agent insights endpoint with timeout
Write-Host "Testing /api/agent-insights endpoint..." -ForegroundColor Yellow
Write-Host "(This is what the chat tab calls)" -ForegroundColor Gray
Write-Host ""

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    # 30 second timeout (same as browser would wait)
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/agent-insights?limit=5" -TimeoutSec 30
    $stopwatch.Stop()
    
    $elapsed = $stopwatch.Elapsed.TotalSeconds
    
    Write-Host "[OK] Success! Endpoint responded in $([math]::Round($elapsed, 2)) seconds" -ForegroundColor Green
    Write-Host ""
    
    # Check response structure
    if ($response.success) {
        Write-Host "Response Structure:" -ForegroundColor Cyan
        Write-Host "  Success: $($response.success)" -ForegroundColor Green
        
        if ($response.data -and $response.data.insights) {
            $insightCount = $response.data.insights.Count
            Write-Host "  Insights Count: $insightCount" -ForegroundColor Green
            
            if ($insightCount -gt 0) {
                Write-Host ""
                Write-Host "Sample Insight:" -ForegroundColor Cyan
                $first = $response.data.insights[0]
                Write-Host "  Symbol: $($first.symbol)" -ForegroundColor White
                Write-Host "  Action: $($first.action)" -ForegroundColor White
                Write-Host "  Confidence: $([math]::Round($first.confidence * 100))%" -ForegroundColor White
                Write-Host "  Reasoning: $($first.reasoning.Substring(0, [Math]::Min(100, $first.reasoning.Length)))..." -ForegroundColor Gray
            } else {
                Write-Host ""
                Write-Host "[WARNING] No insights found (Market Scanner has not run yet?)" -ForegroundColor Yellow
            }
            
            Write-Host ""
            Write-Host "Timestamp: $($response.data.timestamp)" -ForegroundColor Cyan
            Write-Host "Last Scan: $(if($response.data.lastScanTime){$response.data.lastScanTime}else{'N/A'})" -ForegroundColor Cyan
        } else {
            Write-Host ""
            Write-Host "[WARNING] Response missing data.insights field" -ForegroundColor Yellow
            Write-Host "This means Market Scanner hasn't completed a scan yet." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARNING] Response success=false" -ForegroundColor Red
        Write-Host "Error: $($response.error)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   DIAGNOSIS: ENDPOINT IS WORKING!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "If chat tab is still loading, try:" -ForegroundColor Yellow
    Write-Host "  1. Hard refresh browser (Ctrl+Shift+R)" -ForegroundColor Cyan
    Write-Host "  2. Clear browser cache" -ForegroundColor Cyan
    Write-Host "  3. Open browser console (F12) and check for errors" -ForegroundColor Cyan
    Write-Host "  4. Wait 2-3 minutes for Market Scanner to complete" -ForegroundColor Cyan
    
} catch {
    $stopwatch.Stop()
    $elapsed = $stopwatch.Elapsed.TotalSeconds
    
    Write-Host "[FAILED] Request failed after $([math]::Round($elapsed, 2)) seconds" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error Type: $($_.Exception.GetType().Name)" -ForegroundColor Red
    Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "   DIAGNOSIS: ENDPOINT IS FAILING!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    
    # Determine likely cause
    if ($_.Exception.Message -match "timeout|timed out") {
        Write-Host "LIKELY CAUSE: Timeout" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "This means the endpoint is taking too long to respond." -ForegroundColor White
        Write-Host "Common reasons:" -ForegroundColor White
        Write-Host "  1. Market Scanner is stuck in an infinite loop" -ForegroundColor Cyan
        Write-Host "  2. Aster DEX API is slow or timing out" -ForegroundColor Cyan
        Write-Host "  3. DeepSeek model is not responding" -ForegroundColor Cyan
        Write-Host "  4. Circuit breaker is blocking requests" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "NEXT STEPS:" -ForegroundColor Yellow
        Write-Host "  1. Run: .\capture_logs.ps1" -ForegroundColor Green
        Write-Host "  2. Check terminal for [MarketScanner] errors" -ForegroundColor Green
        Write-Host "  3. Look for 'API returned 418' or '429' errors" -ForegroundColor Green
        Write-Host "  4. Share logs with AI assistant" -ForegroundColor Green
        
    } elseif ($_.Exception.Message -match "connection|refused") {
        Write-Host "LIKELY CAUSE: Server Not Running" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "The server is not responding on http://localhost:3000" -ForegroundColor White
        Write-Host ""
        Write-Host "NEXT STEPS:" -ForegroundColor Yellow
        Write-Host "  1. Check if 'npm run dev' is running" -ForegroundColor Green
        Write-Host "  2. Look for 'Ready in Xms' message" -ForegroundColor Green
        Write-Host "  3. Check for port conflicts (another app using port 3000)" -ForegroundColor Green
        
    } else {
        Write-Host "LIKELY CAUSE: Unknown Error" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "NEXT STEPS:" -ForegroundColor Yellow
        Write-Host "  1. Run: .\capture_logs.ps1" -ForegroundColor Green
        Write-Host "  2. Check terminal for error messages" -ForegroundColor Green
        Write-Host "  3. Share full error output with AI assistant" -ForegroundColor Green
    }
}

Write-Host ""

