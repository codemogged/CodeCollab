const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function getCommandName(command) {
  if (process.platform === "win32") {
    if (command === "npm") return "npm.cmd";
    if (command === "npx") return "npx.cmd";
  }

  return command;
}

async function runGit(gitCommand, args, cwd) {
  const { stdout } = await execFileAsync(gitCommand, args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });

  return stdout.trim();
}

function parseStatusPorcelain(output) {
  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      indexStatus: line.slice(0, 1),
      workTreeStatus: line.slice(1, 2),
      path: line.slice(3).trim(),
    }));
}

function normalizeRepoPath(repoPath) {
  return path.resolve(repoPath);
}

function normalizeGitPath(repoPath, targetPath) {
  const resolvedTargetPath = path.resolve(repoPath, targetPath);
  const relativePath = path.relative(repoPath, resolvedTargetPath);
  return relativePath || targetPath;
}

function parseCommitFiles(output) {
  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        status: parts[0] ?? "M",
        path: parts.slice(1).join(" "),
      };
    })
    .filter((entry) => entry.path);
}

async function createRepoService({ settingsService } = {}) {
  async function getGitCommand() {
    if (!settingsService?.readSettings) {
      return getCommandName("git");
    }

    const settings = await settingsService.readSettings();
    return settings.cliTools?.git || getCommandName("git");
  }

  /** Clean up stuck git state (index.lock, rebase, merge) so subsequent git commands succeed. */
  function cleanupGitState(repoPath) {
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
    const { execSync } = require("child_process");

    // Remove stale index.lock
    const indexLock = path.join(repoPath, ".git", "index.lock");
    try {
      if (fsSync.existsSync(indexLock)) {
        fsSync.unlinkSync(indexLock);
        console.log("[repo-service] Removed stale .git/index.lock");
      }
    } catch (e) { console.log("[repo-service] Could not remove index.lock:", e.message); }

    // Abort stuck rebase
    const rebaseMerge = path.join(repoPath, ".git", "rebase-merge");
    const rebaseApply = path.join(repoPath, ".git", "rebase-apply");
    if (fsSync.existsSync(rebaseMerge) || fsSync.existsSync(rebaseApply)) {
      try {
        execSync("git rebase --abort", { cwd: repoPath, encoding: "utf8", env: gitEnv, stdio: "pipe", timeout: 15000 });
        console.log("[repo-service] Aborted stuck rebase.");
      } catch {
        try {
          if (fsSync.existsSync(rebaseMerge)) fsSync.rmSync(rebaseMerge, { recursive: true, force: true });
          if (fsSync.existsSync(rebaseApply)) fsSync.rmSync(rebaseApply, { recursive: true, force: true });
          console.log("[repo-service] Force-removed rebase directories.");
        } catch (e2) { console.log("[repo-service] Could not remove rebase dirs:", e2.message); }
      }
    }

    // Abort stuck merge
    const mergeHead = path.join(repoPath, ".git", "MERGE_HEAD");
    if (fsSync.existsSync(mergeHead)) {
      try {
        execSync("git merge --abort", { cwd: repoPath, encoding: "utf8", env: gitEnv, stdio: "pipe", timeout: 15000 });
        console.log("[repo-service] Aborted stuck merge.");
      } catch { /* ignore */ }
    }
  }

  async function ensureRepository(repoPath) {
    const resolvedPath = normalizeRepoPath(repoPath);
    const gitCommand = await getGitCommand();

    try {
      const repoRoot = await runGit(gitCommand, ["rev-parse", "--show-toplevel"], resolvedPath);
      return normalizeRepoPath(repoRoot || resolvedPath);
    } catch {
      throw new Error("Selected folder is not inside a Git repository.");
    }
  }

  async function inspectRepository(repoPath) {
    const resolvedPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();

    let branch = "main";
    try {
      branch = await runGit(gitCommand, ["rev-parse", "--abbrev-ref", "HEAD"], resolvedPath);
    } catch {
      try {
        const headRef = await runGit(gitCommand, ["symbolic-ref", "--short", "HEAD"], resolvedPath);
        branch = headRef || "main";
      } catch {
        branch = "main";
      }
    }

    // If git reports detached HEAD or a rebase state, clean it up automatically
    // so the user never sees "HEAD" or broken state in the UI.
    if (branch === "HEAD" || branch.includes("rebase")) {
      cleanupGitState(resolvedPath);
      // Try switching back to codebuddy-build (the working branch)
      try {
        await runGit(gitCommand, ["checkout", "codebuddy-build"], resolvedPath);
        branch = "codebuddy-build";
        console.log("[repo-service] inspectRepository: recovered from detached HEAD → codebuddy-build");
      } catch {
        // If codebuddy-build switch fails, try force checkout
        try {
          await runGit(gitCommand, ["checkout", "-f", "codebuddy-build"], resolvedPath);
          branch = "codebuddy-build";
          console.log("[repo-service] inspectRepository: force-recovered to codebuddy-build");
        } catch {
          // Last resort: re-read whatever branch we ended up on
          try {
            branch = await runGit(gitCommand, ["rev-parse", "--abbrev-ref", "HEAD"], resolvedPath);
          } catch { branch = "main"; }
        }
      }
    }

    const [statusOutput, branchesOutput] = await Promise.all([
      runGit(gitCommand, ["status", "--porcelain"], resolvedPath),
      runGit(gitCommand, ["branch", "--format", "%(refname:short)"], resolvedPath),
    ]);

    let logOutput = "";
    try {
      logOutput = await runGit(gitCommand, ["log", "--oneline", "-10"], resolvedPath);
    } catch {
      logOutput = "";
    }

    return {
      repoPath: resolvedPath,
      branch,
      branches: branchesOutput
        ? branchesOutput.split(/\r?\n/).filter(b => b && !b.startsWith("("))
        : [],
      changedFiles: parseStatusPorcelain(statusOutput),
      recentCommits: logOutput
        ? logOutput.split(/\r?\n/).filter(Boolean).map((line) => {
            const firstSpace = line.indexOf(" ");
            return {
              hash: firstSpace === -1 ? line : line.slice(0, firstSpace),
              message: firstSpace === -1 ? "" : line.slice(firstSpace + 1),
            };
          })
        : [],
    };
  }

  async function listDirectory(targetPath) {
    const resolvedPath = path.resolve(targetPath);
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

    // Hide build-artifact / dependency directories that aren't source code
    const hiddenNames = new Set(["node_modules", ".next", "__pycache__", ".venv", "venv", "dist", ".cache"]);

    return entries
      .filter((entry) => !hiddenNames.has(entry.name))
      .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
      .map((entry) => ({
        name: entry.name,
        path: path.join(resolvedPath, entry.name),
        type: entry.isDirectory() ? "directory" : "file",
      }));
  }

  async function readFileContent(targetPath) {
    const resolvedPath = path.resolve(targetPath);
    const stats = await fs.stat(resolvedPath);

    if (!stats.isFile()) {
      throw new Error("Selected path is not a file.");
    }

    const content = await fs.readFile(resolvedPath, "utf8");
    return {
      path: resolvedPath,
      content,
    };
  }

  async function writeFileContent(targetPath, content) {
    const resolvedPath = path.resolve(targetPath);
    const stats = await fs.stat(resolvedPath);

    if (!stats.isFile()) {
      throw new Error("Selected path is not a file.");
    }

    if (typeof content !== "string") {
      throw new Error("File content must be a string.");
    }

    await fs.writeFile(resolvedPath, content, "utf8");
    return {
      path: resolvedPath,
      content,
    };
  }

  function buildDocFilename(mode, timestamp) {
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now());
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}`;
    const safeMode = (mode === "technical" || mode === "overview") ? mode : "doc";
    return `${safeMode}_${stamp}.md`;
  }

  async function saveGeneratedDoc(repoPath, mode, content, options = {}) {
    if (!repoPath || typeof repoPath !== "string") {
      throw new Error("repoPath is required.");
    }
    if (typeof content !== "string") {
      throw new Error("content must be a string.");
    }

    const resolvedRepo = path.resolve(repoPath);
    const repoStats = await fs.stat(resolvedRepo);
    if (!repoStats.isDirectory()) {
      throw new Error("repoPath is not a directory.");
    }

    const docsDir = path.join(resolvedRepo, "docs");
    await fs.mkdir(docsDir, { recursive: true });

    const ts = options && options.timestamp ? new Date(options.timestamp) : new Date();
    const filename = buildDocFilename(mode, ts);
    const filePath = path.join(docsDir, filename);
    await fs.writeFile(filePath, content, "utf8");
    const stats = await fs.stat(filePath);

    return {
      path: filePath,
      filename,
      mode: (mode === "technical" || mode === "overview") ? mode : "doc",
      timestamp: ts.toISOString(),
      bytes: stats.size,
    };
  }

  async function listGeneratedDocs(repoPath) {
    if (!repoPath || typeof repoPath !== "string") {
      throw new Error("repoPath is required.");
    }
    const resolvedRepo = path.resolve(repoPath);
    const docsDir = path.join(resolvedRepo, "docs");

    let entries;
    try {
      entries = await fs.readdir(docsDir);
    } catch (err) {
      if (err && err.code === "ENOENT") return [];
      throw err;
    }

    const pattern = /^(technical|overview|doc)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.md$/;
    const results = [];
    for (const filename of entries) {
      if (!filename.toLowerCase().endsWith(".md")) continue;
      const fullPath = path.join(docsDir, filename);
      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch { continue; }
      if (!stats.isFile()) continue;

      let mode = "doc";
      let timestamp = stats.mtime.toISOString();
      const match = pattern.exec(filename);
      if (match) {
        mode = match[1];
        const [, , y, mo, d, h, mi, s] = match;
        const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
        if (!Number.isNaN(dt.getTime())) timestamp = dt.toISOString();
      }

      results.push({
        path: fullPath,
        filename,
        mode,
        timestamp,
        bytes: stats.size,
      });
    }

    results.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    return results;
  }

  async function deleteGeneratedDoc(repoPath, filename) {
    if (!repoPath || typeof repoPath !== "string") {
      throw new Error("repoPath is required.");
    }
    if (!filename || typeof filename !== "string") {
      throw new Error("filename is required.");
    }
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      throw new Error("Invalid filename.");
    }

    const resolvedRepo = path.resolve(repoPath);
    const docsDir = path.join(resolvedRepo, "docs");
    const target = path.resolve(docsDir, filename);
    const docsDirResolved = path.resolve(docsDir);
    if (!target.startsWith(docsDirResolved + path.sep) && target !== docsDirResolved) {
      throw new Error("Resolved path escapes docs directory.");
    }

    await fs.unlink(target);
    return { ok: true, filename };
  }

  async function getFileDiff(repoPath, targetPath, staged = false) {
    const resolvedRepoPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();
    const relativePath = normalizeGitPath(resolvedRepoPath, targetPath);
    const args = staged ? ["diff", "--staged", "--", relativePath] : ["diff", "--", relativePath];
    const diff = await runGit(gitCommand, args, resolvedRepoPath);

    return {
      path: path.resolve(resolvedRepoPath, targetPath),
      diff,
      staged,
    };
  }

  async function stageFiles(repoPath, filePaths) {
    const resolvedRepoPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();
    const relativePaths = filePaths.map((filePath) => path.relative(resolvedRepoPath, path.resolve(resolvedRepoPath, filePath)));
    await runGit(gitCommand, ["add", "--", ...relativePaths], resolvedRepoPath);
    return inspectRepository(resolvedRepoPath);
  }

  async function unstageFiles(repoPath, filePaths) {
    const resolvedRepoPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();
    const relativePaths = filePaths.map((filePath) => path.relative(resolvedRepoPath, path.resolve(resolvedRepoPath, filePath)));

    try {
      await runGit(gitCommand, ["restore", "--staged", "--", ...relativePaths], resolvedRepoPath);
    } catch {
      await runGit(gitCommand, ["reset", "HEAD", "--", ...relativePaths], resolvedRepoPath);
    }

    return inspectRepository(resolvedRepoPath);
  }

  async function commit(repoPath, message) {
    const resolvedRepoPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();

    if (typeof message !== "string" || !message.trim()) {
      throw new Error("A commit message is required.");
    }

    await runGit(gitCommand, ["commit", "-m", message.trim()], resolvedRepoPath);
    return inspectRepository(resolvedRepoPath);
  }

  async function checkoutBranch(repoPath, branchName, create = false, fromBranch = null) {
    const resolvedRepoPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();

    if (typeof branchName !== "string" || !branchName.trim()) {
      throw new Error("A branch name is required.");
    }

    // Clean up any stuck git state (stale rebase, merge, index.lock) before doing anything
    cleanupGitState(resolvedRepoPath);

    // Fetch latest from remote before switching (so we have up-to-date branch data)
    if (!create) {
      try {
        await runGit(gitCommand, ["fetch", "origin", branchName.trim()], resolvedRepoPath);
      } catch { /* remote branch may not exist or no network — continue anyway */ }
    }

    // When creating a new branch from a specific source, make sure we're on that source first
    if (create && fromBranch && typeof fromBranch === "string" && fromBranch.trim()) {
      try {
        // Fetch the source branch so we branch from latest remote state
        try { await runGit(gitCommand, ["fetch", "origin", fromBranch.trim()], resolvedRepoPath); } catch { /* */ }
        // Stash current work temporarily
        try { await runGit(gitCommand, ["add", "-A"], resolvedRepoPath); } catch { /* */ }
        try { await runGit(gitCommand, ["stash"], resolvedRepoPath); } catch { /* */ }
        await runGit(gitCommand, ["switch", fromBranch.trim()], resolvedRepoPath);
        try { await runGit(gitCommand, ["merge", "--ff-only", `origin/${fromBranch.trim()}`], resolvedRepoPath); } catch { /* no remote tracking */ }
        try { await runGit(gitCommand, ["stash", "pop"], resolvedRepoPath); } catch { /* nothing to pop */ }
      } catch { /* best effort — fall through to create */ }
    }

    // Stage and stash any uncommitted / untracked changes before switching
    let didStash = false;
    try {
      await runGit(gitCommand, ["add", "-A"], resolvedRepoPath);
      const stashOut = await runGit(gitCommand, ["stash"], resolvedRepoPath);
      didStash = !stashOut.includes("No local changes");
    } catch { /* ignore — stash is best-effort */ }

    try {
      if (create) {
        await runGit(gitCommand, ["switch", "-c", branchName.trim()], resolvedRepoPath);
      } else {
        await runGit(gitCommand, ["switch", branchName.trim()], resolvedRepoPath);
      }
    } catch (switchErr) {
      // If switch fails (e.g. residual rebase), try force-checkout as fallback
      try {
        cleanupGitState(resolvedRepoPath);
        await runGit(gitCommand, ["checkout", "-f", branchName.trim()], resolvedRepoPath);
      } catch {
        // Pop stash back on the original branch if switch failed
        if (didStash) {
          try { await runGit(gitCommand, ["stash", "pop"], resolvedRepoPath); } catch { /* ignore */ }
        }
        throw switchErr;
      }
    }

    // Pop stash on the new branch (may fail if conflicts — that's OK, user sees clean branch state)
    if (didStash) {
      try {
        await runGit(gitCommand, ["stash", "pop"], resolvedRepoPath);
      } catch {
        // Drop the stash — the user is viewing a different branch, stashed changes don't belong here
        try { await runGit(gitCommand, ["stash", "drop"], resolvedRepoPath); } catch { /* ignore */ }
      }
    }

    // Fast-forward merge with the fetched remote to ensure local branch is up-to-date
    if (!create) {
      try {
        await runGit(gitCommand, ["merge", "--ff-only", `origin/${branchName.trim()}`], resolvedRepoPath);
      } catch { /* may not have remote tracking or already up-to-date — that's fine */ }
    }

    // When creating a new branch, publish it to origin so teammates (and GitHub UI) can see it
    if (create) {
      try {
        await runGit(gitCommand, ["push", "-u", "origin", branchName.trim()], resolvedRepoPath);
      } catch (pushErr) {
        // Remote may not be configured or credentials unavailable — surface a warning but don't fail
        console.warn("[repo] Failed to push new branch to origin:", pushErr?.message || pushErr);
      }
    }

    return inspectRepository(resolvedRepoPath);
  }

  async function getCommitDetails(repoPath, commitHash) {
    const resolvedRepoPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();

    if (typeof commitHash !== "string" || !commitHash.trim()) {
      throw new Error("A commit hash is required.");
    }

    const normalizedCommitHash = commitHash.trim();
    const [summaryOutput, filesOutput, diffOutput] = await Promise.all([
      runGit(gitCommand, ["show", "--quiet", "--format=%H%n%an%n%ad%n%s%n%b", normalizedCommitHash], resolvedRepoPath),
      runGit(gitCommand, ["show", "--name-status", "--format=", normalizedCommitHash], resolvedRepoPath),
      runGit(gitCommand, ["show", "--format=", normalizedCommitHash], resolvedRepoPath),
    ]);

    const [hash = normalizedCommitHash, author = "Unknown", date = "", subject = "", ...bodyLines] = summaryOutput.split(/\r?\n/);
    const body = bodyLines.join("\n").trim();

    return {
      hash,
      author,
      date,
      subject,
      body,
      files: parseCommitFiles(filesOutput),
      diff: diffOutput,
    };
  }

  async function getRemoteUrl(repoPath) {
    const resolvedPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();
    try {
      const url = await runGit(gitCommand, ["remote", "get-url", "origin"], resolvedPath);
      return url || null;
    } catch {
      return null;
    }
  }

  async function pushToRemote(repoPath, { remote = "origin", branch } = {}) {
    const resolvedPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();

    if (!branch) {
      try {
        branch = await runGit(gitCommand, ["rev-parse", "--abbrev-ref", "HEAD"], resolvedPath);
      } catch {
        branch = "main";
      }
    }

    // Set upstream if this is the first push
    try {
      await runGit(gitCommand, ["push", "-u", remote, branch], resolvedPath);
    } catch (err) {
      // Retry without -u in case upstream already exists
      try {
        await runGit(gitCommand, ["push", remote, branch], resolvedPath);
      } catch (retryErr) {
        throw new Error(retryErr.message || "git push failed");
      }
    }

    return inspectRepository(resolvedPath);
  }

  async function pullFromRemote(repoPath, { remote = "origin", branch } = {}) {
    const resolvedPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();

    if (!branch) {
      try {
        branch = await runGit(gitCommand, ["rev-parse", "--abbrev-ref", "HEAD"], resolvedPath);
      } catch {
        branch = "main";
      }
    }

    await runGit(gitCommand, ["pull", "--rebase", remote, branch], resolvedPath);
    return inspectRepository(resolvedPath);
  }

  async function syncSharedState(repoPath, commitMessage) {
    const resolvedPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();
    const codeBuddyDir = path.join(resolvedPath, ".codebuddy");

    // Check if .codebuddy exists
    try {
      await fs.stat(codeBuddyDir);
    } catch {
      throw new Error(".codebuddy directory not found. Initialize shared workspace first.");
    }

    // Stage everything in .codebuddy/
    await runGit(gitCommand, ["add", ".codebuddy"], resolvedPath);

    // Check if there are staged changes
    const status = await runGit(gitCommand, ["status", "--porcelain", ".codebuddy"], resolvedPath);
    if (!status.trim()) {
      // Nothing to commit — just push
      return pushToRemote(resolvedPath);
    }

    // Commit
    const msg = commitMessage || `chore(codebuddy): sync shared workspace state`;
    await runGit(gitCommand, ["commit", "-m", msg], resolvedPath);

    // Push
    return pushToRemote(resolvedPath);
  }

  return {
    inspectRepository,
    listDirectory,
    readFileContent,
    writeFileContent,
    getFileDiff,
    stageFiles,
    unstageFiles,
    commit,
    checkoutBranch,
    getCommitDetails,
    getRemoteUrl,
    pushToRemote,
    pullFromRemote,
    syncSharedState,
    saveGeneratedDoc,
    listGeneratedDocs,
    deleteGeneratedDoc,
  };
}

module.exports = {
  createRepoService,
};