/**
 * Project Service — manages project lifecycle, AI agent execution, and P2P collaboration.
 *
 * TESTING GUIDE (Electron main process):
 * 1. Claude streaming: Claude CLI now uses spawn() instead of execFile() for real-time output.
 *    - Verify: Send a Claude prompt → output should stream token-by-token, not buffer until completion.
 *    - No maxBuffer limit (was 1MB with execFile).
 * 2. CLI detection: Check console for "[readConfiguredCommands] claudeCli:" at startup.
 * 3. Agent events: onAgentStarted → onAgentOutput (multiple chunks) → onAgentCompleted.
 * 4. stderr filtering: Claude warnings about stdin are filtered; real errors pass through.
 * 5. Safe PATH: Dangerous commands (code, explorer, powershell) are jailed to no-op wrappers.
 */
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const crypto = require("crypto");
const { DEFAULT_SYSTEM_PROMPT_MARKDOWN, IMPORTED_PROJECT_SYSTEM_PROMPT } = require("./settings-service");

const execFileAsync = promisify(execFile);

const FOLLOW_UP_TRANSCRIPT_LIMIT = 8;
const CHECKPOINT_EXCLUDED_ROOTS = new Set([".git", "node_modules", ".next", "out", "dist", "dist-electron", "tmp"]);

/**
 * Re-read the current System + User PATH from the Windows registry
 * so that tools installed *after* Electron launched are discoverable.
 */
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
    const expanded = combined.replace(/%([^%]+)%/g, (match, name) => process.env[name] || match);
    if (expanded) {
      process.env.PATH = expanded;
      if (process.platform === "win32") process.env.Path = expanded;
    }
  } catch {
    // Keep existing PATH if registry reads fail
  }
}

function getCommandName(command) {
  if (process.platform === "win32") {
    if (command === "npm") return "npm.cmd";
    if (command === "npx") return "npx.cmd";
  }

  return command;
}

function getKnownCommandLocations(command) {
  if (process.platform !== "win32") {
    return [];
  }

  const localAppData = process.env.LOCALAPPDATA || "";

  if (command === "gh" || command === "gh.exe") {
    return [
      "C:/Program Files/GitHub CLI/gh.exe",
      "C:/Program Files (x86)/GitHub CLI/gh.exe",
      localAppData ? path.join(localAppData, "Programs", "GitHub CLI", "gh.exe") : null,
    ].filter(Boolean);
  }

  if (command === "copilot" || command === "copilot.exe") {
    const home = process.env.USERPROFILE || os.homedir();
    const candidates = [
      localAppData ? path.join(localAppData, "GitHub CLI", "copilot", "copilot.exe") : null,
      localAppData ? path.join(localAppData, "GitHub CLI", "extensions", "gh-copilot", "copilot.exe") : null,
      home ? path.join(home, ".local", "share", "gh", "extensions", "gh-copilot", "gh-copilot.exe") : null,
      home ? path.join(home, ".local", "share", "gh", "extensions", "gh-copilot", "copilot.exe") : null,
    ];
    // Scan WinGet packages for copilot.exe
    if (localAppData) {
      const wingetBase = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      try {
        if (fsSync.existsSync(wingetBase)) {
          const dirs = fsSync.readdirSync(wingetBase).filter(d => d.toLowerCase().includes("copilot"));
          for (const d of dirs) {
            candidates.push(path.join(wingetBase, d, "copilot.exe"));
          }
        }
      } catch { /* skip */ }
    }
    return candidates.filter(Boolean);
  }

  if (command === "claude" || command === "claude.exe") {
    const home = process.env.USERPROFILE || os.homedir();
    const candidates = [
      home ? path.join(home, ".local", "bin", "claude.exe") : null,
    ];
    // Scan WinGet packages for claude.exe
    if (localAppData) {
      const wingetBase = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      try {
        if (fsSync.existsSync(wingetBase)) {
          const dirs = fsSync.readdirSync(wingetBase).filter(d => d.toLowerCase().includes("claudecode") || d.toLowerCase().includes("claude"));
          for (const d of dirs) {
            candidates.push(path.join(wingetBase, d, "claude.exe"));
          }
        }
      } catch { /* skip */ }
    }
    return candidates.filter(Boolean);
  }

  if (command === "codex" || command === "codex.cmd") {
    const appData = process.env.APPDATA || "";
    const home = process.env.USERPROFILE || os.homedir();
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

function slugifyProjectName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "codebuddy-project";
}

function formatProjectTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) {
    return "Just now";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Short date+clock string, e.g. "Apr 19, 3:42 PM". */
function formatTimeShort(ts = Date.now()) {
  const d = new Date(ts);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

function sanitizeFileSegment(value) {
  return String(value || "context")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "context";
}

function stripJsonFences(value) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function parseJsonObjectFromText(value) {
  const stripped = stripJsonFences(value);

  try {
    return JSON.parse(stripped);
  } catch {
    // Brace-matching: find the first complete JSON object even if
    // the CLI appended commentary or extra text after the JSON.
    const start = stripped.indexOf("{");
    if (start === -1) throw new Error("CLI did not return valid JSON.");

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }

    if (end === -1) throw new Error("CLI did not return valid JSON.");

    return JSON.parse(stripped.slice(start, end + 1));
  }
}

function buildEmptyDashboardState(initialPrompt, systemPromptMarkdown) {
  return {
    systemPromptMarkdown: systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN,
    initialPrompt: initialPrompt || "",
    lastPlanGeneratedAt: null,
    projectManagerContextMarkdown: "",
    projectManagerContextPath: null,
    plan: null,
    conversation: [],
    taskThreads: [],
    activity: [],
    artifacts: [],
    channels: [],
    directMessages: [],
    soloSessions: [],
  };
}

function makeDueDate(daysFromToday) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function normalizeGeneratedPlan(project, prompt, payload) {
  const timestamp = Date.now();
  const subprojects = (payload.subprojects ?? []).slice(0, 5).map((subproject, subprojectIndex) => {
    const subprojectId = `sub-${project.folderName}-${subprojectIndex + 1}`;
    const validStatuses = new Set(["planned", "building", "review", "done"]);
    const tasks = (subproject.tasks ?? []).slice(0, 5).map((task, taskIndex) => ({
      id: `task-${project.folderName}-${subprojectIndex + 1}-${taskIndex + 1}`,
      title: task.title?.trim() || `Task ${taskIndex + 1}`,
      status: validStatuses.has(task.status) ? task.status : "planned",
      owner: task.owner?.trim() || project.creatorName || "Cameron",
      reviewer: task.reviewer?.trim() || "Cameron",
      note: task.note?.trim() || "Initial planning task.",
      dueDate: makeDueDate(subprojectIndex * 3 + taskIndex + 1),
      startingPrompt: task.startingPrompt?.trim() || `Build ${task.title?.trim() || `task ${taskIndex + 1}`} for ${project.name}.`,
    }));

    return {
      id: subprojectId,
      title: subproject.title?.trim() || `Subproject ${subprojectIndex + 1}`,
      goal: subproject.goal?.trim() || "Ship a focused MVP slice.",
      status: validStatuses.has(subproject.status) ? subproject.status : "planned",
      updatedAgo: "Just now",
      agentName: subproject.agentName?.trim() || `${project.name} Planner`,
      agentBrief: subproject.agentBrief?.trim() || "Uses the project brief and system prompt to plan the MVP.",
      preview: {
        eyebrow: "Subproject preview",
        title: subproject.title?.trim() || `Subproject ${subprojectIndex + 1}`,
        subtitle: subproject.goal?.trim() || "Focused MVP milestone",
        accent: ["from-[#667eea] to-[#764ba2]", "from-[#f093fb] to-[#f5576c]", "from-[#4facfe] to-[#00f2fe]", "from-[#43e97b] to-[#38f9d7]"][subprojectIndex % 4],
        cards: tasks.slice(0, 3).map((task) => task.title),
      },
      tasks,
    };
  });

  const buildOrder = subprojects.map((subproject, index) => ({
    id: `order-${subproject.id}`,
    sequence: index + 1,
    title: payload.buildOrder?.[index]?.title?.trim() || `Build ${subproject.title}`,
    summary: payload.buildOrder?.[index]?.summary?.trim() || subproject.goal,
    subprojectId: subproject.id,
    taskIds: subproject.tasks.map((task) => task.id),
  }));

  const plan = {
    id: `plan-${project.id}`,
    projectId: project.id,
    prompt,
    summary: payload.summary?.trim() || `Build the first useful MVP for ${project.name}.`,
    nextAction: payload.nextAction?.trim() || (subprojects[0]?.tasks[0]?.title ? `Start with ${subprojects[0].tasks[0].title}.` : "Generate the first build step."),
    projectPreview: {
      eyebrow: "Full project preview",
      title: payload.projectPreview?.title?.trim() || `${project.name} MVP`,
      subtitle: payload.projectPreview?.subtitle?.trim() || payload.summary?.trim() || project.description,
      accent: payload.projectPreview?.accent?.trim() || "from-[#171717] via-[#252525] to-[#5a4a2d]",
      cards: Array.isArray(payload.projectPreview?.cards) && payload.projectPreview.cards.length > 0
        ? payload.projectPreview.cards.slice(0, 4)
        : subprojects.slice(0, 4).map((subproject) => subproject.title),
    },
    buildOrder,
    subprojects,
  };

  const doneCount = subprojects.reduce((n, sp) => n + sp.tasks.filter((t) => t.status === "done").length, 0);
  const totalCount = subprojects.reduce((n, sp) => n + sp.tasks.length, 0);
  const aiSummary = doneCount > 0
    ? payload.summary?.trim() || `I analyzed ${project.name} and found ${doneCount} of ${totalCount} tasks already complete.`
    : payload.summary?.trim() || `I created an MVP plan for ${project.name}.`;
  const conversation = [
    {
      id: `msg-user-${project.id}-${timestamp}`,
      from: "Cameron",
      initials: "CM",
      text: prompt,
      time: formatTimeShort(timestamp),
      isMine: true,
    },
    {
      id: `msg-ai-${project.id}-${timestamp}`,
      from: "Project Manager",
      initials: "✦",
      text: aiSummary,
      time: formatTimeShort(timestamp),
      isAI: true,
    },
  ];

  const taskThreads = subprojects.flatMap((subproject) => subproject.tasks.map((task) => ({
    id: `thread-${task.id}`,
    taskId: task.id,
    subprojectId: subproject.id,
    subprojectTitle: subproject.title,
    title: `${task.title} kickoff`,
    agentName: subproject.agentName,
    updatedAgo: "Just now",
    summary: task.note,
    purpose: task.note,
    sessionType: "task",
    systemPromptMarkdown: project.dashboard?.systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN,
    contextMarkdown: "",
    contextFilePath: null,
    lastModel: null,
    attachedFiles: [],
    messages: [],
  })));

  const activityTitle = doneCount > 0 ? "Project analysis complete" : "MVP plan generated";
  const activityDescription = doneCount > 0
    ? `Analyzed ${project.name}: ${doneCount}/${totalCount} tasks done across ${subprojects.length} subproject${subprojects.length === 1 ? "" : "s"}.`
    : `Created ${subprojects.length} subproject${subprojects.length === 1 ? "" : "s"} for ${project.name}.`;
  const activity = [
    {
      id: `activity-${project.id}-${timestamp}`,
      type: "build",
      title: activityTitle,
      description: activityDescription,
      actor: "CodeBuddy",
      actorInitials: "CB",
      time: formatRelativeTime(timestamp),
    },
  ];

  return {
    plan,
    conversation,
    taskThreads,
    activity,
    artifacts: [],
    channels: [],
    directMessages: [],
    lastPlanGeneratedAt: formatProjectTimestamp(timestamp),
  };
}

function findTaskPlanContext(project, taskId) {
  const subprojects = project.dashboard?.plan?.subprojects ?? [];

  for (const subproject of subprojects) {
    const task = (subproject.tasks ?? []).find((entry) => entry.id === taskId);
    if (task) {
      return { subproject, task };
    }
  }

  return null;
}

function buildConversationTranscript(messages = []) {
  return messages
    .map((message) => `${message.from || "User"} (${message.time || "Now"}): ${message.text || ""}`)
    .join("\n\n");
}

function buildRecentConversationTranscript(messages = [], limit = FOLLOW_UP_TRANSCRIPT_LIMIT) {
  return buildConversationTranscript(messages.slice(-limit));
}

/**
 * Estimate the char count of a set of messages as they'd appear in a prompt transcript.
 */
function estimateTranscriptChars(messages = []) {
  return messages.reduce((sum, m) => sum + (m.text?.length || 0) + 40, 0); // +40 for header
}

function isMissingCommandError(error, commandName) {
  const message = error?.message || "";
  return message.includes("ENOENT") && (!commandName || message.includes(commandName));
}

function normalizeRelativeCheckpointPath(relativePath) {
  return relativePath.replace(/\\/g, "/");
}

function parseGithubRepoSlug(remoteUrl) {
  const value = String(remoteUrl || "").trim();
  if (!value) {
    return null;
  }

  const sshMatch = value.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== "github.com") {
      return null;
    }

    const slug = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/i, "");
    return slug || null;
  } catch {
    return null;
  }
}

function normalizeGitHubDeleteError(error, githubCli) {
  if (isMissingCommandError(error, githubCli)) {
    return "GitHub CLI is not installed or not available to CodeBuddy, so the GitHub repo could not be deleted.";
  }

  const stderr = error?.stderr?.trim?.() || "";
  const message = error?.message || "";
  const combined = [stderr, message].filter(Boolean).join("\n");

  if (combined.includes("delete_repo") || combined.includes("HTTP 403") || combined.includes("Must have admin rights to Repository")) {
    return "The GitHub repo wasn't deleted because the CLI doesn't have delete_repo permission. Run `gh auth refresh -h github.com -s delete_repo` in a terminal to grant it. The project was still removed from CodeBuddy.";
  }

  return stderr || message || "Unable to delete the GitHub repository.";
}

function getGithubCreateFallbackMessage(error, githubCli) {
  if (isMissingCommandError(error, githubCli)) {
    return "Project created locally. GitHub can be connected later from the project workspace.";
  }

  const stderr = error?.stderr?.trim?.() || "";
  const message = error?.message || "";
  const combined = [stderr, message].filter(Boolean).join("\n");

  if (combined.includes("Name already exists on this account") || combined.includes("createRepository")) {
    return "Project created locally. A GitHub repository with that name already exists on this account, so GitHub setup was skipped.";
  }

  return null;
}

function shouldSkipCheckpointPath(relativePath) {
  const normalized = normalizeRelativeCheckpointPath(relativePath);
  if (!normalized) {
    return false;
  }

  if (normalized === ".codebuddy/checkpoints" || normalized.startsWith(".codebuddy/checkpoints/")) {
    return true;
  }

  // Check every segment, not just the root — node_modules inside subdirs must also be skipped
  const segments = normalized.split("/");
  for (const segment of segments) {
    if (CHECKPOINT_EXCLUDED_ROOTS.has(segment)) {
      return true;
    }
  }
  return false;
}

async function collectCheckpointFiles(rootPath, currentPath = rootPath, filePaths = []) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = normalizeRelativeCheckpointPath(path.relative(rootPath, absolutePath));

    if (shouldSkipCheckpointPath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectCheckpointFiles(rootPath, absolutePath, filePaths);
      continue;
    }

    if (entry.isFile()) {
      filePaths.push(relativePath);
    }
  }

  return filePaths;
}

function buildProjectManagerContextMarkdown(project) {
  const subprojects = project.dashboard?.plan?.subprojects ?? [];
  const buildOrder = project.dashboard?.plan?.buildOrder ?? [];

  const sections = [
    `# ${project.name} Project Manager Context`,
    "",
    "## Role",
    "You are the shared project manager agent for this CodeBuddy workspace.",
    "",
    "## Project",
    `- Name: ${project.name}`,
    `- Description: ${project.description || "No project description provided."}`,
    `- Repository: ${project.repoPath}`,
    `- Stage: ${project.stage || "Planning"}`,
    "",
    "## System Prompt",
    project.dashboard?.systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN,
    "",
  ];

  if (project.dashboard?.plan?.summary) {
    sections.push("## Current Plan Summary");
    sections.push(project.dashboard.plan.summary);
    sections.push("");
  }

  if (project.dashboard?.plan?.nextAction) {
    sections.push("## Next Action");
    sections.push(project.dashboard.plan.nextAction);
    sections.push("");
  }

  if (buildOrder.length > 0) {
    sections.push("## Build Order");
    buildOrder.forEach((step, index) => {
      sections.push(`${index + 1}. ${step.title}: ${step.summary}`);
    });
    sections.push("");
  }

  if (subprojects.length > 0) {
    sections.push("## Subprojects");
    subprojects.forEach((subproject) => {
      sections.push(`### ${subproject.title}`);
      sections.push(`Goal: ${subproject.goal}`);
      sections.push(`Agent: ${subproject.agentName || "Task agent"}`);
      sections.push("");
      (subproject.tasks ?? []).forEach((task) => {
        sections.push(`- ${task.title} [${task.status}]`);
        sections.push(`  Purpose: ${task.note}`);
        sections.push(`  Owner: ${task.owner}`);
        sections.push(`  Starting prompt: ${task.startingPrompt}`);
      });
      sections.push("");
    });
  }

  return sections.join("\n").trim();
}

function buildTaskThreadContextMarkdown(project, thread) {
  const taskContext = findTaskPlanContext(project, thread.taskId);
  const task = taskContext?.task;
  const subproject = taskContext?.subproject;
  const transcript = buildConversationTranscript(thread.messages ?? []);

  const sections = [
    `# ${task?.title || thread.title} Task Agent Context`,
    "",
    "## Session Role",
    "You are the shared task agent for this one task inside CodeBuddy. Continue the existing work instead of starting over.",
    "",
    "## Project",
    `- Name: ${project.name}`,
    `- Description: ${project.description || "No project description provided."}`,
    `- Repository: ${project.repoPath}`,
    `- Overall plan summary: ${project.dashboard?.plan?.summary || "No plan summary yet."}`,
    "",
    "## Task Scope",
    `- Task: ${task?.title || thread.title}`,
    `- Subproject: ${subproject?.title || thread.subprojectTitle || "Unknown subproject"}`,
    `- Purpose relative to the project: ${thread.purpose || task?.note || thread.summary || "Deliver the assigned task cleanly and keep it aligned with the project plan."}`,
    `- Owner: ${task?.owner || "Project Manager"}`,
    `- Reviewer: ${task?.reviewer || "Cameron"}`,
    `- Due date: ${task?.dueDate || "Not set"}`,
    `- Starting prompt: ${task?.startingPrompt || "No starting prompt recorded."}`,
    "",
    "## Shared Agent Instructions",
    "- Treat this as the same continuing task session across teammates.",
    "- Preserve previous decisions unless the user explicitly changes them.",
    "- Stay focused on this task's role in the larger project.",
    "- When relevant, reference the repository context and attached files provided by the user.",
    "",
    "## System Prompt",
    thread.systemPromptMarkdown || project.dashboard?.systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN,
    "",
  ];

  if (Array.isArray(thread.attachedFiles) && thread.attachedFiles.length > 0) {
    sections.push("## Recently Attached Files");
    thread.attachedFiles.forEach((filePath) => sections.push(`- ${filePath}`));
    sections.push("");
  }

  if (transcript) {
    sections.push("## Conversation Transcript");
    sections.push(transcript);
    sections.push("");
  }

  return sections.join("\n").trim();
}

async function syncSharedAgentContextFiles(project) {
  const baseAgentDirectory = path.join(project.repoPath, ".codebuddy", "agents");
  const tasksDirectory = path.join(baseAgentDirectory, "tasks");
  await fs.mkdir(tasksDirectory, { recursive: true });

  const projectManagerContextPath = path.join(baseAgentDirectory, "project-manager.md");
  const projectManagerContextMarkdown = buildProjectManagerContextMarkdown(project);
  await fs.writeFile(projectManagerContextPath, `${projectManagerContextMarkdown}\n`, "utf8");

  const updatedTaskThreads = await Promise.all((project.dashboard?.taskThreads ?? []).map(async (thread) => {
    const contextMarkdown = buildTaskThreadContextMarkdown(project, thread);
    const contextFilePath = path.join(tasksDirectory, `${sanitizeFileSegment(thread.taskId || thread.id)}.md`);
    await fs.writeFile(contextFilePath, `${contextMarkdown}\n`, "utf8");

    return {
      ...thread,
      contextMarkdown,
      contextFilePath: path.relative(project.repoPath, contextFilePath).replace(/\\/g, "/"),
      systemPromptMarkdown: thread.systemPromptMarkdown || project.dashboard?.systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN,
    };
  }));

  return {
    ...project,
    dashboard: {
      ...project.dashboard,
      projectManagerContextMarkdown,
      projectManagerContextPath: path.relative(project.repoPath, projectManagerContextPath).replace(/\\/g, "/"),
      taskThreads: updatedTaskThreads,
    },
  };
}

function buildTaskResponseSummary(prompt, responseText, taskTitle) {
  const trimmedResponse = responseText.trim();
  if (trimmedResponse) {
    return trimmedResponse.split(/\r?\n/).find(Boolean)?.slice(0, 180) || trimmedResponse.slice(0, 180);
  }

  return `Continued work on ${taskTitle || "the selected task"} after: ${prompt.slice(0, 120)}`;
}

function normalizeTaskStatusValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return ["planned", "building", "review", "done"].includes(normalized) ? normalized : null;
}

function deriveSubprojectStatus(tasks = []) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return "planned";
  }

  if (tasks.every((task) => task.status === "done")) {
    return "done";
  }

  if (tasks.some((task) => task.status === "building")) {
    return "building";
  }

  if (tasks.some((task) => task.status === "review")) {
    return "review";
  }

  if (tasks.some((task) => task.status === "done")) {
    return "building";
  }

  return "planned";
}

