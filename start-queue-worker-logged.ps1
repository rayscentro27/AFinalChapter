#!/usr/bin/env pwsh

# Queue Worker Launcher with Logging

$logFile = "C:\Users\raysc\AFinalChapter\gateway\queue-worker.log"
$errFile = "C:\Users\raysc\AFinalChapter\gateway\queue-worker-error.log"

Write-Host "Starting queue worker with logging..."
Write-Host "  Logs: $logFile"
Write-Host "  Errors: $errFile"

cd C:\Users\raysc\AFinalChapter\gateway

# Start worker with output redirection
node src/workers/queue_worker.js > $logFile 2> $errFile

Write-Host "Queue worker exited"
