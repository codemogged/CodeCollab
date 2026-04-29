@echo off
echo === CodeCollab Fresh Start ===
echo.
echo Killing CodeCollab if running...
taskkill /F /IM "CodeCollab.exe" 2>nul
timeout /t 2 /nobreak >nul

echo Wiping settings (%APPDATA%\codebuddy)...
if exist "%APPDATA%\codebuddy" rmdir /s /q "%APPDATA%\codebuddy"
if exist "%APPDATA%\CodeCollab" rmdir /s /q "%APPDATA%\CodeCollab"

echo Wiping cache (%LOCALAPPDATA%\codebuddy)...
if exist "%LOCALAPPDATA%\codebuddy" rmdir /s /q "%LOCALAPPDATA%\codebuddy"
if exist "%LOCALAPPDATA%\CodeCollab" rmdir /s /q "%LOCALAPPDATA%\CodeCollab"

echo.
echo Starting CodeCollab fresh...
:: Auto-deploy built app when build artifacts exist in the repo
if exist "%~dp0dist-electron\win-unpacked\CodeCollab.exe" (
    if exist "%~dp0scripts\deploy-install.ps1" (
        echo [deploy] Build artifacts found — deploying to Desktop\CodeCollab Install...
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
if exist "%~dp0CodeCollab.exe" (
    start "" "%~dp0CodeCollab.exe"
) else if exist "%~dp0..\CodeCollab Install\CodeCollab.exe" (
    start "" "%~dp0..\CodeCollab Install\CodeCollab.exe"
) else if exist "%~dp0dist-electron\win-unpacked\CodeCollab.exe" (
    start "" "%~dp0dist-electron\win-unpacked\CodeCollab.exe"
) else (
    echo ERROR: CodeCollab.exe not found. Run 'npm run deploy' first.
    pause
    exit /b 1
)
echo Done! CodeCollab is launching with a clean slate — onboarding will start.
pause
