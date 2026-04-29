# CodeCollab — Full Uninstall Script
# Removes ALL tools that CodeCollab installs during onboarding.
# Run this to reset a machine to a clean pre-onboarding state for testing.
#
# Usage: Right-click → Run with PowerShell  (auto-elevates to Admin)

param([switch]$SkipConfirm, [switch]$Elevated)

# ── Auto-elevate to Administrator ──
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Elevated")
    if ($SkipConfirm) { $argList += "-SkipConfirm" }
    Start-Process powershell.exe -ArgumentList $argList -Verb RunAs -Wait
    exit
}

# Ensure we're in the script's directory
Set-Location -Path (Split-Path -Parent $PSCommandPath) -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host "  CodeCollab FULL Uninstall" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host "  Running as Administrator: YES" -ForegroundColor Green
Write-Host ""
Write-Host "This will remove:" -ForegroundColor Yellow
Write-Host "  1. CodeCollab app + all settings/caches"
Write-Host "  2. Codex CLI (OpenAI)"
Write-Host "  3. Claude Code (Anthropic)"
Write-Host "  4. GitHub Copilot CLI"
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

# ── Helper: Remove path if it exists ──
function Remove-IfExists($path) {
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "    Removed: $path" -ForegroundColor DarkGray
    }
}

# ── Helper: Uninstall via winget with force + multiple ID attempts ──
function Try-WingetUninstall {
    param([string[]]$Ids, [string]$Label)
    Write-Host "  Uninstalling $Label via winget..." -ForegroundColor DarkGray
    foreach ($id in $Ids) {
        try {
            $result = & winget uninstall --id $id --silent --force --accept-source-agreements --disable-interactivity 2>&1
            $exit = $LASTEXITCODE
            if ($exit -eq 0) {
                Write-Host "    winget: removed $Label ($id)" -ForegroundColor DarkGray
                Start-Sleep -Seconds 5
                return $true
            }
        } catch {}
    }
    # Also try by name as last resort
    try {
        $result = & winget uninstall --name $Label --silent --force --accept-source-agreements --disable-interactivity 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    winget: removed $Label (by name)" -ForegroundColor DarkGray
            Start-Sleep -Seconds 5
            return $true
        }
    } catch {}
    Write-Host "    winget: $Label not found or already removed" -ForegroundColor DarkGray
    return $false
}

# ── Helper: Find and run uninstallers from the Windows registry ──
function Run-RegistryUninstallers {
    param([string]$SearchTerm)
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
    )
    foreach ($regPath in $regPaths) {
        if (-not (Test-Path $regPath)) { continue }
        Get-ChildItem $regPath -ErrorAction SilentlyContinue | ForEach-Object {
            $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            $displayName = $props.DisplayName
            $uninstallStr = $props.UninstallString
            $quietUninstall = $props.QuietUninstallString
            if ($displayName -and $displayName -match $SearchTerm -and $uninstallStr) {
                Write-Host "    Registry: found '$displayName'" -ForegroundColor DarkGray
                $cmd = if ($quietUninstall) { $quietUninstall } else { $uninstallStr }
                # Handle MsiExec
                if ($cmd -match 'msiexec' -or $cmd -match '\{[A-F0-9-]+\}') {
                    $guid = [regex]::Match($cmd, '\{[A-F0-9-]+\}').Value
                    if ($guid) {
                        Write-Host "    Running: msiexec /x $guid /quiet /norestart" -ForegroundColor DarkGray
                        Start-Process msiexec.exe -ArgumentList "/x", $guid, "/quiet", "/norestart" -Wait -NoNewWindow -ErrorAction SilentlyContinue
                    }
                }
                # Handle InnoSetup / EXE uninstallers (Git uses this)
                elseif ($cmd -match 'unins\d*\.exe') {
                    $exePath = [regex]::Match($cmd, '"?([^"]+unins\d*\.exe)"?').Groups[1].Value
                    if ($exePath -and (Test-Path $exePath)) {
                        Write-Host "    Running: $exePath /VERYSILENT /NORESTART" -ForegroundColor DarkGray
                        Start-Process $exePath -ArgumentList "/VERYSILENT", "/NORESTART", "/SUPPRESSMSGBOXES" -Wait -NoNewWindow -ErrorAction SilentlyContinue
                    }
                }
                # Generic exe uninstallers
                elseif ($cmd -match '\.exe') {
                    $exePath = ($cmd -replace '"', '').Trim()
                    if (Test-Path $exePath) {
                        Write-Host "    Running: $exePath /S" -ForegroundColor DarkGray
                        Start-Process $exePath -ArgumentList "/S" -Wait -NoNewWindow -ErrorAction SilentlyContinue
                    }
                }
                Start-Sleep -Seconds 3
            }
        }
    }
}

