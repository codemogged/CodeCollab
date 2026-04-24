"use client";

import { useEffect, useMemo, useState } from "react";

import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */
function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l4.122 4.12A1.5 1.5 0 0117 7.622V16.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 16.5v-13z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
  );
}

function EmptyBoxIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SoloSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastModel: string | null;
  messages: Array<{
    id: string;
    from: string;
    initials: string;
    text: string;
    time: string;
    isMine?: boolean;
    isAI?: boolean;
    attachments?: string[];
    modelId?: string;
  }>;
}

interface GeneratedFile {
  fileName: string;
  filePath: string;
  sessionTitle: string;
  sessionId: string;
  time: string;
  ext: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getFileColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400", js: "text-yellow-400", jsx: "text-yellow-400",
    py: "text-green-400", rs: "text-orange-400", go: "text-cyan-400", rb: "text-red-400",
    css: "text-pink-400", html: "text-orange-300", json: "text-yellow-300", md: "text-white/60",
    toml: "text-amber-400", yaml: "text-purple-400", yml: "text-purple-400",
    png: "text-emerald-400", jpg: "text-emerald-400", svg: "text-emerald-400",
  };
  return map[ext] ?? "text-white/50";
}

function getFileBadgeColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "bg-blue-500/15 text-blue-400", tsx: "bg-blue-500/15 text-blue-400",
    js: "bg-yellow-500/15 text-yellow-400", jsx: "bg-yellow-500/15 text-yellow-400",
    py: "bg-green-500/15 text-green-400", rs: "bg-orange-500/15 text-orange-400",
    go: "bg-cyan-500/15 text-cyan-400", css: "bg-pink-500/15 text-pink-400",
    html: "bg-orange-500/15 text-orange-300", json: "bg-yellow-500/15 text-yellow-300",
    md: "bg-white/[0.06] text-white/50",
  };
  return map[ext] ?? "bg-white/[0.06] text-white/50";
}

function extractGeneratedFiles(sessions: SoloSession[]): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  // Look for file paths mentioned in AI messages (attachments or code blocks writing files)
  const filePatterns = [
    /(?:Created?|Wrote|Generated|Updated|Modified|Added|Saved)\s+(?:file\s+)?[`'"]*([^\s`'"]+\.\w{1,8})[`'"]*$/gim,
    /(?:Writing|Creating)\s+(?:file\s+)?[`'"]*([^\s`'"]+\.\w{1,8})[`'"]*$/gim,
  ];

  for (const session of sessions) {
    for (const msg of session.messages) {
      // Collect attachments from AI messages
      if (msg.isAI && msg.attachments && msg.attachments.length > 0) {
        for (const attachment of msg.attachments) {
          const name = attachment.split(/[/\\]/).pop() ?? attachment;
          files.push({
            fileName: name,
            filePath: attachment,
            sessionTitle: session.title,
            sessionId: session.id,
            time: msg.time,
            ext: name.split(".").pop()?.toLowerCase() ?? "",
          });
        }
      }
      // Also parse AI message text for file creation patterns
      if (msg.isAI && msg.text) {
        for (const pattern of filePatterns) {
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(msg.text)) !== null) {
            const filePath = match[1];
            const name = filePath.split(/[/\\]/).pop() ?? filePath;
            // Avoid duplicates
            if (!files.some((f) => f.filePath === filePath && f.sessionId === session.id)) {
              files.push({
                fileName: name,
                filePath,
                sessionTitle: session.title,
                sessionId: session.id,
                time: msg.time,
                ext: name.split(".").pop()?.toLowerCase() ?? "",
              });
            }
          }
        }
      }
    }
  }
  return files;
}

