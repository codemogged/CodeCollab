@echo off
echo === CodeBuddy Fresh Start ===
echo.
echo Killing CodeBuddy if running...
taskkill /F /IM "CodeBuddy.exe" 2>nul
timeout /t 2 /nobreak >nul

echo Wiping settings (%APPDATA%\codebuddy)...
if exist "%APPDATA%\codebuddy" rmdir /s /q "%APPDATA%\codebuddy"
if exist "%APPDATA%\CodeBuddy" rmdir /s /q "%APPDATA%\CodeBuddy"

echo Wiping cache (%LOCALAPPDATA%\codebuddy)...
if exist "%LOCALAPPDATA%\codebuddy" rmdir /s /q "%LOCALAPPDATA%\codebuddy"
if exist "%LOCALAPPDATA%\CodeBuddy" rmdir /s /q "%LOCALAPPDATA%\CodeBuddy"

echo.
echo Starting CodeBuddy fresh...
:: Auto-deploy built app when build artifacts exist in the repo
if exist "%~dp0dist-electron\win-unpacked\CodeBuddy.exe" (
    if exist "%~dp0scripts\deploy-install.ps1" (
        echo [deploy] Build artifacts found — deploying to Desktop\CodeBuddy Install...
        powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-install.ps1"
        if "%ERRORLEVEL%" NEQ "0" (
            echo [deploy] Deploy script failed with exit code %ERRORLEVEL%. Continuing.
        ) else (
            echo [deploy] Deploy completed successfully.
        )
    ) else (
        echo [deploy] Found built artifacts but deploy script not present; skipping deploy.
    )
)
if exist "%~dp0CodeBuddy.exe" (
    start "" "%~dp0CodeBuddy.exe"
) else if exist "%~dp0..\CodeBuddy Install\CodeBuddy.exe" (
    start "" "%~dp0..\CodeBuddy Install\CodeBuddy.exe"
) else if exist "%~dp0dist-electron\win-unpacked\CodeBuddy.exe" (
    start "" "%~dp0dist-electron\win-unpacked\CodeBuddy.exe"
) else (
    echo ERROR: CodeBuddy.exe not found. Run 'npm run deploy' first.
    pause
    exit /b 1
)
echo Done! CodeBuddy is launching with a clean slate — onboarding will start.
pause
