"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProjectSidebar from "@/components/project-sidebar";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

type Tab = "code" | "updates" | "ide";

type LiveDirectoryEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
};

type LiveCommitSummary = {
  hash: string;
  message: string;
};

type LiveCommitDetails = {
  hash: string;
  author: string;
  date: string;
  subject: string;
  body: string;
  files: Array<{
    status: string;
    path: string;
  }>;
  diff: string;
};

type LiveChangedFile = {
  indexStatus: string;
  workTreeStatus: string;
  path: string;
};

function isStagedFile(file: LiveChangedFile) {
  return file.indexStatus !== " " && file.indexStatus !== "?";
}

function normalizeRepoErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to inspect that repository.";

  if (message.includes("not inside a Git repository") || message.includes("not a Git repository")) {
    return "That folder is not inside a Git repository yet. Pick the project repo itself, any folder inside it, or initialize Git first.";
  }

  return message;
}

function getEditorLanguageLabel(filePath: string | null) {
  if (!filePath) {
    return "Text";
  }

  const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? "";

  if (fileName === "package.json") return "JSON";
  if (fileName === "readme.md") return "Markdown";
  if (fileName.endsWith(".tsx")) return "TypeScript React";
  if (fileName.endsWith(".ts")) return "TypeScript";
  if (fileName.endsWith(".jsx")) return "JavaScript React";
  if (fileName.endsWith(".js")) return "JavaScript";
  if (fileName.endsWith(".json")) return "JSON";
  if (fileName.endsWith(".md")) return "Markdown";
  if (fileName.endsWith(".css")) return "CSS";
  if (fileName.endsWith(".html")) return "HTML";
  if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) return "YAML";
  if (fileName.endsWith(".env")) return "Environment";

  return "Text";
}

function getRelativeRepoPath(repoPath: string | null, targetPath: string | null) {
  if (!repoPath || !targetPath) {
    return null;
  }

  const normalizedRepoPath = repoPath.replace(/\\/g, "/");
  const normalizedTargetPath = targetPath.replace(/\\/g, "/");

  if (!normalizedTargetPath.startsWith(normalizedRepoPath)) {
    return targetPath;
  }

  return normalizedTargetPath.slice(normalizedRepoPath.length + 1) || targetPath.split(/[/\\]/).pop() || targetPath;
}

function FileIcon({ type }: { type: "file" | "folder" }) {
  if (type === "folder") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-sky-500">
        <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
      </svg>
    );
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-ink-muted/50">
      <path d="M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0116 6.622V16.5a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 013 16.5v-13z" />
    </svg>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[14px] font-semibold theme-fg">{title}</p>
      <p className="mt-2 text-[12px] leading-6 theme-muted">{body}</p>
    </div>
  );
}

