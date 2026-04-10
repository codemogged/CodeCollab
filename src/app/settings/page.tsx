"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components";
import { useTheme } from "@/components/theme-provider";

/* ─── AI tool setup types ─── */
interface AiToolSetupState {
  checking: boolean;
  installing: boolean;
  status: "unknown" | "ready" | "missing" | "error";
  detail: string;
}
const defaultToolState: AiToolSetupState = { checking: false, installing: false, status: "unknown", detail: "" };

const copilotModelOptions = [
  { id: "auto", label: "Auto", usage: "10% discount", provider: "Best available" },
  { id: "claude-opus-4.6", label: "Claude Opus 4.6", usage: "3x", provider: "Anthropic" },
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", usage: "1x", provider: "Anthropic" },
  { id: "gpt-5.4", label: "GPT-5.4", usage: "1x", provider: "OpenAI" },
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", usage: "0.33x", provider: "Anthropic" },
  { id: "claude-opus-4.5", label: "Claude Opus 4.5", usage: "3x", provider: "Anthropic" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4", usage: "1x", provider: "Anthropic" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", usage: "1x", provider: "Anthropic" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", usage: "1x", provider: "Google" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", usage: "0.33x", provider: "Google" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)", usage: "1x", provider: "Google" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", usage: "1x", provider: "Google" },
  { id: "gpt-5.2", label: "GPT-5.2", usage: "1x", provider: "OpenAI" },
  { id: "gpt-5.1", label: "GPT-5.1", usage: "1x", provider: "OpenAI" },
  { id: "o3", label: "o3", usage: "1x", provider: "OpenAI" },
];

const claudeCodeModelOptions = [
  { id: "sonnet", label: "Claude Sonnet (Latest)", usage: "Included", provider: "Claude Code" },
  { id: "opus", label: "Claude Opus (Latest)", usage: "Included", provider: "Claude Code" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", usage: "Included", provider: "Claude Code" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", usage: "Included", provider: "Claude Code" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", usage: "Included", provider: "Claude Code" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", usage: "Included", provider: "Claude Code" },
];

