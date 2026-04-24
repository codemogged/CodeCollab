"use strict";

/**
 * Platform abstraction layer — entry point.
 *
 * Selects the right implementation based on `process.platform` and re-exports
 * a single flat API. Behavior on Windows is a faithful extraction of the
 * existing code in project-service.js / tooling-service.js / register-handlers.js
 * so callers can migrate incrementally with zero behavior change.
 *
 * API contract (see ./windows.js for reference implementations):
 *
 *   name                          — "windows" | "mac" | "linux"
 *   isWindows / isMac / isLinux   — boolean flags
 *   resolveCommandName(cmd)       — "npm" → "npm.cmd" on win32, "npm" elsewhere
 *   getKnownCommandLocations(cmd) — string[] of absolute paths to probe for a CLI
 *   needsShellForCommand(file)    — true when spawn() requires shell:true
 *                                    (covers CVE-2024-27980 for .cmd/.bat on win32)
 *   getSystemModelSync()          — hardware model string (never throws)
 *   getInstallInstruction(tool)   — user-facing one-liner install command
 *   getDangerousCommandStubs()    — command names that should be shadowed with
 *                                    no-op wrappers inside the agent command jail
 *   getTerminalSpawn(opts)        — { cmd, args, spawnOpts, terminal } for
 *                                    launching an external terminal window
 *   getCliSearchHints()           — diagnostic { pathEntries, envVars } for logs
 *   getPythonCandidatePaths()     — string[] of python executable candidates
 *   getNodeCandidatePaths()       — string[] of node executable candidates
 */

let impl;

if (process.platform === "win32") {
  impl = require("./windows");
} else if (process.platform === "darwin") {
  impl = require("./mac");
} else {
  impl = require("./linux");
}

module.exports = {
  name: impl.name,
  isWindows: impl.name === "windows",
  isMac: impl.name === "mac",
  isLinux: impl.name === "linux",

  resolveCommandName: impl.resolveCommandName,
  getKnownCommandLocations: impl.getKnownCommandLocations,
  needsShellForCommand: impl.needsShellForCommand,
  getSystemModelSync: impl.getSystemModelSync,
  getInstallInstruction: impl.getInstallInstruction,
  getDangerousCommandStubs: impl.getDangerousCommandStubs,
  getTerminalSpawn: impl.getTerminalSpawn,
  getCliSearchHints: impl.getCliSearchHints,
  getPythonCandidatePaths: impl.getPythonCandidatePaths,
  getNodeCandidatePaths: impl.getNodeCandidatePaths,
};
