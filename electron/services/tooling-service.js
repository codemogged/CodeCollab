const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function createToolingService({ processService, settingsService }) {
  // Extra PATH entries added at runtime (e.g. after installing Claude Code)
  const extraPaths = new Set();

  function getCommandName(command) {
    if (process.platform === "win32") {
      if (command === "npm") return "npm.cmd";
      if (command === "npx") return "npx.cmd";
    }

    return command;
  }

  /**
   * On Windows, re-read the current System + User PATH from the registry
   * so that tools installed *after* the app launched are found.
   */
  /**
   * Expand %VAR% references in a string using process.env.
   */
  function expandEnvVars(str) {
    return str.replace(/%([^%]+)%/g, (match, name) => process.env[name] || match);
  }

  async function refreshSystemPath() {
    if (process.platform !== "win32") return;
    try {
      const [sysResult, userResult] = await Promise.all([
        execFileAsync("reg", [
          "query",
          "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
          "/v", "Path",
        ], { windowsHide: true }).catch(() => ({ stdout: "" })),
        execFileAsync("reg", [
          "query", "HKCU\\Environment", "/v", "Path",
        ], { windowsHide: true }).catch(() => ({ stdout: "" })),
      ]);

      const extract = (output) => {
        const match = (output.stdout || "").match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
        return match ? match[1].trim() : "";
      };

      const sysPath = extract(sysResult);
      const userPath = extract(userResult);
      const combined = [sysPath, userPath].filter(Boolean).join(";");
      // Expand %SystemRoot%, %USERPROFILE%, etc. so tools in those dirs are found
      const expanded = expandEnvVars(combined);
      if (expanded) {
        // Re-append any extra paths the app added at runtime (e.g. ~/.local/bin)
        const extras = [...extraPaths].filter(Boolean).join(";");
        process.env.PATH = extras ? expanded + ";" + extras : expanded;
      }
    } catch {
      // Keep existing PATH if registry reads fail
    }
  }

  async function tryExec(file, args, cwd, options = {}) {
    try {
      // .cmd/.bat files on Windows need shell: true for execFile to work
      const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(file);
      const result = await execFileAsync(file, args, {
        cwd,
        windowsHide: true,
        ...(needsShell ? { shell: true } : {}),
        ...options,
      });

      return {
        ok: true,
        stdout: result.stdout?.trim() ?? "",
        stderr: result.stderr?.trim() ?? "",
      };
    } catch (error) {
      return {
        ok: false,
        stdout: error.stdout?.trim?.() ?? "",
        stderr: error.stderr?.trim?.() ?? "",
        message: error.message,
      };
    }
  }

  async function getConfiguredCommands() {
    const settings = await settingsService.readSettings();
    return settings.cliTools ?? {};
  }

  async function getToolStatus() {
    // Re-read PATH from registry so newly-installed tools are found
    await refreshSystemPath();

    const configuredCommands = await getConfiguredCommands();

    const definitions = [
      {
        id: "git",
        label: "Git",
        command: configuredCommands.git || getCommandName("git"),
        args: ["--version"],
      },
      {
        id: "githubCli",
        label: "GitHub CLI",
        command: configuredCommands.githubCli || getCommandName("gh"),
        args: ["--version"],
      },
      {
        id: "githubCopilotCli",
        label: "GitHub Copilot CLI",
        command: configuredCommands.copilot || getCommandName("copilot"),
        args: ["--version"],
      },
      {
        id: "node",
        label: "Node.js",
        command: configuredCommands.node || getCommandName("node"),
        args: ["--version"],
      },
      {
        id: "npm",
        label: "npm",
        command: configuredCommands.npm || getCommandName("npm"),
        args: ["--version"],
      },
      {
        id: "claudeCode",
        label: "Claude Code",
        command: resolveClaudeCmd(configuredCommands.claudeCode),
        args: ["--help"],
      },
    ];

    const statuses = [];
    for (const definition of definitions) {
      const result = await tryExec(definition.command, definition.args, process.cwd());
      statuses.push({
        id: definition.id,
        label: definition.label,
        available: result.ok,
        command: definition.command,
        detail: result.ok ? result.stdout || result.stderr || "Ready" : result.stderr || result.message || "Not available",
      });
    }

    return statuses;
  }

  async function runCopilotPrompt({ prompt, cwd, allowTools = [], timeoutMs = 0, model }) {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("A Copilot prompt is required.");
    }

    if (typeof cwd !== "string" || !cwd.trim()) {
      throw new Error("A working directory is required.");
    }

    const configuredCommands = await getConfiguredCommands();
    const githubCliCommand = configuredCommands.githubCli || getCommandName("gh");
    const args = ["copilot", "-p", prompt.trim()];

    if (typeof model === "string" && model.trim() && model.trim() !== "auto") {
      args.push("--model", model.trim());
    }

    for (const toolName of allowTools) {
      if (typeof toolName === "string" && toolName.trim()) {
        args.push("--allow-tool", toolName.trim());
      }
    }

    return processService.runProgram(githubCliCommand, args, cwd, { timeoutMs });
  }

  /* ─── GitHub Auth ─── */

  async function getGithubAuthStatus() {
    await refreshSystemPath();
    const configuredCommands = await getConfiguredCommands();
    const ghCmd = configuredCommands.githubCli || getCommandName("gh");
    const result = await tryExec(ghCmd, ["auth", "status"], process.cwd());
    // gh auth status exits 0 if logged in, 1 if not
    if (result.ok) {
      // Extract username from output like "Logged in to github.com account USERNAME"
      const match = (result.stdout + " " + result.stderr).match(/account\s+(\S+)/i);
      return { authenticated: true, username: match?.[1] || "unknown", detail: result.stdout || result.stderr };
    }
    return { authenticated: false, username: null, detail: result.stderr || result.stdout || "Not authenticated" };
  }

  async function startGithubAuth(sendEvent) {
    await refreshSystemPath();
    const configuredCommands = await getConfiguredCommands();
    const ghCmd = configuredCommands.githubCli || getCommandName("gh");

    return new Promise((resolve, reject) => {
      // gh auth login --web launches device-code flow
      const child = spawn(ghCmd, ["auth", "login", "--web", "-p", "https"], {
        cwd: process.cwd(),
        windowsHide: true,
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";
      let deviceCode = null;
      let verificationUrl = null;

      const processOutput = (chunk) => {
        const text = chunk.toString();
        stdout += text;

        // gh outputs the one-time code and URL to stderr
        // Look for patterns like "First copy your one-time code: XXXX-XXXX"
        const codeMatch = text.match(/code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);
        if (codeMatch) deviceCode = codeMatch[1];

        const urlMatch = text.match(/(https:\/\/github\.com\/login\/device)/i);
        if (urlMatch) verificationUrl = urlMatch[1];

        // Send progress events to the renderer
        sendEvent("tools:githubAuthProgress", {
          output: text,
          deviceCode,
          verificationUrl,
        });
      };

      child.stdout.on("data", processOutput);
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        processOutput(chunk);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true, stdout, stderr, deviceCode, verificationUrl });
        } else {
          resolve({ success: false, stdout, stderr, exitCode: code, deviceCode, verificationUrl });
        }
      });

      child.on("error", (err) => {
        reject(err);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        try { child.kill(); } catch {}
        resolve({ success: false, stdout, stderr, exitCode: null, timedOut: true, deviceCode, verificationUrl });
      }, 300000);
    });
  }

  async function logoutGithub(username) {
    await refreshSystemPath();
    const configuredCommands = await getConfiguredCommands();
    const ghCmd = configuredCommands.githubCli || getCommandName("gh");
    // gh auth logout has no --yes flag; pipe "Y" to auto-confirm
    const args = ["auth", "logout", "--hostname", "github.com"];
    if (username) args.push("--user", username);
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(ghCmd, args, { cwd: process.cwd(), windowsHide: true });
      child.stdout?.on("data", (d) => { stdout += d.toString(); });
      child.stderr?.on("data", (d) => { stderr += d.toString(); });
      // Auto-confirm when prompted
      child.stdin?.write("Y\n");
      child.stdin?.end();
      child.on("close", (code) => {
        resolve({ success: code === 0, detail: stdout.trim() || stderr.trim() || `exit code ${code}` });
      });
      child.on("error", (err) => {
        resolve({ success: false, detail: err.message });
      });
    });
  }

  async function listGithubAccounts() {
    await refreshSystemPath();
    const configuredCommands = await getConfiguredCommands();
    const ghCmd = configuredCommands.githubCli || getCommandName("gh");
    // gh auth status shows all accounts; parse each one
    const result = await tryExec(ghCmd, ["auth", "status"], process.cwd());
    const output = (result.stdout || "") + "\n" + (result.stderr || "");
    const accounts = [];
    // Match lines like: "✓ Logged in to github.com account USERNAME (keyring)"
    const accountRegex = /Logged in to\s+(\S+)\s+account\s+(\S+)/gi;
    let match;
    while ((match = accountRegex.exec(output)) !== null) {
      accounts.push({ host: match[1], username: match[2] });
    }
    // Determine which is active
    const activeMatch = output.match(/Active account:\s*true/i);
    // For single-account setups, the one account is active
    // For multi-account, active comes after the account line
    const lines = output.split("\n");
    let currentUsername = null;
    for (const line of lines) {
      const acctMatch = line.match(/account\s+(\S+)/i);
      if (acctMatch) currentUsername = acctMatch[1];
      if (line.includes("Active account: true") && currentUsername) {
        const acct = accounts.find((a) => a.username === currentUsername);
        if (acct) acct.active = true;
      }
    }
    // If only one account, mark it active
    if (accounts.length === 1) accounts[0].active = true;
    return accounts;
  }

  async function switchGithubAccount(username) {
    await refreshSystemPath();
    const configuredCommands = await getConfiguredCommands();
    const ghCmd = configuredCommands.githubCli || getCommandName("gh");
    const result = await tryExec(ghCmd, ["auth", "switch", "--user", username], process.cwd());
    return { success: result.ok, detail: result.stdout || result.stderr || result.message };
  }

  /**
   * Multi-strategy Copilot CLI installation.
   * Returns { success, log[] } where log is an array of step descriptions for debugging.
   */
  async function installCopilot() {
    const log = [];
    const addLog = (msg) => { log.push(msg); console.log("[installCopilot]", msg); };

    await refreshSystemPath();
    addLog(`Platform: ${process.platform}, arch: ${process.arch}`);
    addLog(`PATH (first 800 chars): ${(process.env.PATH || "").substring(0, 800)}`);
    addLog(`LOCALAPPDATA: ${process.env.LOCALAPPDATA || "(not set)"}`);
    addLog(`USERPROFILE: ${process.env.USERPROFILE || "(not set)"}`);
    addLog(`APPDATA: ${process.env.APPDATA || "(not set)"}`);

    // ── Step 1: Check if copilot binary already exists ──
    addLog("Step 1: Checking if copilot binary is already on PATH...");
    const existing = await tryExec("copilot", ["--version"], process.cwd());
    if (existing.ok) {
      addLog(`Already installed: ${existing.stdout}`);
      return { success: true, detail: existing.stdout, log };
    }
    addLog(`Not on PATH. stdout: ${existing.stdout}, stderr: ${existing.stderr}, message: ${existing.message}`);

    // ── Step 2: Search known install locations ──
    addLog("Step 2: Searching known install locations...");
    const fs = require("fs");
    const path = require("path");
    const knownPaths = [];

    // WinGet install location (search recursively for copilot.exe under GitHub.Copilot* dirs)
    const localAppData = process.env.LOCALAPPDATA || "";
    if (localAppData) {
      const wingetBase = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      try {
        if (fs.existsSync(wingetBase)) {
          const dirs = fs.readdirSync(wingetBase).filter(d => d.toLowerCase().includes("copilot"));
          addLog(`  WinGet package dirs matching 'copilot': ${dirs.join(", ") || "(none)"}`);
          for (const d of dirs) {
            const pkgDir = path.join(wingetBase, d);
            // Search up to 3 levels deep for copilot.exe
            const searchDirs = [pkgDir];
            for (let depth = 0; depth < 3 && searchDirs.length > 0; depth++) {
              const nextDirs = [];
              for (const sd of searchDirs) {
                try {
                  const entries = fs.readdirSync(sd, { withFileTypes: true });
                  for (const entry of entries) {
                    if (entry.isFile() && entry.name.toLowerCase() === "copilot.exe") {
                      knownPaths.push(path.join(sd, entry.name));
                    } else if (entry.isDirectory()) {
                      nextDirs.push(path.join(sd, entry.name));
                    }
                  }
                } catch { /* skip unreadable dirs */ }
              }
              searchDirs.length = 0;
              searchDirs.push(...nextDirs);
            }
          }
        } else {
          addLog(`  WinGet packages dir does not exist: ${wingetBase}`);
        }
      } catch (e) { addLog(`WinGet scan error: ${e.message}`); }
    }

    // GitHub Copilot CLI standard install location
    if (localAppData) {
      knownPaths.push(path.join(localAppData, "Programs", "GitHub Copilot", "copilot.exe"));
    }

    // WindowsApps directory (winget symlinks)
    if (localAppData) {
      const windowsApps = path.join(localAppData, "Microsoft", "WindowsApps");
      knownPaths.push(path.join(windowsApps, "copilot.exe"));
    }

    // VS Code extension bundled copilot
    const userProfile = process.env.USERPROFILE || process.env.HOME || "";
    if (userProfile) {
      try {
        const extDir = path.join(userProfile, ".vscode", "extensions");
        if (fs.existsSync(extDir)) {
          const copilotExts = fs.readdirSync(extDir)
            .filter(d => d.startsWith("github.copilot-chat-"))
            .sort()
            .reverse();
          for (const ext of copilotExts) {
            knownPaths.push(path.join(extDir, ext, "copilot", "dist", "win", "copilot.exe"));
          }
          addLog(`  VS Code copilot-chat extensions found: ${copilotExts.join(", ") || "(none)"}`);
        }
      } catch (e) { addLog(`VS Code scan error: ${e.message}`); }
    }

    // npm global
    const appData = process.env.APPDATA || "";
    if (appData) {
      knownPaths.push(path.join(appData, "npm", "copilot.cmd"));
      knownPaths.push(path.join(appData, "npm", "node_modules", ".bin", "copilot.cmd"));
    }

    // gh extensions directory
    if (userProfile) {
      const ghExtDir = path.join(userProfile, ".local", "share", "gh", "extensions", "gh-copilot");
      if (fs.existsSync(ghExtDir)) {
        knownPaths.push(path.join(ghExtDir, "copilot.exe"));
        knownPaths.push(path.join(ghExtDir, "gh-copilot.exe"));
      }
    }

    addLog(`Checking ${knownPaths.length} known paths...`);
    for (const p of knownPaths) {
      let exists = false;
      try { exists = fs.existsSync(p); } catch { /* skip */ }
      addLog(`  ${exists ? "FOUND" : "not found"}: ${p}`);
      if (exists) {
        // Verify it actually runs
        const check = await tryExec(p, ["--version"], process.cwd());
        if (check.ok) {
          addLog(`Binary works! Version: ${check.stdout}`);
          // Add its directory to PATH for the session
          const binDir = path.dirname(p);
          process.env.PATH = binDir + ";" + process.env.PATH;
          addLog(`Added ${binDir} to PATH`);
          return { success: true, detail: `Found at ${p}: ${check.stdout}`, log };
        } else {
          addLog(`Binary exists but failed to run: stdout=${check.stdout}, stderr=${check.stderr}, message=${check.message}`);
        }
      }
    }

    // ── Step 3: Try winget ──
    addLog("Step 3: Trying winget install GitHub.Copilot...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (wingetCheck.ok) {
      addLog(`winget available: ${wingetCheck.stdout}`);
      const wingetInstall = await tryExec("winget", [
        "install", "GitHub.Copilot",
        "--accept-source-agreements", "--accept-package-agreements",
      ], process.cwd());
      addLog(`winget install stdout: ${wingetInstall.stdout}`);
      addLog(`winget install stderr: ${wingetInstall.stderr}`);
      addLog(`winget install ok: ${wingetInstall.ok}, message: ${wingetInstall.message}`);
      if (wingetInstall.ok || (wingetInstall.stdout || "").includes("Successfully installed") || (wingetInstall.stdout || "").includes("already installed")) {
        addLog("winget install succeeded! Refreshing PATH...");
        await refreshSystemPath();
        const verify = await tryExec("copilot", ["--version"], process.cwd());
        if (verify.ok) {
          addLog(`Verified: ${verify.stdout}`);
          return { success: true, detail: `Installed via winget: ${verify.stdout}`, log };
        }
        addLog(`Installed but not yet on PATH. May need app restart. verify: ${verify.stderr || verify.message}`);
        return { success: true, detail: "Installed via winget. Restart the app for PATH changes to take effect.", log };
      }
      addLog(`winget install failed. message: ${wingetInstall.message}`);
    } else {
      addLog(`winget not available via direct exec: ${wingetCheck.stderr || wingetCheck.message}`);
      // Try winget via PowerShell (sometimes winget is available through PS but not direct exec)
      addLog("Trying winget via PowerShell...");
      const psWingetCheck = await tryExec("powershell", ["-NoProfile", "-Command", "winget --version"], process.cwd());
      if (psWingetCheck.ok) {
        addLog(`winget available via PowerShell: ${psWingetCheck.stdout}`);
        const psWingetInstall = await tryExec("powershell", [
          "-NoProfile", "-Command",
          "winget install GitHub.Copilot --accept-source-agreements --accept-package-agreements"
        ], process.cwd());
        addLog(`PS winget install stdout: ${psWingetInstall.stdout}`);
        addLog(`PS winget install stderr: ${psWingetInstall.stderr}`);
        if (psWingetInstall.ok || (psWingetInstall.stdout || "").includes("Successfully installed") || (psWingetInstall.stdout || "").includes("already installed")) {
          addLog("winget install via PS succeeded! Refreshing PATH...");
          await refreshSystemPath();
          const verify = await tryExec("copilot", ["--version"], process.cwd());
          if (verify.ok) {
            addLog(`Verified: ${verify.stdout}`);
            return { success: true, detail: `Installed via winget (PS): ${verify.stdout}`, log };
          }
          addLog(`Installed via PS but not on PATH. verify: ${verify.stderr || verify.message}`);
          return { success: true, detail: "Installed via winget (PowerShell). Restart the app for PATH changes to take effect.", log };
        }
        addLog(`PS winget install failed: ${psWingetInstall.message}`);
      } else {
        addLog(`winget not available via PowerShell either: ${psWingetCheck.stderr || psWingetCheck.message}`);
      }
    }

    // ── Step 4: Try npm global install ──
    addLog("Step 4: Trying npm install -g @githubnext/github-copilot-cli...");
    const npmCmd = getCommandName("npm");
    addLog(`npm command: ${npmCmd}`);
    const npmCheck = await tryExec(npmCmd, ["--version"], process.cwd());
    if (npmCheck.ok) {
      addLog(`npm available: ${npmCheck.stdout}`);
      const npmInstall = await tryExec(npmCmd, ["install", "-g", "@githubnext/github-copilot-cli"], process.cwd());
      addLog(`npm install stdout: ${npmInstall.stdout}`);
      addLog(`npm install stderr: ${npmInstall.stderr}`);
      addLog(`npm install ok: ${npmInstall.ok}, message: ${npmInstall.message}`);
      if (npmInstall.ok) {
        addLog("npm install succeeded! Refreshing PATH...");
        await refreshSystemPath();
        const verify = await tryExec("copilot", ["--version"], process.cwd());
        if (verify.ok) {
          addLog(`Verified: ${verify.stdout}`);
          return { success: true, detail: `Installed via npm: ${verify.stdout}`, log };
        }
        addLog(`Installed via npm but not on PATH. verify: ${verify.stderr || verify.message}`);
      } else {
        addLog(`npm install failed: ${npmInstall.stderr || npmInstall.message}`);
      }
    } else {
      addLog(`npm not available (${npmCmd}): ${npmCheck.stderr || npmCheck.message}`);
      // Try npm via PowerShell as fallback
      addLog("Trying npm via PowerShell...");
      const psNpmCheck = await tryExec("powershell", ["-NoProfile", "-Command", "npm --version"], process.cwd());
      if (psNpmCheck.ok) {
        addLog(`npm available via PowerShell: ${psNpmCheck.stdout}`);
        const psNpmInstall = await tryExec("powershell", [
          "-NoProfile", "-Command",
          "npm install -g @githubnext/github-copilot-cli"
        ], process.cwd());
        addLog(`PS npm install stdout: ${psNpmInstall.stdout}`);
        addLog(`PS npm install stderr: ${psNpmInstall.stderr}`);
        if (psNpmInstall.ok) {
          addLog("npm install via PS succeeded! Refreshing PATH...");
          await refreshSystemPath();
          const verify = await tryExec("copilot", ["--version"], process.cwd());
          if (verify.ok) {
            addLog(`Verified: ${verify.stdout}`);
            return { success: true, detail: `Installed via npm (PS): ${verify.stdout}`, log };
          }
          addLog(`Installed via PS npm but not on PATH. verify: ${verify.stderr || verify.message}`);
        } else {
          addLog(`PS npm install failed: ${psNpmInstall.stderr || psNpmInstall.message}`);
        }
      } else {
        addLog(`npm not available via PowerShell either: ${psNpmCheck.stderr || psNpmCheck.message}`);
      }
    }

    // ── Step 5: Try gh extension install (older gh versions) ──
    addLog("Step 5: Trying gh extension install github/gh-copilot...");
    const configuredCommands = await getConfiguredCommands();
    const ghCmd = configuredCommands.githubCli || getCommandName("gh");
    const ghCheck = await tryExec(ghCmd, ["--version"], process.cwd());
    if (ghCheck.ok) {
      addLog(`gh available: ${ghCheck.stdout}`);
      const extInstall = await tryExec(ghCmd, ["extension", "install", "github/gh-copilot"], process.cwd());
      addLog(`gh extension install stdout: ${extInstall.stdout}`);
      addLog(`gh extension install stderr: ${extInstall.stderr}`);
      if (extInstall.ok) {
        addLog("gh extension install succeeded! Refreshing PATH...");
        await refreshSystemPath();
        const verify = await tryExec("copilot", ["--version"], process.cwd());
        if (verify.ok) {
          addLog(`Verified: ${verify.stdout}`);
          return { success: true, detail: `Installed via gh extension: ${verify.stdout}`, log };
        }
        addLog(`Extension installed but copilot binary not on PATH. verify: ${verify.stderr || verify.message}`);
      } else {
        addLog(`gh extension install failed: ${extInstall.stderr || extInstall.message}`);
      }
    } else {
      addLog(`gh not available: ${ghCheck.stderr || ghCheck.message}`);
    }

    // ── All strategies failed ──
    addLog("ALL STRATEGIES FAILED. Manual install required.");
    addLog("Manual options:");
    addLog("  1. Open PowerShell and run: winget install GitHub.Copilot");
    addLog("  2. If winget is missing, get it from: https://aka.ms/getwinget");
    addLog("  3. Or open a terminal and run: npm install -g @githubnext/github-copilot-cli");
    addLog("  4. Or install VS Code with GitHub Copilot Chat extension");
    addLog("  5. After installing, click Re-check below");
    return {
      success: false,
      detail: "Could not install Copilot CLI. See log for details. Try installing manually: winget install GitHub.Copilot",
      log,
    };
  }

  return {
    getToolStatus,
    runCopilotPrompt,
    installCopilot,
    installClaudeCode,
    getClaudeAuthStatus,
    startClaudeAuth,
    getGithubAuthStatus,
    startGithubAuth,
    logoutGithub,
    listGithubAccounts,
    switchGithubAccount,
    installNodeJs,
    installGitScm,
    installGithubCli,
  };

  /* ─── Node.js install (winget) ─── */

  async function installNodeJs() {
    const log = [];
    const addLog = (msg) => { log.push(msg); console.log("[installNode]", msg); };

    await refreshSystemPath();

    // Check if already installed
    addLog("Checking if node is already on PATH...");
    const existing = await tryExec("node", ["--version"], process.cwd());
    if (existing.ok) {
      addLog(`Already installed: ${existing.stdout}`);
      return { success: true, detail: existing.stdout.trim(), log };
    }

    // Try winget
    addLog("Installing via winget (OpenJS.NodeJS.LTS)...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (!wingetCheck.ok) {
      addLog("winget not available — cannot auto-install.");
      return { success: false, detail: "winget not available. Install Node.js manually from nodejs.org", log };
    }

    const install = await tryExec("winget", [
      "install", "OpenJS.NodeJS.LTS",
      "--accept-source-agreements", "--accept-package-agreements",
    ], process.cwd(), { timeout: 180000 });
    addLog(`stdout: ${install.stdout}`);
    addLog(`stderr: ${install.stderr}`);

    if (install.ok || (install.stdout || "").includes("Successfully installed") || (install.stdout || "").includes("already installed")) {
      addLog("winget install succeeded! Refreshing PATH...");
      await refreshSystemPath();
      const verify = await tryExec("node", ["--version"], process.cwd());
      if (verify.ok) {
        addLog(`Verified: ${verify.stdout}`);
        return { success: true, detail: `Node.js ${verify.stdout.trim()} installed`, log };
      }
      return { success: true, detail: "Node.js installed. Restart CodeBuddy for PATH changes.", log };
    }

    addLog("winget install failed.");
    return { success: false, detail: "Install failed. Try manually from nodejs.org", log };
  }

  /* ─── Git install (winget) ─── */

  async function installGitScm() {
    const log = [];
    const addLog = (msg) => { log.push(msg); console.log("[installGit]", msg); };

    await refreshSystemPath();

    addLog("Checking if git is already on PATH...");
    const existing = await tryExec("git", ["--version"], process.cwd());
    if (existing.ok) {
      addLog(`Already installed: ${existing.stdout}`);
      return { success: true, detail: existing.stdout.trim(), log };
    }

    addLog("Installing via winget (Git.Git)...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (!wingetCheck.ok) {
      return { success: false, detail: "winget not available. Install Git manually from git-scm.com", log };
    }

    const install = await tryExec("winget", [
      "install", "Git.Git",
      "--accept-source-agreements", "--accept-package-agreements",
    ], process.cwd(), { timeout: 180000 });
    addLog(`stdout: ${install.stdout}`);
    addLog(`stderr: ${install.stderr}`);

    if (install.ok || (install.stdout || "").includes("Successfully installed") || (install.stdout || "").includes("already installed")) {
      addLog("winget install succeeded! Refreshing PATH...");
      await refreshSystemPath();
      const verify = await tryExec("git", ["--version"], process.cwd());
      if (verify.ok) {
        addLog(`Verified: ${verify.stdout}`);
        return { success: true, detail: verify.stdout.trim(), log };
      }
      return { success: true, detail: "Git installed. Restart CodeBuddy for PATH changes.", log };
    }

    return { success: false, detail: "Install failed. Try manually from git-scm.com", log };
  }

  /* ─── GitHub CLI install (winget) ─── */

  async function installGithubCli() {
    const log = [];
    const addLog = (msg) => { log.push(msg); console.log("[installGh]", msg); };

    await refreshSystemPath();

    addLog("Checking if gh is already on PATH...");
    const existing = await tryExec("gh", ["--version"], process.cwd());
    if (existing.ok) {
      addLog(`Already installed: ${existing.stdout}`);
      return { success: true, detail: existing.stdout.trim(), log };
    }

    addLog("Installing via winget (GitHub.cli)...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (!wingetCheck.ok) {
      return { success: false, detail: "winget not available. Install GitHub CLI from cli.github.com", log };
    }

    const install = await tryExec("winget", [
      "install", "GitHub.cli",
      "--accept-source-agreements", "--accept-package-agreements",
    ], process.cwd(), { timeout: 180000 });
    addLog(`stdout: ${install.stdout}`);
    addLog(`stderr: ${install.stderr}`);

    if (install.ok || (install.stdout || "").includes("Successfully installed") || (install.stdout || "").includes("already installed")) {
      addLog("winget install succeeded! Refreshing PATH...");
      await refreshSystemPath();
      const verify = await tryExec("gh", ["--version"], process.cwd());
      if (verify.ok) {
        addLog(`Verified: ${verify.stdout}`);
        return { success: true, detail: verify.stdout.trim(), log };
      }
      return { success: true, detail: "GitHub CLI installed. Restart CodeBuddy for PATH changes.", log };
    }

    return { success: false, detail: "Install failed. Try manually from cli.github.com", log };
  }

  /* ─── Claude Code install ─── */

  async function installClaudeCode() {
    const log = [];
    const addLog = (msg) => { log.push(msg); console.log("[installClaude]", msg); };

    await refreshSystemPath();
    addLog(`Platform: ${process.platform}, arch: ${process.arch}`);

    // Check if already installed
    addLog("Step 1: Checking if claude binary is already on PATH...");
    const existing = await tryExec("claude", ["--version"], process.cwd());
    if (existing.ok) {
      addLog(`Already installed: ${existing.stdout}`);
      return { success: true, detail: existing.stdout, log };
    }
    addLog(`Not on PATH: ${existing.stderr || existing.message}`);

    // Strategy 1: Native installer via PowerShell (recommended by Anthropic)
    addLog("Step 2: Trying native installer (irm https://claude.ai/install.ps1 | iex)...");
    const nativeInstall = await tryExec("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
      "irm https://claude.ai/install.ps1 | iex",
    ], process.cwd(), { timeout: 120000 });
    addLog(`Native installer stdout: ${nativeInstall.stdout}`);
    addLog(`Native installer stderr: ${nativeInstall.stderr}`);
    addLog(`Native installer ok: ${nativeInstall.ok}, message: ${nativeInstall.message}`);

    if (nativeInstall.ok || (nativeInstall.stdout || "").toLowerCase().includes("installed")) {
      addLog("Native installer succeeded! Refreshing PATH...");
      await refreshSystemPath();
      const verify = await tryExec("claude", ["--version"], process.cwd());
      if (verify.ok) {
        addLog(`Verified: ${verify.stdout}`);
        return { success: true, detail: `Installed via native installer: ${verify.stdout}`, log };
      }
      // Also check common install location
      const userProfile = process.env.USERPROFILE || "";
      if (userProfile) {
        const fs = require("fs");
        const path = require("path");
        const localBin = path.join(userProfile, ".local", "bin", "claude.exe");
        if (fs.existsSync(localBin)) {
          const binDir = path.dirname(localBin);
          extraPaths.add(binDir);
          process.env.PATH = binDir + ";" + process.env.PATH;
          addLog(`Found at ${localBin}, added to PATH`);
          const v2 = await tryExec("claude", ["--version"], process.cwd());
          if (v2.ok) return { success: true, detail: `Installed: ${v2.stdout}`, log };
        }
      }
      addLog("Installed but not yet on PATH. May need app restart.");
      return { success: true, detail: "Claude Code installed. Restart CodeBuddy for PATH to update.", log };
    }

    // Strategy 2: npm global install
    addLog("Step 3: Trying npm install -g @anthropic-ai/claude-code...");
    const npmCmd = getCommandName("npm");
    const npmCheck = await tryExec(npmCmd, ["--version"], process.cwd());
    if (npmCheck.ok) {
      addLog(`npm available: ${npmCheck.stdout}`);
      const npmInstall = await tryExec(npmCmd, ["install", "-g", "@anthropic-ai/claude-code"], process.cwd(), { timeout: 120000 });
      addLog(`npm install stdout: ${npmInstall.stdout}`);
      addLog(`npm install stderr: ${npmInstall.stderr}`);
      if (npmInstall.ok) {
        addLog("npm install succeeded! Refreshing PATH...");
        await refreshSystemPath();
        const verify = await tryExec("claude", ["--version"], process.cwd());
        if (verify.ok) {
          addLog(`Verified: ${verify.stdout}`);
          return { success: true, detail: `Installed via npm: ${verify.stdout}`, log };
        }
        addLog("Installed via npm but not on PATH.");
      } else {
        addLog(`npm install failed: ${npmInstall.stderr || npmInstall.message}`);
      }
    } else {
      addLog(`npm not available: ${npmCheck.stderr || npmCheck.message}`);
    }

    // Strategy 3: winget
    addLog("Step 4: Trying winget install Anthropic.ClaudeCode...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (wingetCheck.ok) {
      const wingetInstall = await tryExec("winget", [
        "install", "Anthropic.ClaudeCode",
        "--accept-source-agreements", "--accept-package-agreements",
      ], process.cwd(), { timeout: 120000 });
      addLog(`winget stdout: ${wingetInstall.stdout}`);
      addLog(`winget stderr: ${wingetInstall.stderr}`);
      if (wingetInstall.ok || (wingetInstall.stdout || "").includes("Successfully installed") || (wingetInstall.stdout || "").includes("already installed")) {
        addLog("winget install succeeded! Refreshing PATH...");
        await refreshSystemPath();
        const verify = await tryExec("claude", ["--version"], process.cwd());
        if (verify.ok) {
          addLog(`Verified: ${verify.stdout}`);
          return { success: true, detail: `Installed via winget: ${verify.stdout}`, log };
        }
        return { success: true, detail: "Installed via winget. Restart CodeBuddy for PATH changes.", log };
      }
      addLog(`winget install failed: ${wingetInstall.message}`);
    } else {
      addLog(`winget not available: ${wingetCheck.stderr || wingetCheck.message}`);
    }

    addLog("ALL STRATEGIES FAILED.");
    return {
      success: false,
      detail: "Could not install Claude Code. Try manually in PowerShell: irm https://claude.ai/install.ps1 | iex",
      log,
    };
  }

  /* ─── Claude Code auth ─── */

  function resolveClaudeCmd(configuredCmd) {
    if (configuredCmd) return configuredCmd;
    const cmd = getCommandName("claude");
    // If bare "claude" might not be on PATH, try known install location
    const userProfile = process.env.USERPROFILE || "";
    if (userProfile) {
      const path = require("path");
      const fs = require("fs");
      const localBin = path.join(userProfile, ".local", "bin", "claude.exe");
      if (fs.existsSync(localBin)) {
        const binDir = path.dirname(localBin);
        if (!process.env.PATH.includes(binDir)) {
          extraPaths.add(binDir);
          process.env.PATH = binDir + ";" + process.env.PATH;
        }
        return localBin;
      }
    }
    return cmd;
  }

  async function getClaudeAuthStatus() {
    await refreshSystemPath();
    const configuredCommands = await getConfiguredCommands();
    const claudeCmd = resolveClaudeCmd(configuredCommands.claudeCode);
    const result = await tryExec(claudeCmd, ["auth", "status"], process.cwd());
    if (result.ok) {
      // claude auth status exits 0 if logged in
      const output = (result.stdout || "") + " " + (result.stderr || "");
      return { authenticated: true, detail: output.trim() };
    }
    return { authenticated: false, detail: result.stderr || result.stdout || result.message || "Not authenticated" };
  }

  async function startClaudeAuth(sendEvent) {
    await refreshSystemPath();
    const configuredCommands = await getConfiguredCommands();
    const claudeCmd = resolveClaudeCmd(configuredCommands.claudeCode);

    return new Promise((resolve, reject) => {
      const child = spawn(claudeCmd, ["auth", "login"], {
        cwd: process.cwd(),
        windowsHide: true,
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      const processOutput = (text) => {
        sendEvent("tools:claudeAuthProgress", { output: text });
      };

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        processOutput(text);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        processOutput(text);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true, stdout, stderr });
        } else {
          resolve({ success: false, stdout, stderr, exitCode: code });
        }
      });

      child.on("error", (err) => {
        reject(err);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        try { child.kill(); } catch {}
        resolve({ success: false, stdout, stderr, exitCode: null, timedOut: true });
      }, 300000);
    });
  }
}

module.exports = {
  createToolingService,
};