# ──────────────────────────────────────
# 1. Kill CodeCollab
# ──────────────────────────────────────
Write-Host "[1/8] Stopping CodeCollab..." -ForegroundColor Yellow
Stop-Process -Name "CodeCollab" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 2. Remove CodeCollab app + data
# ──────────────────────────────────────
Write-Host "[2/8] Removing CodeCollab app + data..." -ForegroundColor Yellow
Remove-IfExists "$env:LOCALAPPDATA\Programs\CodeCollab"
Remove-IfExists "$env:APPDATA\codebuddy"
Remove-IfExists "$env:APPDATA\CodeCollab"
Remove-IfExists "$env:LOCALAPPDATA\codebuddy-updater"
Remove-IfExists "$env:LOCALAPPDATA\codebuddy"
Remove-IfExists "$env:LOCALAPPDATA\CodeCollab"
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 3. Uninstall Codex CLI
# ──────────────────────────────────────
Write-Host "[3/8] Removing Codex CLI..." -ForegroundColor Yellow
try { & npm.cmd uninstall -g @openai/codex 2>$null } catch {}
Remove-IfExists "$env:USERPROFILE\.codex"
if (Test-Path "$env:APPDATA\npm\codex.cmd") { Remove-Item "$env:APPDATA\npm\codex.cmd" -Force -ErrorAction SilentlyContinue }
if (Test-Path "$env:APPDATA\npm\codex") { Remove-Item "$env:APPDATA\npm\codex" -Force -ErrorAction SilentlyContinue }
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 4. Uninstall Claude Code
# ──────────────────────────────────────
Write-Host "[4/8] Removing Claude Code..." -ForegroundColor Yellow
try { & npm.cmd uninstall -g @anthropic-ai/claude-code 2>$null } catch {}
Try-WingetUninstall -Ids @("Anthropic.ClaudeCode", "Anthropic.Claude") -Label "Claude Code"
Run-RegistryUninstallers "Claude"
Remove-IfExists "$env:USERPROFILE\.local\bin\claude.exe"
Remove-IfExists "$env:USERPROFILE\.local\bin\claude"
Remove-IfExists "$env:USERPROFILE\.local"
Remove-IfExists "$env:USERPROFILE\.claude"
Remove-IfExists "$env:APPDATA\claude"
Remove-IfExists "$env:LOCALAPPDATA\claude"
if (Test-Path "$env:APPDATA\npm\claude.cmd") { Remove-Item "$env:APPDATA\npm\claude.cmd" -Force -ErrorAction SilentlyContinue }
if (Test-Path "$env:APPDATA\npm\claude") { Remove-Item "$env:APPDATA\npm\claude" -Force -ErrorAction SilentlyContinue }
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "Anthropic*" -Directory -ErrorAction SilentlyContinue | ForEach-Object { Remove-IfExists $_.FullName }
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 5. Uninstall GitHub Copilot CLI
# ──────────────────────────────────────
Write-Host "[5/8] Removing GitHub Copilot CLI..." -ForegroundColor Yellow
try { & gh.exe extension remove github/gh-copilot 2>$null } catch {}
try { & npm.cmd uninstall -g @githubnext/github-copilot-cli 2>$null } catch {}
Try-WingetUninstall -Ids @("GitHub.Copilot") -Label "GitHub Copilot"
Remove-IfExists "$env:LOCALAPPDATA\GitHub CLI\copilot"
if (Test-Path "$env:APPDATA\npm\copilot.cmd") { Remove-Item "$env:APPDATA\npm\copilot.cmd" -Force -ErrorAction SilentlyContinue }
if (Test-Path "$env:APPDATA\npm\copilot") { Remove-Item "$env:APPDATA\npm\copilot" -Force -ErrorAction SilentlyContinue }
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "GitHub.Copilot*" -Directory -ErrorAction SilentlyContinue | ForEach-Object { Remove-IfExists $_.FullName }
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 6. Uninstall GitHub CLI
# ──────────────────────────────────────
Write-Host "[6/8] Removing GitHub CLI..." -ForegroundColor Yellow
try { echo "Y" | & gh.exe auth logout --hostname github.com 2>$null } catch {}
Try-WingetUninstall -Ids @("GitHub.cli", "GitHub.CLI", "GitHub.GitHub.Cli") -Label "GitHub CLI"
Run-RegistryUninstallers "GitHub CLI"
Remove-IfExists "$env:PROGRAMFILES\GitHub CLI"
Remove-IfExists "${env:PROGRAMFILES(x86)}\GitHub CLI"
Remove-IfExists "$env:LOCALAPPDATA\GitHub CLI"
Remove-IfExists "$env:LOCALAPPDATA\Programs\GitHub CLI"
Remove-IfExists "$env:APPDATA\GitHub CLI"
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "GitHub.cli*" -Directory -ErrorAction SilentlyContinue | ForEach-Object { Remove-IfExists $_.FullName }
Start-Sleep -Seconds 3
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 7. Uninstall Node.js + npm globals
# ──────────────────────────────────────
Write-Host "[7/8] Removing Node.js + npm..." -ForegroundColor Yellow
Try-WingetUninstall -Ids @("OpenJS.NodeJS.LTS", "OpenJS.NodeJS") -Label "Node.js"
Run-RegistryUninstallers "Node\.js"
Remove-IfExists "$env:PROGRAMFILES\nodejs"
Remove-IfExists "${env:PROGRAMFILES(x86)}\nodejs"
Remove-IfExists "$env:APPDATA\npm"
Remove-IfExists "$env:APPDATA\npm-cache"
Remove-IfExists "$env:LOCALAPPDATA\npm-cache"
Remove-IfExists "$env:USERPROFILE\.npm"
Remove-IfExists "$env:USERPROFILE\.node_repl_history"
Start-Sleep -Seconds 3
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# 8. Uninstall Python + Git
# ──────────────────────────────────────
Write-Host "[8/8] Removing Python and Git..." -ForegroundColor Yellow

