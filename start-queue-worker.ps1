# Start Queue Worker
Push-Location
try {
    Set-Location 'C:\Users\raysc\AFinalChapter\gateway'
    Write-Host "Queue Worker - Starting" -ForegroundColor Green
    Write-Host "Location: $(Get-Location)" -ForegroundColor Cyan
    Write-Host "Env: QUEUE_ENABLED=true" -ForegroundColor Cyan
    Write-Host ""
    
    &node src\workers\queue_worker.js
}
finally {
    Pop-Location
}
