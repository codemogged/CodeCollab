"use client";

import { useEffect, useState } from "react";
import ProjectSidebar from "@/components/project-sidebar";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

const devicePresets = [
  { label: "Desktop", width: "100%" },
  { label: "Tablet", width: "820px" },
  { label: "Mobile", width: "390px" },
] as const;

type DevicePreset = (typeof devicePresets)[number]["label"];

type DashboardArtifact = {
  id: string;
  title: string;
  description: string;
  status: "done" | "building" | "planned";
  updatedAgo: string;
  changes: string[];
  code: string;
  preview: {
    mode: "interface" | "flow" | "runtime" | "data";
    artifactType: string;
    summary: string;
    primaryActionLabel: string;
    views: Array<{ id: string; label: string; description: string }>;
    codeFileName?: string;
  };
};

function slugifyTitle(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function getLocalAddress(artifact: DashboardArtifact | null) {
  if (!artifact) {
    return "http://localhost:3000";
  }

  if (artifact.preview.mode === "runtime") {
    return "http://localhost:4000";
  }

  return "http://localhost:3000";
}

export default function PreviewPage() {
  const { activeProject } = useActiveDesktopProject();
  const availableArtifacts = (activeProject?.dashboard.artifacts ?? []).filter(
    (artifact): artifact is DashboardArtifact => Boolean(artifact) && ["done", "building", "planned"].includes((artifact as DashboardArtifact).status),
  );
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [localPreviewEnabled, setLocalPreviewEnabled] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [device, setDevice] = useState<DevicePreset>("Desktop");
  const [hasDesktopApi, setHasDesktopApi] = useState(false);
  const [desktopRepoPath, setDesktopRepoPath] = useState<string | null>(null);
  const [runCommand, setRunCommand] = useState("npm run dev");
  const [runLogs, setRunLogs] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewProcessId, setPreviewProcessId] = useState<string | null>(null);
  const [pendingPreviewLaunch, setPendingPreviewLaunch] = useState(false);
  const [isHydratingDesktopState, setIsHydratingDesktopState] = useState(false);

  useEffect(() => {
    setSelectedArtifactId((current) => (availableArtifacts.some((artifact) => artifact.id === current) ? current : (availableArtifacts[0]?.id ?? null)));
  }, [availableArtifacts]);

  const selectedArtifact = availableArtifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null;
  const devicePreset = devicePresets.find((preset) => preset.label === device) ?? devicePresets[0];
  const localAddress = getLocalAddress(selectedArtifact);
  const canRunLocally = Boolean(selectedArtifact && extensionConnected && localPreviewEnabled);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const desktopApiAvailable = Boolean(window.electronAPI?.settings && window.electronAPI?.process && window.electronAPI?.system);
    setHasDesktopApi(desktopApiAvailable);

    if (!desktopApiAvailable) {
      return;
    }

    let cancelled = false;

    const hydrateDesktopState = async () => {
      try {
        setIsHydratingDesktopState(true);
        const settings = await window.electronAPI!.settings.get();
        if (cancelled) {
          return;
        }

        const repoPath = settings.projects.find((project) => project.id === settings.activeProjectId)?.repoPath
          ?? settings.recentRepositories[0]
          ?? settings.workspaceRoots[0]
          ?? null;
        setDesktopRepoPath(repoPath);
        setExtensionConnected(true);
        setLocalPreviewEnabled(Boolean(repoPath));
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to load desktop preview settings.";
        setPreviewError(message);
      } finally {
        if (!cancelled) {
          setIsHydratingDesktopState(false);
        }
      }
    };

    void hydrateDesktopState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasDesktopApi || !window.electronAPI?.process) {
      return;
    }

    const stopStarted = window.electronAPI.process.onStarted((event) => {
      if (pendingPreviewLaunch && event.command === runCommand) {
        setPreviewProcessId(event.processId);
        setPendingPreviewLaunch(false);
      }
    });

    const stopOutput = window.electronAPI.process.onOutput((event) => {
      if (event.processId === previewProcessId) {
        setRunLogs((current) => `${current}${event.chunk}`);
      }
    });

    const stopCompleted = window.electronAPI.process.onCompleted((event) => {
      if (event.processId === previewProcessId) {
        setIsRunning(false);
      }
    });

    const stopError = window.electronAPI.process.onError((event) => {
      if (event.processId === previewProcessId) {
        setIsRunning(false);
        setPreviewError(event.message ?? "Local preview command failed.");
      }
    });

    const stopCancelled = window.electronAPI.process.onCancelled((event) => {
      if (event.processId === previewProcessId) {
        setIsRunning(false);
      }
    });

    const stopTimeout = window.electronAPI.process.onTimeout((event) => {
      if (event.processId === previewProcessId) {
        setIsRunning(false);
        setPreviewError(`Local preview command timed out after ${event.timeoutMs ?? 0}ms.`);
      }
    });

    return () => {
      stopStarted();
      stopOutput();
      stopCompleted();
      stopError();
      stopCancelled();
      stopTimeout();
    };
  }, [hasDesktopApi, pendingPreviewLaunch, previewProcessId, runCommand]);

  const handleRunLocally = async () => {
    if (!window.electronAPI?.process) {
      setPreviewError("Open the Electron desktop app to run local preview commands.");
      return;
    }

    if (!desktopRepoPath) {
      setPreviewError("Connect a local repository from the Files page first.");
      return;
    }

    setPreviewError(null);
    setRunLogs("");
    setPendingPreviewLaunch(true);
    setPreviewProcessId(null);
    setIsRunning(true);

    try {
      const result = await window.electronAPI.process.run({
        command: runCommand,
        cwd: desktopRepoPath,
      });
      setPreviewProcessId(result.processId);
      setRunLogs((current) => current || result.stdout || result.stderr);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start local preview.";
      setPreviewError(message);
      setIsRunning(false);
      setPendingPreviewLaunch(false);
    }
  };

  const handleStopPreview = async () => {
    if (!window.electronAPI?.process || !previewProcessId) {
      return;
    }

    await window.electronAPI.process.cancel(previewProcessId);
    setIsRunning(false);
  };

  return (
    <div className="flex min-h-full bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="min-w-0 flex-1">
        <div className="app-surface sticky top-0 z-30 flex items-center justify-between border-x-0 border-t-0 px-5 py-3 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">Run on your computer</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="display-font text-[18px] font-semibold tracking-tight theme-fg">{activeProject?.name ?? "Project preview"}</h1>
              <span className="text-[11px] theme-muted">Use the desktop runtime to launch real local preview commands.</span>
            </div>
          </div>

          {selectedArtifact && isRunning && selectedArtifact.preview.mode === "interface" && !showCode ? (
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
        </div>

        <main className="min-h-[calc(100vh-57px)] overflow-auto bg-[#ede8de] p-6 dark:bg-[#121417]">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
            <section className="app-surface rounded-[1.7rem] p-6 sm:p-8">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Step 1</p>
                  <h2 className="display-font mt-3 text-[2.2rem] font-semibold tracking-tight theme-fg">Pick what to run</h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {availableArtifacts.map((artifact) => {
                      const active = artifact.id === selectedArtifactId;
                      return (
                        <button
                          key={artifact.id}
                          type="button"
                          onClick={() => {
                            setSelectedArtifactId(artifact.id);
                            setIsRunning(false);
                            setShowCode(false);
                            setPreviewError(null);
                            setRunLogs("");
                          }}
                          className={`rounded-[1.3rem] border px-4 py-4 text-left transition ${active ? "border-[#17181b] bg-[#17181b] text-[#f7f0e4] shadow-[0_18px_44px_rgba(0,0,0,0.12)] dark:border-[#f5efe4] dark:bg-[#f5efe4] dark:text-[#17181b]" : "border-black/[0.08] bg-[#fbf8f1] hover:border-black/[0.14] hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"}`}
                        >
                          <p className="text-[15px] font-semibold">{artifact.title}</p>
                          <p className={`mt-2 text-[12px] leading-relaxed ${active ? "text-[#f7f0e4]/74 dark:text-[#17181b]/70" : "theme-muted"}`}>
                            {artifact.preview.summary || artifact.description}
                          </p>
                          <p className={`mt-3 text-[10px] uppercase tracking-[0.14em] ${active ? "text-[#f7f0e4]/52 dark:text-[#17181b]/52" : "theme-muted"}`}>
                            {artifact.status}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="app-surface-soft rounded-[1.4rem] p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Step 2</p>
                  <h3 className="mt-3 text-[1.5rem] font-semibold tracking-tight theme-fg">Desktop preview runtime</h3>
                  <div className="mt-4 space-y-3">
                    <ConnectionRow label="Pick an artifact" connected={Boolean(selectedArtifact)} />
                    <ConnectionRow label="Desktop runtime detected" connected={extensionConnected} />
                    <ConnectionRow label="Local repository connected" connected={localPreviewEnabled} />
                  </div>
                  <div className="mt-5 space-y-3">
                    <div>
                      <label className="mb-1.5 block text-[12px] font-medium theme-muted">Run command</label>
                      <input
                        type="text"
                        value={runCommand}
                        onChange={(event) => setRunCommand(event.target.value)}
                        className="app-input w-full rounded-[1.1rem] px-4 py-3 text-[13px] outline-none transition focus:border-black/[0.16] focus:ring-1 focus:ring-black/[0.08] dark:focus:border-white/[0.18] dark:focus:ring-white/[0.08]"
                      />
                    </div>
                    <div className="rounded-[1.1rem] border border-black/[0.06] bg-black/[0.02] px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] theme-muted">Working directory</p>
                      <p className="mt-2 break-all text-[12px] theme-fg">{desktopRepoPath ?? "Connect a repo in the Files screen first."}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canRunLocally || isHydratingDesktopState}
                    onClick={() => void handleRunLocally()}
                    className={`mt-5 w-full rounded-[1.2rem] px-5 py-4 text-[15px] font-semibold transition ${canRunLocally ? "bg-ink text-cream shadow-[0_18px_44px_rgba(0,0,0,0.12)] dark:bg-white dark:text-[#17181b]" : "cursor-not-allowed bg-black/[0.08] text-black/40 dark:bg-white/[0.08] dark:text-white/30"}`}
                  >
                    {isRunning ? "Restart preview" : "Run locally"}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleStopPreview()}
                      disabled={!isRunning || !previewProcessId}
                      className="rounded-full border border-black/[0.08] px-4 py-2 text-[12px] font-semibold theme-fg transition hover:border-black/[0.14] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.1]"
                    >
                      Stop process
                    </button>
                    <button
                      type="button"
                      onClick={() => window.electronAPI?.system?.openExternal(localAddress)}
                      disabled={!hasDesktopApi || !isRunning}
                      className="rounded-full border border-black/[0.08] px-4 py-2 text-[12px] font-semibold theme-fg transition hover:border-black/[0.14] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.1]"
                    >
                      Open preview URL
                    </button>
                  </div>
                  {previewError ? (
                    <p className="mt-4 rounded-[1rem] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                      {previewError}
                    </p>
                  ) : null}
                  <p className="mt-4 text-[12px] theme-muted">This view now stays empty until the active project has real preview artifacts.</p>
                </div>
              </div>
            </section>

            {selectedArtifact && isRunning ? (
              <>
                <section className="app-surface rounded-[1.7rem] p-6 sm:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Step 3</p>
                      <h3 className="mt-2 text-[1.8rem] font-semibold tracking-tight theme-fg">Your local preview is live</h3>
                      <p className="mt-2 text-[14px] theme-muted">{localAddress}</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setShowCode((value) => !value)}
                        className="app-surface-soft rounded-full px-4 py-2 text-[12px] font-semibold theme-fg"
                      >
                        {showCode ? "Show project" : "Show code"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRunLocally()}
                        className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-cream dark:bg-white dark:text-[#17181b]"
                      >
                        Restart
                      </button>
                    </div>
                  </div>
                </section>

                {!showCode ? (
                  <SimpleRunSurface artifact={selectedArtifact} deviceWidth={devicePreset.width} />
                ) : (
                  <CodeSurface artifact={selectedArtifact} />
                )}

                <section className="grid gap-5 lg:grid-cols-3">
                  <SimpleStatusCard title="Desktop runtime" value={extensionConnected ? "Connected" : "Missing"} subtitle={extensionConnected ? "Electron backend is ready." : "Open the desktop app."} />
                  <SimpleStatusCard title="Repository" value={localPreviewEnabled ? "Connected" : "Missing"} subtitle={desktopRepoPath ?? "Connect a repo from the Files screen."} />
                  <SimpleStatusCard title="Preview" value={isRunning ? "Running" : "Stopped"} subtitle={localAddress} />
                </section>

                <section className="overflow-hidden rounded-[1.35rem] bg-[#0f1216] shadow-[0_12px_48px_rgba(0,0,0,0.12)] ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Process output</p>
                      <p className="mt-1 text-[12px] text-white/52">{runCommand}</p>
                    </div>
                    <span className="rounded-full bg-white/6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/72">
                      {isRunning ? "Running" : "Idle"}
                    </span>
                  </div>
                  <pre className="custom-scroll max-h-[320px] overflow-auto p-5 text-[12px] leading-relaxed text-white/82">
                    {runLogs || (isRunning ? "Waiting for process output..." : "Run a local command to stream logs here.")}
                  </pre>
                </section>
              </>
            ) : (
              <section className="app-surface rounded-[1.7rem] p-12 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Ready</p>
                <h3 className="display-font mt-4 text-[2rem] font-semibold tracking-tight theme-fg">
                  {availableArtifacts.length > 0
                    ? "Choose an artifact, connect the desktop runtime, then run it."
                    : "No real preview artifacts yet. Generate a project plan first, then add runnable outputs."}
                </h3>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ConnectionRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-[1rem] border border-black/[0.06] bg-black/[0.02] px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
      <p className="text-[12px] font-medium theme-fg">{label}</p>
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${connected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200" : "bg-amber-100 text-amber-700 dark:bg-amber-500/12 dark:text-amber-200"}`}>
        {connected ? "Ready" : "Missing"}
      </span>
    </div>
  );
}

function SimpleStatusCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <section className="app-surface rounded-[1.4rem] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">{title}</p>
      <p className="mt-3 text-[1.4rem] font-semibold tracking-tight theme-fg">{value}</p>
      <p className="mt-2 text-[13px] theme-muted">{subtitle}</p>
    </section>
  );
}

function CodeSurface({ artifact }: { artifact: DashboardArtifact }) {
  return (
    <div className="overflow-hidden rounded-[1.35rem] bg-[#1e1e1e] shadow-[0_12px_48px_rgba(0,0,0,0.12)] ring-1 ring-white/10">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[12px] text-white/40">{artifact.preview.codeFileName ?? `${slugifyTitle(artifact.title)}.tsx`}</span>
      </div>
      <pre className="custom-scroll max-h-[760px] overflow-auto p-5 text-[13px] leading-relaxed text-white/80">
        <code>{artifact.code || "No generated code saved for this artifact yet."}</code>
      </pre>
    </div>
  );
}

function SimpleRunSurface({ artifact, deviceWidth }: { artifact: DashboardArtifact; deviceWidth: string }) {
  return (
    <section className="mx-auto flex w-full flex-col items-center">
      <div
        className="w-full overflow-hidden rounded-[1.4rem] bg-[#fffdf9] shadow-[0_16px_40px_rgba(0,0,0,0.10)] ring-1 ring-black/[0.08] dark:ring-white/[0.08]"
        style={{ width: deviceWidth, maxWidth: "100%" }}
      >
        <div className="flex items-center gap-2 border-b border-black/[0.06] bg-[#f7f1e8] px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-black/[0.08]" />
            <span className="h-2.5 w-2.5 rounded-full bg-black/[0.08]" />
            <span className="h-2.5 w-2.5 rounded-full bg-black/[0.08]" />
          </div>
          <div className="ml-4 flex-1 rounded-full bg-black/[0.04] px-3 py-1">
            <p className="text-[10px] text-[#8d7f6e]">Live project</p>
          </div>
        </div>

        <div className="bg-[#fffdf8] p-6">
          <div className="rounded-[1.35rem] bg-gradient-to-br from-neutral-950 to-neutral-800 p-6 text-white">
            <p className="text-[11px] font-medium text-white/64">Running now</p>
            <h3 className="display-font mt-2 text-[2rem] font-semibold tracking-tight">{artifact.title}</h3>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-white/78">{artifact.preview.summary || artifact.description}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {(artifact.preview.views.length > 0 ? artifact.preview.views.map((view) => view.label) : artifact.changes).slice(0, 6).map((item) => (
              <div key={item} className="rounded-[1.1rem] border border-black/[0.06] bg-[#f7f1e6] p-4 dark:border-white/[0.08] dark:bg-[#1d1f23]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9b8c79] dark:text-white/42">Try this</p>
                <p className="mt-2 text-[14px] font-semibold text-[#1a1815] dark:text-[var(--fg)]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