# Python
Write-Host "  Removing Python..." -ForegroundColor DarkGray
Try-WingetUninstall -Ids @("Python.Python.3.13", "Python.Python.3.12", "Python.Python.3.11", "Python.Python.3.10") -Label "Python"
Run-RegistryUninstallers "Python 3\."
foreach ($ver in @("Python313","Python312","Python311","Python310","Python39")) {
    Remove-IfExists "$env:PROGRAMFILES\$ver"
    Remove-IfExists "${env:PROGRAMFILES(x86)}\$ver"
    Remove-IfExists "C:\$ver"
}
Remove-IfExists "$env:LOCALAPPDATA\Programs\Python"
Remove-IfExists "$env:LOCALAPPDATA\pip"
Remove-IfExists "$env:APPDATA\pip"
Remove-IfExists "$env:APPDATA\Python"
Remove-IfExists "$env:LOCALAPPDATA\Python"
# Also remove the Python Launcher
Try-WingetUninstall -Ids @("Python.Launcher") -Label "Python Launcher"
Run-RegistryUninstallers "Python Launcher"
Remove-IfExists "$env:PROGRAMFILES\Python Launcher"
Remove-IfExists "${env:PROGRAMFILES(x86)}\Python Launcher"
Start-Sleep -Seconds 3

