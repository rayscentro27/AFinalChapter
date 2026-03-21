# Setup SSH key-based authentication to Mac Mini via Tailscale

$HOME_DIR = $env:USERPROFILE
$SSH_KEY_PATH = "$HOME_DIR\.ssh\id_tailscale"
$MAC_MINI_IP = "100.89.219.10"
$MAC_MINI_USER = "raysc"

Write-Host "SSH Key-Based Authentication Setup for Mac Mini Tailscale"
Write-Host "==========================================================="
Write-Host ""

# Step 1: Check if key exists
if (Test-Path "$SSH_KEY_PATH.pub") {
    Write-Host "✅ SSH key pair already exists"
    Write-Host "   Private key: $SSH_KEY_PATH"
    Write-Host "   Public key: $SSH_KEY_PATH.pub"
} else {
    Write-Host "❌ SSH key not found. Please run ssh-keygen first."
    exit 1
}

Write-Host ""
Write-Host "Public Key Fingerprint:"
ssh-keygen -lf "$SSH_KEY_PATH.pub"
Write-Host ""

# Step 2: Configure SSH config for convenience
$SSH_CONFIG = "$HOME_DIR\.ssh\config"
$MAC_MINI_CONFIG = @"
Host macmini
    HostName 100.89.219.10
    User raysc
    IdentityFile ~/.ssh/id_tailscale
    StrictHostKeyChecking no
    UserKnownHostsFile ~/.ssh/known_hosts_macmini
    ConnectTimeout 5
    ServerAliveInterval 60
"@

if (Test-Path $SSH_CONFIG) {
    $current = Get-Content $SSH_CONFIG -Raw
    if ($current -notmatch "Host macmini") {
        Add-Content $SSH_CONFIG `n
        Add-Content $SSH_CONFIG $MAC_MINI_CONFIG
        Write-Host "✅ Updated ~/.ssh/config with macmini host"
    } else {
        Write-Host "⚠️  macmini host already configured in ~/.ssh/config"
    }
} else {
    $SSH_CONFIG_Path = Split-Path $SSH_CONFIG -Parent
    if (-not (Test-Path $SSH_CONFIG_Path)) {
        New-Item -ItemType Directory -Path $SSH_CONFIG_Path -Force > $null
    }
    Set-Content $SSH_CONFIG $MAC_MINI_CONFIG
    Write-Host "✅ Created ~/.ssh/config with macmini host"
}

Write-Host ""
Write-Host "Usage:"
Write-Host "  ssh macmini                 - Connect to Mac Mini"
Write-Host "  ssh macmini 'command'       - Run command on Mac Mini"
Write-Host ""
Write-Host "Example: ssh macmini 'ls -la'"
