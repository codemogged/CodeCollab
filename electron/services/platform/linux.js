"use strict";

/**
 * Linux platform module — minimal stubs.
 *
 * CodeBuddy isn't targeting Linux as a first-class platform yet, but keeping
 * this file means `require("./index")` never throws on a Linux dev box. Most
 * behaviors are a close match to the macOS implementation.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

const COMMON_BIN_DIRS = [
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

function resolveCommandName(command) {
  return command;
}

function getKnownCommandLocations(command) {
  const home = os.homedir();
  const candidates = [];
  for (const dir of COMMON_BIN_DIRS) candidates.push(path.join(dir, command));
  candidates.push(path.join(home, ".local", "bin", command));
  candidates.push(path.join(home, ".npm-global", "bin", command));
  return Array.from(new Set(candidates));
}

function needsShellForCommand() {
  return false;
}

function getSystemModelSync() {
  try {
    const out = execSync("cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null || uname -m", {
      encoding: "utf8",
      timeout: 3000,
    });
    return String(out || "").trim();
  } catch {
    return "";
  }
}

function getInstallInstruction(tool) {
  return `Please install ${tool || "this tool"} via your package manager (apt/dnf/pacman) and restart CodeBuddy.`;
}

function getDangerousCommandStubs() {
  return ["code", "xdg-open", "kill", "pkill", "killall"];
}

function getTerminalSpawn(opts) {
  const cwd = opts.cwd;
  const command = opts.command || "";
  const run = opts.run === true;
  const spawnOpts = { cwd, detached: true, stdio: "ignore" };

  const bashArgs =
    command && run
      ? ["bash", "-c", `${command}; exec bash`]
      : command
      ? [
          "bash",
          "-c",
          `echo '[CodeBuddy] Command copied to clipboard — paste then Enter:'; echo '  ${command.replace(
            /'/g,
            "'\\''",
          )}'; exec bash`,
        ]
      : null;

  // Pick the first terminal emulator that exists on PATH-ish locations.
  const candidates = [
    "x-terminal-emulator",
    "gnome-terminal",
    "konsole",
    "xfce4-terminal",
    "xterm",
  ];

  for (const term of candidates) {
    // We can't cheaply test availability without spawning; return the first
    // candidate and let the caller handle ENOENT by falling through.
    const args = bashArgs
      ? term === "gnome-terminal"
        ? ["--", ...bashArgs]
        : ["-e", bashArgs.join(" ")]
      : [];
    return {
      cmd: term,
      args,
      spawnOpts,
      terminal: term,
      copyToClipboard: !!command && !run,
    };
  }

  return {
    cmd: "xterm",
    args: [],
    spawnOpts,
    terminal: "xterm",
    copyToClipboard: !!command && !run,
  };
}

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
  return ["/usr/bin/python3", "/usr/local/bin/python3"];
}

function getNodeCandidatePaths() {
  return ["/usr/bin/node", "/usr/local/bin/node"];
}

module.exports = {
  name: "linux",
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

// Suppress unused-var linting if `fs` isn't consumed in a future refactor.
void fs;
