"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* ─── Types ─── */
type Step = "welcome" | "tools" | "github" | "provider" | "profile" | "done";
type AiProvider = "copilot" | "claude" | "both";

interface ToolCheckState {
  checking: boolean;
  installing: boolean;
  status: "unknown" | "ready" | "missing" | "error";
  detail: string;
}

const defaultTool: ToolCheckState = { checking: false, installing: false, status: "unknown", detail: "" };

/* ─── Helpers ─── */
const canUseElectron = () => typeof window !== "undefined" && !!window.electronAPI;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [displayName, setDisplayName] = useState("");
  const [git, setGit] = useState<ToolCheckState>(defaultTool);
  const [gh, setGh] = useState<ToolCheckState>(defaultTool);
  const [copilot, setCopilot] = useState<ToolCheckState>(defaultTool);
  const [claude, setClaude] = useState<ToolCheckState>(defaultTool);
  const [node, setNode] = useState<ToolCheckState>(defaultTool);
  const [aiProvider, setAiProvider] = useState<AiProvider>("copilot");
  const [finishing, setFinishing] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [installLog, setInstallLog] = useState<string>("");

  /* GitHub auth state */
  const [ghAuthStatus, setGhAuthStatus] = useState<"unknown" | "checking" | "authenticated" | "not-authenticated" | "authenticating" | "error">("unknown");
  const [ghAuthUsername, setGhAuthUsername] = useState<string | null>(null);
  const [ghAuthDeviceCode, setGhAuthDeviceCode] = useState<string | null>(null);
  const [ghAuthUrl, setGhAuthUrl] = useState<string | null>(null);
  const [ghAuthError, setGhAuthError] = useState<string | null>(null);

  /* Claude auth state */
  const [claudeAuthStatus, setClaudeAuthStatus] = useState<"unknown" | "checking" | "authenticated" | "not-authenticated" | "authenticating" | "error">("unknown");
  const [claudeAuthError, setClaudeAuthError] = useState<string | null>(null);

  /* Install progress animation */
  const installPhases = ["Downloading Claude Code…", "Running install scripts…", "Configuring CLI tools…", "Almost there…"];
  const [installPhase, setInstallPhase] = useState(0);
  useEffect(() => {
    if (!claude.installing) { setInstallPhase(0); return; }
    const id = setInterval(() => setInstallPhase((p) => (p + 1) % 4), 3000);
    return () => clearInterval(id);
  }, [claude.installing]);

  /* ── auto-check tools when we land on the tools or provider step ── */
  useEffect(() => {
    if ((step !== "tools" && step !== "provider") || !canUseElectron()) return;
    checkAllTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function checkAllTools() {
    if (!canUseElectron()) return;
    setGit((s) => ({ ...s, checking: true }));
    setGh((s) => ({ ...s, checking: true }));
    setCopilot((s) => ({ ...s, checking: true }));
    setClaude((s) => ({ ...s, checking: true }));
    setNode((s) => ({ ...s, checking: true }));
    try {
      const statuses = await window.electronAPI!.tools.listStatus();
      const find = (id: string) => statuses.find((t: { id: string }) => t.id === id);
      const gitTool = find("git");
      const ghTool = find("githubCli");
      const copilotTool = find("githubCopilotCli");
      const claudeTool = find("claudeCode");
      const nodeTool = find("node");

      setGit({ checking: false, installing: false, status: gitTool?.available ? "ready" : "missing", detail: gitTool?.detail || "" });
      setGh({ checking: false, installing: false, status: ghTool?.available ? "ready" : "missing", detail: ghTool?.detail || "" });
      setCopilot({ checking: false, installing: false, status: copilotTool?.available ? "ready" : "missing", detail: copilotTool?.detail || "" });
      setClaude({ checking: false, installing: false, status: claudeTool?.available ? "ready" : "missing", detail: claudeTool?.detail || "" });
      setNode({ checking: false, installing: false, status: nodeTool?.available ? "ready" : "missing", detail: nodeTool?.detail || "" });
    } catch {
      setGit({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setGh({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setCopilot({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setClaude({ checking: false, installing: false, status: "error", detail: "Check failed" });
      setNode({ checking: false, installing: false, status: "error", detail: "Check failed" });
    }
  }

  async function installCopilotExtension() {
    console.log("[install] installCopilotExtension called");
    if (!canUseElectron()) {
      console.log("[install] no electronAPI — aborting");
      setInstallLog("Error: Electron API not available. This button only works in the desktop app.");
      return;
    }
    setCopilot((s) => ({ ...s, installing: true }));
    setInstallLog("Starting Copilot CLI installation (trying multiple strategies)...");
    try {
      const result = await window.electronAPI!.tools.installCopilot();
      console.log("[install] installCopilot result:", result);

      // Show full log
      const fullLog = (result.log || []).join("\n");
      if (result.success) {
        setCopilot({ checking: false, installing: false, status: "ready", detail: result.detail || "Copilot CLI installed" });
        setInstallLog("Success: " + (result.detail || "Copilot CLI installed") + "\n\nFull log:\n" + fullLog);
      } else {
        setCopilot({ checking: false, installing: false, status: "error", detail: result.detail || "All install strategies failed" });
        setInstallLog(
          "INSTALLATION FAILED\n\n" +
          (result.detail || "All strategies failed") + "\n\n" +
          "──── Detailed Log ────\n" + fullLog + "\n\n" +
          "──── Manual Install Options ────\n" +
          "1. Install winget: https://aka.ms/getwinget then run: winget install GitHub.Copilot\n" +
          "2. Install VS Code + GitHub Copilot Chat extension\n" +
          "3. Install Node.js + run: npm install -g @githubnext/github-copilot-cli\n" +
          "4. After installing, click Re-check below"
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : "";
      console.error("[install] exception:", err);
      setCopilot({ checking: false, installing: false, status: "error", detail: "Install crashed: " + errMsg });
      setInstallLog(
        "INSTALL CRASHED\n\n" +
        "Error: " + errMsg + "\n" +
        (errStack ? "Stack: " + errStack + "\n" : "") +
        "\nThis is a bug — please report to the developer."
      );
    }
  }

  async function installClaudeExtension() {
    console.log("[install] installClaudeExtension called");
    if (!canUseElectron()) {
      setInstallLog("Error: Electron API not available.");
      return;
    }
    setClaude((s) => ({ ...s, installing: true }));
    setInstallLog("Starting Claude Code installation (trying multiple strategies)...");
    try {
      const result = await window.electronAPI!.tools.installClaude();
      console.log("[install] installClaude result:", result);
      const fullLog = (result.log || []).join("\n");
      if (result.success) {
        setClaude({ checking: false, installing: false, status: "ready", detail: result.detail || "Claude Code installed" });
        setInstallLog("");
        // Auto-check and trigger OAuth after successful install
        try {
          const authResult = await window.electronAPI!.tools.claudeAuthStatus();
          if (authResult.authenticated) {
            setClaudeAuthStatus("authenticated");
          } else {
            // Auto-trigger OAuth sign-in
            setClaudeAuthStatus("authenticating");
            try {
              const loginResult = await window.electronAPI!.tools.claudeAuthLogin();
              if (loginResult.success) {
                setClaudeAuthStatus("authenticated");
              } else {
                setClaudeAuthStatus("not-authenticated");
                setClaudeAuthError(loginResult.timedOut ? "Authentication timed out. Click below to try again." : "Sign-in was not completed. Click below to try again.");
              }
            } catch {
              setClaudeAuthStatus("not-authenticated");
              setClaudeAuthError("Something went wrong. Click below to try again.");
            }
          }
        } catch {
          setClaudeAuthStatus("not-authenticated");
        }
      } else {
        setClaude({ checking: false, installing: false, status: "error", detail: result.detail || "All install strategies failed" });
        setInstallLog(
          "INSTALLATION FAILED\n\n" +
          (result.detail || "All strategies failed") + "\n\n" +
          "──── Detailed Log ────\n" + fullLog + "\n\n" +
          "──── Manual Install ────\n" +
          "Open PowerShell and run:\n  irm https://claude.ai/install.ps1 | iex\n" +
          "Then click Re-check below."
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[install] claude exception:", err);
      setClaude({ checking: false, installing: false, status: "error", detail: "Install crashed: " + errMsg });
      setInstallLog("INSTALL CRASHED\n\nError: " + errMsg);
    }
  }

  async function installNodeJs() {
    if (!canUseElectron()) return;
    setNode((s) => ({ ...s, installing: true, detail: "Installing Node.js via winget…" }));
    try {
      const result = await window.electronAPI!.tools.installNode();
      if (result.success) {
        setNode({ checking: false, installing: false, status: "ready", detail: result.detail });
      } else {
        setNode({ checking: false, installing: false, status: "missing", detail: result.detail || "Install failed" });
      }
    } catch {
      setNode({ checking: false, installing: false, status: "error", detail: "Install crashed" });
    }
  }

  async function installGitScm() {
    if (!canUseElectron()) return;
    setGit((s) => ({ ...s, installing: true, detail: "Installing Git via winget…" }));
    try {
      const result = await window.electronAPI!.tools.installGit();
      if (result.success) {
        setGit({ checking: false, installing: false, status: "ready", detail: result.detail });
      } else {
        setGit({ checking: false, installing: false, status: "missing", detail: result.detail || "Install failed" });
      }
    } catch {
      setGit({ checking: false, installing: false, status: "error", detail: "Install crashed" });
    }
  }

  async function installGhCli() {
    if (!canUseElectron()) return;
    setGh((s) => ({ ...s, installing: true, detail: "Installing GitHub CLI via winget…" }));
    try {
      const result = await window.electronAPI!.tools.installGh();
      if (result.success) {
        setGh({ checking: false, installing: false, status: "ready", detail: result.detail });
      } else {
        setGh({ checking: false, installing: false, status: "missing", detail: result.detail || "Install failed" });
      }
    } catch {
      setGh({ checking: false, installing: false, status: "error", detail: "Install crashed" });
    }
  }

  /* ── Claude auth ── */
  async function checkClaudeAuth() {
    if (!canUseElectron()) return;
    setClaudeAuthStatus("checking");
    setClaudeAuthError(null);
    try {
      const result = await window.electronAPI!.tools.claudeAuthStatus();
      setClaudeAuthStatus(result.authenticated ? "authenticated" : "not-authenticated");
    } catch {
      setClaudeAuthStatus("not-authenticated");
    }
  }

  async function startClaudeAuth() {
    if (!canUseElectron()) return;
    setClaudeAuthStatus("authenticating");
    setClaudeAuthError(null);
    try {
      const result = await window.electronAPI!.tools.claudeAuthLogin();
      if (result.success) {
        setClaudeAuthStatus("authenticated");
      } else if (result.timedOut) {
        setClaudeAuthStatus("not-authenticated");
        setClaudeAuthError("Authentication timed out. Try again.");
      } else {
        setClaudeAuthStatus("not-authenticated");
        setClaudeAuthError("Authentication was not completed. Try again.");
      }
    } catch {
      setClaudeAuthStatus("error");
      setClaudeAuthError("Something went wrong. Make sure Claude Code is installed.");
    }
  }

  /* ── Check Claude auth when provider step loads and Claude is installed ── */
  useEffect(() => {
    if (step !== "provider" || !canUseElectron()) return;
    if (claude.status === "ready" && (aiProvider === "claude" || aiProvider === "both")) {
      checkClaudeAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, claude.status, aiProvider]);

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
      if (result.authenticated) {
        setGhAuthStatus("authenticated");
        setGhAuthUsername(result.username);
      } else {
        setGhAuthStatus("not-authenticated");
        setGhAuthUsername(null);
      }
    } catch {
      setGhAuthStatus("not-authenticated");
    }
  }

  async function startGithubAuth() {
    if (!canUseElectron()) return;
    setGhAuthStatus("authenticating");
    setGhAuthDeviceCode(null);
    setGhAuthUrl(null);
    setGhAuthError(null);

    // Listen for progress events (device code + URL)
    const unsub = window.electronAPI!.tools.onGithubAuthProgress((event) => {
      if (event.deviceCode) setGhAuthDeviceCode(event.deviceCode);
      if (event.verificationUrl) setGhAuthUrl(event.verificationUrl);
    });

    try {
      const result = await window.electronAPI!.tools.githubAuthLogin();
      unsub();
      if (result.success) {
        setGhAuthStatus("authenticated");
        // Re-check to get username
        const status = await window.electronAPI!.tools.githubAuthStatus();
        setGhAuthUsername(status.username);
      } else if (result.timedOut) {
        setGhAuthStatus("not-authenticated");
        setGhAuthError("Authentication timed out. Try again.");
      } else {
        setGhAuthStatus("not-authenticated");
        setGhAuthError("Authentication was not completed. Try again.");
      }
    } catch {
      unsub();
      setGhAuthStatus("error");
      setGhAuthError("Something went wrong. Make sure GitHub CLI is installed.");
    }
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      if (canUseElectron()) {
        // Save display name + AI provider choice into settings
        const updates: Record<string, unknown> = {
          featureFlags: {
            githubCopilotCli: aiProvider === "copilot" || aiProvider === "both",
            claudeCode: aiProvider === "claude" || aiProvider === "both",
            githubCompanion: true,
          },
        };
        if (displayName.trim()) updates.displayName = displayName.trim();
        await window.electronAPI!.settings.update(updates);
        // Mark onboarding as complete
        await window.electronAPI!.settings.completeOnboarding();
      }
      router.push("/home");
    } catch {
      router.push("/home");
    }
  }

  /* Navigation helper: what comes after provider step */
  function handleProviderContinue() {
    setStep("profile");
  }

  /* ── Step renderers ── */
  const steps: Step[] = ["welcome", "tools", "github", "provider", "profile", "done"];
  const stepIndex = steps.indexOf(step);
  const totalSteps = steps.length;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 px-6">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[120px]" />

      {/* Progress dots */}
      <div className="absolute top-8 flex gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-500 ${
              i <= stepIndex ? "w-8 bg-indigo-400" : "w-2 bg-white/20"
            }`}
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        {/* ── STEP 1: Welcome ── */}
        {step === "welcome" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-bold text-white shadow-lg shadow-indigo-500/30">
              CB
            </div>
            <h1 className="mt-8 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Welcome to CodeBuddy
            </h1>
            <p className="mt-4 text-lg text-indigo-200/70">
              Build software with your friends. No coding experience needed.
            </p>
            <p className="mt-2 text-sm text-indigo-300/50">
              Free forever. No credit card. Everything runs on your machine.
            </p>

            {/* Invite code input */}
            <div className="mt-10 w-full">
              <label className="block text-left text-xs font-semibold uppercase tracking-widest text-indigo-300/60">
                Have an invite code?
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Paste your friend's invite code"
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30"
                />
              </div>
              <p className="mt-1.5 text-left text-xs text-indigo-300/40">
                Skip this if you&apos;re starting fresh — you can join projects later.
              </p>
            </div>

            <button
              onClick={() => setStep("tools")}
              className="mt-8 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-8 py-4 text-[15px] font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:shadow-indigo-500/30"
            >
              Let&apos;s set up
            </button>
          </div>
        )}

        {/* ── STEP 2: Tools Check ── */}
        {step === "tools" && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold tracking-tight text-white">Check your tools</h2>
            <p className="mt-3 text-sm text-indigo-200/60">
              CodeBuddy needs Git, Node.js, and GitHub CLI installed on your machine.
            </p>

            <div className="mt-8 space-y-3">
              <ToolRow label="Git" state={git} required onInstall={installGitScm} helpUrl="https://git-scm.com/downloads" />
              <ToolRow label="Node.js" state={node} required onInstall={installNodeJs} helpUrl="https://nodejs.org" />
              <ToolRow label="GitHub CLI" state={gh} required onInstall={installGhCli} helpUrl="https://cli.github.com" />
            </div>

            <p className="mt-4 text-xs text-indigo-300/40">
              Just installed something? Hit Re-check — we&apos;ll pick it up without restarting.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep("welcome")}
                className="flex-1 rounded-xl border border-white/10 px-6 py-3.5 text-sm font-medium text-white/70 transition hover:bg-white/5"
              >
                Back
              </button>
              <button
                onClick={checkAllTools}
                className="rounded-xl border border-indigo-400/30 px-5 py-3.5 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/10"
              >
                Re-check
              </button>
              <button
                onClick={() => setStep("github")}
                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: AI Provider ── */}
        {step === "provider" && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold tracking-tight text-white">Choose your AI</h2>
            <p className="mt-3 text-sm text-indigo-200/60">
              Pick the AI assistant that will help you write code. You can change this later.
            </p>

            {/* Simple radio selection */}
            <div className="mt-8 space-y-2">
              <div
                onClick={() => setAiProvider("copilot")}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-5 py-3.5 transition ${
                  aiProvider === "copilot"
                    ? "border-indigo-400/40 bg-indigo-500/10 ring-1 ring-indigo-400/30"
                    : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                }`}
              >
                <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${aiProvider === "copilot" ? "border-indigo-400" : "border-white/30"}`}>
                  {aiProvider === "copilot" && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
                </div>
                <span className="text-sm font-semibold text-white">GitHub Copilot</span>
                <span className="text-xs text-white/40">— free with GitHub account</span>
              </div>
              <div
                onClick={() => setAiProvider("claude")}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-5 py-3.5 transition ${
                  aiProvider === "claude"
                    ? "border-amber-400/40 bg-amber-500/10 ring-1 ring-amber-400/30"
                    : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                }`}
              >
                <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${aiProvider === "claude" ? "border-amber-400" : "border-white/30"}`}>
                  {aiProvider === "claude" && <div className="h-2 w-2 rounded-full bg-amber-400" />}
                </div>
                <span className="text-sm font-semibold text-white">Claude Code</span>
                <span className="text-xs text-white/40">— Anthropic&apos;s CLI agent</span>
              </div>
              <div
                onClick={() => setAiProvider("both")}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-5 py-3.5 transition ${
                  aiProvider === "both"
                    ? "border-emerald-400/40 bg-emerald-500/10 ring-1 ring-emerald-400/30"
                    : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                }`}
              >
                <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${aiProvider === "both" ? "border-emerald-400" : "border-white/30"}`}>
                  {aiProvider === "both" && <div className="h-2 w-2 rounded-full bg-emerald-400" />}
                </div>
                <span className="text-sm font-semibold text-white">Both</span>
                <span className="text-xs text-white/40">— switch any time</span>
              </div>
            </div>

            {/* Required tools — same layout as the tools check page */}
            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300/50">Required tools</p>
              {(aiProvider === "copilot" || aiProvider === "both") && (
                <ToolRow label="Copilot Extension" state={copilot} required onInstall={gh.status === "ready" ? installCopilotExtension : undefined} helpUrl={gh.status !== "ready" ? undefined : undefined} />
              )}
              {(aiProvider === "claude" || aiProvider === "both") && (
                <>
                  <ToolRow label="Claude Code" state={claude} required onInstall={installClaudeExtension} />
                  {claude.installing && (
                    <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-5 py-6 animate-in fade-in duration-300">
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative flex h-12 w-12 items-center justify-center">
                          <div className="absolute inset-0 rounded-full border-2 border-amber-400/20" />
                          <div className="absolute inset-0 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                          <span className="text-lg">🔧</span>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-amber-300">{installPhases[installPhase]}</p>
                          <p className="mt-1 text-xs text-white/40">This may take a minute — hang tight!</p>
                        </div>
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="h-1.5 w-1.5 rounded-full bg-amber-400" style={{ animation: `install-dot-pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {claude.status === "ready" && (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                      {claudeAuthStatus === "checking" && (
                        <div className="flex items-center gap-3">
                          <svg className="h-4 w-4 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          <span className="text-sm text-white/60">Checking Claude login...</span>
                        </div>
                      )}
                      {claudeAuthStatus === "authenticated" && (
                        <div className="flex items-center gap-2 text-emerald-400">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                          <span className="text-sm font-semibold">Signed in to Claude</span>
                        </div>
                      )}
                      {(claudeAuthStatus === "not-authenticated" || claudeAuthStatus === "error" || claudeAuthStatus === "unknown") && (
                        <div className="space-y-2">
                          <p className="text-xs text-white/50">Claude Code is installed. Sign in to activate it.</p>
                          <button
                            onClick={startClaudeAuth}
                            className="w-full rounded-lg bg-amber-500/20 px-4 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/30"
                          >
                            Sign in to Claude
                          </button>
                        </div>
                      )}
                      {claudeAuthStatus === "authenticating" && (
                        <div className="flex flex-col items-center gap-3 py-2">
                          <svg className="h-6 w-6 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          <p className="text-sm font-semibold text-amber-300">Log in to Claude Code</p>
                          <p className="text-xs text-white/50">A browser window should open — complete sign-in there.</p>
                        </div>
                      )}
                      {claudeAuthError && (
                        <p className="mt-2 text-xs text-red-400">{claudeAuthError}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {installLog && (
              <div className={`mt-4 rounded-lg border px-4 py-3 max-h-60 overflow-y-auto ${
                installLog.includes("FAILED") || installLog.includes("CRASHED")
                  ? "border-red-400/30 bg-red-500/10"
                  : installLog.includes("Success")
                    ? "border-green-400/30 bg-green-500/10"
                    : "border-indigo-400/30 bg-indigo-500/10"
              }`}>
                <pre className="text-xs font-mono text-indigo-200 whitespace-pre-wrap break-words">{installLog}</pre>
              </div>
            )}

            <p className="mt-4 text-xs text-indigo-300/40">
              Just installed something? Hit Re-check — we&apos;ll pick it up without restarting.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep("github")}
                className="flex-1 rounded-xl border border-white/10 px-6 py-3.5 text-sm font-medium text-white/70 transition hover:bg-white/5"
              >
                Back
              </button>
              <button
                onClick={checkAllTools}
                className="rounded-xl border border-indigo-400/30 px-5 py-3.5 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/10"
              >
                Re-check
              </button>
              <button
                onClick={handleProviderContinue}
                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: GitHub Account ── */}
        {step === "github" && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold tracking-tight text-white">Connect your GitHub</h2>
            <p className="mt-3 text-sm text-indigo-200/60">
              CodeBuddy uses GitHub to store your projects and collaborate with friends.
            </p>

            <div className="mt-8">
              {ghAuthStatus === "checking" && (
                <div className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-6">
                  <svg className="h-5 w-5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  <span className="text-sm text-white/60">Checking GitHub status...</span>
                </div>
              )}

              {ghAuthStatus === "authenticated" && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-5 py-6 text-center">
                  <div className="flex items-center justify-center gap-2 text-emerald-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                    <span className="text-lg font-semibold">Connected</span>
                  </div>
                  <p className="mt-2 text-sm text-emerald-300/70">
                    Signed in as <span className="font-semibold text-emerald-300">{ghAuthUsername}</span>
                  </p>
                </div>
              )}

              {(ghAuthStatus === "not-authenticated" || ghAuthStatus === "error" || ghAuthStatus === "unknown") && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-6 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto h-10 w-10 text-white/30"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                    <p className="mt-4 text-sm text-white/60">Not connected to GitHub yet</p>
                  </div>

                  <button
                    onClick={startGithubAuth}
                    className="w-full rounded-xl bg-white px-6 py-4 text-[15px] font-semibold text-gray-900 shadow-lg transition hover:bg-gray-100"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                      Sign in with GitHub
                    </span>
                  </button>
                </div>
              )}

              {ghAuthStatus === "authenticating" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-5 py-6 text-center">
                    {ghAuthDeviceCode ? (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/60">Step 1: Copy this code</p>
                        <p className="mt-3 select-all font-mono text-3xl font-bold tracking-[0.2em] text-amber-300">{ghAuthDeviceCode}</p>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-amber-300/60">Step 2: Open this link and paste the code</p>
                        <button
                          onClick={() => {
                            if (ghAuthUrl) window.electronAPI?.system?.openExternal(ghAuthUrl);
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/30"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" /></svg>
                          Open github.com/login/device
                        </button>
                        <p className="mt-4 text-xs text-amber-300/40">Step 3: Authorize the app, then come back here — it&apos;ll update automatically.</p>
                      </>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        <svg className="h-5 w-5 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        <span className="text-sm text-amber-300/70">Starting GitHub authentication...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {ghAuthError && (
                <p className="mt-3 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{ghAuthError}</p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep("tools")}
                className="flex-1 rounded-xl border border-white/10 px-6 py-3.5 text-sm font-medium text-white/70 transition hover:bg-white/5"
              >
                Back
              </button>
              <button
                onClick={() => setStep("provider")}
                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl"
              >
                {ghAuthStatus === "authenticated" ? "Continue" : "Skip for now"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Profile ── */}
        {step === "profile" && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold tracking-tight text-white">What should we call you?</h2>
            <p className="mt-3 text-sm text-indigo-200/60">
              This is how you&apos;ll appear to friends in shared projects.
            </p>

            <div className="mt-8">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-center text-lg font-medium text-white placeholder-white/30 outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && displayName.trim()) setStep("done");
                }}
              />
              {displayName.trim() && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
                    {displayName.trim().slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm text-indigo-200/70">
                    Your avatar in shared projects
                  </span>
                </div>
              )}
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setStep("provider")}
                className="flex-1 rounded-xl border border-white/10 px-6 py-3.5 text-sm font-medium text-white/70 transition hover:bg-white/5"
              >
                Back
              </button>
              <button
                onClick={() => setStep("done")}
                disabled={!displayName.trim()}
                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl disabled:opacity-40 disabled:shadow-none"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl">
              ✓
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-white">You&apos;re all set!</h2>
            <p className="mt-3 text-sm text-indigo-200/60">
              Start a project, invite friends, and build something amazing together.
            </p>

            {inviteCode.trim() && (
              <div className="mt-6 rounded-xl border border-indigo-400/20 bg-indigo-500/5 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300/60">Invite code saved</p>
                <p className="mt-1 text-sm text-indigo-200/80">
                  We&apos;ll connect you to your friend&apos;s project after setup.
                </p>
              </div>
            )}

            <button
              onClick={handleFinish}
              disabled={finishing}
              className="mt-8 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-8 py-4 text-[15px] font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl disabled:opacity-60"
            >
              {finishing ? "Setting up..." : "Open CodeBuddy"}
            </button>
          </div>
        )}
      </div>

      <footer className="absolute bottom-6 text-xs text-indigo-300/30">
        CodeBuddy — free forever
      </footer>
    </div>
  );
}

/* ─── Tool status row ─── */
function ToolRow({
  label,
  state,
  required,
  helpUrl,
  onInstall,
}: {
  label: string;
  state: ToolCheckState;
  required?: boolean;
  helpUrl?: string;
  onInstall?: () => void;
}) {
  const statusIcon =
    state.checking
      ? "⟳"
      : state.status === "ready"
        ? "✓"
        : state.status === "missing"
          ? "✗"
          : state.status === "error"
            ? "!"
            : "?";

  const statusColor =
    state.status === "ready"
      ? "text-emerald-400"
      : state.status === "missing"
        ? "text-amber-400"
        : state.status === "error"
          ? "text-red-400"
          : "text-white/40";

  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-sm font-bold ${statusColor}`}>
        {state.checking ? (
          <span className="animate-spin">⟳</span>
        ) : (
          statusIcon
        )}
      </span>
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-white">
          {label}
          {required && <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-400/60">Required</span>}
        </p>
        {state.detail && (
          <p className={`mt-0.5 text-xs line-clamp-2 ${state.status === "error" ? "text-red-400" : state.status === "missing" ? "text-amber-400/70" : "text-white/40"}`}>{state.detail}</p>
        )}
      </div>
      {state.status !== "ready" && !state.checking && onInstall && (
        <button
          onClick={onInstall}
          disabled={state.installing}
          className="rounded-lg bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/30 disabled:opacity-50"
        >
          {state.installing ? "Installing..." : "Install"}
        </button>
      )}
      {state.status !== "ready" && !state.checking && helpUrl && !onInstall && (
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            if (typeof window !== "undefined" && window.electronAPI) {
              window.electronAPI.system.openExternal(helpUrl);
            }
          }}
          className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/50 transition hover:bg-white/10 hover:text-white/70"
        >
          Get it
        </a>
      )}
    </div>
  );
}

/* ─── Small pill showing tool status (for provider cards) ─── */
function ToolPill({ label, state }: { label: string; state: ToolCheckState }) {
  const color =
    state.checking
      ? "border-white/10 text-white/40"
      : state.installing
        ? "border-indigo-400/30 text-indigo-400"
        : state.status === "ready"
          ? "border-emerald-400/30 text-emerald-400"
          : state.status === "missing"
            ? "border-amber-400/30 text-amber-400"
            : "border-white/10 text-white/40";

  const icon = state.checking ? "…" : state.installing ? "⟳" : state.status === "ready" ? "✓" : state.status === "missing" ? "✗" : "?";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color}`}>
      {state.installing ? <span className="animate-spin">⟳</span> : icon} {label}
    </span>
  );
}

/* ─── Check circle icon for selected provider ─── */
function CheckCircle() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  );
}
