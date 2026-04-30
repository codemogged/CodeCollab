"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ─── Types ─── */
type Step = "welcome" | "tools" | "github" | "provider" | "profile" | "done";
type ProviderKey = "copilot" | "claude" | "codex";

interface ToolCheckState {
  checking: boolean;
  installing: boolean;
  status: "unknown" | "ready" | "missing" | "error";
  detail: string;
}

const defaultTool: ToolCheckState = { checking: false, installing: false, status: "unknown", detail: "" };

/* ─── Helpers ─── */
const canUseElectron = () => typeof window !== "undefined" && !!window.electronAPI;

/** Truncate long detail strings to just the version / first line */
function truncateDetail(detail: string): string {
  if (!detail) return "";
  const firstLine = detail.split("\n")[0].trim();
  return firstLine.length > 60 ? firstLine.slice(0, 57) + "…" : firstLine;
}

/* ─── Step metadata ─── */
const STEPS: Step[] = ["welcome", "tools", "github", "provider", "profile", "done"];
const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  tools: "Dev Tools",
  github: "GitHub",
  provider: "AI Assistants",
  profile: "Your Profile",
  done: "Ready",
};

/* ═══════════════════════════════════════════════════════════════════
   Typewriter hook — reveals text character-by-character
   ═══════════════════════════════════════════════════════════════════ */
