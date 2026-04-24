"use strict";

/**
 * macOS platform module — counterpart to ./windows.js.
 *
 * Philosophy: on macOS, executables have no extension, everything lives on
 * PATH, and Homebrew (`/opt/homebrew/bin` on Apple Silicon, `/usr/local/bin`
 * on Intel) plus the user's npm prefix cover 95 % of CLI discovery.
 *
 * GUI-launched Electron apps inherit a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`),
 * so we proactively augment PATH at process start in electron/main.js via a
 * call to `augmentMacPath()` (see below) — this saves each individual caller
 * from having to hardcode Homebrew paths.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

// Canonical macOS bin directories that GUI apps often miss.
const MAC_COMMON_BIN_DIRS = [
  "/opt/homebrew/bin", // Apple Silicon Homebrew
  "/opt/homebrew/sbin",
  "/usr/local/bin", // Intel Homebrew / system
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

function userBinDirs() {
  const home = os.homedir();
  return [
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"), // manual npm prefix
    path.join(home, ".nvm", "versions", "node"), // scanned separately below
    path.join(home, ".cargo", "bin"),
    path.join(home, ".deno", "bin"),
  ];
}

/**
 * Scan ~/.nvm/versions/node/<ver>/bin for installed node versions.
 * Returns newest-first list of bin directories, or [] if nvm is not installed.
 */
function scanNvmBinDirs() {
  try {
    const base = path.join(os.homedir(), ".nvm", "versions", "node");
    if (!fs.existsSync(base)) return [];
    const versions = fs
      .readdirSync(base)
      .filter((v) => /^v?\d+\./.test(v))
      .sort()
      .reverse();
    return versions.map((v) => path.join(base, v, "bin")).filter((d) => fs.existsSync(d));
  } catch {
    return [];
  }
}

// ---------- Command resolution ----------

function resolveCommandName(command) {
  // macOS executables have no extension.
  return command;
}

function getKnownCommandLocations(command) {
  const home = os.homedir();
  const candidates = [];

  // Common Homebrew / system bin locations for every tool.
  for (const dir of MAC_COMMON_BIN_DIRS) {
    candidates.push(path.join(dir, command));
  }

  // User-level locations.
  candidates.push(path.join(home, ".local", "bin", command));
  candidates.push(path.join(home, ".npm-global", "bin", command));

  // Tool-specific extras.
  if (command === "claude") {
    candidates.push(path.join(home, ".claude", "bin", "claude"));
    candidates.push("/Applications/Claude Code.app/Contents/MacOS/claude");
  }

  if (command === "copilot") {
    // gh-copilot extension
    candidates.push(path.join(home, ".local", "share", "gh", "extensions", "gh-copilot", "gh-copilot"));
  }

  if (command === "codex") {
    // Global npm install path on mac
    candidates.push("/opt/homebrew/lib/node_modules/@openai/codex/bin/codex");
    candidates.push("/usr/local/lib/node_modules/@openai/codex/bin/codex");
  }

  if (command === "git") {
    candidates.push("/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git");
  }

  if (command === "node" || command === "npm" || command === "npx") {
    // nvm-installed node
    for (const binDir of scanNvmBinDirs()) {
      candidates.push(path.join(binDir, command));
    }
  }

  // De-dupe while preserving order.
  return Array.from(new Set(candidates));
}

// ---------- Shell / spawn helpers ----------

function needsShellForCommand(/* file */) {
  // macOS has no .cmd/.bat equivalent. spawn() never needs shell:true just
  // because of the file extension.
  return false;
}

// ---------- System / diagnostics ----------

function getSystemModelSync() {
  try {
    // `sysctl hw.model` returns e.g. "Macmini9,1"
    const out = execSync("sysctl -n hw.model", {
      encoding: "utf8",
      timeout: 3000,
    });
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
      return "Open Terminal and run: gh extension install github/gh-copilot";
    case "claude":
    case "claude-code":
      return "Open Terminal and run: npm install -g @anthropic-ai/claude-code";
    case "codex":
      return "Open Terminal and run: npm install -g @openai/codex";
    case "gh":
      return "Open Terminal and run: brew install gh";
    case "git":
      return "Open Terminal and run: brew install git   (or install Xcode Command Line Tools)";
    case "node":
      return "Open Terminal and run: brew install node";
    default:
      return `Please install ${tool || "this tool"} and restart CodeBuddy.`;
  }
}