# Git
Write-Host "  Removing Git..." -ForegroundColor DarkGray
Try-WingetUninstall -Ids @("Git.Git") -Label "Git"
Run-RegistryUninstallers "^Git$|^Git version|^Git for Windows"
Remove-IfExists "$env:PROGRAMFILES\Git"
Remove-IfExists "${env:PROGRAMFILES(x86)}\Git"
Remove-IfExists "$env:USERPROFILE\.gitconfig"
Remove-IfExists "$env:USERPROFILE\.git-credentials"
Start-Sleep -Seconds 3
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# Clean System + User PATH
# ──────────────────────────────────────
Write-Host ""
Write-Host "Cleaning PATH..." -ForegroundColor Yellow
foreach ($scope in @("Machine", "User")) {
    $currentPath = [Environment]::GetEnvironmentVariable("Path", $scope)
    if ($currentPath) {
        $cleaned = ($currentPath -split ";" | Where-Object {
            $_ -and
            $_ -notmatch "nodejs" -and
            $_ -notmatch "[\\\/]npm" -and
            $_ -notmatch "Python3" -and
            $_ -notmatch "Python\\Python" -and
            $_ -notmatch "Git\\cmd" -and
            $_ -notmatch "Git\\usr" -and
            $_ -notmatch "Git\\bin" -and
            $_ -notmatch "Git\\mingw" -and
            $_ -notmatch "GitHub CLI" -and
            $_ -notmatch "GitHub\\Copilot" -and
            $_ -notmatch "[Cc]laude" -and
            $_ -notmatch "[Cc]odex" -and
            $_ -notmatch "\.local\\bin" -and
            $_ -notmatch "Python Launcher"
        }) -join ";"
        if ($cleaned -ne $currentPath) {
            [Environment]::SetEnvironmentVariable("Path", $cleaned, $scope)
            Write-Host "  Cleaned $scope PATH" -ForegroundColor DarkGray
        }
    }
}
Write-Host "  Done." -ForegroundColor Green

# ──────────────────────────────────────
# Final Verification
# ──────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Refresh this session's PATH to match what we just cleaned
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$env:PATH = "$machinePath;$userPath"

$allGood = $true
foreach ($tool in @(
    @{Name="git"; Label="Git"},
    @{Name="node"; Label="Node.js"},
    @{Name="npm"; Label="npm"},
    @{Name="python"; Label="Python"},
    @{Name="gh"; Label="GitHub CLI"},
    @{Name="claude"; Label="Claude Code"},
    @{Name="codex"; Label="Codex CLI"},
    @{Name="copilot"; Label="Copilot CLI"}
)) {
    $found = $false
    try {
        $null = & where.exe $tool.Name 2>$null
        if ($LASTEXITCODE -eq 0) { $found = $true }
    } catch {}
    if ($found) {
        Write-Host "  STILL FOUND: $($tool.Label)" -ForegroundColor Red
        # Show where it's found for debugging
        try {
            $locations = & where.exe $tool.Name 2>$null
            foreach ($loc in $locations) {
                Write-Host "    at: $loc" -ForegroundColor DarkGray
            }
        } catch {}
        $allGood = $false
    } else {
        Write-Host "  Removed OK:  $($tool.Label)" -ForegroundColor Green
    }
}

Write-Host ""
if ($allGood) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Full uninstall complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  Uninstall mostly complete." -ForegroundColor Yellow
    Write-Host "  Some tools still detected (see above)." -ForegroundColor Yellow
    Write-Host "  Restart and run this script again" -ForegroundColor Yellow
    Write-Host "  to remove any remaining items." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "RESTART your computer for all changes to take effect." -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to close"
