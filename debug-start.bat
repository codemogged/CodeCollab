@echo off
chcp 65001 >nul
title CodeBuddy Debug Console
echo ============================================================
echo  CodeBuddy Debug Console
echo  Started: %date% %time%
echo  Focus:   Multi-machine sync testing (P2P + git)
echo ============================================================
echo.
echo  KEY SYNC TAGS TO WATCH:
echo  ─────────────────────────────────────────────────────────
echo  [P2P:xxxx] Peer connected / disconnected     Peer lifecycle
echo  [P2P:xxxx] Joined room / Reconnecting        Room state
echo  [P2P-sync] Peer "name" connected             Initial thread broadcast
echo  [P2P-apply] plan from peer                   Incoming plan merge
echo  [P2P-apply] task "..." planned -^> building   Task status sync
echo  [P2P-apply] conversation from peer           Chat message sync
echo  [P2P-apply] thread-sync from peer            Full thread backfill
echo  [P2P-apply] new-commits / auto-pulling       Git pull from peer push
echo  [P2P-apply] agent-context signal             Shared agent snapshot
echo  [file-watcher] auto-sync pushed              Local git push after save
echo  [shared-context] snapshot save/load          Agent context persistence
echo.
echo  AGENT / CHAT TAGS:
echo  [pm-chat] / [solo-chat] / [task-agent] START  Agent invocation
echo  [compact] Triggered / Done                    Context compaction fired
echo  [checkpoint-restore] START / DONE             Restore flow milestones
echo.
echo  RED FLAGS:
echo  Rejecting peer message with bad HMAC   Bad auth / wrong invite secret
echo  [P2P-apply] plan SKIP                  Incoming plan had no matching project
echo  auto-sync force-push FAILED            Git push completely failed
echo  [branch-guard] All recovery failed     Could not reach codebuddy-build
echo  [compact] Summarization failed         Compaction errored (OK, falls back)
echo  ENAMETOOLONG / spawn error             Prompt too long for CLI
echo  ─────────────────────────────────────────────────────────
echo.
echo  All logs will stream below. Keep this window open.
echo.
echo ---- Application Logs Start Below ----
echo.

:: Auto-deploy: ONLY when this bat is run from inside the source project repo.
:: When run from Desktop\CodeBuddy Install, skip deploy and launch directly.
:: This prevents the install folder from being wiped on every debug launch.
if not defined CODEBUDDY_LOG_ALLOW set "CODEBUDDY_LOG_ALLOW=startup,sync,p2p,file-watcher,shared-context,deploy,launcher,shutdown,repo,git-queue"
if not defined CODEBUDDY_LOG_LEVEL set "CODEBUDDY_LOG_LEVEL=info"
set "ELECTRON_ENABLE_LOGGING="

:: Only deploy when the scripts\ folder is sitting next to this bat
:: (meaning we're running from the source repo, not the install folder).
if exist "%~dp0scripts\deploy-install.ps1" (
    if exist "%~dp0dist-electron\win-unpacked\CodeBuddy.exe" (
        echo [deploy] Build v109-repo-secret found -- deploying to Desktop\CodeBuddy Install...
        powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-install.ps1"
        if "%ERRORLEVEL%" NEQ "0" (
            echo [deploy] Deploy script failed with exit code %ERRORLEVEL%. Continuing.
        ) else (
            echo [deploy] Deploy completed successfully.
        )
    )
)
echo [build] Version: v109-repo-secret

if exist "%~dp0CodeBuddy.exe" (
    echo [launcher] Starting from: %~dp0CodeBuddy.exe
    "%~dp0CodeBuddy.exe" --disable-gpu 2>&1
) else if exist "%~dp0dist-electron\win-unpacked\CodeBuddy.exe" (
    echo [launcher] Starting from: dist-electron\win-unpacked\CodeBuddy.exe
    "%~dp0dist-electron\win-unpacked\CodeBuddy.exe" --disable-gpu 2>&1
) else if exist "%LOCALAPPDATA%\Programs\codebuddy\CodeBuddy.exe" (
    echo [launcher] Starting from: %LOCALAPPDATA%\Programs\codebuddy\CodeBuddy.exe
    "%LOCALAPPDATA%\Programs\codebuddy\CodeBuddy.exe" 2>&1
) else (
    echo [launcher] No built exe found. Starting in dev mode...
    cd /d "%~dp0"
    npx electron . 2>&1
)

echo.
echo ---- Application Exited ----
pause