function formatRelativeTime(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function DownloadsPage() {
  const { activeProject } = useActiveDesktopProject();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [filterSession, setFilterSession] = useState<string | null>(null);

  const sessions = useMemo(() => {
    if (!activeProject) return [];
    const dash = activeProject.dashboard as Record<string, unknown>;
    const allSessions: SoloSession[] = [];

    // Solo/Freestyle sessions
    if (Array.isArray(dash?.soloSessions)) {
      allSessions.push(...(dash.soloSessions as SoloSession[]));
    }

    // Task thread sessions — convert to SoloSession shape
    if (Array.isArray(dash?.taskThreads)) {
      for (const thread of dash.taskThreads as Array<Record<string, unknown>>) {
        const msgs = Array.isArray(thread.messages) ? (thread.messages as SoloSession["messages"]) : [];
        allSessions.push({
          id: String(thread.id ?? `task-${Date.now()}`),
          title: String(thread.title ?? thread.agentName ?? "Task Thread"),
          createdAt: String(thread.updatedAgo ?? new Date().toISOString()),
          updatedAt: String(thread.updatedAgo ?? new Date().toISOString()),
          lastModel: null,
          messages: msgs,
        });
      }
    }

    // PM Chat conversation — convert to SoloSession shape
    if (Array.isArray(dash?.conversation) && (dash.conversation as Array<Record<string, unknown>>).length > 0) {
      const pmMsgs = (dash.conversation as Array<Record<string, unknown>>).map((m, i) => ({
        id: String(m.id ?? `pm-${i}`),
        from: String(m.from ?? "PM"),
        initials: String(m.initials ?? "PM"),
        text: String(m.text ?? ""),
        time: String(m.time ?? ""),
        isMine: Boolean(m.isMine),
        isAI: Boolean(m.isAI),
        attachments: Array.isArray(m.attachments) ? (m.attachments as string[]) : undefined,
        modelId: m.modelId ? String(m.modelId) : undefined,
      }));
      allSessions.push({
        id: "pm-conversation",
        title: "Project Manager Chat",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastModel: null,
        messages: pmMsgs,
      });
    }

    return allSessions;
  }, [activeProject?.dashboard]);

  const generatedFiles = useMemo(() => extractGeneratedFiles(sessions), [sessions]);

  const filteredFiles = useMemo(() => {
    if (!filterSession) return generatedFiles;
    return generatedFiles.filter((f) => f.sessionId === filterSession);
  }, [generatedFiles, filterSession]);

  // Group by session
  const groupedBySession = useMemo(() => {
    const groups: Record<string, { title: string; files: GeneratedFile[] }> = {};
    for (const file of filteredFiles) {
      if (!groups[file.sessionId]) {
        groups[file.sessionId] = { title: file.sessionTitle, files: [] };
      }
      groups[file.sessionId].files.push(file);
    }
    return Object.entries(groups);
  }, [filteredFiles]);

  const handlePreviewFile = async (file: GeneratedFile) => {
    if (!window.electronAPI?.repo?.readFileContent || !activeProject?.repoPath) return;
    try {
      const sep = window.electronAPI.platform === "win32" ? "\\" : "/";
      // Try absolute path first, then relative to repo
      const fullPath = file.filePath.includes(sep) || file.filePath.includes("/")
        ? (file.filePath.startsWith(activeProject.repoPath) ? file.filePath : `${activeProject.repoPath}${sep}${file.filePath}`)
        : `${activeProject.repoPath}${sep}${file.filePath}`;
      const result = await window.electronAPI.repo.readFileContent(fullPath);
      setPreviewContent(result.content);
      setPreviewName(file.fileName);
    } catch {
      setPreviewContent(`// Could not read file: ${file.filePath}\n// The file may have been moved or deleted.`);
      setPreviewName(file.fileName);
    }
  };

  if (!activeProject) {
    return (
      <div className="flex h-screen text-text">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <EmptyBoxIcon className="mx-auto h-12 w-12 theme-muted opacity-30" />
            <p className="mt-4 text-[15px] font-semibold theme-fg">No project selected</p>
            <p className="mt-2 text-[13px] theme-muted">Open a project to see downloads.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen text-text">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ============ HEADER ============ */}
        <div className="flex-shrink-0 border-b border-edge bg-stage/60 px-6 pt-6 pb-5 backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-display-sm font-bold tracking-tight text-text">Downloads</h1>
              <p className="mt-1 text-body-sm leading-relaxed text-text-dim">
                Files generated by agents during any chat session — Freestyle, PM Chat, and task threads. Your repo files are in the <span className="font-semibold">Files</span> tab.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Session filter */}
              {sessions.length > 0 ? (
                <select
                  value={filterSession ?? ""}
                  onChange={(e) => setFilterSession(e.target.value || null)}
                  className="rounded-lg border border-edge bg-stage px-2.5 py-1.5 text-label font-semibold text-text"
                >
                  <option value="">All sessions</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.title.slice(0, 30)}</option>
                  ))}
                </select>
              ) : null}
              {/* View toggle */}
              <div className="flex overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`px-3 py-1.5 text-[10px] font-semibold transition ${viewMode === "grid" ? "bg-[#111214] text-[#f4efe6] dark:bg-white/[0.12] dark:text-[var(--fg)]" : "bg-white/60 text-ink-muted hover:bg-black/[0.04] dark:bg-transparent dark:text-[var(--muted)] dark:hover:bg-white/[0.06]"}`}
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1.5 text-[10px] font-semibold transition ${viewMode === "list" ? "bg-[#111214] text-[#f4efe6] dark:bg-white/[0.12] dark:text-[var(--fg)]" : "bg-white/60 text-ink-muted hover:bg-black/[0.04] dark:bg-transparent dark:text-[var(--muted)] dark:hover:bg-white/[0.06]"}`}
                >
                  List
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <DownloadIcon className="h-3.5 w-3.5 theme-muted" />
            <span className="text-[11px] font-semibold theme-muted">
              {generatedFiles.length} file{generatedFiles.length !== 1 ? "s" : ""} generated across {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* ============ CONTENT ============ */}
        <div className="min-h-0 flex-1 overflow-y-auto custom-scroll">
          {/* File preview */}
          {previewContent !== null ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 border-b border-black/[0.06] bg-white/40 px-6 py-3 dark:border-white/[0.06] dark:bg-[#161616]/40">
                <DocumentIcon className={`h-4 w-4 ${getFileColor(previewName ?? "")}`} />
                <span className="text-[13px] font-semibold theme-fg">{previewName}</span>
                <button
                  type="button"
                  onClick={() => { setPreviewContent(null); setPreviewName(null); }}
                  className="ml-auto rounded-lg border border-black/[0.06] bg-white/60 px-3 py-1.5 text-[10px] font-semibold theme-muted transition hover:bg-white hover:text-ink dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                >
                  Close Preview
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto bg-[#0d1117] px-6 py-4 font-mono text-[12px] leading-[1.7] text-green-300/80 selection:bg-green-600/30">
                {previewContent}
              </pre>
            </div>
          ) : generatedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <EmptyBoxIcon className="h-16 w-16 theme-muted opacity-20" />
              <p className="mt-5 text-[15px] font-semibold theme-fg">No generated files yet</p>
              <p className="mt-2 max-w-xs text-center text-[13px] leading-relaxed theme-muted">
                Files created or modified by agents during your chat sessions (Freestyle, PM Chat, task threads) will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="px-6 py-5 space-y-8">
              {groupedBySession.map(([sessionId, group]) => (
                <div key={sessionId}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                    <p className="text-[11px] font-semibold theme-fg">{group.title}</p>
                    <span className="text-[10px] theme-muted">{group.files.length} file{group.files.length !== 1 ? "s" : ""}</span>
                  </div>

                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {group.files.map((file, i) => (
                        <button
                          key={`${file.filePath}-${i}`}
                          type="button"
                          onClick={() => void handlePreviewFile(file)}
                          className="app-surface group flex flex-col items-start rounded-xl p-3.5 text-left shadow-[var(--shadow-card)] ring-1 ring-black/[0.06] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:ring-white/[0.08]"
                        >
                          <DocumentIcon className={`h-6 w-6 ${getFileColor(file.fileName)}`} />
                          <span className="mt-2 w-full truncate text-[12px] font-semibold theme-fg">{file.fileName}</span>
                          <span className="mt-0.5 w-full truncate text-[9px] theme-muted">{file.filePath}</span>
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.05em] ${getFileBadgeColor(file.fileName)}`}>
                              {file.ext || "FILE"}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {group.files.map((file, i) => (
                        <button
                          key={`${file.filePath}-${i}`}
                          type="button"
                          onClick={() => void handlePreviewFile(file)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                        >
                          <DocumentIcon className={`h-4 w-4 flex-shrink-0 ${getFileColor(file.fileName)}`} />
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium theme-fg">{file.filePath}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${getFileBadgeColor(file.fileName)}`}>
                            {file.ext || "FILE"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
