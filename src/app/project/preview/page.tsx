"use client";

import { useEffect, useRef, useState } from "react";

import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

/* ------------------------------------------------------------------ */
/*  Device presets                                                     */
/* ------------------------------------------------------------------ */
const devicePresets = [
  { label: "Desktop", width: "100%" },
  { label: "Tablet", width: "820px" },
  { label: "Mobile", width: "390px" },
] as const;

type DevicePreset = (typeof devicePresets)[number]["label"];

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */
function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.97.633-3.792 1.708-5.27" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Port injection (simplified — relies primarily on PORT env var)     */
/* ------------------------------------------------------------------ */
/* Port injection removed — we let the project use its natural port and detect it from output */

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */
export default function PreviewPage() {
  const { activeProject } = useActiveDesktopProject();

  /* --- preview state --- */
  const [pendingPreviewLaunch, setPendingPreviewLaunch] = useState(false);
  const [previewProcessId, setPreviewProcessId] = useState<string | null>(null);
  const previewProcessIdRef = useRef<string | null>(null);
  const previewPortRef = useRef<number>(0);
  const previewReadyRef = useRef(false);
  const [previewReady, setPreviewReady] = useState(false);
  const setPreviewReadyState = (value: boolean) => {
    previewReadyRef.current = value;
    setPreviewReady(value);
  };
  const [previewServerStatus, setPreviewServerStatus] = useState("Idle");
  const [previewServerOutput, setPreviewServerOutput] = useState("");
  const [previewExited, setPreviewExited] = useState(false);
  const [detectedPreviewUrl, setDetectedPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"web" | "terminal">("web");
  const previewModeRef = useRef<"web" | "terminal">("web");
  const setPreviewModeState = (value: "web" | "terminal") => {
    previewModeRef.current = value;
    setPreviewMode(value);
  };
  const [device, setDevice] = useState<DevicePreset>("Desktop");
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);

  const devicePreset = devicePresets.find((p) => p.label === device) ?? devicePresets[0];

  /* --- process event listeners --- */
  useEffect(() => {
    if (!window.electronAPI?.process || !activeProject) return;

    const isPreviewCommand = (command?: string, cwd?: string) => {
      const cwdMatch = typeof cwd === "string" && typeof activeProject.repoPath === "string"
        && cwd.toLowerCase().replace(/[\\/]+$/g, "") === activeProject.repoPath.toLowerCase().replace(/[\\/]+$/g, "");
      return Boolean(cwdMatch && command && /npm|node|python|flask|cargo|vite|next|concurrently|react-scripts|webpack|parcel|rollup|esbuild|turbo|pnpm|yarn|bun|pip|uvicorn|gunicorn|rails|bundle|go\s+run|dotnet|make|docker/i.test(command));
    };

    const isOurProcess = (processId?: string) =>
      processId != null && processId === previewProcessIdRef.current;

    const stopStarted = window.electronAPI.process.onStarted((event) => {
      if (!isPreviewCommand(event.command, event.cwd)) return;
      previewProcessIdRef.current = event.processId;
      setPreviewProcessId(event.processId);
      setPendingPreviewLaunch(false);

      if (previewModeRef.current === "terminal") {
        setPreviewServerStatus("Running...");
        setPreviewReadyState(true);
      } else {
        setPreviewServerStatus("Server starting — waiting for localhost URL...");
      }
    });

    let healthCheckTimer: ReturnType<typeof setTimeout> | null = null;
    let keywordFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let detectedRealUrl: string | null = null;
    const markPreviewReady = (url: string) => {
      setPreviewReadyState(true);
      setDetectedPreviewUrl(url);
      setPreviewServerStatus("Preview server ready");
    };
    const waitForServerReady = (url: string) => {
      if (previewReadyRef.current) return;
      if (keywordFallbackTimer) { clearTimeout(keywordFallbackTimer); keywordFallbackTimer = null; }
      detectedRealUrl = url;
      let attempts = 0;
      const maxAttempts = 30;
      const check = () => {
        if (previewReadyRef.current) return;
        attempts++;
        fetch(url, { mode: "no-cors" })
          .then(() => { if (!previewReadyRef.current) markPreviewReady(url); })
          .catch(() => {
            if (attempts < maxAttempts && !previewReadyRef.current) {
              healthCheckTimer = setTimeout(check, 1000);
            } else if (!previewReadyRef.current) {
              markPreviewReady(url);
            }
          });
      };
      check();
    };

    // Probe a list of candidate ports to find the running server
    const probePortsForServer = async () => {
      if (previewReadyRef.current || detectedRealUrl) return;
      const agentPort = previewPortRef.current;
      const commonPorts = [3000, 3001, 5173, 5174, 8080, 8000, 4200, 4000, 8888, 1234];
      const candidates = agentPort && agentPort > 0
        ? [agentPort, ...commonPorts.filter((p) => p !== agentPort)]
        : commonPorts;
      for (const port of candidates) {
        if (previewReadyRef.current || detectedRealUrl) return;
        try {
          await fetch(`http://localhost:${port}`, { mode: "no-cors" });
          if (!previewReadyRef.current && !detectedRealUrl) {
            waitForServerReady(`http://localhost:${port}`);
          }
          return;
        } catch { /* try next */ }
      }
      const lastResort = agentPort && agentPort > 0 ? agentPort : 3000;
      if (!previewReadyRef.current && !detectedRealUrl) {
        waitForServerReady(`http://localhost:${lastResort}`);
      }
    };

    const stopOutput = window.electronAPI.process.onOutput((event) => {
      if (!isOurProcess(event.processId)) return;
      const nextChunk = event.chunk || "";
      setPreviewServerOutput((current) => `${current}${nextChunk}`.slice(-12000));
      if (previewReadyRef.current) return;
      // Terminal mode: no URL detection needed
      if (previewModeRef.current === "terminal") return;
      const urlMatch = nextChunk.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
      if (urlMatch) {
        if (healthCheckTimer) { clearTimeout(healthCheckTimer); healthCheckTimer = null; }
        setPreviewServerStatus("Server found — waiting for it to be ready...");
        waitForServerReady(urlMatch[0]);
      } else if (!detectedRealUrl && /ready|compiled|successfully|listening|started|available/i.test(nextChunk)) {
        if (!keywordFallbackTimer) {
          setPreviewServerStatus("Server appears ready — looking for URL...");
          keywordFallbackTimer = setTimeout(() => {
            keywordFallbackTimer = null;
            if (!detectedRealUrl && !previewReadyRef.current) {
              setPreviewServerStatus("Scanning ports to find the server...");
              void probePortsForServer();
            }
          }, 3000);
        }
      }
    });

    const stopCompleted = window.electronAPI.process.onCompleted((event) => {
      if (!isOurProcess(event.processId)) return;

      // Terminal mode: process completion IS the expected outcome
      if (previewModeRef.current === "terminal") {
        previewProcessIdRef.current = null;
        setPreviewProcessId(null);
        setPendingPreviewLaunch(false);
        setPreviewServerStatus(
          event.exitCode === 0 || event.exitCode === null ? "Completed successfully" : `Exited with code ${event.exitCode}`
        );
        return;
      }

      const wasReady = previewReadyRef.current;
      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      if (wasReady) {
        setPreviewServerStatus("Server exited — preview may still work");
      } else {
        setPreviewExited(true);
        setPreviewReadyState(false);
        setPreviewServerStatus(
          event.exitCode === 0 || event.exitCode === null ? "Server exited" : `Server exited with code ${event.exitCode}`
        );
      }
    });

    const stopError = window.electronAPI.process.onError((event) => {
      if (!isOurProcess(event.processId)) return;
      const wasReady = previewReadyRef.current;
      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      if (!wasReady) {
        setPreviewExited(true);
        setPreviewReadyState(false);
        setPreviewServerStatus(event.message || "Server failed to start");
      }
      setPreviewServerOutput((current) => `${current}${event.message ? `ERROR: ${event.message}\n` : ""}`.slice(-12000));
    });

    const stopCancelled = window.electronAPI.process.onCancelled((event) => {
      if (!isOurProcess(event.processId)) return;
      setPreviewReadyState(false);
      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus("Server stopped");
    });

    const stopTimeout = window.electronAPI.process.onTimeout((event) => {
      if (!isOurProcess(event.processId)) return;
      setPreviewReadyState(false);
      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus("Server startup timed out");
    });

    return () => {
      if (healthCheckTimer) clearTimeout(healthCheckTimer);
      if (keywordFallbackTimer) clearTimeout(keywordFallbackTimer);
      stopStarted();
      stopOutput();
      stopCompleted();
      stopError();
      stopCancelled();
      stopTimeout();
    };
  }, [activeProject?.repoPath]);

  /* --- auto-scroll log output --- */
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [previewServerOutput]);

  /* --- Escape to exit fullscreen --- */
  useEffect(() => {
    if (!previewFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewFullscreen]);

  /* --- handlers --- */
  const handleRunApp = async () => {
    if (!activeProject || pendingPreviewLaunch || previewProcessIdRef.current) return;

    setPendingPreviewLaunch(true);
    setPreviewReadyState(false);
    setPreviewExited(false);
    setPreviewServerStatus("Analyzing project...");
    setPreviewServerOutput("");
    setDetectedPreviewUrl(null);

    try {
      let launchCommand: string | null = null;

      let expectedPort: number | null = null;

      if (window.electronAPI?.project?.launchDevServer) {
        try {
          setPreviewServerStatus("Copilot is determining the best way to start your app...");
          const result = await window.electronAPI.project.launchDevServer({
            projectId: activeProject.id,
            model: "auto",
          });
          if (result?.launchCommand) launchCommand = result.launchCommand;
          if (result?.expectedPort) expectedPort = result.expectedPort;
          if (result?.previewMode === "terminal" || result?.previewMode === "web") {
            setPreviewModeState(result.previewMode);
          }
        } catch { /* fallback below */ }
      }

      if (!launchCommand) {
        const isWin = window.electronAPI?.platform === "win32";
        const npm = isWin ? "npm.cmd" : "npm";
        launchCommand = `${npm} install && ${npm} run dev`;
      }

      if (!window.electronAPI?.process) throw new Error("Process API not available");

      previewPortRef.current = expectedPort || 0;

      setPreviewServerStatus(expectedPort
        ? `Installing deps & starting server (expected port ${expectedPort})...`
        : "Installing deps & starting server...");
      setPreviewServerOutput(`> ${launchCommand}\n`);

      window.electronAPI.process.run({
        command: launchCommand,
        cwd: activeProject.repoPath,
        options: {
          env: {
            BROWSER: "none",
            OPEN_BROWSER: "false",
            FORCE_COLOR: "0",
          },
        },
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Server process failed";
        previewProcessIdRef.current = null;
        setPreviewProcessId(null);
        setPendingPreviewLaunch(false);
        setPreviewExited(true);
        setPreviewServerStatus(message);
        setPreviewServerOutput((current) => `${current}ERROR: ${message}\n`.slice(-12000));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start the app";
      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewExited(true);
      setPreviewServerStatus(message);
      setPreviewServerOutput((current) => `${current}ERROR: ${message}\n`.slice(-12000));
    }
  };

  const handleStopPreviewServer = async () => {
    const pid = previewProcessIdRef.current;
    if (pid && window.electronAPI?.process?.cancel) {
      try { await window.electronAPI.process.cancel(pid); } catch { /* ignore */ }
    }
    setPreviewReadyState(false);
    previewProcessIdRef.current = null;
    setPreviewProcessId(null);
    setPendingPreviewLaunch(false);
    setPreviewExited(false);
    setPreviewServerStatus("Idle");
    setDetectedPreviewUrl(null);
  };

  /* --- render --- */
  const isRunning = pendingPreviewLaunch || Boolean(previewProcessId);
  const showWebview = previewMode === "web" && detectedPreviewUrl && previewReady;
  const showTerminalPreview = previewMode === "terminal" && previewReady;

  return (
    <div className="flex h-screen text-text">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* --- Header bar --- */}
        <div className="surface flex flex-shrink-0 items-center justify-between border-b border-edge px-5 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-body-lg font-semibold tracking-tight text-text">{activeProject?.name ?? "Preview"}</h1>
            {showWebview ? (
              <span className="rounded-full bg-mint/12 px-2.5 py-1 text-label font-semibold text-mint">Live</span>
            ) : showTerminalPreview ? (
              <span className="rounded-full bg-mint/12 px-2.5 py-1 text-label font-semibold text-mint">{previewProcessId ? "Running" : "Done"}</span>
            ) : isRunning ? (
              <span className="animate-pulse rounded-full bg-sun/12 px-2.5 py-1 text-label font-semibold text-sun">Starting</span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {showWebview ? (
              <div className="app-control-rail inline-flex rounded-full p-0.5">
                {devicePresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setDevice(preset.label)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${device === preset.label ? "app-control-active" : "app-control-idle"}`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            ) : null}

            {showWebview ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const wv = document.querySelector("webview") as HTMLElement & { reload?: () => void } | null;
                    if (wv?.reload) wv.reload();
                  }}
                  className="rounded-full bg-black/[0.06] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.10] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFullscreen(true)}
                  className="rounded-full bg-black/[0.06] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.10] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
                >
                  Fullscreen
                </button>
              </>
            ) : showTerminalPreview ? (
              <button
                type="button"
                onClick={() => setPreviewFullscreen(true)}
                className="rounded-full bg-black/[0.06] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.10] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
              >
                Fullscreen
              </button>
            ) : null}

            {isRunning ? (
              <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/16 px-4 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-500/24 dark:text-red-400">Stop</button>
            ) : (
              <button type="button" onClick={() => void handleRunApp()} className="rounded-full bg-[#111827] px-4 py-1.5 text-[11px] font-semibold text-white shadow transition hover:bg-[#0b1220] dark:bg-white dark:text-[#111827] dark:hover:bg-white/90">{previewExited ? "Retry" : "Run App"}</button>
            )}
          </div>
        </div>

        {/* --- Main content --- */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {showTerminalPreview ? (
            /* Terminal preview */
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.2rem] bg-[#0d1117] shadow-[0_16px_48px_rgba(0,0,0,0.10)] ring-1 ring-black/[0.08] dark:ring-white/[0.08]">
                <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#161b22] px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
                  </div>
                  <div className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/60">
                    {activeProject?.repoPath}
                  </div>
                  {!previewProcessId ? (
                    <span className="text-[10px] font-medium text-white/40">{previewServerStatus}</span>
                  ) : null}
                </div>
                <pre
                  ref={logRef}
                  className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-[1.65] text-green-300/90 selection:bg-green-600/30"
                >
                  {previewServerOutput || "Waiting for output...\n"}
                </pre>
                <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-[#161b22] px-4 py-2.5">
                  {previewProcessId ? (
                    <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/20 px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/30">Stop</button>
                  ) : (
                    <button type="button" onClick={() => { setPreviewExited(false); setPreviewServerOutput(""); void handleRunApp(); }} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.14]">Re-run</button>
                  )}
                </div>
              </div>
            </div>
          ) : showWebview ? (
            /* Live webview preview */
            <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden bg-[#ede8de] p-4 dark:bg-[#121417]">
              <div className="flex min-h-0 w-full flex-1 flex-col items-center">
                <div
                  className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.2rem] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.10)] ring-1 ring-black/[0.08] dark:ring-white/[0.08]"
                  style={{ width: devicePreset.width, maxWidth: "100%" }}
                >
                  {/* Browser chrome bar */}
                  <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.06] bg-[#f7f1e8] px-4 py-2 dark:border-white/[0.06] dark:bg-[#1a1d22]">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-black/[0.08] dark:bg-white/[0.12]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-black/[0.08] dark:bg-white/[0.12]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-black/[0.08] dark:bg-white/[0.12]" />
                    </div>
                    <div className="ml-3 flex-1 truncate rounded-full bg-black/[0.04] px-3 py-1 dark:bg-white/[0.06]">
                      <p className="truncate text-[10px] theme-muted">{detectedPreviewUrl}</p>
                    </div>
                  </div>
                  <webview
                    key={detectedPreviewUrl}
                    src={detectedPreviewUrl}
                    style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
                    ref={(el: HTMLElement | null) => {
                      if (!el) return;
                      const wv = el as HTMLElement & { addEventListener: HTMLElement["addEventListener"] };
                      const handler = (e: Event) => { e.preventDefault(); };
                      wv.addEventListener("new-window", handler);
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Empty state / loading state / error state */
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden p-8 text-center">
              <GlobeIcon className="h-14 w-14 flex-shrink-0 theme-muted opacity-25" />
              <div className="flex-shrink-0">
                <p className="text-[17px] font-semibold theme-fg">
                  {previewExited ? "App failed to start" : "Preview your app"}
                </p>
                <p className="mt-2 max-w-md text-[13px] theme-muted">
                  {previewExited
                    ? "The server process exited before producing a preview. Check the output below."
                    : isRunning
                      ? previewServerStatus
                      : "Run your app to see a live preview with device-responsive sizing."}
                </p>
              </div>

              {(isRunning || previewExited) && previewServerOutput ? (
                <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-3 overflow-hidden">
                  {isRunning ? (
                    <p className="flex-shrink-0 animate-pulse text-[12px] font-medium theme-muted">{previewServerStatus}</p>
                  ) : (
                    <p className="flex-shrink-0 text-[12px] font-medium text-red-500">{previewServerStatus}</p>
                  )}
                  <pre
                    ref={logRef}
                    className={`min-h-0 flex-1 overflow-auto rounded-[1rem] p-4 text-left text-[11px] leading-relaxed theme-muted ${previewExited ? "bg-red-500/5 dark:bg-red-500/10" : "bg-black/5 dark:bg-white/5"}`}
                  >
                    {previewServerOutput.slice(-4000)}
                  </pre>
                </div>
              ) : null}

              {!isRunning && !previewExited ? (
                <button type="button" onClick={() => void handleRunApp()} className="rounded-full bg-[#111827] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(17,24,39,0.18)] transition hover:-translate-y-[1px] hover:bg-[#0b1220] dark:bg-white dark:text-[#111827] dark:hover:bg-white/90">Run App</button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* --- Fullscreen overlay --- */}
      {previewFullscreen ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0d1117]">
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#161b22] px-4 py-2.5">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPreviewFullscreen(false)} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/16">Exit Fullscreen</button>
              <div className="min-w-0 flex-1 truncate text-[11px] text-white/50">{previewMode === "terminal" ? `${activeProject?.repoPath} — Terminal Preview` : (detectedPreviewUrl ?? "")}</div>
            </div>
            <div className="flex items-center gap-2">
              {previewMode !== "terminal" ? (
                <button
                  type="button"
                  onClick={() => {
                    const wv = document.querySelector(".fullscreen-preview-webview") as HTMLElement & { reload?: () => void } | null;
                    if (wv?.reload) wv.reload();
                  }}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/16"
                >
                  Refresh
                </button>
              ) : null}
              <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/20 px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/30">Stop</button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 bg-white">
            {previewMode === "terminal" ? (
              <div className="flex h-full flex-col bg-[#0d1117]">
                <pre className="min-h-0 flex-1 overflow-auto px-6 py-4 font-mono text-[13px] leading-[1.7] text-green-300/90 selection:bg-green-600/30">
                  {previewServerOutput || "Waiting for output...\n"}
                </pre>
                <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-[#161b22] px-5 py-2.5">
                  {previewProcessId ? (
                    <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/20 px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/30">Stop</button>
                  ) : (
                    <button type="button" onClick={() => { setPreviewExited(false); setPreviewServerOutput(""); void handleRunApp(); }} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.14]">Re-run</button>
                  )}
                </div>
              </div>
            ) : showWebview ? (
              <webview
                key={`fs-${detectedPreviewUrl}`}
                src={detectedPreviewUrl}
                className="fullscreen-preview-webview"
                style={{ width: "100%", height: "100%", border: "none" }}
                ref={(el: HTMLElement | null) => {
                  if (!el) return;
                  const wv = el as HTMLElement & { addEventListener: HTMLElement["addEventListener"] };
                  const handler = (e: Event) => { e.preventDefault(); };
                  wv.addEventListener("new-window", handler);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#0d1117]">
                <div className="text-center">
                  <GlobeIcon className="mx-auto h-12 w-12 text-white/20" />
                  <p className="mt-4 text-[14px] font-medium text-white/60">
                    {isRunning ? previewServerStatus : previewExited ? previewServerStatus : "No preview running"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
