# CodeBuddy — Full Uninstall Script
# Removes ALL tools that CodeBuddy installs during onboarding.
# Run this to reset a machine to a clean pre-onboarding state for testing.
#
# Usage: Right-click → Run with PowerShell, or open PowerShell and run: .\UNINSTALL-ALL.ps1

param([switch]$SkipConfirm)

Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host "  CodeBuddy FULL Uninstall" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""
Write-Host "This will remove:" -ForegroundColor Yellow
Write-Host "  1. CodeBuddy app + all settings/caches"
Write-Host "  2. GitHub Copilot CLI"
Write-Host "  3. Claude Code (Anthropic)"
Write-Host "  4. Codex CLI (OpenAI)"
Write-Host "  5. GitHub CLI (gh)"
Write-Host "  6. Node.js + npm global packages"
Write-Host "  7. Python"
Write-Host "  8. Git"
Write-Host ""

if (-not $SkipConfirm) {
    $answer = Read-Host "Are you sure? Type YES to continue"
    if ($answer -ne "YES") {
        Write-Host "Cancelled." -ForegroundColor Green
        Read-Host "Press Enter to close"
        exit 0
    }
}

Write-Host ""

function Remove-IfExists($path) {
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "    Removed: $path" -ForegroundColor DarkGray
    }
}

function Try-WingetUninstall($id, $label) {
    Write-Host "  Uninstalling $label via winget..." -ForegroundColor DarkGray
    try {
        $result = & winget uninstall --id $id --silent --accept-source-agreements 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            Write-Host "    winget: removed $label" -ForegroundColor DarkGray
        } else {
            Write-Host "    winget: $label not found or already removed (exit $exitCode)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    winget not available for $label" -ForegroundColor DarkGray
    }
}

# ──────────────────────────────────────
# 1. Kill CodeBuddy
# ──────────────────────────────────────
Write-Host "[1/8] Stopping CodeBuddy..." -ForegroundColor Yellow
Stop-Process -Name "CodeBuddy" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 2. Remove CodeBuddy app + data
# ──────────────────────────────────────
Write-Host "[2/8] Removing CodeBuddy app + data..." -ForegroundColor Yellow
Remove-IfExists "$env:LOCALAPPDATA\Programs\CodeBuddy"
Remove-IfExists "$env:APPDATA\codebuddy"
Remove-IfExists "$env:APPDATA\CodeBuddy"
Remove-IfExists "$env:LOCALAPPDATA\codebuddy-updater"
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 3. Uninstall GitHub Copilot CLI
# ──────────────────────────────────────
Write-Host "[3/8] Removing GitHub Copilot CLI..." -ForegroundColor Yellow
# Remove standalone copilot binary
Remove-IfExists "$env:LOCALAPPDATA\GitHub CLI\copilot"
# Remove gh copilot extension
try { & gh extension remove github/gh-copilot 2>$null } catch {}
# Remove npm global package
try { & npm uninstall -g @githubnext/github-copilot-cli 2>$null } catch {}
Try-WingetUninstall "GitHub.Copilot" "GitHub Copilot CLI"
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 4. Uninstall Claude Code
# ──────────────────────────────────────
Write-Host "[4/8] Removing Claude Code..." -ForegroundColor Yellow
# npm global
try { & npm uninstall -g @anthropic-ai/claude-code 2>$null } catch {}
# Remove claude binary and config
Remove-IfExists "$env:USERPROFILE\.local\bin\claude.exe"
Remove-IfExists "$env:USERPROFILE\.claude"
Remove-IfExists "$env:APPDATA\claude"
Try-WingetUninstall "Anthropic.Claude" "Claude Code"
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 5. Uninstall Codex CLI
# ──────────────────────────────────────
Write-Host "[5/8] Removing Codex CLI..." -ForegroundColor Yellow
try { & npm uninstall -g @openai/codex 2>$null } catch {}
Remove-IfExists "$env:USERPROFILE\.codex"
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 6. Uninstall GitHub CLI
# ──────────────────────────────────────
Write-Host "[6/8] Removing GitHub CLI..." -ForegroundColor Yellow
# Revoke gh auth token
try { echo "Y" | & gh auth logout --hostname github.com 2>$null } catch {}
Try-WingetUninstall "GitHub.cli" "GitHub CLI"
Remove-IfExists "$env:APPDATA\GitHub CLI"
Remove-IfExists "$env:LOCALAPPDATA\GitHub CLI"
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 7. Uninstall Node.js + npm globals
# ──────────────────────────────────────
Write-Host "[7/8] Removing Node.js..." -ForegroundColor Yellow
Try-WingetUninstall "OpenJS.NodeJS.LTS" "Node.js LTS"
Try-WingetUninstall "OpenJS.NodeJS" "Node.js"
Remove-IfExists "$env:APPDATA\npm"
Remove-IfExists "$env:APPDATA\npm-cache"
Remove-IfExists "$env:LOCALAPPDATA\npm-cache"
Remove-IfExists "$env:USERPROFILE\.npm"
Remove-IfExists "C:\Program Files\nodejs"
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 8. Uninstall Python + Git
# ──────────────────────────────────────
Write-Host "[8/8] Removing Python and Git..." -ForegroundColor Yellow
Try-WingetUninstall "Python.Python.3.12" "Python 3.12"
Try-WingetUninstall "Python.Python.3.11" "Python 3.11"
Try-WingetUninstall "Python.Python.3.10" "Python 3.10"
Try-WingetUninstall "Git.Git" "Git"
Remove-IfExists "C:\Program Files\Git"
Remove-IfExists "C:\Program Files\Python312"
Remove-IfExists "C:\Program Files\Python311"
Remove-IfExists "C:\Program Files\Python310"
Remove-IfExists "$env:LOCALAPPDATA\Programs\Python"
Remove-IfExists "$env:USERPROFILE\.gitconfig"
Write-Host "  Done." -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Full uninstall complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "All CodeBuddy-installed tools have been removed." -ForegroundColor Cyan
Write-Host "Restart your computer to ensure PATH changes take effect." -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to close"
