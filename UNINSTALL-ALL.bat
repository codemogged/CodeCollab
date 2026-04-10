@echo off
title CodeBuddy - Full Uninstall
color 0C

:: ── Auto-elevate to Administrator (required for MSI uninstalls) ──
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs -ArgumentList '%~dp0'"
    exit /b
)
cd /d "%~dp0"

echo.
echo ========================================
echo   CodeBuddy FULL Uninstall
echo ========================================
echo.
echo This will remove all tools CodeBuddy installs:
echo   - CodeBuddy app + settings
echo   - GitHub Copilot CLI
echo   - Claude Code
echo   - Codex CLI
echo   - GitHub CLI
echo   - Node.js + npm
echo   - Python
echo   - Git
echo.
echo Type YES to continue, or close this window to cancel.
set /p CONFIRM="Are you sure? "
if /I not "%CONFIRM%"=="YES" (
    echo Cancelled.
    pause
    exit /b
)

echo.
echo ── Step 1 of 8: Stopping CodeBuddy ──
echo.
taskkill /F /IM CodeBuddy.exe >nul 2>&1
echo   Done. Waiting 3 seconds...
timeout /t 3 /nobreak >nul

echo.
echo ── Step 2 of 8: Removing CodeBuddy app data ──
echo.
if exist "%LOCALAPPDATA%\Programs\CodeBuddy" (
    rmdir /s /q "%LOCALAPPDATA%\Programs\CodeBuddy" 2>nul
    echo   Removed: Programs\CodeBuddy
)
if exist "%APPDATA%\codebuddy" (
    rmdir /s /q "%APPDATA%\codebuddy" 2>nul
    echo   Removed: codebuddy settings
)
if exist "%APPDATA%\CodeBuddy" (
    rmdir /s /q "%APPDATA%\CodeBuddy" 2>nul
    echo   Removed: CodeBuddy cache
)
echo   Done.
timeout /t 2 /nobreak >nul

echo.
echo ── Step 3 of 8: Removing Codex CLI (npm) ──
echo.
call npm uninstall -g @openai/codex >nul 2>&1
echo   npm uninstall done.
if exist "%USERPROFILE%\.codex" (
    rmdir /s /q "%USERPROFILE%\.codex" 2>nul
    echo   Removed: .codex config
)
echo   Done.
timeout /t 3 /nobreak >nul

echo.
echo ── Step 4 of 8: Removing Claude Code ──
echo.
call npm uninstall -g @anthropic-ai/claude-code >nul 2>&1
echo   npm uninstall done.
winget uninstall --id Anthropic.ClaudeCode --silent --force --accept-source-agreements 2>&1
timeout /t 3 /nobreak >nul
winget uninstall --name "Claude Code" --silent --force --accept-source-agreements 2>&1
timeout /t 3 /nobreak >nul
if exist "%USERPROFILE%\.local\bin\claude.exe" (
    del /f /q "%USERPROFILE%\.local\bin\claude.exe" 2>nul
    echo   Removed: claude.exe
)
if exist "%USERPROFILE%\.claude" (
    rmdir /s /q "%USERPROFILE%\.claude" 2>nul
    echo   Removed: .claude config
)
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Anthropic.ClaudeCode*" (
    for /d %%d in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Anthropic.ClaudeCode*") do (
        rmdir /s /q "%%d" 2>nul
        echo   Removed: %%d
    )
)
echo   Done.
timeout /t 3 /nobreak >nul

echo.
echo ── Step 5 of 8: Removing GitHub Copilot CLI ──
echo.
call gh extension remove github/gh-copilot >nul 2>&1
echo   gh extension remove done.
call npm uninstall -g @githubnext/github-copilot-cli >nul 2>&1
echo   npm uninstall done.
winget uninstall --id GitHub.Copilot --silent --force --accept-source-agreements 2>&1
timeout /t 3 /nobreak >nul
winget uninstall --name "GitHub Copilot" --silent --force --accept-source-agreements 2>&1
timeout /t 3 /nobreak >nul
if exist "%LOCALAPPDATA%\GitHub CLI\copilot" (
    rmdir /s /q "%LOCALAPPDATA%\GitHub CLI\copilot" 2>nul
    echo   Removed: copilot binary folder
)
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.Copilot*" (
    for /d %%d in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.Copilot*") do (
        rmdir /s /q "%%d" 2>nul
        echo   Removed: %%d
    )
)
echo   Done.
timeout /t 3 /nobreak >nul

