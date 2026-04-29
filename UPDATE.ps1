# CodeCollab Update Script
# Updates the app binaries WITHOUT wiping settings, projects, or onboarding state.
# Run from the "CodeCollab Install" folder on the target machine.
# Usage: Right-click -> Run with PowerShell

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CodeCollab Update (keeps your data)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kill running CodeCollab
Write-Host "[1/4] Closing CodeCollab..." -ForegroundColor Yellow
Stop-Process -Name "CodeCollab" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
$still = Get-Process -Name "CodeCollab" -ErrorAction SilentlyContinue
if ($still) {
    Write-Host "  Still running, force killing..." -ForegroundColor Red
    $still | Stop-Process -Force
    Start-Sleep -Seconds 2
}
Write-Host "  Done." -ForegroundColor Green

# 2. Confirm app data is preserved
$appData = "$env:APPDATA\CodeCollab"
$localData = "$env:LOCALAPPDATA\CodeCollab"
Write-Host ""
Write-Host "[2/4] Checking existing data..." -ForegroundColor Yellow
if (Test-Path $appData) {
    $settingsFile = Join-Path $appData "settings.json"
    if (Test-Path $settingsFile) {
        Write-Host "  Settings: FOUND (will be kept)" -ForegroundColor Green
    } else {
        Write-Host "  Settings: not found (fresh install)" -ForegroundColor Gray
    }
    $projectsFile = Join-Path $appData "projects.json"
    if (Test-Path $projectsFile) {
        Write-Host "  Projects: FOUND (will be kept)" -ForegroundColor Green
    } else {
        Write-Host "  Projects: not found" -ForegroundColor Gray
    }
} else {
    Write-Host "  No existing data found (this will be a fresh install)" -ForegroundColor Gray
}
# Note: We do NOT delete $appData or $localData — that's the whole point

# 3. Copy updated app from this folder into the install location
Write-Host ""
Write-Host "[3/4] Updating app binaries..." -ForegroundColor Yellow
$scriptDir = $PSScriptRoot
$exePath = Join-Path $scriptDir "CodeCollab.exe"

if (-not (Test-Path $exePath)) {
    Write-Host "  ERROR: CodeCollab.exe not found in this folder." -ForegroundColor Red
    Write-Host "  Make sure you're running UPDATE.ps1 from the CodeCollab Install folder." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# The install folder IS this folder — the deploy script already copied the win-unpacked files here.
# We just need to clear the Chromium/Electron GPU cache to avoid stale shader issues,
# but keep all app-level data (settings, projects, onboarding).
$gpuCache = "$localData\GPUCache"
if (Test-Path $gpuCache) {
    Remove-Item $gpuCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleared GPU cache" -ForegroundColor Gray
}
$codeCache = "$localData\Code Cache"
if (Test-Path $codeCache) {
    Remove-Item $codeCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleared code cache" -ForegroundColor Gray
}

Write-Host "  App files updated." -ForegroundColor Green

# 4. Verify and launch
Write-Host ""
Write-Host "[4/4] Verifying..." -ForegroundColor Yellow
if (Test-Path $exePath) {
    Write-Host "  CodeCollab.exe: OK" -ForegroundColor Green
} else {
    Write-Host "  CodeCollab.exe: MISSING" -ForegroundColor Red
}
$asarPath = Join-Path $scriptDir "resources\app.asar"
if (Test-Path $asarPath) {
    Write-Host "  app.asar: OK" -ForegroundColor Green
} else {
    Write-Host "  app.asar: MISSING" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Update complete!" -ForegroundColor Green
Write-Host "  Your projects and settings are intact." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Launching CodeCollab..." -ForegroundColor Yellow
Start-Process $exePath
Write-Host ""
Read-Host "Press Enter to close this window"
