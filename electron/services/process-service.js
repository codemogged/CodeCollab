const { spawn } = require("child_process");
const path = require("path");
const crypto = require("crypto");

function createProcessService({ sendEvent }) {
  const runningProcesses = new Map();
  let emit = sendEvent;
  let logActivity = () => undefined;

  function runChild(child, metadata) {
    const processId = crypto.randomUUID();
    const timeoutMs = typeof metadata.options?.timeoutMs === "number" ? metadata.options.timeoutMs : 0;

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timeoutHandle = null;

      runningProcesses.set(processId, child);
      emit("process:started", { processId, command: metadata.label, cwd: metadata.cwd });
      logActivity("started", { processId, command: metadata.label, cwd: metadata.cwd });

      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          if (!child.killed) {
            child.kill();
            emit("process:timeout", { processId, command: metadata.label, cwd: metadata.cwd, timeoutMs });
          }
        }, timeoutMs);
      }

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        emit("process:output", { processId, stream: "stdout", chunk });
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        emit("process:output", { processId, stream: "stderr", chunk });
      });

      child.on("close", (exitCode) => {
        if (settled) {
          return;
        }

        settled = true;
        runningProcesses.delete(processId);

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const result = { processId, stdout, stderr, exitCode };
        emit("process:completed", { processId, exitCode, cwd: metadata.cwd });
        logActivity("completed", { processId, command: metadata.label, cwd: metadata.cwd, exitCode });
        resolve(result);
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        runningProcesses.delete(processId);

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        emit("process:error", { processId, message: error.message, cwd: metadata.cwd });
        logActivity("error", { processId, command: metadata.label, cwd: metadata.cwd, message: error.message });
        reject(error);
      });
    });
  }

  function normalizeCwd(cwd) {
    if (typeof cwd !== "string" || !cwd.trim()) {
      throw new Error("A working directory is required.");
    }

    return path.resolve(cwd);
  }

  async function run(command, cwd, options = {}) {
    if (typeof command !== "string" || !command.trim()) {
      throw new Error("A command is required.");
    }

    const resolvedCwd = normalizeCwd(cwd);
    const child = spawn(command, {
      cwd: resolvedCwd,
      shell: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...(options.env ?? {}) },
    });

    return runChild(child, {
      label: command,
      cwd: resolvedCwd,
      options,
    });
  }

  async function runProgram(file, args, cwd, options = {}) {
    if (typeof file !== "string" || !file.trim()) {
      throw new Error("A program is required.");
    }

    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
      throw new Error("Program arguments must be a string array.");
    }

    const resolvedCwd = normalizeCwd(cwd);
    const child = spawn(file, args, {
      cwd: resolvedCwd,
      shell: false,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...(options.env ?? {}) },
      windowsHide: true,
    });

    return runChild(child, {
      label: [file, ...args].join(" "),
      cwd: resolvedCwd,
      options,
    });
  }

  function cancel(processId) {
    const child = runningProcesses.get(processId);

    if (!child) {
      return { ok: false };
    }

    child.kill();
    runningProcesses.delete(processId);
    emit("process:cancelled", { processId });
    logActivity("cancelled", { processId });
    return { ok: true };
  }

  function listRunning() {
    return Array.from(runningProcesses.keys()).map((processId) => ({ processId }));
  }

  return {
    __setEventSender(nextSendEvent) {
      emit = nextSendEvent;
    },
    __setActivityLogger(nextLogger) {
      logActivity = nextLogger;
    },
    run,
    runProgram,
    cancel,
    listRunning,
  };
}

module.exports = {
  createProcessService,
};