function updateTaskStatusInPlan(plan, taskId, nextStatus, timestamp = Date.now()) {
  if (!plan || !Array.isArray(plan.subprojects)) {
    return {
      changed: false,
      plan,
      previousStatus: null,
      nextStatus: normalizeTaskStatusValue(nextStatus),
      taskTitle: null,
      subprojectTitle: null,
    };
  }

  const normalizedStatus = normalizeTaskStatusValue(nextStatus);
  if (!normalizedStatus) {
    return {
      changed: false,
      plan,
      previousStatus: null,
      nextStatus: null,
      taskTitle: null,
      subprojectTitle: null,
    };
  }

  let changed = false;
  let previousStatus = null;
  let taskTitle = null;
  let subprojectTitle = null;

  const nextSubprojects = plan.subprojects.map((subproject) => {
    let subprojectChanged = false;
    const nextTasks = (subproject.tasks ?? []).map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      taskTitle = task.title;
      subprojectTitle = subproject.title;
      previousStatus = task.status;

      if (task.status === normalizedStatus) {
        return task;
      }

      changed = true;
      subprojectChanged = true;
      return {
        ...task,
        status: normalizedStatus,
      };
    });

    if (!subprojectChanged) {
      return subproject;
    }

    return {
      ...subproject,
      updatedAgo: formatRelativeTime(timestamp),
      status: deriveSubprojectStatus(nextTasks),
      tasks: nextTasks,
    };
  });

  if (!changed) {
    return {
      changed: false,
      plan,
      previousStatus,
      nextStatus: normalizedStatus,
      taskTitle,
      subprojectTitle,
    };
  }

  return {
    changed: true,
    plan: {
      ...plan,
      subprojects: nextSubprojects,
    },
    previousStatus,
    nextStatus: normalizedStatus,
    taskTitle,
    subprojectTitle,
  };
}

function extractTaskAgentMetadata(rawOutput) {
  const text = String(rawOutput || "").trim();
  const statusMatch = text.match(/^TASK_STATUS:\s*(planned|building|review|done)\s*$/im);
  const reasonMatch = text.match(/^TASK_STATUS_REASON:\s*(.+)\s*$/im);
  const cleanedOutput = text
    .replace(/^TASK_STATUS:\s*(planned|building|review|done)\s*$/gim, "")
    .replace(/^TASK_STATUS_REASON:\s*(.+)\s*$/gim, "")
    .trim();

  return {
    cleanedOutput,
    taskStatus: statusMatch?.[1]?.trim()?.toLowerCase() || null,
    taskStatusReason: reasonMatch?.[1]?.trim() || null,
  };
}

// ── Shared summary-synthesis instruction — appended to every agent prompt ──
// The model produces BOTH the raw work AND a user-facing summary in one run.
const RESPONSE_SUMMARY_INSTRUCTIONS = [
  "",
  "=== RESPONSE SUMMARY REQUIREMENT ===",
  "After you finish ALL of your work (reasoning, tool use, code changes, explanations),",
  "you MUST end your response with a dedicated summary section.",
  "",
  "Write a markdown heading: ## Summary",
  "Under it, write a short, clear, non-technical digest of what happened and what the user should know.",
  "Rules for the summary:",
  "- 2-6 sentences maximum. Be concise.",
  "- Written for a non-technical user who will NOT read the full response above.",
  "- State what was done, what changed, and any immediate next steps.",
  "- Do NOT repeat raw code, file paths, or tool output in the summary.",
  "- Do NOT include reasoning, investigation details, or intermediate steps.",
  "- The summary must stand alone as a complete answer.",
  "- If the task is not finished, briefly explain what is left.",
  "",
  "The ## Summary section must appear AFTER all of your work but BEFORE any TASK_STATUS metadata lines.",
  "If the response also has a '## Attention User Input Required' section, put Summary BEFORE that section.",
  "You MUST always include ## Summary — never skip it.",
  "=== END RESPONSE SUMMARY REQUIREMENT ===",
  "",
].join("\n");

function buildTaskAgentSystemPrompt(taskContext, thread) {
  return [
    "You are a hands-on task agent inside CodeBuddy — a desktop coding workspace that keeps everything native to the platform.",
    "Do the task work and reply like a collaborator in chat.",
    "Do not output JSON unless the user explicitly asks for JSON.",
    "Prefer short sections, bullets, and concrete next steps over schemas or machine-formatted objects.",
    "Use readable markdown-style formatting with blank lines between sections.",
    "Do not compress the whole answer into one paragraph.",
    "When you list ideas, put each item on its own line.",
    "Assume the user is non-technical and avoid unnecessary jargon.",
    "Use this default response structure unless the user asks for something else: ## What I did, ## Recommended next steps, ## Move to the next task when.",
    "",
    "CRITICAL — CodeBuddy Platform Rules:",
    "CodeBuddy is a self-contained desktop coding workspace. EVERYTHING must stay native inside CodeBuddy.",
    "CodeBuddy RUNS ON PORT 3000. You are executing inside CodeBuddy. NEVER kill, stop, or interfere with port 3000 or any Electron process — doing so will crash the app.",
    "- CodeBuddy has a built-in TERMINAL panel where users can run any shell commands (npm, python, cargo, etc.).",
    "- CodeBuddy has a built-in LIVE PREVIEW panel that shows web apps running on localhost.",
    "- CodeBuddy has a built-in file editor, Git integration, and project management dashboard.",
    "- When you need the user to run a command, tell them to use the Terminal tab in the right panel.",
    "- When you need the user to view their app, tell them to use the Preview tab in the right panel.",
    "- NEVER tell the user to open VS Code, an external terminal, a browser, or any other external tool.",
    "- NEVER instruct the user to run 'code .', 'explorer', 'open', or launch any external application.",
    "- NEVER tell the user to 'open localhost in your browser' — the Preview panel handles this natively.",
    "- NEVER suggest the user leave CodeBuddy to do anything. All coding, running, testing, and previewing happens here.",
    "- NEVER kill processes, stop ports, or run taskkill/Stop-Process/kill/pkill — this can crash CodeBuddy.",
    "- If port 3000 is in use, that IS CodeBuddy — use a different port (e.g. 3001) for any dev server.",
    "- If a task requires running scripts, building, or testing — guide them to use CodeBuddy's Terminal tab.",
    "- All file creation, editing, and management happens through CodeBuddy — never suggest creating files externally.",
    "- Think of CodeBuddy as a complete IDE replacement — terminal, preview, editor, and project management in one.",
    "",
    "IMPORTANT — README.md context:",
    "Before starting work, read README.md in the project root for full project context, architecture, and what has already been built.",
    "After completing your work, update the README.md to reflect what you built or changed. Add new sections, update the status, or document new features as appropriate.",
    "Keep the README accurate and useful for future task agents and the project owner.",
    "If the task is fully complete and the user can move on, say that clearly in the human-readable response.",
    "",
    "IMPORTANT — User Input Required:",
    "If your response requires the user to provide anything (API keys, credentials, tokens, environment variables, configuration values, account sign-ups, or any other manual input), you MUST end your response with a clearly separated section:",
    "",
    "---",
    "## Attention User Input Required",
    "Then list each item the user needs to provide, explain what it is, and give clear steps on how to obtain it.",
    "This section MUST ALWAYS be the very last thing in your response (before the Summary and TASK_STATUS metadata lines), with no other content after it except Summary and TASK_STATUS.",
    "If no user input is required, do not include this section at all.",
    "",
    RESPONSE_SUMMARY_INSTRUCTIONS,
    "",
    "End EVERY reply with exactly one metadata line: TASK_STATUS: planned, TASK_STATUS: building, TASK_STATUS: review, or TASK_STATUS: done.",
    "Optionally add a second line: TASK_STATUS_REASON: <short reason>.",
    "Those metadata lines must be the VERY LAST lines in the reply (after ## Summary).",
    "",
    `Task title: ${taskContext?.task?.title || thread?.title || "Current task"}`,
    `Task note: ${taskContext?.task?.note || thread?.purpose || "No task note provided."}`,
    `Subproject: ${taskContext?.subproject?.title || thread?.subprojectTitle || "Current subproject"}`,
  ].join("\n");
}

