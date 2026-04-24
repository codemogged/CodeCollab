"use client";

import { useEffect, useRef, useState } from "react";

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
    soloSessions: [],
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
    soloSessions?: { id: string; title: string; createdAt: string; updatedAt: string; lastModel: string | null; messages: { id: string; from: string; text: string; isAI?: boolean; isMine?: boolean }[] }[];
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
      soloSessions: Array.isArray(project.dashboard?.soloSessions) ? project.dashboard.soloSessions : [],
    },
  };
}

export function useActiveDesktopProject() {
  const [activeProject, setActiveProject] = useState<ActiveDesktopProject | null>(null);
  const [canUseDesktopProject, setCanUseDesktopProject] = useState(false);
  // Lightweight signature so we can drop settings:changed events whose payload
  // is structurally identical to what we already applied. We only hash fields
  // the workspace page actually re-renders from — the heavy dashboard arrays
  // (conversation / activity / taskThreads / soloSessions) can be multiple MB
  // and stringifying them on every change is itself the freeze.
  const lastKeyRef = useRef<string>("");
  // Coalesce bursty settings:changed events so a flood (P2P presence ticks,
  // file-watcher events, plan saves) doesn't cause a re-render per event.
  const pendingRef = useRef<ActiveDesktopProject | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    const makeKey = (p: ActiveDesktopProject | null) => {
      if (!p) return "";
      // Fields the workspace actually depends on. The dashboard.plan is small
      // (subprojects + tasks — typically <50KB). Everything else in dashboard
      // is NOT used on the workspace render path, so we deliberately ignore it.
      try {
        return [
          p.id,
          p.name,
          p.description,
          p.stage,
          p.repoPath,
          p.folderName,
          p.githubVisibility,
          p.githubRepoUrl ?? "",
          p.updatedAt,
          JSON.stringify(p.dashboard.plan ?? null),
          (p.dashboard.taskThreads?.length ?? 0),
        ].join("|");
      } catch {
        return String(Math.random());
      }
    };

    const commit = () => {
      flushTimerRef.current = null;
      if (!isMounted) return;
      const next = pendingRef.current;
      pendingRef.current = null;
      const key = makeKey(next);
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      setActiveProject(next);
    };

    const applyProject = (next: ActiveDesktopProject | null) => {
      if (!isMounted) return;
      // Fast path: compute the cheap signature up front and bail without
      // scheduling anything if nothing relevant changed.
      const key = makeKey(next);
      if (key === lastKeyRef.current && pendingRef.current === null) return;
      pendingRef.current = next;
      if (flushTimerRef.current) return; // coalesce — a flush is already queued
      flushTimerRef.current = setTimeout(commit, 50);
    };

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
        // Apply the initial value synchronously so the first paint has data.
        const key = makeKey(nextActiveProject);
        lastKeyRef.current = key;
        if (isMounted) setActiveProject(nextActiveProject);
      } catch {
        if (isMounted) setActiveProject(null);
      }
    }

    void loadActiveProject();

    const stopListening = window.electronAPI?.settings?.onChanged((settings) => {
      const nextActiveProject = normalizeActiveProject(
        settings.projects.find((project) => project.id === settings.activeProjectId) ?? null,
      );
      applyProject(nextActiveProject);
    });

    return () => {
      isMounted = false;
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      stopListening?.();
    };
  }, []);

  return {
    activeProject,
    canUseDesktopProject,
  };
}