export default function FilesPage() {
  const { activeProject, canUseDesktopProject } = useActiveDesktopProject();
  const lastAutoConnectedRepoPath = useRef<string | null>(null);

  const [tab, setTab] = useState<Tab>("code");
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [connectedRepo, setConnectedRepo] = useState<{
    repoPath: string;
    branch: string;
    branches: string[];
    changedFiles: LiveChangedFile[];
    recentCommits: LiveCommitSummary[];
  } | null>(null);
  const [liveDirectoryEntries, setLiveDirectoryEntries] = useState<LiveDirectoryEntry[]>([]);
  const [currentDirectoryPath, setCurrentDirectoryPath] = useState<string | null>(null);
  const [selectedLiveFilePath, setSelectedLiveFilePath] = useState<string | null>(null);
  const [selectedLiveFileContent, setSelectedLiveFileContent] = useState("");
  const [liveFileDraft, setLiveFileDraft] = useState("");
  const [openEditorTabs, setOpenEditorTabs] = useState<{ path: string; label: string }[]>([]);
  const [isLoadingLiveFile, setIsLoadingLiveFile] = useState(false);
  const [isSavingLiveFile, setIsSavingLiveFile] = useState(false);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [selectedDiffText, setSelectedDiffText] = useState("");
  const [selectedDiffStaged, setSelectedDiffStaged] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [isMutatingRepo, setIsMutatingRepo] = useState(false);
  const [branchDraft, setBranchDraft] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [selectedCommitDetails, setSelectedCommitDetails] = useState<LiveCommitDetails | null>(null);
  const [isLoadingCommitDetails, setIsLoadingCommitDetails] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [isConnectingRepo, setIsConnectingRepo] = useState(false);
  const [isConnectingGithubRepo, setIsConnectingGithubRepo] = useState(false);
  const [canUseDesktopRepo, setCanUseDesktopRepo] = useState(false);
  const [saveStateMessage, setSaveStateMessage] = useState<string | null>(null);

  const connectedRepoName = useMemo(() => {
    if (!connectedRepo) {
      return null;
    }

    const segments = connectedRepo.repoPath.split(/[/\\]/).filter(Boolean);
    return segments[segments.length - 1] ?? connectedRepo.repoPath;
  }, [connectedRepo]);

  const currentEditorLabel = useMemo(() => {
    if (selectedCommitDetails) {
      return `${selectedCommitDetails.hash.slice(0, 7)}.diff`;
    }

    if (selectedLiveFilePath) {
      return selectedLiveFilePath.split(/[/\\]/).pop() ?? selectedLiveFilePath;
    }

    if (selectedDiffPath) {
      const name = selectedDiffPath.split(/[/\\]/).pop() ?? selectedDiffPath;
      return `${name}.diff`;
    }

    return connectedRepoName ?? "No file selected";
  }, [connectedRepoName, selectedCommitDetails, selectedDiffPath, selectedLiveFilePath]);

  const editorLanguage = useMemo(() => getEditorLanguageLabel(selectedLiveFilePath), [selectedLiveFilePath]);

  const stagedFileCount = useMemo(
    () => connectedRepo?.changedFiles.filter((file) => isStagedFile(file)).length ?? 0,
    [connectedRepo],
  );

  const unstagedFileCount = useMemo(
    () => connectedRepo?.changedFiles.filter((file) => !isStagedFile(file)).length ?? 0,
    [connectedRepo],
  );

  const liveFileLineCount = useMemo(() => Math.max(1, liveFileDraft.split("\n").length), [liveFileDraft]);

  const hasUnsavedFileChanges = Boolean(selectedLiveFilePath) && liveFileDraft !== selectedLiveFileContent;

  const selectedFileDisplayPath = useMemo(
    () => getRelativeRepoPath(connectedRepo?.repoPath ?? null, selectedLiveFilePath),
    [connectedRepo?.repoPath, selectedLiveFilePath],
  );



  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setCanUseDesktopRepo(Boolean(window.electronAPI?.repo && window.electronAPI?.system && canUseDesktopProject));
  }, [canUseDesktopProject]);

  useEffect(() => {
    if (!saveStateMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setSaveStateMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [saveStateMessage]);

  const connectToRepoPath = async (repoPath: string) => {
    if (!window.electronAPI?.repo) {
      return null;
    }

    const inspection = await window.electronAPI.repo.inspect(repoPath);
    const directoryEntries = await window.electronAPI.repo.listDirectory(inspection.repoPath);

    setConnectedRepo(inspection);
    setLiveDirectoryEntries(directoryEntries);
    setCurrentDirectoryPath(inspection.repoPath);
    setSelectedLiveFilePath(null);
    setSelectedLiveFileContent("");
    setLiveFileDraft("");
    setSelectedDiffPath(null);
    setSelectedDiffText("");
    setSelectedDiffStaged(false);
    setSelectedCommitDetails(null);
    setBranchDraft(inspection.branch);
    setCommitMessage("");
    setSaveStateMessage(null);

    return inspection;
  };

  const connectedRepoRef = useRef(connectedRepo);
  connectedRepoRef.current = connectedRepo;

  useEffect(() => {
    let cancelled = false;

    async function hydrateActiveRepo() {
      if (!window.electronAPI?.repo) {
        return;
      }

      try {
        if (activeProject?.repoPath && lastAutoConnectedRepoPath.current !== activeProject.repoPath) {
          const inspection = await connectToRepoPath(activeProject.repoPath);
          if (!cancelled && inspection) {
            lastAutoConnectedRepoPath.current = activeProject.repoPath;
            setRepoError(null);
          }
          return;
        }

        if (connectedRepoRef.current || !window.electronAPI?.settings) {
          return;
        }

        const settings = await window.electronAPI.settings.get();
        const fallbackRepoPath = settings.recentRepositories[0] ?? settings.workspaceRoots[0] ?? null;
        if (!fallbackRepoPath) {
          return;
        }

        if (fallbackRepoPath === lastAutoConnectedRepoPath.current) {
          return;
        }

        const inspection = await connectToRepoPath(fallbackRepoPath);
        if (!cancelled && inspection) {
          lastAutoConnectedRepoPath.current = fallbackRepoPath;
          setRepoError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRepoError(normalizeRepoErrorMessage(error));
        }
      }
    }

    void hydrateActiveRepo();

    return () => {
      cancelled = true;
    };
  }, [activeProject?.repoPath]);

  const handleConnectRepo = async () => {
    if (!window.electronAPI?.system || !window.electronAPI?.repo) {
      setRepoError("Local repository access is only available in the desktop app.");
      return;
    }

    try {
      setIsConnectingRepo(true);
      setRepoError(null);

      const repoPath = await window.electronAPI.system.openDirectory();
      if (!repoPath) {
        return;
      }

      const inspection = await connectToRepoPath(repoPath);
      if (!inspection) {
        return;
      }

      const currentSettings = await window.electronAPI.settings?.get();
      await window.electronAPI.settings?.update({
        recentRepositories: Array.from(new Set([inspection.repoPath, ...(currentSettings?.recentRepositories ?? [])])).slice(0, 8),
        workspaceRoots: Array.from(new Set([inspection.repoPath, ...(currentSettings?.workspaceRoots ?? [])])).slice(0, 8),
      });
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsConnectingRepo(false);
    }
  };

  const handleReconnectProjectRepo = async () => {
    if (!activeProject?.repoPath) {
      return;
    }

    try {
      setRepoError(null);
      const inspection = await connectToRepoPath(activeProject.repoPath);
      if (inspection) {
        lastAutoConnectedRepoPath.current = inspection.repoPath;
      }
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    }
  };

  const handleEnsureGithubRepo = async () => {
    if (!activeProject?.id || !window.electronAPI?.project?.ensureGithubRepo) {
      return;
    }

    try {
      setIsConnectingGithubRepo(true);
      setRepoError(null);
      const project = await window.electronAPI.project.ensureGithubRepo(activeProject.id);

      if (project.githubRepoUrl) {
        await window.electronAPI.system?.openExternal(project.githubRepoUrl);
      }
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsConnectingGithubRepo(false);
    }
  };

  const handleOpenDirectory = async (targetPath: string) => {
    if (!window.electronAPI?.repo) {
      return;
    }

    const entries = await window.electronAPI.repo.listDirectory(targetPath);
    setCurrentDirectoryPath(targetPath);
    setLiveDirectoryEntries(entries);
  };

  const handleOpenParentDirectory = async () => {
    if (!connectedRepo || !currentDirectoryPath || currentDirectoryPath === connectedRepo.repoPath) {
      return;
    }

    const nextPath = currentDirectoryPath.split(/[/\\]/).slice(0, -1).join("\\");
    await handleOpenDirectory(nextPath || connectedRepo.repoPath);
  };

  const handleOpenLiveFile = async (targetPath: string) => {
    if (!window.electronAPI?.repo) {
      return;
    }

    try {
      setIsLoadingLiveFile(true);
      setRepoError(null);
      const file = await window.electronAPI.repo.readFileContent(targetPath);
      setSelectedLiveFilePath(file.path);
      setSelectedLiveFileContent(file.content);
      setLiveFileDraft(file.content);
      setSelectedDiffPath(null);
      setSelectedDiffText("");
      setSelectedCommitDetails(null);
      setSaveStateMessage(null);
      setTab("ide");
      const label = file.path.split(/[/\\]/).pop() ?? file.path;
      setOpenEditorTabs((tabs) => tabs.some((t) => t.path === file.path) ? tabs : [...tabs, { path: file.path, label }]);
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsLoadingLiveFile(false);
    }
  };

  const handleCloseEditorTab = (closePath: string) => {
    setOpenEditorTabs((tabs) => {
      const next = tabs.filter((t) => t.path !== closePath);
      if (selectedLiveFilePath === closePath) {
        if (next.length > 0) {
          void handleOpenLiveFile(next[next.length - 1].path);
        } else {
          setSelectedLiveFilePath(null);
          setSelectedLiveFileContent("");
          setLiveFileDraft("");
        }
      }
      return next;
    });
  };

  const handleLoadDiff = async (targetPath: string, staged: boolean) => {
    if (!window.electronAPI?.repo || !connectedRepo) {
      return;
    }

    try {
      setIsLoadingDiff(true);
      setRepoError(null);
      const nextDiff = await window.electronAPI.repo.getFileDiff({
        repoPath: connectedRepo.repoPath,
        targetPath,
        staged,
      });
      setSelectedDiffPath(nextDiff.path);
      setSelectedDiffText(nextDiff.diff);
      setSelectedDiffStaged(nextDiff.staged);
      setSelectedLiveFilePath(null);
      setSelectedLiveFileContent("");
      setLiveFileDraft("");
      setSelectedCommitDetails(null);
      setSaveStateMessage(null);
      setTab("ide");
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const handleStageToggle = async (file: LiveChangedFile) => {
    if (!window.electronAPI?.repo || !connectedRepo) {
      return;
    }

    try {
      setIsMutatingRepo(true);
      setRepoError(null);

      const inspection = isStagedFile(file)
        ? await window.electronAPI.repo.unstageFiles({ repoPath: connectedRepo.repoPath, filePaths: [file.path] })
        : await window.electronAPI.repo.stageFiles({ repoPath: connectedRepo.repoPath, filePaths: [file.path] });

      setConnectedRepo(inspection);
      if (selectedDiffPath === file.path) {
        await handleLoadDiff(file.path, !isStagedFile(file));
      }
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsMutatingRepo(false);
    }
  };

  const handleStageAll = async (staged: boolean) => {
    if (!window.electronAPI?.repo || !connectedRepo) {
      return;
    }

    const matchingFiles = connectedRepo.changedFiles
      .filter((file) => (staged ? isStagedFile(file) : !isStagedFile(file)))
      .map((file) => file.path);

    if (matchingFiles.length === 0) {
      return;
    }

    try {
      setIsMutatingRepo(true);
      setRepoError(null);
      const inspection = staged
        ? await window.electronAPI.repo.unstageFiles({ repoPath: connectedRepo.repoPath, filePaths: matchingFiles })
        : await window.electronAPI.repo.stageFiles({ repoPath: connectedRepo.repoPath, filePaths: matchingFiles });
      setConnectedRepo(inspection);
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsMutatingRepo(false);
    }
  };

  const handleCommit = async () => {
    if (!window.electronAPI?.repo || !connectedRepo || !commitMessage.trim()) {
      return;
    }

    try {
      setIsMutatingRepo(true);
      setRepoError(null);
      const inspection = await window.electronAPI.repo.commit({
        repoPath: connectedRepo.repoPath,
        message: commitMessage,
      });
      setConnectedRepo(inspection);
      setCommitMessage("");
      setSelectedDiffPath(null);
      setSelectedDiffText("");
      setSelectedCommitDetails(null);
      await handleOpenDirectory(currentDirectoryPath ?? inspection.repoPath);
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsMutatingRepo(false);
    }
  };

  const handleCheckoutBranch = async (branchName: string, create: boolean) => {
    if (!window.electronAPI?.repo || !connectedRepo || !branchName.trim()) {
      return;
    }

    try {
      setIsMutatingRepo(true);
      setRepoError(null);
      const inspection = await window.electronAPI.repo.checkoutBranch({
        repoPath: connectedRepo.repoPath,
        branchName,
        create,
      });
      setConnectedRepo(inspection);
      setBranchDraft(inspection.branch);
      setSelectedDiffPath(null);
      setSelectedDiffText("");
      setSelectedCommitDetails(null);
      await handleOpenDirectory(currentDirectoryPath ?? inspection.repoPath);
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsMutatingRepo(false);
    }
  };

  const handleOpenCommitDetails = async (commitHash: string) => {
    if (!window.electronAPI?.repo || !connectedRepo) {
      return;
    }

    try {
      setIsLoadingCommitDetails(true);
      setRepoError(null);
      const details = await window.electronAPI.repo.getCommitDetails({
        repoPath: connectedRepo.repoPath,
        commitHash,
      });
      setActiveVersion(details.hash);
      setSelectedCommitDetails(details);
      setSelectedLiveFilePath(null);
      setSelectedLiveFileContent("");
      setLiveFileDraft("");
      setSelectedDiffPath(null);
      setSaveStateMessage(null);
      setTab("ide");
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsLoadingCommitDetails(false);
    }
  };

  const handleSaveLiveFile = async () => {
    if (!window.electronAPI?.repo || !connectedRepo || !selectedLiveFilePath || !hasUnsavedFileChanges) {
      return;
    }

    try {
      setIsSavingLiveFile(true);
      setRepoError(null);
      const file = await window.electronAPI.repo.writeFileContent({
        targetPath: selectedLiveFilePath,
        content: liveFileDraft,
      });
      setSelectedLiveFileContent(file.content);
      setLiveFileDraft(file.content);
      const inspection = await window.electronAPI.repo.inspect(connectedRepo.repoPath);
      setConnectedRepo(inspection);
      setSaveStateMessage("Saved just now");
    } catch (error) {
      setRepoError(normalizeRepoErrorMessage(error));
    } finally {
      setIsSavingLiveFile(false);
    }
  };

  useEffect(() => {
    if (!selectedLiveFilePath || selectedDiffPath || selectedCommitDetails) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSaveLiveFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSaveLiveFile, selectedCommitDetails, selectedDiffPath, selectedLiveFilePath]);

  return (
    <div className="flex min-h-full bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="min-w-0 flex-1 px-5 pb-32 pt-[5.6rem] sm:px-6 xl:px-8">
        <section className="relative mb-4 overflow-hidden rounded-[28px] border border-black/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(244,199,142,0.26),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(116,173,255,0.22),transparent_26%),linear-gradient(135deg,rgba(255,250,241,0.96),rgba(247,242,233,0.94))] p-5 shadow-[0_30px_80px_-48px_rgba(28,32,38,0.58)] dark:border-white/[0.08] dark:bg-[radial-gradient(circle_at_top_left,rgba(244,199,142,0.14),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(116,173,255,0.12),transparent_26%),linear-gradient(135deg,rgba(24,25,29,0.98),rgba(17,18,21,0.98))] sm:p-6">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="display-font text-[28px] font-bold tracking-[-0.03em] theme-fg sm:text-[32px]">
                {connectedRepoName ?? "Project files"}
              </h1>
              <p className="mt-2 text-[13px] leading-6 theme-muted">
                {connectedRepo
                  ? connectedRepo.repoPath
                  : canUseDesktopRepo
                    ? "Open or create a project to load its files."
                    : "Live file access requires the desktop app."}
              </p>
              {connectedRepo ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] theme-muted">
                  <span className="rounded-full border border-black/[0.08] bg-black/[0.04] px-2.5 py-0.5 text-[11px] font-semibold dark:border-white/[0.08] dark:bg-white/[0.06]">{connectedRepo.branch}</span>
                  <span>{connectedRepo.changedFiles.length} changed</span>
                  <span>{stagedFileCount} kept</span>
                  <span>{connectedRepo.recentCommits.length} commits</span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeProject ? (
                <button
                  type="button"
                  onClick={() => activeProject.githubRepoUrl
                    ? void window.electronAPI?.system?.openExternal(activeProject.githubRepoUrl)
                    : void handleEnsureGithubRepo()}
                  disabled={isConnectingGithubRepo}
                  className="rounded-2xl border border-black/[0.08] bg-white/76 px-4 py-2.5 text-[12px] font-semibold theme-fg shadow-sm transition hover:border-black/[0.14] hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.05]"
                >
                  {isConnectingGithubRepo ? "Connecting..." : activeProject.githubRepoUrl ? "Open on GitHub" : "Push to GitHub"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleConnectRepo}
                disabled={isConnectingRepo}
                className="rounded-2xl border border-black/[0.08] bg-[#111318] px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-wait disabled:opacity-70 dark:border-white/[0.08]"
              >
                {isConnectingRepo ? "Connecting..." : connectedRepo ? "Switch folder" : "Open folder"}
              </button>
            </div>
          </div>

          {repoError ? (
            <p className="relative mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-6 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {repoError}
            </p>
          ) : null}
        </section>

        {connectedRepo ? (
          <div className="mb-4 app-surface rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {connectedRepo.branches.map((branch) => (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => {
                        setBranchDraft(branch);
                        void handleCheckoutBranch(branch, false);
                      }}
                      disabled={isMutatingRepo || branch === connectedRepo.branch}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${branch === connectedRepo.branch ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "bg-black/[0.04] theme-muted hover:text-[var(--fg)] disabled:opacity-50 dark:bg-white/[0.06]"}`}
                    >
                      {branch}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={branchDraft}
                    onChange={(event) => setBranchDraft(event.target.value)}
                    placeholder="New branch name"
                    className="app-input w-40 rounded-lg px-2.5 py-1.5 text-[11px] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCheckoutBranch(branchDraft, true)}
                    disabled={isMutatingRepo || !branchDraft.trim()}
                    className="rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold text-cream transition hover:bg-ink/90 disabled:opacity-50 dark:bg-white dark:text-[#17181b]"
                  >
                    Create branch
                  </button>
                  <span className="relative group">
                    <span className="flex h-5 w-5 cursor-help items-center justify-center rounded-full text-[11px] text-black/30 transition hover:bg-black/[0.06] hover:text-black/60 dark:text-white/30 dark:hover:bg-white/[0.08] dark:hover:text-white/60">?</span>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-48 -translate-x-1/2 rounded-lg bg-[#1e1f25] px-3 py-2 text-[11px] leading-4 text-white/80 opacity-0 shadow-lg transition group-hover:opacity-100">A branch is a separate copy of your project so you can try changes without affecting the main version.</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder="Describe what changed"
                  className="app-input w-48 rounded-lg px-2.5 py-1.5 text-[11px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={isMutatingRepo || !commitMessage.trim() || stagedFileCount === 0}
                  className="rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold text-cream transition hover:bg-ink/90 disabled:opacity-50 dark:bg-white dark:text-[#17181b]"
                >
                  Save to GitHub
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="app-control-rail mb-4 flex items-center gap-1 rounded-xl p-1">
          {(["code", "updates", "ide"] as const).map((nextTab) => (
            <button
              key={nextTab}
              type="button"
              onClick={() => setTab(nextTab)}
              className={`rounded-lg px-4 py-2 text-[13px] font-medium capitalize transition ${tab === nextTab ? "app-control-active" : "app-control-idle"}`}
            >
              <span className="flex items-center gap-2">
                <span>{nextTab}</span>
                {nextTab === "updates" ? (
                  <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] theme-muted dark:bg-white/[0.08]">{connectedRepo?.recentCommits.length ?? 0}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>

        <div className="app-surface overflow-hidden rounded-2xl">
          {tab === "code" ? (
            <>
              {activeVersion ? (
                <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-50/80 px-4 py-2.5">
                  <div className="text-[12px] text-emerald-700">Viewing an older version</div>
                  <button
                    type="button"
                    onClick={() => setActiveVersion(null)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Latest version
                  </button>
                </div>
              ) : null}

              <div className="flex items-center gap-2 border-b border-black/[0.06] bg-black/[0.02] px-4 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <span className="rounded bg-black/[0.04] px-2 py-0.5 font-mono text-[12px] font-medium theme-fg dark:bg-white/[0.08]">
                  {connectedRepo?.branch ?? "idle"}
                </span>
                <span className="text-[12px] theme-muted">·</span>
                <span className="text-[12px] theme-muted">{connectedRepo?.recentCommits.length ?? 0} commits</span>
                {connectedRepo ? (
                  <>
                    <span className="text-[12px] theme-muted">·</span>
                    <span className="text-[12px] theme-muted">{connectedRepo.changedFiles.length} changed</span>
                  </>
                ) : null}
              </div>

              {connectedRepo?.changedFiles.length ? (
                <div className="border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Changed files</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleStageAll(false)}
                        disabled={isMutatingRepo || !connectedRepo.changedFiles.some((file) => !isStagedFile(file))}
                        className="rounded-full border border-black/[0.08] px-3 py-1 text-[10px] font-semibold theme-fg transition hover:border-black/[0.14] disabled:opacity-50 dark:border-white/[0.1]"
                      >
                        Keep all
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStageAll(true)}
                        disabled={isMutatingRepo || !connectedRepo.changedFiles.some((file) => isStagedFile(file))}
                        className="rounded-full border border-black/[0.08] px-3 py-1 text-[10px] font-semibold theme-fg transition hover:border-black/[0.14] disabled:opacity-50 dark:border-white/[0.1]"
                      >
                        Undo all
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {connectedRepo.changedFiles.map((file) => (
                      <div key={`${file.indexStatus}${file.workTreeStatus}:${file.path}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.04] px-3 py-2 text-[11px] font-medium theme-fg dark:bg-white/[0.06]">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isStagedFile(file) ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"}`}>
                          {isStagedFile(file) ? "Kept" : "Changed"}
                        </span>
                        <span className="min-w-0 flex-1 break-all">{file.path}</span>
                        <button
                          type="button"
                          onClick={() => void handleLoadDiff(file.path, isStagedFile(file))}
                          className="rounded-full px-2.5 py-1 text-[10px] font-semibold theme-muted transition hover:bg-black/[0.05] hover:text-[var(--fg)] dark:hover:bg-white/[0.08]"
                        >
                          View changes
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStageToggle(file)}
                          disabled={isMutatingRepo}
                          className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold text-cream transition hover:bg-ink/90 disabled:opacity-50 dark:bg-white dark:text-[#17181b]"
                        >
                          {isStagedFile(file) ? "Undo" : "Keep"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {connectedRepo ? (
                <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Directory</p>
                    <p className="mt-1 text-[12px] theme-fg">{currentDirectoryPath ?? connectedRepo.repoPath}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleOpenParentDirectory()}
                    disabled={!currentDirectoryPath || currentDirectoryPath === connectedRepo.repoPath}
                    className="rounded-full border border-black/[0.08] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:border-black/[0.14] disabled:opacity-50 dark:border-white/[0.1]"
                  >
                    Up one level
                  </button>
                </div>
              ) : null}

              {connectedRepo ? (
                liveDirectoryEntries.length > 0 ? (
                  liveDirectoryEntries.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => entry.type === "directory" ? void handleOpenDirectory(entry.path) : void handleOpenLiveFile(entry.path)}
                      className="flex w-full items-center gap-3 border-b border-black/[0.04] px-4 py-3 text-left transition hover:bg-black/[0.02] dark:border-white/[0.06] dark:hover:bg-white/[0.04]"
                    >
                      <FileIcon type={entry.type === "directory" ? "folder" : "file"} />
                      <span className="flex-1 text-[13px] font-medium theme-fg">{entry.name}</span>
                      <span className="text-[11px] uppercase tracking-[0.12em] theme-muted">{entry.type === "directory" ? "Folder" : "File"}</span>
                    </button>
                  ))
                ) : (
                  <EmptyState title="This folder is empty" body="There are no files in the current directory yet." />
                )
              ) : (
                <EmptyState
                  title="No repository connected"
                  body={activeProject?.repoPath
                    ? "The active project repo is still loading. If it does not appear, reconnect it from above."
                    : "Create or open a project to load its repo here, or connect a local repository manually."}
                />
              )}
            </>
          ) : null}

          {tab === "updates" ? (
            connectedRepo ? (
              connectedRepo.recentCommits.length > 0 ? (
                connectedRepo.recentCommits.map((commit) => (
                  <button
                    key={commit.hash}
                    type="button"
                    onClick={() => void handleOpenCommitDetails(commit.hash)}
                    className={`block w-full border-b border-black/[0.04] px-4 py-3 text-left transition hover:bg-black/[0.02] dark:border-white/[0.06] dark:hover:bg-white/[0.04] ${activeVersion === commit.hash ? "bg-emerald-50/60 dark:bg-emerald-500/12" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="app-avatar mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
                        git
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold theme-fg">{commit.message}</p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] theme-muted">
                          <span className="font-mono">{commit.hash.slice(0, 7)}</span>
                          <span>·</span>
                          <span>{connectedRepo.branch}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState title="No commits yet" body="Create the first commit in this repository and it will appear here." />
              )
            ) : (
              <EmptyState title="No commit history available" body="Once a repo is connected, recent commits will appear here for review." />
            )
          ) : null}

          {tab === "ide" ? (
            <div className="flex h-[calc(100vh-16rem)]">
              <div className="w-[220px] shrink-0 overflow-y-auto border-r border-black/[0.06] bg-[#1e1f26] p-2 dark:border-white/[0.08]">
                {connectedRepo ? (
                  <div className="space-y-0.5">
                    {currentDirectoryPath && currentDirectoryPath !== connectedRepo.repoPath ? (
                      <button
                        type="button"
                        onClick={() => void handleOpenParentDirectory()}
                        className="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-white/40 hover:bg-white/[0.06]"
                      >
                        ← Back
                      </button>
                    ) : null}
                    {liveDirectoryEntries.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => entry.type === "directory" ? void handleOpenDirectory(entry.path) : void handleOpenLiveFile(entry.path)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition hover:bg-white/[0.06] ${selectedLiveFilePath === entry.path ? "bg-white/[0.1] text-white" : "text-white/65"}`}
                      >
                        <FileIcon type={entry.type === "directory" ? "folder" : "file"} />
                        <span className="truncate">{entry.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-4 text-[11px] text-white/40">No folder open.</p>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col bg-[#1e1f26]">
                {openEditorTabs.length > 0 && (
                  <div className="flex items-center gap-0 overflow-x-auto border-b border-white/[0.08] bg-[#1a1b24] custom-scroll">
                    {openEditorTabs.map((t) => (
                      <button
                        key={t.path}
                        type="button"
                        onClick={() => { if (selectedLiveFilePath !== t.path) void handleOpenLiveFile(t.path); }}
                        className={`group flex shrink-0 items-center gap-1.5 border-r border-white/[0.06] px-3 py-1.5 text-[11px] transition ${selectedLiveFilePath === t.path ? "bg-[#1e1f26] text-white/90" : "text-white/50 hover:bg-white/[0.04] hover:text-white/70"}`}
                      >
                        <span className="truncate max-w-[120px]">{t.label}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); handleCloseEditorTab(t.path); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleCloseEditorTab(t.path); } }}
                          className="ml-0.5 rounded p-0.5 opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.1]"
                        >
                          ×
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[#252630] px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-white/90">{currentEditorLabel}</span>
                    {selectedFileDisplayPath ? <span className="text-[11px] text-white/40">{selectedFileDisplayPath}</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {saveStateMessage ? <span className="text-[11px] text-emerald-400">{saveStateMessage}</span> : null}
                    {selectedLiveFilePath ? (
                      <button
                        type="button"
                        onClick={() => void handleSaveLiveFile()}
                        disabled={isSavingLiveFile || !hasUnsavedFileChanges}
                        className="rounded-md bg-white/[0.1] px-3 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/[0.15] disabled:opacity-40"
                      >
                        {isSavingLiveFile ? "Saving..." : hasUnsavedFileChanges ? "Save" : "Saved"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex-1 overflow-auto custom-scroll">
                  {connectedRepo ? (
                    selectedCommitDetails ? (
                      <div className="space-y-4 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-white/45">Commit</p>
                            <h2 className="mt-1 text-[18px] font-semibold text-white/90">{selectedCommitDetails.subject}</h2>
                            <p className="mt-1 text-[12px] text-white/55">{selectedCommitDetails.author} · {selectedCommitDetails.date} · {selectedCommitDetails.hash}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedCommitDetails(null)}
                            className="rounded-full border border-white/[0.12] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.06]"
                          >
                            Close review
                          </button>
                        </div>
                        {selectedCommitDetails.body ? (
                          <p className="whitespace-pre-wrap text-[13px] leading-6 text-white/72">{selectedCommitDetails.body}</p>
                        ) : null}
                        <div>
                          <p className="text-[12px] uppercase tracking-[0.12em] text-white/45">Files</p>
                          <div className="mt-2 space-y-2">
                            {selectedCommitDetails.files.map((file) => (
                              <div key={`${file.status}:${file.path}`} className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] text-white/75">
                                <span className="rounded-full bg-white/[0.08] px-2 py-0.5 font-mono text-[11px]">{file.status}</span>
                                <span className="break-all">{file.path}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-[12px] uppercase tracking-[0.12em] text-white/45">Patch</p>
                          <pre className="overflow-x-auto text-[13px] leading-[1.7] font-mono text-[#d4d4d4]">
                            <code>{isLoadingCommitDetails ? "Loading commit..." : selectedCommitDetails.diff || "No patch output for this commit."}</code>
                          </pre>
                        </div>
                      </div>
                    ) : selectedDiffPath ? (
                      <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-3 text-[12px] text-white/58">
                          <span>{selectedDiffStaged ? "Staged diff" : "Working tree diff"}</span>
                          <span className="truncate font-mono">{selectedDiffPath}</span>
                        </div>
                        <pre className="overflow-x-auto text-[13px] leading-[1.7] font-mono text-[#d4d4d4]">
                          <code>{isLoadingDiff ? "Loading diff..." : selectedDiffText || "No diff output for this file."}</code>
                        </pre>
                      </div>
                    ) : selectedLiveFilePath ? (
                      <div className="flex h-full min-h-full flex-col">
                        <textarea
                          value={isLoadingLiveFile ? "Loading file..." : liveFileDraft}
                          onChange={(event) => setLiveFileDraft(event.target.value)}
                          spellCheck={false}
                          disabled={isLoadingLiveFile || isSavingLiveFile}
                          className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4 font-mono text-[13px] leading-[1.7] text-[#e0e0e0] outline-none disabled:opacity-70"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 py-12 text-center">
                        <div>
                          <p className="text-[16px] font-medium text-white/80">Select a file to edit</p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center">
                      <div>
                        <p className="text-[16px] font-semibold text-white/90">No repository connected</p>
                        <p className="mt-2 text-[13px] leading-6 text-white/55">
                          {activeProject?.repoPath
                            ? `CodeBuddy is waiting to load ${activeProject.name}'s repository into the IDE.`
                            : "Open a project or connect a local repository to use the IDE view."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.08] bg-[#007acc] px-3 py-1">
                  <div className="flex items-center gap-3 text-[11px] text-white/80">
                    <span>{connectedRepo?.branch ?? "idle"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-white/80">
                    <span>{selectedLiveFilePath ? editorLanguage : "Idle"}</span>
                    <span>UTF-8</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
