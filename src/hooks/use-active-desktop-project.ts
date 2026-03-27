"use client";

import { useEffect, useState } from "react";

function createDefaultDashboard(systemPromptMarkdown = "", initialPrompt = "") {
  return {
    systemPromptMarkdown,
    initialPrompt,
    lastPlanGeneratedAt: null,
    plan: null,
    conversation: [],
    taskThreads: [],
    activity: [],
    artifacts: [],
    channels: [],
    directMessages: [],
  };
}

type ActiveDesktopProject = {
  id: string;
  name: string;
  description: string;
  stage: "Planning" | "Building" | "Review" | "Live";
  repoPath: string;
  folderName: string;
  githubVisibility: "private" | "public";
  githubRepoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  dashboard: {
    systemPromptMarkdown: string;
    initialPrompt: string;
    lastPlanGeneratedAt: string | null;
    plan: unknown;
    conversation: unknown[];
    taskThreads: unknown[];
    activity: unknown[];
    artifacts: unknown[];
    channels: unknown[];
    directMessages: unknown[];
  };
};

function normalizeActiveProject(project: Partial<ActiveDesktopProject> | null): ActiveDesktopProject | null {
  if (!project || !project.id || !project.name || !project.repoPath || !project.folderName) {
    return null;
  }

  const baseDashboard = createDefaultDashboard(
    project.dashboard?.systemPromptMarkdown || "",
    project.dashboard?.initialPrompt ?? project.description ?? "",
  );

  return {
    id: project.id,
    name: project.name,
    description: project.description ?? "",
    stage: project.stage ?? "Planning",
    repoPath: project.repoPath,
    folderName: project.folderName,
    githubVisibility: project.githubVisibility ?? "private",
    githubRepoUrl: project.githubRepoUrl ?? null,
    createdAt: project.createdAt ?? new Date(0).toISOString(),
    updatedAt: project.updatedAt ?? new Date(0).toISOString(),
    dashboard: {
      ...baseDashboard,
      ...(project.dashboard ?? {}),
      systemPromptMarkdown: project.dashboard?.systemPromptMarkdown || baseDashboard.systemPromptMarkdown,
      initialPrompt: project.dashboard?.initialPrompt ?? baseDashboard.initialPrompt,
      conversation: Array.isArray(project.dashboard?.conversation) ? project.dashboard.conversation : [],
      taskThreads: Array.isArray(project.dashboard?.taskThreads) ? project.dashboard.taskThreads : [],
      activity: Array.isArray(project.dashboard?.activity) ? project.dashboard.activity : [],
      artifacts: Array.isArray(project.dashboard?.artifacts) ? project.dashboard.artifacts : [],
      channels: Array.isArray(project.dashboard?.channels) ? project.dashboard.channels : [],
      directMessages: Array.isArray(project.dashboard?.directMessages) ? project.dashboard.directMessages : [],
    },
  };
}

export function useActiveDesktopProject() {
  const [activeProject, setActiveProject] = useState<ActiveDesktopProject | null>(null);
  const [canUseDesktopProject, setCanUseDesktopProject] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadActiveProject() {
      if (typeof window === "undefined") {
        return;
      }

      const desktopApi = window.electronAPI;
      const canUseDesktop = Boolean(desktopApi?.settings);
      if (isMounted) {
        setCanUseDesktopProject(canUseDesktop);
      }

      if (!desktopApi?.settings) {
        return;
      }

      try {
        const settings = await desktopApi.settings.get();
        const nextActiveProject = normalizeActiveProject(
          settings.projects.find((project) => project.id === settings.activeProjectId) ?? null,
        );

        if (isMounted) {
          setActiveProject(nextActiveProject);
        }
      } catch {
        if (isMounted) {
          setActiveProject(null);
        }
      }
    }

    void loadActiveProject();

    const stopListening = window.electronAPI?.settings?.onChanged((settings) => {
      const nextActiveProject = normalizeActiveProject(
        settings.projects.find((project) => project.id === settings.activeProjectId) ?? null,
      );

      if (isMounted) {
        setActiveProject(nextActiveProject);
      }
    });

    return () => {
      isMounted = false;
      stopListening?.();
    };
  }, []);

  return {
    activeProject,
    canUseDesktopProject,
  };
}