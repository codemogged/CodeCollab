const fs = require("fs/promises");
const path = require("path");

const DEFAULT_SYSTEM_PROMPT_MARKDOWN = `# CodeBuddy Project Planner

You are the project planning system for CodeBuddy — a self-contained desktop coding workspace.

Your job is to turn a non-technical user's product request into a practical MVP plan for a desktop coding workspace.

## Goals

- Make the plan understandable to someone with no coding experience.
- Break the MVP into clear subprojects.
- Create concrete implementation tasks in the right build order.
- Keep the first version narrow, testable, and realistic.
- Prefer the smallest useful MVP over feature sprawl.

## CodeBuddy Platform Context

CodeBuddy is a complete, native desktop workspace. All work happens inside CodeBuddy:
- Built-in Terminal tab for running any shell commands (npm, python, cargo, etc.)
- Built-in Live Preview tab for viewing web apps on localhost
- Built-in file editor and Git integration
- Built-in project management dashboard with task agents

CRITICAL: Every task and starting prompt must assume the user stays inside CodeBuddy.
- Never reference VS Code, external terminals, browsers, or any external tools.
- For running scripts or servers, reference CodeBuddy's Terminal tab.
- For previewing web output, reference CodeBuddy's Preview tab.
- All file creation, editing, testing, and deployment orchestration happens inside CodeBuddy.

## Output requirements

- Return valid JSON only.
- Do not wrap the JSON in markdown fences.
- The JSON must match the requested schema exactly.
- Write concise, actionable task titles and notes.
- Every task should include a starting prompt that can be sent to an AI coding agent.
- Starting prompts must reference CodeBuddy's native tools (Terminal tab, Preview tab) instead of external apps.
- Assume CodeBuddy will use this output to populate a project management dashboard.

## Planning rules

- Focus on a real MVP.
- Create 2 to 5 subprojects.
- Create 2 to 5 tasks per subproject.
- Put foundational work first.
- Avoid speculative enterprise features unless explicitly requested.
- Use friendly plain language.
- Prefer product slices a user can test quickly.
`;

const IMPORTED_PROJECT_SYSTEM_PROMPT = `# CodeBuddy Project Analyst

You are the project analysis system for CodeBuddy — a self-contained desktop coding workspace.

Your job is to examine an already-built codebase and produce a clear picture of what exists, what works, and what the developer should focus on next.

## Goals

- Recognize and credit work that is already done.
- Identify the tech stack, architecture, and key patterns.
- Surface incomplete, broken, or missing pieces as actionable next steps.
- Make the dashboard feel like a progress report, not a blank plan.

## CodeBuddy Platform Context

CodeBuddy is a complete, native desktop workspace. All work happens inside CodeBuddy:
- Built-in Terminal tab for running any shell commands (npm, python, cargo, etc.)
- Built-in Live Preview tab for viewing web apps on localhost
- Built-in file editor and Git integration
- Built-in project management dashboard with task agents

CRITICAL: Every task and starting prompt must assume the user stays inside CodeBuddy.
- Never reference VS Code, external terminals, browsers, or any external tools.
- For running scripts or servers, reference CodeBuddy's Terminal tab.
- For previewing web output, reference CodeBuddy's Preview tab.
- All file creation, editing, testing, and deployment orchestration happens inside CodeBuddy.

## Output requirements

- Return valid JSON only.
- Do not wrap the JSON in markdown fences.
- The JSON must match the requested schema exactly.
- Write concise, actionable task titles and notes.
- Every task should include a starting prompt that can be sent to an AI coding agent.
- Starting prompts must reference CodeBuddy's native tools (Terminal tab, Preview tab) instead of external apps.
- Assume CodeBuddy will use this output to populate a project management dashboard.

## Analysis rules

- Group work into 2 to 5 subprojects based on what you see in the codebase.
- Create 2 to 5 tasks per subproject.
- Set each task status to "done" if the code for it clearly exists and works, "building" if partially implemented, or "planned" if it still needs to be built.
- Set each subproject status to "done" if all its tasks are done, "building" if any task is building or a mix, or "planned" if nothing is started.
- Put completed subprojects first, in-progress next, then planned.
- Keep the summary focused on current state, not aspirational plans.
- Use friendly plain language.
- The nextAction should point to the most impactful thing to work on next.
`;

const DEFAULT_SETTINGS = {
  onboardingCompleted: false,
  workspaceRoots: [],
  recentRepositories: [],
  projects: [],
  activeProjectId: null,
  projectDefaults: {
    rootDirectory: "",
    createGithubRepo: true,
    githubVisibility: "private",
    systemPromptMarkdown: DEFAULT_SYSTEM_PROMPT_MARKDOWN,
    copilotModel: "gpt-5.2",
  },
  shell: "default",
  cliTools: {},
  featureFlags: {
    githubCopilotCli: true,
    claudeCode: false,
    codexCli: false,
    githubCompanion: true,
  },
};

function createDefaultDashboardState(systemPromptMarkdown, initialPrompt) {
  return {
    systemPromptMarkdown: systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN,
    initialPrompt: initialPrompt || "",
    lastPlanGeneratedAt: null,
    plan: null,
    conversation: [],
    taskThreads: [],
    activity: [],
    artifacts: [],
    channels: [],
    directMessages: [],
  };
}

