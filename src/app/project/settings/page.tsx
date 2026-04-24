"use client";

import { useEffect, useState } from "react";

import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

export default function SettingsPage() {
  const { activeProject } = useActiveDesktopProject();
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [repoVisibility, setRepoVisibility] = useState<"private" | "public">("private");
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [systemPromptMarkdown, setSystemPromptMarkdown] = useState("");
  const [approvalMode, setApprovalMode] = useState<"auto" | "manual">("auto");
  const [setupToast, setSetupToast] = useState<string | null>(null);

  /* Collaborators state (fetched from GitHub API) */
  const [collaborators, setCollaborators] = useState<Array<{ login: string; role: string }>>([]);
  const [collabLoading, setCollabLoading] = useState(false);
  const [currentGithubUser, setCurrentGithubUser] = useState<string | null>(null);

  /* Shared Workspace state */
  const [sharedInitialized, setSharedInitialized] = useState<boolean | null>(null);
  const [sharedInitializing, setSharedInitializing] = useState(false);
  const [sharedMembers, setSharedMembers] = useState<Array<{ id: string; name: string; initials: string; role?: string; updatedAt?: string }>>([]);
  const [sharedConversations, setSharedConversations] = useState<Array<{ id: string; title: string; updatedAt: string; messageCount: number; type: string }>>([]);

  const showSetupToast = (msg: string) => { setSetupToast(msg); setTimeout(() => setSetupToast(null), 4000); };

  /* Load collaborators from GitHub */
  const loadCollaborators = async () => {
    if (!activeProject?.repoPath) return;
    setCollabLoading(true);
    try {
      const result = await window.electronAPI?.project?.listCollaborators(activeProject.repoPath);
      setCollaborators(result ?? []);
    } catch {
      setCollaborators([]);
    } finally {
      setCollabLoading(false);
    }
  };

  /* Change GitHub repo visibility */
  const handleVisibilityChange = async (vis: "private" | "public") => {
    if (!activeProject?.repoPath || vis === repoVisibility) return;
    setVisibilityLoading(true);
    try {
      const result = await window.electronAPI?.project?.setRepoVisibility({ repoPath: activeProject.repoPath, visibility: vis });
      if (result?.success) {
        setRepoVisibility(vis);
        showSetupToast(`Repository is now ${vis}`);
      } else {
        showSetupToast(result?.error || "Failed to change visibility");
      }
    } catch {
      showSetupToast("Failed to change visibility");
    } finally {
      setVisibilityLoading(false);
    }
  };

  /* Shared workspace helpers */
  const checkSharedState = async () => {
    if (!activeProject?.repoPath) return;
    try {
      const initialized = await window.electronAPI?.sharedState?.isInitialized(activeProject.repoPath);
      setSharedInitialized(initialized ?? false);
      if (initialized) {
        const [members, conversations] = await Promise.all([
          window.electronAPI?.sharedState?.listMembers(activeProject.repoPath) ?? Promise.resolve([]),
          window.electronAPI?.sharedState?.listConversations(activeProject.repoPath) ?? Promise.resolve([]),
        ]);
        setSharedMembers(members);
        setSharedConversations(conversations);
      }
    } catch {
      setSharedInitialized(false);
    }
  };

  const handleInitSharedWorkspace = async () => {
    if (!activeProject?.repoPath) { showSetupToast("Open a project first"); return; }
    setSharedInitializing(true);
    try {
      await window.electronAPI?.sharedState?.init(activeProject.repoPath);
      showSetupToast("Shared workspace initialized! Commit and push to share with your team.");
      await checkSharedState();
    } catch {
      showSetupToast("Failed to initialize shared workspace");
    } finally {
      setSharedInitializing(false);
    }
  };

  const saveSystemPrompt = async () => {
    if (!window.electronAPI?.settings) return;
    try {
      await window.electronAPI.settings.update({
        projectDefaults: { systemPromptMarkdown },
      });
      showSetupToast("System prompt saved");
    } catch {
      showSetupToast("Failed to save system prompt");
    }
  };

  const saveApprovalMode = async (mode: "auto" | "manual") => {
    setApprovalMode(mode);
    try {
      await window.electronAPI?.settings?.update({ projectDefaults: { approvalMode: mode } });
      showSetupToast(mode === "manual" ? "Manual approval enabled" : "Auto-approve enabled");
    } catch {
      showSetupToast("Failed to save approval mode");
    }
  };

  useEffect(() => {
    if (!activeProject) return;
    setProjectName(activeProject.name);
    setProjectDesc(activeProject.description);
    setRepoVisibility(activeProject.githubVisibility === "public" ? "public" : "private");
  }, [activeProject]);

  useEffect(() => {
    void checkSharedState();
    void loadCollaborators();

    // Load current GitHub username
    void (async () => {
      try {
        const accounts = await window.electronAPI?.tools?.githubListAccounts();
        const active = accounts?.find((a: { active?: boolean }) => a.active);
        if (active?.username) setCurrentGithubUser(active.username);
      } catch { /* */ }
    })();

    // Load system prompt from settings
    void (async () => {
      try {
        const settings = await window.electronAPI?.settings?.get();
        if (settings?.projectDefaults?.systemPromptMarkdown) {
          setSystemPromptMarkdown(settings.projectDefaults.systemPromptMarkdown);
        }
        if (settings?.projectDefaults?.approvalMode) {
          setApprovalMode(settings.projectDefaults.approvalMode as "auto" | "manual");
        }
      } catch { /* */ }
    })();
  }, []);

  const isOwner = currentGithubUser
    ? collaborators.some((c) => c.login.toLowerCase() === currentGithubUser.toLowerCase() && c.role === "Owner")
    : true; // default to true if we can't determine

  return (
    <div className="min-h-full text-text">
      <div className="px-6 py-8 pb-32">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-display-sm font-bold tracking-tight text-text">Settings</h1>
          <p className="mt-1 text-body-sm text-text-dim">Manage your project details, team, and preferences.</p>
        </div>

        <div className="max-w-2xl space-y-8">
          {/* General */}
          <section>
            <h2 className="mb-4 text-body-lg font-semibold text-text">General</h2>
            <div className="surface space-y-4 rounded-2xl p-5">
              <div>
                <label className="mb-1.5 block text-label font-medium text-text-dim">Project name</label>
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
                  {(["private", "public"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => void handleVisibilityChange(v)}
                      disabled={visibilityLoading || !isOwner}
                      className={`rounded-lg px-4 py-2 text-[13px] font-medium capitalize transition disabled:opacity-50 ${
                        repoVisibility === v
                          ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]"
                          : "app-surface-strong theme-muted hover:text-[var(--fg)]"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] theme-muted">
                  {!isOwner
                    ? "Only the project owner can change visibility."
                    : repoVisibility === "public"
                      ? "Anyone on GitHub can see this repository."
                      : "Only you and collaborators can access this repository."}
                </p>
              </div>
            </div>
          </section>

          {/* Collaborators */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold theme-fg">Collaborators</h2>
              <button
                onClick={() => void loadCollaborators()}
                disabled={collabLoading}
                className="rounded-lg border border-black/[0.06] px-3.5 py-1.5 text-[12px] font-semibold theme-muted transition hover:text-[var(--fg)] disabled:opacity-50 dark:border-white/[0.08]"
              >
                {collabLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
            <div className="app-surface overflow-hidden rounded-2xl">
              {collaborators.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-[13px] theme-muted">
                    {collabLoading ? "Loading collaborators…" : "No collaborators found. Add collaborators on GitHub to see them here."}
                  </p>
                </div>
              ) : (
                collaborators.map((c, i) => {
                  const initials = c.login.slice(0, 2).toUpperCase();
                  return (
                    <div
                      key={c.login}
                      className={`flex items-center gap-3 px-5 py-3.5 ${i !== collaborators.length - 1 ? "border-b border-black/[0.04] dark:border-white/[0.08]" : ""}`}
                    >
                      <div className="app-avatar flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold">
                        {initials}
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-medium theme-fg">{c.login}</p>
                        <p className="text-[11px] capitalize theme-muted">{c.role}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* System Prompt */}
          <section>
            <h2 className="mb-4 text-[15px] font-semibold theme-fg">Planner System Prompt</h2>
            <div className="app-surface space-y-4 rounded-2xl p-5">
              <textarea
                value={systemPromptMarkdown}
                onChange={(e) => setSystemPromptMarkdown(e.target.value)}
                rows={10}
                placeholder="Write the markdown instructions that shape each new MVP plan."
                className="app-input w-full resize-y rounded-xl px-3.5 py-3 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
              />
              <p className="text-[12px] theme-muted">
                CodeBuddy prepends this markdown to the initial build prompt before generating the real dashboard plan.
              </p>
              <button
                type="button"
                onClick={() => void saveSystemPrompt()}
                className="rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-cream transition hover:bg-ink/90"
              >
                Save prompt
              </button>
            </div>
          </section>

          {/* Agent Approval Mode */}
          <section>
            <h2 className="mb-4 text-[15px] font-semibold theme-fg">Agent Approval Mode</h2>
            <div className="app-surface space-y-3 rounded-2xl p-5">
              <p className="text-[12px] theme-muted">
                Control whether the agent executes tools automatically or waits for your approval before each action.
              </p>
              <div className="flex gap-2">
                {(["auto", "manual"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => void saveApprovalMode(mode)}
                    className={`rounded-lg px-4 py-2 text-[13px] font-medium capitalize transition ${
                      approvalMode === mode
                        ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]"
                        : "app-surface-strong theme-muted hover:text-[var(--fg)]"
                    }`}
                  >
                    {mode === "auto" ? "Auto Approve" : "Manual Approve"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] theme-muted">
                {approvalMode === "manual"
                  ? "The agent will pause before each tool call. An Allow / Deny button will appear in the chat stream."
                  : "The agent runs without interruption, executing all tools automatically."}
              </p>
            </div>
          </section>

          {/* ═══════════ Shared Workspace — Git-Native Collaboration ═══════════ */}
          <section>
            <div className="mb-4">
              <h2 className="text-[15px] font-semibold theme-fg">Shared Workspace</h2>
              <p className="mt-1 text-[12px] theme-muted">
                Enable free collaboration by syncing conversations, agents, and tasks through Git. No cloud services needed — everything lives in your repo.
              </p>
            </div>

            <div className="app-surface rounded-2xl p-5">
              {/* Init status */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${sharedInitialized ? "bg-emerald-100 dark:bg-emerald-500/15" : "bg-zinc-100 dark:bg-white/[0.06]"}`}>
                    <svg className={`h-5 w-5 ${sharedInitialized ? "text-emerald-600 dark:text-emerald-300" : "theme-muted"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold theme-fg">
                      {sharedInitialized === null ? "Checking…" : sharedInitialized ? "Workspace active" : "Not initialized"}
                    </p>
                    <p className="text-[11px] theme-muted">
                      {sharedInitialized ? `.codebuddy/ directory in your repo` : "Creates a .codebuddy/ folder for shared state"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={sharedInitialized ? () => void checkSharedState() : () => void handleInitSharedWorkspace()}
                  disabled={sharedInitializing || sharedInitialized === null}
                  className={`rounded-xl px-4 py-2 text-[12px] font-semibold transition disabled:opacity-50 ${
                    sharedInitialized
                      ? "border border-black/[0.06] bg-white/80 theme-fg hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                      : "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20 hover:opacity-90"
                  }`}
                >
                  {sharedInitializing ? "Initializing…" : sharedInitialized ? "Refresh" : "Enable Shared Workspace"}
                </button>
              </div>

              {/* Shared members */}
              {sharedInitialized && (
                <div className="mt-5 space-y-4">
                  <div>
                    <h3 className="text-[13px] font-semibold theme-fg">Team members</h3>
                    <p className="mt-0.5 text-[11px] theme-muted">
                      {sharedMembers.length === 0 ? "No members synced yet" : `${sharedMembers.length} member${sharedMembers.length !== 1 ? "s" : ""} in shared workspace`}
                    </p>
                    {sharedMembers.length > 0 && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {sharedMembers.map((m) => (
                          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-black/[0.04] bg-black/[0.015] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                              {m.initials}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium theme-fg">{m.name}</p>
                              <p className="text-[10px] theme-muted">{m.role ?? "Member"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Shared conversations */}
                  <div>
                    <h3 className="text-[13px] font-semibold theme-fg">Synced conversations</h3>
                    <p className="mt-0.5 text-[11px] theme-muted">
                      {sharedConversations.length === 0 ? "No conversations synced yet — they'll appear here after your first chat" : `${sharedConversations.length} conversation${sharedConversations.length !== 1 ? "s" : ""} shared across team`}
                    </p>
                    {sharedConversations.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {sharedConversations.slice(0, 5).map((c) => (
                          <div key={c.id} className="flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.015] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium theme-fg">{c.title}</p>
                              <p className="text-[10px] theme-muted">{c.messageCount} messages · {c.type}</p>
                            </div>
                            <span className="shrink-0 text-[10px] theme-muted">{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* How it works */}
                  <div className="rounded-xl border border-violet-200/50 bg-violet-50/30 p-4 dark:border-violet-500/15 dark:bg-violet-500/[0.04]">
                    <h4 className="text-[12px] font-semibold text-violet-700 dark:text-violet-300">How shared workspaces work</h4>
                    <ul className="mt-2 space-y-1 text-[11px] text-violet-600/90 dark:text-violet-300/70">
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5">•</span>
                        <span>All shared data lives in the <code className="rounded bg-violet-100/50 px-1 py-0.5 font-mono text-[10px] dark:bg-violet-500/10">.codebuddy/</code> folder in your repo</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5">•</span>
                        <span>Sync by pushing and pulling with Git — 100% free, no servers</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5">•</span>
                        <span>Team members see shared conversations, agents, tasks & docs</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="mt-0.5">•</span>
                        <span>Works with GitHub, GitLab, Codeberg — any Git host</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
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

      {/* Setup toast */}
      {setupToast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[9999] flex justify-center">
          <div className="pointer-events-auto animate-in slide-in-from-bottom-4 rounded-2xl bg-[#111214] px-5 py-3 text-[13px] font-medium text-white shadow-[0_16px_40px_rgba(0,0,0,0.25)] ring-1 ring-white/[0.08]">
            {setupToast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
