# CodeBuddy Clean Deploy Script
# Run this on the target machine from the CodeBuddy folder
# Usage: Right-click -> Run with PowerShell, OR open PowerShell and run: .\deploy-clean.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CodeBuddy Clean Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kill all CodeBuddy processes
Write-Host "[1/5] Killing CodeBuddy processes..." -ForegroundColor Yellow
Stop-Process -Name "CodeBuddy" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
$still = Get-Process -Name "CodeBuddy" -ErrorAction SilentlyContinue
if ($still) {
    Write-Host "  WARNING: CodeBuddy still running, force killing..." -ForegroundColor Red
    $still | Stop-Process -Force
    Start-Sleep -Seconds 2
}
Write-Host "  Done." -ForegroundColor Green

# 2. Delete old installation
Write-Host "[2/5] Removing old installation..." -ForegroundColor Yellow
$installDir = "$env:LOCALAPPDATA\Programs\CodeBuddy"
if (Test-Path $installDir) {
    Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $installDir) {
        Write-Host "  WARNING: Could not fully delete $installDir" -ForegroundColor Red
        Write-Host "  Trying again..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
        Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "  Done." -ForegroundColor Green

# 3. Delete ALL Electron/Chromium cache
Write-Host "[3/5] Clearing all caches..." -ForegroundColor Yellow
$cacheDir = "$env:APPDATA\CodeBuddy"
if (Test-Path $cacheDir) {
    Remove-Item $cacheDir -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "  Done." -ForegroundColor Green

# 4. Copy fresh build
Write-Host "[4/5] Installing fresh build..." -ForegroundColor Yellow
$source = Join-Path $PSScriptRoot "dist-electron\win-unpacked"
if (-not (Test-Path $source)) {
    Write-Host "  ERROR: Cannot find $source" -ForegroundColor Red
    Write-Host "  Make sure you're running this from the CodeBuddy project folder." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
New-Item $installDir -ItemType Directory -Force | Out-Null
Copy-Item "$source\*" "$installDir\" -Recurse -Force
Write-Host "  Installed to: $installDir" -ForegroundColor Green

# 5. Verify
Write-Host "[5/5] Verifying..." -ForegroundColor Yellow
if (Test-Path "$installDir\CodeBuddy.exe") {
    Write-Host "  CodeBuddy.exe: OK" -ForegroundColor Green
} else {
    Write-Host "  CodeBuddy.exe: MISSING" -ForegroundColor Red
}
if (Test-Path "$installDir\resources\app.asar") {
    Write-Host "  app.asar: OK" -ForegroundColor Green
} else {
    Write-Host "  app.asar: MISSING" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploy complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Launching CodeBuddy..." -ForegroundColor Yellow
Start-Process "$installDir\CodeBuddy.exe"
Write-Host ""
Read-Host "Press Enter to close this window"
