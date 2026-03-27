const fs = require("fs/promises");
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
      branches: branchesOutput ? branchesOutput.split(/\r?\n/).filter(Boolean) : [],
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

    return entries
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

  async function checkoutBranch(repoPath, branchName, create = false) {
    const resolvedRepoPath = await ensureRepository(repoPath);
    const gitCommand = await getGitCommand();

    if (typeof branchName !== "string" || !branchName.trim()) {
      throw new Error("A branch name is required.");
    }

    if (create) {
      await runGit(gitCommand, ["switch", "-c", branchName.trim()], resolvedRepoPath);
    } else {
      await runGit(gitCommand, ["switch", branchName.trim()], resolvedRepoPath);
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
  };
}

module.exports = {
  createRepoService,
};