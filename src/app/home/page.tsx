"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components";
import { friends as seedFriends, ideas, type Friend, type Idea } from "@/lib/mock-data";

/* ─── visual constants ─── */

type ProjectStage = "Planning" | "Building" | "Review" | "Live";
const stages: ProjectStage[] = ["Planning", "Building", "Review", "Live"];

const stageColor: Record<ProjectStage, string> = {
  Planning: "#d4cfc7",
  Building: "#a78bfa",
  Review: "#fbbf24",
  Live: "#34d399",
};

const worldGradients = [
  "from-[#0f0c29] via-[#302b63] to-[#24243e]",
  "from-[#2d1b69] via-[#552586] to-[#b14dae]",
  "from-[#134e5e] via-[#71b280] to-[#38ef7d]",
  "from-[#1a1a2e] via-[#16213e] to-[#0f3460]",
  "from-[#f12711] via-[#f5af19] to-[#f09819]",
];

/* ─── project type ─── */

interface ManagedProject {
  id: string;
  name: string;
  description: string;
  stage: ProjectStage;
  updatedAgo: string;
  lastUpdate: string;
  friends: Idea["friends"];
  repoPath?: string;
  githubRepoUrl?: string | null;
  isDesktopProject?: boolean;
}

type HomeTab = "projects" | "friends";
type ProjectDeleteMode = "codebuddy-only" | "local-only" | "github-only" | "local-and-github";

interface FriendMessage {
  id: string;
  from: string;
  text: string;
  time: string;
  isMine?: boolean;
}

interface CodingFriend extends Friend {
  id: string;
  focus: string;
  note: string;
  updatedAgo: string;
  messages: FriendMessage[];
}

type CommonPaths = {
  desktop: string;
  documents: string;
  downloads: string;
  home: string;
};

function vibeToStage(vibe: Idea["vibe"]): ProjectStage {
  switch (vibe) {
    case "just started":
      return "Planning";
    case "coming along":
      return "Building";
    case "almost there":
      return "Review";
    case "live":
      return "Live";
    default:
      return "Planning";
  }
}

const initialProjects: ManagedProject[] = ideas.map((idea) => ({
  id: idea.id,
  name: idea.name,
  description: idea.description,
  stage: vibeToStage(idea.vibe),
  updatedAgo: idea.updatedAgo,
  lastUpdate: idea.lastUpdate,
  friends: idea.friends,
}));

function formatUpdatedAgo(timestamp: string) {
  const millis = Date.now() - new Date(timestamp).getTime();

  if (!Number.isFinite(millis) || millis < 60_000) {
    return "Just now";
  }

  const minutes = Math.floor(millis / 60_000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function getFriendlyProjectError(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return message.replace(/^Error invoking remote method '[^']+': Error:\s*/i, "").trim();
}

function mapDesktopProject(project: {
  id: string;
  name: string;
  description: string;
  stage: ProjectStage;
  repoPath: string;
  githubRepoUrl: string | null;
  updatedAt: string;
}): ManagedProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    stage: project.stage,
    updatedAgo: formatUpdatedAgo(project.updatedAt),
    lastUpdate: project.githubRepoUrl
      ? "Local folder and GitHub repo are ready."
      : "Local folder is ready. GitHub repo was skipped.",
    friends: [{ name: "Cameron", initials: "CM", online: true }],
    repoPath: project.repoPath,
    githubRepoUrl: project.githubRepoUrl,
    isDesktopProject: true,
  };
}

const initialCodingFriends: CodingFriend[] = [
  {
    id: "friend-nia",
    name: "Nia",
    initials: "NI",
    online: true,
    focus: "Design systems",
    note: "Tight on rhythm, spacing, and making interfaces feel calm.",
    updatedAgo: "4 min ago",
    messages: [
      { id: "nia-1", from: "Nia", text: "Send me the new homepage direction when you want another design pass.", time: "9:14 AM" },
      { id: "nia-2", from: "You", text: "Will do. I want the project cards to feel lighter and more intentional.", time: "9:16 AM", isMine: true },
    ],
  },
  {
    id: "friend-dre",
    name: "Dre",
    initials: "DR",
    online: false,
    focus: "Backend flows",
    note: "Good person to sanity-check auth, state, and API handoff decisions.",
    updatedAgo: "18 min ago",
    messages: [
      { id: "dre-1", from: "Dre", text: "If you want, I can help think through the GitHub execution pipeline next.", time: "8:41 AM" },
    ],
  },
  {
    id: "friend-mia",
    name: "Mia",
    initials: "MI",
    online: true,
    focus: "Product feedback",
    note: "Fast feedback on onboarding, wording, and what feels confusing to new users.",
    updatedAgo: "11 min ago",
    messages: [
      { id: "mia-1", from: "Mia", text: "The collaborative angle is strong. I would surface friends earlier in the experience.", time: "9:02 AM" },
      { id: "mia-2", from: "You", text: "Agreed. I am adding a Coding friends tab on home for that reason.", time: "9:05 AM", isMine: true },
    ],
  },
  {
    id: "friend-nick",
    name: "Nick",
    initials: "NK",
    online: false,
    focus: "Launch prep",
    note: "Helpful for making the app feel crisp before showing it to more people.",
    updatedAgo: "32 min ago",
    messages: [
      { id: "nick-1", from: "Nick", text: "Once the workspace is stable, I would tighten the empty states and first-run flow.", time: "8:12 AM" },
    ],
  },
];

/* ─── page ─── */

function HomePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab: HomeTab = searchParams.get("tab") === "friends" ? "friends" : "projects";
  const [projects, setProjects] = useState(initialProjects);
  const [codingFriends, setCodingFriends] = useState(initialCodingFriends);
  const [selectedFriendId, setSelectedFriendId] = useState(initialCodingFriends[0]?.id ?? "");
  const [showCreator, setShowCreator] = useState(false);
  const [showFriendCreator, setShowFriendCreator] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftBaseDirectory, setDraftBaseDirectory] = useState("");
  const [draftCreateGithubRepo, setDraftCreateGithubRepo] = useState(true);
  const [draftGithubVisibility, setDraftGithubVisibility] = useState<"private" | "public">("private");
  const [draftImportMode, setDraftImportMode] = useState(false);
  const [draftImportPath, setDraftImportPath] = useState("");
  const [draftFriendName, setDraftFriendName] = useState("");
  const [draftFriendFocus, setDraftFriendFocus] = useState("");
  const [friendMessage, setFriendMessage] = useState("");
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const [projectPendingDelete, setProjectPendingDelete] = useState<ManagedProject | null>(null);
  const [projectDeletingId, setProjectDeletingId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<ProjectDeleteMode>("local-only");
  const [pendingGithubAuth, setPendingGithubAuth] = useState<{ projectId: string; deleteLocalFiles: boolean } | null>(null);
  const [grantingScope, setGrantingScope] = useState(false);
  const [canUseDesktopProjects, setCanUseDesktopProjects] = useState(false);
  const [canPickProjectLocation, setCanPickProjectLocation] = useState(false);
  const [defaultProjectRoot, setDefaultProjectRoot] = useState("");
  const [commonPaths, setCommonPaths] = useState<CommonPaths | null>(null);
  const [showJoinInvite, setShowJoinInvite] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [joinInviteLoading, setJoinInviteLoading] = useState(false);
  const [joinInviteError, setJoinInviteError] = useState<string | null>(null);
  const [joinInviteStep, setJoinInviteStep] = useState<"paste" | "setup">("paste");
  const [joinInviteProjectName, setJoinInviteProjectName] = useState("");
  const [joinInviteRemoteUrl, setJoinInviteRemoteUrl] = useState("");
  const [joinInviteFolder, setJoinInviteFolder] = useState("");

  const selectedFriend = codingFriends.find((friend) => friend.id === selectedFriendId) ?? codingFriends[0] ?? null;

  useEffect(() => {
    async function loadDesktopProjects() {
      if (typeof window === "undefined") {
        return;
      }

      const canUseDesktop = Boolean(window.electronAPI?.project && window.electronAPI?.settings && window.electronAPI?.system);
      setCanPickProjectLocation(Boolean(window.electronAPI?.system));
      setCanUseDesktopProjects(canUseDesktop);

      if (!canUseDesktop) {
        return;
      }

      const desktopApi = window.electronAPI;
      if (!desktopApi?.project || !desktopApi.settings) {
        return;
      }

      try {
        setProjectError(null);
        const [desktopProjects, desktopSettings, nextCommonPaths] = await Promise.all([
          desktopApi.project.list(),
          desktopApi.settings.get(),
          desktopApi.system.getCommonPaths(),
        ]);

        setProjects(desktopProjects.map(mapDesktopProject));
        setDefaultProjectRoot(desktopSettings.projectDefaults.rootDirectory);
        setDraftBaseDirectory((current) => current || desktopSettings.projectDefaults.rootDirectory);
        setDraftCreateGithubRepo(desktopSettings.projectDefaults.createGithubRepo);
        setDraftGithubVisibility(desktopSettings.projectDefaults.githubVisibility);
        setCommonPaths(nextCommonPaths);
      } catch (error) {
        const message = getFriendlyProjectError(error) || "Unable to load desktop projects.";
        setProjectError(message);
        setProjects([]);
      }
    }

    void loadDesktopProjects();
  }, []);

  const openProjectCreator = () => {
    setProjectError(null);
    setProjectNotice(null);
    setDraftBaseDirectory((current) => current || defaultProjectRoot || commonPaths?.documents || commonPaths?.desktop || "");
    setDraftImportMode(false);
    setDraftImportPath("");
    setShowCreator(true);
  };

  const handleChooseProjectLocation = async () => {
    if (!window.electronAPI?.system) {
      setProjectError("Restart the desktop app to enable the folder picker.");
      return;
    }

    const selectedPath = await window.electronAPI.system.openDirectory();
    if (selectedPath) {
      setDraftBaseDirectory(selectedPath);
    }
  };

  const handleUseLocationShortcut = (targetPath: string) => {
    setDraftBaseDirectory(targetPath);
  };

  const handleOpenProject = async (project: ManagedProject) => {
    if (project.isDesktopProject && window.electronAPI?.project) {
      try {
        await window.electronAPI.project.setActive(project.id);
      } catch (error) {
        const message = getFriendlyProjectError(error) || "Unable to open that project.";
        setProjectError(message);
      }
    }
  };

  const handleRequestDeleteProject = (project: ManagedProject) => {
    setProjectError(null);
    setProjectNotice(null);
    setProjectPendingDelete(project);
    setDeleteMode("local-only");
  };

  const handleConfirmDeleteProject = async () => {
    if (!projectPendingDelete) {
      return;
    }

    const deleteLocalFiles = deleteMode === "local-only" || deleteMode === "local-and-github";
    const deleteGithubRepo = deleteMode === "github-only" || deleteMode === "local-and-github";

    // Native confirm prompt for destructive actions
    if (deleteLocalFiles || deleteGithubRepo) {
      const targets = [
        deleteLocalFiles ? "local files" : null,
        deleteGithubRepo ? "GitHub repo" : null,
      ].filter(Boolean).join(" and ");
      const ok = window.confirm(
        `This will permanently delete the ${targets} for "${projectPendingDelete.name}". This cannot be undone.\n\nContinue?`,
      );
      if (!ok) return;
    }

    try {
      setProjectDeletingId(projectPendingDelete.id);
      setProjectError(null);
      setProjectNotice(null);

      if (projectPendingDelete.isDesktopProject && window.electronAPI?.project?.delete) {
        const result = await window.electronAPI.project.delete({
          projectId: projectPendingDelete.id,
          deleteLocalFiles,
          deleteGithubRepo,
        });
        const desktopProjects = await window.electronAPI.project.list();
        setProjects(desktopProjects.map(mapDesktopProject));

        const deleteTargets = [
          result.deletedLocalFiles ? "local files" : null,
          result.deletedGithubRepo ? "GitHub repo" : null,
        ].filter(Boolean);

        const baseNotice = deleteTargets.length > 0
          ? `${projectPendingDelete.name} was removed from CodeBuddy and deleted from ${deleteTargets.join(" and ")}.`
          : `${projectPendingDelete.name} was removed from CodeBuddy.`;

        if (result.githubWarning && deleteGithubRepo && !result.deletedGithubRepo) {
          setPendingGithubAuth({ projectId: projectPendingDelete.id, deleteLocalFiles });
          setProjectNotice(baseNotice);
        } else {
          setProjectNotice(baseNotice);
        }
      } else {
        setProjects((current) => current.filter((project) => project.id !== projectPendingDelete.id));
        setProjectNotice(`${projectPendingDelete.name} was removed from CodeBuddy.`);
      }
      setProjectPendingDelete(null);
      setDeleteMode("local-only");
    } catch (error) {
      const message = getFriendlyProjectError(error) || "Unable to delete the project.";
      setProjectError(message);
    } finally {
      setProjectDeletingId(null);
    }
  };

  const handleGrantDeleteScope = async () => {
    if (!window.electronAPI?.project?.grantDeleteScope) return;
    try {
      setGrantingScope(true);
      setProjectError(null);
      await window.electronAPI.project.grantDeleteScope();
      setPendingGithubAuth(null);
      setProjectNotice("GitHub delete permission granted. You can now delete GitHub repos from CodeBuddy.");
    } catch {
      setProjectError("Unable to complete GitHub authentication. Try again or run the command manually in a terminal.");
    } finally {
      setGrantingScope(false);
    }
  };

  const handleCreate = async () => {
    if (!draftName.trim()) return;

    if (canUseDesktopProjects && window.electronAPI?.project) {
      try {
        setProjectLoading(true);
        setProjectError(null);
        setProjectNotice(null);

        const createPayload: Record<string, unknown> = {
          name: draftName.trim(),
          description: draftDescription.trim(),
          createGithubRepo: draftCreateGithubRepo,
          githubVisibility: draftGithubVisibility,
        };

        if (draftImportMode && draftImportPath.trim()) {
          createPayload.importExistingPath = draftImportPath.trim();
        } else {
          createPayload.baseDirectory = draftBaseDirectory.trim();
        }

        const createdProject = await window.electronAPI.project.create(createPayload as unknown as Parameters<typeof window.electronAPI.project.create>[0]);

        const [desktopProjects, desktopSettings] = await Promise.all([
          window.electronAPI.project.list(),
          window.electronAPI.settings.get(),
        ]);

        setProjects(desktopProjects.map(mapDesktopProject));
        setDefaultProjectRoot(desktopSettings.projectDefaults.rootDirectory);
        setDraftName("");
        setDraftDescription("");
        setShowCreator(false);

        if (draftCreateGithubRepo && !createdProject.githubRepoUrl) {
          setProjectNotice(createdProject.githubRepoWarning || "Project created locally. GitHub repo was not created — it may already exist on your account or the CLI couldn't connect.");
        } else if (createdProject.githubRepoUrl) {
          setProjectNotice(`Project created with GitHub repo.`);
        }

        router.push("/project");
      } catch (error) {
        const message = getFriendlyProjectError(error) || "Unable to create the project.";
        setProjectError(message);
      } finally {
        setProjectLoading(false);
      }

      return;
    }

    const p: ManagedProject = {
      id: `p-${Date.now()}`,
      name: draftName.trim(),
      description: draftDescription.trim() || "A brand new project.",
      stage: "Planning",
      updatedAgo: "Just now",
      lastUpdate: "Project created. Ready to build.",
      friends: [{ name: "Cameron", initials: "CM", online: true }],
    };
    setProjects((cur) => [p, ...cur]);
    setDraftName("");
    setDraftDescription("");
    setShowCreator(false);
  };

  const handleDecodeInvite = async () => {
    if (!joinInviteCode.trim() || !window.electronAPI?.p2p) return;
    setJoinInviteError(null);
    try {
      const decoded = await window.electronAPI.p2p.decodeInvite({ code: joinInviteCode.trim() });
      setJoinInviteProjectName(decoded.projectName);
      setJoinInviteRemoteUrl(decoded.remoteUrl);
      // Default folder to project root + project name
      const settings = await window.electronAPI.settings?.get() as unknown as Record<string, unknown> | undefined;
      const defaults = settings?.projectDefaults as Record<string, unknown> | undefined;
      const root = (defaults?.rootDirectory as string) || "";
      const safeName = decoded.projectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
      setJoinInviteFolder(root ? `${root}${root.endsWith("\\") || root.endsWith("/") ? "" : "\\"}${safeName}` : safeName);
      setJoinInviteStep("setup");
    } catch (err) {
      setJoinInviteError(err instanceof Error ? err.message : "Invalid invite code");
    }
  };

  const handlePickJoinFolder = async () => {
    const picked = await window.electronAPI?.system?.openDirectory();
    if (picked) setJoinInviteFolder(picked);
  };

  const handleJoinInvite = async () => {
    if (!joinInviteCode.trim() || !window.electronAPI?.p2p) return;
    setJoinInviteLoading(true);
    setJoinInviteError(null);
    try {
      const result = await window.electronAPI.p2p.acceptInvite({
        code: joinInviteCode.trim(),
        memberName: displayName || undefined,
        targetDirectory: joinInviteFolder || undefined,
      });
      // Refresh project list
      const desktopProjects = await window.electronAPI.project?.list();
      if (desktopProjects) setProjects(desktopProjects.map(mapDesktopProject));
      setShowJoinInvite(false);
      setJoinInviteCode("");
      setJoinInviteStep("paste");
      setJoinInviteProjectName("");
      setJoinInviteRemoteUrl("");
      setJoinInviteFolder("");
      // Navigate to the new project
      if (result?.project) router.push("/project");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to join project";
      if (msg.includes("not found") || msg.includes("Could not read from remote") || msg.includes("Authentication failed") || msg.includes("403")) {
        // Extract GitHub repo URL for collaborator guidance
        const ghMatch = joinInviteRemoteUrl?.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        const collabLink = ghMatch ? `https://github.com/${ghMatch[1]}/${ghMatch[2]}/settings/access` : null;
        setJoinInviteError(
          `Could not access this repository. If it's a private repo, the owner needs to add you as a collaborator on GitHub first.` +
          (collabLink ? `\n\nAsk them to go to: ${collabLink} → "Add people" → enter your GitHub username.` : "") +
          `\n\nOnce you accept the GitHub invite, try again.`
        );
      } else {
        setJoinInviteError(msg);
      }
    } finally {
      setJoinInviteLoading(false);
    }
  };

  // Pull display name from settings for invite acceptance
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.settings) {
      window.electronAPI.settings.get().then((s) => {
        const settings = s as unknown as Record<string, unknown>;
        if (settings.displayName) {
          setDisplayName(settings.displayName as string);
        }
      }).catch(() => {});
    }
  }, []);

  const handleCreateFriend = () => {
    if (!draftFriendName.trim()) return;

    const trimmedName = draftFriendName.trim();
    const initials = trimmedName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "FR";

    const nextFriend: CodingFriend = {
      id: `friend-${Date.now()}`,
      name: trimmedName,
      initials,
      online: true,
      focus: draftFriendFocus.trim() || "General coding",
      note: "New coding friend. Start the conversation.",
      updatedAgo: "Just now",
      messages: [],
    };

    setCodingFriends((current) => [nextFriend, ...current]);
    setSelectedFriendId(nextFriend.id);
    setDraftFriendName("");
    setDraftFriendFocus("");
    setShowFriendCreator(false);
    router.push("/home?tab=friends");
  };

  const handleSendFriendMessage = () => {
    if (!selectedFriend || !friendMessage.trim()) {
      return;
    }

    const nextMessage: FriendMessage = {
      id: `message-${Date.now()}`,
      from: "You",
      text: friendMessage.trim(),
      time: "Now",
      isMine: true,
    };

    setCodingFriends((current) => current.map((friend) => (
      friend.id === selectedFriend.id
        ? {
          ...friend,
          updatedAgo: "Just now",
          messages: [...friend.messages, nextMessage],
        }
        : friend
    )));
    setFriendMessage("");
  };

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] px-6 pb-24 pt-20 text-ink dark:text-[var(--fg)] sm:px-8 xl:px-10">
      <div className="flex w-full flex-col gap-8">

        {/* ═══════════════════ HERO ═══════════════════ */}
        <header className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] theme-muted">
            {activeTab === "projects" ? "Your projects" : "Coding friends"}
          </p>
          <h1 className="display-font mt-2 text-[2.3rem] font-semibold leading-[0.98] tracking-tight theme-fg sm:text-[3rem]">
            {activeTab === "projects" ? "What are we building?" : "Who are you building with?"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed theme-soft">
            {activeTab === "projects"
              ? "Pick a project to continue, or start something brand new."
              : "Keep your coding circle close. Add friends, check in, and message people you build with."}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => activeTab === "projects" ? openProjectCreator() : setShowFriendCreator(true)}
              className="btn-primary px-5 py-2.5 text-[13px]"
            >
              {activeTab === "projects" ? "New project" : "Add coding friend"}
            </button>
            {activeTab === "projects" && canUseDesktopProjects && (
              <button
                type="button"
                onClick={() => setShowJoinInvite(true)}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-5 py-2.5 text-[13px] font-semibold text-violet-600 transition hover:bg-violet-500/10 dark:text-violet-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" /></svg>
                Join with invite
              </button>
            )}
          </div>
        </header>

        {projectError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {projectError}
          </div>
        ) : null}

        {pendingGithubAuth ? (
          <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <div className="flex-1">
              <p className="font-semibold">GitHub needs permission to delete repos</p>
              <p className="mt-0.5 text-[12px] opacity-80">A window will open to complete GitHub authentication. This only needs to happen once.</p>
            </div>
            <button
              type="button"
              onClick={() => void handleGrantDeleteScope()}
              disabled={grantingScope}
              className="shrink-0 rounded-full bg-amber-600 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
            >
              {grantingScope ? "Waiting for auth..." : "Grant Permission"}
            </button>
            <button
              type="button"
              onClick={() => setPendingGithubAuth(null)}
              className="shrink-0 text-[12px] font-medium opacity-60 transition hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {projectNotice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            {projectNotice}
          </div>
        ) : null}

        {/* ═══════════════════ PROJECT TILES ═══════════════════ */}
        {activeTab === "projects" ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {projects.map((project, i) => {
              const stageIdx = stages.indexOf(project.stage);

              return (
                <div
                  key={project.id}
                  className="group relative overflow-hidden rounded-[1.4rem] app-surface-strong shadow-sm transition-all duration-300 hover:shadow-[0_14px_34px_rgba(0,0,0,0.12)]"
                >
                  <button
                    type="button"
                    onClick={() => handleRequestDeleteProject(project)}
                    className="absolute left-3 top-3 z-10 rounded-full border border-red-200/80 bg-[rgba(255,248,246,0.92)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700 shadow-[0_8px_18px_rgba(94,32,20,0.12)] backdrop-blur-sm transition hover:border-red-300 hover:bg-[rgba(255,241,238,0.97)] hover:text-red-800 dark:border-red-300/20 dark:bg-[rgba(45,24,24,0.82)] dark:text-red-200 dark:hover:border-red-200/30 dark:hover:bg-[rgba(58,29,29,0.9)]"
                  >
                    Delete
                  </button>

                  <Link
                    href="/project"
                    onClick={() => void handleOpenProject(project)}
                    className="block"
                  >
                    <div
                      className={`relative flex h-[116px] items-center justify-center overflow-hidden bg-gradient-to-br ${worldGradients[i % worldGradients.length]}`}
                    >
                      <span className="display-font select-none text-[3.4rem] font-bold leading-none text-white/[0.11] transition-transform duration-500 ease-out group-hover:scale-110">
                        {project.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                      <span className="absolute right-3 top-3 rounded-full bg-black/20 px-2 py-1 text-[9px] font-medium text-white/70 backdrop-blur-sm">
                        {project.updatedAgo}
                      </span>
                    </div>

                    <div className="p-4">
                      <h3 className="display-font text-[1.05rem] font-semibold tracking-tight theme-fg">
                        {project.name}
                      </h3>
                      <p className="mt-2 text-[12px] leading-[1.55] theme-soft">
                        {project.description}
                      </p>
                      {project.repoPath ? (
                        <p className="mt-2 line-clamp-2 text-[11px] theme-muted">
                          {project.repoPath}
                        </p>
                      ) : null}

                      <div className="mt-4 flex items-center">
                        {stages.map((stage, si) => {
                          const complete = si < stageIdx;
                          const current = si === stageIdx;
                          const future = si > stageIdx;

                          return (
                            <div key={stage} className="flex items-center">
                              {si > 0 && (
                                <div
                                  className="h-[2px] w-4 transition-colors duration-300"
                                  style={{
                                    backgroundColor: future
                                      ? "rgba(0,0,0,0.06)"
                                      : "rgba(0,0,0,0.12)",
                                  }}
                                />
                              )}
                              <div className="flex flex-col items-center gap-1.5">
                                <div
                                  className={`rounded-full transition-all duration-300 ${
                                    current ? "h-3 w-3" : "h-2 w-2"
                                  }`}
                                  style={{
                                    backgroundColor: future
                                      ? "rgba(0,0,0,0.14)"
                                      : stageColor[stage],
                                    boxShadow: current
                                      ? `0 0 0 3px ${stageColor[stage]}25, 0 0 10px ${stageColor[stage]}30`
                                      : undefined,
                                  }}
                                />
                                <span
                                  className={`text-[8px] font-semibold uppercase tracking-[0.12em] ${
                                    current
                                      ? "text-black/70 dark:text-[#f2efe8]"
                                      : complete
                                        ? "text-black/35 dark:text-[#b8b1a5]"
                                        : "text-black/20 dark:text-[#7c776f]"
                                  }`}
                                >
                                  {stage}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex -space-x-1.5">
                          {project.friends.slice(0, 4).map((f) => (
                            <div
                              key={f.name}
                              className="app-avatar flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold ring-2 ring-white dark:ring-[#1a1c20]"
                              title={f.name}
                            >
                              {f.initials}
                            </div>
                          ))}
                        </div>
                        <span className="flex items-center gap-1 text-[11px] font-semibold theme-muted transition-colors group-hover:text-[var(--fg)]">
                          Open
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                          >
                            <path
                              fillRule="evenodd"
                              d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}

            <button
              type="button"
              onClick={openProjectCreator}
              className="flex min-h-[236px] items-center justify-center rounded-[1.4rem] border-2 border-dashed border-black/[0.07] bg-white/30 text-ink-muted/40 transition-all duration-200 hover:border-black/[0.14] hover:bg-white/50 hover:text-ink-muted/60 dark:border-white/[0.10] dark:bg-white/[0.03] dark:text-[var(--muted)] dark:hover:border-white/[0.18] dark:hover:bg-white/[0.05]"
            >
              <div className="flex flex-col items-center gap-2.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-black/[0.04] dark:bg-white/[0.06]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                  >
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                </div>
                <span className="text-[13px] font-medium">Start a new project</span>
                <span className="text-[11px]">Describe your idea and go</span>
              </div>
            </button>
          </section>
        ) : (
          <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="app-surface rounded-[1.75rem] p-4">
              <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-2 pb-4 dark:border-white/[0.08]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">Friends</p>
                  <p className="mt-1 text-[13px] theme-soft">{codingFriends.length} in your circle</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFriendCreator(true)}
                  className="rounded-full bg-black/[0.04] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                >
                  Add friend
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {codingFriends.map((friend) => {
                  const active = friend.id === selectedFriend?.id;

                  return (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => setSelectedFriendId(friend.id)}
                      className={`w-full rounded-[1.2rem] border px-4 py-3 text-left transition ${active ? "border-black/[0.08] bg-black/[0.03] shadow-[0_10px_22px_rgba(0,0,0,0.04)] dark:border-white/[0.12] dark:bg-white/[0.05] dark:shadow-none" : "border-transparent hover:border-black/[0.06] hover:bg-black/[0.02] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]"}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar initials={friend.initials} online={friend.online} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[13px] font-semibold theme-fg">{friend.name}</p>
                            <p className="text-[10px] uppercase tracking-[0.12em] theme-muted">{friend.updatedAgo}</p>
                          </div>
                          <p className="text-[11px] theme-muted">{friend.focus}</p>
                          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed theme-soft">{friend.note}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="app-surface flex min-h-[660px] flex-col overflow-hidden rounded-[1.85rem]">
              {selectedFriend ? (
                <>
                  <div className="border-b border-black/[0.06] px-6 py-5 dark:border-white/[0.08]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar initials={selectedFriend.initials} size="lg" online={selectedFriend.online} ring />
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] theme-muted">Coding friend</p>
                          <h2 className="display-font mt-1 text-[1.45rem] font-semibold tracking-tight theme-fg">{selectedFriend.name}</h2>
                          <p className="mt-1 text-[13px] theme-soft">{selectedFriend.focus}</p>
                        </div>
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.12em] theme-muted">{selectedFriend.updatedAgo}</p>
                    </div>
                  </div>

                  <div className="custom-scroll flex-1 space-y-4 overflow-y-auto px-6 py-6">
                    {selectedFriend.messages.length > 0 ? selectedFriend.messages.map((message) => (
                      <div key={message.id} className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[620px] rounded-[1.15rem] px-4 py-3 ${message.isMine ? "bg-[#f4eee3] text-[#17181b] shadow-[0_12px_28px_rgba(0,0,0,0.06)] dark:bg-[#f3efe8] dark:text-[#141414]" : "border border-black/[0.05] bg-white/55 text-ink shadow-[0_8px_20px_rgba(0,0,0,0.03)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[var(--fg)] dark:shadow-none"}`}>
                          <div className={`mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${message.isMine ? "text-[#5f5a52]/70 dark:text-[#4d463c]/70" : "theme-muted"}`}>
                            <span>{message.from}</span>
                            <span>{message.time}</span>
                          </div>
                          <p className="text-[14px] leading-relaxed">{message.text}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="flex h-full min-h-[260px] items-center justify-center rounded-[1.25rem] border border-dashed border-black/[0.08] bg-white/30 text-[13px] theme-soft dark:border-white/[0.12] dark:bg-white/[0.02]">
                        Start the conversation.
                      </div>
                    )}
                  </div>

                  <div className="border-t border-black/[0.06] px-5 py-4 dark:border-white/[0.08]">
                    <div className="app-surface-strong rounded-[1.45rem] px-4 py-3">
                      <textarea
                        rows={2}
                        value={friendMessage}
                        onChange={(event) => setFriendMessage(event.target.value)}
                        placeholder={`Message ${selectedFriend.name}`}
                        className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-ink placeholder:text-ink-muted/45 outline-none dark:text-[var(--fg)] dark:placeholder:text-[var(--muted)]"
                      />
                      <div className="mt-3 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={handleSendFriendMessage}
                          className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-cream transition hover:bg-ink/90 dark:bg-white dark:text-[#141414]"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[660px] items-center justify-center px-6 text-[14px] theme-soft">
                  Add a coding friend to start messaging.
                </div>
              )}
            </section>
          </section>
        )}
      </div>

      {/* ═══════════════════ CREATE PROJECT MODAL ═══════════════════ */}
      {showCreator && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowCreator(false)}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <div className="app-surface-strong relative w-full max-w-md overflow-hidden rounded-[1.75rem] shadow-2xl">
            {/* gradient header */}
            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-[#667eea] to-[#764ba2]">
              <span className="display-font text-[2.5rem] font-bold text-white/20">New</span>
            </div>
            <div className="p-6">
              <h3 className="display-font text-[1.3rem] font-semibold tracking-tight theme-fg">
                {draftImportMode ? "Import existing project" : "Start something new"}
              </h3>
              <p className="mt-1.5 text-[13px] theme-muted">
                {draftImportMode
                  ? "Point to an existing directory and CodeBuddy will wrap it as a project."
                  : "Create a real local project folder and, if you want, its matching GitHub repo."}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraftImportMode(false)}
                  className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition ${!draftImportMode ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "app-surface-strong theme-muted hover:text-[var(--fg)]"}`}
                >
                  New project
                </button>
                <button
                  type="button"
                  onClick={() => setDraftImportMode(true)}
                  className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition ${draftImportMode ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "app-surface-strong theme-muted hover:text-[var(--fg)]"}`}
                >
                  Import existing
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Project name"
                  className="app-input rounded-xl px-4 py-3 text-[14px] outline-none transition focus:ring-2 focus:ring-ink/10 dark:focus:ring-white/[0.08]"
                />
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={2}
                  placeholder="What's it about? (optional)"
                  className="app-input resize-none rounded-xl px-4 py-3 text-[14px] outline-none transition focus:ring-2 focus:ring-ink/10 dark:focus:ring-white/[0.08]"
                />
                {draftImportMode ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.electronAPI?.system) return;
                        const selectedPath = await window.electronAPI.system.openDirectory();
                        if (selectedPath) {
                          setDraftImportPath(selectedPath);
                          if (!draftName.trim()) {
                            const folderName = selectedPath.split(/[/\\]/).pop() || "";
                            setDraftName(folderName);
                          }
                        }
                      }}
                      disabled={!canPickProjectLocation}
                      className="w-full rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 text-left transition hover:border-black/[0.12] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/[0.14]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-semibold theme-fg">Select existing directory</p>
                          <p className="mt-1 text-[11px] theme-muted">
                            {draftImportPath || "Click to choose the project folder to import."}
                          </p>
                        </div>
                        <span className="rounded-lg bg-black/[0.05] px-3 py-1.5 text-[11px] font-semibold theme-fg dark:bg-white/[0.08]">
                          {canPickProjectLocation ? "Browse" : "Desktop only"}
                        </span>
                      </div>
                    </button>
                    <input
                      value={draftImportPath}
                      onChange={(e) => setDraftImportPath(e.target.value)}
                      placeholder="Or paste the full path"
                      className="app-input rounded-xl px-4 py-3 text-[14px] outline-none transition focus:ring-2 focus:ring-ink/10 dark:focus:ring-white/[0.08]"
                    />
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleChooseProjectLocation()}
                      disabled={!canPickProjectLocation}
                      className="w-full rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 text-left transition hover:border-black/[0.12] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/[0.14]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-semibold theme-fg">Project location</p>
                          <p className="mt-1 text-[11px] theme-muted">
                            {draftBaseDirectory || defaultProjectRoot || "Click to choose where CodeBuddy should create the project folder."}
                          </p>
                        </div>
                        <span className="rounded-lg bg-black/[0.05] px-3 py-1.5 text-[11px] font-semibold theme-fg dark:bg-white/[0.08]">
                          {canPickProjectLocation ? "Choose folder" : "Desktop only"}
                        </span>
                      </div>
                    </button>
                {commonPaths ? (
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Desktop", path: commonPaths.desktop },
                      { label: "Documents", path: commonPaths.documents },
                      { label: "Downloads", path: commonPaths.downloads },
                      { label: "Home", path: commonPaths.home },
                    ].map((location) => (
                      <button
                        key={location.label}
                        type="button"
                        onClick={() => handleUseLocationShortcut(location.path)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${draftBaseDirectory === location.path ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "app-surface-strong theme-muted hover:text-[var(--fg)]"}`}
                      >
                        {location.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <input
                  value={draftBaseDirectory}
                  onChange={(e) => setDraftBaseDirectory(e.target.value)}
                  placeholder={defaultProjectRoot || "Paste or type a folder path"}
                  className="app-input rounded-xl px-4 py-3 text-[14px] outline-none transition focus:ring-2 focus:ring-ink/10 dark:focus:ring-white/[0.08]"
                />
                <p className="text-[11px] theme-muted">
                  CodeBuddy creates a subfolder using the project name inside this location. You can also type a path that doesn&apos;t exist yet — it will be created for you.
                </p>
                  </>
                )}
                <label className="flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-[13px] theme-fg dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    checked={draftCreateGithubRepo}
                    onChange={(event) => setDraftCreateGithubRepo(event.target.checked)}
                    className="h-4 w-4 rounded border-black/[0.18]"
                  />
                  Create matching GitHub repo automatically
                </label>
                {draftCreateGithubRepo ? (
                  <div className="flex gap-2">
                    {(["private", "public"] as const).map((visibility) => (
                      <button
                        key={visibility}
                        type="button"
                        onClick={() => setDraftGithubVisibility(visibility)}
                        className={`rounded-lg px-4 py-2 text-[13px] font-medium capitalize transition ${draftGithubVisibility === visibility ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "app-surface-strong theme-muted hover:text-[var(--fg)]"}`}
                      >
                        {visibility}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreator(false);
                      setProjectError(null);
                    }}
                    className="btn-ghost px-4 py-2.5 text-[13px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={projectLoading}
                    className="btn-primary px-5 py-2.5 text-[13px]"
                  >
                    {projectLoading ? (draftImportMode ? "Importing..." : "Creating...") : (draftImportMode ? "Import project" : "Create project")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFriendCreator && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowFriendCreator(false)}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <div className="app-surface-strong relative w-full max-w-md overflow-hidden rounded-[1.75rem] shadow-2xl">
            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-[#3b82f6] to-[#14b8a6]">
              <span className="display-font text-[2.5rem] font-bold text-white/20">Friend</span>
            </div>
            <div className="p-6">
              <h3 className="display-font text-[1.3rem] font-semibold tracking-tight theme-fg">
                Add a coding friend
              </h3>
              <p className="mt-1.5 text-[13px] theme-muted">
                Add someone you build with so you can message them from home.
              </p>
              <div className="mt-5 grid gap-3">
                <input
                  value={draftFriendName}
                  onChange={(e) => setDraftFriendName(e.target.value)}
                  placeholder="Friend name"
                  className="app-input rounded-xl px-4 py-3 text-[14px] outline-none transition focus:ring-2 focus:ring-ink/10 dark:focus:ring-white/[0.08]"
                />
                <input
                  value={draftFriendFocus}
                  onChange={(e) => setDraftFriendFocus(e.target.value)}
                  placeholder="What do they help with?"
                  className="app-input rounded-xl px-4 py-3 text-[14px] outline-none transition focus:ring-2 focus:ring-ink/10 dark:focus:ring-white/[0.08]"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowFriendCreator(false)}
                    className="btn-ghost px-4 py-2.5 text-[13px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateFriend}
                    className="btn-primary px-5 py-2.5 text-[13px]"
                  >
                    Add friend
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── JOIN VIA INVITE MODAL ─── */}
      {showJoinInvite && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => { setShowJoinInvite(false); setJoinInviteError(null); setJoinInviteStep("paste"); }}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <div className="app-surface-strong relative w-full max-w-md overflow-hidden rounded-[1.75rem] shadow-2xl">
            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-violet-600 to-indigo-600">
              <span className="display-font text-[2.5rem] font-bold text-white/20">Join</span>
            </div>
            <div className="p-6">
              {joinInviteError && (
                <div className="mb-4 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {joinInviteError}
                </div>
              )}

              {/* Step 1: Paste invite code */}
              {joinInviteStep === "paste" && (
                <>
                  <h3 className="display-font text-[1.3rem] font-semibold tracking-tight theme-fg">
                    Join a friend&apos;s project
                  </h3>
                  <p className="mt-1.5 text-[13px] theme-muted">
                    Paste the invite code your friend shared with you.
                  </p>
                  <div className="mt-5 grid gap-3">
                    <textarea
                      value={joinInviteCode}
                      onChange={(e) => setJoinInviteCode(e.target.value)}
                      placeholder="Paste invite code here..."
                      rows={3}
                      className="app-input resize-none rounded-xl px-4 py-3 font-mono text-[13px] outline-none transition focus:ring-2 focus:ring-violet-500/20"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => { setShowJoinInvite(false); setJoinInviteError(null); setJoinInviteStep("paste"); }}
                        className="btn-ghost px-4 py-2.5 text-[13px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDecodeInvite()}
                        disabled={!joinInviteCode.trim()}
                        className="btn-primary px-5 py-2.5 text-[13px]"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Step 2: Choose local folder */}
              {joinInviteStep === "setup" && (
                <>
                  <h3 className="display-font text-[1.3rem] font-semibold tracking-tight theme-fg">
                    Set up &ldquo;{joinInviteProjectName}&rdquo;
                  </h3>
                  <p className="mt-1.5 text-[13px] theme-muted">
                    Choose where to clone the project on your computer.
                  </p>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider theme-muted">
                        Project
                      </label>
                      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 dark:border-white/10">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 theme-muted"><path d="M3.505 2.365A41.369 41.369 0 019 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 00-.577-.069 43.141 43.141 0 00-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 015 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914z" /><path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.147 2.839 2.71 2.935.214.013.428.024.642.034.2.009.385.09.518.224l2.35 2.35a.75.75 0 001.28-.531v-2.07c1.453-.195 2.5-1.463 2.5-2.942V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0014 6z" /></svg>
                        <span className="text-[13px] font-medium theme-fg">{joinInviteProjectName}</span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider theme-muted">
                        Save to
                      </label>
                      {commonPaths && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {[
                            { label: "Desktop", path: commonPaths.desktop },
                            { label: "Documents", path: commonPaths.documents },
                            { label: "Downloads", path: commonPaths.downloads },
                            { label: "Home", path: commonPaths.home },
                          ].map((loc) => {
                            const safeName = joinInviteProjectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
                            const full = `${loc.path}${loc.path.endsWith("\\") || loc.path.endsWith("/") ? "" : "\\"}${safeName}`;
                            const isActive = joinInviteFolder === full;
                            return (
                              <button
                                key={loc.label}
                                type="button"
                                onClick={() => setJoinInviteFolder(full)}
                                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${isActive ? "bg-violet-600 text-white" : "app-surface-strong theme-muted hover:text-[var(--fg)]"}`}
                              >
                                {loc.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={joinInviteFolder}
                          onChange={(e) => setJoinInviteFolder(e.target.value)}
                          placeholder="C:\Users\you\Projects\my-project"
                          className="app-input min-w-0 flex-1 rounded-xl px-4 py-3 font-mono text-[12px] outline-none transition focus:ring-2 focus:ring-violet-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => void handlePickJoinFolder()}
                          className="btn-ghost shrink-0 rounded-xl px-3 py-3 text-[13px]"
                          title="Browse..."
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" /></svg>
                        </button>
                      </div>
                      {joinInviteFolder.trim() && (
                        <p className="mt-1.5 truncate font-mono text-[11px] text-violet-400/80 dark:text-violet-300/60">
                          {joinInviteFolder}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] theme-muted">
                        The repo will be cloned into this folder. A new folder will be created if it doesn&apos;t exist.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setJoinInviteStep("paste"); setJoinInviteError(null); }}
                      className="btn-ghost px-4 py-2.5 text-[13px]"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleJoinInvite()}
                      disabled={joinInviteLoading || !joinInviteFolder.trim()}
                      className="btn-primary px-5 py-2.5 text-[13px]"
                    >
                      {joinInviteLoading ? "Cloning & joining..." : "Clone & join"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {projectPendingDelete ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => projectDeletingId ? null : setProjectPendingDelete(null)}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <div className="app-surface-strong relative w-full max-w-md overflow-hidden rounded-[1.75rem] shadow-2xl">
            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-[#ef4444] to-[#b91c1c]">
              <span className="display-font text-[2.5rem] font-bold text-white/20">Delete</span>
            </div>
            <div className="p-6">
              <h3 className="display-font text-[1.3rem] font-semibold tracking-tight theme-fg">
                Delete {projectPendingDelete.name}?
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed theme-muted">
                Choose exactly what should be deleted. Removing from CodeBuddy only keeps both the local folder and the GitHub repo.
              </p>
              {projectPendingDelete.repoPath ? (
                <p className="mt-3 rounded-2xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 text-[11px] theme-muted dark:border-white/[0.08] dark:bg-white/[0.03]">
                  {projectPendingDelete.repoPath}
                </p>
              ) : null}
              <div className="mt-4 grid gap-3">
                {[
                  {
                    id: "codebuddy-only",
                    label: "Remove from CodeBuddy only",
                    description: "Keeps the local folder and GitHub repo exactly as they are.",
                    disabled: false,
                  },
                  {
                    id: "local-only",
                    label: "Delete local files only",
                    description: "Removes the project folder from this computer but leaves GitHub alone.",
                    disabled: false,
                  },
                  {
                    id: "github-only",
                    label: "Delete GitHub repo only",
                    description: projectPendingDelete.githubRepoUrl ? "Removes the connected GitHub repository but keeps the local folder." : "This project does not have a connected GitHub repo.",
                    disabled: !projectPendingDelete.githubRepoUrl,
                  },
                  {
                    id: "local-and-github",
                    label: "Delete local files and GitHub repo",
                    description: projectPendingDelete.githubRepoUrl ? "Fully removes the local folder here and the connected repo on GitHub." : "This option needs a connected GitHub repo.",
                    disabled: !projectPendingDelete.githubRepoUrl,
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDeleteMode(option.id as ProjectDeleteMode)}
                    disabled={option.disabled}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${deleteMode === option.id ? "border-red-300 bg-red-50 text-red-900 shadow-[0_10px_24px_rgba(127,29,29,0.08)] dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-100" : option.disabled ? "border-black/[0.04] bg-black/[0.01] text-black/40 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/40" : "border-black/[0.06] bg-black/[0.02] theme-fg hover:border-black/[0.12] hover:bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/[0.14]"}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${deleteMode === option.id ? "border-red-500 bg-red-500" : "border-black/20 dark:border-white/30"}`}>
                        {deleteMode === option.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                      </span>
                      <div>
                        <p className="font-semibold">{option.label}</p>
                        <p className="mt-1 text-[11px] theme-muted">{option.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProjectPendingDelete(null);
                    setDeleteMode("local-only");
                  }}
                  disabled={projectDeletingId === projectPendingDelete.id}
                  className="btn-ghost px-4 py-2.5 text-[13px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDeleteProject()}
                  disabled={projectDeletingId === projectPendingDelete.id}
                  className="rounded-full bg-red-600 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {projectDeletingId === projectPendingDelete.id ? "Deleting..." : "Confirm delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}
