"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components";
import { friends as seedFriends, ideas, type Friend, type Idea } from "@/lib/mock-data";
import { nowTimestamp } from "@/lib/format-time";

/* ─── visual constants ─── */

type ProjectStage = "Planning" | "Building" | "Review" | "Live";
const stages: ProjectStage[] = ["Planning", "Building", "Review", "Live"];

const stageColor: Record<ProjectStage, string> = {
  Planning: "var(--text-ghost)",
  Building: "var(--sun)",
  Review: "var(--violet)",
  Live: "var(--mint)",
};

const stageLabel: Record<ProjectStage, string> = {
  Planning: "Planned",
  Building: "Building",
  Review: "In review",
  Live: "Live",
};

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
  taskCounts?: { planned: number; building: number; review: number; done: number; total: number };
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
  dashboard?: { plan?: { subprojects?: Array<{ tasks?: Array<{ status: string }> }> } | null };
}): ManagedProject {
  // Extract real task counts from plan data
  const allTasks = (project.dashboard?.plan?.subprojects ?? []).flatMap((sp) => sp.tasks ?? []);
  const taskCounts = {
    planned: allTasks.filter((t) => t.status === "planned").length,
    building: allTasks.filter((t) => t.status === "building").length,
    review: allTasks.filter((t) => t.status === "review").length,
    done: allTasks.filter((t) => t.status === "done").length,
    total: allTasks.length,
  };

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
    taskCounts,
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
      time: nowTimestamp(),
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
    <div className="custom-scroll min-h-screen w-full overflow-y-auto px-6 py-8">

        {/* ═══════════════════ HEADER ═══════════════════ */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-display-sm tracking-tight text-text">
              Projects
            </h1>
            <p className="mt-1 text-body-sm text-text-dim">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canUseDesktopProjects && (
              <button
                type="button"
                onClick={() => setShowJoinInvite(true)}
                className="btn-ghost text-label text-violet"
              >
                Join invite
              </button>
            )}
            <button
              type="button"
              onClick={() => openProjectCreator()}
              className="btn-primary px-4 py-2 text-label"
            >
              New project
            </button>
          </div>
        </header>

        {projectError ? (
          <div className="mb-4 rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-body-sm text-coral">
            {projectError}
          </div>
        ) : null}

        {pendingGithubAuth ? (
          <div className="mb-4 flex items-center gap-4 rounded-xl border border-sun/20 bg-sun/5 px-4 py-3 text-body-sm text-sun">
            <div className="flex-1">
              <p className="font-semibold">GitHub needs permission to delete repos</p>
              <p className="mt-0.5 text-label opacity-80">A window will open to complete GitHub authentication.</p>
            </div>
            <button
              type="button"
              onClick={() => void handleGrantDeleteScope()}
              disabled={grantingScope}
              className="btn-primary shrink-0 bg-sun px-4 py-2 text-label text-void"
            >
              {grantingScope ? "Waiting..." : "Grant Permission"}
            </button>
            <button
              type="button"
              onClick={() => setPendingGithubAuth(null)}
              className="btn-ghost shrink-0 text-label"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {projectNotice ? (
          <div className="mb-4 rounded-xl border border-mint/20 bg-mint/5 px-4 py-3 text-body-sm text-mint">
            {projectNotice}
          </div>
        ) : null}

        {/* ═══════════════════ PROJECT ROWS ═══════════════════ */}
          <section className="stagger space-y-1">
            {projects.map((project) => {
              const tc = project.taskCounts ?? { planned: 0, building: 0, review: 0, done: 0, total: 0 };
              const hasTasks = tc.total > 0;

              return (
                <div
                  key={project.id}
                  className="group relative flex items-center gap-4 rounded-xl border border-transparent px-4 py-3 transition-all duration-150 hover:border-edge hover:bg-stage-up"
                  style={{ minHeight: "72px" }}
                >
                  {/* Status dot */}
                  <div
                    className="status-dot shrink-0"
                    style={{ background: stageColor[project.stage] }}
                    title={stageLabel[project.stage]}
                  />

                  {/* Name + meta */}
                  <Link
                    href="/project"
                    onClick={() => void handleOpenProject(project)}
                    className="flex min-w-0 flex-1 items-center gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-body font-semibold tracking-tight text-text">
                        {project.name}
                      </h3>
                      <p className="mt-0.5 truncate text-body-sm text-text-dim">
                        {project.description}
                      </p>
                    </div>

                    {/* Linear-style task breakdown */}
                    <div className="hidden w-32 sm:block">
                      {hasTasks ? (
                        <>
                          <div className="flex h-[5px] w-full overflow-hidden rounded-full bg-stage-up2">
                            {tc.done > 0 && <div className="h-full bg-[var(--mint)]" style={{ width: `${(tc.done / tc.total) * 100}%` }} />}
                            {tc.review > 0 && <div className="h-full bg-[var(--sun)]" style={{ width: `${(tc.review / tc.total) * 100}%` }} />}
                            {tc.building > 0 && <div className="h-full bg-[var(--violet)]" style={{ width: `${(tc.building / tc.total) * 100}%` }} />}
                          </div>
                          <p className="mt-1 text-right text-[10px] text-text-dim">{tc.done}/{tc.total} done</p>
                        </>
                      ) : (
                        <p className="text-right text-[10px] text-text-dim">No tasks yet</p>
                      )}
                    </div>

                    {/* Friend avatars */}
                    <div className="hidden items-center gap-2 sm:flex">
                      <div className="flex -space-x-1.5">
                        {project.friends.slice(0, 3).map((f) => (
                          <div
                            key={f.name}
                            className="app-avatar flex h-6 w-6 items-center justify-center text-[9px] ring-2 ring-stage"
                            title={f.name}
                          >
                            {f.initials}
                          </div>
                        ))}
                      </div>
                      {project.friends.length > 3 && (
                        <span className="text-label text-text-ghost">+{project.friends.length - 3}</span>
                      )}
                    </div>

                    {/* Updated ago */}
                    <span className="hidden text-label text-text-ghost lg:block">{project.updatedAgo}</span>
                  </Link>

                  {/* Delete button (visible on hover) */}
                  <button
                    type="button"
                    onClick={() => handleRequestDeleteProject(project)}
                    className="shrink-0 rounded-lg p-1.5 text-text-ghost opacity-0 transition hover:bg-coral/10 hover:text-coral group-hover:opacity-100"
                    title="Delete project"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              );
            })}

            {/* New project row */}
            <button
              type="button"
              onClick={openProjectCreator}
              className="flex w-full items-center gap-4 rounded-xl border border-dashed border-edge px-4 py-4 text-text-dim transition hover:border-text-ghost hover:bg-stage-up hover:text-text-soft"
              style={{ minHeight: "72px" }}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-stage-up2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
              </div>
              <span className="text-body-sm font-medium">Start a new project</span>
            </button>
          </section>

      {/* ═══════════════════ CREATE PROJECT MODAL ═══════════════════ */}
      {showCreator && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowCreator(false)}
            className="absolute inset-0 bg-void/60 backdrop-blur-sm"
          />
          <div className="surface relative w-full max-w-md overflow-hidden shadow-panel">
            <div className="p-6">
              <h3 className="font-display text-display-sm tracking-tight text-text">
                {draftImportMode ? "Import project" : "New project"}
              </h3>
              <p className="mt-1.5 text-body-sm text-text-dim">
                {draftImportMode
                  ? "Point to an existing directory to wrap it as a project."
                  : "Create a local project folder and optionally a matching GitHub repo."}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraftImportMode(false)}
                  className={`rounded-lg px-3 py-1.5 text-label transition ${!draftImportMode ? "bg-text text-void" : "bg-stage-up text-text-dim hover:text-text"}`}
                >
                  New project
                </button>
                <button
                  type="button"
                  onClick={() => setDraftImportMode(true)}
                  className={`rounded-lg px-3 py-1.5 text-label transition ${draftImportMode ? "bg-text text-void" : "bg-stage-up text-text-dim hover:text-text"}`}
                >
                  Import existing
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Project name"
                  className="app-input rounded-xl px-4 py-3 text-body outline-none"
                />
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={2}
                  placeholder="What's it about? (optional)"
                  className="app-input resize-none rounded-xl px-4 py-3 text-body outline-none"
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
                      className="w-full rounded-xl border border-edge bg-stage-up p-4 text-left transition hover:border-text-ghost hover:bg-stage-up2 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-body-sm font-semibold text-text">Select existing directory</p>
                          <p className="mt-1 text-label text-text-dim">
                            {draftImportPath || "Click to choose the project folder to import."}
                          </p>
                        </div>
                        <span className="rounded-lg bg-stage-up2 px-3 py-1.5 text-label text-text-mid">
                          {canPickProjectLocation ? "Browse" : "Desktop only"}
                        </span>
                      </div>
                    </button>
                    <input
                      value={draftImportPath}
                      onChange={(e) => setDraftImportPath(e.target.value)}
                      placeholder="Or paste the full path"
                      className="app-input rounded-xl px-4 py-3 text-body outline-none"
                    />
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleChooseProjectLocation()}
                      disabled={!canPickProjectLocation}
                      className="w-full rounded-xl border border-edge bg-stage-up p-4 text-left transition hover:border-text-ghost hover:bg-stage-up2 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-body-sm font-semibold text-text">Project location</p>
                          <p className="mt-1 text-label text-text-dim">
                            {draftBaseDirectory || defaultProjectRoot || "Click to choose where CodeBuddy should create the project folder."}
                          </p>
                        </div>
                        <span className="rounded-lg bg-stage-up2 px-3 py-1.5 text-label text-text-mid">
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
                        className={`rounded-lg px-3 py-1.5 text-label transition ${draftBaseDirectory === location.path ? "bg-text text-void" : "bg-stage-up text-text-dim hover:text-text"}`}
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
                  className="app-input rounded-xl px-4 py-3 text-body outline-none"
                />
                <p className="text-label text-text-dim">
                  CodeBuddy creates a subfolder using the project name inside this location.
                </p>
                  </>
                )}
                <label className="flex items-center gap-3 rounded-xl border border-edge bg-stage-up px-4 py-3 text-body-sm text-text">
                  <input
                    type="checkbox"
                    checked={draftCreateGithubRepo}
                    onChange={(event) => setDraftCreateGithubRepo(event.target.checked)}
                    className="h-4 w-4 rounded border-edge"
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
                        className={`rounded-lg px-4 py-2 text-body-sm font-medium capitalize transition ${draftGithubVisibility === visibility ? "bg-text text-void" : "bg-stage-up text-text-dim hover:text-text"}`}
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
                    className="btn-ghost px-4 py-2.5 text-body-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={projectLoading}
                    className="btn-primary px-5 py-2.5 text-body-sm"
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
            className="absolute inset-0 bg-void/60 backdrop-blur-sm"
          />
          <div className="surface relative w-full max-w-md overflow-hidden shadow-panel">
            <div className="p-6">
              <h3 className="font-display text-display-sm tracking-tight text-text">
                Add a coding friend
              </h3>
              <p className="mt-1.5 text-body-sm text-text-dim">
                Add someone you build with so you can message them from home.
              </p>
              <div className="mt-5 grid gap-3">
                <input
                  value={draftFriendName}
                  onChange={(e) => setDraftFriendName(e.target.value)}
                  placeholder="Friend name"
                  className="app-input rounded-xl px-4 py-3 text-body outline-none"
                />
                <input
                  value={draftFriendFocus}
                  onChange={(e) => setDraftFriendFocus(e.target.value)}
                  placeholder="What do they help with?"
                  className="app-input rounded-xl px-4 py-3 text-body outline-none"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowFriendCreator(false)}
                    className="btn-ghost px-4 py-2.5 text-body-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateFriend}
                    className="btn-primary px-5 py-2.5 text-body-sm"
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
            className="absolute inset-0 bg-void/60 backdrop-blur-sm"
          />
          <div className="surface relative w-full max-w-md overflow-hidden shadow-panel">
            <div className="p-6">
              {joinInviteError && (
                <div className="mb-4 whitespace-pre-line rounded-xl border border-coral/20 bg-coral/5 px-3 py-2 text-label text-coral">
                  {joinInviteError}
                </div>
              )}

              {/* Step 1: Paste invite code */}
              {joinInviteStep === "paste" && (
                <>
                  <h3 className="font-display text-display-sm tracking-tight text-text">
                    Join a friend&apos;s project
                  </h3>
                  <p className="mt-1.5 text-body-sm text-text-dim">
                    Paste the invite code your friend shared with you.
                  </p>
                  <div className="mt-5 grid gap-3">
                    <textarea
                      value={joinInviteCode}
                      onChange={(e) => setJoinInviteCode(e.target.value)}
                      placeholder="Paste invite code here..."
                      rows={3}
                      className="app-input resize-none rounded-xl px-4 py-3 font-code text-body-sm outline-none"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => { setShowJoinInvite(false); setJoinInviteError(null); setJoinInviteStep("paste"); }}
                        className="btn-ghost px-4 py-2.5 text-body-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDecodeInvite()}
                        disabled={!joinInviteCode.trim()}
                        className="btn-primary px-5 py-2.5 text-body-sm"
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
                  <h3 className="font-display text-display-sm tracking-tight text-text">
                    Set up &ldquo;{joinInviteProjectName}&rdquo;
                  </h3>
                  <p className="mt-1.5 text-body-sm text-text-dim">
                    Choose where to clone the project on your computer.
                  </p>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="mb-1.5 block text-label text-text-ghost">
                        Project
                      </label>
                      <div className="flex items-center gap-2 rounded-xl border border-edge bg-stage-up px-4 py-3">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-dim"><path d="M3.505 2.365A41.369 41.369 0 019 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 00-.577-.069 43.141 43.141 0 00-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 015 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914z" /><path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.147 2.839 2.71 2.935.214.013.428.024.642.034.2.009.385.09.518.224l2.35 2.35a.75.75 0 001.28-.531v-2.07c1.453-.195 2.5-1.463 2.5-2.942V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0014 6z" /></svg>
                        <span className="text-body-sm font-medium text-text">{joinInviteProjectName}</span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-label text-text-ghost">
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
                                className={`rounded-lg px-3 py-1.5 text-label transition ${isActive ? "bg-violet text-white" : "bg-stage-up text-text-dim hover:text-text"}`}
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
                          className="app-input min-w-0 flex-1 rounded-xl px-4 py-3 font-code text-label outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handlePickJoinFolder()}
                          className="btn-ghost shrink-0 rounded-xl px-3 py-3 text-body-sm"
                          title="Browse..."
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" /></svg>
                        </button>
                      </div>
                      {joinInviteFolder.trim() && (
                        <p className="mt-1.5 truncate font-code text-label text-violet">
                          {joinInviteFolder}
                        </p>
                      )}
                      <p className="mt-1 text-label text-text-dim">
                        The repo will be cloned into this folder. A new folder will be created if it doesn&apos;t exist.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setJoinInviteStep("paste"); setJoinInviteError(null); }}
                      className="btn-ghost px-4 py-2.5 text-body-sm"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleJoinInvite()}
                      disabled={joinInviteLoading || !joinInviteFolder.trim()}
                      className="btn-primary px-5 py-2.5 text-body-sm"
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
            className="absolute inset-0 bg-void/60 backdrop-blur-sm"
          />
          <div className="surface relative w-full max-w-md overflow-hidden shadow-panel">
            <div className="p-6">
              <h3 className="font-display text-display-sm tracking-tight text-text">
                Delete {projectPendingDelete.name}?
              </h3>
              <p className="mt-2 text-body-sm leading-relaxed text-text-dim">
                Choose exactly what should be deleted.
              </p>
              {projectPendingDelete.repoPath ? (
                <p className="mt-3 rounded-xl border border-edge bg-stage-up px-4 py-3 font-code text-label text-text-dim">
                  {projectPendingDelete.repoPath}
                </p>
              ) : null}
              <div className="mt-4 grid gap-2">
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
                    description: "Removes the project folder from this computer.",
                    disabled: false,
                  },
                  {
                    id: "github-only",
                    label: "Delete GitHub repo only",
                    description: projectPendingDelete.githubRepoUrl ? "Removes the GitHub repository but keeps the local folder." : "No connected GitHub repo.",
                    disabled: !projectPendingDelete.githubRepoUrl,
                  },
                  {
                    id: "local-and-github",
                    label: "Delete local files and GitHub repo",
                    description: projectPendingDelete.githubRepoUrl ? "Fully removes the local folder and the connected repo." : "Needs a connected GitHub repo.",
                    disabled: !projectPendingDelete.githubRepoUrl,
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDeleteMode(option.id as ProjectDeleteMode)}
                    disabled={option.disabled}
                    className={`rounded-xl border px-4 py-3 text-left transition ${deleteMode === option.id ? "border-coral/30 bg-coral/5" : option.disabled ? "border-edge bg-stage-up text-text-ghost" : "border-edge bg-stage-up hover:border-text-ghost"}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${deleteMode === option.id ? "border-coral bg-coral" : "border-text-ghost"}`}>
                        {deleteMode === option.id ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                      </span>
                      <div>
                        <p className="text-body-sm font-semibold text-text">{option.label}</p>
                        <p className="mt-0.5 text-label text-text-dim">{option.description}</p>
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
                  className="btn-ghost px-4 py-2.5 text-body-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDeleteProject()}
                  disabled={projectDeletingId === projectPendingDelete.id}
                  className="rounded-lg bg-coral px-5 py-2.5 text-body-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
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
