"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ideas, projectBuildPlans, taskConversationThreads, type BuildTaskStatus } from "@/lib/mock-data";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

const threadStatusStyles: Record<BuildTaskStatus, string> = {
  planned: "bg-stone-500/10 text-stone-600 dark:bg-stone-400/12 dark:text-stone-200/80",
  building: "bg-violet-500/12 text-violet-700 dark:bg-violet-400/14 dark:text-violet-200/90",
  review: "bg-amber-500/14 text-amber-700 dark:bg-amber-400/16 dark:text-amber-200/90",
  done: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-200/90",
};

const navItems = [
  {
    href: "/project",
    label: "Workspace",
    exact: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M2.75 5A2.25 2.25 0 015 2.75h2.586c.597 0 1.169.237 1.591.659l.914.914c.14.14.33.22.53.22H15A2.25 2.25 0 0117.25 6.75v6.5A2.25 2.25 0 0115 15.5H5a2.25 2.25 0 01-2.25-2.25V5zm2.25-.75a.75.75 0 00-.75.75v.25h10.75v-.25A.75.75 0 0014.25 4h-3.629a2.25 2.25 0 01-1.591-.659l-.914-.914A.75.75 0 007.586 2.5H5zm10.75 2.5H4.25v6.5c0 .414.336.75.75.75h10c.414 0 .75-.336.75-.75v-6.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/chat",
    label: "PM Chat",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/code",
    label: "Freestyle",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06zM11.377 2.011a.75.75 0 01.612.867l-2.5 14.5a.75.75 0 01-1.478-.255l2.5-14.5a.75.75 0 01.866-.612z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/files",
    label: "Files",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
      </svg>
    ),
  },
  {
    href: "/project/artifacts",
    label: "Downloads",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
      </svg>
    ),
  },
  {
    href: "/project/preview",
    label: "Preview",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM3.5 4.25a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75V7.5h-13V4.25zm0 4.75h13v6.75a.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75V9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/activity",
    label: "Activity",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/project/docs",
    label: "Documentation",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.999 8.999 0 00-4.25 1.065v12.755zM9.25 4.065A8.999 8.999 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
      </svg>
    ),
  },
  {
    href: "/project/settings",
    label: "Project settings",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
      </svg>
    ),
  },
];

