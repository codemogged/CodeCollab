const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);

// ── Model catalogs: read from editable JSON, fall back to bundled defaults ──
const BUNDLED_CATALOGS_PATH = path.join(__dirname, "..", "config", "model-catalogs.json");

function loadModelCatalogs() {
  try {
    const raw = fs.readFileSync(BUNDLED_CATALOGS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return {
      copilot: Array.isArray(data.copilot) ? data.copilot : [],
      claude: Array.isArray(data.claude) ? data.claude : [],
      codex: Array.isArray(data.codex) ? data.codex : [],
      _version: data._version || 0,
      _updated: data._updated || null,
    };
  } catch (err) {
    console.warn("[tooling-service] Failed to load model-catalogs.json, returning empty catalogs:", err.message);
    return { copilot: [], claude: [], codex: [], _version: 0, _updated: null };
  }
}

function createToolingService({ processService, settingsService }) {
  // Extra PATH entries added at runtime (e.g. after installing Claude Code)
  const extraPaths = new Set();

  // Known default install directories for winget-installed tools.
  // Used to probe directly when PATH hasn't updated yet (e.g. UAC-elevated installers).
  const KNOWN_INSTALL_PATHS = {
    git: [
      "C:\\Program Files\\Git\\cmd",
      "C:\\Program Files (x86)\\Git\\cmd",
    ],
    gh: [
      "C:\\Program Files\\GitHub CLI",
      "C:\\Program Files (x86)\\GitHub CLI",
    ],
    node: [
      "C:\\Program Files\\nodejs",
      "C:\\Program Files (x86)\\nodejs",
    ],
    python: [
      // winget installs Python to LocalAppData by default
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python313"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python313", "Scripts"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "Scripts"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python311"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python311", "Scripts"),
      "C:\\Python313",
      "C:\\Python312",
      "C:\\Python311",
    ],
  };

  // Winget serialization lock — only one winget install can run at a time.
  // Without this, parallel installs hit winget's exclusive mutex and fail
  // with "Waiting for another install/uninstall to complete..." then timeout.
  let _wingetQueue = Promise.resolve();
  function serializedWingetInstall(fn) {
    _wingetQueue = _wingetQueue.then(fn, fn);
    return _wingetQueue;
  }

  function getCommandName(command) {
    if (process.platform === "win32") {
      // npm-installed global CLIs on Windows are .cmd wrapper scripts
      const cmdMap = {
        npm: "npm.cmd",
        npx: "npx.cmd",
        codex: "codex.cmd",
        copilot: "copilot.cmd",
        claude: "claude.cmd",
      };
      if (cmdMap[command]) return cmdMap[command];
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

  /**
   * Poll for a tool to become available after installation.
   * Handles the common case where winget returns before the actual installer
   * finishes (e.g., EXE installers that spawn an elevated/UAC process).
   *
   * Strategy on each attempt:
   *   1. Re-read HKLM + HKCU PATH from the registry
   *   2. Try the command on PATH
   *   3. Probe known default install directories directly
   */
  async function waitForToolOnPath({ command, args, knownPaths = [], maxWaitMs = 60000, intervalMs = 3000, addLog }) {
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < maxWaitMs) {
      attempt++;
      addLog(`  Poll #${attempt} (${Math.round((Date.now() - startTime) / 1000)}s elapsed)...`);

      // 1. Refresh PATH from registry (installer may have updated HKLM\...\Path)
      await refreshSystemPath();

      // 2. Try the command on the refreshed PATH
      const result = await tryExec(command, args, process.cwd());
      if (result.ok) {
        addLog(`  Found on PATH after poll #${attempt}: ${result.stdout}`);
        return { found: true, stdout: result.stdout, addedPath: null };
      }

      // 3. Probe known install directories directly (bypass PATH)
      for (const knownDir of knownPaths) {
        if (!knownDir || !fs.existsSync(knownDir)) continue;
        const exeName = `${command}.exe`;
        const fullPath = path.join(knownDir, exeName);
        if (fs.existsSync(fullPath)) {
          const probeResult = await tryExec(fullPath, args, process.cwd());
          if (probeResult.ok) {
            addLog(`  Found at known path ${fullPath}: ${probeResult.stdout}`);
            extraPaths.add(knownDir);
            if (!process.env.PATH.includes(knownDir)) {
              process.env.PATH = knownDir + ";" + process.env.PATH;
            }
            return { found: true, stdout: probeResult.stdout, addedPath: knownDir };
          }
        }
      }

      // 4. Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    addLog(`  Tool "${command}" not found after ${maxWaitMs / 1000}s of polling.`);
    return { found: false, stdout: "", addedPath: null };
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
      {
        id: "python",
        label: "Python",
        command: configuredCommands.python || getCommandName("python"),
        args: ["--version"],
      },
      {
        id: "codexCli",
        label: "Codex CLI",
        command: configuredCommands.codexCli || getCommandName("codex"),
        args: ["--version"],
      },
    ];

    const statuses = [];
    for (const definition of definitions) {
      let result = await tryExec(definition.command, definition.args, process.cwd());
      // On Windows, npm-installed CLIs are .cmd files — try explicit .cmd if direct exec fails
      if (!result.ok && process.platform === "win32" && !definition.command.endsWith(".cmd")) {
        const cmdResult = await tryExec(definition.command + ".cmd", definition.args, process.cwd());
        if (cmdResult.ok) result = cmdResult;
      }
      // On Windows, winget-installed tools are .exe not .cmd — try bare command name
      if (!result.ok && process.platform === "win32" && definition.command.endsWith(".cmd")) {
        const bareName = definition.command.slice(0, -4);
        const bareResult = await tryExec(bareName, definition.args, process.cwd());
        if (bareResult.ok) result = bareResult;
      }
      // Probe known install directories for winget-installed tools that aren't on PATH yet
      if (!result.ok && process.platform === "win32") {
        const knownPathKey = { git: "git", githubCli: "gh", node: "node", python: "python" }[definition.id];
        const exeName = { git: "git.exe", githubCli: "gh.exe", node: "node.exe", python: "python.exe" }[definition.id];
        if (knownPathKey && KNOWN_INSTALL_PATHS[knownPathKey]) {
          for (const dir of KNOWN_INSTALL_PATHS[knownPathKey]) {
            if (!dir || !fs.existsSync(dir)) continue;
            const fullPath = path.join(dir, exeName);
            if (fs.existsSync(fullPath)) {
              const probeResult = await tryExec(fullPath, definition.args, process.cwd());
              if (probeResult.ok) {
                result = probeResult;
                extraPaths.add(dir);
                if (!process.env.PATH.includes(dir)) {
                  process.env.PATH = dir + ";" + process.env.PATH;
                }
                break;
              }
            }
          }
        }
      }
      // For codexCli specifically, also try the npm bin directory directly
      if (!result.ok && definition.id === "codexCli") {
        const path = require("path");
        const fs = require("fs");
        const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : "";
        if (npmBin) {
          const directPath = path.join(npmBin, "codex.cmd");
          if (fs.existsSync(directPath)) {
            const directResult = await tryExec(directPath, definition.args, process.cwd());
            if (directResult.ok) {
              result = directResult;
              // Make sure this dir stays in PATH
              extraPaths.add(npmBin);
              if (!process.env.PATH.includes(npmBin)) {
                process.env.PATH = npmBin + ";" + process.env.PATH;
              }
            }
          }
        }
      }
      if (!result.ok) {
        console.log(`[getToolStatus] ${definition.id}: unavailable — ${(result.stderr || result.message || "not found").substring(0, 80)}`);
      }
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

  /* ─── Generic provider-aware prompt (freestyle chat) ─── */

  // Build model ID sets dynamically from model-catalogs.json
  const _cats = loadModelCatalogs();
  const CLAUDE_MODEL_IDS = new Set((_cats.claude || []).map(m => m.id));
  const CODEX_MODEL_IDS = new Set((_cats.codex || []).map(m => m.id));

  function resolveProviderForPrompt(featureFlags, modelId) {
    const hasClaude = !!featureFlags?.claudeCode;
    const hasCopilot = !!featureFlags?.githubCopilotCli;
    const hasCodex = !!featureFlags?.codexCli;
    if (hasClaude && !hasCopilot && !hasCodex) return "claude";
    if (hasCopilot && !hasClaude && !hasCodex) return "copilot";
    if (hasCodex && !hasClaude && !hasCopilot) return "codex";
    if (CLAUDE_MODEL_IDS.has(modelId)) return "claude";
    if (CODEX_MODEL_IDS.has(modelId)) return "codex";
    if (hasCopilot) return "copilot";
    if (hasCodex) return "codex";
    return "claude";
  }

  async function runGenericPrompt({ prompt, cwd, timeoutMs = 0, model }) {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("A prompt is required.");
    }
    if (typeof cwd !== "string" || !cwd.trim()) {
      throw new Error("A working directory is required.");
    }

    const settings = await settingsService.readSettings();
    const featureFlags = settings.featureFlags ?? {};
    const selectedModel = (typeof model === "string" && model.trim()) ? model.trim() : "";
    const provider = resolveProviderForPrompt(featureFlags, selectedModel);

    console.log(`[runGenericPrompt] model="${selectedModel}", provider="${provider}"`);

    if (provider === "claude") {
      const claudeCmd = resolveClaudeCmd(settings.cliTools?.claudeCode);
      const args = ["-p", prompt.trim(), "--dangerously-skip-permissions"];
      if (selectedModel && selectedModel !== "auto") {
        args.push("--model", selectedModel);
      }
      return processService.runProgram(claudeCmd, args, cwd, { timeoutMs });
    }

    if (provider === "codex") {
      const codexCmd = settings.cliTools?.codexCli || getCommandName("codex");
      // Codex needs stdin for the prompt on Windows (EINVAL with long args)
      const args = ["exec", "-s", "danger-full-access"];
      if (selectedModel && selectedModel !== "auto" && selectedModel !== "default") {
        args.push("--model", selectedModel);
      }
      return processService.runProgram(codexCmd, args, cwd, { timeoutMs, stdinData: prompt.trim() });
    }

    // Copilot (default)
    const configuredCommands = await getConfiguredCommands();
    const ghCmd = configuredCommands.githubCli || getCommandName("gh");
    const args = ["copilot", "-p", prompt.trim()];
    if (selectedModel && selectedModel !== "auto") {
      args.push("--model", selectedModel);
    }
    return processService.runProgram(ghCmd, args, cwd, { timeoutMs });
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
      const child = spawn(ghCmd, ["auth", "login", "--hostname", "github.com", "--web", "-p", "https"], {
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
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd(), { timeout: 15000 });
    if (wingetCheck.ok) {
      addLog(`winget available: ${wingetCheck.stdout}`);
      addLog("Waiting for winget lock (other installs may be in progress)...");
      const wingetInstall = await serializedWingetInstall(() => tryExec("winget", [
        "install", "GitHub.Copilot",
        "--accept-source-agreements", "--accept-package-agreements",
      ], process.cwd(), { timeout: 300000 }));
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
      const psWingetCheck = await tryExec("powershell", ["-NoProfile", "-Command", "winget --version"], process.cwd(), { timeout: 15000 });
      if (psWingetCheck.ok) {
        addLog(`winget available via PowerShell: ${psWingetCheck.stdout}`);
        const psWingetInstall = await serializedWingetInstall(() => tryExec("powershell", [
          "-NoProfile", "-Command",
          "winget install GitHub.Copilot --accept-source-agreements --accept-package-agreements"
        ], process.cwd(), { timeout: 300000 }));
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
      const npmInstall = await tryExec(npmCmd, ["install", "-g", "@githubnext/github-copilot-cli"], process.cwd(), { timeout: 180000 });
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
        ], process.cwd(), { timeout: 180000 });
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
      const extInstall = await tryExec(ghCmd, ["extension", "install", "github/gh-copilot"], process.cwd(), { timeout: 120000 });
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
    getModelCatalogs: loadModelCatalogs,
    runCopilotPrompt,
    runGenericPrompt,
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
    installPython,
    installCodex,
    getCodexAuthStatus,
    startCodexAuth,
    setupGitCredentialHelper,
  };

  /* ─── Configure git credential helper globally via gh auth setup-git ─── */

  async function setupGitCredentialHelper() {
    await refreshSystemPath();
    const result = await tryExec("gh", ["auth", "setup-git"], process.cwd());
    if (result.ok) {
      console.log("[tooling] gh auth setup-git succeeded");
      return { success: true, detail: "Git credential helper configured" };
    }
    console.warn("[tooling] gh auth setup-git failed:", result.stderr || result.message);
    return { success: false, detail: result.stderr || result.message || "Failed to configure credential helper" };
  }

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

    // Check known install dirs before installing
    for (const dir of KNOWN_INSTALL_PATHS.node) {
      const nodeExe = path.join(dir, "node.exe");
      if (fs.existsSync(nodeExe)) {
        const check = await tryExec(nodeExe, ["--version"], process.cwd());
        if (check.ok) {
          addLog(`Found at ${nodeExe} (not on PATH): ${check.stdout}`);
          extraPaths.add(dir);
          if (!process.env.PATH.includes(dir)) {
            process.env.PATH = dir + ";" + process.env.PATH;
          }
          return { success: true, detail: check.stdout.trim(), log };
        }
      }
    }

    // Try winget (serialized — only one winget install at a time)
    addLog("Installing via winget (OpenJS.NodeJS.LTS)...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (!wingetCheck.ok) {
      addLog("winget not available — cannot auto-install.");
      return { success: false, detail: "winget not available. Install \"App Installer\" from the Microsoft Store (https://aka.ms/getwinget), or get Node.js manually from nodejs.org", log };
    }

    addLog("Waiting for winget lock (other installs may be in progress)...");
    const install = await serializedWingetInstall(() => tryExec("winget", [
      "install", "OpenJS.NodeJS.LTS",
      "--source", "winget",
      "--accept-source-agreements", "--accept-package-agreements",
    ], process.cwd(), { timeout: 300000 }));
    addLog(`stdout: ${install.stdout}`);
    addLog(`stderr: ${install.stderr}`);
    addLog(`exit ok: ${install.ok}`);

    // ALWAYS poll — even on failure, the tool may have installed
    // (winget can exit non-zero due to mutex contention, UAC, etc.)
    addLog("Polling for node to become available...");
    const pollResult = await waitForToolOnPath({
      command: "node",
      args: ["--version"],
      knownPaths: KNOWN_INSTALL_PATHS.node,
      maxWaitMs: 60000,
      intervalMs: 3000,
      addLog,
    });

    if (pollResult.found) {
      addLog(`Verified after polling: ${pollResult.stdout}`);
      return { success: true, detail: `Node.js ${pollResult.stdout.trim()} installed`, log };
    }

    if (install.ok || (install.stdout || "").includes("Successfully installed") || (install.stdout || "").includes("already installed")) {
      return { success: true, detail: "Node.js installed. Restart CodeCollab for PATH changes.", log };
    }

    addLog("winget install failed and tool not found.");
    return { success: false, detail: "Install failed. Try manually from nodejs.org", log };
  }

  /* ─── Python install (winget) ─── */

  async function installPython() {
    const log = [];
    const addLog = (msg) => { log.push(msg); console.log("[installPython]", msg); };

    await refreshSystemPath();

    addLog("Checking if python is already on PATH...");
    const existing = await tryExec("python", ["--version"], process.cwd());
    if (existing.ok) {
      addLog(`Already installed: ${existing.stdout}`);
      return { success: true, detail: existing.stdout.trim(), log };
    }

    // Check known install dirs before installing
    for (const dir of KNOWN_INSTALL_PATHS.python) {
      if (!dir) continue;
      const pythonExe = path.join(dir, "python.exe");
      if (fs.existsSync(pythonExe)) {
        const check = await tryExec(pythonExe, ["--version"], process.cwd());
        if (check.ok) {
          addLog(`Found at ${pythonExe} (not on PATH): ${check.stdout}`);
          extraPaths.add(dir);
          if (!process.env.PATH.includes(dir)) {
            process.env.PATH = dir + ";" + process.env.PATH;
          }
          return { success: true, detail: check.stdout.trim(), log };
        }
      }
    }

    addLog("Installing via winget (Python.Python.3.12)...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (!wingetCheck.ok) {
      return { success: false, detail: "winget not available. Install \"App Installer\" from the Microsoft Store (https://aka.ms/getwinget), or get Python manually from python.org", log };
    }

    addLog("Waiting for winget lock (other installs may be in progress)...");
    const install = await serializedWingetInstall(() => tryExec("winget", [
      "install", "Python.Python.3.12",
      "--source", "winget",
      "--accept-source-agreements", "--accept-package-agreements",
      "--silent",
    ], process.cwd(), { timeout: 300000 }));
    addLog(`stdout: ${install.stdout}`);
    addLog(`stderr: ${install.stderr}`);
    addLog(`exit ok: ${install.ok}`);

    // ALWAYS poll — even on failure, the tool may have installed
    addLog("Polling for python to become available...");
    const pollResult = await waitForToolOnPath({
      command: "python",
      args: ["--version"],
      knownPaths: KNOWN_INSTALL_PATHS.python,
      maxWaitMs: 60000,
      intervalMs: 3000,
      addLog,
    });

    if (pollResult.found) {
      addLog(`Verified after polling: ${pollResult.stdout}`);
      return { success: true, detail: `Python ${pollResult.stdout.trim()} installed`, log };
    }

    if (install.ok || (install.stdout || "").includes("Successfully installed") || (install.stdout || "").includes("already installed")) {
      return { success: true, detail: "Python installed. Restart CodeCollab for PATH changes.", log };
    }

    addLog("winget install failed and tool not found.");
    return { success: false, detail: "Install failed. Try manually from python.org", log };
  }

  /* ─── Codex CLI install (npm) ─── */

  async function installCodex() {
    const log = [];
    const addLog = (msg) => { log.push(msg); console.log("[installCodex]", msg); };
    const fs = require("fs");
    const path = require("path");

    addLog(`Platform: ${process.platform}, arch: ${process.arch}`);
    addLog(`APPDATA: ${process.env.APPDATA || "(not set)"}`);
    addLog(`USERPROFILE: ${process.env.USERPROFILE || "(not set)"}`);

    await refreshSystemPath();
    addLog("PATH refreshed from registry.");

    // ── Step 1: Check if codex is already on PATH ──
    addLog("Step 1: Checking if codex is already on PATH...");
    const codexCmd = getCommandName("codex");
    addLog(`  Using command name: "${codexCmd}"`);
    const existing = await tryExec(codexCmd, ["--version"], process.cwd());
    addLog(`  tryExec result: ok=${existing.ok}, stdout="${existing.stdout}", stderr="${existing.stderr}", message="${existing.message || ""}"`);
    if (existing.ok) {
      addLog(`Already installed: ${existing.stdout}`);
      return { success: true, detail: existing.stdout.trim(), log };
    }

    // Also check npm global bin directory directly
    const npmBinDir = process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : "";
    if (npmBinDir) {
      const codexCmdPath = path.join(npmBinDir, "codex.cmd");
      const codexExePath = path.join(npmBinDir, "codex");
      addLog(`  Checking npm bin: ${codexCmdPath} exists=${fs.existsSync(codexCmdPath)}`);
      addLog(`  Checking npm bin: ${codexExePath} exists=${fs.existsSync(codexExePath)}`);
      if (fs.existsSync(codexCmdPath)) {
        const directCheck = await tryExec(codexCmdPath, ["--version"], process.cwd());
        addLog(`  Direct exec of ${codexCmdPath}: ok=${directCheck.ok}, stdout="${directCheck.stdout}"`);
        if (directCheck.ok) {
          // Add to PATH for the session
          extraPaths.add(npmBinDir);
          if (!process.env.PATH.includes(npmBinDir)) {
            process.env.PATH = npmBinDir + ";" + process.env.PATH;
          }
          addLog(`  Found existing install! Added ${npmBinDir} to PATH.`);
          return { success: true, detail: `Codex CLI ${directCheck.stdout.trim()} (found in npm global)`, log };
        }
      }
    }

    // ── Step 2: Install via npm ──
    addLog("Step 2: Installing via npm (npm install -g @openai/codex)...");
    const npmCmd = getCommandName("npm");
    addLog(`  npm command: "${npmCmd}"`);
    const npmCheck = await tryExec(npmCmd, ["--version"], process.cwd());
    addLog(`  npm check: ok=${npmCheck.ok}, stdout="${npmCheck.stdout}", stderr="${npmCheck.stderr}"`);
    if (!npmCheck.ok) {
      addLog("npm not available — cannot auto-install.");
      return { success: false, detail: "npm not available. Install Node.js first, then run: npm install -g @openai/codex", log };
    }
    addLog(`npm available: ${npmCheck.stdout}`);

    // Get npm global prefix for verification later
    const npmPrefix = await tryExec(npmCmd, ["config", "get", "prefix"], process.cwd());
    addLog(`  npm prefix: ok=${npmPrefix.ok}, stdout="${npmPrefix.stdout}"`);

    const install = await tryExec(npmCmd, ["install", "-g", "@openai/codex"], process.cwd(), { timeout: 180000 });
    addLog(`  install stdout: ${install.stdout}`);
    addLog(`  install stderr: ${install.stderr}`);
    addLog(`  install ok: ${install.ok}, message: ${install.message || ""}`);

    if (!install.ok) {
      addLog("npm install failed.");
      return { success: false, detail: "npm install -g @openai/codex failed. Try manually in a terminal.", log };
    }

    addLog("npm install succeeded! Refreshing PATH...");
    await refreshSystemPath();

    // ── Step 3: Verify installation ──
    addLog("Step 3: Verifying installation...");

    // Add npm global bin to extraPaths so codex is findable this session
    const npmBin = npmPrefix.ok ? npmPrefix.stdout.trim() : (process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : "");
    addLog(`  npm bin directory: "${npmBin}"`);
    if (npmBin) {
      extraPaths.add(npmBin);
      if (!process.env.PATH.includes(npmBin)) {
        process.env.PATH = npmBin + ";" + process.env.PATH;
        addLog(`  Prepended ${npmBin} to PATH`);
      } else {
        addLog(`  ${npmBin} already in PATH`);
      }
    }

    // List files in npm bin dir for debugging
    if (npmBin && fs.existsSync(npmBin)) {
      try {
        const files = fs.readdirSync(npmBin).filter(f => f.toLowerCase().includes("codex"));
        addLog(`  codex files in npm bin: ${files.join(", ") || "(none)"}`);
      } catch (e) {
        addLog(`  Could not list npm bin dir: ${e.message}`);
      }
    }

    // Try the .cmd variant first on Windows (most reliable)
    const verifyCmdPath = npmBin ? path.join(npmBin, "codex.cmd") : "";
    if (verifyCmdPath && fs.existsSync(verifyCmdPath)) {
      addLog(`  Verifying with direct path: ${verifyCmdPath}`);
      const directVerify = await tryExec(verifyCmdPath, ["--version"], process.cwd());
      addLog(`  Direct verify: ok=${directVerify.ok}, stdout="${directVerify.stdout}", stderr="${directVerify.stderr}"`);
      if (directVerify.ok) {
        addLog(`Verified via direct path: ${directVerify.stdout}`);
        return { success: true, detail: `Codex CLI ${directVerify.stdout.trim()} installed`, log };
      }
    }

    // Try via command name (codex.cmd on Windows)
    addLog(`  Verifying with getCommandName: "${codexCmd}"`);
    const verify = await tryExec(codexCmd, ["--version"], process.cwd());
    addLog(`  verify: ok=${verify.ok}, stdout="${verify.stdout}", stderr="${verify.stderr}", message="${verify.message || ""}"`);
    if (verify.ok) {
      addLog(`Verified: ${verify.stdout}`);
      return { success: true, detail: `Codex CLI ${verify.stdout.trim()} installed`, log };
    }

    // Last resort: try bare "codex" with shell: true
    if (process.platform === "win32") {
      addLog("  Trying bare 'codex' with shell: true...");
      const shellVerify = await tryExec("codex", ["--version"], process.cwd(), { shell: true });
      addLog(`  shell verify: ok=${shellVerify.ok}, stdout="${shellVerify.stdout}"`);
      if (shellVerify.ok) {
        addLog(`Verified via shell: ${shellVerify.stdout}`);
        return { success: true, detail: `Codex CLI ${shellVerify.stdout.trim()} installed`, log };
      }
    }

    // Still return success — the npm install itself worked
    addLog("WARNING: npm install succeeded but verification failed. Codex may need a full PATH refresh (restart app).");
    addLog(`  Current PATH (first 1000): ${(process.env.PATH || "").substring(0, 1000)}`);
    return { success: true, detail: "Codex CLI installed via npm. Restart the app if not detected.", log };
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

    // Check known install dirs before installing (may already be present but not on PATH)
    for (const dir of KNOWN_INSTALL_PATHS.git) {
      const gitExe = path.join(dir, "git.exe");
      if (fs.existsSync(gitExe)) {
        const check = await tryExec(gitExe, ["--version"], process.cwd());
        if (check.ok) {
          addLog(`Found at ${gitExe} (not on PATH): ${check.stdout}`);
          extraPaths.add(dir);
          if (!process.env.PATH.includes(dir)) {
            process.env.PATH = dir + ";" + process.env.PATH;
          }
          return { success: true, detail: check.stdout.trim(), log };
        }
      }
    }

    addLog("Installing via winget (Git.Git)...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (!wingetCheck.ok) {
      return { success: false, detail: "winget not available. Install \"App Installer\" from the Microsoft Store (https://aka.ms/getwinget), or get Git manually from git-scm.com", log };
    }

    addLog("Waiting for winget lock (other installs may be in progress)...");
    const install = await serializedWingetInstall(() => tryExec("winget", [
      "install", "Git.Git",
      "--source", "winget",
      "--accept-source-agreements", "--accept-package-agreements",
      "--silent",
    ], process.cwd(), { timeout: 300000 }));
    addLog(`stdout: ${install.stdout}`);
    addLog(`stderr: ${install.stderr}`);
    addLog(`exit ok: ${install.ok}`);

    // ALWAYS poll — even on failure, the tool may have installed
    addLog("Polling for git to become available...");
    const pollResult = await waitForToolOnPath({
      command: "git",
      args: ["--version"],
      knownPaths: KNOWN_INSTALL_PATHS.git,
      maxWaitMs: 90000,
      intervalMs: 3000,
      addLog,
    });

    if (pollResult.found) {
      addLog(`Verified after polling: ${pollResult.stdout}`);
      return { success: true, detail: pollResult.stdout.trim(), log };
    }

    if (install.ok || (install.stdout || "").includes("Successfully installed") || (install.stdout || "").includes("already installed")) {
      addLog("WARNING: Polling exhausted. Git may still be installing in an elevated process.");
      return { success: true, detail: "Git installed. Restart CodeCollab for PATH changes.", log };
    }

    addLog("winget install failed and tool not found.");
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

    // Check known install dirs before installing
    for (const dir of KNOWN_INSTALL_PATHS.gh) {
      const ghExe = path.join(dir, "gh.exe");
      if (fs.existsSync(ghExe)) {
        const check = await tryExec(ghExe, ["--version"], process.cwd());
        if (check.ok) {
          addLog(`Found at ${ghExe} (not on PATH): ${check.stdout}`);
          extraPaths.add(dir);
          if (!process.env.PATH.includes(dir)) {
            process.env.PATH = dir + ";" + process.env.PATH;
          }
          return { success: true, detail: check.stdout.trim(), log };
        }
      }
    }

    addLog("Installing via winget (GitHub.cli)...");
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd());
    if (!wingetCheck.ok) {
      return { success: false, detail: "winget not available. Install \"App Installer\" from the Microsoft Store (https://aka.ms/getwinget), or get GitHub CLI from cli.github.com", log };
    }

    addLog("Waiting for winget lock (other installs may be in progress)...");
    const install = await serializedWingetInstall(() => tryExec("winget", [
      "install", "GitHub.cli",
      "--source", "winget",
      "--accept-source-agreements", "--accept-package-agreements",
    ], process.cwd(), { timeout: 300000 }));
    addLog(`stdout: ${install.stdout}`);
    addLog(`stderr: ${install.stderr}`);
    addLog(`exit ok: ${install.ok}`);

    // ALWAYS poll — even on failure, the tool may have installed
    addLog("Polling for gh to become available...");
    const pollResult = await waitForToolOnPath({
      command: "gh",
      args: ["--version"],
      knownPaths: KNOWN_INSTALL_PATHS.gh,
      maxWaitMs: 60000,
      intervalMs: 3000,
      addLog,
    });

    if (pollResult.found) {
      addLog(`Verified after polling: ${pollResult.stdout}`);
      return { success: true, detail: pollResult.stdout.trim(), log };
    }

    if (install.ok || (install.stdout || "").includes("Successfully installed") || (install.stdout || "").includes("already installed")) {
      return { success: true, detail: "GitHub CLI installed. Restart CodeCollab for PATH changes.", log };
    }

    addLog("winget install failed and tool not found.");
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
      return { success: true, detail: "Claude Code installed. Restart CodeCollab for PATH to update.", log };
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
    const wingetCheck = await tryExec("winget", ["--version"], process.cwd(), { timeout: 15000 });
    if (wingetCheck.ok) {
      addLog("Waiting for winget lock (other installs may be in progress)...");
      const wingetInstall = await serializedWingetInstall(() => tryExec("winget", [
        "install", "Anthropic.ClaudeCode",
        "--accept-source-agreements", "--accept-package-agreements",
      ], process.cwd(), { timeout: 120000 }));
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
        return { success: true, detail: "Installed via winget. Restart CodeCollab for PATH changes.", log };
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
    const pathMod = require("path");
    const fsMod = require("fs");
    // Check ~/.local/bin (native installer)
    const userProfile = process.env.USERPROFILE || "";
    if (userProfile) {
      const localBin = pathMod.join(userProfile, ".local", "bin", "claude.exe");
      if (fsMod.existsSync(localBin)) {
        const binDir = pathMod.dirname(localBin);
        if (!process.env.PATH.includes(binDir)) {
          extraPaths.add(binDir);
          process.env.PATH = binDir + ";" + process.env.PATH;
        }
        return localBin;
      }
    }
    // Check winget install location
    const localAppData = process.env.LOCALAPPDATA || "";
    if (localAppData) {
      const wingetBase = pathMod.join(localAppData, "Microsoft", "WinGet", "Packages");
      try {
        if (fsMod.existsSync(wingetBase)) {
          const dirs = fsMod.readdirSync(wingetBase).filter(d => d.toLowerCase().includes("claudecode") || d.toLowerCase().includes("claude"));
          for (const d of dirs) {
            const claudeExe = pathMod.join(wingetBase, d, "claude.exe");
            if (fsMod.existsSync(claudeExe)) {
              const binDir = pathMod.dirname(claudeExe);
              if (!process.env.PATH.includes(binDir)) {
                extraPaths.add(binDir);
                process.env.PATH = binDir + ";" + process.env.PATH;
              }
              return claudeExe;
            }
          }
        }
      } catch { /* skip */ }
    }
    // Check npm global bin
    const appData = process.env.APPDATA || "";
    if (appData) {
      const npmCmd = pathMod.join(appData, "npm", "claude.cmd");
      if (fsMod.existsSync(npmCmd)) return npmCmd;
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
      const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(claudeCmd);
      const child = spawn(claudeCmd, ["auth", "login"], {
        cwd: process.cwd(),
        windowsHide: true,
        shell: needsShell || undefined,
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

  /* ─── Codex CLI auth ─── */

  async function getCodexAuthStatus() {
    console.log("[codexAuth] getCodexAuthStatus called");
    await refreshSystemPath();
    // Check for auth.json in ~/.codex/ — don't gate on codex binary being found
    const fs = require("fs");
    const path = require("path");
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const authFile = path.join(home, ".codex", "auth.json");
    console.log(`[codexAuth] Checking auth file: ${authFile}`);
    try {
      const exists = fs.existsSync(authFile);
      console.log(`[codexAuth] auth.json exists: ${exists}`);
      if (exists) {
        const content = fs.readFileSync(authFile, "utf8");
        console.log(`[codexAuth] auth.json length: ${content.length}, preview: ${content.substring(0, 80)}`);
        if (content && content.length > 10) {
          console.log("[codexAuth] → authenticated");
          return { authenticated: true, detail: "Signed in (auth.json found)" };
        }
      }
    } catch (err) {
      console.log(`[codexAuth] Error reading auth file: ${err.message}`);
    }
    console.log("[codexAuth] → not authenticated");
    return { authenticated: false, detail: "Not signed in — click to authenticate" };
  }

  async function startCodexAuth(sendEvent) {
    console.log("[codexAuth] startCodexAuth called");
    await refreshSystemPath();

    // Find the codex command
    const path = require("path");
    const fs = require("fs");
    let codexCmd = process.platform === "win32" ? "codex.cmd" : "codex";

    // Also try npm bin directory
    const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : "";
    const directPath = npmBin ? path.join(npmBin, "codex.cmd") : "";
    if (directPath && fs.existsSync(directPath)) {
      codexCmd = directPath;
      console.log(`[codexAuth] Using direct path: ${codexCmd}`);
    } else {
      console.log(`[codexAuth] Using command: ${codexCmd} (direct path ${directPath} not found)`);
    }

    return new Promise((resolve, reject) => {
      // Quote the command path if it contains spaces (e.g. "C:\Users\Valued Customer\...")
      const quotedCmd = codexCmd.includes(" ") ? `"${codexCmd}"` : codexCmd;
      console.log(`[codexAuth] Spawning: ${quotedCmd} login (shell=${process.platform === "win32"})`);
      const child = spawn(quotedCmd, ["login"], {
        cwd: process.cwd(),
        windowsHide: true,
        shell: process.platform === "win32",
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      const processOutput = (text) => {
        sendEvent("tools:codexAuthProgress", { output: text });
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
        console.log(`[codexAuth] Process closed with code: ${code}`);
        console.log(`[codexAuth] stdout: ${stdout.substring(0, 300)}`);
        console.log(`[codexAuth] stderr: ${stderr.substring(0, 300)}`);
        if (code === 0) {
          resolve({ success: true, stdout, stderr });
        } else {
          resolve({ success: false, stdout, stderr, exitCode: code });
        }
      });

      child.on("error", (err) => {
        console.log(`[codexAuth] Process spawn error: ${err.message}`);
        reject(err);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        console.log("[codexAuth] Timed out after 5 minutes");
        try { child.kill(); } catch {}
        resolve({ success: false, stdout, stderr, exitCode: null, timedOut: true });
      }, 300000);
    });
  }
}

module.exports = {
  createToolingService,
};