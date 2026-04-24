"use strict";

/**
 * Windows platform module — faithful extraction of the Windows-specific
 * behavior currently spread across project-service.js, tooling-service.js,
 * register-handlers.js, and main.js.
 *
 * DO NOT add mac/linux branches in here. This file should be a pure Windows
 * implementation. Cross-platform callers must go through ./index.js.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

// ---------- Command resolution ----------

function resolveCommandName(command) {
  if (command === "npm") return "npm.cmd";
  if (command === "npx") return "npx.cmd";
  return command;
}

function getKnownCommandLocations(command) {
  const localAppData = process.env.LOCALAPPDATA || "";
  const appData = process.env.APPDATA || "";
  const home = process.env.USERPROFILE || os.homedir();

  if (command === "gh" || command === "gh.exe") {
    return [
      "C:/Program Files/GitHub CLI/gh.exe",
      "C:/Program Files (x86)/GitHub CLI/gh.exe",
      localAppData ? path.join(localAppData, "Programs", "GitHub CLI", "gh.exe") : null,
    ].filter(Boolean);
  }

  if (command === "copilot" || command === "copilot.exe") {
    const candidates = [
      localAppData ? path.join(localAppData, "GitHub CLI", "copilot", "copilot.exe") : null,
      localAppData ? path.join(localAppData, "GitHub CLI", "extensions", "gh-copilot", "copilot.exe") : null,
      home ? path.join(home, ".local", "share", "gh", "extensions", "gh-copilot", "gh-copilot.exe") : null,
      home ? path.join(home, ".local", "share", "gh", "extensions", "gh-copilot", "copilot.exe") : null,
    ];
    if (localAppData) {
      const wingetBase = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      try {
        if (fs.existsSync(wingetBase)) {
          const dirs = fs
            .readdirSync(wingetBase)
            .filter((d) => d.toLowerCase().includes("copilot"));
          for (const d of dirs) candidates.push(path.join(wingetBase, d, "copilot.exe"));
        }
      } catch {
        /* skip */
      }
    }
    return candidates.filter(Boolean);
  }

  if (command === "claude" || command === "claude.exe") {
    const candidates = [home ? path.join(home, ".local", "bin", "claude.exe") : null];
    if (localAppData) {
      const wingetBase = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      try {
        if (fs.existsSync(wingetBase)) {
          const dirs = fs
            .readdirSync(wingetBase)
            .filter(
              (d) =>
                d.toLowerCase().includes("claudecode") || d.toLowerCase().includes("claude"),
            );
          for (const d of dirs) candidates.push(path.join(wingetBase, d, "claude.exe"));
        }
      } catch {
        /* skip */
      }
    }
    return candidates.filter(Boolean);
  }

  if (command === "codex" || command === "codex.cmd") {
    return [
      appData ? path.join(appData, "npm", "codex.cmd") : null,
      home ? path.join(home, "AppData", "Roaming", "npm", "codex.cmd") : null,
    ].filter(Boolean);
  }

  if (command === "git" || command === "git.exe") {
    return [
      "C:/Program Files/Git/cmd/git.exe",
      "C:/Program Files/Git/bin/git.exe",
      "C:/Program Files (x86)/Git/cmd/git.exe",
      "C:/Program Files (x86)/Git/bin/git.exe",
    ];
  }

  return [];
}

// ---------- Shell / spawn helpers ----------

function needsShellForCommand(file) {
  if (!file) return false;
  const lower = String(file).toLowerCase();
  // .cmd/.bat files on Windows require shell:true to execute via spawn.
  // See CVE-2024-27980 for why we only opt in when we actually need it.
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

// ---------- System / diagnostics ----------

function getSystemModelSync() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystem).Model"',
      { encoding: "utf8", windowsHide: true, timeout: 3000 },
    );
    return String(out || "").trim();
  } catch {
    return "";
  }
}

// ---------- Install instructions ----------

function getInstallInstruction(tool) {
  switch ((tool || "").toLowerCase()) {
    case "copilot":
    case "gh-copilot":
      return "Open PowerShell and run: gh extension install github/gh-copilot";
    case "claude":
    case "claude-code":
      return 'Open PowerShell and run: irm https://claude.ai/install.ps1 | iex';
    case "codex":
      return "Open PowerShell and run: npm install -g @openai/codex";
    case "gh":
      return "Open PowerShell and run: winget install --id GitHub.cli";
    case "git":
      return "Open PowerShell and run: winget install --id Git.Git";
    case "node":
      return "Open PowerShell and run: winget install --id OpenJS.NodeJS.LTS";
    default:
      return `Please install ${tool || "this tool"} and restart CodeBuddy.`;
  }
}