function formatJsonLikeTaskResponse(rawOutput) {
  const trimmed = String(rawOutput || "").trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return trimmed;
  }

  try {
    const parsed = parseJsonObjectFromText(trimmed);
    const sections = [];

    if (typeof parsed?.summary === "string" && parsed.summary.trim()) {
      sections.push(parsed.summary.trim());
    }

    if (Array.isArray(parsed?.subprojects) && parsed.subprojects.length > 0) {
      const taskLines = parsed.subprojects.flatMap((subproject) => {
        const subprojectTitle = typeof subproject?.name === "string"
          ? subproject.name.trim()
          : typeof subproject?.title === "string"
            ? subproject.title.trim()
            : "Workstream";
        const tasks = Array.isArray(subproject?.tasks) ? subproject.tasks : [];
        if (tasks.length === 0) {
          return [`- ${subprojectTitle}`];
        }

        return tasks.slice(0, 4).map((task) => {
          const title = typeof task?.title === "string" ? task.title.trim() : "Next step";
          const notes = typeof task?.notes === "string"
            ? task.notes.trim()
            : typeof task?.note === "string"
              ? task.note.trim()
              : "";
          return `- ${subprojectTitle}: ${title}${notes ? ` - ${notes}` : ""}`;
        });
      });

      if (taskLines.length > 0) {
        sections.push(["Here is the current task breakdown:", ...taskLines].join("\n"));
      }
    }

    if (sections.length > 0) {
      return sections.join("\n\n");
    }
  } catch {
    // Keep the original text if it is not valid JSON-like output.
  }

  return trimmed;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function createProjectService({ app, settingsService, toolingService, p2pService, sharedStateService }) {
  const BUILD_TAG = "v106-windows";
  console.log(`[project-service] loaded — build ${BUILD_TAG}`);
  let eventSender = null;

  /** Base directory for all checkpoint storage (outside project repos). */
  function getCheckpointBase(projectId) {
    return path.join(app.getPath("userData"), "checkpoints", projectId);
  }

  function emitAgentEvent(channel, payload) {
    eventSender?.(channel, {
      timestamp: Date.now(),
      ...payload,
    });
  }

  /** Broadcast a single AI token to P2P peers (best-effort, non-blocking). */
  function broadcastTokenToP2P(requestMeta, text) {
    try {
      if (p2pService && typeof p2pService.broadcastChatToken === "function") {
        const projectId = requestMeta?.projectId || "unknown";
        const conversationId = requestMeta?.threadId || requestMeta?.taskId || requestMeta?.scope || "unknown";
        p2pService.broadcastChatToken(projectId, conversationId, text, requestMeta?.scope || "unknown", {
          taskId: requestMeta?.taskId || null,
          taskName: requestMeta?.taskName || null,
          sessionId: requestMeta?.sessionId || null,
          sessionTitle: requestMeta?.sessionTitle || null,
        });
      }
    } catch (_) { /* swallow — P2P is best-effort */ }
  }

  /** Broadcast a completed AI message to P2P peers (best-effort, non-blocking). */
  function broadcastMessageToP2P(projectId, conversationId, message, scope) {
    try {
      if (p2pService && typeof p2pService.broadcastChatMessage === "function") {
        p2pService.broadcastChatMessage(projectId, conversationId, message, scope);
      }
    } catch (_) { /* swallow */ }
  }

  /** Broadcast a task/agent state change to P2P peers (best-effort, non-blocking). */
  function broadcastStateToP2P(projectId, category, id, data) {
    try {
      if (p2pService && typeof p2pService.broadcastStateChange === "function") {
        p2pService.broadcastStateChange(projectId, category, id, data);
      }
    } catch (_) { /* swallow */ }
  }

  /** Save a conversation to .codebuddy/conversations/ (best-effort, non-blocking). */
  async function saveConversationToSharedState(repoPath, conversationId, data) {
    try {
      if (sharedStateService && typeof sharedStateService.saveConversation === "function") {
        await sharedStateService.saveConversation(repoPath, conversationId, data);
      }
    } catch (_) { /* swallow — shared state is best-effort */ }
  }

  /**
   * Save an agent context snapshot to .codebuddy/agents/context/<scope>-<id>.json
   * so peer machines can load prior agent knowledge when continuing the same task/session.
   */
  async function saveAgentContextSnapshot(repoPath, { scope, id, projectId, taskTitle, prompt, responseText, model, messages, attachedFiles }) {
    try {
      if (!sharedStateService || !repoPath) return;
      const snapshotId = `${scope}-${id}`;
      const recentMessages = (messages || []).slice(-12).map(m => ({
        from: m.from,
        text: (m.text || "").slice(0, 800),
        isAI: !!m.isAI,
        isMine: !!m.isMine,
      }));
      const snapshot = {
        id: snapshotId,
        scope,
        projectId,
        taskTitle: taskTitle || null,
        lastPrompt: (prompt || "").slice(0, 500),
        lastResponseSummary: (responseText || "").slice(0, 1200),
        model: model || "auto",
        messageCount: (messages || []).length,
        recentMessages,
        attachedFiles: (attachedFiles || []).slice(0, 20),
        updatedAt: new Date().toISOString(),
        machineName: require("os").hostname(),
      };
      await sharedStateService.writeSharedFile(
        repoPath,
        `agents/context/${snapshotId}.json`,
        JSON.stringify(snapshot, null, 2)
      );
      console.log(`[shared-context] Saved agent context snapshot: ${snapshotId} (${recentMessages.length} recent messages)`);

      // Broadcast to P2P peers so they know context is available
      broadcastStateToP2P(projectId, "agent-context", snapshotId, {
        projectId,
        scope,
        id,
        snapshotId,
        taskTitle: taskTitle || null,
        messageCount: (messages || []).length,
        machineName: require("os").hostname(),
        updatedAt: snapshot.updatedAt,
      });
    } catch (err) {
      console.warn(`[shared-context] Failed to save context snapshot:`, err?.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Context compaction
  // Thresholds (chars):
  //   COMPACT_TRIGGER  — total chars in baseMessages before we compact
  //   COMPACT_TARGET   — desired chars after compaction (we keep this many recent chars)
  //   COMPACT_KEEP     — always keep at least this many recent messages verbatim
  // ---------------------------------------------------------------------------
  const COMPACT_TRIGGER = 20000;
  const COMPACT_KEEP    = 3;

  /**
   * If `messages` total chars exceeds COMPACT_TRIGGER, summarise the older portion
   * with a quick non-agent Claude call and return the compacted array.
   * Also persists the compacted array back to settings so future calls start leaner.
   *
   * @param {object[]} messages       — full message array for the thread
   * @param {object}   commands       — CLI commands from readConfiguredCommands
   * @param {string}   provider       — "claude" | "copilot" | "codex"
   * @param {string}   selectedModel  — model id
   * @param {string}   repoPath       — project repo dir (used as cwd for summary call)
   * @param {Function} onCompacted    — async callback(compactedMessages) to persist
   * @returns {object[]} — original or compacted message array
   */
  async function compactMessagesIfNeeded(messages, commands, provider, selectedModel, repoPath, onCompacted) {
    const totalChars = estimateTranscriptChars(messages);
    if (!messages || messages.length <= COMPACT_KEEP + 1) return messages;
    if (totalChars <= COMPACT_TRIGGER) return messages;

    const toCompact  = messages.slice(0, -COMPACT_KEEP);
    const toKeep     = messages.slice(-COMPACT_KEEP);
    const transcript = buildConversationTranscript(toCompact);

    console.log(`[compact] Triggered: ${totalChars} chars, compacting ${toCompact.length} messages (keeping last ${COMPACT_KEEP})`);

    const summaryPrompt = [
      "You are a technical summarizer for an AI coding assistant.",
      "Summarize the following conversation history concisely.",
      "Preserve: what was built/changed, decisions made, current state, any errors or blockers, passwords/tokens/env vars mentioned.",
      "Output plain text only. Maximum 400 words. No headings, no bullet points — just paragraphs.",
      "",
      "=== CONVERSATION TO SUMMARIZE ===",
      transcript,
      "=== END ===",
    ].join("\n");

    try {
      const summaryRaw = await runProviderCli(
        commands, provider, summaryPrompt,
        selectedModel, { agentMode: false },
        repoPath, null
      );
      const summaryText = (summaryRaw || "").trim();
      if (!summaryText) throw new Error("empty summary");

      const summaryMessage = {
        id: `compact-${Date.now()}`,
        from: "System",
        text: `[${toCompact.length} earlier messages compacted]\n\n${summaryText}`,
        time: formatTimeShort(Date.now()),
        isCompacted: true,
      };

      const compacted = [summaryMessage, ...toKeep];
      console.log(`[compact] Done. Reduced ${messages.length} messages → ${compacted.length}. New char estimate: ${estimateTranscriptChars(compacted)}`);

      // Persist so next call also starts with the compacted history
      if (typeof onCompacted === "function") {
        try {
          await onCompacted(compacted);
        } catch (persistErr) {
          console.warn("[compact] Failed to persist compacted messages:", persistErr.message);
        }
      }

      return compacted;
    } catch (err) {
      console.warn("[compact] Summarization failed, continuing with full context:", err.message);
      return messages;
    }
  }

  /**
   * Load the most recent peer agent context snapshot for a task/session.
   * Returns a formatted string to inject into the system prompt, or null.
   */
  async function loadPeerAgentContext(repoPath, scope, id) {
    try {
      if (!sharedStateService || !repoPath) return null;
      const snapshotId = `${scope}-${id}`;
      const result = await sharedStateService.readSharedFile(repoPath, `agents/context/${snapshotId}.json`);
      if (!result.exists || !result.content) return null;
      const snapshot = JSON.parse(result.content);
      if (!snapshot || !snapshot.recentMessages?.length) return null;

      // Only inject if the snapshot is from a different machine (peer context)
      const localHostname = require("os").hostname();
      const isPeer = snapshot.machineName && snapshot.machineName !== localHostname;

      const transcript = snapshot.recentMessages.map(m => {
        const role = m.isAI ? "Agent" : "User";
        return `${role}: ${m.text}`;
      }).join("\n\n");

      const sections = [
        `## Shared Agent Context${isPeer ? ` (from ${snapshot.machineName})` : ""}`,
        `Last updated: ${snapshot.updatedAt}`,
        `Total messages in session: ${snapshot.messageCount}`,
        snapshot.taskTitle ? `Task: ${snapshot.taskTitle}` : null,
        "",
        "### Recent conversation history from this session:",
        transcript,
        "",
        "Continue from where the previous session left off. Do not repeat completed work.",
      ].filter(Boolean).join("\n");

      console.log(`[shared-context] Loaded agent context for ${snapshotId} (${snapshot.recentMessages.length} messages, peer=${isPeer})`);
      return sections;
    } catch (err) {
      console.warn(`[shared-context] Failed to load context snapshot:`, err?.message);
      return null;
    }
  }

  // Build model ID sets dynamically from model-catalogs.json
  // so adding/removing models in the config file automatically updates routing.
  const _catalogs = toolingService.getModelCatalogs();
  const CLAUDE_CLI_MODEL_IDS = new Set((_catalogs.claude || []).map(m => m.id));
  const CODEX_CLI_MODEL_IDS = new Set((_catalogs.codex || []).map(m => m.id));

  /**
   * Determine which AI provider to route to based on feature flags and selected model.
   * Returns "claude", "copilot", or "codex".
   */
  function resolveProvider(settings, modelId) {
    const hasClaude = !!settings.featureFlags?.claudeCode;
    const hasCopilot = !!settings.featureFlags?.githubCopilotCli;
    const hasCodex = !!settings.featureFlags?.codexCli;

    // Single provider enabled
    if (hasClaude && !hasCopilot && !hasCodex) return "claude";
    if (hasCopilot && !hasClaude && !hasCodex) return "copilot";
    if (hasCodex && !hasClaude && !hasCopilot) return "codex";

    // Multiple enabled — determine from model ID
    if (CLAUDE_CLI_MODEL_IDS.has(modelId)) return "claude";
    if (CODEX_CLI_MODEL_IDS.has(modelId)) return "codex";
    if (hasCopilot) return "copilot";
    if (hasCodex) return "codex";
    return "claude";
  }

  /**
   * Build the CLI binary + args for a prompt invocation.
   * @param {object} commands — resolved output from readConfiguredCommands()
   * @param {string} provider — "claude", "copilot", or "codex"
   * @param {string} prompt — the full prompt text
   * @param {string} selectedModel — model ID to pass via --model
   * @param {object} opts — { agentMode: boolean, approvalMode: "auto"|"manual" }
   * @returns {{ cli: string, args: string[], manualApproval?: boolean }}
   */
  function buildCliInvocation(commands, provider, prompt, selectedModel, opts = {}) {
    const { agentMode = false, approvalMode = "auto" } = opts;
    // manualApproval: only relevant in agent mode; uses -p flag to free stdin for approval writes
    const manualApproval = agentMode && approvalMode === "manual";

    if (provider === "claude") {
      // Strategy:
      //   On Windows: always pass prompt via stdin (then close) to avoid ENAMETOOLONG
      //   regardless of approval mode — the Windows 32767-char command-line limit means
      //   large prompts passed via -p reliably fail.
      //   Claude Code in non-interactive (piped) mode does NOT read stdin for permission
      //   prompts — it checks isTTY and auto-denies when stdin is a pipe. Writing y/n to
      //   stdin after spawn has no effect. The only reliable way for Claude to write files
      //   in piped mode is --dangerously-skip-permissions.
      const useStdin = process.platform === "win32";

      const args = useStdin ? [] : ["-p", prompt];
      if (agentMode) {
        args.push("--add-dir", ".");
      }
      // Always skip permission prompts — interactive stdin-based approval does not work
      // when Claude is spawned as a child process with a piped (non-TTY) stdin.
      args.push("--dangerously-skip-permissions");
      // Use stream-json for real-time output (Claude buffers stdout in plain text mode)
      args.push("--output-format", "stream-json", "--verbose");
      if (selectedModel && selectedModel !== "auto") {
        args.push("--model", selectedModel);
      }
      if (useStdin) {
        return { cli: commands.claudeCli, args, stdinData: prompt, streamJson: true };
      }
      return { cli: commands.claudeCli, args, streamJson: true };
    }

    if (provider === "codex") {
      // codex exec -s workspace-write [--model <model>]
      // On Windows, long prompts with newlines cause EINVAL when passed as args
      // to .cmd files (Node.js CVE-2024-27980 security fix). Codex CLI reads
      // instructions from stdin when piped, so we pass the prompt via stdin.
      // NOTE: --model only works with API key auth (OPENAI_API_KEY). ChatGPT
      // OAuth users (codex login) must omit --model and use the server default.
      // The "default" model ID signals "omit --model".
      // NOTE: --full-auto overrides explicit -s flag in Codex v0.118.0,
      // and -s workspace-write silently falls back to read-only.
      // Use -s danger-full-access for auto mode; workspace-write for manual approval mode.
      const safetyMode = manualApproval ? "workspace-write" : "danger-full-access";
      const args = ["exec", "-s", safetyMode, "--json", "--ephemeral"];
      if (selectedModel && selectedModel !== "auto" && selectedModel !== "default") {
        args.push("--model", selectedModel);
      }

      // On Windows, codex.cmd is a batch wrapper that runs `node codex.js`.
      // Spawning .cmd files requires shell:true which makes cmd.exe fully buffer
      // stdout — zero data events fire until process exit (no live streaming).
      // Fix: resolve the actual JS entry point and spawn node directly.
      let cli = commands.codexCli;
      if (process.platform === "win32" && /\.cmd$/i.test(cli)) {
        const jsEntry = path.join(path.dirname(cli), "node_modules", "@openai", "codex", "bin", "codex.js");
        if (fsSync.existsSync(jsEntry)) {
          return { cli: "node", args: [jsEntry, ...args], stdinData: prompt, codexJson: true };
        }
      }
      return { cli, args, stdinData: prompt, codexJson: true };
    }

    // Copilot
    // In manual approval mode: use -p flag so stdin stays open for approval writes.
    // In auto mode on Windows: pass prompt via stdin to avoid ENAMETOOLONG on long prompts.
    const copilotUseStdin = !manualApproval && process.platform === "win32";
    const args = copilotUseStdin ? [...commands.copilotPrefix] : [...commands.copilotPrefix, "-p", prompt];
    if (agentMode) {
      // In auto mode allow all tools; in manual mode Copilot will pause for approvals
      if (!manualApproval) {
        args.push("--allow-all-tools");
      }
      args.push("--add-dir", ".");
    }
    args.push("--no-color", "-s");
    // Use JSONL output for structured tool-call events and streaming deltas
    args.push("--output-format", "json");
    if (selectedModel && selectedModel !== "auto") {
      args.push("--model", selectedModel);
    }
    if (copilotUseStdin) {
      return { cli: commands.copilotCli, args, stdinData: prompt, copilotJson: true };
    }
    return { cli: commands.copilotCli, args, copilotJson: true, manualApproval };
  }

  /**
   * Run a CLI provider with automatic retry for Codex ChatGPT authentication.
   * When codex fails with "not supported when using Codex with a ChatGPT account",
   * this retries without --model (letting the server pick its default model).
   */
  function classifyAgentError(err, provider, cli) {
    const msg = err?.message || "";
    const stderr = (err?.stderr || "").toLowerCase();
    const stdout = (err?.stdout || "").toLowerCase();
    const combined = `${msg} ${stderr} ${stdout}`.toLowerCase();
    const exitCode = err?.exitCode;

    const providerName = provider === "claude" ? "Claude" : provider === "codex" ? "Codex" : "Copilot";

    // Not installed
    if (isMissingCommandError(err, cli)) {
      const hints = {
        claude: "**Claude Code CLI not found.**\n\nInstall it:\n```\nnpm install -g @anthropic-ai/claude-code\n```\nThen authenticate:\n```\nclaude auth login\n```",
        copilot: "**GitHub Copilot CLI not found.**\n\nInstall it:\n```\ngh extension install github/gh-copilot\n```\nThen authenticate:\n```\ngh auth login\n```",
        codex: "**OpenAI Codex CLI not found.**\n\nInstall it:\n```\nnpm install -g @openai/codex\n```\nThen authenticate:\n```\ncodex login\n```",
      };
      return new Error(hints[provider] || `The ${provider} CLI was not found. Make sure it is installed and on your PATH.`);
    }

    // Permission denied on the binary itself
    if (msg.includes("EACCES") || combined.includes("permission denied")) {
      return new Error(`**${providerName} CLI: permission denied.**\n\nThe CLI binary could not be executed. Try:\n\`\`\`\nchmod +x "${cli}"\n\`\`\`\nor reinstall the CLI.`);
    }

    // Not authenticated / login required
    if (
      /not (logged in|authenticated|authorized|signed in)/i.test(combined) ||
      /login required|please log in|please sign in|authentication required|unauthenticated/i.test(combined) ||
      (provider === "claude" && /claude.*auth|no.*api.*key|invalid.*api.*key|anthropic.*auth/i.test(combined)) ||
      (provider === "copilot" && /gh auth|not authenticated|no github/i.test(combined)) ||
      (provider === "codex" && /openai.*auth|api.*key.*required|codex.*login/i.test(combined))
    ) {
      const loginCmd = provider === "claude" ? "claude auth login" : provider === "codex" ? "codex login" : "gh auth login";
      return new Error(`**${providerName} is not authenticated.**\n\nRun this in a terminal to sign in:\n\`\`\`\n${loginCmd}\n\`\`\``);
    }

    // Rate limited / quota exceeded
    if (/rate.?limit|too many requests|429|quota exceeded|insufficient.?credits/i.test(combined)) {
      return new Error(`**${providerName}: rate limit or quota exceeded.**\n\nWait a moment and try again, or check your usage limits in your ${providerName} account.`);
    }

    // Model not found / not available
    if (/model.*not found|model.*not.*available|unknown model|invalid model/i.test(combined)) {
      return new Error(`**${providerName}: selected model is not available.**\n\nTry switching to a different model in the composer.`);
    }

    // Context window / token limit exceeded
    if (/context.*length|token.*limit|too.*long|maximum.*tokens|prompt.*too/i.test(combined)) {
      return new Error(`**${providerName}: conversation too long for this model's context window.**\n\nUse the **Compact** button to summarise older messages, or start a new session.`);
    }

    // Network / connectivity
    if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|network|no internet|connection refused|could not connect|timeout|ETIMEDOUT/i.test(combined)) {
      return new Error(`**${providerName}: network connection failed.**\n\nCheck your internet connection and try again.`);
    }

    // Non-zero exit with stderr content — surface it clearly
    if (exitCode != null && exitCode !== 0) {
      const detail = (err.stderr || "").trim() || (err.stdout || "").trim();
      const detailBlock = detail ? `\n\`\`\`\n${detail.slice(0, 600)}\n\`\`\`` : "";
      return new Error(`**${providerName} exited with code ${exitCode}.**${detailBlock}\n\nIf this keeps happening, open a terminal and run the CLI manually to see the full error.`);
    }

    return null; // No classification — let caller re-throw as-is
  }

  async function runProviderCli(commands, provider, prompt, selectedModel, opts, cwd, requestMeta) {
    const { cli, args, stdinData, streamJson, copilotJson, codexJson, manualApproval } = buildCliInvocation(commands, provider, prompt, selectedModel, opts);
    try {
      return await runProgram(cli, args, cwd, requestMeta, stdinData || null, streamJson || false, copilotJson || false, codexJson || false, manualApproval || false);
    } catch (err) {
      const errText = `${err.stderr || ""} ${err.stdout || ""} ${err.message || ""}`;
      if (provider === "codex" && selectedModel !== "default" && /not supported when using Codex with a ChatGPT account/i.test(errText)) {
        console.log("[runProviderCli] Codex ChatGPT model error — retrying without --model flag");
        emitAgentEvent("project:agentOutput", {
          ...requestMeta,
          stream: "system",
          chunk: "\n⚠ Model not available with ChatGPT account — retrying with default model...\n",
        });
        const retry = buildCliInvocation(commands, provider, prompt, "default", opts);
        return await runProgram(retry.cli, retry.args, cwd, requestMeta, retry.stdinData || null, retry.streamJson || false, retry.copilotJson || false, retry.codexJson || false, retry.manualApproval || false);
      }
      const classified = classifyAgentError(err, provider, cli);
      throw classified || err;
    }
  }

  async function readConfiguredCommands() {
    // Refresh PATH from registry so tools installed after app launch are found
    await refreshSystemPath();

    const settings = await settingsService.readSettings();
    const configuredGit = settings.cliTools?.git || getCommandName("git");
    const configuredGithubCli = settings.cliTools?.githubCli || getCommandName("gh");

    async function resolveCommandPath(command) {
      if (await fileExists(command)) {
        return command;
      }

      for (const candidate of getKnownCommandLocations(command)) {
        if (await fileExists(candidate)) {
          return candidate;
        }
      }

      return command;
    }

    const ghPath = await resolveCommandPath(configuredGithubCli);
    let copilotPath = await resolveCommandPath("copilot");

    // Prefer standalone copilot.exe when available (faster startup).
    // Fall back to routing through `gh copilot --` which always works
    // as long as `gh` is installed and the copilot extension is present.
    let hasCopilotBinary = await fileExists(copilotPath);

    // If no standalone binary and Copilot is enabled, try to find or install it
    if (!hasCopilotBinary && settings.featureFlags?.githubCopilotCli !== false) {
      try {
        const installResult = await toolingService.installCopilot();
        if (installResult.success) {
          await refreshSystemPath();
          copilotPath = await resolveCommandPath("copilot");
          hasCopilotBinary = await fileExists(copilotPath);
          console.log(`[cli-install] copilot installed: ${hasCopilotBinary}`);
        } else {
          console.warn("[cli-install] copilot install failed (install strategies exhausted)");
        }
      } catch (installErr) {
        console.error("[cli-install] copilot install threw:", installErr.message);
      }
    }

    // Resolve Claude CLI binary
    let claudePath = await resolveCommandPath("claude");
    const hasClaudeBinary = await fileExists(claudePath);

    // Resolve Codex CLI binary
    let codexPath = await resolveCommandPath("codex");
    const hasCodexBinary = await fileExists(codexPath);

    const resolved = {
      settings,
      git: await resolveCommandPath(configuredGit),
      githubCli: ghPath,
      copilotCli: hasCopilotBinary ? copilotPath : ghPath,
      copilotPrefix: hasCopilotBinary ? [] : ["copilot"],
      claudeCli: hasClaudeBinary ? claudePath : "claude",
      hasClaudeBinary,
      codexCli: hasCodexBinary ? codexPath : "codex",
      hasCodexBinary,
    };

    console.log(`[cli-paths] copilot=${hasCopilotBinary ? "binary" : "gh-ext"} claude=${hasClaudeBinary ? "ok" : "missing"} codex=${hasCodexBinary ? "ok" : "missing"}`);

    return resolved;
  }

  async function createCheckpointSnapshot(repoPath, label, projectId) {
    const checkpointId = `checkpoint-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const checkpointRoot = path.join(getCheckpointBase(projectId), checkpointId);
    const filesRoot = path.join(checkpointRoot, "files");
    console.log(`[checkpoint] Collecting files from: ${repoPath} → ${checkpointRoot}`);
    const files = await collectCheckpointFiles(repoPath);
    console.log(`[checkpoint] Collected ${files.length} files for checkpoint "${label}"`);

    await fs.mkdir(filesRoot, { recursive: true });

    // Batch file copies to avoid EMFILE (too many open files)
    const BATCH_SIZE = 50;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (relativePath) => {
        const sourcePath = path.join(repoPath, relativePath);
        const targetPath = path.join(filesRoot, relativePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        const content = await fs.readFile(sourcePath);
        await fs.writeFile(targetPath, content);
      }));
    }

    const manifest = {
      id: checkpointId,
      label,
      repoPath,
      createdAt: new Date().toISOString(),
      files,
    };

    await fs.writeFile(path.join(checkpointRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    return manifest;
  }

  async function restoreCheckpointSnapshot(project, checkpointId, projectId) {
    // Try new location (userData) first, then fall back to legacy in-repo location
    let checkpointRoot = path.join(getCheckpointBase(projectId), checkpointId);
    let rawManifest = await fs.readFile(path.join(checkpointRoot, "manifest.json"), "utf8").catch(() => null);

    if (!rawManifest) {
      // Fall back to legacy in-repo checkpoint location
      checkpointRoot = path.join(project.repoPath, ".codebuddy", "checkpoints", checkpointId);
      rawManifest = await fs.readFile(path.join(checkpointRoot, "manifest.json"), "utf8").catch(() => null);
    }

    if (!rawManifest) {
      throw new Error("Checkpoint not found.");
    }

    const manifest = JSON.parse(rawManifest);
    const snapshotFiles = Array.isArray(manifest.files) ? manifest.files.map((entry) => normalizeRelativeCheckpointPath(String(entry))) : [];
    const currentFiles = await collectCheckpointFiles(project.repoPath);

    await Promise.all(currentFiles
      .filter((relativePath) => !snapshotFiles.includes(relativePath))
      .map(async (relativePath) => {
        await fs.rm(path.join(project.repoPath, relativePath), { force: true });
      }));

    await Promise.all(snapshotFiles.map(async (relativePath) => {
      const sourcePath = path.join(checkpointRoot, "files", relativePath);
      const targetPath = path.join(project.repoPath, relativePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const content = await fs.readFile(sourcePath);
      await fs.writeFile(targetPath, content);
    }));

    return manifest;
  }

  /** Clean up stuck git state (index.lock, rebase-merge) so subsequent git commands succeed. */
  function cleanupGitState(repoPath) {
    const { execSync } = require("child_process");
    const fs = require("fs");
    const pathMod = require("path");
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };

    // Remove stale index.lock
    const indexLock = pathMod.join(repoPath, ".git", "index.lock");
    try {
      if (fs.existsSync(indexLock)) {
        fs.unlinkSync(indexLock);
      }
    } catch (e) { console.warn("[git-cleanup] Could not remove index.lock:", e.message); }

    // Abort stuck rebase
    const rebaseMerge = pathMod.join(repoPath, ".git", "rebase-merge");
    const rebaseApply = pathMod.join(repoPath, ".git", "rebase-apply");
    if (fs.existsSync(rebaseMerge) || fs.existsSync(rebaseApply)) {
      try {
        execSync("git rebase --abort", { cwd: repoPath, encoding: "utf8", env: gitEnv, stdio: "pipe", timeout: 15000 });
        console.log("[git-cleanup] Aborted stuck rebase.");
      } catch {
        // Force-remove the directory if rebase --abort itself fails
        try {
          if (fs.existsSync(rebaseMerge)) fs.rmSync(rebaseMerge, { recursive: true, force: true });
          if (fs.existsSync(rebaseApply)) fs.rmSync(rebaseApply, { recursive: true, force: true });
        } catch (e2) { console.warn("[git-cleanup] Could not remove rebase dirs:", e2.message); }
      }
    }

    // Abort stuck merge
    const mergeHead = pathMod.join(repoPath, ".git", "MERGE_HEAD");
    if (fs.existsSync(mergeHead)) {
      try {
        execSync("git merge --abort", { cwd: repoPath, encoding: "utf8", env: gitEnv, stdio: "pipe", timeout: 15000 });
        console.log("[git-cleanup] Aborted stuck merge.");
      } catch { /* ignore */ }
    }
  }

  /** Ensure the repo is on the codebuddy-build branch before running agents.
   *  If on a different branch, stash uncommitted changes, checkout, then pop. */
  function ensureOnCodebuddyBuild(repoPath) {
    const { execSync } = require("child_process");
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
    try {
      // Clean up any stuck git state first
      cleanupGitState(repoPath);

      const current = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath, encoding: "utf8", env: gitEnv }).trim();
      if (current === "codebuddy-build") return;
      const status = execSync("git status --porcelain", { cwd: repoPath, encoding: "utf8", env: gitEnv }).trim();
      let stashed = false;
      if (status) {
        try {
          execSync("git stash --include-untracked", { cwd: repoPath, encoding: "utf8", env: gitEnv, timeout: 30000 });
          stashed = true;
        } catch (stashErr) {
          // If stash fails (e.g. "could not write index"), try resetting the index and retrying
          console.warn(`[branch-guard] stash failed, attempting recovery: ${stashErr.message}`);
          cleanupGitState(repoPath);
          try {
            execSync("git reset", { cwd: repoPath, encoding: "utf8", env: gitEnv, timeout: 15000 });
            execSync("git stash --include-untracked", { cwd: repoPath, encoding: "utf8", env: gitEnv, timeout: 30000 });
            stashed = true;
          } catch {
            // Last resort: force checkout (may lose uncommitted changes but keeps us on the right branch)
            try {
              execSync("git checkout -f codebuddy-build", { cwd: repoPath, encoding: "utf8", env: gitEnv, timeout: 30000 });
              console.warn("[branch-guard] Force-switched to codebuddy-build (stash recovery failed).");
              return;
            } catch {
              try {
                execSync("git checkout -B codebuddy-build", { cwd: repoPath, encoding: "utf8", env: gitEnv, timeout: 30000 });
                console.warn("[branch-guard] Force-created codebuddy-build (stash recovery failed).");
                return;
              } catch (e) {
                console.error("[branch-guard] All recovery attempts failed:", e.message);
                return;
              }
            }
          }
        }
      }
      try {
        execSync("git checkout codebuddy-build", { cwd: repoPath, encoding: "utf8", env: gitEnv, timeout: 30000 });
      } catch {
        execSync("git checkout -b codebuddy-build", { cwd: repoPath, encoding: "utf8", env: gitEnv, timeout: 30000 });
      }
      if (stashed) {
        try {
          execSync("git stash pop", { cwd: repoPath, encoding: "utf8", env: gitEnv, timeout: 30000 });
        } catch {
          console.warn("[branch-guard] stash pop had conflicts — changes saved in stash.");
        }
      }
      console.log(`[branch-guard] Switched '${current}' → codebuddy-build.`);
    } catch (err) {
      console.error(`[branch-guard] Could not switch to codebuddy-build:`, err.message);
    }
  }

  let activeChildProcess = null;
  let activeRequestMeta = null;
  let activeRequestOutput = "";  // Accumulated stdout — persists across renderer navigation
  let activePendingApproval = null;  // Last approval request — survives renderer navigation

  function __setEventSender(sendEvent) {
    eventSender = sendEvent;
  }

  function cancelActiveRequest() {
    if (activeChildProcess && !activeChildProcess.killed) {
      emitAgentEvent("project:agentCancelled", {
        ...activeRequestMeta,
        message: "Stopped by user.",
      });
      // Close stdin before killing to prevent broken pipe errors in manual approval mode
      try { if (activeChildProcess.stdin && !activeChildProcess.stdin.destroyed) activeChildProcess.stdin.end(); } catch {}
      activeChildProcess.kill();
    }
    activeChildProcess = null;
    activeRequestMeta = null;
    activeRequestOutput = "";
  }

  /**
   * Write an approval or denial response to the active agent's stdin.
   * Used in manual approval mode when the user clicks Approve or Deny in the UI.
   * @param {boolean} approved — true to approve (writes "y\n"), false to deny (writes "n\n")
   */
  function sendToolApproval(approved = true) {
    if (!activeChildProcess || activeChildProcess.killed) {
      return { success: false, error: "No active agent process" };
    }
    if (!activeChildProcess.stdin || activeChildProcess.stdin.destroyed || activeChildProcess.stdin.writableEnded) {
      return { success: false, error: "Agent stdin is not available (likely in auto-approve mode)" };
    }
    try {
      const response = approved ? "y\n" : "n\n";
      activeChildProcess.stdin.write(response);
      activePendingApproval = null;  // Cleared once user responds
      console.log(`[sendToolApproval] Wrote "${approved ? "y" : "n"}" to agent stdin`);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** Force-reset agent state and clean up git. Used as a recovery mechanism. */
  function forceResetAgent(repoPath) {
    console.log("[forceResetAgent] Force-resetting agent state...");
    // Kill any active process
    if (activeChildProcess) {
      try {
        activeChildProcess.kill("SIGKILL");
      } catch { /* ignore */ }
    }
    activeChildProcess = null;
    activeRequestMeta = null;
    activeRequestOutput = "";

    // Clean up git state if repo path is provided
    if (repoPath) {
      try {
        cleanupGitState(repoPath);
        console.log("[forceResetAgent] Git state cleaned up.");
      } catch (e) {
        console.warn("[forceResetAgent] Git cleanup error:", e.message);
      }
    }

    // Emit cancellation event to reset any UI listening for agent state
    emitAgentEvent("project:agentCancelled", {
      message: "Force-reset by user.",
    });

    console.log("[forceResetAgent] Done.");
    return { success: true };
  }

  function getActiveRequest() {
    if (activeChildProcess && !activeChildProcess.killed && activeRequestMeta) {
      // Active request exists — caller will poll output; no need to log each poll.
      // Re-emit any pending approval so the renderer can restore the banner after navigation
      if (activePendingApproval) {
        setImmediate(() => emitAgentEvent("project:agentApprovalRequest", activePendingApproval));
      }
      return { ...activeRequestMeta, active: true, output: activeRequestOutput };
    }
    return null;
  }

  // Create a temporary directory with no-op wrapper scripts that shadow dangerous commands.
  // This directory is prepended to PATH so when the copilot CLI's built-in tools try to
  // run "code", "start", "explorer", etc., they find our harmless wrappers instead.
  let _safeCommandJailDir = null;
  function getSafeCommandJailDir() {
    const jailDir = path.join(os.tmpdir(), "codebuddy-cmd-jail");
    fsSync.mkdirSync(jailDir, { recursive: true });

    // Always (re)write wrappers so the list stays current across restarts
    if (process.platform === "win32") {
      // Create no-op .cmd wrappers for dangerous commands on Windows
      // NOTE: powershell/pwsh intentionally NOT blocked — Codex CLI uses
      // PowerShell for ALL shell execution. Blocking it causes
      // "batch file arguments are invalid" errors in the Rust binary.
      const dangerousCommands = [
        "code", "code-insiders",       // VS Code
        "explorer",                    // Windows Explorer
        "start",                       // Windows start (opens URLs, apps)
        "notepad", "notepad++",        // Text editors
        "vim", "nvim", "nano", "emacs",// Unix editors
        "open",                        // macOS open (just in case)
        "xdg-open",                    // Linux open
        "taskkill",                    // Process killer
      ];
      // Remove stale jail wrappers for commands no longer on the block list
      try {
        for (const f of fsSync.readdirSync(jailDir)) {
          const stem = f.replace(/\.(cmd|bat)$/i, "");
          if (!dangerousCommands.includes(stem)) {
            try { fsSync.unlinkSync(path.join(jailDir, f)); } catch {}
          }
        }
      } catch {}
      for (const cmd of dangerousCommands) {
        const cmdPath = path.join(jailDir, `${cmd}.cmd`);
        // Write a .cmd that does nothing and exits successfully
        fsSync.writeFileSync(cmdPath, "@echo off\r\nrem Blocked by CodeBuddy safety rules\r\nexit /b 0\r\n");
        // Also create a .exe-shadowing .cmd (Windows checks .cmd before looking further in PATH)
        const batPath = path.join(jailDir, `${cmd}.bat`);
        fsSync.writeFileSync(batPath, "@echo off\r\nrem Blocked by CodeBuddy safety rules\r\nexit /b 0\r\n");
      }
    } else {
      // Create no-op shell scripts for Unix
      const dangerousCommands = ["code", "code-insiders", "explorer", "open", "xdg-open", "vim", "nvim", "nano", "emacs", "kill", "pkill", "killall"];
      for (const cmd of dangerousCommands) {
        const scriptPath = path.join(jailDir, cmd);
        fsSync.writeFileSync(scriptPath, "#!/bin/sh\n# Blocked by CodeBuddy safety rules\nexit 0\n");
        fsSync.chmodSync(scriptPath, 0o755);
      }
    }

    _safeCommandJailDir = jailDir;
    return jailDir;
  }

  /**
   * Parse a Claude stream-json line into a human-readable text chunk.
   * Returns empty string for events that shouldn't be shown as live text.
   */
  function parseClaudeStreamJsonLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return "";
    let event;
    try { event = JSON.parse(trimmed); } catch { return ""; }

    if (event.type === "system" && event.subtype === "init") {
      return "Preparing context...\nWaiting for model response...\n";
    }

    if (event.type === "assistant" && event.message?.content) {
      const parts = [];
      for (const block of event.message.content) {
        if (block.type === "thinking" && block.thinking) {
          parts.push(block.thinking);
        } else if (block.type === "text" && block.text) {
          parts.push(block.text);
        } else if (block.type === "tool_use") {
          const name = block.name || "tool";
          const input = block.input || {};
          // Produce a human-readable action line
          if (name === "Read" && input.file_path) {
            parts.push(`Read ${input.file_path}\n`);
          } else if (name === "Write" && input.file_path) {
            parts.push(`Write ${input.file_path}\n`);
          } else if (name === "Edit" && input.file_path) {
            parts.push(`Edit ${input.file_path}\n`);
          } else if (name === "Bash" && input.command) {
            parts.push(`Run ${input.command}\n`);
          } else if (name === "Glob" && input.pattern) {
            parts.push(`Search files ${input.pattern}\n`);
          } else if (name === "Grep" && input.pattern) {
            parts.push(`Search for "${input.pattern}"\n`);
          } else {
            parts.push(`${name}\n`);
          }
        }
      }
      return parts.join("");
    }

    if (event.type === "result") {
      // The result event contains the final text — already emitted incrementally
      return "";
    }

    return "";
  }

  /**
   * Parse a Codex CLI --json line into a human-readable text chunk.
   * Returns empty string for events that shouldn't be shown as live text.
   *
   * Codex JSONL event types:
   *   thread.started, turn.started, turn.completed — session lifecycle (skip)
   *   item.completed  type=agent_message — model text
   *   item.started    type=command_execution — tool call start
   *   item.completed  type=command_execution — tool call result
   *   item.started    type=mcp_tool_call — MCP tool call start
   */
  function parseCodexJsonLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return "";
    let event;
    try { event = JSON.parse(trimmed); } catch { return ""; }

    const item = event.item;
    if (!item) return "";

    // Completed agent message — emit the text
    if (event.type === "item.completed" && item.type === "agent_message" && item.text) {
      return item.text + "\n";
    }

    // Command execution start — emit a human-readable action line
    if (event.type === "item.started" && item.type === "command_execution" && item.command) {
      // Strip the shell prefix (e.g. "C:\...\pwsh.exe" -Command '...')
      let cmd = item.command;
      const pwshMatch = cmd.match(/-Command\s+['"]?(.+?)['"]?$/i);
      if (pwshMatch) cmd = pwshMatch[1];
      return `\nRun ${cmd}\n`;
    }

    // MCP tool call start
    if (event.type === "item.started" && item.type === "mcp_tool_call" && item.tool) {
      return `\n${item.tool}\n`;
    }

    return "";
  }

  /**
   * Parse a Copilot CLI --output-format json line into a human-readable text chunk.
   * Returns empty string for events that shouldn't be shown as live text.
   */
  function parseCopilotJsonLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return "";
    let event;
    try { event = JSON.parse(trimmed); } catch { return ""; }

    // Streaming text chunks
    if (event.type === "assistant.message_delta" && event.data?.deltaContent) {
      return event.data.deltaContent;
    }

    // Tool execution start — emit human-readable action line
    if (event.type === "tool.execution_start" && event.data) {
      const name = event.data.toolName || "tool";
      const args = event.data.arguments || {};
      // Shorten absolute paths to just the filename when inside the working directory
      const shortPath = (p) => {
        if (!p) return p;
        const parts = p.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1];
      };
      if (name === "view" && args.path) return `\nRead ${shortPath(args.path)}\n`;
      if (name === "edit" && args.path) return `\nEdit ${shortPath(args.path)}\n`;
      if ((name === "write" || name === "create") && args.path) return `\nWrite ${shortPath(args.path)}\n`;
      if (name === "shell" && args.command) return `\nRun ${args.command}\n`;
      if (name === "glob" && args.pattern) return `\nSearch files ${args.pattern}\n`;
      if (name === "grep" && args.pattern) return `\nSearch for "${args.pattern}"\n`;
      if (name === "report_intent" && args.intent) return `\n${args.intent}\n`;
      if (name === "insert" && args.path) return `\nInsert into ${shortPath(args.path)}\n`;
      return `\n${name}\n`;
    }

    // Session error — surface rate-limit and other server errors in the live stream
    if (event.type === "session.error" && event.data?.message) {
      return `\n⚠ ${event.data.message}\n`;
    }

    return "";
  }

  async function runProgram(file, args, cwd, requestMeta = null, stdinData = null, streamJson = false, copilotJson = false, codexJson = false, manualApproval = false) {
    // Prevent copilot CLI from launching external editors/browsers
    // 1. Filter VS Code directories out of PATH
    // 2. Prepend a jail directory with no-op wrappers for dangerous commands
    // 3. Override all editor/browser environment variables
    // 4. Ensure known copilot binary locations are on PATH so gh can find them
    const pathSep = process.platform === "win32" ? ";" : ":";
    const originalPath = process.env.PATH || process.env.Path || "";

    // Add known copilot binary directories so gh copilot can find the binary
    const extraDirs = [];
    if (process.platform === "win32") {
      const localAppData = process.env.LOCALAPPDATA || "";
      const home = process.env.USERPROFILE || os.homedir();
      if (localAppData) {
        extraDirs.push(path.join(localAppData, "GitHub CLI", "copilot"));
        extraDirs.push(path.join(localAppData, "GitHub CLI", "extensions", "gh-copilot"));
      }
      if (home) {
        extraDirs.push(path.join(home, ".local", "share", "gh", "extensions", "gh-copilot"));
      }
    }
    const existingExtraDirs = extraDirs.filter((dir) => { try { return fsSync.statSync(dir).isDirectory(); } catch { return false; } });

    const combinedPath = [...existingExtraDirs, ...originalPath.split(pathSep)].join(pathSep);
    const filteredPath = combinedPath
      .split(pathSep)
      .filter((dir) => !/visual studio code|vscode|\.vscode/i.test(dir))
      .join(pathSep);
    const jailDir = getSafeCommandJailDir();
    const safePath = `${jailDir}${pathSep}${filteredPath}`;
    const safeEnv = {
      ...process.env,
      PATH: safePath,
      ...(process.platform === "win32" ? { Path: safePath } : {}),
      EDITOR: "cat",           // Prevent VS Code or other editors from being launched as $EDITOR
      VISUAL: "cat",           // Same for $VISUAL
      GIT_EDITOR: "cat",       // Prevent git from opening editors
      BROWSER: "echo",         // Prevent browser launch
      OPEN_BROWSER: "false",   // Prevent auto-open in CRA/Vite
      ELECTRON_NO_ATTACH_CONSOLE: "1",
      GIT_TERMINAL_PROMPT: "0", // Prevent git credential popups
    };
    const isCmdFile = process.platform === "win32" && /\.cmd$/i.test(file);
    const child = isCmdFile
      ? spawn(file, args, { cwd, windowsHide: true, env: safeEnv, shell: true, stdio: ["pipe", "pipe", "pipe"] })
      : spawn(file, args, { cwd, windowsHide: true, env: safeEnv, stdio: ["pipe", "pipe", "pipe"] });
    // If stdinData is provided (e.g. codex prompt), write it then close stdin.
    // In manual approval mode without stdinData: keep stdin OPEN so we can write approval
    // responses (y/n) as the agent pauses before each tool call.
    // Otherwise close stdin immediately so Claude CLI doesn't wait for piped input.
    if (child.stdin) {
      if (stdinData) {
        // Write prompt to stdin then close immediately so Claude can process and exit.
        try { child.stdin.write(stdinData); child.stdin.end(); } catch {}
      } else if (!manualApproval) {
        // Close stdin so the CLI doesn't wait for piped input.
        // In manual approval mode, keep stdin OPEN so y/n approval responses can be written
        // as the agent pauses before each tool call.
        try { child.stdin.end(); } catch {}
      }
    }
    activeChildProcess = child;
    activeRequestMeta = requestMeta;
    activeRequestOutput = "";  // Reset accumulated output for new request
    emitAgentEvent("project:agentStarted", {
      ...requestMeta,
      command: [file, ...args].join(" "),
      message: "Starting agent...",
    });
    // Codex exec: stdout contains ONLY the clean model response.
    // stderr contains all metadata (header, config, prompt echo, role markers, token count).
    // We suppress stderr for Codex to avoid dumping the prompt into the activity timeline.
    const isCodexExec = codexJson || (args.includes("exec") && (/codex/i.test(file) || args.some(a => /codex/i.test(a))));

    const result = await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let jsonLineBuffer = "";  // Buffer for stream-json line assembly

      // Keepalive: broadcast an empty token every 15s so the P2P peer stream
      // doesn't time out while the agent is running tools (no stdout during tool calls)
      const keepaliveInterval = setInterval(() => {
        broadcastTokenToP2P(requestMeta, "");
      }, 15000);

      child.on("spawn", () => {
        if (!streamJson && !copilotJson && !codexJson) {
          emitAgentEvent("project:agentOutput", {
            ...requestMeta,
            stream: "system",
            chunk: "Preparing context...\nWaiting for model response...\n",
          });
        }
      });
      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;

        if (streamJson || copilotJson || codexJson) {
          // JSONL mode: each line is a JSON event; buffer partial lines
          const parseJsonLine = codexJson ? parseCodexJsonLine : copilotJson ? parseCopilotJsonLine : parseClaudeStreamJsonLine;
          jsonLineBuffer += text;
          const lines = jsonLineBuffer.split("\n");
          jsonLineBuffer = lines.pop() || "";  // Keep incomplete last line
          for (const line of lines) {
            const readable = parseJsonLine(line);
            if (readable) {
              activeRequestOutput = (activeRequestOutput + readable).slice(-12000);
              emitAgentEvent("project:agentOutput", {
                ...requestMeta,
                stream: "stdout",
                chunk: readable,
              });
              broadcastTokenToP2P(requestMeta, readable);
            }
            // In manual approval mode, detect tool-use events from stdout and cache
            // them so the stderr handler (which fires when Claude actually blocks on
            // stdin for permission) can emit the approval request with the right tool info.
            if (manualApproval && line.trim()) {
              try {
                const evt = JSON.parse(line);
                let approvalEvent = null;
                if (streamJson && evt.type === "assistant" && Array.isArray(evt.message?.content)) {
                  // Claude: tool_use block inside the assistant message
                  for (const block of evt.message.content) {
                    if (block.type === "tool_use") {
                      approvalEvent = { toolName: block.name || "tool", toolInput: block.input || {} };
                      break;
                    }
                  }
                } else if (copilotJson && evt.type === "tool.execution_start" && evt.data) {
                  // Copilot: tool execution start event — emit immediately (Copilot uses stdout)
                  approvalEvent = { toolName: evt.data.toolName || "tool", toolInput: evt.data.arguments || {} };
                } else if (codexJson && evt.type === "item.started" && evt.item?.type === "command_execution") {
                  // Codex: command execution start event — emit immediately (Codex uses stdout)
                  approvalEvent = { toolName: "Bash", toolInput: { command: evt.item.command || "" } };
                }
                if (approvalEvent) {
                  activePendingApproval = {
                    ...requestMeta,
                    toolName: approvalEvent.toolName,
                    toolInput: approvalEvent.toolInput,
                  };
                  // For Copilot/Codex: emit approval request immediately (stdout-driven approval).
                  // For Claude stream-json: no approval request needed — Claude always runs
                  // with --dangerously-skip-permissions since piped stdin approval doesn't work.
                  if (!streamJson) {
                    emitAgentEvent("project:agentApprovalRequest", activePendingApproval);
                  }
                }
              } catch { /* not JSON, skip */ }
            }
          }
        } else {
          activeRequestOutput = (activeRequestOutput + text).slice(-12000);  // Keep last 12KB
          emitAgentEvent("project:agentOutput", {
            ...requestMeta,
            stream: "stdout",
            chunk: text,
          });
          broadcastTokenToP2P(requestMeta, text);
        }
      });
      child.stderr?.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        // Codex: stderr contains ALL metadata (header, config, prompt echo, role markers,
        // token count). Suppress it entirely — stdout already has the clean response.
        if (isCodexExec) return;

        // Filter out Claude CLI noise that would confuse users
        const filtered = text
          .replace(/Warning: no stdin data received.*\n?/gi, "")
          .replace(/If piping from a slow command.*\n?/gi, "");
        if (filtered.trim()) {
          emitAgentEvent("project:agentOutput", {
            ...requestMeta,
            stream: "stderr",
            chunk: filtered,
          });
        }
      });
      child.on("close", (code) => {
        clearInterval(keepaliveInterval);
        activeChildProcess = null;

        // Flush remaining jsonLineBuffer
        if ((streamJson || copilotJson || codexJson) && jsonLineBuffer.trim()) {
          const parseJsonLine = codexJson ? parseCodexJsonLine : copilotJson ? parseCopilotJsonLine : parseClaudeStreamJsonLine;
          const readable = parseJsonLine(jsonLineBuffer);
          if (readable) {
            activeRequestOutput = (activeRequestOutput + readable).slice(-12000);
            emitAgentEvent("project:agentOutput", { ...requestMeta, stream: "stdout", chunk: readable });
          }
        }

        // For JSONL modes, extract the plain text result from the JSON events
        let plainStdout = stdout;
        if (streamJson) {
          const textParts = [];
          for (const line of stdout.split("\n")) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.type === "result" && evt.result) {
                textParts.push(evt.result);
              } else if (evt.type === "assistant" && evt.message?.content) {
                for (const block of evt.message.content) {
                  if (block.type === "text" && block.text) textParts.push(block.text);
                }
              }
            } catch { /* skip non-JSON lines */ }
          }
          plainStdout = textParts.join("\n");
        } else if (copilotJson) {
          // Copilot JSONL: extract text from assistant.message events
          const textParts = [];
          const errorParts = [];
          for (const line of stdout.split("\n")) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.type === "assistant.message" && evt.data?.content) {
                // Only include final answer text, not commentary before tool calls
                if (!evt.data.toolRequests?.length) {
                  textParts.push(evt.data.content);
                }
              } else if (evt.type === "session.error" && evt.data?.message) {
                errorParts.push(evt.data.message);
              }
            } catch { /* skip non-JSON lines */ }
          }
          plainStdout = textParts.join("\n") || errorParts.join("\n");
        } else if (codexJson) {
          // Codex JSONL: extract text from item.completed agent_message events
          const textParts = [];
          for (const line of stdout.split("\n")) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.type === "item.completed" && evt.item?.type === "agent_message" && evt.item.text) {
                textParts.push(evt.item.text);
              }
            } catch { /* skip non-JSON lines */ }
          }
          plainStdout = textParts.join("\n");
        }

        activeRequestOutput = "";
        activePendingApproval = null;
        emitAgentEvent("project:agentCompleted", {
          ...requestMeta,
          exitCode: code,
          stdout: plainStdout,
          stderr,
          message: code === 0 || code === null ? "Agent finished." : `Agent exited with code ${code}.`,
        });
        activeRequestMeta = null;
        if (code === 0 || code === null) {
          resolve({ stdout: plainStdout, stderr });
        } else {
          const detail = stderr.trim() || plainStdout.trim();
          const err = new Error(detail || `Process exited with code ${code}`);
          err.stdout = plainStdout;
          err.stderr = stderr;
          err.exitCode = code;
          reject(err);
        }
      });
      child.on("error", (err) => {
        clearInterval(keepaliveInterval);
        activeChildProcess = null;
        activePendingApproval = null;
        emitAgentEvent("project:agentError", {
          ...requestMeta,
          message: err.message,
        });
        activeRequestMeta = null;
        reject(err);
      });
    });

    return result.stdout?.trim() ?? "";
  }

  async function tryRunProgram(file, args, cwd) {
    try {
      return {
        ok: true,
        stdout: await runProgram(file, args, cwd),
        stderr: "",
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

  async function runGit(args, cwd, gitCommand) {
    return runProgram(gitCommand, args, cwd);
  }

  async function tryRunGit(args, cwd, gitCommand) {
    return tryRunProgram(gitCommand, args, cwd);
  }

  async function resolveGitIdentity(repoPath, githubCli) {
    try {
      const login = await runProgram(githubCli, ["api", "user", "--jq", ".login"], repoPath);
      const trimmedLogin = login.trim();

      if (trimmedLogin) {
        return {
          name: trimmedLogin,
          email: `${trimmedLogin}@users.noreply.github.com`,
        };
      }
    } catch {
      // Fall back to a local-only identity.
    }

    return {
      name: "CodeBuddy",
      email: "codebuddy@local.invalid",
    };
  }

  async function ensureGitIdentity(repoPath, gitCommand, githubCli) {
    const [nameResult, emailResult] = await Promise.all([
      tryRunGit(["config", "user.name"], repoPath, gitCommand),
      tryRunGit(["config", "user.email"], repoPath, gitCommand),
    ]);

    if (nameResult.ok && nameResult.stdout.trim() && emailResult.ok && emailResult.stdout.trim()) {
      return;
    }

    const identity = await resolveGitIdentity(repoPath, githubCli);
    await runGit(["config", "user.name", identity.name], repoPath, gitCommand);
    await runGit(["config", "user.email", identity.email], repoPath, gitCommand);
  }

  async function ensureInitialCommit(repoPath, gitCommand, githubCli) {
    const existingHead = await tryRunGit(["rev-parse", "--verify", "HEAD"], repoPath, gitCommand);
    if (existingHead.ok) {
      return true;
    }

    const workingTree = await runGit(["status", "--porcelain"], repoPath, gitCommand);
    if (!workingTree.trim()) {
      return false;
    }

    await ensureGitIdentity(repoPath, gitCommand, githubCli);
    await runGit(["add", "."], repoPath, gitCommand);

    const commitResult = await tryRunGit(["commit", "-m", "Initial commit"], repoPath, gitCommand);
    if (!commitResult.ok) {
      throw new Error(commitResult.stderr || commitResult.message || "Unable to create the initial commit.");
    }

    return true;
  }

  async function ensureGithubRemote(project, gitCommand, githubCli) {
    const existingRemote = await tryRunGit(["remote", "get-url", "origin"], project.repoPath, gitCommand);
    if (existingRemote.ok && existingRemote.stdout.trim()) {
      return existingRemote.stdout.trim();
    }

    const args = [
      "repo",
      "create",
      project.folderName,
      project.githubVisibility === "public" ? "--public" : "--private",
      "--source",
      ".",
      "--remote",
      "origin",
    ];

    if (project.description) {
      args.push("--description", project.description);
    }

    const createResult = await tryRunProgram(githubCli, args, project.repoPath);
    if (!createResult.ok) {
      const combined = [createResult.stderr, createResult.message].filter(Boolean).join("\n");
      if (combined.includes("Name already exists on this account") || combined.includes("createRepository")) {
        // Repo already exists on GitHub — look up the URL and wire the remote manually.
        console.log("[ensureGithubRemote] Repo already exists on GitHub, recovering...");
        const viewResult = await tryRunProgram(githubCli, ["repo", "view", project.folderName, "--json", "url", "--jq", ".url"], project.repoPath);
        if (viewResult.ok && viewResult.stdout.trim()) {
          const repoUrl = viewResult.stdout.trim();
          const addResult = await tryRunGit(["remote", "add", "origin", repoUrl], project.repoPath, gitCommand);
          if (!addResult.ok) {
            // Remote name may already exist but point to nothing usable — overwrite it.
            await runGit(["remote", "set-url", "origin", repoUrl], project.repoPath, gitCommand);
          }
          console.log("[ensureGithubRemote] Recovered remote:", repoUrl);
          return repoUrl;
        }
      }
      // Re-throw the original error if we couldn't recover.
      const err = new Error(createResult.stderr || createResult.message || "Failed to create GitHub repository.");
      err.stderr = createResult.stderr;
      throw err;
    }

    return runGit(["remote", "get-url", "origin"], project.repoPath, gitCommand);
  }

  async function ensureGithubRepoForProject(projectId) {
    const { settings, git, githubCli } = await readConfiguredCommands();
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    await ensureInitialCommit(project.repoPath, git, githubCli);

    let remoteUrl;
    try {
      remoteUrl = await ensureGithubRemote(project, git, githubCli);
    } catch (error) {
      if (isMissingCommandError(error, githubCli)) {
        throw new Error("GitHub CLI is not installed or not available to CodeBuddy. The project was created locally, but GitHub connection needs the `gh` CLI.");
      }

      throw error;
    }

    let pushResult = await tryRunGit(["push", "-u", "origin", "main"], project.repoPath, git);
    if (!pushResult.ok && (pushResult.stderr || "").includes("not found")) {
      console.log("[ensureGithubRepo] Push failed (not found), retrying in 3s...");
      await new Promise((r) => setTimeout(r, 3000));
      pushResult = await tryRunGit(["push", "-u", "origin", "main"], project.repoPath, git);
    }
    if (!pushResult.ok) {
      throw new Error(pushResult.stderr || pushResult.message || "Unable to push this project to GitHub.");
    }

    // Create and switch to codebuddy-build branch for working changes
    try {
      await tryRunGit(["switch", "-c", "codebuddy-build"], project.repoPath, git);
      await tryRunGit(["push", "-u", "origin", "codebuddy-build"], project.repoPath, git);
      console.log("[ensureGithubRepo] Created and pushed codebuddy-build branch.");
    } catch (branchErr) {
      console.warn("[ensureGithubRepo] codebuddy-build branch creation warning:", branchErr?.message);
    }

    const timestamp = Date.now();
    const nextProject = {
      ...project,
      githubRepoUrl: remoteUrl,
      updatedAt: formatProjectTimestamp(timestamp),
    };

    return saveProject(nextProject);
  }

  function getFallbackProjectRoot() {
    return path.join(app.getPath("documents"), "CodeBuddy Projects");
  }

  async function listProjects() {
    const settings = await settingsService.readSettings();
    return settings.projects ?? [];
  }

  async function saveProject(nextProject) {
    console.log(`[saveProject] Saving project ${nextProject.id}, conversation: ${nextProject.dashboard?.conversation?.length ?? 'N/A'} messages`);
    await settingsService.atomicUpdate((settings) => {
      const existing = (settings.projects ?? []).find(p => p.id === nextProject.id);
      if (existing) {
        console.log(`[saveProject] Existing project conversation in settings: ${existing.dashboard?.conversation?.length ?? 'N/A'} messages`);
      }

      // Protective merge: if the fresh disk version has a LONGER conversation,
      // taskThreads with more messages, or more soloSessions, keep the longer version.
      // This prevents stale-snapshot races from ever losing chat history.
      let mergedProject = nextProject;
      if (existing?.dashboard && nextProject.dashboard) {
        const freshConv = existing.dashboard.conversation ?? [];
        const incomingConv = nextProject.dashboard.conversation ?? [];
        const freshSessions = existing.dashboard.soloSessions ?? [];
        const incomingSessions = nextProject.dashboard.soloSessions ?? [];
        const freshThreads = existing.dashboard.taskThreads ?? [];
        const incomingThreads = nextProject.dashboard.taskThreads ?? [];

        // Per-thread merge: keep whichever version of each thread has more messages
        let mergedThreads = incomingThreads;
        if (freshThreads.length > 0 && incomingThreads.length > 0) {
          const freshThreadMap = new Map(freshThreads.map(t => [t.id, t]));
          mergedThreads = incomingThreads.map(inThread => {
            const freshThread = freshThreadMap.get(inThread.id);
            if (freshThread && (freshThread.messages?.length || 0) > (inThread.messages?.length || 0)) {
              return { ...inThread, messages: freshThread.messages };
            }
            return inThread;
          });
          // Add any fresh-only threads not in incoming
          for (const ft of freshThreads) {
            if (!incomingThreads.some(t => t.id === ft.id)) {
              mergedThreads.push(ft);
            }
          }
        }

        const needsMerge = freshConv.length > incomingConv.length
          || freshSessions.length > incomingSessions.length
          || mergedThreads !== incomingThreads;

        if (needsMerge) {
          console.log(`[saveProject] PROTECTIVE MERGE — fresh conversation: ${freshConv.length}, incoming: ${incomingConv.length}; fresh sessions: ${freshSessions.length}, incoming: ${incomingSessions.length}`);
          mergedProject = {
            ...nextProject,
            dashboard: {
              ...nextProject.dashboard,
              conversation: freshConv.length > incomingConv.length ? freshConv : incomingConv,
              soloSessions: freshSessions.length > incomingSessions.length ? freshSessions : incomingSessions,
              taskThreads: mergedThreads,
            },
          };
        }
      }

      const nextProjects = [mergedProject, ...(settings.projects ?? []).filter((project) => project.id !== mergedProject.id)];
      return {
        ...settings,
        projects: nextProjects,
        activeProjectId: mergedProject.id,
        recentRepositories: Array.from(new Set([mergedProject.repoPath, ...(settings.recentRepositories ?? [])])).slice(0, 8),
        workspaceRoots: Array.from(new Set([mergedProject.repoPath, ...(settings.workspaceRoots ?? [])])).slice(0, 8),
      };
    });

    // Broadcast agent config snapshot to P2P peers (lightweight summary only)
    try {
      if (p2pService && typeof p2pService.broadcastStateChange === "function" && nextProject.dashboard) {
        const configSummary = {
          projectId: nextProject.id,
          projectName: nextProject.name,
          systemPromptMarkdown: nextProject.dashboard.systemPromptMarkdown || null,
          defaultModel: nextProject.dashboard.defaultModel || null,
          taskCount: (nextProject.dashboard.plan?.subprojects ?? []).reduce((sum, sp) => sum + (sp.tasks?.length ?? 0), 0),
          subprojectCount: nextProject.dashboard.plan?.subprojects?.length ?? 0,
          updatedAt: nextProject.updatedAt || new Date().toISOString(),
        };
        p2pService.broadcastStateChange(nextProject.id, "agents", nextProject.id, configSummary);
      }
    } catch (_) { /* swallow — P2P is best-effort */ }

    return nextProject;
  }

  async function deleteProject(payload) {
    const projectId = typeof payload?.projectId === "string" ? payload.projectId : "";
    const deleteLocalFiles = Boolean(payload?.deleteLocalFiles);
    const deleteGithubRepo = Boolean(payload?.deleteGithubRepo);
    const settings = await settingsService.readSettings();
    const currentProjects = settings.projects ?? [];
    const project = currentProjects.find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    let deletedGithubRepo = false;
    let githubWarning = null;

    if (deleteGithubRepo && project.githubRepoUrl) {
      try {
        const { githubCli } = await readConfiguredCommands();
        const repoSlug = parseGithubRepoSlug(project.githubRepoUrl);
        if (repoSlug) {
          await runProgram(githubCli, ["repo", "delete", repoSlug, "--yes"], project.repoPath);
          deletedGithubRepo = true;
        }
      } catch (error) {
        const { githubCli } = await readConfiguredCommands();
        githubWarning = normalizeGitHubDeleteError(error, githubCli);
      }
    }

    let deletedLocalFiles = false;
    if (deleteLocalFiles && project.repoPath) {
      try {
        await fs.rm(project.repoPath, { recursive: true, force: true });
        deletedLocalFiles = true;

        // Clean up the parent directory if it is now empty (e.g. the wrapper
        // folder the user created from the folder-picker).
        const parentDir = path.dirname(project.repoPath);
        try {
          const remaining = await fs.readdir(parentDir);
          if (remaining.length === 0) {
            await fs.rmdir(parentDir);
          }
        } catch {
          // Parent may already be gone or not removable — ignore.
        }
      } catch {
        // Best-effort — folder may be locked or already gone.
      }
    }

    const nextResult = await settingsService.atomicUpdate((settings) => {
      const currentProjects = settings.projects ?? [];
      const nextProjects = currentProjects.filter((entry) => entry.id !== projectId);
      const nextActiveProjectId = settings.activeProjectId === projectId
        ? nextProjects[0]?.id ?? null
        : settings.activeProjectId;
      return {
        ...settings,
        projects: nextProjects,
        activeProjectId: nextActiveProjectId,
        recentRepositories: (settings.recentRepositories ?? []).filter((entry) => entry !== project.repoPath),
        workspaceRoots: (settings.workspaceRoots ?? []).filter((entry) => entry !== project.repoPath),
      };
    });
    const nextActiveProjectId = nextResult?.activeProjectId ?? null;

    return {
      deletedProjectId: project.id,
      activeProjectId: nextActiveProjectId,
      deletedLocalFiles,
      deletedGithubRepo,
      githubWarning,
    };
  }

  async function grantGithubDeleteScope() {
    const { githubCli } = await readConfiguredCommands();
    const tmpDir = app.getPath("temp");
    const scriptPath = path.join(tmpDir, "codebuddy-gh-auth.ps1");

    const scriptContent = [
      `Write-Host '=== CodeBuddy: GitHub Permission Setup ===' -ForegroundColor Cyan`,
      `Write-Host ''`,
      `Write-Host 'This will open your browser to grant repo-delete permission.' -ForegroundColor Yellow`,
      `Write-Host 'Complete the sign-in in your browser, then come back here.' -ForegroundColor Yellow`,
      `Write-Host ''`,
      `& '${githubCli.replace(/'/g, "''")}' auth refresh -h github.com -s delete_repo`,
      `if ($LASTEXITCODE -eq 0) {`,
      `  Write-Host '' ; Write-Host 'Permission granted! You can close this window.' -ForegroundColor Green`,
      `} else {`,
      `  Write-Host '' ; Write-Host 'Something went wrong. Try again or close this window.' -ForegroundColor Red`,
      `}`,
      `Write-Host '' ; Read-Host 'Press Enter to close'`,
    ].join("\n");

    await fs.writeFile(scriptPath, scriptContent, "utf8");

    return new Promise((resolve, reject) => {
      const child = spawn("powershell.exe", [
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "Start-Process", "powershell.exe",
        "-ArgumentList", `'-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"'`,
        "-Wait",
      ], { stdio: "ignore", windowsHide: true });

      child.on("close", async () => {
        await fs.rm(scriptPath, { force: true }).catch(() => {});
        resolve({ granted: true });
      });
      child.on("error", (err) => reject(new Error(`Unable to open auth window: ${err.message}`)));
    });
  }

  async function setActiveProject(projectId) {
    let project = null;
    await settingsService.atomicUpdate((settings) => {
      project = (settings.projects ?? []).find((entry) => entry.id === projectId);
      if (!project) return undefined; // no-op
      return {
        ...settings,
        activeProjectId: project.id,
        recentRepositories: Array.from(new Set([project.repoPath, ...(settings.recentRepositories ?? [])])).slice(0, 8),
        workspaceRoots: Array.from(new Set([project.repoPath, ...(settings.workspaceRoots ?? [])])).slice(0, 8),
      };
    });

    if (!project) {
      throw new Error("Project not found.");
    }

    return project;
  }

  async function createProject(payload) {
    if (typeof payload?.name !== "string" || !payload.name.trim()) {
      throw new Error("A project name is required.");
    }

    const trimmedName = payload.name.trim();
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    const { settings, git, githubCli } = await readConfiguredCommands();
    const createGithubRepo = payload.createGithubRepo ?? settings.projectDefaults?.createGithubRepo ?? true;
    const githubVisibility = payload.githubVisibility || settings.projectDefaults?.githubVisibility || "private";

    /* ── Import existing directory ── */
    if (payload.importExistingPath) {
      const importPath = path.resolve(payload.importExistingPath.trim());
      if (!(await fileExists(importPath))) {
        throw new Error("The selected directory does not exist.");
      }

      const repoPath = importPath;
      const folderName = path.basename(repoPath);

      const isGitRepo = await fileExists(path.join(repoPath, ".git"));
      if (!isGitRepo) {
        try {
          await runGit(["init", "-b", "main"], repoPath, git);
        } catch {
          await runGit(["init"], repoPath, git);
          await runGit(["branch", "-M", "main"], repoPath, git);
        }
        await ensureInitialCommit(repoPath, git, githubCli);
      }

      let githubRepoUrl = null;
      let githubRepoWarning = null;
      if (createGithubRepo) {
        try {
          githubRepoUrl = await ensureGithubRemote({
            folderName,
            githubVisibility,
            description,
            repoPath,
          }, git, githubCli);
          // Create codebuddy-build branch if it doesn't exist
          try {
            const branchList = await tryRunGit(["branch", "--list", "codebuddy-build"], repoPath, git);
            if (!branchList.stdout?.trim()) {
              await tryRunGit(["switch", "-c", "codebuddy-build"], repoPath, git);
              await tryRunGit(["push", "-u", "origin", "codebuddy-build"], repoPath, git);
              console.log("[createProject:import] Created and pushed codebuddy-build branch.");
            } else {
              await tryRunGit(["switch", "codebuddy-build"], repoPath, git);
              console.log("[createProject:import] Switched to existing codebuddy-build branch.");
            }
          } catch (branchErr) {
            console.warn("[createProject:import] codebuddy-build branch warning:", branchErr?.message);
          }
        } catch (error) {
          const fallbackMessage = getGithubCreateFallbackMessage(error, githubCli);
          if (fallbackMessage) {
            githubRepoWarning = fallbackMessage;
          }
        }
      }

      const timestamp = Date.now();
      const nextProject = {
        id: crypto.randomUUID(),
        name: trimmedName,
        description: description || `Imported from ${folderName}.`,
        stage: "Planning",
        repoPath,
        folderName,
        githubVisibility,
        githubRepoUrl,
        createdAt: formatProjectTimestamp(timestamp),
        updatedAt: formatProjectTimestamp(timestamp),
        dashboard: buildEmptyDashboardState(description, settings.projectDefaults?.systemPromptMarkdown),
        imported: true,
      };

      const baseDirectory = path.dirname(repoPath);
      await settingsService.updateSettings({
        projectDefaults: {
          ...(settings.projectDefaults ?? {}),
          rootDirectory: baseDirectory,
          createGithubRepo,
          githubVisibility,
        },
      });

      const savedProject = await saveProject(await syncSharedAgentContextFiles(nextProject));
      return githubRepoWarning
        ? { ...savedProject, githubRepoWarning }
        : savedProject;
    }

    /* ── Create new directory ── */
    const baseDirectory = path.resolve(
      payload.baseDirectory?.trim() || settings.projectDefaults?.rootDirectory || getFallbackProjectRoot(),
    );
    const folderName = slugifyProjectName(payload.folderName?.trim() || trimmedName);
    const repoPath = path.join(baseDirectory, folderName);

    if (await fileExists(repoPath)) {
      const existingEntries = await fs.readdir(repoPath).catch(() => []);
      if (existingEntries.length > 0) {
        throw new Error("That project folder already exists and is not empty.");
      }
    }

    await fs.mkdir(repoPath, { recursive: true });

    const readmeLines = [
      `# ${trimmedName}`,
      "",
      description || "Created with CodeBuddy.",
      "",
      "## Getting started",
      "",
      "This project was created from CodeBuddy.",
    ];

    await Promise.all([
      fs.writeFile(path.join(repoPath, "README.md"), `${readmeLines.join("\n")}\n`, "utf8"),
      fs.writeFile(path.join(repoPath, ".gitignore"), "node_modules\n.next\nout\ndist\n.env\n.env.local\n", "utf8"),
    ]);

    try {
      await runGit(["init", "-b", "main"], repoPath, git);
    } catch {
      await runGit(["init"], repoPath, git);
      await runGit(["branch", "-M", "main"], repoPath, git);
    }

    const committed = await ensureInitialCommit(repoPath, git, githubCli);

    let githubRepoUrl = null;
    let githubRepoWarning = null;
    if (createGithubRepo) {
      try {
        githubRepoUrl = await ensureGithubRemote({
          folderName,
          githubVisibility,
          description,
          repoPath,
        }, git, githubCli);

        if (committed) {
          let pushResult = await tryRunGit(["push", "-u", "origin", "main"], repoPath, git);
          if (!pushResult.ok && (pushResult.stderr || "").includes("not found")) {
            // GitHub repo may not be propagated yet — wait and retry once.
            console.log("[createProject] Push failed (not found), retrying in 3s...");
            await new Promise((r) => setTimeout(r, 3000));
            pushResult = await tryRunGit(["push", "-u", "origin", "main"], repoPath, git);
          }
          if (!pushResult.ok) {
            throw new Error(pushResult.stderr || pushResult.message || "Unable to push the initial project commit to GitHub.");
          }
          // Create and switch to codebuddy-build branch
          try {
            await tryRunGit(["switch", "-c", "codebuddy-build"], repoPath, git);
            await tryRunGit(["push", "-u", "origin", "codebuddy-build"], repoPath, git);
            console.log("[createProject] Created and pushed codebuddy-build branch.");
          } catch (branchErr) {
            console.warn("[createProject] codebuddy-build branch warning:", branchErr?.message);
          }
        }
      } catch (error) {
        const fallbackMessage = getGithubCreateFallbackMessage(error, githubCli);
        if (!fallbackMessage) {
          throw error;
        }

        githubRepoUrl = null;
        githubRepoWarning = fallbackMessage;
      }
    }

    const timestamp = Date.now();
    const nextProject = {
      id: crypto.randomUUID(),
      name: trimmedName,
      description: description || "A brand new project.",
      stage: "Planning",
      repoPath,
      folderName,
      githubVisibility,
      githubRepoUrl,
      createdAt: formatProjectTimestamp(timestamp),
      updatedAt: formatProjectTimestamp(timestamp),
      dashboard: buildEmptyDashboardState(description, settings.projectDefaults?.systemPromptMarkdown),
    };

    await settingsService.updateSettings({
      projectDefaults: {
        ...(settings.projectDefaults ?? {}),
        rootDirectory: baseDirectory,
        createGithubRepo,
        githubVisibility,
      },
    });

    const savedProject = await saveProject(await syncSharedAgentContextFiles(nextProject));
    return githubRepoWarning
      ? { ...savedProject, githubRepoWarning }
      : savedProject;
  }

  async function gatherProjectSnapshot(repoPath, maxTotalChars = 12000) {
    const snapshot = [];
    const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "dist-electron", ".git", ".codebuddy", "out", "tmp", "__pycache__", ".venv", "venv", "target", ".cache", "coverage", "build"]);
    const MAX_ENTRIES = 120;
    let entryCount = 0;
    async function listDir(dirPath, prefix = "", depth = 0) {
      if (depth > 1 || entryCount >= MAX_ENTRIES) return;
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entryCount >= MAX_ENTRIES) break;
          if (SKIP_DIRS.has(entry.name) && entry.isDirectory()) continue;
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          snapshot.push(entry.isDirectory() ? `${relative}/` : relative);
          entryCount++;
          if (entry.isDirectory() && depth < 1) {
            await listDir(path.join(dirPath, entry.name), relative, depth + 1);
          }
        }
      } catch { /* permission or missing */ }
    }
    await listDir(repoPath);
    let tree = snapshot.join("\n");
    if (tree.length > 4000) tree = tree.slice(0, 4000) + "\n... (truncated)";

    // Read key files with strict size limits
    const KEY_FILES = ["package.json", "README.md", "Cargo.toml", "pyproject.toml", "go.mod", "tsconfig.json"];
    const fileContents = [];
    let totalFileChars = 0;
    const maxPerFile = 3000;
    const maxAllFiles = maxTotalChars - tree.length - 2000; // reserve space for prompt structure
    for (const name of KEY_FILES) {
      if (totalFileChars >= maxAllFiles) break;
      try {
        let content = await fs.readFile(path.join(repoPath, name), "utf8");
        content = content.trim();
        if (content.length > maxPerFile) content = content.slice(0, maxPerFile) + "\n... (truncated)";
        fileContents.push(`--- ${name} ---\n${content}`);
        totalFileChars += content.length;
      } catch { /* file doesn't exist */ }
    }

    return { tree, fileContents: fileContents.join("\n\n") };
  }

  async function generateProjectPlan(projectId, prompt, model) {
    console.log(`[generateProjectPlan] called — build ${BUILD_TAG}`);
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("An initial project prompt is required.");
    }

    const commands = await readConfiguredCommands();
    const { settings } = commands;

    // Diagnostic: show resolved config in the chat stream
    const activeProvider = resolveProvider(settings, typeof model === "string" ? model.trim() : "");
    emitAgentEvent("project:agentOutput", {
      projectId,
      scope: "project-manager",
      phase: "plan",
      stream: "system",
      chunk: `[diagnostic] provider: ${activeProvider}\n[diagnostic] copilotCli: ${commands.copilotCli}\n[diagnostic] claudeCli: ${commands.claudeCli}\n[diagnostic] copilotPrefix: ${JSON.stringify(commands.copilotPrefix)}\n`,
    });

    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    emitAgentEvent("project:agentOutput", {
      projectId,
      scope: "project-manager",
      phase: "plan",
      stream: "system",
      chunk: "Scanning project files...\n",
    });

    const { tree, fileContents } = await gatherProjectSnapshot(project.repoPath);

    const isImported = project.imported === true;
    const systemPromptMarkdown = isImported
      ? (project.dashboard?.systemPromptMarkdown || IMPORTED_PROJECT_SYSTEM_PROMPT)
      : (project.dashboard?.systemPromptMarkdown || settings.projectDefaults?.systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN);
    const fullPrompt = [
      systemPromptMarkdown,
      "Every task must include a strong startingPrompt. The startingPrompt should be ready to paste into a fresh task chat and must tell the task agent exactly what to do first, what files or surfaces to inspect, and what outcome to produce. The startingPrompt must reference CodeBuddy's built-in Terminal tab and Preview tab instead of external tools — never reference VS Code, external terminals, or browsers.",
      "Return JSON matching this schema:",
      JSON.stringify({
        summary: "string",
        nextAction: "string",
        projectPreview: {
          title: "string",
          subtitle: "string",
          accent: "string",
          cards: ["string"],
        },
        buildOrder: [
          {
            title: "string",
            summary: "string",
          },
        ],
        subprojects: [
          {
            title: "string",
            goal: "string",
            status: "done | building | planned",
            agentName: "string",
            agentBrief: "string",
            tasks: [
              {
                title: "string",
                status: "done | building | planned",
                note: "string",
                owner: "string",
                reviewer: "string",
                startingPrompt: "string",
              },
            ],
          },
        ],
      }, null, 2),
      `Project name: ${project.name}`,
      `Project description: ${project.description}`,
      "## Project file tree (depth 2):",
      tree,
      fileContents ? `## Key project files:\n${fileContents}` : null,
      `User request: ${prompt.trim()}`,
    ].filter(Boolean).join("\n\n");

    // Build CLI args based on active provider
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    const provider = resolveProvider(settings, selectedModel);

    let rawOutput;
    try {
      rawOutput = await runProviderCli(commands, provider, fullPrompt, selectedModel, { agentMode: false }, project.repoPath, {
        projectId,
        scope: "project-manager",
        phase: "plan",
        model: selectedModel || "auto",
        promptText: prompt.trim(),
      });
    } catch (cliErr) {
      const cliInfo = buildCliInvocation(commands, provider, fullPrompt, selectedModel, { agentMode: false });
      const providerLabel = provider === "claude" ? "Claude" : provider === "codex" ? "Codex" : "Copilot";
      const detail = [
        `${providerLabel} CLI failed to generate a project plan.`,
        ``,
        `Command: ${cliInfo.cli} ${cliInfo.args.join(" ")}`,
        `Exit code: ${cliErr.exitCode ?? "unknown"}`,
        `CWD: ${project.repoPath}`,
        `CLI path: ${cliInfo.cli}`,
        `CLI exists: ${fsSync.existsSync(cliInfo.cli)}`,
        `Provider: ${provider}`,
        ``,
        `stderr: ${(cliErr.stderr || "").substring(0, 500)}`,
        `stdout: ${(cliErr.stdout || "").substring(0, 500)}`,
        `error: ${cliErr.message}`,
        ``,
        `Troubleshooting:`,
        provider === "claude"
          ? `1. Make sure "claude" is installed: npm install -g @anthropic-ai/claude-code\n2. Open a terminal and run: claude --version\n3. Make sure you're signed in: claude auth status`
          : provider === "codex"
          ? `1. Make sure "codex" is installed: npm install -g @openai/codex\n2. Open a terminal and run: codex --version\n3. Make sure you're signed in: codex login`
          : `1. Make sure "copilot" is installed: winget install GitHub.Copilot\n2. Open a terminal and run: copilot --version\n3. If that fails, the binary is not on PATH — restart the app after installing`,
      ].join("\n");
      console.error("[generateProjectPlan]", detail);
      throw new Error(detail);
    }
    const generatedPayload = parseJsonObjectFromText(rawOutput);
    const generatedDashboard = normalizeGeneratedPlan(project, prompt.trim(), generatedPayload);
    const timestamp = Date.now();
    const existingDashboard = project.dashboard ?? buildEmptyDashboardState(project.description, systemPromptMarkdown);

    const nextProject = {
      ...project,
      updatedAt: formatProjectTimestamp(timestamp),
      stage: "Building",
      dashboard: {
        ...existingDashboard,
        systemPromptMarkdown,
        initialPrompt: prompt.trim(),
        ...generatedDashboard,
        conversation: [...(existingDashboard.conversation ?? []), ...generatedDashboard.conversation],
        activity: [...(generatedDashboard.activity ?? []), ...(existingDashboard.activity ?? [])],
      },
    };

    const savedProject = await saveProject(await syncSharedAgentContextFiles(nextProject));

    // Write a project README to the repo so task agents have context
    try {
      await writeProjectReadme(savedProject);
    } catch {
      // Best-effort — don't block plan generation if README write fails
    }

    return savedProject;
  }

  async function writeProjectReadme(project) {
    const plan = project.dashboard?.plan;
    if (!plan || !project.repoPath) return;

    const sections = [
      `# ${project.name}`,
      "",
      project.description ? `${project.description}` : "Created with CodeBuddy.",
      "",
      "## Project Overview",
      "",
      plan.summary || "MVP project managed by CodeBuddy.",
      "",
    ];

    if (plan.projectPreview?.subtitle) {
      sections.push(`**Goal:** ${plan.projectPreview.subtitle}`, "");
    }

    if (plan.nextAction) {
      sections.push(`**Next step:** ${plan.nextAction}`, "");
    }

    const subprojects = plan.subprojects ?? [];
    if (subprojects.length > 0) {
      sections.push("## Architecture & Subprojects", "");
      for (const sp of subprojects) {
        const statusBadge = sp.status === "done" ? "✅" : sp.status === "building" ? "🔨" : "📋";
        sections.push(`### ${statusBadge} ${sp.title}`, "");
        if (sp.goal) sections.push(sp.goal, "");
        const tasks = sp.tasks ?? [];
        for (const task of tasks) {
          const taskBadge = task.status === "done" ? "- [x]" : "- [ ]";
          sections.push(`${taskBadge} **${task.title}** — ${task.note || "No details."}`);
        }
        sections.push("");
      }
    }

    if (Array.isArray(plan.buildOrder) && plan.buildOrder.length > 0) {
      sections.push("## Build Order", "");
      for (const step of plan.buildOrder) {
        sections.push(`${step.sequence}. **${step.title}** — ${step.summary || ""}`);
      }
      sections.push("");
    }

    sections.push(
      "## Development",
      "",
      "This project is managed by CodeBuddy. Each task agent reads this README for context before starting work and updates it after completing their task.",
      "",
      "---",
      "",
      `*Last updated by CodeBuddy on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`,
      "",
    );

    await fs.writeFile(path.join(project.repoPath, "README.md"), sections.join("\n"), "utf8");
  }

  async function sendPMMessage({ projectId, prompt, model, attachedFiles = [], replaceFromMessageId }) {
    console.log(`[pm-chat] START project=${projectId.slice(0,8)} model=${model || "auto"} len=${prompt?.length}`);
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("A message is required.");
    }

    const commands = await readConfiguredCommands();
    const { settings } = commands;
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    const existingDashboard = project.dashboard ?? buildEmptyDashboardState(project.description, settings.projectDefaults?.systemPromptMarkdown);
    const systemPromptMarkdown = existingDashboard.systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN;
    const existingConversation = existingDashboard.conversation ?? [];
    const replaceIndex = replaceFromMessageId
      ? existingConversation.findIndex((entry) => entry.id === replaceFromMessageId)
      : -1;
    if (replaceFromMessageId && replaceIndex === -1) {
      throw new Error("The message you are trying to edit could not be found.");
    }
    const baseConversationRaw = replaceIndex >= 0 ? existingConversation.slice(0, replaceIndex) : existingConversation;
    const nextAttachedFiles = Array.isArray(attachedFiles)
      ? attachedFiles.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
      : [];
    const checkpoint = await createCheckpointSnapshot(project.repoPath, `Before PM prompt: ${prompt.trim().slice(0, 80)}`, projectId);

    // Build CLI invocation based on active provider
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    const provider = resolveProvider(settings, selectedModel);

    // Compact if conversation history exceeds threshold
    const baseConversation = await compactMessagesIfNeeded(
      baseConversationRaw, commands, provider, selectedModel, project.repoPath,
      async (compacted) => {
        await settingsService.atomicUpdate((fresh) => {
          const idx = (fresh.projects ?? []).findIndex((p) => p.id === projectId);
          if (idx >= 0 && fresh.projects[idx].dashboard) {
            fresh.projects[idx].dashboard.conversation = compacted;
          }
          return { ...fresh };
        });
      }
    );

    const fullPrompt = [
      systemPromptMarkdown,
      "You are the Project Manager for this CodeBuddy project.",
      "The project plan has already been created. Do NOT regenerate or modify the plan. Only answer the user's question or discuss the project. If the user explicitly asks you to change something, then explain what you would change but do not output JSON.",
      "Keep responses brief, plain-language, and non-technical by default.",
      "When helpful, structure the answer as: What happened, Recommended next step, Move to the next task when.",
      "IMPORTANT: CodeBuddy is a self-contained workspace. Never reference VS Code, external terminals, browsers, or any tool outside CodeBuddy. All running, testing, and previewing uses CodeBuddy's built-in Terminal tab and Preview tab.",
      "",
      "IMPORTANT — User Input Required:",
      "If your response requires the user to provide anything (API keys, credentials, tokens, environment variables, configuration values, account sign-ups, or any other manual input), you MUST end your response with a clearly separated section:",
      "",
      "---",
      "## Attention User Input Required",
      "Then list each item the user needs to provide, explain what it is, and give clear steps on how to obtain it.",
      "This section MUST ALWAYS be the very last thing in your response, with no other content after it.",
      "If no user input is required, do not include this section at all.",
      "",
      RESPONSE_SUMMARY_INSTRUCTIONS,
      "",
      `Project name: ${project.name}`,
      `Project description: ${project.description}`,
      baseConversation.length > 0 ? `Recent conversation:\n${buildRecentConversationTranscript(baseConversation)}` : null,
      nextAttachedFiles.length > 0 ? `Attached files from the user:\n${nextAttachedFiles.map((filePath) => `- ${filePath}`).join("\n")}` : null,
      `Latest user message:\n${prompt.trim()}`,
    ].filter(Boolean).join("\n\n");

    const rawOutput = await runProviderCli(commands, provider, fullPrompt, selectedModel, { agentMode: false }, project.repoPath, {
      projectId,
      scope: "project-manager",
      phase: "chat",
      model: selectedModel || "auto",
      checkpointId: checkpoint.id,
      promptText: prompt.trim(),
    });
    const responseText = rawOutput.trim() || "No response returned.";
    const timestamp = Date.now();

    const userMessage = {
      id: `pm-user-${timestamp}`,
      from: project.creatorName || "Cameron",
      initials: "CM",
      text: prompt.trim(),
      time: formatTimeShort(timestamp),
      isMine: true,
      attachments: nextAttachedFiles,
      modelId: selectedModel || "auto",
      checkpointId: checkpoint.id,
    };

    const aiMessage = {
      id: `pm-ai-${timestamp}`,
      from: "Project Manager",
      initials: "✦",
      text: responseText,
      time: formatTimeShort(timestamp),
      isAI: true,
      modelId: selectedModel || "auto",
      provider,
    };

    const nextProject = {
      ...project,
      updatedAt: formatProjectTimestamp(timestamp),
      dashboard: {
        ...existingDashboard,
        conversation: [...baseConversation, userMessage, aiMessage],
      },
    };

    const saved = await saveProject(await syncSharedAgentContextFiles(nextProject));

    // Broadcast to P2P peers + save to shared state
    const pmConversationId = `pm-${projectId}`;
    broadcastMessageToP2P(projectId, pmConversationId, aiMessage, "project-manager");

    // Broadcast full conversation update so peer agents share context
    broadcastStateToP2P(projectId, "conversation", pmConversationId, {
      type: "project-manager",
      projectId,
      newMessages: [userMessage, aiMessage],
    });

    saveConversationToSharedState(project.repoPath, pmConversationId, {
      id: pmConversationId,
      type: "project-manager",
      projectId,
      messages: [...baseConversation, userMessage, aiMessage],
      updatedAt: new Date(timestamp).toISOString(),
    });

    return saved;
  }

  async function sendSoloMessage({ projectId, sessionId, prompt, model, attachedFiles = [], replaceFromMessageId }) {
    console.log(`[solo-chat] START project=${projectId.slice(0,8)} session=${sessionId?.slice(0,8) || "new"} model=${model || "auto"} len=${prompt?.length}`);
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("A message is required.");
    }

    const commands = await readConfiguredCommands();
    const { settings } = commands;
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);
    if (!project) throw new Error("Project not found.");

    const existingDashboard = project.dashboard ?? buildEmptyDashboardState(project.description, settings.projectDefaults?.systemPromptMarkdown);
    const existingSessions = Array.isArray(existingDashboard.soloSessions) ? existingDashboard.soloSessions : [];

    // Find or create the solo session
    const timestamp = Date.now();
    let session = sessionId ? existingSessions.find((s) => s.id === sessionId) : null;
    const isNewSession = !session;
    if (!session) {
      session = {
        id: sessionId || `solo-${timestamp}`,
        title: prompt.trim().slice(0, 60) || "New Session",
        createdAt: formatProjectTimestamp(timestamp),
        updatedAt: formatProjectTimestamp(timestamp),
        lastModel: null,
        messages: [],
      };
    }

    const existingMessages = session.messages ?? [];
    const replaceIndex = replaceFromMessageId
      ? existingMessages.findIndex((entry) => entry.id === replaceFromMessageId)
      : -1;
    if (replaceFromMessageId && replaceIndex === -1) {
      throw new Error("The message you are trying to edit could not be found.");
    }
    const baseMessagesRaw = replaceIndex >= 0 ? existingMessages.slice(0, replaceIndex) : existingMessages;

    const nextAttachedFiles = Array.isArray(attachedFiles)
      ? attachedFiles.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
      : [];

    const checkpoint = await createCheckpointSnapshot(project.repoPath, `Before solo prompt: ${prompt.trim().slice(0, 80)}`, projectId);

    // Load shared agent context from peer machines (if available)
    const soloPeerContext = await loadPeerAgentContext(project.repoPath, "solo", session.id);

    // Build CLI invocation based on active provider
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    const provider = resolveProvider(settings, selectedModel);

    // Compact if conversation history exceeds threshold
    const baseMessages = await compactMessagesIfNeeded(
      baseMessagesRaw, commands, provider, selectedModel, project.repoPath,
      async (compacted) => {
        await settingsService.atomicUpdate((fresh) => {
          const idx = (fresh.projects ?? []).findIndex((p) => p.id === projectId);
          if (idx < 0) return fresh;
          const sessions = Array.isArray(fresh.projects[idx].dashboard?.soloSessions)
            ? [...fresh.projects[idx].dashboard.soloSessions]
            : [];
          const sIdx = sessions.findIndex((s) => s.id === session.id);
          if (sIdx >= 0) {
            sessions[sIdx] = { ...sessions[sIdx], messages: compacted };
            fresh.projects[idx].dashboard.soloSessions = sessions;
          }
          return { ...fresh };
        });
      }
    );

    const fullPrompt = [
      "You are a coding assistant working directly with the user in their project.",
      "You have full access to read and write files, run commands, and build code.",
      "Be direct and action-oriented. Write code, create files, fix bugs, build features.",
      "When you create or modify files, show the changes clearly.",
      soloPeerContext,
      "",
      "=== CRITICAL SAFETY RULES ===",
      "You are running INSIDE the CodeBuddy desktop application (port 3000).",
      "NEVER kill processes, open VS Code, open browsers, or run commands that open external GUIs.",
      "NEVER start long-running dev servers (they block forever). Only run commands that complete and exit.",
      "If a port is in use, suggest a different port — do NOT kill processes.",
      "=== END SAFETY RULES ===",
      "",
      "IMPORTANT — User Input Required:",
      "If your response requires the user to provide anything (API keys, credentials, tokens, environment variables, configuration values, account sign-ups, or any other manual input), you MUST end your response with a clearly separated section:",
      "",
      "---",
      "## Attention User Input Required",
      "Then list each item, explain what it is, and give clear steps to obtain it.",
      "",
      RESPONSE_SUMMARY_INSTRUCTIONS,
      "",
      `Project: ${project.name}`,
      `Description: ${project.description}`,
      baseMessages.length > 0 ? `Recent conversation:\n${buildRecentConversationTranscript(baseMessages)}` : null,
      nextAttachedFiles.length > 0 ? `Attached files:\n${nextAttachedFiles.map((f) => `- ${f}`).join("\n")}` : null,
      `User message:\n${prompt.trim()}`,
    ].filter(Boolean).join("\n\n");

    let rawOutput;
    try {
      // Ensure we're on the working branch before the agent modifies files
      ensureOnCodebuddyBuild(project.repoPath);
      const approvalMode = settings.projectDefaults?.approvalMode || "auto";
      rawOutput = await runProviderCli(commands, provider, fullPrompt, selectedModel, { agentMode: true, approvalMode }, project.repoPath, {
        projectId,
        scope: "solo-chat",
        phase: "chat",
        model: selectedModel || "auto",
        checkpointId: checkpoint.id,
        sessionId: session.id,
        sessionTitle: session.title,
        promptText: prompt.trim(),
      });
    } catch (programError) {
      rawOutput = programError.stdout?.trim() || "";
      if (!rawOutput) throw programError;
    }

    const responseText = rawOutput.trim() || "No response returned.";

    const userMessage = {
      id: `solo-user-${timestamp}`,
      from: project.creatorName || "Cameron",
      initials: "CM",
      text: prompt.trim(),
      time: formatTimeShort(timestamp),
      isMine: true,
      attachments: nextAttachedFiles,
      modelId: selectedModel || "auto",
      checkpointId: checkpoint.id,
    };

    const aiMessage = {
      id: `solo-ai-${timestamp}`,
      from: "Coding Agent",
      initials: "✦",
      text: responseText,
      time: formatTimeShort(timestamp),
      isAI: true,
      modelId: selectedModel || "auto",
      provider,
    };

    const updatedSession = {
      ...session,
      title: isNewSession ? (prompt.trim().slice(0, 60) || "New Session") : session.title,
      updatedAt: formatProjectTimestamp(timestamp),
      lastModel: selectedModel || null,
      messages: [...baseMessages, userMessage, aiMessage],
    };

    const nextSessions = isNewSession
      ? [...existingSessions, updatedSession]
      : existingSessions.map((s) => s.id === updatedSession.id ? updatedSession : s);

    const nextProject = {
      ...project,
      updatedAt: formatProjectTimestamp(timestamp),
      dashboard: {
        ...existingDashboard,
        soloSessions: nextSessions,
      },
    };

    const saved = await saveProject(await syncSharedAgentContextFiles(nextProject));

    // Broadcast to P2P peers + save to shared state
    const soloConversationId = `solo-${updatedSession.id}`;
    broadcastMessageToP2P(projectId, soloConversationId, aiMessage, "solo-chat");

    // Broadcast full conversation update so peer agents share context
    broadcastStateToP2P(projectId, "conversation", soloConversationId, {
      type: "solo-chat",
      projectId,
      sessionId: updatedSession.id,
      newMessages: [userMessage, aiMessage],
    });

    saveConversationToSharedState(project.repoPath, soloConversationId, {
      id: soloConversationId,
      type: "solo-chat",
      projectId,
      sessionId: updatedSession.id,
      title: updatedSession.title,
      messages: [...baseMessages, userMessage, aiMessage],
      updatedAt: new Date(timestamp).toISOString(),
    });

    // Save agent context snapshot so peer machines can continue with full context
    saveAgentContextSnapshot(project.repoPath, {
      scope: "solo",
      id: updatedSession.id,
      projectId,
      taskTitle: updatedSession.title,
      prompt: prompt.trim(),
      responseText,
      model: selectedModel || "auto",
      messages: [...baseMessages, userMessage, aiMessage],
      attachedFiles: nextAttachedFiles,
    });

    return { project: saved, sessionId: updatedSession.id };
  }

  async function sendTaskMessage({ projectId, taskId, threadId, prompt, model, attachedFiles = [], replaceFromMessageId, approvalMode: payloadApprovalMode }) {
    console.log(`[task-agent] START project=${projectId.slice(0,8)} task=${taskId} model=${model || "auto"} len=${prompt?.length}`);
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("A task message is required.");
    }

    if (typeof taskId !== "string" || !taskId.trim()) {
      throw new Error("A task id is required.");
    }

    const commands = await readConfiguredCommands();
    const { settings } = commands;
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    const taskContext = findTaskPlanContext(project, taskId);
    if (!taskContext) {
      throw new Error("Task not found in the current project plan.");
    }

    const existingDashboard = project.dashboard ?? buildEmptyDashboardState(project.description, settings.projectDefaults?.systemPromptMarkdown);
    const existingThreads = Array.isArray(existingDashboard.taskThreads) ? existingDashboard.taskThreads : [];

    const resolvedThread = existingThreads.find((entry) => entry.id === threadId)
      || existingThreads.find((entry) => entry.taskId === taskId)
      || {
        id: `thread-${taskId}`,
        taskId,
        subprojectId: taskContext.subproject.id,
        subprojectTitle: taskContext.subproject.title,
        title: `${taskContext.task.title} session`,
        agentName: taskContext.subproject.agentName || `${project.name} Task Agent`,
        updatedAgo: "Just now",
        summary: taskContext.task.note,
        purpose: taskContext.task.note,
        sessionType: "task",
        systemPromptMarkdown: buildTaskAgentSystemPrompt(taskContext, { title: `${taskContext.task.title} session`, purpose: taskContext.task.note, subprojectTitle: taskContext.subproject.title }),
        contextMarkdown: "",
        contextFilePath: null,
        lastModel: null,
        attachedFiles: [],
        messages: [],
      };

    const hydratedProject = await syncSharedAgentContextFiles({
      ...project,
      dashboard: {
        ...existingDashboard,
        taskThreads: existingThreads.some((entry) => entry.id === resolvedThread.id)
          ? existingThreads
          : [...existingThreads, resolvedThread],
      },
    });

    const latestThread = (hydratedProject.dashboard.taskThreads ?? []).find((entry) => entry.id === resolvedThread.id) || resolvedThread;
    const replaceIndex = replaceFromMessageId
      ? (latestThread.messages ?? []).findIndex((entry) => entry.id === replaceFromMessageId)
      : -1;
    if (replaceFromMessageId && replaceIndex === -1) {
      throw new Error("The message you are trying to edit could not be found.");
    }
    const baseMessagesRaw = replaceIndex >= 0 ? (latestThread.messages ?? []).slice(0, replaceIndex) : (latestThread.messages ?? []);
    const nextAttachedFiles = Array.isArray(attachedFiles)
      ? attachedFiles.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
      : [];
    const checkpoint = await createCheckpointSnapshot(hydratedProject.repoPath, `Before task prompt: ${prompt.trim().slice(0, 80)}`, projectId);
    const taskSystemPrompt = buildTaskAgentSystemPrompt(taskContext, latestThread);

    // Load shared agent context from peer machines (if available)
    const peerContext = await loadPeerAgentContext(hydratedProject.repoPath, "task", taskId);

    // Build CLI invocation based on active provider (agent mode — with tool use)
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    const provider = resolveProvider(settings, selectedModel);

    // Compact message history if conversation chars exceed threshold
    const baseMessages = await compactMessagesIfNeeded(
      baseMessagesRaw, commands, provider, selectedModel, hydratedProject.repoPath,
      async (compacted) => {
        // Persist compacted messages back into settings so future calls start lean
        await settingsService.atomicUpdate((fresh) => {
          const idx = (fresh.projects ?? []).findIndex((p) => p.id === projectId);
          if (idx < 0) return fresh;
          const threads = Array.isArray(fresh.projects[idx].dashboard?.taskThreads)
            ? [...fresh.projects[idx].dashboard.taskThreads]
            : [];
          const tIdx = threads.findIndex((t) => t.id === latestThread.id);
          if (tIdx >= 0) {
            threads[tIdx] = { ...threads[tIdx], messages: compacted };
            fresh.projects[idx].dashboard.taskThreads = threads;
          }
          return { ...fresh };
        });
      }
    );

    const fullPrompt = [
      taskSystemPrompt,
      "Continue this shared CodeBuddy task session.",
      peerContext,
      "",
      "=== CRITICAL SAFETY RULES — VIOLATION WILL CRASH THE APP ===",
      "",
      "You are running INSIDE the CodeBuddy desktop application.",
      "CodeBuddy itself runs on port 3000 (Next.js dev server) and an Electron process.",
      "If you kill, stop, or interfere with port 3000 or any Electron process, YOU WILL CRASH THE APP the user is using right now.",
      "",
      "ABSOLUTELY FORBIDDEN COMMANDS (will destroy the user's session):",
      "- taskkill, Stop-Process, kill, pkill, killall — NEVER kill any process",
      "- netstat + kill/stop combos — NEVER look up ports to kill processes",
      "- npx kill-port, fkill, lsof + kill — NEVER kill anything on any port",
      "- code, code ., code <file> — NEVER open VS Code or any external editor",
      "- explorer, open, start, xdg-open — NEVER open external applications",
      "- Any command that opens a GUI window, browser, or external terminal",
      "- npm start, npx react-scripts start, or dev servers on port 3000 — this port is TAKEN by CodeBuddy",
      "- shutdown, restart, logoff, exit commands",
      "",
      "If a port is in use, DO NOT try to kill the process. Instead, tell the user and suggest using a different port (e.g. PORT=3001 npm start).",
      "",
      "ALLOWED COMMANDS:",
      "- npm install, npm run build, pip install, cargo build — installing and building",
      "- mkdir, touch, echo — creating files and directories",
      "- cat, type, ls, dir, Get-ChildItem — reading files and listing directories",
      "- git add, git commit, git status, git diff — version control",
      "- npm test, pytest, cargo test — running tests",
      "- Any command that reads, creates, or modifies PROJECT files",
      "",
      "ALLOWED FILE OPERATIONS:",
      "- You MAY read and write files using file read/write tools",
      "- You MAY create new files and directories",
      "- All file editing happens through your built-in file tools — NEVER open files in an external editor",
      "",
      "If you need to run a dev server, use a port OTHER than 3000 (e.g. PORT=3001 or --port 3001).",
      "IMPORTANT: Do NOT start long-running dev servers (npm start, npm run dev, npx react-scripts start, etc.) as they will block forever.",
      "Only run commands that complete and exit (install, build, test, file operations, git commands).",
      "If the user needs to run a dev server, tell them to use CodeBuddy's Terminal tab instead of running it yourself.",
      "=== END SAFETY RULES ===",
      "",
      latestThread.contextMarkdown ? `Shared task context markdown:\n${latestThread.contextMarkdown}` : null,
      nextAttachedFiles.length > 0 ? `Attached files from the user:\n${nextAttachedFiles.map((filePath) => `- ${filePath}`).join("\n")}` : null,
      baseMessages.length ? `Recent conversation:\n${buildRecentConversationTranscript(baseMessages)}` : null,
      `Latest user message:\n${prompt.trim()}`,
    ].filter(Boolean).join("\n\n");

    let rawOutput;
    try {
      // Ensure we're on the working branch before the agent modifies files
      ensureOnCodebuddyBuild(hydratedProject.repoPath);
      const approvalMode = payloadApprovalMode || settings.projectDefaults?.approvalMode || "auto";
      rawOutput = await runProviderCli(commands, provider, fullPrompt, selectedModel, { agentMode: true, approvalMode }, hydratedProject.repoPath, {
        projectId,
        taskId,
        threadId: latestThread.id,
        scope: "task-agent",
        phase: "chat",
        model: selectedModel || "auto",
        checkpointId: checkpoint.id,
        promptText: prompt.trim(),
        taskName: taskContext.task.title,
      });
    } catch (programError) {
      // If the CLI exited non-zero but produced stdout, recover the output
      // rather than losing the entire response
      rawOutput = programError.stdout?.trim() || "";
      if (!rawOutput) {
        throw programError;
      }
    }
    const { cleanedOutput, taskStatus, taskStatusReason } = extractTaskAgentMetadata(rawOutput);
    const responseText = formatJsonLikeTaskResponse(cleanedOutput) || "No response returned.";
    const timestamp = Date.now();

    const userMessage = {
      id: `thread-user-${taskId}-${timestamp}`,
      from: "Cameron",
      initials: "CM",
      text: prompt.trim(),
      time: formatTimeShort(timestamp),
      isMine: true,
      attachments: nextAttachedFiles,
      modelId: selectedModel || "auto",
      checkpointId: checkpoint.id,
    };

    const agentMessage = {
      id: `thread-ai-${taskId}-${timestamp}`,
      from: latestThread.agentName || taskContext.subproject.agentName || "Task Agent",
      initials: "✦",
      text: responseText,
      time: formatTimeShort(timestamp),
      isAI: true,
      modelId: selectedModel || "auto",
      provider,
    };

    const statusUpdate = updateTaskStatusInPlan(hydratedProject.dashboard.plan, taskId, taskStatus, timestamp);

    // === Targeted merge instead of full project overwrite ===
    // The agent ran for minutes — P2P conversations may have arrived since hydratedProject was read.
    // Merge only the fields we changed (this thread, task status, activity) into the FRESH settings.
    const savedProject = await (async () => {
      let mergedProject = null;
      await settingsService.atomicUpdate((freshSettings) => {
        const projectIndex = freshSettings.projects?.findIndex(p => p.id === projectId);
        if (projectIndex < 0) return undefined; // no-op

        const freshProject = freshSettings.projects[projectIndex];
        const freshDashboard = freshProject.dashboard || {};

        // 1. Merge the updated thread into the FRESH thread list (preserve P2P-synced threads)
        const freshThreads = Array.isArray(freshDashboard.taskThreads) ? [...freshDashboard.taskThreads] : [];
        const threadIndex = freshThreads.findIndex(t => t.id === latestThread.id);
        const updatedThread = {
          ...(threadIndex >= 0 ? freshThreads[threadIndex] : latestThread),
          updatedAgo: formatRelativeTime(timestamp),
          summary: buildTaskResponseSummary(prompt.trim(), responseText, taskContext.task.title),
          purpose: latestThread.purpose || taskContext.task.note,
          systemPromptMarkdown: taskSystemPrompt,
          lastModel: selectedModel || null,
          attachedFiles: nextAttachedFiles,
          messages: [...baseMessages, userMessage, agentMessage],
        };
        if (threadIndex >= 0) {
          freshThreads[threadIndex] = updatedThread;
        } else {
          freshThreads.push(updatedThread);
        }

        // 2. Update task status in the FRESH plan (preserving any peer status changes)
        const freshStatusUpdate = updateTaskStatusInPlan(freshDashboard.plan || hydratedProject.dashboard.plan, taskId, taskStatus, timestamp);

        // 3. Add activity to the FRESH activity array
        const freshActivity = freshDashboard.activity ?? [];
        const newActivity = [
          ...(freshStatusUpdate.changed ? [{
            id: `activity-task-status-${taskId}-${timestamp}`,
            type: freshStatusUpdate.nextStatus === "done" ? "status" : "build",
            title: freshStatusUpdate.nextStatus === "done" ? "Task marked done" : "Task status updated",
            description: taskStatusReason
              ? `${freshStatusUpdate.taskTitle || taskContext.task.title}: ${taskStatusReason}`
              : `${freshStatusUpdate.taskTitle || taskContext.task.title} is now ${freshStatusUpdate.nextStatus || taskContext.task.status}.`,
            actor: "CodeBuddy",
            actorInitials: "CB",
            time: formatRelativeTime(timestamp),
          }] : []),
          {
            id: `activity-task-${taskId}-${timestamp}`,
            type: "comment",
            title: "Task session updated",
            description: `Continued ${taskContext.task.title} with ${latestThread.agentName || "the task agent"}.`,
            actor: "CodeBuddy",
            actorInitials: "CB",
            time: formatRelativeTime(timestamp),
          },
        ];

        mergedProject = {
          ...freshProject,
          updatedAt: formatProjectTimestamp(timestamp),
          dashboard: {
            ...freshDashboard,
            plan: freshStatusUpdate.plan,
            taskThreads: freshThreads,
            activity: [...newActivity, ...freshActivity],
          },
        };

        freshSettings.projects[projectIndex] = mergedProject;
        return { ...freshSettings };
      });

      // Broadcast agent config snapshot to P2P peers
      if (mergedProject) {
        try {
          if (p2pService && typeof p2pService.broadcastStateChange === "function" && mergedProject.dashboard) {
            p2pService.broadcastStateChange(mergedProject.id, "agents", mergedProject.id, {
              projectId: mergedProject.id,
              projectName: mergedProject.name,
              systemPromptMarkdown: mergedProject.dashboard.systemPromptMarkdown || null,
              defaultModel: mergedProject.dashboard.defaultModel || null,
              taskCount: (mergedProject.dashboard.plan?.subprojects ?? []).reduce((sum, sp) => sum + (sp.tasks?.length ?? 0), 0),
              subprojectCount: mergedProject.dashboard.plan?.subprojects?.length ?? 0,
              updatedAt: mergedProject.updatedAt || new Date().toISOString(),
            });
          }
        } catch (_) { /* swallow */ }
      }

      return mergedProject || hydratedProject;
    })();

    // Broadcast to P2P peers + save to shared state
    const taskConversationId = `task-${latestThread.id}`;
    broadcastMessageToP2P(projectId, taskConversationId, agentMessage, "task-agent");

    // Broadcast full conversation update so peer agents share context
    broadcastStateToP2P(projectId, "conversation", taskConversationId, {
      type: "task-agent",
      projectId,
      taskId,
      threadId: latestThread.id,
      newMessages: [userMessage, agentMessage],
    });

    saveConversationToSharedState(hydratedProject.repoPath, taskConversationId, {
      id: taskConversationId,
      type: "task-agent",
      projectId,
      taskId,
      threadId: latestThread.id,
      title: taskContext.task.title,
      messages: [...baseMessages, userMessage, agentMessage],
      updatedAt: new Date(timestamp).toISOString(),
    });

    // Broadcast task status change to P2P peers
    if (statusUpdate.changed) {
      broadcastStateToP2P(projectId, "tasks", taskId, {
        taskId,
        title: statusUpdate.taskTitle || taskContext.task.title,
        previousStatus: statusUpdate.previousStatus,
        status: statusUpdate.nextStatus,
        subprojectTitle: statusUpdate.subprojectTitle,
        updatedAt: new Date(timestamp).toISOString(),
      });
    }

    // Save agent context snapshot so peer machines can continue with full context
    saveAgentContextSnapshot(hydratedProject.repoPath, {
      scope: "task",
      id: taskId,
      projectId,
      taskTitle: taskContext.task.title,
      prompt: prompt.trim(),
      responseText,
      model: selectedModel || "auto",
      messages: [...baseMessages, userMessage, agentMessage],
      attachedFiles: nextAttachedFiles,
    });

    return {
      project: savedProject,
      threadId: latestThread.id,
    };
  }

  async function generateTaskPrompt({ projectId, taskId, threadId, model }) {
    if (typeof taskId !== "string" || !taskId.trim()) {
      throw new Error("A task id is required.");
    }

    const commands = await readConfiguredCommands();
    const { settings } = commands;
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    const taskContext = findTaskPlanContext(project, taskId);
    if (!taskContext) {
      throw new Error("Task not found in the current project plan.");
    }

    const existingDashboard = project.dashboard ?? buildEmptyDashboardState(project.description, settings.projectDefaults?.systemPromptMarkdown);
    const existingThreads = Array.isArray(existingDashboard.taskThreads) ? existingDashboard.taskThreads : [];
    const activeThread = existingThreads.find((entry) => entry.id === threadId)
      || existingThreads.find((entry) => entry.taskId === taskId)
      || null;
    const recentTranscript = activeThread?.messages?.length ? buildRecentConversationTranscript(activeThread.messages, 10) : "";
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    const generationPrompt = [
      "You generate the next best user prompt for a CodeBuddy task.",
      "Return valid JSON only with this exact shape:",
      '{"prompt":"string","taskStatus":"planned|building|review|done","reason":"string"}',
      "",
      "Rules:",
      "- The prompt should be ready to paste into the task agent chat inside CodeBuddy.",
      "- Make it concrete, project-aware, and specific to the current task.",
      "- If the task already appears complete, set taskStatus to done and explain why in reason.",
      "- If done, still provide a useful prompt for verification, polish, or handoff.",
      "- Do not include markdown fences or any extra text.",
      "",
      "CRITICAL — CodeBuddy Platform Context:",
      "- CodeBuddy is a self-contained desktop workspace with a built-in Terminal, Live Preview, file editor, and Git.",
      "- The generated prompt must NEVER instruct the agent to open VS Code, external terminals, browsers, or any external app.",
      "- If verification or testing is needed, the prompt should tell the agent to guide the user to use CodeBuddy's Terminal tab or Preview tab.",
      "- All file operations, script execution, and previewing happen natively inside CodeBuddy.",
      "- Never generate prompts that say 'open localhost in your browser' — use 'check the Preview tab' instead.",
      "- Never generate prompts that say 'run this in your terminal' without specifying 'in CodeBuddy's Terminal tab'.",
      "",
      `Project name: ${project.name}`,
      `Project description: ${project.description}`,
      `Subproject: ${taskContext.subproject.title}`,
      `Task title: ${taskContext.task.title}`,
      `Task note: ${taskContext.task.note}`,
      `Current task status: ${taskContext.task.status}`,
      taskContext.task.startingPrompt ? `Existing starting prompt:\n${taskContext.task.startingPrompt}` : null,
      activeThread?.summary ? `Latest thread summary: ${activeThread.summary}` : null,
      recentTranscript ? `Recent task conversation:\n${recentTranscript}` : null,
    ].filter(Boolean).join("\n\n");

    const provider = resolveProvider(settings, selectedModel);

    const rawOutput = await runProviderCli(commands, provider, generationPrompt, selectedModel, { agentMode: false }, project.repoPath, {
      projectId,
      taskId,
      threadId: activeThread?.id || null,
      scope: "task-agent",
      phase: "chat",
      model: selectedModel || "auto",
    });

    let parsed = null;
    try {
      parsed = parseJsonObjectFromText(rawOutput);
    } catch {
      parsed = {};
    }

    const promptText = typeof parsed?.prompt === "string" && parsed.prompt.trim()
      ? parsed.prompt.trim()
      : taskContext.task.startingPrompt?.trim() || `Continue work on ${taskContext.task.title}.`;
    const taskStatus = normalizeTaskStatusValue(parsed?.taskStatus) || taskContext.task.status;
    const reason = typeof parsed?.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : taskStatus === "done"
        ? `${taskContext.task.title} appears complete.`
        : `Generated a tailored prompt for ${taskContext.task.title}.`;
    const timestamp = Date.now();
    const statusUpdate = updateTaskStatusInPlan(project.dashboard?.plan, taskId, taskStatus, timestamp);

    if (statusUpdate.changed) {
      const nextProject = await syncSharedAgentContextFiles({
        ...project,
        updatedAt: formatProjectTimestamp(timestamp),
        dashboard: {
          ...existingDashboard,
          plan: statusUpdate.plan,
          activity: [
            {
              id: `activity-task-prompt-status-${taskId}-${timestamp}`,
              type: taskStatus === "done" ? "status" : "build",
              title: taskStatus === "done" ? "Task marked done" : "Task status updated",
              description: reason,
              actor: "CodeBuddy",
              actorInitials: "CB",
              time: formatRelativeTime(timestamp),
            },
            ...(existingDashboard.activity ?? []),
          ],
        },
      });

      await saveProject(nextProject);

      // Broadcast task status change to P2P peers
      broadcastStateToP2P(projectId, "tasks", taskId, {
        taskId,
        title: statusUpdate.taskTitle || taskContext.task.title,
        previousStatus: statusUpdate.previousStatus,
        status: statusUpdate.nextStatus,
        subprojectTitle: statusUpdate.subprojectTitle,
        updatedAt: new Date(timestamp).toISOString(),
      });
    }

    return {
      prompt: promptText,
      taskStatus,
      reason,
    };
  }

  async function restoreCheckpoint(projectId, checkpointId) {
    console.log(`[checkpoint-restore] START projectId=${projectId} checkpointId=${checkpointId}`);
    if (typeof checkpointId !== "string" || !checkpointId.trim()) {
      throw new Error("A checkpoint id is required.");
    }

    const settings = await settingsService.readSettings();
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    console.log(`[checkpoint-restore] found project: ${project.name} repoPath=${project.repoPath}`);
    const manifest = await restoreCheckpointSnapshot(project, checkpointId.trim(), projectId);
    console.log(`[checkpoint-restore] snapshot restored, manifest=`, JSON.stringify(manifest ?? {}).slice(0, 200));

    // Commit and push the restored state immediately so syncWorkspace on reload
    // picks up the restored files from git (not the pre-restore state).
    try {
      const { execSync, execFileSync } = require("child_process");
      const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
      const gitOpts = { cwd: project.repoPath, env: gitEnv, stdio: "pipe", timeout: 30000 };
      execSync("git add -A", gitOpts);
      try {
        // Use argv form so `checkpointId` can never be shell-interpreted.
        const safeId = String(checkpointId).trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40);
        execFileSync("git", ["commit", "-m", `chore: restore checkpoint ${safeId}`], { ...gitOpts, windowsHide: true });
        execSync("git push", gitOpts);
        console.log("[checkpoint] Pushed restored state to git");
      } catch (commitErr) {
        // Nothing to commit (files were already at checkpoint state) — that's fine
        console.log("[checkpoint] Nothing new to commit after restore (files unchanged)");
      }
    } catch (gitErr) {
      console.warn("[checkpoint] Could not commit restored state:", gitErr.message);
    }

    // Clear in-memory taskThreads so syncWorkspace's "keep more messages" merge
    // doesn't win over the restored (fewer-message) state from git.
    try {
      await settingsService.atomicUpdate((fresh) => {
        const idx = (fresh.projects ?? []).findIndex((p) => p.id === projectId);
        if (idx >= 0 && fresh.projects[idx].dashboard) {
          fresh.projects[idx].dashboard.taskThreads = [];
        }
        return { ...fresh };
      });
      console.log("[checkpoint] Cleared in-memory taskThreads so restored state wins on reload");
    } catch (clearErr) {
      console.warn("[checkpoint] Could not clear taskThreads cache:", clearErr.message);
    }

    const timestamp = Date.now();
    const nextProject = {
      ...project,
      updatedAt: formatProjectTimestamp(timestamp),
      dashboard: {
        ...project.dashboard,
        taskThreads: [],
        conversation: project.dashboard?.conversation ?? [],
        activity: [
          {
            id: `activity-checkpoint-${checkpointId}-${timestamp}`,
            type: "status",
            title: "Checkpoint restored",
            description: manifest.label || "Restored a previous CodeBuddy checkpoint.",
            actor: "CodeBuddy",
            actorInitials: "CB",
            time: formatRelativeTime(timestamp),
          },
          ...(project.dashboard?.activity ?? []),
        ],
      },
    };

    console.log(`[checkpoint-restore] saving project state, activityCount=${(project.dashboard?.activity?.length ?? 0) + 1}`);
    const saved = await saveProject(nextProject);
    console.log(`[checkpoint-restore] DONE projectId=${projectId} checkpointId=${checkpointId}`);
    return saved;
  }

  /**
   * Manually compact conversation history for any chat (PM, task thread, or solo session).
   * Forces compaction regardless of the char threshold.
   */
  async function compactConversation(projectId, { taskId, threadId, sessionId } = {}) {
    console.log(`[compact-manual] START projectId=${projectId} taskId=${taskId ?? "n/a"} threadId=${threadId ?? "n/a"} sessionId=${sessionId ?? "n/a"}`);
    const settings = await settingsService.readSettings();
    const project = (settings.projects ?? []).find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found.");

    const commands = await readConfiguredCommands();
    const selectedModel = "sonnet";
    const provider = resolveProvider(settings, selectedModel);

    let messages;
    if (sessionId) {
      const session = (project.dashboard?.soloSessions ?? []).find((s) => s.id === sessionId);
      messages = session?.messages ?? [];
    } else if (taskId && threadId) {
      const thread = (project.dashboard?.taskThreads ?? []).find((t) => t.id === threadId);
      messages = thread?.messages ?? [];
    } else {
      messages = project.dashboard?.conversation ?? [];
    }

    if (!messages || messages.length <= 4) {
      console.log(`[compact-manual] skip: only ${messages?.length ?? 0} messages`);
      return project;
    }

    // Force compaction by temporarily setting threshold to 0
    const toCompact  = messages.slice(0, -3);
    const toKeep     = messages.slice(-3);
    const transcript = buildConversationTranscript(toCompact);

    console.log(`[compact-manual] compacting ${toCompact.length} messages (keeping last 3)`);

    const summaryPrompt = [
      "You are a technical summarizer for an AI coding assistant.",
      "Summarize the following conversation history concisely.",
      "Preserve: what was built/changed, decisions made, current state, any errors or blockers, passwords/tokens/env vars mentioned.",
      "Output plain text only. Maximum 400 words. No headings, no bullet points — just paragraphs.",
      "",
      "=== CONVERSATION TO SUMMARIZE ===",
      transcript,
      "=== END ===",
    ].join("\n");

    const summaryRaw = await runProviderCli(
      commands, provider, summaryPrompt,
      selectedModel, { agentMode: false },
      project.repoPath, null
    );
    const summaryText = (summaryRaw || "").trim();
    if (!summaryText) throw new Error("Compaction produced empty summary.");

    const summaryMessage = {
      id: `compact-${Date.now()}`,
      from: "System",
      text: `[${toCompact.length} earlier messages compacted]\n\n${summaryText}`,
      time: formatTimeShort(Date.now()),
      isCompacted: true,
    };

    const compacted = [summaryMessage, ...toKeep];
    console.log(`[compact-manual] Reduced ${messages.length} → ${compacted.length} messages`);

    // Persist
    const saved = await settingsService.atomicUpdate((fresh) => {
      const idx = (fresh.projects ?? []).findIndex((p) => p.id === projectId);
      if (idx < 0) return fresh;
      if (sessionId) {
        const sessions = fresh.projects[idx].dashboard?.soloSessions ?? [];
        const sIdx = sessions.findIndex((s) => s.id === sessionId);
        if (sIdx >= 0) sessions[sIdx].messages = compacted;
      } else if (taskId && threadId) {
        const threads = fresh.projects[idx].dashboard?.taskThreads ?? [];
        const tidx = threads.findIndex((t) => t.id === threadId);
        if (tidx >= 0) threads[tidx].messages = compacted;
      } else {
        if (fresh.projects[idx].dashboard) {
          fresh.projects[idx].dashboard.conversation = compacted;
        }
      }
      return { ...fresh };
    });

    const updatedProject = (saved.projects ?? []).find((p) => p.id === projectId);
    console.log(`[compact-manual] DONE`);
    return updatedProject ?? project;
  }

  function normalizeScriptValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isDesktopShellCommand(command) {
    return /\b(electron(?:mon)?|tauri|cargo\s+tauri|wails|neutralino|nw(?:js)?|cordova|capacitor)\b/i.test(command);
  }

  function isExternalAppCommand(command) {
    return /\b(code(?:\.cmd)?|explorer(?:\.exe)?)\b/i.test(command)
      || /\bstart\b\s+(?:""\s+)?https?:\/\//i.test(command)
      || /\bopen\b\s+https?:\/\//i.test(command);
  }

  function isLikelyWebServerCommand(command) {
    return /\b(react-scripts\s+start|vite(?:\s|$)|next\s+dev|webpack\s+serve|parcel(?:\s|$)|astro\s+dev|nuxt(?:\s+dev)?|svelte-kit\s+dev|serve(?:\s|$)|http-server|live-server)\b/i.test(command);
  }

  function extractNestedRunScripts(command) {
    const matches = [];
    for (const match of command.matchAll(/\bnpm(?:\.cmd)?\s+run\s+([a-z0-9:_-]+)/ig)) {
      if (match[1]) {
        matches.push(match[1]);
      }
    }
    return matches;
  }

  function isRunnablePreviewScript(name, scriptValue) {
    const script = normalizeScriptValue(scriptValue);
    if (!script) {
      return false;
    }
    if (isDesktopShellCommand(script) || isExternalAppCommand(script)) {
      return false;
    }
    if (/\b(concurrently|wait-on)\b/i.test(script)) {
      return false;
    }

    const normalizedName = name.toLowerCase();
    return normalizedName === "react-start"
      || normalizedName === "serve"
      || /(^|:)(web|client|frontend|renderer)(:|$)/.test(normalizedName)
      || isLikelyWebServerCommand(script);
  }

  function looksLikeDesktopShellPackage(packageJsonContent) {
    if (typeof packageJsonContent !== "string" || !packageJsonContent.trim()) {
      return false;
    }

    try {
      const pkg = JSON.parse(packageJsonContent);
      if (typeof pkg.main === "string" && /electron|tauri|wails|neutralino|nw/i.test(pkg.main)) {
        return true;
      }

      return Object.values(pkg.scripts || {}).some((scriptValue) => {
        const script = normalizeScriptValue(scriptValue);
        return isDesktopShellCommand(script);
      });
    } catch {
      return false;
    }
  }

  function resolvePackagePreviewCommand(packageJsonContent, isWin) {
    if (typeof packageJsonContent !== "string" || !packageJsonContent.trim()) {
      return null;
    }

    const npm = isWin ? "npm.cmd" : "npm";

    try {
      const pkg = JSON.parse(packageJsonContent);
      const scripts = pkg.scripts || {};
      const preferredNames = [
        "preview:web",
        "web:dev",
        "web:start",
        "web",
        "client:dev",
        "client:start",
        "client",
        "frontend:dev",
        "frontend:start",
        "frontend",
        "renderer:dev",
        "renderer:start",
        "renderer",
        "react-start",
        "serve",
      ];

      for (const name of preferredNames) {
        if (isRunnablePreviewScript(name, scripts[name])) {
          return name === "start" ? `${npm} start` : `${npm} run ${name}`;
        }
      }

      for (const wrapperName of ["preview", "dev", "start"]) {
        const wrapper = normalizeScriptValue(scripts[wrapperName]);
        if (!wrapper) {
          continue;
        }

        for (const nestedName of extractNestedRunScripts(wrapper)) {
          if (isRunnablePreviewScript(nestedName, scripts[nestedName])) {
            return `${npm} run ${nestedName}`;
          }
        }
      }

      for (const name of ["dev", "start", "serve"]) {
        const script = normalizeScriptValue(scripts[name]);
        if (!script) {
          continue;
        }
        if (isDesktopShellCommand(script) || isExternalAppCommand(script) || /\b(concurrently|wait-on)\b/i.test(script)) {
          continue;
        }
        if (isLikelyWebServerCommand(script)) {
          return name === "start" ? `${npm} start` : `${npm} run ${name}`;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  function sanitizeLaunchCommand(launchCommand, configFiles, isWin) {
    if (typeof launchCommand !== "string" || !launchCommand.trim()) {
      return launchCommand;
    }

    const packageJsonContent = configFiles["package.json"];
    const previewCommand = resolvePackagePreviewCommand(packageJsonContent, isWin);
    const looksLikeDesktopShell = looksLikeDesktopShellPackage(packageJsonContent);
    const normalizedCommand = launchCommand.trim();
    const shouldReplace = isDesktopShellCommand(normalizedCommand)
      || isExternalAppCommand(normalizedCommand)
      || /\b(concurrently|wait-on)\b/i.test(normalizedCommand)
      || (looksLikeDesktopShell && /\bnpm(?:\.cmd)?\s+(?:run\s+)?(?:dev|start)\b/i.test(normalizedCommand));

    if (previewCommand && shouldReplace) {
      const npm = isWin ? "npm.cmd" : "npm";
      return `${npm} install && ${previewCommand}`;
    }

    return normalizedCommand;
  }

  function detectLaunchCommand(configFiles, isWin) {
    const npm = isWin ? "npm.cmd" : "npm";
    const npx = isWin ? "npx.cmd" : "npx";

    if (configFiles["package.json"]) {
      try {
        const previewCommand = resolvePackagePreviewCommand(configFiles["package.json"], isWin);
        if (previewCommand) {
          return `${npm} install && ${previewCommand}`;
        }
      } catch { /* malformed json */ }
    }

    if (configFiles["requirements.txt"]) {
      return "pip install -r requirements.txt && python manage.py runserver";
    }
    if (configFiles["pyproject.toml"]) {
      return "pip install -e . && python -m flask run || python manage.py runserver";
    }
    if (configFiles["Cargo.toml"]) {
      return "cargo run";
    }
    if (configFiles["go.mod"]) {
      return "go run .";
    }
    if (configFiles["Gemfile"]) {
      return "bundle install && bundle exec rails server";
    }
    if (configFiles["build.gradle"] || configFiles["build.gradle.kts"]) {
      const wrapper = isWin ? ".\\gradlew.bat" : "./gradlew";
      return `${wrapper} bootRun 2>nul || gradle bootRun`;
    }
    if (configFiles["pom.xml"]) {
      const mvn = isWin ? "mvn.cmd" : "mvn";
      return `${mvn} spring-boot:run`;
    }
    if (configFiles["composer.json"]) {
      return "composer install && php artisan serve";
    }
    if (configFiles["mix.exs"]) {
      return "mix deps.get && mix phx.server";
    }
    if (configFiles["docker-compose.yml"] || configFiles["docker-compose.yaml"]) {
      return "docker compose up";
    }
    if (configFiles["Makefile"]) {
      return "make run 2>nul || make";
    }
    // .NET
    if (configFiles[".csproj"] || configFiles[".sln"]) {
      return "dotnet restore && dotnet run";
    }
    // Static HTML — serve with a simple file server
    if (configFiles["index.html"]) {
      return `${npx} serve .`;
    }

    // Last resort
    return `${npm} install && ${npm} run dev`;
  }

  function detectPreviewMode(configFiles, launchCommand) {
    const cmd = (launchCommand || "").toLowerCase();
    // Check for web framework dependencies in package.json
    if (configFiles["package.json"]) {
      try {
        const pkg = JSON.parse(configFiles["package.json"]);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const webFrameworks = ["next", "react-scripts", "vite", "@angular/cli", "nuxt", "gatsby", "svelte", "vue", "webpack-dev-server", "parcel", "astro", "remix", "express", "koa", "hapi", "fastify"];
        if (webFrameworks.some(fw => deps && deps[fw])) return "web";
      } catch { /* malformed */ }
    }
    // Known web-server stacks
    if (configFiles["Gemfile"]) return "web";
    if (configFiles["composer.json"]) return "web";
    if (configFiles["mix.exs"]) return "web";
    if (configFiles["build.gradle"] || configFiles["build.gradle.kts"]) return "web";
    if (configFiles["pom.xml"]) return "web";
    // Python: web if command suggests a web server
    if (configFiles["requirements.txt"] || configFiles["pyproject.toml"]) {
      if (/runserver|flask|uvicorn|gunicorn|manage\.py|django/i.test(cmd)) return "web";
      return "terminal";
    }
    // Static HTML served via file server
    if (configFiles["index.html"] && /serve/i.test(cmd)) return "web";
    // Docker compose — usually web
    if (configFiles["docker-compose.yml"] || configFiles["docker-compose.yaml"]) return "web";
    // CLI / terminal-first stacks
    if (configFiles["Cargo.toml"]) return "terminal";
    if (configFiles["go.mod"]) return "terminal";
    if (configFiles["Makefile"]) return "terminal";
    if (configFiles[".csproj"] || configFiles[".sln"]) return "terminal";
    // Default: web (matches the last-resort npm run dev)
    return "web";
  }

  async function launchDevServer({ projectId, model }) {
    const commands = await readConfiguredCommands();
    const { settings } = commands;
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);
    if (!project) throw new Error("Project not found.");

    const isWin = process.platform === "win32";

    // Read key config files so the agent (and fallback) have full context
    const configNames = [
      "package.json", "Cargo.toml", "pyproject.toml", "requirements.txt",
      "Gemfile", "go.mod", "build.gradle", "build.gradle.kts", "pom.xml",
      "Makefile", "docker-compose.yml", "docker-compose.yaml",
      "composer.json", "mix.exs", "index.html",
    ];
    const configFiles = {};
    for (const name of configNames) {
      try {
        configFiles[name] = await fs.readFile(path.join(project.repoPath, name), "utf8");
      } catch { /* file doesn't exist */ }
    }

    // Also try to find .csproj / .sln files for .NET projects
    try {
      const rootFiles = await fs.readdir(project.repoPath);
      for (const f of rootFiles) {
        if (/\.(csproj|sln)$/i.test(f) && !configFiles[f]) {
          try {
            configFiles[f] = await fs.readFile(path.join(project.repoPath, f), "utf8");
            // Also track under a generic key so detectLaunchCommand can find it
            if (f.endsWith(".csproj")) configFiles[".csproj"] = configFiles[f];
            if (f.endsWith(".sln")) configFiles[".sln"] = configFiles[f];
          } catch { /* skip */ }
        }
      }
    } catch { /* dir read failed */ }

    // Auto-create .env from a template if one doesn't exist yet
    // This prevents first-run failures for projects that ship .env.example
    const envExampleNames = [".env.example", ".env.local.example", ".env.sample", ".env.template"];
    let envFileExists = false;
    try {
      await fs.access(path.join(project.repoPath, ".env"));
      envFileExists = true;
    } catch { /* .env missing */ }
    if (!envFileExists) {
      for (const name of envExampleNames) {
        try {
          const exampleContent = await fs.readFile(path.join(project.repoPath, name), "utf8");
          await fs.writeFile(path.join(project.repoPath, ".env"), exampleContent, "utf8");
          break;
        } catch { /* template doesn't exist, try next */ }
      }
    }

    let readmeContent = "";
    try {
      readmeContent = await fs.readFile(path.join(project.repoPath, "README.md"), "utf8");
    } catch { /* no README */ }

    const { tree } = await gatherProjectSnapshot(project.repoPath, 4000);

    // Build config snippets for the prompt (include actual file contents)
    const configSnippets = Object.entries(configFiles)
      .map(([name, content]) => `### ${name}:\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``)
      .join("\n\n");

    // Lightweight prompt — NO tool use, just analysis from the context we provide
    const launchPrompt = [
      "You are a dev-ops expert. Given the project below, output the EXACT shell command to run the project, predict the port if it starts a web server, and determine the preview mode.",
      "",
      "Rules:",
      "- Output EXACTLY three lines:",
      "  LAUNCH_COMMAND: <command>",
      "  EXPECTED_PORT: <number or none>",
      "  PREVIEW_MODE: <web or terminal>",
      "- Chain install + start with &&  (e.g. LAUNCH_COMMAND: npm.cmd install && npm.cmd run dev)",
      `- Platform: ${isWin ? "Windows" : process.platform}. ${isWin ? "Use npm.cmd/npx.cmd instead of npm/npx." : ""}`,
      "- PREVIEW_MODE: use 'web' if the project starts an HTTP server (web apps, APIs, static sites). Use 'terminal' if the project is a script, CLI tool, automation, scraper, or anything that runs in a terminal without serving HTTP.",
      "- EXPECTED_PORT: only relevant when PREVIEW_MODE is web. Look at scripts in package.json for hardcoded PORT values (e.g. 'set PORT=3001'), .env files, vite.config server.port, next.config, or framework defaults (CRA=3000, Vite=5173, Next=3000, Django=8000, Rails=3000, Go=8080). Output the port the server will ACTUALLY listen on. Use 'none' for terminal mode.",
      "- NEVER launch Electron, Tauri, Wails, Neutralino, a browser window, or VS Code.",
      "- For desktop-wrapper projects, start ONLY the renderer/web dev server (for example react-start, client, renderer, web:dev).",
      "- Avoid concurrently/wait-on wrappers if they also launch a desktop shell.",
      "- The command runs from the project root directory. Do NOT use cd.",
      "- If there are multiple services (monorepo, docker-compose), pick the main one or use concurrently if already configured.",
      "- No other text. ONLY the LAUNCH_COMMAND and EXPECTED_PORT lines.",
      "",
      `Project: ${project.name}`,
      "",
      "## File tree:",
      tree,
      "",
      configSnippets ? `## Config files:\n${configSnippets}` : "",
      readmeContent ? `\n## README (excerpt):\n${readmeContent.slice(0, 1500)}` : "",
    ].filter(Boolean).join("\n");

    // NOTE: No agent mode (no tool use) — keeps the agent fast (text-only analysis)
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    const provider = resolveProvider(settings, selectedModel);

    const requestMeta = {
      projectId,
      scope: "dev-server",
      phase: "launch",
      model: selectedModel || "auto",
    };

    let launchCommand = null;
    let agentOutput = "";
    let expectedPort = null;
    let previewMode = null;
    // Run the agent with a 90-second timeout
    try {
      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("Agent analysis timed out")), 90000);
      });

      const rawOutput = await Promise.race([
        runProviderCli(commands, provider, launchPrompt, selectedModel, { agentMode: false }, project.repoPath, requestMeta),
        timeoutPromise,
      ]).finally(() => clearTimeout(timeoutHandle));

      agentOutput = typeof rawOutput === "string" ? rawOutput : "";
      const cmdMatch = agentOutput.match(/LAUNCH_COMMAND:\s*(.+)/i);
      if (cmdMatch?.[1]?.trim()) {
        launchCommand = sanitizeLaunchCommand(cmdMatch[1].trim(), configFiles, isWin);
      }
      const portMatch = agentOutput.match(/EXPECTED_PORT:\s*(\d+)/i);
      if (portMatch?.[1]) {
        expectedPort = parseInt(portMatch[1], 10);
      }
      const modeMatch = agentOutput.match(/PREVIEW_MODE:\s*(web|terminal)/i);
      if (modeMatch?.[1]) {
        previewMode = modeMatch[1].toLowerCase();
      }
    } catch (err) {
      agentOutput = (err && err.message) || "Agent failed";
      // Kill the child process if it's still running (timeout case)
      if (activeChildProcess && !activeChildProcess.killed) {
        try { activeChildProcess.kill(); } catch { /* ignore */ }
        activeChildProcess = null;
        activeRequestMeta = null;
      }
    }

    // Fallback: smart local detection if agent didn't produce a command
    if (!launchCommand) {
      launchCommand = detectLaunchCommand(configFiles, isWin);
    }

    // Detect preview mode from agent or heuristic
    if (!previewMode) {
      previewMode = detectPreviewMode(configFiles, launchCommand);
    }

    return { output: agentOutput, launchCommand, expectedPort, previewMode };
  }

  async function listRepoCollaborators(repoPath) {
    const commands = await readConfiguredCommands();
    try {
      const remoteResult = await tryRunGit(["remote", "get-url", "origin"], repoPath, commands.git);
      const remoteUrl = (remoteResult.ok ? remoteResult.stdout : "").trim();
      if (!remoteUrl) return [];

      const match = remoteUrl.match(/[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
      if (!match) return [];
      const owner = match[1];
      const nwo = `${owner}/${match[2]}`;

      const result = await tryRunProgram(commands.githubCli, [
        "api", `repos/${nwo}/collaborators`,
        "--jq", '.[] | .login + "||" + .role_name',
      ], repoPath);

      if (!result.ok) {
        // Fallback: simpler jq that just gets logins
        const fallback = await tryRunProgram(commands.githubCli, [
          "api", `repos/${nwo}/collaborators`, "--jq", ".[].login",
        ], repoPath);
        if (!fallback.ok) return [];
        const logins = (fallback.stdout || "").trim().split(/\r?\n/).filter(Boolean);
        return logins.map((login) => ({
          login,
          role: login.toLowerCase() === owner.toLowerCase() ? "Owner" : "Collaborator",
        }));
      }

      // Parse "login||role_name" lines
      const lines = (result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
      return lines.map((line) => {
        const [login, roleName] = line.split("||");
        if (!login) return null;
        const role = login.toLowerCase() === owner.toLowerCase()
          ? "Owner"
          : roleName === "admin" ? "Admin" : "Collaborator";
        return { login, role };
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function setRepoVisibility(repoPath, visibility) {
    const commands = await readConfiguredCommands();
    try {
      const remoteResult = await tryRunGit(["remote", "get-url", "origin"], repoPath, commands.git);
      const remoteUrl = (remoteResult.ok ? remoteResult.stdout : "").trim();
      if (!remoteUrl) throw new Error("No remote origin found");

      const match = remoteUrl.match(/[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
      if (!match) throw new Error("Cannot parse repo from remote URL");
      const nwo = `${match[1]}/${match[2]}`;

      const result = await tryRunProgram(commands.githubCli, [
        "api", "-X", "PATCH", `repos/${nwo}`,
        "-f", `visibility=${visibility}`,
        "--jq", ".visibility",
      ], repoPath);
      if (!result.ok) throw new Error(result.stderr || result.message || "Failed to change visibility");
      return { success: true, visibility: result.stdout.trim() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    __setEventSender,
    listProjects,
    setActiveProject,
    createProject,
    generateProjectPlan,
    sendPMMessage,
    sendTaskMessage,
    generateTaskPrompt,
    launchDevServer,
    sendSoloMessage,
    restoreCheckpoint,
    compactConversation,
    cancelActiveRequest,
    sendToolApproval,
    getPendingApproval: () => activePendingApproval,
    forceResetAgent,
    getActiveRequest,
    ensureGithubRepoForProject,
    deleteProject,
    grantGithubDeleteScope,
    getFallbackProjectRoot,
    listRepoCollaborators,
    setRepoVisibility,
  };
}

module.exports = {
  createProjectService,
};