// ---------- Command jail ----------

/**
 * On macOS, `kill` and `pkill` are legitimate Unix commands that users or
 * scripts may reasonably want. We still jail them inside the agent sandbox
 * because a rogue LLM call could terminate CodeBuddy, finder, or system
 * daemons — but note the distinction vs. Windows where these names don't
 * exist natively.
 *
 * `code` (VS Code) and `open` (generic Finder launcher) are also jailed so
 * the agent can't pop up arbitrary GUI windows.
 */
function getDangerousCommandStubs() {
  return ["code", "open", "kill", "pkill", "killall"];
}

// ---------- Terminal launcher ----------

/**
 * Open Terminal.app at `cwd` optionally running `command`.
 * Uses osascript; the mac branch was previously inlined in register-handlers.js.
 */
function getTerminalSpawn(opts) {
  const cwd = opts.cwd;
  const command = opts.command || "";
  const run = opts.run === true;
  const spawnOpts = { cwd, detached: true, stdio: "ignore" };

  const escCwd = cwd.replace(/"/g, '\\"');
  let script;

  if (command && run) {
    const esc = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    script =
      `tell application "Terminal" to do script "cd \\"${escCwd}\\" && ${esc}"\n` +
      `tell application "Terminal" to activate`;
  } else if (command) {
    const escSingle = command.replace(/'/g, "'\\''");
    script =
      `tell application "Terminal" to do script "cd \\"${escCwd}\\" && ` +
      `echo '[CodeBuddy] Command copied to clipboard — press Cmd+V then Enter to run:' && ` +
      `echo '  ${escSingle}'"\n` +
      `tell application "Terminal" to activate`;
  } else {
    script =
      `tell application "Terminal" to do script "cd \\"${escCwd}\\""\n` +
      `tell application "Terminal" to activate`;
  }

  return {
    cmd: "osascript",
    args: ["-e", script],
    spawnOpts,
    terminal: "Terminal.app",
    copyToClipboard: !!command && !run,
  };
}

// ---------- Diagnostics ----------

function getCliSearchHints() {
  return {
    pathEntries: (process.env.PATH || "").split(":").filter(Boolean),
    envVars: {
      HOME: process.env.HOME || null,
      SHELL: process.env.SHELL || null,
      PATH: process.env.PATH || null,
    },
  };
}

function getPythonCandidatePaths() {
  const candidates = [
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
  ];
  // pyenv-managed versions
  try {
    const pyenv = path.join(os.homedir(), ".pyenv", "versions");
    if (fs.existsSync(pyenv)) {
      const versions = fs.readdirSync(pyenv).sort().reverse();
      for (const v of versions) candidates.push(path.join(pyenv, v, "bin", "python3"));
    }
  } catch {
    /* skip */
  }
  return candidates;
}

function getNodeCandidatePaths() {
  const candidates = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];
  for (const binDir of scanNvmBinDirs()) {
    candidates.push(path.join(binDir, "node"));
  }
  return candidates;
}

// ---------- PATH augmentation (called early in main.js) ----------

/**
 * GUI-launched mac apps inherit a minimal PATH. Prepend canonical bin
 * directories so later spawn() calls find Homebrew-installed tools.
 *
 * Exported but NOT on the platform API surface — callers import it directly
 * if they need it. Safe to call multiple times.
 */
function augmentMacPath() {
  const existing = (process.env.PATH || "").split(":").filter(Boolean);
  const wanted = [
    ...MAC_COMMON_BIN_DIRS,
    ...userBinDirs(),
    ...scanNvmBinDirs(),
  ].filter((dir) => {
    try {
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  });
  // Prepend wanted dirs that aren't already on PATH.
  const existingSet = new Set(existing);
  const toAdd = wanted.filter((d) => !existingSet.has(d));
  if (toAdd.length) {
    process.env.PATH = [...toAdd, ...existing].join(":");
  }
}

module.exports = {
  name: "mac",
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
  // Non-API helper, imported directly when needed:
  augmentMacPath,
};
