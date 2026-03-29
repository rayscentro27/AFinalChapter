#!/usr/bin/env powershell
# Mac Mini SSH Key Setup Script
# Completes key-based authentication to Mac Mini via Tailscale

param(
    [string]$MacMiniIP = "100.89.219.10",
    [string]$MacMiniUser = "raysc"
)

Write-Host "[Key] Mac Mini SSH Key Setup" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify SSH key exists
Write-Host "Step 1: Checking SSH key..." -ForegroundColor Yellow
$KeyPath = "$env:USERPROFILE\.ssh\id_tailscale"
$PubKeyPath = "$KeyPath.pub"

if (-not (Test-Path $PubKeyPath)) {
    Write-Host "[X] SSH key not found at: $KeyPath" -ForegroundColor Red
    Write-Host "    Run this first to generate: ssh-keygen -t ed25519 -f ~/.ssh/id_tailscale" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] SSH key found: $PubKeyPath" -ForegroundColor Green
Write-Host ""

# Step 2: Display public key
Write-Host "Step 2: Your public key (will be copied to Mac Mini):" -ForegroundColor Yellow
Write-Host "---" -ForegroundColor Gray
$PubKeyContent = Get-Content $PubKeyPath
Write-Host $PubKeyContent -ForegroundColor Gray
Write-Host "---" -ForegroundColor Gray
Write-Host ""

# Step 3: Test SSH connection and copy key
Write-Host "Step 3: Connecting to Mac Mini..." -ForegroundColor Yellow
Write-Host "    Mac Mini: $MacMiniIP" -ForegroundColor Gray
Write-Host "    User: $MacMiniUser" -ForegroundColor Gray
Write-Host ""

Write-Host "You will be prompted for your Mac Mini password (one time only)" -ForegroundColor Yellow
Write-Host ""

# Create the command to add the key
$SshCommand = @"
mkdir -p ~/.ssh;
cat >> ~/.ssh/authorized_keys;
chmod 600 ~/.ssh/authorized_keys;
chmod 700 ~/.ssh
"@

try {
    # Pipe public key and set up authorized_keys
    Write-Host "Copying public key to Mac Mini..." -ForegroundColor Gray
    $PubKeyContent | ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 `
        "$MacMiniUser@$MacMiniIP" $SshCommand
    
    Write-Host ""
    Write-Host "[OK] Public key added to Mac Mini!" -ForegroundColor Green
    Write-Host ""
    
    # Step 4: Test the connection
    Write-Host "Step 4: Testing key-based authentication..." -ForegroundColor Yellow
    $TestResult = ssh -i $KeyPath -o StrictHostKeyChecking=no `
        "$MacMiniUser@$MacMiniIP" "echo OK; whoami; uname -s" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] SSH key authentication working!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Connection test output:" -ForegroundColor Gray
        Write-Host $TestResult -ForegroundColor Gray
        Write-Host ""
        Write-Host "SUCCESS! You can now SSH without a password:" -ForegroundColor Cyan
        Write-Host "  ssh -i $KeyPath $MacMiniUser@$MacMiniIP" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Next: Transfer mac-mini-worker-bundle.tar.gz to Mac Mini via AirDrop" -ForegroundColor Yellow
    } else {
        Write-Host "[!] Authentication test had issues:" -ForegroundColor Yellow
        Write-Host $TestResult -ForegroundColor Gray
    }
} catch {
    Write-Host "[X] Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
