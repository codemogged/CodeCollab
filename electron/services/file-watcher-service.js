/**
 * File Watcher Service
 * 
 * Watches the active project directory for file changes using Node.js fs.watch (recursive).
 * When changes are detected, debounces for 10 seconds then auto-commits
 * and pushes to the `codebuddy-build` branch.
 * 
 * Exposes pause/resume to prevent echo during auto-pull operations.
 */
const fs = require("fs");
const path = require("path");

function createFileWatcherService({ repoService, processService, p2pService, sendEvent }) {
  let watcher = null;
  let watchedRepoPath = null;
  let debounceTimer = null;
  let paused = false;
  let syncing = false;
  let agentActive = false;  // True while a task/PM/solo agent process is running

  const DEBOUNCE_MS = 10_000; // 10 seconds after last change

  // Directory names to ignore
  const IGNORED_DIRS = new Set([
    "node_modules", ".next", "dist", "dist-electron", ".git",
    "out", "tmp", "__pycache__", ".venv", "venv", "target",
    ".cache", "coverage", "build",
  ]);

  function log(...args) {
    console.log("[file-watcher]", ...args);
  }

  function shouldIgnore(relativePath) {
    if (!relativePath) return true;
    const parts = relativePath.split(path.sep);
    for (const part of parts) {
      if (IGNORED_DIRS.has(part)) return true;
    }
    // Skip checkpoint snapshots inside .codebuddy (large, not needed for sync)
    if (parts[0] === ".codebuddy" && parts[1] === "checkpoints") return true;
    // Skip log files
    if (relativePath.endsWith(".log")) return true;
    return false;
  }

  async function startWatching(repoPath) {
    const resolved = path.resolve(repoPath);

    // Already watching this exact repo — don't restart (preserve pending debounce)
    if (watcher && watchedRepoPath === resolved) {
      log("Already watching", resolved, "— skipping restart.");
      return { watching: true, repoPath: resolved };
    }

    if (watcher) {
      await stopWatching();
    }

    watchedRepoPath = resolved;
    paused = false;
    syncing = false;

    log("Starting watcher on", watchedRepoPath);

    // Ensure .codebuddy/checkpoints/ is in .gitignore so git never tracks large checkpoint data
    try {
      const gitignorePath = path.join(watchedRepoPath, ".gitignore");
      let gitignoreContent = "";
      try { gitignoreContent = require("fs").readFileSync(gitignorePath, "utf8"); } catch { /* file might not exist */ }
      if (!gitignoreContent.includes(".codebuddy/checkpoints")) {
        const entry = "\n# CodeBuddy checkpoint snapshots (large, local-only)\n.codebuddy/checkpoints/\n";
        require("fs").appendFileSync(gitignorePath, entry, "utf8");
        log("Added .codebuddy/checkpoints/ to .gitignore.");
      }
    } catch (err) {
      log("Could not update .gitignore for checkpoints:", err?.message);
    }

    // Configure git to use gh CLI for credential management (needed for auto-push/pull)
    try {
      const { execSync } = require("child_process");
      execSync('git config credential.helper "!gh auth git-credential"', { cwd: watchedRepoPath, encoding: "utf8", stdio: "pipe" });
    } catch { /* gh may not be available — credential helper remains unchanged */ }

    try {
      watcher = fs.watch(watchedRepoPath, { recursive: true }, (eventType, filename) => {
        if (paused || syncing) return;
        if (!filename) return;

        // Normalize path separators
        const relative = filename.replace(/\//g, path.sep);
        if (shouldIgnore(relative)) return;

        log(`Change detected: ${eventType} ${relative}`);
        sendEvent("fileWatcher:changed", { eventType, filePath: relative });

        // Reset debounce timer
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void doAutoSync();
        }, DEBOUNCE_MS);
      });

      watcher.on("error", (err) => {
        log("Watcher error:", err?.message);
      });
    } catch (err) {
      log("Failed to start watcher:", err?.message);
      return { watching: false, error: err?.message };
    }

    sendEvent("fileWatcher:status", { watching: true, repoPath: watchedRepoPath });
    log("Watcher started.");
    return { watching: true, repoPath: watchedRepoPath };
  }

  async function stopWatching() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (watcher) {
      log("Stopping watcher...");
      watcher.close();
      watcher = null;
    }

    watchedRepoPath = null;
    paused = false;
    syncing = false;

    sendEvent("fileWatcher:status", { watching: false, repoPath: null });
    log("Watcher stopped.");
    return { watching: false };
  }

  function pauseWatching() {
    if (!watcher) return;
    paused = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    log("Watcher paused (pull in progress).");
  }

  function resumeWatching() {
    if (!watcher) return;
    paused = false;
    log("Watcher resumed.");
  }

  function getStatus() {
    return {
      watching: Boolean(watcher),
      repoPath: watchedRepoPath,
      paused,
      syncing,
    };
  }

  /** Clean up stuck git state (index.lock, rebase, merge) so subsequent git commands succeed. */
  function cleanupGitState(cwd) {
    const { execSync } = require("child_process");
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };

    // Remove stale index.lock
    const indexLock = path.join(cwd, ".git", "index.lock");
    try {
      if (fs.existsSync(indexLock)) {
        fs.unlinkSync(indexLock);
        log("Removed stale .git/index.lock");
      }
    } catch (e) { log("Could not remove index.lock:", e.message); }

    // Abort stuck rebase
    const rebaseMerge = path.join(cwd, ".git", "rebase-merge");
    const rebaseApply = path.join(cwd, ".git", "rebase-apply");
    if (fs.existsSync(rebaseMerge) || fs.existsSync(rebaseApply)) {
      try {
        execSync("git rebase --abort", { cwd, encoding: "utf8", env: gitEnv, stdio: "pipe", timeout: 15000 });
        log("Aborted stuck rebase.");
      } catch {
        try {
          if (fs.existsSync(rebaseMerge)) fs.rmSync(rebaseMerge, { recursive: true, force: true });
          if (fs.existsSync(rebaseApply)) fs.rmSync(rebaseApply, { recursive: true, force: true });
          log("Force-removed rebase directories.");
        } catch (e2) { log("Could not remove rebase dirs:", e2.message); }
      }
    }

    // Abort stuck merge
    const mergeHead = path.join(cwd, ".git", "MERGE_HEAD");
    if (fs.existsSync(mergeHead)) {
      try {
        execSync("git merge --abort", { cwd, encoding: "utf8", env: gitEnv, stdio: "pipe", timeout: 15000 });
        log("Aborted stuck merge.");
      } catch { /* ignore */ }
    }
  }

  async function doAutoSync() {
    if (!watchedRepoPath || paused || syncing) return;

    // Don't sync while a task agent is actively running — it holds the git index
    if (agentActive) {
      log("Agent is active — deferring auto-sync until agent finishes.");
      return;
    }

    syncing = true;
    sendEvent("fileWatcher:syncStart", { repoPath: watchedRepoPath });
    log("Auto-sync starting...");

    try {
      const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
      const { execSync } = require("child_process");
      const cwd = watchedRepoPath;

      // Clean up any stuck git state before attempting sync
      cleanupGitState(cwd);

      // Ensure we're on codebuddy-build branch
      let currentBranch;
      try {
        currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", env: gitEnv }).trim();
      } catch {
        log("Could not determine current branch — aborting auto-sync.");
        return;
      }

      if (currentBranch !== "codebuddy-build") {
        // Force switch to codebuddy-build — agent work should always land on the working branch.
        log(`Not on codebuddy-build (on ${currentBranch}) — switching to codebuddy-build for auto-sync...`);
        try {
          const status = execSync("git status --porcelain", { cwd, encoding: "utf8", env: gitEnv }).trim();
          let stashed = false;
          if (status) {
            try {
              execSync("git stash --include-untracked", { cwd, encoding: "utf8", env: gitEnv, timeout: 30000 });
              stashed = true;
            } catch (stashErr) {
              log(`git stash failed: ${stashErr.message} — attempting force-checkout...`);
              cleanupGitState(cwd);
              try {
                execSync("git checkout -f codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 30000 });
                log("Force-switched to codebuddy-build for auto-sync.");
              } catch {
                execSync("git checkout -B codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 30000 });
                log("Force-created codebuddy-build for auto-sync.");
              }
              // Skip rest of stash flow — we're on the right branch now
              stashed = false;
            }
          }
          if (!stashed || currentBranch !== "codebuddy-build") {
            try {
              // Only checkout if we haven't already force-switched above
              const nowBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", env: gitEnv }).trim();
              if (nowBranch !== "codebuddy-build") {
                try {
                  execSync("git checkout codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 30000 });
                } catch {
                  execSync("git checkout -b codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 30000 });
                }
              }
            } catch { /* already on branch, or handled above */ }
          }
          if (stashed) {
            try {
              execSync("git stash pop", { cwd, encoding: "utf8", env: gitEnv, timeout: 30000 });
            } catch {
              log("git stash pop had conflicts after branch switch — changes saved in stash.");
            }
          }
          log("Switched to codebuddy-build for auto-sync.");
        } catch (switchErr) {
          log(`Could not switch to codebuddy-build: ${switchErr.message} — skipping auto-sync.`);
          return;
        }
      }

      // Check if there are actually any changes to commit
      const status = execSync("git status --porcelain", { cwd, encoding: "utf8", env: gitEnv }).trim();
      if (!status) {
        log("No changes to commit.");
        return;
      }

      // Stage all changes
      execSync("git add -A", { cwd, encoding: "utf8", env: gitEnv });

      // Commit
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const commitMsg = `auto: sync changes ${timestamp}`;
      try {
        execSync(`git commit -m "${commitMsg}" --no-verify`, { cwd, encoding: "utf8", env: gitEnv });
      } catch (commitErr) {
        // "nothing to commit" is fine
        if (commitErr.message?.includes("nothing to commit")) {
          log("Nothing to commit after staging.");
          return;
        }
        throw commitErr;
      }

      // Push to codebuddy-build
      try {
        execSync("git push origin codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
        log("Auto-sync pushed to codebuddy-build.");
      } catch (pushErr) {
        const errMsg = pushErr?.message || "";
        if (errMsg.includes("has no upstream") || errMsg.includes("does not match any")) {
          // Remote branch doesn't exist yet — create it
          execSync("git push -u origin codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
          log("Auto-sync created and pushed codebuddy-build remote branch.");
        } else if (errMsg.includes("non-fast-forward") || errMsg.includes("rejected") || errMsg.includes("tip of your current branch is behind")) {
          // Local is behind remote — pull rebase first, then retry push
          log("Auto-sync push rejected (non-fast-forward) — pulling and retrying...");
          try {
            cleanupGitState(cwd);
            execSync("git pull origin codebuddy-build --rebase", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
            execSync("git push origin codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
            log("Auto-sync pulled + pushed to codebuddy-build (retry succeeded).");
          } catch (retryErr) {
            log("Auto-sync pull+push retry failed:", retryErr?.message);
            // Rebase likely conflicted — abort it and use soft-reset strategy instead
            try {
              cleanupGitState(cwd);
              // Fetch latest remote state
              execSync("git fetch origin codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
              // Soft-reset to remote tip: moves HEAD to remote but keeps our changes staged
              execSync("git reset --soft origin/codebuddy-build", { cwd, encoding: "utf8", env: gitEnv });
              // Re-commit our changes on top of the remote
              const timestamp2 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
              execSync(`git add -A`, { cwd, encoding: "utf8", env: gitEnv });
              execSync(`git commit -m "auto: sync changes ${timestamp2}" --no-verify --allow-empty`, { cwd, encoding: "utf8", env: gitEnv });
              execSync("git push origin codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
              log("Auto-sync soft-reset + re-commit + push succeeded.");
            } catch (softResetErr) {
              log("Auto-sync soft-reset strategy failed:", softResetErr?.message);
              // Last resort: force-push with lease
              try {
                cleanupGitState(cwd);
                execSync("git push origin codebuddy-build --force-with-lease", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
                log("Auto-sync force-push-with-lease succeeded.");
              } catch (forcePushErr) {
                log("Auto-sync force-push also failed:", forcePushErr?.message);
                throw retryErr;
              }
            }
          }
        } else {
          throw pushErr;
        }
      }

      // Broadcast new-commits to P2P peers
      if (p2pService && typeof p2pService.broadcastStateChange === "function") {
        p2pService.broadcastStateChange("new-commits", "codebuddy-build", {
          branch: "codebuddy-build",
          commitMessage: commitMsg,
          pushedAt: new Date().toISOString(),
        });
        log("Broadcast new-commits to P2P peers.");
      }

      sendEvent("fileWatcher:syncComplete", { repoPath: watchedRepoPath, commitMessage: commitMsg, success: true });
    } catch (err) {
      log("Auto-sync error:", err?.message);
      sendEvent("fileWatcher:syncComplete", { repoPath: watchedRepoPath, success: false, error: err?.message });
    } finally {
      syncing = false;
    }
  }

  /** Manually trigger a push-to-main: merge codebuddy-build → main, push main, switch back */
  async function pushToMain(repoPath) {
    const cwd = path.resolve(repoPath);
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
    const { execSync } = require("child_process");

    log("Push to main starting...");

    // First, do an auto-sync of any pending changes
    if (watchedRepoPath === cwd && !syncing) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await doAutoSync();
    }

    // Now merge codebuddy-build → main
    try {
      // Ensure codebuddy-build is committed
      const status = execSync("git status --porcelain", { cwd, encoding: "utf8", env: gitEnv }).trim();
      if (status) {
        execSync("git add -A", { cwd, encoding: "utf8", env: gitEnv });
        execSync('git commit -m "sync: pre-merge commit" --no-verify', { cwd, encoding: "utf8", env: gitEnv });
      }

      // Switch to main
      execSync("git checkout main", { cwd, encoding: "utf8", env: gitEnv });

      // Merge codebuddy-build into main (fast-forward if possible)
      execSync("git merge codebuddy-build --no-edit", { cwd, encoding: "utf8", env: gitEnv });

      // Push main
      execSync("git push origin main", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
      log("Pushed main to origin.");

      // Switch back to codebuddy-build
      execSync("git checkout codebuddy-build", { cwd, encoding: "utf8", env: gitEnv });
      log("Push to main complete — back on codebuddy-build.");

      // Broadcast main-updated to P2P peers so they can fetch the latest main
      if (p2pService && typeof p2pService.broadcastStateChange === "function") {
        p2pService.broadcastStateChange("main-updated", "main", {
          branch: "main",
          pushedAt: new Date().toISOString(),
        });
        log("Broadcast main-updated to P2P peers.");
      }

      return { success: true, message: "Merged codebuddy-build → main and pushed." };
    } catch (err) {
      // Try to recover back to codebuddy-build
      try {
        execSync("git checkout codebuddy-build", { cwd, encoding: "utf8", env: gitEnv });
      } catch { /* best effort */ }

      log("Push to main error:", err?.message);
      return { success: false, message: err?.message || "Push to main failed." };
    }
  }

  /** Auto-pull from codebuddy-build (triggered by P2P new-commits signal) */
  async function autoPull(repoPath) {
    const cwd = path.resolve(repoPath);
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
    const { execSync } = require("child_process");

    log("Auto-pull starting...");

    // Clean up any stuck git state before pulling
    cleanupGitState(cwd);

    pauseWatching(); // prevent echo: pull changes → watcher fires → auto-commit → push → loop

    try {
      // Configure credential helper (in case this machine hasn't done it yet)
      try {
        execSync('git config credential.helper "!gh auth git-credential"', { cwd, encoding: "utf8", stdio: "pipe" });
      } catch { /* best effort */ }

      // Ensure we're on codebuddy-build
      let currentBranch;
      try {
        currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", env: gitEnv }).trim();
        log(`Auto-pull: current branch is "${currentBranch}".`);
      } catch (branchErr) {
        log("Cannot determine branch — aborting auto-pull.", branchErr?.message);
        return { success: false, message: "Cannot determine current branch." };
      }

      if (currentBranch !== "codebuddy-build") {
        // If we ended up on detached HEAD (e.g. from aborted rebase), try switching to codebuddy-build
        if (currentBranch === "HEAD") {
          log("Detached HEAD detected — attempting to switch to codebuddy-build...");
          try {
            execSync("git checkout codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 30000 });
            currentBranch = "codebuddy-build";
            log("Switched from detached HEAD to codebuddy-build.");
          } catch (switchErr) {
            log("Could not switch from detached HEAD:", switchErr?.message);
            // Fall through to fetch-only path
          }
        }
      }

      if (currentBranch !== "codebuddy-build") {
        // User is viewing a different branch — don't switch. Just fetch to update the local ref.
        log(`Not on codebuddy-build (on ${currentBranch}) — fetching codebuddy-build without switching...`);
        try {
          execSync("git fetch origin codebuddy-build:codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
          log("Fetched codebuddy-build (updated local ref without switching).");
        } catch (fetchErr) {
          // If fast-forward fetch fails, just do a plain fetch
          try {
            execSync("git fetch origin codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
            log("Fetched codebuddy-build remote ref.");
          } catch { /* ignore */ }
        }
        sendEvent("fileWatcher:pullComplete", { repoPath: cwd, success: true });
        return { success: true, message: "Fetched codebuddy-build (user viewing different branch)." };
      }

      // Stage everything (including untracked files) then stash to make working tree clean for pull
      let didStash = false;
      try {
        execSync("git add -A", { cwd, encoding: "utf8", env: gitEnv, stdio: "pipe" });
        const stashOut = execSync("git stash", { cwd, encoding: "utf8", env: gitEnv }).trim();
        didStash = !stashOut.includes("No local changes");
        log(`Auto-pull stash: didStash=${didStash} (${stashOut})`);
      } catch (stashErr) {
        log("Stash warning:", stashErr?.message);
      }

      // Pull latest
      try {
        const pullOut = execSync("git pull origin codebuddy-build --rebase", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 }).trim();
        log("Auto-pull completed.", pullOut || "(no output)");
      } catch (pullErr) {
        log("Auto-pull first attempt failed:", pullErr?.message);
        // If pull --rebase fails, clean up stuck state and hard-reset to remote
        cleanupGitState(cwd);
        try {
          execSync("git fetch origin codebuddy-build", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
          execSync("git reset --hard origin/codebuddy-build", { cwd, encoding: "utf8", env: gitEnv });
          log("Auto-pull recovery: reset to origin/codebuddy-build.");
        } catch (resetErr) {
          log("Auto-pull recovery failed:", resetErr?.message);
          // Pop stash back even if pull failed
          if (didStash) {
            try { execSync("git stash pop", { cwd, encoding: "utf8", env: gitEnv }); } catch { /* ignore */ }
          }
          sendEvent("fileWatcher:pullComplete", { repoPath: cwd, success: false, error: pullErr?.message });
          return { success: false, message: pullErr?.message || "Auto-pull failed." };
        }
      }

      // Pop stash if we stashed
      if (didStash) {
        try {
          execSync("git stash pop", { cwd, encoding: "utf8", env: gitEnv });
          log("Stash popped successfully.");
        } catch (popErr) {
          log("Stash pop conflict — dropping stash and keeping remote version:", popErr?.message);
          // On conflict, prefer the remote version (just pulled) and drop the stash
          try { execSync("git checkout -- .", { cwd, encoding: "utf8", env: gitEnv, stdio: "pipe" }); } catch { /* ignore */ }
          try { execSync("git stash drop", { cwd, encoding: "utf8", env: gitEnv, stdio: "pipe" }); } catch { /* ignore */ }
        }
      }

      sendEvent("fileWatcher:pullComplete", { repoPath: cwd, success: true });
      return { success: true, message: "Pulled latest changes from codebuddy-build." };
    } catch (err) {
      log("Auto-pull error:", err?.message);
      sendEvent("fileWatcher:pullComplete", { repoPath: cwd, success: false, error: err?.message });
      return { success: false, message: err?.message || "Auto-pull failed." };
    } finally {
      // Resume watcher with a small delay to let filesystem settle
      setTimeout(() => resumeWatching(), 3000);
    }
  }

  function setAgentActive(active) {
    agentActive = Boolean(active);
    log(`Agent active: ${agentActive}`);
  }

  return {
    startWatching,
    stopWatching,
    pauseWatching,
    resumeWatching,
    getStatus,
    doAutoSync,
    pushToMain,
    autoPull,
    setAgentActive,
  };
}

module.exports = { createFileWatcherService };