function normalizeProject(project, systemPromptMarkdown) {
  const baseDashboard = createDefaultDashboardState(systemPromptMarkdown, project?.description || "");

  return {
    ...project,
    dashboard: {
      ...baseDashboard,
      ...(project?.dashboard ?? {}),
      systemPromptMarkdown:
        project?.dashboard?.systemPromptMarkdown || systemPromptMarkdown || DEFAULT_SYSTEM_PROMPT_MARKDOWN,
      initialPrompt: project?.dashboard?.initialPrompt ?? project?.description ?? "",
      conversation: Array.isArray(project?.dashboard?.conversation) ? project.dashboard.conversation : [],
      taskThreads: Array.isArray(project?.dashboard?.taskThreads) ? project.dashboard.taskThreads : [],
      activity: Array.isArray(project?.dashboard?.activity) ? project.dashboard.activity : [],
      artifacts: Array.isArray(project?.dashboard?.artifacts) ? project.dashboard.artifacts : [],
      channels: Array.isArray(project?.dashboard?.channels) ? project.dashboard.channels : [],
      directMessages: Array.isArray(project?.dashboard?.directMessages) ? project.dashboard.directMessages : [],
    },
  };
}

function normalizeSettings(rawSettings) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    featureFlags: {
      ...DEFAULT_SETTINGS.featureFlags,
      ...(rawSettings?.featureFlags ?? {}),
    },
    projectDefaults: {
      ...DEFAULT_SETTINGS.projectDefaults,
      ...(rawSettings?.projectDefaults ?? {}),
    },
    cliTools: {
      ...DEFAULT_SETTINGS.cliTools,
      ...(rawSettings?.cliTools ?? {}),
    },
  };

  return {
    ...merged,
    projects: Array.isArray(merged.projects)
      ? merged.projects.map((project) => normalizeProject(project, merged.projectDefaults.systemPromptMarkdown))
      : [],
  };
}

function createSettingsService({ app }) {
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  const backupPath = settingsPath + ".bak";
  const tmpPath = settingsPath + ".tmp";

  // ── Write serialization mutex ────────────────────────────────
  // All reads and writes go through this queue so concurrent handlers
  // never read stale snapshots or overwrite each other's changes.
  let _queue = Promise.resolve();
  function enqueue(fn) {
    const task = _queue.then(fn, fn);   // run even if previous rejected
    _queue = task.catch(() => {});       // swallow so chain never breaks
    return task;
  }

  async function _readFromDisk() {
    try {
      const raw = await fs.readFile(settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      // Quick sanity check — projects must be an array
      if (parsed && Array.isArray(parsed.projects)) {
        return normalizeSettings(parsed);
      }
      console.warn("[settings] Parsed settings missing projects array, trying backup...");
    } catch (err) {
      console.warn("[settings] Failed to read settings.json:", err?.message);
    }
    // Try the backup file
    try {
      const raw = await fs.readFile(backupPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.projects)) {
        console.log("[settings] Restored from backup file.");
        // Re-write the main file from backup so we're consistent
        await fs.writeFile(settingsPath, raw, "utf8");
        return normalizeSettings(parsed);
      }
    } catch {
      // No backup either
    }
    console.warn("[settings] No valid settings or backup found, returning defaults.");
    return normalizeSettings({});
  }

  async function _writeToDisk(nextSettings) {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    // Sanity: never write settings with empty projects if we had projects before
    // (protect against race-condition-induced data loss)
    const json = JSON.stringify(nextSettings, null, 2);
    // Atomic write: write to temp → backup old → rename temp to final
    await fs.writeFile(tmpPath, json, "utf8");
    try {
      await fs.copyFile(settingsPath, backupPath);
    } catch {
      // No existing file to backup on first run — that's fine
    }
    await fs.rename(tmpPath, settingsPath);
    return nextSettings;
  }

  /** Serialized read — waits for any pending write to finish first. */
  function readSettings() {
    return enqueue(() => _readFromDisk());
  }

  /** Serialized write — queued behind all pending reads/writes. */
  function writeSettings(nextSettings) {
    return enqueue(() => _writeToDisk(nextSettings));
  }

  /**
   * Serialized read-modify-write — the ENTIRE read+modify+write runs as one
   * atomic unit in the queue, preventing stale-snapshot overwrites.
   */
  function atomicUpdate(mutateFn) {
    return enqueue(async () => {
      const current = await _readFromDisk();
      const next = mutateFn(current);
      if (next === current || next === undefined) return current; // no-op
      return _writeToDisk(next);
    });
  }

  async function updateSettings(patch) {
    return atomicUpdate((current) => ({
      ...current,
      ...patch,
      featureFlags: {
        ...current.featureFlags,
        ...(patch.featureFlags ?? {}),
      },
      projectDefaults: {
        ...current.projectDefaults,
        ...(patch.projectDefaults ?? {}),
      },
      cliTools: {
        ...current.cliTools,
        ...(patch.cliTools ?? {}),
      },
    }));
  }

  return {
    readSettings,
    writeSettings,
    updateSettings,
    atomicUpdate,
    async isFirstRun() {
      const settings = await readSettings();
      return !settings.onboardingCompleted;
    },
    async completeOnboarding() {
      return updateSettings({ onboardingCompleted: true });
    },
  };
}

module.exports = {
  createSettingsService,
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT_MARKDOWN,
  IMPORTED_PROJECT_SYSTEM_PROMPT,
};