const fs = require("fs/promises");
const path = require("path");

const DEFAULT_SYSTEM_PROMPT_MARKDOWN = `# CodeBuddy Project Planner

You are the project planning system for CodeBuddy.

Your job is to turn a non-technical user's product request into a practical MVP plan for a desktop coding workspace.

## Goals

- Make the plan understandable to someone with no coding experience.
- Break the MVP into clear subprojects.
- Create concrete implementation tasks in the right build order.
- Keep the first version narrow, testable, and realistic.
- Prefer the smallest useful MVP over feature sprawl.

## Output requirements

- Return valid JSON only.
- Do not wrap the JSON in markdown fences.
- The JSON must match the requested schema exactly.
- Write concise, actionable task titles and notes.
- Every task should include a starting prompt that can be sent to an AI coding agent.
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

const DEFAULT_SETTINGS = {
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

  async function readSettings() {
    try {
      const raw = await fs.readFile(settingsPath, "utf8");
      return normalizeSettings(JSON.parse(raw));
    } catch {
      return normalizeSettings({});
    }
  }

  async function writeSettings(nextSettings) {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(nextSettings, null, 2), "utf8");
    return nextSettings;
  }

  async function updateSettings(patch) {
    const current = await readSettings();
    const next = {
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
    };

    return writeSettings(next);
  }

  return {
    readSettings,
    updateSettings,
  };
}

module.exports = {
  createSettingsService,
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT_MARKDOWN,
};