const codexModelOptions = [
  { id: "auto", label: "Auto", usage: "Default", provider: "OpenAI" },
  { id: "codex-mini", label: "Codex Mini", usage: "Included", provider: "OpenAI" },
  { id: "o4-mini", label: "o4-mini", usage: "Included", provider: "OpenAI" },
  { id: "o3", label: "o3", usage: "Included", provider: "OpenAI" },
  { id: "gpt-4.1", label: "GPT-4.1", usage: "Included", provider: "OpenAI" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", usage: "Included", provider: "OpenAI" },
];

interface GithubAccount {
  host: string;
  username: string;
  active?: boolean;
}

interface DesktopSettings {
  displayName?: string;
  projectDefaults: {
    rootDirectory: string;
    createGithubRepo: boolean;
    githubVisibility: "private" | "public";
    systemPromptMarkdown: string;
    copilotModel: string;
  };
  cliTools: Record<string, string>;
  featureFlags: {
    githubCopilotCli: boolean;
    claudeCode: boolean;
    codexCli: boolean;
    githubCompanion: boolean;
  };
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const [canUseDesktopApi, setCanUseDesktopApi] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* GitHub account state */
  const [githubAccounts, setGithubAccounts] = useState<GithubAccount[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubAuthInProgress, setGithubAuthInProgress] = useState(false);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);

  /* Desktop settings state */
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings | null>(null);
  const [toolStatuses, setToolStatuses] = useState<Array<{ id: string; label: string; available: boolean; command: string; detail: string }>>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [githubCliPath, setGithubCliPath] = useState("");
  const [gitPath, setGitPath] = useState("");
  const [projectRoot, setProjectRoot] = useState("");
  const [createGithubRepoByDefault, setCreateGithubRepoByDefault] = useState(true);
  const [projectGithubVisibility, setProjectGithubVisibility] = useState<"private" | "public">("private");
  const [copilotModel, setCopilotModel] = useState("gpt-5.2");

  /* AI Tools setup state */
  const [claudeCodeSetup, setClaudeCodeSetup] = useState<AiToolSetupState>(defaultToolState);
  const [copilotSetup, setCopilotSetup] = useState<AiToolSetupState>(defaultToolState);
  const [codexSetup, setCodexSetup] = useState<AiToolSetupState>(defaultToolState);
  const [expandClaudeDetail, setExpandClaudeDetail] = useState(false);
  const [expandCopilotDetail, setExpandCopilotDetail] = useState(false);
  const [expandCodexDetail, setExpandCodexDetail] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const activeAccount = useMemo(() => githubAccounts.find((a) => a.active), [githubAccounts]);

  /* ─── Load GitHub accounts ─── */
  const loadGithubAccounts = async () => {
    setGithubLoading(true);
    try {
      const accounts = await window.electronAPI?.tools?.githubListAccounts();
      setGithubAccounts(accounts ?? []);
    } catch {
      setGithubAccounts([]);
    } finally {
      setGithubLoading(false);
    }
  };

  const handleAddGithubAccount = async () => {
    setGithubAuthInProgress(true);
    setDeviceCode(null);
    setVerificationUrl(null);
    try {
      const stopListening = window.electronAPI?.tools?.onGithubAuthProgress((event) => {
        if (event.deviceCode) setDeviceCode(event.deviceCode);
        if (event.verificationUrl) setVerificationUrl(event.verificationUrl);
      });
      const result = await window.electronAPI?.tools?.githubAuthLogin();
      stopListening?.();
      if (result?.success) {
        showToast("GitHub account connected!");
        await loadGithubAccounts();
      } else {
        showToast("GitHub auth failed or was cancelled");
      }
    } catch {
      showToast("GitHub auth failed");
    } finally {
      setGithubAuthInProgress(false);
      setDeviceCode(null);
      setVerificationUrl(null);
    }
  };

  const handleSwitchAccount = async (username: string) => {
    try {
      const result = await window.electronAPI?.tools?.githubSwitchAccount(username);
      if (result?.success) {
        showToast(`Switched to ${username}`);
        await loadGithubAccounts();
      } else {
        showToast("Failed to switch account");
      }
    } catch {
      showToast("Failed to switch account");
    }
  };

  const handleLogoutAccount = async () => {
    const active = githubAccounts.find((a) => a.active);
    try {
      const result = await window.electronAPI?.tools?.githubAuthLogout(active?.username);
      if (result?.success) {
        showToast("GitHub account disconnected");
        await loadGithubAccounts();
      } else {
        showToast(result?.detail ?? "Failed to disconnect");
      }
    } catch {
      showToast("Failed to disconnect");
    }
  };

  /* ─── Desktop integrations ─── */
  const applyDesktopSettings = (s: DesktopSettings) => {
    setDesktopSettings(s);
    setGithubCliPath(s.cliTools?.githubCli ?? "");
    setGitPath(s.cliTools?.git ?? "");
    setProjectRoot(s.projectDefaults?.rootDirectory ?? "");
    setCreateGithubRepoByDefault(s.projectDefaults?.createGithubRepo ?? true);
    setProjectGithubVisibility(s.projectDefaults?.githubVisibility ?? "private");
    setCopilotModel(s.projectDefaults?.copilotModel ?? "gpt-5.2");
  };

  const loadDesktopIntegrations = async () => {
    if (!window.electronAPI?.settings || !window.electronAPI?.tools) return;
    try {
      setToolsLoading(true);
      const [nextSettings, nextStatuses] = await Promise.all([
        window.electronAPI.settings.get(),
        window.electronAPI.tools.listStatus(),
      ]);
      applyDesktopSettings(nextSettings);
      setToolStatuses(nextStatuses);
    } catch { /* */ } finally {
      setToolsLoading(false);
    }
  };

  const checkClaudeCode = async () => {
    setClaudeCodeSetup((s) => ({ ...s, checking: true }));
    try {
      const statuses = await window.electronAPI?.tools?.listStatus();
      const claude = statuses?.find((t: { id: string }) => t.id === "claudeCode");
      setClaudeCodeSetup(claude?.available
        ? { checking: false, installing: false, status: "ready", detail: claude.detail || "Claude Code is ready" }
        : { checking: false, installing: false, status: "missing", detail: "Not found — click Setup to install" });
    } catch {
      setClaudeCodeSetup({ checking: false, installing: false, status: "error", detail: "Could not check status" });
    }
  };

  const checkGithubCopilot = async () => {
    setCopilotSetup((s) => ({ ...s, checking: true }));
    try {
      const statuses = await window.electronAPI?.tools?.listStatus();
      const copilot = statuses?.find((t: { id: string }) => t.id === "githubCopilotCli");
      const gh = statuses?.find((t: { id: string }) => t.id === "githubCli");
      if (copilot?.available) {
        setCopilotSetup({ checking: false, installing: false, status: "ready", detail: "GitHub Copilot CLI is ready" });
      } else if (gh?.available) {
        setCopilotSetup({ checking: false, installing: false, status: "missing", detail: "GitHub CLI found — Copilot extension needed" });
      } else {
        setCopilotSetup({ checking: false, installing: false, status: "missing", detail: "GitHub CLI not found — click Setup to install" });
      }
    } catch {
      setCopilotSetup({ checking: false, installing: false, status: "error", detail: "Could not check status" });
    }
  };

  const handleSetupClaudeCode = async () => {
    setClaudeCodeSetup((s) => ({ ...s, installing: true, detail: "Installing Claude Code…" }));
    try {
      const result = await window.electronAPI?.tools?.installClaude();
      if (!result?.success) {
        showToast("Install failed — see details");
        setClaudeCodeSetup({ checking: false, installing: false, status: "missing", detail: result?.detail || "All install strategies failed. Try: npm install -g @anthropic-ai/claude-code" });
        return;
      }
      // Install succeeded — auto-trigger OAuth
      setClaudeCodeSetup({ checking: false, installing: true, status: "ready", detail: "Installed — opening sign-in…" });
      showToast("Claude Code installed — starting auth…");
      try {
        const authStatus = await window.electronAPI?.tools?.claudeAuthStatus();
        if (!authStatus?.authenticated) {
          await window.electronAPI?.tools?.claudeAuthLogin();
        }
      } catch { /* auth is optional */ }
      await checkClaudeCode();
    } catch {
      setClaudeCodeSetup({ checking: false, installing: false, status: "error", detail: "Install failed — try: npm install -g @anthropic-ai/claude-code" });
    }
  };

  const handleSetupGithubCopilot = async () => {
    setCopilotSetup((s) => ({ ...s, installing: true, detail: "Installing GitHub Copilot CLI…" }));
    try {
      const result = await window.electronAPI?.tools?.installCopilot();
      if (!result?.success) {
        showToast("Install failed — see details");
        setCopilotSetup({ checking: false, installing: false, status: "missing", detail: result?.detail || "All install strategies failed" });
        return;
      }
      showToast("GitHub Copilot CLI is ready!");
      await checkGithubCopilot();
    } catch {
      setCopilotSetup({ checking: false, installing: false, status: "error", detail: "Setup failed" });
    }
  };

  const checkCodexCli = async () => {
    setCodexSetup((s) => ({ ...s, checking: true }));
    try {
      const statuses = await window.electronAPI?.tools?.listStatus();
      const codexTool = statuses?.find((t: { id: string }) => t.id === "codexCli");
      setCodexSetup(codexTool?.available
        ? { checking: false, installing: false, status: "ready", detail: codexTool.detail || "Codex CLI is ready" }
        : { checking: false, installing: false, status: "missing", detail: "Not found — click Setup to install" });
    } catch {
      setCodexSetup({ checking: false, installing: false, status: "error", detail: "Could not check status" });
    }
  };

  const handleSetupCodexCli = async () => {
    setCodexSetup((s) => ({ ...s, installing: true, detail: "Installing Codex CLI…" }));
    try {
      const result = await window.electronAPI?.tools?.installCodex();
      if (!result?.success) {
        showToast("Install failed — see details");
        setCodexSetup({ checking: false, installing: false, status: "missing", detail: result?.detail || "Install failed. Try: npm install -g @openai/codex" });
        return;
      }
      // Install succeeded — auto-trigger OAuth
      setCodexSetup({ checking: false, installing: true, status: "ready", detail: "Installed — opening sign-in…" });
      showToast("Codex CLI installed — starting auth…");
      try {
        const authStatus = await window.electronAPI?.tools?.codexAuthStatus();
        if (!authStatus?.authenticated) {
          await window.electronAPI?.tools?.codexAuthLogin();
        }
      } catch { /* auth is optional */ }
      await checkCodexCli();
    } catch {
      setCodexSetup({ checking: false, installing: false, status: "error", detail: "Setup failed" });
    }
  };

  const saveToolPaths = async () => {
    if (!window.electronAPI?.settings) return;
    try {
      setToolsLoading(true);
      const nextSettings = await window.electronAPI.settings.update({
        cliTools: { ...(desktopSettings?.cliTools ?? {}), githubCli: githubCliPath.trim(), git: gitPath.trim() },
      });
      applyDesktopSettings(nextSettings);
      showToast("Tool paths saved");
      await loadDesktopIntegrations();
    } catch {
      showToast("Failed to save tool paths");
      setToolsLoading(false);
    }
  };

  const chooseProjectRoot = async () => {
    const selectedPath = await window.electronAPI?.system?.openDirectory();
    if (selectedPath) setProjectRoot(selectedPath);
  };

  const saveProjectDefaults = async () => {
    if (!window.electronAPI?.settings) return;
    try {
      setToolsLoading(true);
      const nextSettings = await window.electronAPI.settings.update({
        projectDefaults: {
          ...(desktopSettings?.projectDefaults ?? {}),
          rootDirectory: projectRoot.trim(),
          createGithubRepo: createGithubRepoByDefault,
          githubVisibility: projectGithubVisibility,
          copilotModel: copilotModel.trim() || "gpt-5.2",
        },
      });
      applyDesktopSettings(nextSettings);
      showToast("Defaults saved");
      await loadDesktopIntegrations();
    } catch {
      showToast("Failed to save defaults");
      setToolsLoading(false);
    }
  };

  const handleCopilotModelChange = async (nextModel: string) => {
    setCopilotModel(nextModel);
    if (!window.electronAPI?.settings) return;
    try {
      const nextSettings = await window.electronAPI.settings.update({ projectDefaults: { copilotModel: nextModel } });
      applyDesktopSettings(nextSettings);
    } catch { /* */ }
  };

  const handleToggleProvider = async (provider: "claudeCode" | "githubCopilotCli" | "codexCli") => {
    if (!window.electronAPI?.settings) return;
    const current = desktopSettings?.featureFlags?.[provider] ?? false;
    try {
      const nextSettings = await window.electronAPI.settings.update({
        featureFlags: { ...desktopSettings?.featureFlags, [provider]: !current },
      });
      applyDesktopSettings(nextSettings);
      const labels: Record<string, string> = { claudeCode: "Claude Code", githubCopilotCli: "GitHub Copilot", codexCli: "Codex CLI" };
      showToast(`${labels[provider] || provider} ${!current ? "enabled" : "disabled"}`);
    } catch {
      showToast("Failed to update provider setting");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCanUseDesktopApi(Boolean(window.electronAPI?.settings && window.electronAPI?.tools && window.electronAPI?.system));
    }
    void loadDesktopIntegrations();
    void loadGithubAccounts();
    void checkClaudeCode();
    void checkGithubCopilot();
    void checkCodexCli();

    const stopListening = window.electronAPI?.settings?.onChanged((s: DesktopSettings) => applyDesktopSettings(s));
    return () => { stopListening?.(); };
  }, []);

  return (
    <div className="text-ink dark:text-[var(--fg)]">
      <div className="mx-auto flex w-full max-w-[1180px] justify-center">
        <div className="w-full max-w-[760px] space-y-8 pb-24">
          {/* Header */}
          <div className="text-center sm:text-left">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] theme-muted">Account</p>
            <h1 className="display-font mt-2 text-[2rem] font-semibold tracking-tight theme-fg">User settings</h1>
            <p className="mt-2 text-[14px] theme-soft">Manage your profile, connections, and defaults.</p>
          </div>

          {/* Profile card — shows GitHub username if connected */}
          <div className="app-surface overflow-hidden rounded-[1.6rem] p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar initials={activeAccount ? activeAccount.username.slice(0, 2).toUpperCase() : "CB"} size="lg" online ring />
                <div>
                  <p className="display-font text-[1.7rem] font-semibold tracking-tight theme-fg">
                    {activeAccount?.username ?? "Not connected"}
                  </p>
                  {activeAccount ? (
                    <p className="mt-1 text-[14px] theme-muted">github.com/{activeAccount.username}</p>
                  ) : (
                    <p className="mt-1 text-[14px] theme-muted">Connect a GitHub account below</p>
                  )}
                </div>
              </div>
              {activeAccount ? (
                <span className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-500">
                  Connected
                </span>
              ) : null}
            </div>
          </div>

          {/* ═══════════ Appearance ═══════════ */}
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

          {/* ═══════════ GitHub Accounts ═══════════ */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold theme-fg">GitHub Accounts</h2>
              <button
                type="button"
                onClick={() => void handleAddGithubAccount()}
                disabled={githubAuthInProgress}
                className="rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-cream transition hover:bg-ink/90 disabled:opacity-50"
              >
                {githubAuthInProgress ? "Connecting…" : "Add account"}
              </button>
            </div>
            <div className="app-surface rounded-2xl p-5">
              {/* Device code flow UI */}
              {githubAuthInProgress && deviceCode ? (
                <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
                  <p className="text-[13px] font-semibold theme-fg">Enter this code on GitHub</p>
                  <p className="mt-2 select-all rounded-lg bg-ink px-4 py-2.5 text-center font-mono text-[20px] font-bold tracking-[0.3em] text-cream">
                    {deviceCode}
                  </p>
                  {verificationUrl ? (
                    <p className="mt-2 text-center text-[12px] theme-muted">
                      Go to <span className="font-semibold text-violet-400">{verificationUrl}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {githubLoading ? (
                <p className="text-[13px] theme-muted">Loading accounts…</p>
              ) : githubAccounts.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-[13px] theme-muted">No GitHub accounts connected.</p>
                  <p className="mt-1 text-[12px] theme-muted">Click &quot;Add account&quot; to connect via GitHub device flow.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {githubAccounts.map((account) => (
                    <div
                      key={account.username}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                        account.active
                          ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                          : "border-black/[0.06] dark:border-white/[0.08]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#24292e] text-[11px] font-bold text-white">
                          {account.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold theme-fg">{account.username}</p>
                          <p className="text-[11px] theme-muted">{account.host}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {account.active ? (
                          <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[10px] font-bold text-emerald-500">Active</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleSwitchAccount(account.username)}
                            className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-[11px] font-semibold theme-muted transition hover:bg-black/[0.08] hover:text-[var(--fg)] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                          >
                            Switch
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {githubAccounts.length > 0 ? (
                <div className="mt-4 border-t border-black/[0.04] pt-4 dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => void handleLogoutAccount()}
                    className="text-[12px] font-medium text-red-500 transition hover:text-red-600"
                  >
                    Disconnect active account
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          {/* ═══════════ AI Tools ═══════════ */}
          <section>
            <div className="mb-4">
              <h2 className="text-[15px] font-semibold theme-fg">AI Tools</h2>
              <p className="mt-1 text-[12px] theme-muted">Connect your free AI coding assistants in one click.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Claude Code card */}
              <div className={`relative overflow-hidden rounded-2xl border p-5 transition ${claudeCodeSetup.status === "ready" ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-black/[0.06] app-surface dark:border-white/[0.08]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/15">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-orange-500">
                        <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold theme-fg">Claude Code</p>
                      <p className="text-[11px] theme-muted">Anthropic&apos;s AI coding agent</p>
                    </div>
                  </div>
                  {claudeCodeSetup.status === "ready" ? (
                    <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[10px] font-bold text-emerald-500">Connected</span>
                  ) : claudeCodeSetup.status === "missing" ? (
                    <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[10px] font-bold text-amber-500">Not found</span>
                  ) : null}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed theme-muted">
                  {claudeCodeSetup.status === "ready"
                    ? "Claude Code is installed and ready."
                    : "Free AI coding agent that runs in your terminal."}
                </p>
                {claudeCodeSetup.detail && claudeCodeSetup.status !== "unknown" ? (
                  <div className="mt-2">
                    <p className={`rounded-lg bg-black/[0.03] px-3 py-1.5 font-mono text-[10px] theme-muted dark:bg-white/[0.04] ${expandClaudeDetail ? "" : "line-clamp-3"}`}>{claudeCodeSetup.detail}</p>
                    {claudeCodeSetup.detail.length > 120 && (
                      <button type="button" onClick={() => setExpandClaudeDetail((v) => !v)} className="mt-1 text-[10px] font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400">
                        {expandClaudeDetail ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={claudeCodeSetup.status === "ready" ? () => void checkClaudeCode() : () => void handleSetupClaudeCode()}
                  disabled={claudeCodeSetup.checking || claudeCodeSetup.installing}
                  className={`mt-4 w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                    claudeCodeSetup.status === "ready"
                      ? "border border-black/[0.06] bg-white/80 theme-fg hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                      : "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20 hover:opacity-90"
                  }`}
                >
                  {claudeCodeSetup.checking ? "Checking…" : claudeCodeSetup.installing ? "Installing…" : claudeCodeSetup.status === "ready" ? "Re-check" : "Install & Connect"}
                </button>
                {claudeCodeSetup.status === "ready" && (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.015] px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <span className="text-[12px] font-medium theme-fg">Use in CodeBuddy</span>
                    <button
                      type="button"
                      onClick={() => void handleToggleProvider("claudeCode")}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${desktopSettings?.featureFlags?.claudeCode ? "bg-emerald-500" : "bg-black/10 dark:bg-white/15"}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${desktopSettings?.featureFlags?.claudeCode ? "translate-x-4" : "translate-x-0.5"} mt-0.5`} />
                    </button>
                  </div>
                )}
              </div>

              {/* GitHub Copilot card */}
              <div className={`relative overflow-hidden rounded-2xl border p-5 transition ${copilotSetup.status === "ready" ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-black/[0.06] app-surface dark:border-white/[0.08]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/15 to-violet-500/15">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-blue-500">
                        <path d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.572.729 6.016 6.016 0 002.856 0A.75.75 0 0012 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 6.04 6.04 0 002.726 0 .75.75 0 00-.226-1.483 4.54 4.54 0 01-2.274 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold theme-fg">GitHub Copilot</p>
                      <p className="text-[11px] theme-muted">AI pair programming via gh CLI</p>
                    </div>
                  </div>
                  {copilotSetup.status === "ready" ? (
                    <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[10px] font-bold text-emerald-500">Connected</span>
                  ) : copilotSetup.status === "missing" ? (
                    <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[10px] font-bold text-amber-500">Not found</span>
                  ) : null}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed theme-muted">
                  {copilotSetup.status === "ready"
                    ? "GitHub Copilot CLI is connected and ready."
                    : "Free AI pair programmer from GitHub."}
                </p>
                {copilotSetup.detail && copilotSetup.status !== "unknown" ? (
                  <div className="mt-2">
                    <p className={`rounded-lg bg-black/[0.03] px-3 py-1.5 font-mono text-[10px] theme-muted dark:bg-white/[0.04] ${expandCopilotDetail ? "" : "line-clamp-3"}`}>{copilotSetup.detail}</p>
                    {copilotSetup.detail.length > 120 && (
                      <button type="button" onClick={() => setExpandCopilotDetail((v) => !v)} className="mt-1 text-[10px] font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400">
                        {expandCopilotDetail ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={copilotSetup.status === "ready" ? () => void checkGithubCopilot() : () => void handleSetupGithubCopilot()}
                  disabled={copilotSetup.checking || copilotSetup.installing}
                  className={`mt-4 w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                    copilotSetup.status === "ready"
                      ? "border border-black/[0.06] bg-white/80 theme-fg hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                      : "bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-lg shadow-blue-500/20 hover:opacity-90"
                  }`}
                >
                  {copilotSetup.checking ? "Checking…" : copilotSetup.installing ? "Installing…" : copilotSetup.status === "ready" ? "Re-check" : "Install & Connect"}
                </button>
                {copilotSetup.status === "ready" && (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.015] px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <span className="text-[12px] font-medium theme-fg">Use in CodeBuddy</span>
                    <button
                      type="button"
                      onClick={() => void handleToggleProvider("githubCopilotCli")}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${desktopSettings?.featureFlags?.githubCopilotCli ? "bg-emerald-500" : "bg-black/10 dark:bg-white/15"}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${desktopSettings?.featureFlags?.githubCopilotCli ? "translate-x-4" : "translate-x-0.5"} mt-0.5`} />
                    </button>
                  </div>
                )}
              </div>

              {/* Codex CLI card */}
              <div className={`relative overflow-hidden rounded-2xl border p-5 transition ${codexSetup.status === "ready" ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-black/[0.06] app-surface dark:border-white/[0.08]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/15 to-emerald-500/15">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-green-500">
                        <path fillRule="evenodd" d="M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06zM11.377 2.011a.75.75 0 01.612.867l-2.5 14.5a.75.75 0 01-1.478-.255l2.5-14.5a.75.75 0 01.866-.612z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold theme-fg">Codex CLI</p>
                      <p className="text-[11px] theme-muted">OpenAI&apos;s coding agent</p>
                    </div>
                  </div>
                  {codexSetup.status === "ready" ? (
                    <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[10px] font-bold text-emerald-500">Connected</span>
                  ) : codexSetup.status === "missing" ? (
                    <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[10px] font-bold text-amber-500">Not found</span>
                  ) : null}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed theme-muted">
                  {codexSetup.status === "ready"
                    ? "Codex CLI is installed and ready."
                    : "OpenAI&apos;s AI coding agent via npm."}
                </p>
                {codexSetup.detail && codexSetup.status !== "unknown" ? (
                  <div className="mt-2">
                    <p className={`rounded-lg bg-black/[0.03] px-3 py-1.5 font-mono text-[10px] theme-muted dark:bg-white/[0.04] ${expandCodexDetail ? "" : "line-clamp-3"}`}>{codexSetup.detail}</p>
                    {codexSetup.detail.length > 120 && (
                      <button type="button" onClick={() => setExpandCodexDetail((v) => !v)} className="mt-1 text-[10px] font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400">
                        {expandCodexDetail ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={codexSetup.status === "ready" ? () => void checkCodexCli() : () => void handleSetupCodexCli()}
                  disabled={codexSetup.checking || codexSetup.installing}
                  className={`mt-4 w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                    codexSetup.status === "ready"
                      ? "border border-black/[0.06] bg-white/80 theme-fg hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                      : "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/20 hover:opacity-90"
                  }`}
                >
                  {codexSetup.checking ? "Checking…" : codexSetup.installing ? "Installing…" : codexSetup.status === "ready" ? "Re-check" : "Install & Connect"}
                </button>
                {codexSetup.status === "ready" && (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.015] px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                    <span className="text-[12px] font-medium theme-fg">Use in CodeBuddy</span>
                    <button
                      type="button"
                      onClick={() => void handleToggleProvider("codexCli")}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${desktopSettings?.featureFlags?.codexCli ? "bg-emerald-500" : "bg-black/10 dark:bg-white/15"}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${desktopSettings?.featureFlags?.codexCli ? "translate-x-4" : "translate-x-0.5"} mt-0.5`} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ═══════════ Desktop Integrations ═══════════ */}
          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold theme-fg">Desktop integrations</h2>
                <p className="mt-1 text-[12px] theme-muted">Tool paths, project defaults, and CLI configuration.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadDesktopIntegrations()}
                disabled={toolsLoading}
                className="rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-cream transition hover:bg-ink/90 disabled:cursor-wait disabled:opacity-70"
              >
                {toolsLoading ? "Refreshing…" : "Refresh status"}
              </button>
            </div>

            <div className="app-surface space-y-5 rounded-2xl p-5">
              {/* Tool status grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                {toolStatuses.map((tool) => (
                  <div key={tool.id} className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold theme-fg">{tool.label}</p>
                        <p className="mt-1 font-mono text-[11px] theme-muted">{tool.command}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tool.available ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200" : "bg-amber-100 text-amber-700 dark:bg-amber-500/12 dark:text-amber-200"}`}>
                        {tool.available ? "Ready" : "Missing"}
                      </span>
                    </div>
                    <p className={`mt-3 text-[12px] leading-relaxed theme-muted ${expandedTools.has(tool.id) ? "" : "line-clamp-3"}`}>{tool.detail}</p>
                    {tool.detail.length > 120 && (
                      <button type="button" onClick={() => setExpandedTools((prev) => { const next = new Set(prev); next.has(tool.id) ? next.delete(tool.id) : next.add(tool.id); return next; })} className="mt-1 text-[10px] font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400">
                        {expandedTools.has(tool.id) ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {!canUseDesktopApi ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  Open the Electron desktop app to manage local tools.
                </p>
              ) : null}

              {/* CLI path overrides */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium theme-muted">GitHub CLI path override</label>
                  <input
                    type="text"
                    value={githubCliPath}
                    onChange={(e) => setGithubCliPath(e.target.value)}
                    placeholder="Use PATH default if blank"
                    className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium theme-muted">Git path override</label>
                  <input
                    type="text"
                    value={gitPath}
                    onChange={(e) => setGitPath(e.target.value)}
                    placeholder="Use PATH default if blank"
                    className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                  />
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
              </div>

              {/* Project creation defaults */}
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
                      onChange={(e) => setProjectRoot(e.target.value)}
                      placeholder="Documents/CodeBuddy Projects"
                      className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                    />
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-black/[0.06] px-3.5 py-2.5 text-[13px] theme-fg dark:border-white/[0.08]">
                    <input
                      type="checkbox"
                      checked={createGithubRepoByDefault}
                      onChange={(e) => setCreateGithubRepoByDefault(e.target.checked)}
                      className="h-4 w-4 rounded border-black/[0.18]"
                    />
                    Create GitHub repo by default
                  </label>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium theme-muted">Default GitHub visibility</label>
                    <div className="flex gap-2">
                      {(["private", "public"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setProjectGithubVisibility(v)}
                          className={`rounded-lg px-4 py-2 text-[13px] font-medium capitalize transition ${projectGithubVisibility === v ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "app-surface-strong theme-muted hover:text-[var(--fg)]"}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium theme-muted">Default AI model</label>
                    <select
                      value={copilotModel}
                      onChange={(e) => void handleCopilotModelChange(e.target.value)}
                      className="app-input w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                    >
                      {desktopSettings?.featureFlags?.githubCopilotCli && (
                        <optgroup label="GitHub Copilot">
                          {copilotModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>{`${model.label} — ${model.usage} — ${model.provider}`}</option>
                          ))}
                        </optgroup>
                      )}
                      {desktopSettings?.featureFlags?.claudeCode && (
                        <optgroup label="Claude Code">
                          {claudeCodeModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>{`${model.label} — ${model.usage}`}</option>
                          ))}
                        </optgroup>
                      )}
                      {!desktopSettings?.featureFlags?.githubCopilotCli && !desktopSettings?.featureFlags?.claudeCode && (
                        copilotModelOptions.map((model) => (
                          <option key={model.id} value={model.id}>{`${model.label} — ${model.usage} — ${model.provider}`}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void saveProjectDefaults()}
                    disabled={!canUseDesktopApi || toolsLoading}
                    className="rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-cream transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save defaults
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Toast */}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[9999] flex justify-center">
          <div className="pointer-events-auto animate-in slide-in-from-bottom-4 rounded-2xl bg-[#111214] px-5 py-3 text-[13px] font-medium text-white shadow-[0_16px_40px_rgba(0,0,0,0.25)] ring-1 ring-white/[0.08]">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
