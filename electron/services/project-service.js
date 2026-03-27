const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const crypto = require("crypto");
const { DEFAULT_SYSTEM_PROMPT_MARKDOWN } = require("./settings-service");

const execFileAsync = promisify(execFile);

const FOLLOW_UP_TRANSCRIPT_LIMIT = 8;
const CHECKPOINT_EXCLUDED_ROOTS = new Set([".git", "node_modules", ".next", "out", "dist", "dist-electron", "tmp"]);

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
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Copilot did not return valid JSON.");
    }

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
    const tasks = (subproject.tasks ?? []).slice(0, 5).map((task, taskIndex) => ({
      id: `task-${project.folderName}-${subprojectIndex + 1}-${taskIndex + 1}`,
      title: task.title?.trim() || `Task ${taskIndex + 1}`,
      status: "planned",
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
      status: "planned",
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

  const aiSummary = payload.summary?.trim() || `I created an MVP plan for ${project.name}.`;
  const conversation = [
    {
      id: `msg-user-${project.id}-${timestamp}`,
      from: "Cameron",
      initials: "CM",
      text: prompt,
      time: "Now",
      isMine: true,
    },
    {
      id: `msg-ai-${project.id}-${timestamp}`,
      from: "Project Manager",
      initials: "✦",
      text: aiSummary,
      time: "Now",
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

  const activity = [
    {
      id: `activity-${project.id}-${timestamp}`,
      type: "build",
      title: "MVP plan generated",
      description: `Created ${subprojects.length} subproject${subprojects.length === 1 ? "" : "s"} for ${project.name}.`,
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
    return "GitHub repo deletion needs GitHub CLI permission for repository deletion. Run `gh auth refresh -h github.com -s delete_repo`, then try again. Nothing was deleted.";
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

  const rootSegment = normalized.split("/")[0];
  return CHECKPOINT_EXCLUDED_ROOTS.has(rootSegment);
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

function buildTaskAgentSystemPrompt(taskContext, thread) {
  return [
    "You are a hands-on task agent inside CodeBuddy.",
    "Do the task work and reply like a collaborator in chat.",
    "Do not output JSON unless the user explicitly asks for JSON.",
    "Prefer short sections, bullets, and concrete next steps over schemas or machine-formatted objects.",
    "Use readable markdown-style formatting with blank lines between sections.",
    "Do not compress the whole answer into one paragraph.",
    "When you list ideas, put each item on its own line.",
    "Assume the user is non-technical and avoid unnecessary jargon.",
    "Use this default response structure unless the user asks for something else: ## What I did, ## Recommended next steps, ## Move to the next task when.",
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

function createProjectService({ app, settingsService }) {
  let eventSender = null;

  function emitAgentEvent(channel, payload) {
    eventSender?.(channel, {
      timestamp: Date.now(),
      ...payload,
    });
  }

  async function readConfiguredCommands() {
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

    return {
      settings,
      git: await resolveCommandPath(configuredGit),
      githubCli: await resolveCommandPath(configuredGithubCli),
    };
  }

  async function createCheckpointSnapshot(repoPath, label) {
    const checkpointId = `checkpoint-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const checkpointRoot = path.join(repoPath, ".codebuddy", "checkpoints", checkpointId);
    const filesRoot = path.join(checkpointRoot, "files");
    const files = await collectCheckpointFiles(repoPath);

    await fs.mkdir(filesRoot, { recursive: true });

    await Promise.all(files.map(async (relativePath) => {
      const sourcePath = path.join(repoPath, relativePath);
      const targetPath = path.join(filesRoot, relativePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const content = await fs.readFile(sourcePath);
      await fs.writeFile(targetPath, content);
    }));

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

  async function restoreCheckpointSnapshot(project, checkpointId) {
    const checkpointRoot = path.join(project.repoPath, ".codebuddy", "checkpoints", checkpointId);
    const manifestPath = path.join(checkpointRoot, "manifest.json");
    const rawManifest = await fs.readFile(manifestPath, "utf8").catch(() => null);

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

  let activeChildProcess = null;
  let activeRequestMeta = null;

  function __setEventSender(sendEvent) {
    eventSender = sendEvent;
  }

  function cancelActiveRequest() {
    if (activeChildProcess && !activeChildProcess.killed) {
      emitAgentEvent("project:agentCancelled", {
        ...activeRequestMeta,
        message: "Stopped by user.",
      });
      activeChildProcess.kill();
    }
    activeChildProcess = null;
    activeRequestMeta = null;
  }

  async function runProgram(file, args, cwd, requestMeta = null) {
    const child = execFile(file, args, { cwd, windowsHide: true }, () => {});
    activeChildProcess = child;
    activeRequestMeta = requestMeta;
    emitAgentEvent("project:agentStarted", {
      ...requestMeta,
      command: [file, ...args].join(" "),
      message: "Starting agent...",
    });
    const result = await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      child.on("spawn", () => {
        emitAgentEvent("project:agentOutput", {
          ...requestMeta,
          stream: "system",
          chunk: "Preparing context...\nWaiting for model response...\n",
        });
      });
      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        emitAgentEvent("project:agentOutput", {
          ...requestMeta,
          stream: "stdout",
          chunk: text,
        });
      });
      child.stderr?.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        emitAgentEvent("project:agentOutput", {
          ...requestMeta,
          stream: "stderr",
          chunk: text,
        });
      });
      child.on("close", (code) => {
        activeChildProcess = null;
        emitAgentEvent("project:agentCompleted", {
          ...requestMeta,
          exitCode: code,
          stdout,
          stderr,
          message: code === 0 || code === null ? "Agent finished." : `Agent exited with code ${code}.`,
        });
        activeRequestMeta = null;
        if (code === 0 || code === null) {
          resolve({ stdout, stderr });
        } else {
          const detail = stderr.trim() || stdout.trim();
          const err = new Error(detail || `Process exited with code ${code}`);
          err.stdout = stdout;
          err.stderr = stderr;
          err.exitCode = code;
          reject(err);
        }
      });
      child.on("error", (err) => {
        activeChildProcess = null;
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

    await runProgram(githubCli, args, project.repoPath);
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

    const pushResult = await tryRunGit(["push", "-u", "origin", "main"], project.repoPath, git);
    if (!pushResult.ok) {
      throw new Error(pushResult.stderr || pushResult.message || "Unable to push this project to GitHub.");
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
    const settings = await settingsService.readSettings();
    const nextProjects = [nextProject, ...(settings.projects ?? []).filter((project) => project.id !== nextProject.id)];

    await settingsService.updateSettings({
      projects: nextProjects,
      activeProjectId: nextProject.id,
      recentRepositories: Array.from(new Set([nextProject.repoPath, ...(settings.recentRepositories ?? [])])).slice(0, 8),
      workspaceRoots: Array.from(new Set([nextProject.repoPath, ...(settings.workspaceRoots ?? [])])).slice(0, 8),
    });

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

    if (deleteGithubRepo) {
      if (!project.githubRepoUrl) {
        throw new Error("This project does not have a connected GitHub repository.");
      }

      const { githubCli } = await readConfiguredCommands();
      const repoSlug = parseGithubRepoSlug(project.githubRepoUrl);
      if (!repoSlug) {
        throw new Error("Unable to determine the GitHub repository name for this project.");
      }

      try {
        await runProgram(githubCli, ["repo", "delete", repoSlug, "--yes"], project.repoPath);
      } catch (error) {
        throw new Error(normalizeGitHubDeleteError(error, githubCli));
      }
    }

    if (deleteLocalFiles && project.repoPath) {
      await fs.rm(project.repoPath, { recursive: true, force: true });
    }

    const nextProjects = currentProjects.filter((entry) => entry.id !== projectId);
    const nextActiveProjectId = settings.activeProjectId === projectId
      ? nextProjects[0]?.id ?? null
      : settings.activeProjectId;

    await settingsService.updateSettings({
      projects: nextProjects,
      activeProjectId: nextActiveProjectId,
      recentRepositories: (settings.recentRepositories ?? []).filter((entry) => entry !== project.repoPath),
      workspaceRoots: (settings.workspaceRoots ?? []).filter((entry) => entry !== project.repoPath),
    });

    return {
      deletedProjectId: project.id,
      activeProjectId: nextActiveProjectId,
      deletedLocalFiles,
      deletedGithubRepo,
    };
  }

  async function setActiveProject(projectId) {
    const settings = await settingsService.readSettings();
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    await settingsService.updateSettings({
      activeProjectId: project.id,
      recentRepositories: Array.from(new Set([project.repoPath, ...(settings.recentRepositories ?? [])])).slice(0, 8),
      workspaceRoots: Array.from(new Set([project.repoPath, ...(settings.workspaceRoots ?? [])])).slice(0, 8),
    });

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
          const pushResult = await tryRunGit(["push", "-u", "origin", "main"], repoPath, git);
          if (!pushResult.ok) {
            throw new Error(pushResult.stderr || pushResult.message || "Unable to push the initial project commit to GitHub.");
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

  async function generateProjectPlan(projectId, prompt, model) {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("An initial project prompt is required.");
    }

    const { settings, githubCli } = await readConfiguredCommands();
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    const systemPromptMarkdown = project.dashboard?.systemPromptMarkdown || settings.projectDefaults?.systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN;
    const fullPrompt = [
      systemPromptMarkdown,
      "Every task must include a strong startingPrompt. The startingPrompt should be ready to paste into a fresh task chat and must tell the task agent exactly what to do first, what files or surfaces to inspect, and what outcome to produce.",
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
            agentName: "string",
            agentBrief: "string",
            tasks: [
              {
                title: "string",
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
      `User request: ${prompt.trim()}`,
    ].join("\n\n");

    const copilotArgs = ["copilot", "--", "-p", fullPrompt, "--allow-all-tools", "--add-dir", ".", "--no-color", "-s"];
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    if (selectedModel && selectedModel !== "auto") {
      copilotArgs.push("--model", selectedModel);
    }

    const rawOutput = await runProgram(githubCli, copilotArgs, project.repoPath, {
      projectId,
      scope: "project-manager",
      phase: "plan",
      model: selectedModel || "auto",
    });
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

    return saveProject(await syncSharedAgentContextFiles(nextProject));
  }

  async function sendPMMessage({ projectId, prompt, model, attachedFiles = [], replaceFromMessageId }) {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("A message is required.");
    }

    const { settings, githubCli } = await readConfiguredCommands();
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
    const baseConversation = replaceIndex >= 0 ? existingConversation.slice(0, replaceIndex) : existingConversation;
    const nextAttachedFiles = Array.isArray(attachedFiles)
      ? attachedFiles.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
      : [];
    const checkpoint = await createCheckpointSnapshot(project.repoPath, `Before PM prompt: ${prompt.trim().slice(0, 80)}`);

    const fullPrompt = [
      systemPromptMarkdown,
      "You are the Project Manager for this CodeBuddy project.",
      "The project plan has already been created. Do NOT regenerate or modify the plan. Only answer the user's question or discuss the project. If the user explicitly asks you to change something, then explain what you would change but do not output JSON.",
      "Keep responses brief, plain-language, and non-technical by default.",
      "When helpful, structure the answer as: What happened, Recommended next step, Move to the next task when.",
      `Project name: ${project.name}`,
      `Project description: ${project.description}`,
      baseConversation.length > 0 ? `Recent conversation:\n${buildRecentConversationTranscript(baseConversation)}` : null,
      nextAttachedFiles.length > 0 ? `Attached files from the user:\n${nextAttachedFiles.map((filePath) => `- ${filePath}`).join("\n")}` : null,
      `Latest user message:\n${prompt.trim()}`,
    ].filter(Boolean).join("\n\n");

    const copilotArgs = ["copilot", "--", "-p", fullPrompt, "--allow-all-tools", "--add-dir", ".", "--no-color", "-s"];
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    if (selectedModel && selectedModel !== "auto") {
      copilotArgs.push("--model", selectedModel);
    }

    const rawOutput = await runProgram(githubCli, copilotArgs, project.repoPath, {
      projectId,
      scope: "project-manager",
      phase: "chat",
      model: selectedModel || "auto",
      checkpointId: checkpoint.id,
    });
    const responseText = rawOutput.trim() || "No response returned.";
    const timestamp = Date.now();

    const userMessage = {
      id: `pm-user-${timestamp}`,
      from: project.creatorName || "Cameron",
      initials: "CM",
      text: prompt.trim(),
      time: "Now",
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
      time: "Now",
      isAI: true,
    };

    const nextProject = {
      ...project,
      updatedAt: formatProjectTimestamp(timestamp),
      dashboard: {
        ...existingDashboard,
        conversation: [...baseConversation, userMessage, aiMessage],
      },
    };

    return saveProject(await syncSharedAgentContextFiles(nextProject));
  }

  async function sendTaskMessage({ projectId, taskId, threadId, prompt, model, attachedFiles = [], replaceFromMessageId }) {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("A task message is required.");
    }

    if (typeof taskId !== "string" || !taskId.trim()) {
      throw new Error("A task id is required.");
    }

    const { settings, githubCli } = await readConfiguredCommands();
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
    const baseMessages = replaceIndex >= 0 ? (latestThread.messages ?? []).slice(0, replaceIndex) : (latestThread.messages ?? []);
    const nextAttachedFiles = Array.isArray(attachedFiles)
      ? attachedFiles.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
      : [];
    const checkpoint = await createCheckpointSnapshot(hydratedProject.repoPath, `Before task prompt: ${prompt.trim().slice(0, 80)}`);
    const taskSystemPrompt = buildTaskAgentSystemPrompt(taskContext, latestThread);

    const fullPrompt = [
      taskSystemPrompt,
      "Continue this shared CodeBuddy task session.",
      latestThread.contextMarkdown ? `Shared task context markdown:\n${latestThread.contextMarkdown}` : null,
      nextAttachedFiles.length > 0 ? `Attached files from the user:\n${nextAttachedFiles.map((filePath) => `- ${filePath}`).join("\n")}` : null,
      baseMessages.length ? `Recent conversation:\n${buildRecentConversationTranscript(baseMessages)}` : null,
      `Latest user message:\n${prompt.trim()}`,
    ].filter(Boolean).join("\n\n");

    const copilotArgs = ["copilot", "--", "-p", fullPrompt, "--allow-all-tools", "--add-dir", ".", "--no-color", "-s"];
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : settings.projectDefaults?.copilotModel?.trim?.() || "";

    if (selectedModel && selectedModel !== "auto") {
      copilotArgs.push("--model", selectedModel);
    }

    const rawOutput = await runProgram(githubCli, copilotArgs, hydratedProject.repoPath, {
      projectId,
      taskId,
      threadId: latestThread.id,
      scope: "task-agent",
      phase: "chat",
      model: selectedModel || "auto",
      checkpointId: checkpoint.id,
    });
    const responseText = formatJsonLikeTaskResponse(rawOutput) || "No response returned.";
    const timestamp = Date.now();

    const userMessage = {
      id: `thread-user-${taskId}-${timestamp}`,
      from: "Cameron",
      initials: "CM",
      text: prompt.trim(),
      time: "Now",
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
      time: "Now",
      isAI: true,
    };

    const nextThreads = (hydratedProject.dashboard.taskThreads ?? []).map((entry) => {
      if (entry.id !== latestThread.id) {
        return entry;
      }

      return {
        ...entry,
        updatedAgo: formatRelativeTime(timestamp),
        summary: buildTaskResponseSummary(prompt.trim(), responseText, taskContext.task.title),
        purpose: entry.purpose || taskContext.task.note,
        systemPromptMarkdown: taskSystemPrompt,
        lastModel: selectedModel || null,
        attachedFiles: nextAttachedFiles,
        messages: [...baseMessages, userMessage, agentMessage],
      };
    });

    const nextProject = await syncSharedAgentContextFiles({
      ...hydratedProject,
      updatedAt: formatProjectTimestamp(timestamp),
      dashboard: {
        ...hydratedProject.dashboard,
        taskThreads: nextThreads,
        activity: [
          {
            id: `activity-task-${taskId}-${timestamp}`,
            type: "comment",
            title: "Task session updated",
            description: `Continued ${taskContext.task.title} with ${latestThread.agentName || "the task agent"}.`,
            actor: "CodeBuddy",
            actorInitials: "CB",
            time: formatRelativeTime(timestamp),
          },
          ...(hydratedProject.dashboard.activity ?? []),
        ],
      },
    });

    return {
      project: await saveProject(nextProject),
      threadId: latestThread.id,
    };
  }

  async function restoreCheckpoint(projectId, checkpointId) {
    if (typeof checkpointId !== "string" || !checkpointId.trim()) {
      throw new Error("A checkpoint id is required.");
    }

    const settings = await settingsService.readSettings();
    const project = (settings.projects ?? []).find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    const manifest = await restoreCheckpointSnapshot(project, checkpointId.trim());
    const timestamp = Date.now();
    const nextProject = {
      ...project,
      updatedAt: formatProjectTimestamp(timestamp),
      dashboard: {
        ...project.dashboard,
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

    return saveProject(nextProject);
  }

  return {
    __setEventSender,
    listProjects,
    setActiveProject,
    createProject,
    generateProjectPlan,
    sendPMMessage,
    sendTaskMessage,
    restoreCheckpoint,
    cancelActiveRequest,
    ensureGithubRepoForProject,
    deleteProject,
    getFallbackProjectRoot,
  };
}

module.exports = {
  createProjectService,
};