@echo off
title CodeCollab - Full Uninstall
color 0C

echo.
echo ========================================
echo   CodeCollab FULL Uninstall
echo ========================================
echo.
echo Launching uninstall script...
echo (This will request Administrator access)
echo.

:: Launch the PowerShell uninstall script which handles everything
:: including auto-elevation to Administrator
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0UNINSTALL-ALL.ps1"

:: If the PS1 isn't found (e.g. running .bat standalone), run inline
if %ERRORLEVEL% neq 0 (
    echo.
    echo PowerShell script not found. Running inline uninstall...
    echo.
    
    :: Check for admin
    net session >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo Requesting Administrator privileges...
        powershell -Command "Start-Process cmd.exe -ArgumentList '/c \"%~f0\"' -Verb RunAs"
        exit /b
    )
    cd /d "%~dp0"
    
    echo Type YES to remove ALL CodeCollab-installed tools.
    set /p CONFIRM="Are you sure? "
    if /I not "%CONFIRM%"=="YES" (
        echo Cancelled.
        pause
        exit /b
    )
    
    echo.
    echo Stopping CodeCollab...
    taskkill /F /IM CodeCollab.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
    
    echo Removing npm packages...
    call npm uninstall -g @openai/codex >nul 2>&1
    call npm uninstall -g @anthropic-ai/claude-code >nul 2>&1
    call npm uninstall -g @githubnext/github-copilot-cli >nul 2>&1
    
    echo Removing via winget (with --force)...
    winget uninstall --id Anthropic.ClaudeCode --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    winget uninstall --id GitHub.Copilot --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    winget uninstall --id GitHub.cli --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    timeout /t 5 /nobreak >nul
    winget uninstall --id OpenJS.NodeJS.LTS --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    winget uninstall --id OpenJS.NodeJS --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    timeout /t 5 /nobreak >nul
    winget uninstall --id Python.Python.3.13 --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    winget uninstall --id Python.Python.3.12 --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    winget uninstall --id Python.Python.3.11 --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    winget uninstall --id Python.Launcher --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    timeout /t 5 /nobreak >nul
    winget uninstall --id Git.Git --silent --force --accept-source-agreements --disable-interactivity >nul 2>&1
    timeout /t 5 /nobreak >nul
    
    echo Removing directories...
    rmdir /s /q "%PROGRAMFILES%\Git" 2>nul
    rmdir /s /q "%PROGRAMFILES%\nodejs" 2>nul
    rmdir /s /q "%PROGRAMFILES%\GitHub CLI" 2>nul
    rmdir /s /q "%LOCALAPPDATA%\Programs\Python" 2>nul
    rmdir /s /q "%APPDATA%\npm" 2>nul
    rmdir /s /q "%APPDATA%\npm-cache" 2>nul
    rmdir /s /q "%USERPROFILE%\.npm" 2>nul
    rmdir /s /q "%USERPROFILE%\.claude" 2>nul
    rmdir /s /q "%USERPROFILE%\.codex" 2>nul
    rmdir /s /q "%USERPROFILE%\.local" 2>nul
    rmdir /s /q "%APPDATA%\codebuddy" 2>nul
    rmdir /s /q "%APPDATA%\CodeCollab" 2>nul
    
    echo Cleaning PATH...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "foreach ($s in @('Machine','User')) { $p=[Environment]::GetEnvironmentVariable('Path',$s); if($p){$c=($p -split ';'|?{$_ -and $_ -notmatch 'nodejs|\\npm|Python3|Python\\Python|Git\\cmd|Git\\usr|GitHub CLI|claude|codex|\.local\\bin|Python Launcher'})-join';'; if($c-ne$p){[Environment]::SetEnvironmentVariable('Path',$c,$s)}}}"
    
    echo.
    echo ========================================
    echo   Uninstall complete!
    echo   RESTART your computer.
    echo ========================================
    echo.
    pause
)
