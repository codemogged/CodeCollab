@echo off
title CodeBuddy Debug Console
echo ============================================================
echo  CodeBuddy Debug Console
echo  Started: %date% %time%
echo ============================================================
echo.
echo All logs will be captured here. Keep this window open.
echo Share this output to diagnose sync/P2P issues.
echo.
echo ---- Application Logs Start Below ----
echo.

:: Launch CodeBuddy.exe from the same folder this bat lives in
if exist "%~dp0CodeBuddy.exe" (
    echo [launcher] Starting from: %~dp0CodeBuddy.exe
    "%~dp0CodeBuddy.exe" --enable-logging --v=1 2>&1
) else if exist "%~dp0dist-electron\win-unpacked\CodeBuddy.exe" (
    echo [launcher] Starting from: dist-electron\win-unpacked\CodeBuddy.exe
    "%~dp0dist-electron\win-unpacked\CodeBuddy.exe" --enable-logging --v=1 2>&1
) else if exist "%LOCALAPPDATA%\Programs\codebuddy\CodeBuddy.exe" (
    echo [launcher] Starting from: %LOCALAPPDATA%\Programs\codebuddy\CodeBuddy.exe
    "%LOCALAPPDATA%\Programs\codebuddy\CodeBuddy.exe" --enable-logging --v=1 2>&1
) else (
    echo [launcher] No built exe found. Starting in dev mode...
    cd /d "%~dp0"
    npx electron . --enable-logging --v=1 2>&1
)

echo.
echo ---- Application Exited ----
pause