function ProjectSidebarContent({ defaultCollapsed = false }: { defaultCollapsed?: boolean } = {}) {
  const { activeProject } = useActiveDesktopProject();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.settings) {
      window.electronAPI.settings.get().then((s) => {
        const settings = s as unknown as Record<string, unknown>;
        if (settings.displayName) setDisplayName(settings.displayName as string);
      }).catch(() => {});
    }
  }, []);
  const userInitials = displayName ? displayName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") : "";
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const matchedMockIdea = activeProject
    ? ideas.find((idea) => idea.name.toLowerCase() === activeProject.name.toLowerCase()) ?? null
    : null;
  const matchedPlan = matchedMockIdea
    ? projectBuildPlans.find((plan) => plan.projectId === matchedMockIdea.id) ?? null
    : null;
  const shouldUseMockChats = !activeProject || Boolean(matchedPlan);
  const visibleThreads = shouldUseMockChats ? taskConversationThreads : [];
  const activeTaskId = searchParams.get("task") ?? searchParams.get("ask");
  const activeThreadId = searchParams.get("thread");
  const activeThread = visibleThreads.find((thread) => thread.id === activeThreadId) ?? null;
  const getTaskMeta = (taskId: string) => {
    if (!shouldUseMockChats) {
      return { title: "Task", status: "planned" as BuildTaskStatus };
    }

    for (const plan of projectBuildPlans) {
      for (const subproject of plan.subprojects) {
        const task = subproject.tasks.find((entry) => entry.id === taskId);
        if (task) {
          return { title: task.title, status: task.status };
        }
      }
    }

    return { title: "Task", status: "planned" as BuildTaskStatus };
  };
  const chatTree = Object.values(
    visibleThreads.reduce<Record<string, {
      subprojectId: string;
      subprojectTitle: string;
      tasks: Record<string, { taskId: string; taskTitle: string; threads: typeof visibleThreads }>;
    }>>((groups, thread) => {
      if (!groups[thread.subprojectId]) {
        groups[thread.subprojectId] = {
          subprojectId: thread.subprojectId,
          subprojectTitle: thread.subprojectTitle,
          tasks: {},
        };
      }

      if (!groups[thread.subprojectId].tasks[thread.taskId]) {
        const taskMeta = getTaskMeta(thread.taskId);
        groups[thread.subprojectId].tasks[thread.taskId] = {
          taskId: thread.taskId,
          taskTitle: taskMeta.title,
          threads: [],
        };
      }

      groups[thread.subprojectId].tasks[thread.taskId].threads.push(thread);
      return groups;
    }, {})
  ).map((group) => ({
    ...group,
    tasks: Object.values(group.tasks),
  }));
  const [expandedSubprojectId, setExpandedSubprojectId] = useState<string | null>(() => {
    return activeThread?.subprojectId ?? null;
  });
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(activeTaskId);

  useEffect(() => {
    if (activeThread?.subprojectId) {
      setExpandedSubprojectId(activeThread.subprojectId);
    }

    if (activeTaskId) {
      setExpandedTaskId(activeTaskId);
    }
  }, [activeTaskId, activeThread?.subprojectId]);

  useEffect(() => {
    if (!showScrollIndicator) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowScrollIndicator(false);
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, [showScrollIndicator]);

  const handleSidebarScroll = () => {
    setShowScrollIndicator(true);
  };

  return (
    <>
      <div className={`hidden shrink-0 transition-[width] duration-200 ease-out lg:block ${collapsed ? "w-16" : "w-[220px]"}`} aria-hidden="true" />
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-black/[0.06] bg-white/60 backdrop-blur-xl transition-[width] duration-200 ease-out lg:flex dark:border-white/[0.08] dark:bg-[#161616]/80 ${collapsed ? "w-16" : "w-[220px]"}`}>
        <div className={`flex h-[5.6rem] items-end pb-4 ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
          <Link href="/home" className={`display-font flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-ink dark:text-[var(--fg)] ${collapsed ? "justify-center" : ""}`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-[10px] font-bold text-cream dark:bg-white dark:text-[#141414]">cb</span>
            {!collapsed && "CodeBuddy"}
          </Link>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted/50 transition hover:bg-black/[0.04] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.06] dark:hover:text-[var(--fg)]"
              title="Collapse sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {collapsed && (
          <div className="flex justify-center px-2 pb-2">
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted/50 transition hover:bg-black/[0.04] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.06] dark:hover:text-[var(--fg)]"
              title="Expand sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        <div
          onScroll={handleSidebarScroll}
          className={`auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 ${showScrollIndicator ? "scrollbar-visible" : ""}`}
        >
          <nav className={`space-y-1 pt-2 ${collapsed ? "px-2" : "px-3"}`}>
            {navItems.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-xl text-[13px] transition ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"} ${
                    active
                      ? "bg-black/[0.04] font-semibold text-ink dark:bg-white/[0.08] dark:text-[var(--fg)]"
                      : "font-medium text-ink-muted hover:bg-black/[0.03] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.04] dark:hover:text-[var(--fg)]"
                  }`}
                >
                  <span className={active ? "text-ink-muted" : ""}>{item.icon}</span>
                  {!collapsed && item.label}
                </Link>
              );
            })}

            <div className="!mt-4 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
              <Link
                href="/home"
                title={collapsed ? "All Projects" : undefined}
                className={`flex items-center rounded-xl text-[13px] font-medium text-ink-muted transition hover:bg-black/[0.03] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.04] dark:hover:text-[var(--fg)] ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                </svg>
                {!collapsed && "All Projects"}
              </Link>

              {!collapsed && chatTree.length > 0 && (
                <div className="mt-3 space-y-1 px-1">
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted/55 dark:text-[var(--muted)]">
                    Your chats
                  </p>
                  {chatTree.map((group) => {
                    const subprojectOpen = expandedSubprojectId === group.subprojectId;

                    return (
                      <div key={group.subprojectId} className="space-y-1 pt-2 first:pt-0">
                        <button
                          type="button"
                          onClick={() => setExpandedSubprojectId((current) => {
                            const nextValue = current === group.subprojectId ? null : group.subprojectId;
                            if (nextValue !== group.subprojectId) {
                              setExpandedTaskId(null);
                            }
                            return nextValue;
                          })}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${subprojectOpen ? "bg-black/[0.04] text-ink dark:bg-white/[0.06] dark:text-[var(--fg)]" : "text-ink-muted hover:bg-black/[0.03] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.04] dark:hover:text-[var(--fg)]"}`}
                        >
                          <div>
                            <p className="text-[12px] font-semibold leading-[1.3]">{group.subprojectTitle}</p>
                            <p className="mt-1 text-[10px] opacity-60">{group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}</p>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition ${subprojectOpen ? "rotate-90" : ""}`}>
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                        </button>

                        {subprojectOpen && (
                          <div className="space-y-1 pl-2">
                            {group.tasks.map((taskGroup) => {
                              const taskOpen = expandedTaskId === taskGroup.taskId;

                              return (
                                <div key={taskGroup.taskId} className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedTaskId((current) => current === taskGroup.taskId ? null : taskGroup.taskId)}
                                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${taskOpen ? "bg-black/[0.035] text-ink dark:bg-white/[0.05] dark:text-[var(--fg)]" : "text-ink-muted/85 hover:bg-black/[0.025] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.04] dark:hover:text-[var(--fg)]"}`}
                                  >
                                    <span className="pr-2 text-[11px] font-medium leading-[1.35]">{taskGroup.taskTitle}</span>
                                    <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] dark:bg-white/[0.06]">
                                      {taskGroup.threads.length}
                                    </span>
                                  </button>

                                  {taskOpen && (
                                    <div className="space-y-1 pl-2">
                                      {taskGroup.threads.map((thread) => {
                                        const isActiveChat = pathname === "/project/chat" && activeThreadId === thread.id;
                                        const taskStatus = getTaskMeta(thread.taskId).status;

                                        return (
                                          <Link
                                            key={thread.id}
                                            href={`/project/chat?task=${encodeURIComponent(thread.taskId)}&thread=${encodeURIComponent(thread.id)}`}
                                            className={`block rounded-xl px-3 py-2 transition ${isActiveChat ? "bg-black/[0.05] dark:bg-white/[0.07]" : "hover:bg-black/[0.025] dark:hover:bg-white/[0.04]"}`}
                                          >
                                            <p className="line-clamp-2 text-[11px] font-medium leading-[1.35] text-ink dark:text-[var(--fg)]">{thread.title}</p>
                                            <div className="mt-1 flex items-center gap-1.5">
                                              <span className={`rounded-full px-1.5 py-[2px] text-[8px] font-semibold uppercase tracking-[0.16em] ${threadStatusStyles[taskStatus]}`}>
                                                {taskStatus}
                                              </span>
                                              <span className="text-[9px] uppercase tracking-[0.12em] text-ink-muted/55 dark:text-[var(--muted)]">{thread.updatedAgo}</span>
                                            </div>
                                          </Link>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>

        <div className={`border-t border-black/[0.06] py-4 dark:border-white/[0.08] ${collapsed ? "flex justify-center px-2" : "px-4"}`}>
          <Link href="/settings" className={`flex items-center rounded-xl transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04] ${collapsed ? "justify-center px-2 py-2" : "gap-3 px-2 py-2"}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-cream dark:bg-white dark:text-[#141414]">{userInitials || "CB"}</div>
            {!collapsed && (
              <div>
                <p className="text-[12px] font-semibold text-ink dark:text-[var(--fg)]">{displayName || "User"}</p>
                <p className="text-[10px] text-ink-muted/60 dark:text-[var(--muted)]">Owner</p>
              </div>
            )}
          </Link>
        </div>
      </aside>
    </>
  );
}

export default function ProjectSidebar({ defaultCollapsed = false }: { defaultCollapsed?: boolean } = {}) {
  return (
    <Suspense fallback={null}>
      <ProjectSidebarContent defaultCollapsed={defaultCollapsed} />
    </Suspense>
  );
}