function useTypewriter(text: string, speed = 28) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return { displayed, done };
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [displayName, setDisplayName] = useState("");
  const [git, setGit] = useState<ToolCheckState>(defaultTool);
  const [gh, setGh] = useState<ToolCheckState>(defaultTool);
  const [copilot, setCopilot] = useState<ToolCheckState>(defaultTool);
  const [claude, setClaude] = useState<ToolCheckState>(defaultTool);
  const [node, setNode] = useState<ToolCheckState>(defaultTool);
  const [python, setPython] = useState<ToolCheckState>(defaultTool);
  const [codex, setCodex] = useState<ToolCheckState>(defaultTool);
  const [selectedProviders, setSelectedProviders] = useState<Set<ProviderKey>>(new Set(["copilot"]));
  const [finishing, setFinishing] = useState(false);
  const [installLog, setInstallLog] = useState<string>("");
  const [installingAll, setInstallingAll] = useState(false);

  /* GitHub auth state */
  const [ghAuthStatus, setGhAuthStatus] = useState<"unknown" | "checking" | "authenticated" | "not-authenticated" | "authenticating" | "error">("unknown");
  const [ghAuthUsername, setGhAuthUsername] = useState<string | null>(null);
  const [ghAuthDeviceCode, setGhAuthDeviceCode] = useState<string | null>(null);
  const [ghAuthUrl, setGhAuthUrl] = useState<string | null>(null);
  const [ghAuthError, setGhAuthError] = useState<string | null>(null);

  /* Claude auth state */
  const [claudeAuthStatus, setClaudeAuthStatus] = useState<"unknown" | "checking" | "authenticated" | "not-authenticated" | "authenticating" | "error">("unknown");
  const [claudeAuthError, setClaudeAuthError] = useState<string | null>(null);

  /* Codex auth state */
  const [codexAuthStatus, setCodexAuthStatus] = useState<"unknown" | "checking" | "authenticated" | "not-authenticated" | "authenticating" | "error">("unknown");
  const [codexAuthError, setCodexAuthError] = useState<string | null>(null);

  /* Copilot CLI auth state — separate OAuth from `gh auth`; needed so the
     discovered model catalog (live /models reasoning levels + multipliers)
     can populate from the Copilot CLI's own keychain entry. */
  const [copilotAuthStatus, setCopilotAuthStatus] = useState<"unknown" | "checking" | "authenticated" | "not-authenticated" | "authenticating" | "error">("unknown");
  const [copilotAuthError, setCopilotAuthError] = useState<string | null>(null);

  /* Install progress animation */
  const installPhasesMap: Record<string, string[]> = {
    git: ["Downloading Git…", "Running installer…", "Configuring Git…", "Almost there…"],
    node: ["Downloading Node.js…", "Running installer…", "Setting up npm…", "Almost there…"],
    python: ["Downloading Python…", "Running installer…", "Configuring paths…", "Almost there…"],
    gh: ["Downloading GitHub CLI…", "Running installer…", "Setting up gh…", "Almost there…"],
    copilot: ["Downloading Copilot CLI…", "Running install scripts…", "Configuring tools…", "Almost there…"],
    claude: ["Downloading Claude Code…", "Running install scripts…", "Configuring CLI tools…", "Almost there…"],
    codex: ["Downloading Codex CLI…", "Installing via npm…", "Configuring tools…", "Almost there…"],
  };
  const [installPhases] = useState(installPhasesMap);
  const [activeInstallPhases, setActiveInstallPhases] = useState<Record<string, number>>({});
  useEffect(() => {
    const installing = [
      git.installing && "git", node.installing && "node", python.installing && "python",
      gh.installing && "gh", copilot.installing && "copilot", claude.installing && "claude",
      codex.installing && "codex",
    ].filter(Boolean) as string[];
    if (installing.length === 0) { setActiveInstallPhases({}); return; }
    const id = setInterval(() => {
      setActiveInstallPhases((prev) => {
        const next = { ...prev };
        for (const key of installing) next[key] = ((next[key] || 0) + 1) % 4;
        return next;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [git.installing, node.installing, python.installing, gh.installing, copilot.installing, claude.installing, codex.installing]);

  /* ── auto-check tools when we land on the tools or provider step ── */
  useEffect(() => {
    if ((step !== "tools" && step !== "provider") || !canUseElectron()) return;
    checkAllTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const checkAllTools = useCallback(async function checkAllTools() {
    if (!canUseElectron()) return;
    setGit((s) => ({ ...s, checking: true }));
    setGh((s) => ({ ...s, checking: true }));
    setCopilot((s) => ({ ...s, checking: true }));
    setClaude((s) => ({ ...s, checking: true }));
    setNode((s) => ({ ...s, checking: true }));
    setPython((s) => ({ ...s, checking: true }));
    setCodex((s) => ({ ...s, checking: true }));
    try {
      const statuses = await window.electronAPI!.tools.listStatus();
      const find = (id: string) => statuses.find((t: { id: string }) => t.id === id);
      const gitTool = find("git");
      const ghTool = find("githubCli");
      const copilotTool = find("githubCopilotCli");
      const claudeTool = find("claudeCode");
      const nodeTool = find("node");
      const pythonTool = find("python");
      const codexTool = find("codexCli");

      setGit({ checking: false, installing: false, status: gitTool?.available ? "ready" : "missing", detail: truncateDetail(gitTool?.detail || "") });
      setGh({ checking: false, installing: false, status: ghTool?.available ? "ready" : "missing", detail: truncateDetail(ghTool?.detail || "") });
      setCopilot({ checking: false, installing: false, status: copilotTool?.available ? "ready" : "missing", detail: truncateDetail(copilotTool?.detail || "") });
      setClaude({ checking: false, installing: false, status: claudeTool?.available ? "ready" : "missing", detail: truncateDetail(claudeTool?.detail || "") });
      setNode({ checking: false, installing: false, status: nodeTool?.available ? "ready" : "missing", detail: truncateDetail(nodeTool?.detail || "") });
      setPython({ checking: false, installing: false, status: pythonTool?.available ? "ready" : "missing", detail: truncateDetail(pythonTool?.detail || "") });
      setCodex({ checking: false, installing: false, status: codexTool?.available ? "ready" : "missing", detail: truncateDetail(codexTool?.detail || "") });
    } catch {
      setGit({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setGh({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setCopilot({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setClaude({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setNode({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setPython({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setCodex({ checking: false, installing: false, status: "error", detail: "Check failed" });
    }
  }, []);

  /* ─── Install functions ─── */

  async function installCopilotExtension() {
    if (!canUseElectron()) return;
    setCopilot((s) => ({ ...s, installing: true }));
    setInstallLog("Installing Copilot CLI…");
    try {
      const result = await window.electronAPI!.tools.installCopilot();
      if (result.success) {
        setCopilot({ checking: false, installing: false, status: "ready", detail: truncateDetail(result.detail || "Copilot CLI installed") });
        setInstallLog("");
        // Now that the CLI is installed, immediately walk the user through
        // its OAuth device flow (separate from gh auth login) so the live
        // /models pipeline can read its keychain token. Mirrors the
        // Claude/Codex post-install auth pattern.
        try {
          const authResult = await window.electronAPI!.tools.copilotAuthStatus();
          if (authResult.authenticated) {
            setCopilotAuthStatus("authenticated");
          } else {
            setCopilotAuthStatus("authenticating");
            try {
              const loginResult = await window.electronAPI!.tools.copilotAuthLogin();
              setCopilotAuthStatus(loginResult.success ? "authenticated" : "not-authenticated");
              if (!loginResult.success) setCopilotAuthError(loginResult.timedOut ? "Timed out. Try again." : "Not completed. Try again.");
            } catch {
              setCopilotAuthStatus("not-authenticated");
              setCopilotAuthError("Something went wrong. Try again.");
            }
          }
        } catch { setCopilotAuthStatus("not-authenticated"); }
        // Catalog refresh — the IPC handler also kicks one on auth success,
        // but firing here covers the already-authenticated path.
        try { await window.electronAPI!.tools.refreshCopilotCatalog(); } catch { /* non-critical */ }
      } else {
        setCopilot({ checking: false, installing: false, status: "error", detail: truncateDetail(result.detail || "Install failed") });
        setInstallLog("Install failed. Try manually:\n• winget install GitHub.Copilot\n• npm install -g @githubnext/github-copilot-cli");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setCopilot({ checking: false, installing: false, status: "error", detail: "Install crashed" });
      setInstallLog("Error: " + errMsg);
    }
  }

  async function installClaudeExtension() {
    if (!canUseElectron()) return;
    setClaude((s) => ({ ...s, installing: true }));
    setInstallLog("Installing Claude Code…");
    try {
      const result = await window.electronAPI!.tools.installClaude();
      if (result.success) {
        setClaude({ checking: false, installing: false, status: "ready", detail: truncateDetail(result.detail || "Claude Code installed") });
        setInstallLog("");
        try {
          const authResult = await window.electronAPI!.tools.claudeAuthStatus();
          if (authResult.authenticated) {
            setClaudeAuthStatus("authenticated");
          } else {
            setClaudeAuthStatus("authenticating");
            try {
              const loginResult = await window.electronAPI!.tools.claudeAuthLogin();
              setClaudeAuthStatus(loginResult.success ? "authenticated" : "not-authenticated");
              if (!loginResult.success) setClaudeAuthError(loginResult.timedOut ? "Timed out. Try again." : "Not completed. Try again.");
            } catch {
              setClaudeAuthStatus("not-authenticated");
              setClaudeAuthError("Something went wrong. Try again.");
            }
          }
        } catch { setClaudeAuthStatus("not-authenticated"); }
      } else {
        setClaude({ checking: false, installing: false, status: "error", detail: truncateDetail(result.detail || "Install failed") });
        setInstallLog("Install failed. Try: irm https://claude.ai/install.ps1 | iex");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setClaude({ checking: false, installing: false, status: "error", detail: "Install crashed" });
      setInstallLog("Error: " + errMsg);
    }
  }

  async function installCodexCli() {
    if (!canUseElectron()) return;
    setCodex((s) => ({ ...s, installing: true }));
    setInstallLog("Installing Codex CLI…");
    try {
      const result = await window.electronAPI!.tools.installCodex();
      if (result.success) {
        setCodex({ checking: false, installing: false, status: "ready", detail: truncateDetail(result.detail || "Codex CLI installed") });
        setInstallLog("");
        try {
          const authResult = await window.electronAPI!.tools.codexAuthStatus();
          if (authResult.authenticated) {
            setCodexAuthStatus("authenticated");
          } else {
            setCodexAuthStatus("authenticating");
            try {
              const loginResult = await window.electronAPI!.tools.codexAuthLogin();
              setCodexAuthStatus(loginResult.success ? "authenticated" : "not-authenticated");
              if (!loginResult.success) setCodexAuthError(loginResult.timedOut ? "Timed out. Try again." : "Not completed. Try again.");
            } catch {
              setCodexAuthStatus("not-authenticated");
              setCodexAuthError("Something went wrong. Try again.");
            }
          }
        } catch { setCodexAuthStatus("not-authenticated"); }
      } else {
        setCodex({ checking: false, installing: false, status: "error", detail: truncateDetail(result.detail || "Install failed") });
        setInstallLog("Install failed. Try: npm install -g @openai/codex");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setCodex({ checking: false, installing: false, status: "error", detail: "Install crashed" });
      setInstallLog("Error: " + errMsg);
    }
  }

  async function installNodeJs() {
    if (!canUseElectron()) return;
    setNode((s) => ({ ...s, installing: true }));
    try {
      const result = await window.electronAPI!.tools.installNode();
      setNode({ checking: false, installing: false, status: result.success ? "ready" : "missing", detail: truncateDetail(result.detail || (result.success ? "" : "Install failed")) });
    } catch { setNode({ checking: false, installing: false, status: "error", detail: "Install crashed" }); }
  }

  async function installGitScm() {
    if (!canUseElectron()) return;
    setGit((s) => ({ ...s, installing: true }));
    try {
      const result = await window.electronAPI!.tools.installGit();
      setGit({ checking: false, installing: false, status: result.success ? "ready" : "missing", detail: truncateDetail(result.detail || (result.success ? "" : "Install failed")) });
    } catch { setGit({ checking: false, installing: false, status: "error", detail: "Install crashed" }); }
  }

  async function installPython() {
    if (!canUseElectron()) return;
    setPython((s) => ({ ...s, installing: true }));
    try {
      const result = await window.electronAPI!.tools.installPython();
      setPython({ checking: false, installing: false, status: result.success ? "ready" : "missing", detail: truncateDetail(result.detail || (result.success ? "" : "Install failed")) });
    } catch { setPython({ checking: false, installing: false, status: "error", detail: "Install crashed" }); }
  }

  async function installGhCli() {
    if (!canUseElectron()) return;
    setGh((s) => ({ ...s, installing: true }));
    try {
      const result = await window.electronAPI!.tools.installGh();
      setGh({ checking: false, installing: false, status: result.success ? "ready" : "missing", detail: truncateDetail(result.detail || (result.success ? "" : "Install failed")) });
    } catch { setGh({ checking: false, installing: false, status: "error", detail: "Install crashed" }); }
  }

  async function installAllMissing() {
    if (!canUseElectron()) return;
    setInstallingAll(true);
    setInstallLog("");
    const tasks: Promise<void>[] = [];
    if (git.status !== "ready" && !git.installing) tasks.push(installGitScm());
    if (node.status !== "ready" && !node.installing) tasks.push(installNodeJs());
    if (python.status !== "ready" && !python.installing) tasks.push(installPython());
    if (gh.status !== "ready" && !gh.installing) tasks.push(installGhCli());
    if (tasks.length > 0) await Promise.allSettled(tasks);
    setInstallingAll(false);
    await checkAllTools();
  }

  /* ── Claude auth ── */
  async function checkClaudeAuth() {
    if (!canUseElectron()) return;
    setClaudeAuthStatus("checking");
    setClaudeAuthError(null);
    try {
      const result = await window.electronAPI!.tools.claudeAuthStatus();
      setClaudeAuthStatus(result.authenticated ? "authenticated" : "not-authenticated");
    } catch { setClaudeAuthStatus("not-authenticated"); }
  }

  async function startClaudeAuth() {
    if (!canUseElectron()) return;
    setClaudeAuthStatus("authenticating");
    setClaudeAuthError(null);
    try {
      const result = await window.electronAPI!.tools.claudeAuthLogin();
      if (result.success) setClaudeAuthStatus("authenticated");
      else { setClaudeAuthStatus("not-authenticated"); setClaudeAuthError(result.timedOut ? "Timed out. Try again." : "Not completed. Try again."); }
    } catch { setClaudeAuthStatus("error"); setClaudeAuthError("Something went wrong."); }
  }

  useEffect(() => {
    if (step !== "provider" || !canUseElectron()) return;
    if (claude.status === "ready" && selectedProviders.has("claude")) checkClaudeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, claude.status, selectedProviders]);

  /* ── Codex auth ── */
  async function checkCodexAuth() {
    if (!canUseElectron()) return;
    setCodexAuthStatus("checking");
    setCodexAuthError(null);
    try {
      const result = await window.electronAPI!.tools.codexAuthStatus();
      setCodexAuthStatus(result.authenticated ? "authenticated" : "not-authenticated");
    } catch { setCodexAuthStatus("not-authenticated"); }
  }

  async function startCodexAuth() {
    if (!canUseElectron()) return;
    setCodexAuthStatus("authenticating");
    setCodexAuthError(null);
    try {
      const result = await window.electronAPI!.tools.codexAuthLogin();
      if (result.success) setCodexAuthStatus("authenticated");
      else { setCodexAuthStatus("not-authenticated"); setCodexAuthError(result.timedOut ? "Timed out. Try again." : "Not completed. Try again."); }
    } catch { setCodexAuthStatus("error"); setCodexAuthError("Something went wrong."); }
  }

  useEffect(() => {
    if (step !== "provider" || !canUseElectron()) return;
    if (codex.status === "ready" && selectedProviders.has("codex")) checkCodexAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, codex.status, selectedProviders]);

  /* ── Copilot CLI auth ── */
  async function checkCopilotAuth() {
    if (!canUseElectron()) return;
    setCopilotAuthStatus("checking");
    setCopilotAuthError(null);
    try {
      const result = await window.electronAPI!.tools.copilotAuthStatus();
      setCopilotAuthStatus(result.authenticated ? "authenticated" : "not-authenticated");
    } catch { setCopilotAuthStatus("not-authenticated"); }
  }

  async function startCopilotAuth() {
    if (!canUseElectron()) return;
    setCopilotAuthStatus("authenticating");
    setCopilotAuthError(null);
    try {
      const result = await window.electronAPI!.tools.copilotAuthLogin();
      if (result.success) {
        setCopilotAuthStatus("authenticated");
        try { await window.electronAPI!.tools.refreshCopilotCatalog(); } catch { /* non-critical */ }
      } else { setCopilotAuthStatus("not-authenticated"); setCopilotAuthError(result.timedOut ? "Timed out. Try again." : "Not completed. Try again."); }
    } catch { setCopilotAuthStatus("error"); setCopilotAuthError("Something went wrong."); }
  }

  useEffect(() => {
    if (step !== "provider" || !canUseElectron()) return;
    if (copilot.status === "ready" && selectedProviders.has("copilot")) checkCopilotAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, copilot.status, selectedProviders]);

  /* ── GitHub auth ── */
  useEffect(() => {
    if (step !== "github" || !canUseElectron()) return;
    checkGithubAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function checkGithubAuth() {
    if (!canUseElectron()) return;
    setGhAuthStatus("checking");
    setGhAuthError(null);
    try {
      const result = await window.electronAPI!.tools.githubAuthStatus();
      if (result.authenticated) { setGhAuthStatus("authenticated"); setGhAuthUsername(result.username); }
      else { setGhAuthStatus("not-authenticated"); setGhAuthUsername(null); }
    } catch { setGhAuthStatus("not-authenticated"); }
  }

  async function startGithubAuth() {
    if (!canUseElectron()) return;
    setGhAuthStatus("authenticating");
    setGhAuthDeviceCode(null);
    setGhAuthUrl(null);
    setGhAuthError(null);
    const unsub = window.electronAPI!.tools.onGithubAuthProgress((event) => {
      if (event.deviceCode) setGhAuthDeviceCode(event.deviceCode);
      if (event.verificationUrl) setGhAuthUrl(event.verificationUrl);
    });
    try {
      const result = await window.electronAPI!.tools.githubAuthLogin();
      unsub();
      if (result.success) {
        setGhAuthStatus("authenticated");
        const status = await window.electronAPI!.tools.githubAuthStatus();
        setGhAuthUsername(status.username);
        try { await window.electronAPI!.tools.setupGit(); } catch { /* non-critical */ }
        // GitHub OAuth token is now in the OS keychain — trigger a Copilot
        // catalog refresh so the live /models pipeline runs immediately.
        try { await window.electronAPI!.tools.refreshCopilotCatalog(); } catch { /* non-critical */ }
      } else if (result.timedOut) { setGhAuthStatus("not-authenticated"); setGhAuthError("Timed out. Try again."); }
      else { setGhAuthStatus("not-authenticated"); setGhAuthError("Not completed. Try again."); }
    } catch { unsub(); setGhAuthStatus("error"); setGhAuthError("Something went wrong."); }
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      if (canUseElectron()) {
        const updates: Record<string, unknown> = {
          featureFlags: {
            githubCopilotCli: selectedProviders.has("copilot"),
            claudeCode: selectedProviders.has("claude"),
            codexCli: selectedProviders.has("codex"),
            githubCompanion: true,
          },
        };
        if (displayName.trim()) updates.displayName = displayName.trim();
        await window.electronAPI!.settings.update(updates);
        await window.electronAPI!.settings.completeOnboarding();
      }
      router.push("/home");
    } catch { router.push("/home"); }
  }

  /* ── Navigation ── */
  const stepIndex = STEPS.indexOf(step);
  const canGoBack = stepIndex > 0 && step !== "done";
  const goBack = () => { if (canGoBack) setStep(STEPS[stepIndex - 1]); };
  const goNext = (target?: Step) => { setStep(target || STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]); };

  /* ═══════════════════════════════════════════════════════════════════
     RENDER — Clean centered single-step layout
     Light mode · typing animation · step dots · back/forward nav
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen flex-col bg-void text-text">

      {/* ── Top bar: logo + step counter ── */}
      <header className="flex items-center justify-between px-8 pt-6">
        <div className="flex items-center gap-2.5">
          <img src="/codecollab-logo.png" alt="CodeCollab" className="h-7 w-7 rounded-md" />
          <span className="font-display text-sm font-semibold text-text">CodeCollab</span>
        </div>
        <p className="text-label text-text-dim">
          {stepIndex + 1} of {STEPS.length}
        </p>
      </header>

      {/* ── Step dots ── */}
      <div className="flex justify-center gap-2 pt-6">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => { if (i <= stepIndex) setStep(STEPS[i]); }}
            className={`h-1.5 rounded-full transition-all duration-400 ${
              i === stepIndex
                ? "w-8 bg-violet"
                : i < stepIndex
                  ? "w-1.5 cursor-pointer bg-violet/40 hover:bg-violet/60"
                  : "w-1.5 bg-stage-up2"
            }`}
            aria-label={STEP_LABELS[s]}
          />
        ))}
      </div>

      {/* ── Centered content area ── */}
      <main className="flex flex-1 flex-col items-center justify-center px-8 pb-24">
        <div className="w-full max-w-2xl">

          {/* ═══ WELCOME ═══ */}
          {step === "welcome" && <WelcomeStep onContinue={() => goNext()} />}

          {/* ═══ TOOLS ═══ */}
          {step === "tools" && (
            <FadeIn key="tools">
              <StepHeading text="Checking your tools" />
              <p className="mt-2 text-center text-sm text-text-dim">
                CodeCollab needs a few things installed on your machine.
              </p>

              <div className="mt-8 space-y-1">
                <ToolRow label="Git" state={git} onInstall={installGitScm} phaseText={installPhases.git[activeInstallPhases.git || 0]} />
                <ToolRow label="Node.js" state={node} onInstall={installNodeJs} phaseText={installPhases.node[activeInstallPhases.node || 0]} />
                <ToolRow label="Python" state={python} onInstall={installPython} phaseText={installPhases.python[activeInstallPhases.python || 0]} />
                <ToolRow label="GitHub CLI" state={gh} onInstall={installGhCli} phaseText={installPhases.gh[activeInstallPhases.gh || 0]} />
              </div>

              {/* Install all / missing count */}
              {(() => {
                const anyInstalling = git.installing || node.installing || python.installing || gh.installing;
                const missing = [git, node, python, gh].filter((t) => t.status === "missing" || t.status === "error");
                const readyCount = [git, node, python, gh].filter((t) => t.status === "ready").length;

                if (anyInstalling) {
                  return (
                    <div className="mt-6 flex flex-col items-center gap-3">
                      <div className="relative flex h-12 w-12 items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-2 border-violet/20" />
                        <div className="absolute inset-0 rounded-full border-2 border-violet border-t-transparent animate-spin" style={{ animationDuration: "1.2s" }} />
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-violet"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>
                      </div>
                      <p className="text-sm font-medium text-text-mid">Installing… {readyCount}/4</p>
                    </div>
                  );
                }
                if (missing.length > 0 && !anyInstalling) {
                  return (
                    <div className="mt-6 flex justify-center gap-3">
                      <button
                        onClick={installAllMissing}
                        disabled={installingAll}
                        className="inline-flex items-center gap-2 rounded-full bg-violet px-5 py-2 text-sm font-semibold text-void shadow-sm transition hover:bg-violet/90 active:scale-[0.97] disabled:opacity-50"
                      >
                        Install all ({missing.length})
                      </button>
                      <button
                        onClick={checkAllTools}
                        className="btn-ghost rounded-full px-4 py-2 text-sm"
                      >
                        Re-check
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

              <NavButtons onBack={goBack} onNext={() => goNext()} nextLabel="Continue" backLabel="Back" />
            </FadeIn>
          )}

          {/* ═══ GITHUB ═══ */}
          {step === "github" && (
            <FadeIn key="github">
              <StepHeading text="Connect GitHub" />
              <p className="mt-2 text-center text-sm text-text-dim">
                This is how we store projects and collaborate with friends.
              </p>

              <div className="mt-8 space-y-4">
                {ghAuthStatus === "checking" && (
                  <div className="flex items-center justify-center gap-3 py-4">
                    <Spinner className="text-violet" />
                    <span className="text-sm text-text-dim">Checking GitHub…</span>
                  </div>
                )}

                {ghAuthStatus === "authenticated" && (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                    <GreenCheck />
                    <div>
                      <p className="text-sm font-semibold text-emerald-700">Connected</p>
                      <p className="text-xs text-emerald-600/70">Signed in as <span className="font-semibold">{ghAuthUsername}</span></p>
                    </div>
                  </div>
                )}

                {(ghAuthStatus === "not-authenticated" || ghAuthStatus === "error" || ghAuthStatus === "unknown") && (
                  <>
                    {gh.status !== "ready" ? (
                      <div className="rounded-2xl border border-sun/30 bg-sun/10 px-5 py-4 text-center">
                        <p className="text-sm font-medium text-sun">GitHub CLI is required.</p>
                        <p className="mt-1 text-xs text-sun/70">Go back and install it first.</p>
                        <button onClick={goBack} className="mt-3 text-xs font-semibold text-sun hover:text-sun/80">← Back to tools</button>
                      </div>
                    ) : (
                      <div className="flex justify-center gap-3">
                        <button
                          onClick={startGithubAuth}
                          className="inline-flex items-center gap-2 rounded-full bg-text px-6 py-2.5 text-sm font-semibold text-void shadow-sm transition hover:bg-text/90 active:scale-[0.97]"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                          </svg>
                          Sign in with GitHub
                        </button>
                      </div>
                    )}
                  </>
                )}

                {ghAuthStatus === "authenticating" && (
                  <div className="rounded-2xl border border-violet/20 bg-violet/8 px-6 py-6">
                    {ghAuthDeviceCode ? (
                      <div className="space-y-4 text-center">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-violet">Copy this code</p>
                          <p className="mt-2 select-all font-mono text-2xl font-bold tracking-[0.15em] text-violet">{ghAuthDeviceCode}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-violet">Then open</p>
                          <button
                            onClick={() => { if (ghAuthUrl) window.electronAPI?.system?.openExternal(ghAuthUrl); }}
                            className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-violet/20 px-4 py-2 text-sm font-semibold text-violet transition hover:bg-violet/30"
                          >
                            github.com/login/device ↗
                          </button>
                        </div>
                        <p className="text-[11px] text-text-dim">Authorize the app, then come back.</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3 py-2">
                        <Spinner className="text-violet" />
                        <span className="text-sm text-text-dim">Starting authentication…</span>
                      </div>
                    )}
                  </div>
                )}

                {ghAuthError && (
                  <p className="rounded-xl bg-coral/10 px-4 py-2 text-center text-sm text-coral">{ghAuthError}</p>
                )}
              </div>

              <NavButtons
                onBack={goBack}
                onNext={() => goNext()}
                nextLabel={ghAuthStatus === "authenticated" ? "Continue" : "Skip for now"}
                backLabel="Back"
              />
            </FadeIn>
          )}

          {/* ═══ PROVIDER ═══ */}
          {step === "provider" && (
            <FadeIn key="provider">
              <StepHeading text="Choose your AI assistant" />
              <p className="mt-2 text-center text-sm text-text-dim">
                Pick one or more. We&apos;ll install and connect them.
              </p>

              <div className="mt-8 space-y-2">
                {([
                  { key: "copilot" as ProviderKey, label: "GitHub Copilot", desc: "Free with GitHub" },
                  { key: "claude" as ProviderKey, label: "Claude Code", desc: "Anthropic CLI" },
                  { key: "codex" as ProviderKey, label: "Codex CLI", desc: "OpenAI agent" },
                ] as const).map(({ key, label, desc }) => {
                  const checked = selectedProviders.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedProviders((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key); else next.add(key);
                          return next;
                        });
                      }}
                      className={`flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-200 ${
                        checked
                          ? "border-violet/30 bg-violet/10"
                          : "border-edge bg-stage hover:border-text-ghost"
                      }`}
                    >
                      <ProviderIcon provider={key} />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-text">{label}</span>
                        <span className="ml-2 text-xs text-text-dim">{desc}</span>
                      </div>
                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${checked ? "border-violet bg-violet" : "border-text-ghost"}`}>
                        {checked && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-void">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Provider install/auth status */}
              {selectedProviders.size > 0 && (
                <div className="mt-5 rounded-2xl border border-edge bg-stage overflow-hidden divide-y divide-edge">
                  {selectedProviders.has("copilot") && (
                    <ProviderStatusRow
                      provider="copilot"
                      toolState={copilot}
                      authStatus={copilot.status === "ready" ? copilotAuthStatus : undefined}
                      authLabel={ghAuthUsername || undefined}
                      onInstall={gh.status === "ready" ? installCopilotExtension : undefined}
                      onSignIn={startCopilotAuth}
                      authError={copilotAuthError}
                      phaseText={installPhases.copilot[activeInstallPhases.copilot || 0]}
                    />
                  )}
                  {selectedProviders.has("claude") && (
                    <ProviderStatusRow
                      provider="claude"
                      toolState={claude}
                      authStatus={claude.status === "ready" ? claudeAuthStatus : undefined}
                      onInstall={installClaudeExtension}
                      onSignIn={startClaudeAuth}
                      authError={claudeAuthError}
                      phaseText={installPhases.claude[activeInstallPhases.claude || 0]}
                    />
                  )}
                  {selectedProviders.has("codex") && (
                    <ProviderStatusRow
                      provider="codex"
                      toolState={codex}
                      authStatus={codex.status === "ready" ? codexAuthStatus : undefined}
                      onInstall={node.status === "ready" ? installCodexCli : undefined}
                      onSignIn={startCodexAuth}
                      authError={codexAuthError}
                      phaseText={installPhases.codex[activeInstallPhases.codex || 0]}
                    />
                  )}
                </div>
              )}

              {installLog && (
                <div className="mt-3 rounded-xl border border-edge bg-stage-up px-4 py-3">
                  <pre className="whitespace-pre-wrap break-words text-xs text-text-mid">{installLog}</pre>
                </div>
              )}

              <NavButtons onBack={goBack} onNext={() => goNext()} nextLabel="Continue" backLabel="Back" showRecheck recheckFn={checkAllTools} />
            </FadeIn>
          )}

          {/* ═══ PROFILE ═══ */}
          {step === "profile" && (
            <FadeIn key="profile">
              <StepHeading text="What should we call you?" />
              <p className="mt-2 text-center text-sm text-text-dim">
                This is how you&apos;ll appear to friends.
              </p>

              <div className="mt-8 flex flex-col items-center gap-5">
                {displayName.trim() && (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet text-lg font-bold text-void">
                    {displayName.trim().slice(0, 2).toUpperCase()}
                  </div>
                )}
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="app-input w-full rounded-2xl px-5 py-3.5 text-center text-sm"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && displayName.trim()) goNext(); }}
                />
              </div>

              <NavButtons onBack={goBack} onNext={() => goNext()} nextLabel="Continue" backLabel="Back" nextDisabled={!displayName.trim()} />
            </FadeIn>
          )}

          {/* ═══ DONE ═══ */}
          {step === "done" && (
            <FadeIn key="done">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-violet">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9 text-void"><path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" /></svg>
                </div>
                <h1 className="mt-6 text-2xl font-bold text-text">
                  You&apos;re all set, {displayName || "friend"}!
                </h1>
                <p className="mt-2 text-sm text-text-dim">
                  Start a project, invite friends, and build something amazing.
                </p>
                <button
                  onClick={handleFinish}
                  disabled={finishing}
                  className="mt-8 rounded-full bg-violet px-8 py-3 text-sm font-semibold text-void transition hover:bg-violet/90 active:scale-[0.97] disabled:opacity-50"
                >
                  {finishing ? "Setting up…" : "Open CodeCollab"}
                </button>
              </div>
            </FadeIn>
          )}

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="pb-6 text-center text-[11px] text-text-ghost">
        free forever
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

/** Provider icon with real brand logos */
function ProviderIcon({ provider }: { provider: ProviderKey }) {
  const base = "flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden";
  if (provider === "copilot") return (
    <div className={`${base} bg-text`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-void">
        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
      </svg>
    </div>
  );
  if (provider === "claude") return (
    <div className={`${base} bg-[#f5e6df]`}>
      <svg viewBox="0 6.603 1192.672 1193.397" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
        <path d="m233.96 800.215 234.684-131.678 3.947-11.436-3.947-6.363h-11.436l-39.221-2.416-134.094-3.624-116.296-4.832-112.67-6.04-28.35-6.04-26.577-35.035 2.738-17.477 23.84-16.027 34.147 2.98 75.463 5.155 113.235 7.812 82.147 4.832 121.692 12.644h19.329l2.738-7.812-6.604-4.832-5.154-4.832-117.182-79.41-126.845-83.92-66.443-48.321-35.92-24.484-18.12-22.953-7.813-50.093 32.618-35.92 43.812 2.98 11.195 2.98 44.375 34.147 94.792 73.37 123.786 91.167 18.12 15.06 7.249-5.154.886-3.624-8.135-13.61-67.329-121.692-71.838-123.785-31.974-51.302-8.456-30.765c-2.98-12.645-5.154-23.275-5.154-36.242l37.127-50.416 20.537-6.604 49.53 6.604 20.86 18.121 30.765 70.39 49.852 110.818 77.315 150.684 22.631 44.698 12.08 41.396 4.51 12.645h7.813v-7.248l6.362-84.886 11.759-104.215 11.436-134.094 3.946-37.772 18.685-45.262 37.127-24.482 28.994 13.852 23.839 34.148-3.303 22.067-14.174 92.134-27.785 144.323-18.121 96.644h10.55l12.08-12.08 48.887-64.913 82.147-102.685 36.242-40.752 42.282-45.02 27.14-21.423h51.303l37.772 56.135-16.913 57.986-52.832 67.007-43.812 56.779-62.82 84.563-39.22 67.651 3.623 5.396 9.343-.886 141.906-30.201 76.671-13.852 91.49-15.705 41.396 19.329 4.51 19.65-16.269 40.189-97.852 24.16-114.764 22.954-170.9 40.43-2.093 1.53 2.416 2.98 76.993 7.248 32.94 1.771h80.617l150.12 11.195 39.222 25.933 23.517 31.732-3.946 24.16-60.403 30.766-81.503-19.33-190.228-45.26-65.235-16.27h-9.02v5.397l54.362 53.154 99.624 89.96 124.752 115.973 6.362 28.671-16.027 22.63-16.912-2.415-109.611-82.47-42.282-37.127-95.758-80.618h-6.363v8.456l22.067 32.296 116.537 175.167 6.04 53.719-8.456 17.476-30.201 10.55-33.181-6.04-68.215-95.758-70.39-107.84-56.778-96.644-6.926 3.947-33.503 360.886-15.705 18.443-36.243 13.852-30.201-22.953-16.027-37.127 16.027-73.37 19.329-95.758 15.704-76.107 14.175-94.55 8.456-31.41-.563-2.094-6.927.886-71.275 97.852-108.402 146.497-85.772 91.812-20.537 8.134-35.597-18.443 3.301-32.94 19.893-29.315 118.712-151.007 71.597-93.583 46.228-54.04-.322-7.813h-2.738l-315.302 204.725-56.135 7.248-24.16-22.63 2.98-37.128 11.435-12.08 94.792-65.236-.322.323z" fill="#d97757"/>
      </svg>
    </div>
  );
  return (
    <div className={`${base} bg-[#f5f5f5]`}>
      <img src="/openai-logo.png" alt="OpenAI" className="h-5 w-5 object-contain" />
    </div>
  );
}

/** Welcome step with typing animation */
function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  const { displayed, done } = useTypewriter("Let's get you set up.", 35);
  return (
    <FadeIn>
      <div className="flex flex-col items-center text-center">
        <img
          src="/codecollab-logo.png"
          alt="CodeCollab"
          className="h-16 w-16 rounded-2xl object-cover shadow-lg"
        />
        <h1 className="mt-8 text-2xl font-bold text-text">
          {displayed}
          {!done && <span className="ml-0.5 inline-block w-[2px] h-[1.1em] bg-violet align-text-bottom animate-pulse" />}
        </h1>
        <p className={`mt-3 text-sm text-text-dim transition-opacity duration-700 ${done ? "opacity-100" : "opacity-0"}`}>
          This takes about 2 minutes. We&apos;ll check a few tools and connect your GitHub.
        </p>
        <button
          onClick={onContinue}
          className={`mt-8 rounded-full bg-violet px-8 py-3 text-sm font-semibold text-void transition-all duration-500 hover:bg-violet/90 active:scale-[0.97] ${done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        >
          Let&apos;s go
        </button>
      </div>
    </FadeIn>
  );
}

/** Step heading with typing animation */
function StepHeading({ text }: { text: string }) {
  const { displayed, done } = useTypewriter(text, 30);
  return (
    <h1 className="text-center text-2xl font-bold text-text">
      {displayed}
      {!done && <span className="ml-0.5 inline-block w-[2px] h-[1.1em] bg-violet align-text-bottom animate-pulse" />}
    </h1>
  );
}

/** Fade-in wrapper */
function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
      {children}
    </div>
  );
}

/** Navigation buttons */
function NavButtons({
  onBack,
  onNext,
  nextLabel = "Continue",
  backLabel = "Back",
  nextDisabled = false,
  showRecheck = false,
  recheckFn,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  showRecheck?: boolean;
  recheckFn?: () => void;
}) {
  return (
    <div className="mt-10 flex items-center justify-center gap-3">
      {onBack && (
        <button onClick={onBack} className="btn-ghost rounded-full px-5 py-2 text-sm">
          {backLabel}
        </button>
      )}
      {showRecheck && recheckFn && (
        <button onClick={recheckFn} className="btn-ghost rounded-full px-4 py-2 text-sm">
          Re-check
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="btn-primary rounded-full px-7 py-2.5 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-30"
      >
        {nextLabel}
      </button>
    </div>
  );
}

/** Tool check row */
function ToolRow({
  label,
  state,
  onInstall,
  phaseText,
}: {
  label: string;
  state: ToolCheckState;
  onInstall?: () => void;
  phaseText?: string;
}) {
  if (state.installing && phaseText) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-violet/20 bg-violet/8 px-4 py-3">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-violet/30" />
          <div className="absolute inset-0 rounded-full border-2 border-violet border-t-transparent animate-spin" style={{ animationDuration: "1.2s" }} />
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-violet"><path fillRule="evenodd" d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.101 3.046 3.046 0 01-1.608-1.607.454.454 0 01.1-.493l2.693-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01zM5 16a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" /></svg>
        </div>
        <p className="text-sm font-medium text-violet">{phaseText}</p>
      </div>
    );
  }

  const icon = state.checking ? (
    <Spinner className="text-text-ghost" size={16} />
  ) : state.status === "ready" ? (
    <GreenCheck small />
  ) : state.status === "missing" ? (
    <div className="h-4 w-4 rounded-full border-2 border-sun" />
  ) : state.status === "error" ? (
    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-coral/15 text-[9px] font-bold text-coral">!</div>
  ) : (
    <div className="h-4 w-4 rounded-full border-2 border-edge" />
  );

  const statusText = state.checking ? "Checking…"
    : state.status === "ready" ? (state.detail || "Installed")
      : state.status === "missing" ? "Not found"
        : state.status === "error" ? (state.detail || "Error")
          : "";

  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm">
      {icon}
      <span className="font-medium text-text">{label}</span>
      <span className={`ml-auto text-xs ${
        state.status === "ready" ? "text-text-dim" : state.status === "missing" ? "text-sun" : state.status === "error" ? "text-coral" : "text-text-ghost"
      }`}>{statusText}</span>
      {state.status !== "ready" && !state.checking && onInstall && (
        <button
          onClick={onInstall}
          disabled={state.installing}
          className="rounded-full bg-violet/10 px-3 py-1 text-xs font-semibold text-violet transition hover:bg-violet/20 disabled:opacity-50"
        >
          Install
        </button>
      )}
    </div>
  );
}

/** Compact provider status row — replaces ToolRow+AuthRow for provider step */
function ProviderStatusRow({
  provider,
  toolState,
  authStatus,
  authLabel,
  onInstall,
  onSignIn,
  authError,
  phaseText,
}: {
  provider: ProviderKey;
  toolState: ToolCheckState;
  authStatus?: string;
  authLabel?: string;
  onInstall?: () => void;
  onSignIn?: () => void;
  authError?: string | null;
  phaseText?: string;
}) {
  const names: Record<ProviderKey, string> = { copilot: "GitHub Copilot", claude: "Claude Code", codex: "Codex CLI" };
  const label = names[provider];

  // Installing state
  if (toolState.installing && phaseText) {
    return (
      <div className="flex items-center gap-3 px-5 py-4">
        <ProviderIcon provider={provider} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text">{label}</p>
          <p className="text-xs text-violet mt-0.5">{phaseText}</p>
        </div>
        <Spinner className="text-violet" size={16} />
      </div>
    );
  }

  // Checking state
  if (toolState.checking) {
    return (
      <div className="flex items-center gap-3 px-5 py-4">
        <ProviderIcon provider={provider} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text">{label}</p>
          <p className="text-xs text-text-dim mt-0.5">Checking…</p>
        </div>
        <Spinner className="text-text-ghost" size={16} />
      </div>
    );
  }

  // Not installed
  if (toolState.status !== "ready") {
    return (
      <div className="flex items-center gap-3 px-5 py-4">
        <ProviderIcon provider={provider} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text">{label}</p>
          <p className="text-xs text-text-dim mt-0.5">Not installed</p>
        </div>
        {onInstall && (
          <button onClick={onInstall} className="rounded-full bg-violet/10 px-4 py-1.5 text-xs font-semibold text-violet transition hover:bg-violet/20">
            Install
          </button>
        )}
      </div>
    );
  }

  // Installed — show auth status
  const isAuthed = authStatus === "authenticated";
  const isAuthing = authStatus === "authenticating";
  const isChecking = authStatus === "checking";

  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <ProviderIcon provider={provider} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        {isAuthed ? (
          <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.844-8.791a.75.75 0 00-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 10-1.114 1.004l2.25 2.5a.75.75 0 001.15-.043l4.25-5.5z" clipRule="evenodd" /></svg>
            Ready{authLabel ? ` · ${authLabel}` : ""}
          </p>
        ) : isAuthing ? (
          <p className="text-xs text-violet mt-0.5">Signing in… complete in browser</p>
        ) : isChecking ? (
          <p className="text-xs text-text-dim mt-0.5">Checking auth…</p>
        ) : (
          <p className="text-xs text-text-dim mt-0.5">Installed · sign in needed</p>
        )}
        {authError && <p className="text-xs text-coral mt-0.5">{authError}</p>}
      </div>
      {isAuthed ? (
        <GreenCheck small />
      ) : isAuthing || isChecking ? (
        <Spinner className="text-violet" size={16} />
      ) : onSignIn ? (
        <button onClick={onSignIn} className="rounded-full bg-violet/10 px-4 py-1.5 text-xs font-semibold text-violet transition hover:bg-violet/20">
          Sign in
        </button>
      ) : (
        <GreenCheck small />
      )}
    </div>
  );
}

/** Auth row */
function AuthRowLight({ label, status, error, onSignIn }: { label: string; status: string; error: string | null; onSignIn: () => void }) {
  if (status === "checking") return <div className="flex items-center gap-2 px-4 py-2 text-sm"><Spinner className="text-text-ghost" size={14} /><span className="text-text-dim">Checking {label}…</span></div>;
  if (status === "authenticated") return <div className="flex items-center gap-2 px-4 py-2 text-sm text-emerald-600"><GreenCheck small /><span className="font-medium">Signed in to {label}</span></div>;
  if (status === "authenticating") return <div className="flex items-center gap-2 px-4 py-2 text-sm"><Spinner className="text-violet" size={14} /><span className="text-violet">Signing in…</span><span className="text-xs text-text-dim">Complete in browser</span></div>;
  return (
    <div className="px-4 py-1.5 space-y-1">
      <button onClick={onSignIn} className="rounded-full bg-violet/10 px-4 py-1.5 text-xs font-semibold text-violet transition hover:bg-violet/20">Sign in to {label}</button>
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  );
}

/** Spinner */
function Spinner({ className = "", size = 18 }: { className?: string; size?: number }) {
  return (
    <svg className={`animate-spin ${className}`} width={size} height={size} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/** Green check */
function GreenCheck({ small = false }: { small?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${small ? "h-4 w-4" : "h-5 w-5"} shrink-0 text-emerald-500`}>
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  );
}