// ---------- Command jail ----------

/**
 * Names that the agent command jail shadows with no-op wrappers.
 * On Windows this is: tools that either aren't sandbox-safe (launching GUIs)
 * or are dangerous process-killers that could terminate CodeBuddy itself.
 *
 * NOTE: `taskkill` is intentionally included — on Windows agents must not
 * kill arbitrary processes. The prompts further instruct the model not to
 * call these.
 */
function getDangerousCommandStubs() {
  return ["code", "explorer", "start", "powershell", "kill", "pkill", "taskkill"];
}

// ---------- Terminal launcher ----------

/**
 * Build the spawn args for opening a new external terminal window.
 * Caller runs spawn(cmd, args, spawnOpts).unref().
 *
 * opts = { cwd, command, run }
 *   - cwd: absolute directory to start in (assumed validated)
 *   - command: single-line command string (optional)
 *   - run: if true, execute `command`; if false, prefill / copy
 */
function getTerminalSpawn(opts) {
  const cwd = opts.cwd;
  const command = opts.command || "";
  const run = opts.run === true;
  const spawnOpts = { cwd, detached: true, stdio: "ignore", windowsHide: false };

  // Prefer Windows Terminal (wt.exe) if available.
  let wtPath = null;
  try {
    const localApp = process.env.LOCALAPPDATA;
    if (localApp) {
      const candidate = path.join(localApp, "Microsoft", "WindowsApps", "wt.exe");
      if (fs.existsSync(candidate)) wtPath = candidate;
    }
  } catch {
    /* ignore */
  }

  if (wtPath) {
    const args = ["-d", cwd];
    if (command && run) {
      args.push("cmd", "/K", command);
    } else if (command) {
      const safe = command.replace(/[&<>|^]/g, "^$&");
      args.push(
        "cmd",
        "/K",
        `echo [CodeBuddy] Command copied to clipboard — press Ctrl+V then Enter to run:&& echo   ${safe}`,
      );
    }
    return { cmd: "wt.exe", args, spawnOpts, terminal: "wt", copyToClipboard: !!command && !run };
  }

  // Fallback: cmd.exe via `start` so the new console is detached.
  let startCmd;
  if (command && run) {
    startCmd = `start "CodeBuddy" cmd /K "${command.replace(/"/g, '\\"')}"`;
  } else if (command) {
    const safe = command.replace(/[&<>|^]/g, "^$&").replace(/"/g, '\\"');
    startCmd = `start "CodeBuddy" cmd /K "echo [CodeBuddy] Command copied to clipboard -- press Ctrl+V then Enter to run:&& echo   ${safe}"`;
  } else {
    startCmd = `start "CodeBuddy" cmd /K`;
  }
  return {
    cmd: "cmd.exe",
    args: ["/c", startCmd],
    spawnOpts: { ...spawnOpts, shell: false },
    terminal: "cmd",
    copyToClipboard: !!command && !run,
  };
}

// ---------- Diagnostics ----------

function getCliSearchHints() {
  return {
    pathEntries: (process.env.PATH || process.env.Path || "").split(";").filter(Boolean),
    envVars: {
      LOCALAPPDATA: process.env.LOCALAPPDATA || null,
      APPDATA: process.env.APPDATA || null,
      USERPROFILE: process.env.USERPROFILE || null,
      ProgramFiles: process.env["ProgramFiles"] || null,
      "ProgramFiles(x86)": process.env["ProgramFiles(x86)"] || null,
    },
  };
}

function getPythonCandidatePaths() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const out = [];
  if (localAppData) {
    for (const v of ["Python313", "Python312", "Python311"]) {
      out.push(path.join(localAppData, "Programs", "Python", v, "python.exe"));
    }
  }
  out.push("C:/Python313/python.exe", "C:/Python312/python.exe", "C:/Python311/python.exe");
  return out;
}

function getNodeCandidatePaths() {
  return [
    "C:/Program Files/nodejs/node.exe",
    "C:/Program Files (x86)/nodejs/node.exe",
  ];
}

module.exports = {
  name: "windows",
  resolveCommandName,
  getKnownCommandLocations,
  needsShellForCommand,
  getSystemModelSync,
  getInstallInstruction,
  getDangerousCommandStubs,
  getTerminalSpawn,
  getCliSearchHints,
  getPythonCandidatePaths,
  getNodeCandidatePaths,
};
