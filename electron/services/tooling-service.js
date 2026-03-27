const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function createToolingService({ processService, settingsService }) {
  function getCommandName(command) {
    if (process.platform === "win32") {
      if (command === "npm") return "npm.cmd";
      if (command === "npx") return "npx.cmd";
    }

    return command;
  }

  async function tryExec(file, args, cwd) {
    try {
      const result = await execFileAsync(file, args, {
        cwd,
        windowsHide: true,
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
        command: configuredCommands.githubCli || getCommandName("gh"),
        args: ["help", "copilot"],
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
        command: configuredCommands.claudeCode || getCommandName("claude"),
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
    const args = ["copilot", "--", "-p", prompt.trim()];

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

  return {
    getToolStatus,
    runCopilotPrompt,
  };
}

module.exports = {
  createToolingService,
};