"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectSidebar from "@/components/project-sidebar";
import { useTheme } from "@/components/theme-provider";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

const collaborators = [
  { name: "Cameron", initials: "CM", role: "Owner", status: "online" },
  { name: "Nia", initials: "NI", role: "Editor", status: "online" },
  { name: "Nick", initials: "NK", role: "Reviewer", status: "away" },
  { name: "Mia", initials: "MI", role: "Editor", status: "offline" },
];

const copilotModelOptions = [
  "auto",
  "claude-opus-4.6",
  "claude-sonnet-4.6",
  "gpt-5.4",
  "claude-haiku-4.5",
  "claude-opus-4.5",
  "claude-sonnet-4",
  "claude-sonnet-4.5",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-pro-preview",
  "gpt-5.2",
  "gpt-5.1",
  "o3",
];

export default function SettingsPage() {
  const { activeProject } = useActiveDesktopProject();
  const [projectName, setProjectName] = useState("Sneaker Swap");
  const [projectDesc, setProjectDesc] = useState(
    "A premium streetwear and sneaker marketplace where users can buy, sell, and trade verified sneakers and streetwear."
  );
  const [visibility, setVisibility] = useState<"private" | "friends" | "public">("friends");
  const [desktopSettings, setDesktopSettings] = useState<{
    workspaceRoots: string[];
    recentRepositories: string[];
    projects: Array<{
      id: string;
      name: string;
      repoPath: string;
    }>;
    activeProjectId: string | null;
    projectDefaults: {
      rootDirectory: string;
      createGithubRepo: boolean;
      githubVisibility: "private" | "public";
      systemPromptMarkdown: string;
    };
    shell: string;
    cliTools: Record<string, string>;
    featureFlags: {
      githubCopilotCli: boolean;
      claudeCode: boolean;
      githubCompanion: boolean;
    };
  } | null>(null);
  const [toolStatuses, setToolStatuses] = useState<Array<{
    id: string;
    label: string;
    available: boolean;
    command: string;
    detail: string;
  }>>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [githubCliPath, setGithubCliPath] = useState("");
  const [gitPath, setGitPath] = useState("");
  const [projectRoot, setProjectRoot] = useState("");
  const [createGithubRepoByDefault, setCreateGithubRepoByDefault] = useState(true);
  const [projectGithubVisibility, setProjectGithubVisibility] = useState<"private" | "public">("private");
  const [systemPromptMarkdown, setSystemPromptMarkdown] = useState("");
  const [copilotModel, setCopilotModel] = useState("gpt-5.2");
  const [canUseDesktopApi, setCanUseDesktopApi] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    if (!activeProject) {
      return;
    }

    setProjectName(activeProject.name);
    setProjectDesc(activeProject.description);
    setVisibility(activeProject.githubVisibility === "public" ? "public" : "private");
  }, [activeProject]);

  const copilotStatus = useMemo(
    () => toolStatuses.find((tool) => tool.id === "githubCopilotCli") ?? null,
    [toolStatuses],
  );

  async function loadDesktopIntegrations() {
    if (!window.electronAPI?.settings || !window.electronAPI?.tools) {
      return;
    }

    try {
      setToolsLoading(true);
      setToolsError(null);

      const [nextSettings, nextStatuses] = await Promise.all([
        window.electronAPI.settings.get(),
        window.electronAPI.tools.listStatus(),
      ]);

      setDesktopSettings(nextSettings);
      setGithubCliPath(nextSettings.cliTools.githubCli ?? "");
      setGitPath(nextSettings.cliTools.git ?? "");
      setProjectRoot(nextSettings.projectDefaults.rootDirectory ?? "");
      setCreateGithubRepoByDefault(nextSettings.projectDefaults.createGithubRepo ?? true);
      setProjectGithubVisibility(nextSettings.projectDefaults.githubVisibility ?? "private");
      setSystemPromptMarkdown(nextSettings.projectDefaults.systemPromptMarkdown ?? "");
      setCopilotModel(nextSettings.projectDefaults.copilotModel ?? "gpt-5.2");
      setToolStatuses(nextStatuses);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load desktop integrations.";
      setToolsError(message);
    } finally {
      setToolsLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCanUseDesktopApi(Boolean(window.electronAPI?.settings && window.electronAPI?.tools && window.electronAPI?.system));
    }

    void loadDesktopIntegrations();
  }, []);

  const saveToolPaths = async () => {
    if (!window.electronAPI?.settings) {
      return;
    }

    try {
      setToolsLoading(true);
      setToolsError(null);
      const nextSettings = await window.electronAPI.settings.update({
        cliTools: {
          ...(desktopSettings?.cliTools ?? {}),
          githubCli: githubCliPath.trim(),
          git: gitPath.trim(),
        },
      });
      setDesktopSettings(nextSettings);
      await loadDesktopIntegrations();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save tool paths.";
      setToolsError(message);
      setToolsLoading(false);
    }
  };

  const chooseProjectRoot = async () => {
    if (!window.electronAPI?.system) {
      return;
    }

    const selectedPath = await window.electronAPI.system.openDirectory();
    if (selectedPath) {
      setProjectRoot(selectedPath);
    }
  };

  const saveProjectDefaults = async () => {
    if (!window.electronAPI?.settings) {
      return;
    }

    try {
      setToolsLoading(true);
      setToolsError(null);
      const nextSettings = await window.electronAPI.settings.update({
        projectDefaults: {
          ...(desktopSettings?.projectDefaults ?? {}),
          rootDirectory: projectRoot.trim(),
          createGithubRepo: createGithubRepoByDefault,
          githubVisibility: projectGithubVisibility,
          systemPromptMarkdown,
          copilotModel: copilotModel.trim() || "gpt-5.2",
        },
      });
      setDesktopSettings(nextSettings);
      await loadDesktopIntegrations();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save project defaults.";
      setToolsError(message);
      setToolsLoading(false);
    }
  };

  return (
    <div className="flex min-h-full bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="min-w-0 flex-1 px-5 pb-32 pt-[5.6rem] sm:px-6 xl:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="display-font text-[22px] font-bold tracking-tight theme-fg">Settings</h1>
          <p className="mt-1 text-[13px] theme-muted">Manage your project details, team, and preferences.</p>
        </div>

        <div className="max-w-2xl space-y-8">
          {/* General */}
          <section>
            <h2 className="mb-4 text-[15px] font-semibold theme-fg">General</h2>
            <div className="app-surface space-y-4 rounded-2xl p-5">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium theme-muted">Project name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium theme-muted">Description</label>
                <textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  rows={3}
                  className="app-input w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium theme-muted">Visibility</label>
                <div className="flex gap-2">
                  {(["private", "friends", "public"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVisibility(v)}
                      className={`rounded-lg px-4 py-2 text-[13px] font-medium capitalize transition ${
                        visibility === v
                          ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]"
                          : "app-surface-strong theme-muted hover:text-[var(--fg)]"
                      }`}
                    >
                      {v === "friends" ? "Friends only" : v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Collaborators */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold theme-fg">Collaborators</h2>
              <button className="rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-cream transition hover:bg-ink/90">
                Invite friend
              </button>
            </div>
            <div className="app-surface overflow-hidden rounded-2xl">
              {collaborators.map((c, i) => (
                <div
                  key={c.name}
                  className={`flex items-center gap-3 px-5 py-3.5 ${i !== collaborators.length - 1 ? "border-b border-black/[0.04] dark:border-white/[0.08]" : ""}`}
                >
                  <div className="relative">
                    <div className="app-avatar flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold">
                      {c.initials}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                        c.status === "online" ? "bg-emerald-400" : c.status === "away" ? "bg-amber-400" : "bg-gray-300"
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-medium theme-fg">{c.name}</p>
                    <p className="text-[11px] theme-muted">{c.role}</p>
                  </div>
                  {c.role !== "Owner" && (
                    <button className="app-surface-strong rounded-lg px-3 py-1.5 text-[12px] font-medium theme-muted transition hover:text-[var(--fg)]">
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Appearance */}
          <section>
            <h2 className="mb-4 text-[15px] font-semibold theme-fg">Appearance</h2>
            <div className="app-surface space-y-4 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium theme-fg">Theme</p>
                  <p className="mt-0.5 text-[12px] theme-muted">Switch between light and dark mode.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => theme !== "light" && toggle()}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition ${
                      theme === "light"
                        ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]"
                        : "app-surface-strong theme-muted hover:text-[var(--fg)]"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.06 1.06l1.06 1.06z" />
                    </svg>
                    Light
                  </button>
                  <button
                    onClick={() => theme !== "dark" && toggle()}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition ${
                      theme === "dark"
                        ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]"
                        : "app-surface-strong theme-muted hover:text-[var(--fg)]"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clipRule="evenodd" />
                    </svg>
                    Dark
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold theme-fg">Desktop integrations</h2>
                <p className="mt-1 text-[12px] theme-muted">CodeBuddy can use GitHub Copilot through <span className="font-mono">gh copilot</span> once GitHub CLI is installed and authenticated.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadDesktopIntegrations()}
                disabled={toolsLoading}
                className="rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-cream transition hover:bg-ink/90 disabled:cursor-wait disabled:opacity-70"
              >
                {toolsLoading ? "Refreshing..." : "Refresh status"}
              </button>
            </div>

            <div className="app-surface space-y-5 rounded-2xl p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {toolStatuses.map((tool) => (
                  <div key={tool.id} className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold theme-fg">{tool.label}</p>
                        <p className="mt-1 text-[11px] font-mono theme-muted">{tool.command}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tool.available ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200" : "bg-amber-100 text-amber-700 dark:bg-amber-500/12 dark:text-amber-200"}`}>
                        {tool.available ? "Ready" : "Missing"}
                      </span>
                    </div>
                    <p className="mt-3 text-[12px] leading-relaxed theme-muted">{tool.detail}</p>
                  </div>
                ))}
              </div>

              {!canUseDesktopApi ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  Open the Electron desktop app to manage real local tools. The browser build cannot inspect local executables.
                </p>
              ) : null}

              {toolsError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {toolsError}
                </p>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium theme-muted">GitHub CLI path override</label>
                  <input
                    type="text"
                    value={githubCliPath}
                    onChange={(event) => setGithubCliPath(event.target.value)}
                    placeholder="Use PATH default if blank"
                    className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium theme-muted">Git path override</label>
                  <input
                    type="text"
                    value={gitPath}
                    onChange={(event) => setGitPath(event.target.value)}
                    placeholder="Use PATH default if blank"
                    className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-semibold theme-fg">Project creation defaults</p>
                    <p className="mt-1 text-[12px] theme-muted">New projects can create a local folder and matching GitHub repo automatically.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void chooseProjectRoot()}
                    disabled={!canUseDesktopApi}
                    className="rounded-lg bg-black/[0.05] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.08] disabled:opacity-50 dark:bg-white/[0.08]"
                  >
                    Choose folder
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-[12px] font-medium theme-muted">Default project root</label>
                    <input
                      type="text"
                      value={projectRoot}
                      onChange={(event) => setProjectRoot(event.target.value)}
                      placeholder="Documents/CodeBuddy Projects"
                      className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                    />
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-black/[0.06] px-3.5 py-2.5 text-[13px] theme-fg dark:border-white/[0.08]">
                    <input
                      type="checkbox"
                      checked={createGithubRepoByDefault}
                      onChange={(event) => setCreateGithubRepoByDefault(event.target.checked)}
                      className="h-4 w-4 rounded border-black/[0.18]"
                    />
                    Create GitHub repo by default
                  </label>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium theme-muted">Default GitHub visibility</label>
                    <div className="flex gap-2">
                      {(["private", "public"] as const).map((visibility) => (
                        <button
                          key={visibility}
                          type="button"
                          onClick={() => setProjectGithubVisibility(visibility)}
                          className={`rounded-lg px-4 py-2 text-[13px] font-medium capitalize transition ${projectGithubVisibility === visibility ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "app-surface-strong theme-muted hover:text-[var(--fg)]"}`}
                        >
                          {visibility}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium theme-muted">Default Copilot model</label>
                    <select
                      value={copilotModel}
                      onChange={(event) => setCopilotModel(event.target.value)}
                      className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                    >
                      {copilotModelOptions.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-[12px] font-medium theme-muted">Planner system prompt</label>
                    <textarea
                      value={systemPromptMarkdown}
                      onChange={(event) => setSystemPromptMarkdown(event.target.value)}
                      rows={10}
                      placeholder="Write the markdown instructions that shape each new MVP plan."
                      className="app-input w-full resize-y rounded-xl px-3.5 py-3 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                    />
                    <p className="mt-2 text-[12px] theme-muted">
                      CodeBuddy prepends this markdown to the initial build prompt before generating the real dashboard plan.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void saveProjectDefaults()}
                    disabled={!canUseDesktopApi || toolsLoading}
                    className="rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-cream transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save project defaults
                  </button>
                  <p className="text-[12px] theme-muted">
                    {desktopSettings?.projects.length ?? 0} real project{desktopSettings && desktopSettings.projects.length === 1 ? "" : "s"} tracked locally
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveToolPaths()}
                  disabled={!canUseDesktopApi || toolsLoading}
                  className="rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-cream transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save tool paths
                </button>
                <p className="text-[12px] theme-muted">
                  Copilot status: {copilotStatus?.available ? "ready through gh copilot" : "GitHub CLI is not ready yet on this machine"}
                </p>
              </div>
            </div>
          </section>

          {/* Danger zone */}
          <section>
            <h2 className="mb-4 text-[15px] font-semibold text-red-600">Danger zone</h2>
            <div className="danger-surface rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium theme-fg">Delete project</p>
                  <p className="mt-0.5 text-[12px] theme-soft">This action cannot be undone. All code and history will be permanently removed.</p>
                </div>
                <button className="danger-button rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition">
                  Delete
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
