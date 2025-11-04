# Capture Live Terminal Logs
# This script will tail the npm run dev output and save it to a file

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   LIVE LOG CAPTURE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$outputFile = "LIVE_LOGS_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').log"

Write-Host "IMPORTANT: This script captures logs from npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "Two ways to use this:" -ForegroundColor Cyan
Write-Host ""
Write-Host "METHOD 1: Redirect npm output (recommended)" -ForegroundColor Green
Write-Host "  In your npm run dev terminal, run:" -ForegroundColor White
Write-Host "  npm run dev 2>&1 | Tee-Object -FilePath $outputFile" -ForegroundColor Yellow
Write-Host "  (This saves logs to file while still showing them)" -ForegroundColor Gray
Write-Host ""
Write-Host "METHOD 2: Just save last N lines to file" -ForegroundColor Green
Write-Host "  This script will wait for you to copy terminal content" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Which method? (1 or 2)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "Copy and run this command in your npm terminal:" -ForegroundColor Green
    Write-Host ""
    Write-Host "npm run dev 2>&1 | Tee-Object -FilePath $outputFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Logs will be saved to: $outputFile" -ForegroundColor Cyan
    Write-Host "Keep it running, and I can read the file anytime!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press Ctrl+C in the npm terminal to stop logging" -ForegroundColor Gray
    
} elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "Waiting for you to paste terminal content..." -ForegroundColor Yellow
    Write-Host "Press Enter when ready, then paste your logs, then press Enter twice:" -ForegroundColor Cyan
    Write-Host ""
    
    Read-Host "Press Enter to start"
    
    Write-Host ""
    Write-Host "Paste your logs now (copy from npm terminal):" -ForegroundColor Green
    Write-Host "(Press Ctrl+Z then Enter when done)" -ForegroundColor Gray
    Write-Host ""
    
    $logs = @()
    while ($true) {
        $line = Read-Host
        if ([string]::IsNullOrWhiteSpace($line)) {
            break
        }
        $logs += $line
    }
    
    if ($logs.Count -gt 0) {
        $logs | Out-File -FilePath $outputFile -Encoding UTF8
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "   LOGS SAVED!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "File saved to: $outputFile" -ForegroundColor Cyan
        Write-Host "Lines captured: $($logs.Count)" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "No logs captured!" -ForegroundColor Red
    }
    
} else {
    Write-Host ""
    Write-Host "Invalid choice. Exiting." -ForegroundColor Red
}

