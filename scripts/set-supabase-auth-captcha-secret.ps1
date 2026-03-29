#!/usr/bin/env powershell

param(
    [string]$Secret,
    [switch]$SessionOnly,
    [switch]$SkipRestart,
    [string]$RepoRoot = 'C:\Users\raysc\AFinalChapter'
)

Write-Host '[Auth] Supabase CAPTCHA Secret Setup' -ForegroundColor Cyan
Write-Host '===================================' -ForegroundColor Cyan
Write-Host ''

if ([string]::IsNullOrWhiteSpace($Secret)) {
    $secure = Read-Host 'Enter SUPABASE_AUTH_CAPTCHA_SECRET' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $Secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        if ($ptr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        }
    }
}

if ([string]::IsNullOrWhiteSpace($Secret)) {
    Write-Host '[X] No secret provided.' -ForegroundColor Red
    exit 1
}

$env:SUPABASE_AUTH_CAPTCHA_SECRET = $Secret
Write-Host '[OK] Session environment variable set.' -ForegroundColor Green

if (-not $SessionOnly) {
    [Environment]::SetEnvironmentVariable('SUPABASE_AUTH_CAPTCHA_SECRET', $Secret, 'User')
    Write-Host '[OK] User environment variable persisted.' -ForegroundColor Green
} else {
    Write-Host '[OK] Session-only mode enabled. User profile was not modified.' -ForegroundColor Green
}

if (-not (Test-Path $RepoRoot)) {
    Write-Host "[X] Repo root not found: $RepoRoot" -ForegroundColor Red
    exit 1
}

Push-Location
try {
    Set-Location $RepoRoot
    Write-Host "Repo: $(Get-Location)" -ForegroundColor Cyan
    Write-Host ''

    Write-Host 'Running auth environment check...' -ForegroundColor Yellow
    & npm run auth:check-env
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[!] auth:check-env reported a failure. Review the output above.' -ForegroundColor Yellow
        if ($SkipRestart) {
            exit $LASTEXITCODE
        }
    }

    if ($SkipRestart) {
        Write-Host '[OK] SkipRestart requested. Supabase services were not restarted.' -ForegroundColor Green
        exit 0
    }

    $supabaseCommand = Get-Command supabase.exe -ErrorAction SilentlyContinue
    if (-not $supabaseCommand) {
        Write-Host '[!] supabase.exe is not available in PATH. Secret is set, but Supabase was not restarted.' -ForegroundColor Yellow
        exit 0
    }

    Write-Host ''
    Write-Host 'Restarting local Supabase...' -ForegroundColor Yellow
    & supabase.exe stop
    & supabase.exe start

    if ($LASTEXITCODE -eq 0) {
        Write-Host '[OK] Supabase restarted successfully.' -ForegroundColor Green
    } else {
        Write-Host '[!] Supabase restart did not complete successfully. Secret is set; inspect the CLI output above.' -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}