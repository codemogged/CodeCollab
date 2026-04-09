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
start "" "%~dp0CodeBuddy.exe"
echo Done! CodeBuddy is launching with a clean slate — onboarding will start.
pause