echo.
echo ── Step 6 of 8: Uninstalling GitHub CLI (winget) ──
echo.
echo Y | gh auth logout --hostname github.com >nul 2>&1
echo   Auth revoked.
echo   Trying winget uninstall with multiple IDs...
winget uninstall --id GitHub.cli --silent --force --accept-source-agreements 2>&1
timeout /t 5 /nobreak >nul
winget uninstall --id GitHub.GitHub.Cli --silent --force --accept-source-agreements 2>&1
timeout /t 3 /nobreak >nul
winget uninstall --name "GitHub CLI" --silent --force --accept-source-agreements 2>&1
timeout /t 3 /nobreak >nul
REM Also try via msiexec for older MSI installs
for /f "tokens=*" %%i in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "GitHub CLI" /d 2^>nul ^| findstr /i "HKLM"') do (
    for /f "tokens=2*" %%a in ('reg query "%%i" /v UninstallString 2^>nul ^| findstr /i "uninstall"') do (
        echo   Running: %%b
        start /wait "" %%b /S 2>nul
    )
)
REM Remove leftover program files
if exist "%PROGRAMFILES%\GitHub CLI" (
    rmdir /s /q "%PROGRAMFILES%\GitHub CLI" 2>nul
    echo   Removed: Program Files\GitHub CLI
)
if exist "%PROGRAMFILES(x86)%\GitHub CLI" (
    rmdir /s /q "%PROGRAMFILES(x86)%\GitHub CLI" 2>nul
    echo   Removed: Program Files (x86)\GitHub CLI
)
if exist "%LOCALAPPDATA%\Programs\GitHub CLI" (
    rmdir /s /q "%LOCALAPPDATA%\Programs\GitHub CLI" 2>nul
    echo   Removed: LocalAppData\Programs\GitHub CLI
)
echo   Done.
timeout /t 5 /nobreak >nul

echo.
echo ── Step 7 of 8: Uninstalling Node.js (winget) ──
echo.
echo   Trying winget uninstall with multiple IDs...
winget uninstall --id OpenJS.NodeJS.LTS --silent --force --accept-source-agreements 2>&1
timeout /t 5 /nobreak >nul
winget uninstall --id OpenJS.NodeJS --silent --force --accept-source-agreements 2>&1
timeout /t 3 /nobreak >nul
winget uninstall --name "Node.js" --silent --force --accept-source-agreements 2>&1
timeout /t 3 /nobreak >nul
REM Also try via msiexec for older MSI installs
for /f "tokens=*" %%i in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "Node.js" /d 2^>nul ^| findstr /i "HKLM"') do (
    for /f "tokens=2*" %%a in ('reg query "%%i" /v UninstallString 2^>nul ^| findstr /i "uninstall"') do (
        echo   Running: %%b
        start /wait "" %%b /S 2>nul
    )
)
REM Remove leftover program files
if exist "%PROGRAMFILES%\nodejs" (
    rmdir /s /q "%PROGRAMFILES%\nodejs" 2>nul
    echo   Removed: Program Files\nodejs
)
if exist "%APPDATA%\npm" (
    rmdir /s /q "%APPDATA%\npm" 2>nul
    echo   Removed: npm global folder
)
if exist "%APPDATA%\npm-cache" (
    rmdir /s /q "%APPDATA%\npm-cache" 2>nul
    echo   Removed: npm cache
)
echo   Done.
timeout /t 5 /nobreak >nul

echo.
echo ── Step 8 of 8: Uninstalling Python + Git (winget) ──
echo.
echo   Uninstalling Python...
winget uninstall --id Python.Python.3.12 --silent --force --accept-source-agreements >nul 2>&1
echo   Python 3.12 done (exit: %ERRORLEVEL%).
timeout /t 5 /nobreak >nul
winget uninstall --id Python.Python.3.11 --silent --force --accept-source-agreements >nul 2>&1
echo   Python 3.11 done (exit: %ERRORLEVEL%).
timeout /t 5 /nobreak >nul
winget uninstall --id Python.Python.3.10 --silent --force --accept-source-agreements >nul 2>&1
echo   Python 3.10 done (exit: %ERRORLEVEL%).
timeout /t 5 /nobreak >nul
echo   Uninstalling Git...
winget uninstall --id Git.Git --silent --force --accept-source-agreements >nul 2>&1
echo   Git done (exit: %ERRORLEVEL%).
echo   Done.
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   Full uninstall complete!
echo ========================================
echo.
echo All CodeBuddy-installed tools have been removed.
echo Restart your computer for PATH changes to take effect.
echo.
pause
