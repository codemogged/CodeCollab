"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ProjectSidebar from "@/components/project-sidebar";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */
function CodeBracketIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  );
}

function PaperClipIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.621 4.379a3 3 0 00-4.242 0l-7.07 7.07a5 5 0 007.07 7.07l4.243-4.242" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z" />
      <path d="M3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l4.122 4.12A1.5 1.5 0 0117 7.622V16.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 16.5v-13z" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M3.25 3A2.25 2.25 0 001 5.25v9.5A2.25 2.25 0 003.25 17h13.5A2.25 2.25 0 0019 14.75v-9.5A2.25 2.25 0 0016.75 3H3.25zM2.5 5.25a.75.75 0 01.75-.75h13.5a.75.75 0 01.75.75v9.5a.75.75 0 01-.75.75H3.25a.75.75 0 01-.75-.75v-9.5zM5 8a.75.75 0 01.53-.22.75.75 0 01.53.22l2 2a.75.75 0 010 1.06l-2 2a.75.75 0 11-1.06-1.06L6.44 10.5 4.97 9.03A.75.75 0 015 8zm4.5 3.75a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z" clipRule="evenodd" />
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
    checkpointId?: string | null;
  }>;
}

interface FileTreeEntry {
  name: string;
  path: string;
  type: "directory" | "file";
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function renderMessageText(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3);
      const firstNewline = inner.indexOf("\n");
      const lang = firstNewline > 0 ? inner.slice(0, firstNewline).trim() : "";
      const code = firstNewline > 0 ? inner.slice(firstNewline + 1) : inner;
      return (
        <div key={i} className="my-3 overflow-hidden rounded-xl bg-[#0d1117] ring-1 ring-white/[0.06]">
          {lang ? (
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#161b22] px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{lang}</span>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(code); } catch { /* */ } }} className="text-[10px] font-medium text-white/30 transition hover:text-white/60">Copy</button>
            </div>
          ) : null}
          <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-[1.7] text-green-300/90 selection:bg-green-600/30"><code>{code}</code></pre>
        </div>
      );
    }
    const inlined = part.split(/(`[^`]+`)/g);
    return (
      <span key={i}>
        {inlined.map((seg, j) =>
          seg.startsWith("`") && seg.endsWith("`") ? (
            <code key={j} className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-mono text-[12px] dark:bg-white/[0.08]">{seg.slice(1, -1)}</code>
          ) : (
            <span key={j} className="whitespace-pre-wrap">{seg}</span>
          )
        )}
      </span>
    );
  });
}

function getFileExtensionColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400", js: "text-yellow-400", jsx: "text-yellow-400",
    py: "text-green-400", rs: "text-orange-400", go: "text-cyan-400", rb: "text-red-400",
    css: "text-pink-400", html: "text-orange-300", json: "text-yellow-300", md: "text-white/60",
    toml: "text-amber-400", yaml: "text-purple-400", yml: "text-purple-400",
  };
  return map[ext] ?? "text-white/50";
}

function getMonacoLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", rb: "ruby",
    css: "css", scss: "scss", less: "less",
    html: "html", htm: "html", xml: "xml", svg: "xml",
    json: "json", md: "markdown", mdx: "markdown",
    toml: "toml", yaml: "yaml", yml: "yaml",
    sh: "shell", bash: "shell", zsh: "shell",
    sql: "sql", graphql: "graphql", gql: "graphql",
    dockerfile: "dockerfile", makefile: "makefile",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    java: "java", kt: "kotlin", swift: "swift",
    php: "php", r: "r", lua: "lua",
  };
  return map[ext] ?? "plaintext";
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function SoloChatPage() {
  const { activeProject } = useActiveDesktopProject();

  /* --- state --- */
  const [sessions, setSessions] = useState<SoloSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [composerText, setComposerText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [otherAgentActive, setOtherAgentActive] = useState<{ scope?: string; taskName?: string } | null>(null);
  const [streamingOutput, setStreamingOutput] = useState("");
  const [selectedModel, setSelectedModel] = useState("auto");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showSessionManager, setShowSessionManager] = useState(false);

  // Right panel
  const [rightPanel, setRightPanel] = useState<"files" | "terminal" | "changes" | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [fileTree, setFileTree] = useState<FileTreeEntry[]>([]);
  const [fileTreePath, setFileTreePath] = useState<string[]>([]);
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalCommand, setTerminalCommand] = useState("");
  const [terminalProcessId, setTerminalProcessId] = useState<string | null>(null);
  const terminalProcessIdRef = useRef<string | null>(null);
  const terminalOutputRef = useRef<HTMLPreElement | null>(null);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const conversationRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const [modelSearch, setModelSearch] = useState("");
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; bottom: number } | null>(null);

  // Context panel state
  const [showContextPanel, setShowContextPanel] = useState(false);
  const contextPanelRef = useRef<HTMLDivElement | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful coding assistant. You have full access to the project files and can read, write, and modify code. Always explain your reasoning and provide clear, working solutions.");
  const [editingContext, setEditingContext] = useState(false);
  const [editedContext, setEditedContext] = useState("");

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Chat mode
  const [chatMode, setChatMode] = useState<"agent" | "ask" | "plan">("agent");

  // Diff view state
  const [diffFile, setDiffFile] = useState<string | null>(null);

  type ModelCatalogEntry = {
    id: string;
    label: string;
    provider: string;
    contextWindow: string;
    maxTokens: number;
    usage: string;
    group: "featured" | "other";
    warning?: string;
  };

  const modelCatalog: ModelCatalogEntry[] = useMemo(() => [
    { id: "auto", label: "Auto", provider: "Best available", contextWindow: "Auto", maxTokens: 200000, usage: "10% discount", group: "featured" },
    { id: "claude-opus-4.6", label: "Claude Opus 4.6", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "3x", group: "featured" },
    { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "featured" },
    { id: "gpt-5.4", label: "GPT-5.4", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "featured" },
    { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "0.33x", group: "other" },
    { id: "claude-opus-4.5", label: "Claude Opus 4.5", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "3x", group: "other" },
    { id: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "other" },
    { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "other" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", contextWindow: "1M", maxTokens: 1000000, usage: "1x", group: "other" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", provider: "Google", contextWindow: "1M", maxTokens: 1000000, usage: "0.33x", group: "other" },
    { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)", provider: "Google", contextWindow: "1M", maxTokens: 1000000, usage: "1x", group: "other", warning: "Preview model" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", provider: "Google", contextWindow: "1M", maxTokens: 1000000, usage: "1x", group: "other", warning: "Preview model" },
    { id: "gpt-5.2", label: "GPT-5.2", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "other" },
    { id: "gpt-5.1", label: "GPT-5.1", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "other" },
    { id: "o3", label: "o3", provider: "OpenAI", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "other" },
  ], []);

  const selectedModelMeta = useMemo(
    () => modelCatalog.find((m) => m.id === selectedModel) ?? modelCatalog[0],
    [selectedModel, modelCatalog]
  );

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return modelCatalog;
    const q = modelSearch.toLowerCase();
    return modelCatalog.filter((m) => m.label.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));
  }, [modelSearch, modelCatalog]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  /* --- sync sessions from project state --- */
  useEffect(() => {
    if (!activeProject) return;
    const dash = activeProject.dashboard as Record<string, unknown>;
    const stored = Array.isArray(dash?.soloSessions) ? (dash.soloSessions as SoloSession[]) : [];
    setSessions(stored);
    // If we have stored sessions but no open tabs, open the latest one
    if (stored.length > 0 && openTabIds.length === 0) {
      const latestId = stored[stored.length - 1].id;
      setOpenTabIds([latestId]);
      setActiveSessionId(latestId);
    }
  }, [activeProject?.dashboard]);

  /* --- auto-scroll chat --- */
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [activeSession?.messages, streamingOutput]);

  /* --- auto-scroll terminal --- */
  useEffect(() => {
    if (terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  /* --- streaming listener --- */
  useEffect(() => {
    if (!window.electronAPI?.project) return;
    const stopOutput = window.electronAPI.project.onAgentOutput((event) => {
      if (event.scope !== "solo-chat") return;
      const chunk = event.chunk ?? "";
      if (chunk) setStreamingOutput((prev) => prev + chunk);
    });
    return () => stopOutput();
  }, []);

  /* --- P2P Peer Activity State --- */
  const [peerStreams, setPeerStreams] = useState<Record<string, { peerName: string; conversationId: string; scope: string; tokens: string; updatedAt: number; taskId?: string | null; taskName?: string | null; sessionId?: string | null; sessionTitle?: string | null }>>({});
  const peerStreamTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const peerIsActive = Object.keys(peerStreams).length > 0;
  const inputBlocked = isGenerating || peerIsActive || Boolean(otherAgentActive);

  /* --- P2P Peer stream listeners --- */
  useEffect(() => {
    if (!window.electronAPI?.p2p) return;

    const stopChatToken = window.electronAPI.p2p.onChatToken((event: { projectId?: string; peerId?: string; peerName?: string; conversationId?: string; token?: string; scope?: string; taskId?: string; taskName?: string; sessionId?: string; sessionTitle?: string }) => {
      if (event.projectId && event.projectId !== activeProject?.id) return;
      const peerId = event.peerId || "unknown";
      setPeerStreams((prev) => {
        const existing = prev[peerId];
        return {
          ...prev,
          [peerId]: {
            peerName: event.peerName || "Peer",
            conversationId: event.conversationId || "unknown",
            scope: event.scope || "unknown",
            tokens: ((existing?.tokens || "") + (event.token || "")).slice(-4000),
            updatedAt: Date.now(),
            taskId: event.taskId || existing?.taskId || null,
            taskName: event.taskName || existing?.taskName || null,
            sessionId: event.sessionId || existing?.sessionId || null,
            sessionTitle: event.sessionTitle || existing?.sessionTitle || null,
          },
        };
      });
      if (peerStreamTimeoutsRef.current[peerId]) clearTimeout(peerStreamTimeoutsRef.current[peerId]);
      peerStreamTimeoutsRef.current[peerId] = setTimeout(() => {
        setPeerStreams((prev) => { const next = { ...prev }; delete next[peerId]; return next; });
        delete peerStreamTimeoutsRef.current[peerId];
      }, 30000);
    });

    const stopChatMessage = window.electronAPI.p2p.onChatMessage((event: { projectId?: string; peerId?: string }) => {
      if (event.projectId && event.projectId !== activeProject?.id) return;
      const peerId = event.peerId || "unknown";
      setPeerStreams((prev) => { const next = { ...prev }; delete next[peerId]; return next; });
    });

    const stopPeerLeft = window.electronAPI.p2p.onPeerLeft((event: { projectId?: string; peerId?: string }) => {
      if (event.projectId && event.projectId !== activeProject?.id) return;
      const peerId = event.peerId || "unknown";
      setPeerStreams((prev) => {
        if (!prev[peerId]) return prev;
        if (Date.now() - prev[peerId].updatedAt > 30000) {
          const next = { ...prev }; delete next[peerId]; return next;
        }
        return prev;
      });
    });

    // Restore accumulated peer streams from main process (for reconnect after navigation)
    (async () => {
      try {
        const streams = await (window as /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ any).electronAPI?.p2p?.getActivePeerStreams?.({ projectId: activeProject?.id });
        if (streams && Object.keys(streams).length > 0) {
          setPeerStreams((prev: Record<string, { peerName: string; conversationId: string; scope: string; tokens: string; updatedAt: number; taskId?: string | null; taskName?: string | null; sessionId?: string | null; sessionTitle?: string | null }>) => {
            const merged = { ...prev };
            for (const [peerId, acc] of Object.entries(streams) as [string, { peerName: string; conversationId: string; scope: string; tokens: string; updatedAt: number; taskId?: string | null; taskName?: string | null; sessionId?: string | null; sessionTitle?: string | null }][]) {
              if (!merged[peerId]) {
                merged[peerId] = { ...acc };
              }
            }
            return merged;
          });
        }
      } catch { /* ignore */ }
    })();

    return () => {
      stopChatToken(); stopChatMessage(); stopPeerLeft();
      for (const t of Object.values(peerStreamTimeoutsRef.current)) clearTimeout(t);
      peerStreamTimeoutsRef.current = {};
    };
  }, []);

  /* --- Reconnect to active solo-chat on mount, or detect other-scope agent --- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const req = await window.electronAPI?.project?.getActiveRequest?.();
        if (cancelled || !req?.active) {
          setOtherAgentActive(null);
          return;
        }
        if (req.scope === "solo-chat") {
          setIsGenerating(true);
          setOtherAgentActive(null);
          if (req.output) setStreamingOutput(req.output);
        } else {
          // Another agent (task or PM) is running — block freestyle input
          setOtherAgentActive({ scope: req.scope, taskName: req.taskName });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* --- Listen for agent completion to clear otherAgentActive blocking --- */
  useEffect(() => {
    if (!window.electronAPI?.project) return;
    const clearOtherAgent = () => {
      setOtherAgentActive(null);
    };
    const stopCompleted = window.electronAPI.project.onAgentCompleted?.(clearOtherAgent);
    const stopError = window.electronAPI.project.onAgentError?.(clearOtherAgent);
    const stopCancelled = window.electronAPI.project.onAgentCancelled?.(clearOtherAgent);
    return () => {
      stopCompleted?.();
      stopError?.();
      stopCancelled?.();
    };
  }, []);

  /* --- model menu dismiss on click outside --- */
  useEffect(() => {
    if (!showModelMenu) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node) &&
          modelButtonRef.current && !modelButtonRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
        setModelSearch("");
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showModelMenu]);

  /* --- context panel dismiss on click outside --- */
  useEffect(() => {
    if (!showContextPanel) return;
    const handler = (e: MouseEvent) => {
      if (contextPanelRef.current && !contextPanelRef.current.contains(e.target as Node)) {
        setShowContextPanel(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showContextPanel]);

  /* --- terminal process listeners --- */
  useEffect(() => {
    if (!window.electronAPI?.process) return;
    const stopStarted = window.electronAPI.process.onStarted((event) => {
      if (event.processId && event.processId === terminalProcessIdRef.current) {
        setTerminalOutput((prev) => prev + `\n> Process started\n`);
      }
    });
    const stopOutput = window.electronAPI.process.onOutput((event) => {
      if (event.processId === terminalProcessIdRef.current) {
        setTerminalOutput((prev) => (prev + (event.chunk || "")).slice(-20000));
      }
    });
    const stopCompleted = window.electronAPI.process.onCompleted((event) => {
      if (event.processId === terminalProcessIdRef.current) {
        setTerminalOutput((prev) => prev + `\n[Process exited with code ${event.exitCode ?? 0}]\n`);
        terminalProcessIdRef.current = null;
        setTerminalProcessId(null);
      }
    });
    const stopError = window.electronAPI.process.onError((event) => {
      if (event.processId === terminalProcessIdRef.current) {
        setTerminalOutput((prev) => prev + `\nERROR: ${event.message ?? "Unknown error"}\n`);
        terminalProcessIdRef.current = null;
        setTerminalProcessId(null);
      }
    });
    return () => { stopStarted(); stopOutput(); stopCompleted(); stopError(); };
  }, []);

  /* --- load file tree when panel opens --- */
  useEffect(() => {
    if (rightPanel === "files" && activeProject?.repoPath && fileTree.length === 0) {
      void loadFileTree(activeProject.repoPath);
    }
  }, [rightPanel, activeProject?.repoPath]);

  /* --- drag resize handler --- */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      setRightPanelWidth(Math.max(260, Math.min(newWidth, containerRect.width * 0.7)));
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  /* --- handlers --- */
  const loadFileTree = async (dirPath: string) => {
    if (!window.electronAPI?.repo?.listDirectory) return;
    try {
      const entries = await window.electronAPI.repo.listDirectory(dirPath);
      const sorted = [...entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setFileTree(sorted);
    } catch { /* */ }
  };

  const handleNavigateDir = async (entry: FileTreeEntry) => {
    if (entry.type === "directory") {
      setFileTreePath((prev) => [...prev, entry.name]);
      void loadFileTree(entry.path);
      setActiveFileContent(null);
      setActiveFileName(null);
    } else {
      if (!window.electronAPI?.repo?.readFileContent) return;
      try {
        const result = await window.electronAPI.repo.readFileContent(entry.path);
        setActiveFileContent(result.content);
        setActiveFileName(entry.name);
      } catch { /* */ }
    }
  };

  const handleNavigateUp = () => {
    if (fileTreePath.length === 0 || !activeProject?.repoPath) return;
    const newPath = fileTreePath.slice(0, -1);
    setFileTreePath(newPath);
    const sep = window.electronAPI?.platform === "win32" ? "\\" : "/";
    const targetDir = newPath.length > 0
      ? `${activeProject.repoPath}${sep}${newPath.join(sep)}`
      : activeProject.repoPath;
    void loadFileTree(targetDir);
    setActiveFileContent(null);
    setActiveFileName(null);
  };

  const handleOpenChangedFile = async (filePath: string) => {
    if (!activeProject?.repoPath) return;
    const sep = window.electronAPI?.platform === "win32" ? "\\" : "/";
    const fullPath = `${activeProject.repoPath}${sep}${filePath.replace(/\//g, sep)}`;
    const fileName = filePath.split("/").pop() ?? filePath;
    try {
      if (window.electronAPI?.repo?.readFileContent) {
        const result = await window.electronAPI.repo.readFileContent(fullPath);
        setActiveFileContent(result.content);
        setActiveFileName(fileName);
        setDiffFile(filePath);
        setRightPanel("files");
        showToast(`Viewing changes in ${fileName}`);
      }
    } catch {
      showToast(`Could not open ${fileName}`);
    }
  };

  const handleNewSession = () => {
    const id = `solo-${Date.now()}`;
    const session: SoloSession = {
      id,
      title: "New Session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastModel: null,
      messages: [],
    };
    setSessions((prev) => [...prev, session]);
    setOpenTabIds((prev) => [...prev, id]);
    setActiveSessionId(id);
    setComposerText("");
    setStreamingOutput("");
  };

  const handleCloseTab = (sessionId: string) => {
    setOpenTabIds((prev) => {
      const next = prev.filter((id) => id !== sessionId);
      // If we closed the active tab, switch to the last remaining or null
      if (activeSessionId === sessionId) {
        setActiveSessionId(next.length > 0 ? next[next.length - 1] : null);
      }
      return next;
    });
  };

  const handleOpenSession = (sessionId: string) => {
    if (!openTabIds.includes(sessionId)) {
      setOpenTabIds((prev) => [...prev, sessionId]);
    }
    setActiveSessionId(sessionId);
    setShowSessionManager(false);
  };

  const handleSendMessage = async () => {
    if (!composerText.trim() || inputBlocked || !activeProject) return;

    const prompt = composerText.trim();
    setComposerText("");
    setIsGenerating(true);
    setStreamingOutput("");

    let sid = activeSessionId;
    if (!sid) {
      sid = `solo-${Date.now()}`;
      const newSession: SoloSession = {
        id: sid,
        title: prompt.slice(0, 60),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastModel: null,
        messages: [],
      };
      setSessions((prev) => [...prev, newSession]);
      setOpenTabIds((prev) => [...prev, sid!]);
      setActiveSessionId(sid);
    }

    const userMsg = {
      id: `solo-user-${Date.now()}`,
      from: "Cameron",
      initials: "CM",
      text: prompt,
      time: "Now",
      isMine: true as const,
    };
    setSessions((prev) =>
      prev.map((s) => s.id === sid ? { ...s, messages: [...s.messages, userMsg] } : s)
    );

    try {
      if (window.electronAPI?.project?.sendSoloMessage) {
        await window.electronAPI.project.sendSoloMessage({
          projectId: activeProject.id,
          sessionId: sid,
          prompt,
          model: selectedModel !== "auto" ? selectedModel : undefined,
        });
      }
    } catch (err) {
      const errorMsg = {
        id: `solo-err-${Date.now()}`,
        from: "System",
        initials: "!",
        text: `Error: ${err instanceof Error ? err.message : "Something went wrong."}`,
        time: "Now",
        isAI: true as const,
      };
      setSessions((prev) =>
        prev.map((s) => s.id === sid ? { ...s, messages: [...s.messages, errorMsg] } : s)
      );
    } finally {
      setIsGenerating(false);
      setStreamingOutput("");
    }
  };

  const handleOpenInVSCode = async () => {
    if (!activeProject?.repoPath || !window.electronAPI?.process) return;
    try {
      await window.electronAPI.process.run({ command: `code "${activeProject.repoPath}"`, cwd: activeProject.repoPath });
    } catch { /* */ }
  };

  const handleRunTerminalCommand = async () => {
    if (!terminalCommand.trim() || !activeProject?.repoPath || !window.electronAPI?.process) return;
    const cmd = terminalCommand.trim();
    setTerminalCommand("");
    setTerminalOutput((prev) => `${prev}$ ${cmd}\n`);
    try {
      const result = await window.electronAPI.process.run({ command: cmd, cwd: activeProject.repoPath, options: { env: { FORCE_COLOR: "0" } } });
      terminalProcessIdRef.current = result.processId;
      setTerminalProcessId(result.processId);
    } catch (err) {
      setTerminalOutput((prev) => `${prev}Error: ${err instanceof Error ? err.message : "Command failed"}\n`);
    }
  };

  const handleStopTerminalProcess = async () => {
    const pid = terminalProcessIdRef.current;
    if (pid && window.electronAPI?.process?.cancel) {
      try { await window.electronAPI.process.cancel(pid); } catch { /* */ }
    }
    terminalProcessIdRef.current = null;
    setTerminalProcessId(null);
  };

  const startDrag = () => {
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  if (!activeProject) {
    return (
      <div className="flex h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
        <ProjectSidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <CodeBracketIcon className="mx-auto h-12 w-12 theme-muted opacity-30" />
            <p className="mt-4 text-[15px] font-semibold theme-fg">No project selected</p>
            <p className="mt-2 text-[13px] theme-muted">Open a project to start coding.</p>
          </div>
        </div>
      </div>
    );
  }

  const showRightPanel = rightPanel !== null;
  const openTabs = openTabIds.map((id) => sessions.find((s) => s.id === id)).filter(Boolean) as SoloSession[];

  return (
    <div className="flex h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div ref={containerRef} className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ============ TOP BAR ============ */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/60 px-3 py-2 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#161616]/80">
          {/* Session tabs with close buttons */}
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {openTabs.map((session) => (
              <div
                key={session.id}
                className={`group flex flex-shrink-0 items-center gap-1 rounded-lg pl-3 pr-1 py-1.5 transition ${
                  session.id === activeSessionId
                    ? "bg-[#111214] text-[#f4efe6] shadow-[0_4px_12px_rgba(17,18,20,0.15)] dark:bg-white/[0.12] dark:text-[var(--fg)]"
                    : "text-ink-muted/70 hover:bg-black/[0.04] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.06]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveSessionId(session.id)}
                  className="truncate text-[11px] font-semibold"
                >
                  {session.title.slice(0, 24)}{session.title.length > 24 ? "…" : ""}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCloseTab(session.id); }}
                  title="Close tab"
                  className={`flex h-5 w-5 items-center justify-center rounded transition ${
                    session.id === activeSessionId
                      ? "text-white/40 hover:bg-white/10 hover:text-white/80"
                      : "text-ink-muted/30 opacity-0 group-hover:opacity-100 hover:bg-black/[0.06] hover:text-ink-muted dark:text-[var(--muted)] dark:hover:bg-white/[0.08]"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleNewSession}
              title="New session"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted/50 transition hover:bg-black/[0.04] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.06]"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Session manager toggle */}
          <button
            type="button"
            onClick={() => setShowSessionManager(!showSessionManager)}
            title="Manage sessions"
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition ${
              showSessionManager
                ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
                : "border-black/[0.06] bg-white/80 text-ink-muted hover:border-black/[0.12] hover:text-ink dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-[var(--muted)]"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
            </svg>
            Sessions
          </button>

          {/* Action buttons */}
          <button
            type="button"
            onClick={() => { setRightPanel(rightPanel === "files" ? null : "files"); setActiveFileContent(null); setActiveFileName(null); }}
            title="File explorer"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${rightPanel === "files" ? "bg-black/[0.06] text-ink dark:bg-white/[0.1] dark:text-[var(--fg)]" : "text-ink-muted/60 hover:bg-black/[0.04] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.06]"}`}
          >
            <FolderIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRightPanel(rightPanel === "terminal" ? null : "terminal")}
            title="Terminal"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${rightPanel === "terminal" ? "bg-black/[0.06] text-ink dark:bg-white/[0.1] dark:text-[var(--fg)]" : "text-ink-muted/60 hover:bg-black/[0.04] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.06]"}`}
          >
            <TerminalIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRightPanel(rightPanel === "changes" ? null : "changes")}
            title="Code changes"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${rightPanel === "changes" ? "bg-black/[0.06] text-ink dark:bg-white/[0.1] dark:text-[var(--fg)]" : "text-ink-muted/60 hover:bg-black/[0.04] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.06]"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M2.5 4A1.5 1.5 0 004 5.5H7.879a1.5 1.5 0 001.06-.44l1.122-1.12A1.5 1.5 0 0111.121 3.5H16A1.5 1.5 0 0117.5 5v1.5a.75.75 0 01-1.5 0V5H11.121l-1.122 1.12A3 3 0 017.879 7H4v8h4.75a.75.75 0 010 1.5H4A1.5 1.5 0 012.5 15V4z" />
              <path d="M12.22 9.47a.75.75 0 011.06 0l2.5 2.5a.75.75 0 010 1.06l-2.5 2.5a.75.75 0 11-1.06-1.06l1.22-1.22H9.75a.75.75 0 010-1.5h3.69l-1.22-1.22a.75.75 0 010-1.06z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleOpenInVSCode}
            title="Open in VS Code"
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-white/80 px-2.5 py-1.5 text-[10px] font-semibold text-ink-muted transition hover:border-black/[0.12] hover:text-ink dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-[var(--muted)] dark:hover:border-white/[0.14]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
            </svg>
            VS Code
          </button>
        </div>

        {/* ============ MAIN CONTENT ============ */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ---------- SESSION MANAGER PANEL ---------- */}
          {showSessionManager ? (
            <div className="flex w-[240px] flex-shrink-0 flex-col border-r border-black/[0.06] bg-white/40 dark:border-white/[0.08] dark:bg-[#141414]/40">
              <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-3 dark:border-white/[0.08]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">All Sessions</p>
                <button type="button" onClick={handleNewSession} className="flex h-6 w-6 items-center justify-center rounded-lg text-ink-muted/50 transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto custom-scroll py-1">
                {sessions.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[11px] theme-muted opacity-60">No sessions yet</p>
                ) : (
                  sessions.slice().reverse().map((s) => {
                    const isOpen = openTabIds.includes(s.id);
                    const isActive = s.id === activeSessionId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleOpenSession(s.id)}
                        className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition ${
                          isActive
                            ? "bg-black/[0.05] dark:bg-white/[0.08]"
                            : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isOpen ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> : <span className="h-1.5 w-1.5 rounded-full bg-black/10 dark:bg-white/10" />}
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold theme-fg">{s.title}</span>
                        </div>
                        <div className="flex items-center gap-2 pl-3.5">
                          <span className="text-[10px] theme-muted">{s.messages.length} messages</span>
                          <span className="text-[10px] theme-muted opacity-60">·</span>
                          <span className="text-[10px] theme-muted">{formatSessionTime(s.updatedAt)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {/* ---------- LEFT: CHAT ---------- */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Messages */}
            <div ref={conversationRef} className="min-h-0 flex-1 overflow-y-auto custom-scroll px-5 py-6">
              {!activeSession || activeSession.messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 ring-1 ring-violet-500/20">
                    <CodeBracketIcon className="h-8 w-8 text-violet-400/80" />
                  </div>
                  <h2 className="mt-5 text-[18px] font-semibold tracking-tight theme-fg">Start freestyle coding</h2>
                  <p className="mt-2 max-w-sm text-center text-[13px] leading-relaxed theme-muted">
                    Describe what you want to build or any changes you need. The coding agent has full access to your project files.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {["Set up the project", "Fix a bug", "Add a new feature", "Refactor code", "Write tests"].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setComposerText(suggestion)}
                        className="rounded-full border border-black/[0.06] bg-white/80 px-3.5 py-2 text-[11px] font-medium text-ink-muted transition hover:border-black/[0.12] hover:bg-white hover:text-ink dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[var(--muted)] dark:hover:bg-white/[0.08]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-5">
                  {activeSession.messages.map((msg) => (
                    <div key={msg.id} className="flex gap-3">
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        msg.isMine
                          ? "bg-ink text-cream dark:bg-white dark:text-[#141414]"
                          : "bg-gradient-to-br from-violet-500 to-blue-500 text-white"
                      }`}>
                        {msg.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold theme-fg">{msg.from}</span>
                          <span className="text-[10px] theme-muted">{msg.time}</span>
                          {msg.modelId ? <span className="rounded-full bg-black/[0.04] px-1.5 py-0.5 text-[9px] font-medium theme-muted dark:bg-white/[0.06]">{msg.modelId}</span> : null}
                        </div>
                        <div className="mt-1.5 text-[13.5px] leading-[1.7] theme-fg">
                          {renderMessageText(msg.text)}
                        </div>
                        {msg.attachments && msg.attachments.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {msg.attachments.map((file, i) => (
                              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-medium theme-muted dark:bg-white/[0.06]">
                                <PaperClipIcon className="h-3 w-3" />
                                {file.split(/[/\\]/).pop()}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {msg.isAI ? (
                          <div className="mt-2.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => showToast("Checkpoint restored — workspace rolled back to this point")}
                              className="inline-flex items-center gap-1 rounded-lg border border-black/[0.06] bg-black/[0.02] px-2.5 py-1.5 text-[10px] font-semibold theme-muted transition hover:border-violet-500/30 hover:bg-violet-500/5 hover:text-violet-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-violet-500/30"
                              title="Restore the project state to this checkpoint"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.397a.75.75 0 00-.75.75v3.834a.75.75 0 001.5 0v-2.108l.28.28a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-3.624-8.858a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311H8.505a.75.75 0 000 1.5h3.834a.75.75 0 00.75-.75V.855a.75.75 0 00-1.5 0v2.108l-.28-.28a6.97 6.97 0 00-.621-.517z" clipRule="evenodd" />
                              </svg>
                              Restore checkpoint
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {/* P2P Peer Live Stream */}
                  {Object.entries(peerStreams).map(([peerId, stream]) => {
                    const isSoloChatStream = stream.scope === "solo-chat";
                    const matchesSession = isSoloChatStream && stream.sessionId && stream.sessionId === activeSessionId;

                    if (!isSoloChatStream) {
                      // Non-freestyle stream: show "Agent running in X" banner
                      const label = stream.scope === "task-agent"
                        ? `${stream.taskName || "a task"} chat`
                        : stream.scope === "project-manager"
                          ? "PM Chat"
                          : stream.scope;
                      const href = stream.scope === "task-agent" && stream.taskId
                        ? `/project/chat?task=${encodeURIComponent(stream.taskId)}`
                        : "/project/chat";
                      return (
                        <div key={peerId} className="flex items-center gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600/20 text-[10px] font-bold text-cyan-500">
                            {(stream.peerName || "P").slice(0, 2).toUpperCase()}
                          </div>
                          <a href={href} className="group flex items-center gap-2 rounded-full bg-cyan-500/8 px-3.5 py-2 ring-1 ring-cyan-500/15 transition hover:bg-cyan-500/14 hover:ring-cyan-500/25">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                            </span>
                            <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">{stream.peerName} — Agent running in {label}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-cyan-500/50 transition group-hover:text-cyan-500">
                              <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                            </svg>
                          </a>
                        </div>
                      );
                    }

                    if (isSoloChatStream && !matchesSession && stream.sessionId) {
                      // Different freestyle session — show banner
                      return (
                        <div key={peerId} className="flex items-center gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600/20 text-[10px] font-bold text-cyan-500">
                            {(stream.peerName || "P").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex items-center gap-2 rounded-full bg-cyan-500/8 px-3.5 py-2 ring-1 ring-cyan-500/15">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                            </span>
                            <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">{stream.peerName} — Agent running in {stream.sessionTitle || "Freestyle"}</span>
                          </div>
                        </div>
                      );
                    }

                    // Matching solo-chat session or no session filter — show full peer stream
                    return (
                      <div key={peerId} className="flex gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">
                          {(stream.peerName || "P").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-semibold theme-fg">{stream.peerName}</span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-400">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                              </span>
                              AI responding
                            </span>
                          </div>
                          <div className="mt-1.5 app-surface overflow-hidden rounded-[1.2rem] shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                            <pre className="custom-scroll max-h-[280px] min-h-[60px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.72] theme-soft whitespace-pre-wrap">
                              {stream.tokens.slice(-4000) || <span className="theme-muted italic">Waiting for response...</span>}
                            </pre>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Streaming indicator */}
                  {isGenerating ? (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-[11px] font-bold text-white">✦</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold theme-fg">Coding Agent</span>
                          <span className="animate-pulse text-[10px] text-violet-500">Thinking...</span>
                        </div>
                        {streamingOutput ? (
                          <div className="mt-1.5 text-[13.5px] leading-[1.7] theme-fg">{renderMessageText(streamingOutput)}</div>
                        ) : (
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400/60 [animation-delay:0ms]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400/60 [animation-delay:150ms]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400/60 [animation-delay:300ms]" />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Composer — model selector is inside here now */}
            <div className="flex-shrink-0 border-t border-black/[0.06] bg-white/40 px-5 py-4 backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#161616]/60">
              <div className="mx-auto max-w-3xl">
                {/* Context panel — above composer like PM Chat */}
                {showContextPanel ? (
                  <div ref={contextPanelRef} className="app-surface mb-3 overflow-hidden rounded-[1.3rem] shadow-[0_18px_42px_rgba(18,14,10,0.12)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.28)]">
                    <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold theme-fg">Context</p>
                        <p className="truncate text-[10px] theme-muted">System prompt for coding agent</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowContextPanel(false)}
                        className="app-control-rail rounded-full p-1.5 transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </div>
                    <div className="grid gap-3 px-4 py-3 text-[11px]">
                      <div className="rounded-[1rem] bg-black/[0.03] px-3 py-3 dark:bg-white/[0.04]">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold theme-fg">System Prompt</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] theme-muted">{selectedModelMeta.contextWindow} context</p>
                            {!editingContext ? (
                              <button
                                type="button"
                                onClick={() => { setEditingContext(true); setEditedContext(systemPrompt); }}
                                className="rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-400 transition hover:bg-violet-500/20"
                              >
                                Edit
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingContext(false)}
                                  className="rounded-lg bg-black/[0.04] px-2 py-1 text-[10px] font-semibold theme-muted transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setSystemPrompt(editedContext); setEditingContext(false); }}
                                  className="rounded-lg bg-[#0078d4] px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-[#006cbf]"
                                >
                                  Save
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {editingContext ? (
                          <textarea
                            value={editedContext}
                            onChange={(e) => setEditedContext(e.target.value)}
                            className="custom-scroll w-full min-h-[140px] max-h-[280px] resize-y overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/[0.03] p-2 font-mono text-[10.5px] leading-6 theme-soft outline-none ring-1 ring-violet-500/30 focus:ring-violet-500/50 dark:bg-white/[0.03]"
                          />
                        ) : (
                          <pre className="custom-scroll max-h-[140px] overflow-y-auto whitespace-pre-wrap text-[10.5px] leading-6 theme-soft">{systemPrompt}</pre>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="app-surface flex flex-col rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:ring-white/[0.08] dark:shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                  <textarea
                    ref={composerRef}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder={otherAgentActive ? `Agent running in ${otherAgentActive.taskName || otherAgentActive.scope || "another chat"}...` : peerIsActive ? "Waiting for peer's agent to finish..." : "Ask the coding agent anything..."}
                    rows={3}
                    disabled={inputBlocked}
                    className="w-full resize-none bg-transparent px-4 pt-3 text-[14px] leading-relaxed theme-fg outline-none placeholder:text-ink-muted/40 disabled:opacity-50 dark:placeholder:text-[var(--muted)]"
                  />
                  <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                    <div className="flex items-center gap-1.5">
                      <button type="button" title="Attach file" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted/50 transition hover:bg-black/[0.04] hover:text-ink dark:text-[var(--muted)] dark:hover:bg-white/[0.06]">
                        <PaperClipIcon className="h-4 w-4" />
                      </button>

                      {/* Context button */}
                      <button
                        type="button"
                        onClick={() => { setShowContextPanel(!showContextPanel); setShowModelMenu(false); }}
                        className="app-control-rail group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 theme-muted group-hover:theme-fg">
                          <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" />
                        </svg>
                        <span className="theme-fg">Context</span>
                      </button>

                      {/* Mode toggle — Agent / Ask / Plan */}
                      <div className="inline-flex items-center rounded-full bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                        {(["agent", "ask", "plan"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setChatMode(mode)}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize transition ${chatMode === mode ? "bg-white text-ink shadow-sm dark:bg-[#2a2a2a] dark:text-[var(--fg)]" : "text-ink-muted/60 hover:text-ink dark:text-[var(--muted)] dark:hover:text-[var(--fg)]"}`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>

                      {/* Model selector — inside composer */}
                      <div ref={modelMenuRef} className="relative">
                        <button
                          ref={modelButtonRef}
                          type="button"
                          onClick={() => {
                            if (!showModelMenu && modelButtonRef.current) {
                              const rect = modelButtonRef.current.getBoundingClientRect();
                              setModelMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 6 });
                            }
                            setShowModelMenu(!showModelMenu);
                            setModelSearch("");
                            setShowContextPanel(false);
                          }}
                          className="app-control-rail inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold theme-fg transition"
                        >
                          <span>{selectedModelMeta.label}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 transition ${showModelMenu ? "rotate-180" : ""}`}>
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSendMessage()}
                      disabled={!composerText.trim() || inputBlocked}
                      className="flex h-8 items-center gap-1.5 rounded-full bg-[#111214] px-4 text-[11px] font-semibold text-[#f4efe6] shadow-[0_6px_16px_rgba(17,18,20,0.14)] transition hover:-translate-y-[0.5px] hover:bg-[#0b1220] hover:shadow-[0_8px_20px_rgba(17,18,20,0.2)] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none dark:bg-white dark:text-[#111214] dark:shadow-none dark:hover:bg-white/90"
                    >
                      <SendIcon className="h-3.5 w-3.5" />
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- DRAG HANDLE ---------- */}
          {showRightPanel ? (
            <div
              onMouseDown={startDrag}
              className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center bg-black/[0.04] transition hover:bg-violet-500/20 active:bg-violet-500/30 dark:bg-white/[0.06] dark:hover:bg-violet-500/20"
            >
              <div className="h-8 w-0.5 rounded-full bg-black/[0.15] dark:bg-white/[0.15]" />
            </div>
          ) : null}

          {/* ---------- RIGHT PANEL ---------- */}
          {showRightPanel ? (
            <div
              className="flex flex-shrink-0 flex-col border-l border-black/[0.06] bg-white/30 dark:border-white/[0.08] dark:bg-[#141414]/60"
              style={{ width: rightPanelWidth }}
            >
              {rightPanel === "files" ? (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {/* File tree — always visible (VS Code style) */}
                  <div className={`flex flex-col overflow-hidden border-r border-black/[0.06] dark:border-white/[0.06] ${activeFileContent !== null ? "w-[200px] flex-shrink-0" : "flex-1"}`}>
                    <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2.5 dark:border-white/[0.08]">
                      <FolderIcon className="h-3.5 w-3.5 theme-muted" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Explorer</p>
                      {fileTreePath.length > 0 ? (
                        <button type="button" onClick={handleNavigateUp} className="ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-medium theme-muted transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">← Back</button>
                      ) : null}
                    </div>
                    {fileTreePath.length > 0 ? (
                      <div className="border-b border-black/[0.04] px-3 py-1 dark:border-white/[0.04]">
                        <p className="truncate text-[9px] font-medium theme-muted opacity-50">{fileTreePath.join(" / ")}</p>
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-y-auto custom-scroll py-0.5">
                      {fileTree.map((entry) => (
                        <button
                          key={entry.path}
                          type="button"
                          onClick={() => void handleNavigateDir(entry)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04] ${
                            entry.name === activeFileName && entry.type === "file" ? "bg-black/[0.05] dark:bg-white/[0.08]" : ""
                          }`}
                        >
                          {entry.type === "directory" ? (
                            <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-amber-500/70" />
                          ) : (
                            <DocumentIcon className={`h-3.5 w-3.5 flex-shrink-0 ${getFileExtensionColor(entry.name)}`} />
                          )}
                          <span className="min-w-0 truncate text-[11px] font-medium theme-fg">{entry.name}</span>
                          {entry.type === "directory" ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="ml-auto h-2.5 w-2.5 flex-shrink-0 theme-muted opacity-30">
                              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                            </svg>
                          ) : null}
                        </button>
                      ))}
                      {fileTree.length === 0 ? (
                        <p className="px-3 py-8 text-center text-[11px] theme-muted opacity-50">No files</p>
                      ) : null}
                    </div>
                  </div>

                  {/* File content viewer — opens beside tree (VS Code style) */}
                  {activeFileContent !== null ? (
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-black/[0.06] bg-black/[0.02] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
                        <DocumentIcon className={`h-3.5 w-3.5 ${getFileExtensionColor(activeFileName ?? "")}`} />
                        <span className="min-w-0 truncate text-[11px] font-semibold theme-fg">{activeFileName}</span>
                        {diffFile ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-500">
                            Modified
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => { setActiveFileContent(null); setActiveFileName(null); setDiffFile(null); }}
                          className="ml-auto flex h-5 w-5 items-center justify-center rounded theme-muted transition hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>
                      </div>
                      <pre className="min-h-0 flex-1 overflow-auto bg-[#0d1117] font-mono text-[11px] leading-[1.7] selection:bg-blue-600/30">
                        <MonacoEditor
                          height="100%"
                          language={getMonacoLanguage(activeFileName ?? "")}
                          value={activeFileContent}
                          theme="vs-dark"
                          onChange={(value) => setActiveFileContent(value ?? "")}
                          onMount={(editor) => {
                            if (diffFile) {
                              // Simulate diff: highlight some lines as added (green gutter)
                              const lineCount = editor.getModel()?.getLineCount() ?? 0;
                              const addedLines: number[] = [];
                              // Mark ~15% of lines as "changed" for visual effect
                              for (let i = 1; i <= lineCount; i++) {
                                if (i % 7 === 0 || i % 11 === 0) addedLines.push(i);
                              }
                              editor.createDecorationsCollection(
                                addedLines.map((ln) => ({
                                  range: { startLineNumber: ln, startColumn: 1, endLineNumber: ln, endColumn: 1 },
                                  options: {
                                    isWholeLine: true,
                                    className: "diff-added-line",
                                    glyphMarginClassName: "diff-added-glyph",
                                    overviewRuler: { color: "#34d399", position: 1 },
                                  },
                                }))
                              );
                            }
                          }}
                          options={{
                            fontSize: 12,
                            lineHeight: 20,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            padding: { top: 12, bottom: 12 },
                            renderLineHighlight: "gutter",
                            wordWrap: "on",
                            lineNumbers: "on",
                            glyphMargin: Boolean(diffFile),
                            folding: true,
                            automaticLayout: true,
                            tabSize: 2,
                            bracketPairColorization: { enabled: true },
                          }}
                        />
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : rightPanel === "terminal" ? (
                <>
                  <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#161b22] px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
                    </div>
                    <div className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/60">{activeProject.repoPath}</div>
                    {terminalProcessId ? (
                      <button type="button" onClick={() => void handleStopTerminalProcess()} className="rounded-full bg-red-500/20 px-2.5 py-1 text-[10px] font-semibold text-red-400 transition hover:bg-red-500/30">Stop</button>
                    ) : null}
                    <button type="button" onClick={() => setTerminalOutput("")} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/50 transition hover:bg-white/[0.1] hover:text-white/70">Clear</button>
                  </div>
                  <pre ref={terminalOutputRef} className="min-h-0 flex-1 overflow-auto bg-[#0d1117] px-4 py-3 font-mono text-[12px] leading-[1.65] text-green-300/90 selection:bg-green-600/30">
                    {terminalOutput || "Run commands in your project directory.\nType a command below and press Enter.\n\n"}
                  </pre>
                  <div className="flex items-center gap-2 border-t border-white/[0.06] bg-[#161b22] px-4 py-2.5">
                    <span className="text-[12px] font-bold text-green-400/70">$</span>
                    <input
                      value={terminalCommand}
                      onChange={(e) => setTerminalCommand(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleRunTerminalCommand(); } }}
                      placeholder="Enter a command..."
                      className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-white/90 outline-none placeholder:text-white/25"
                    />
                  </div>
                </>
              ) : rightPanel === "changes" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2.5 dark:border-white/[0.08]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 theme-muted">
                      <path d="M2.5 4A1.5 1.5 0 004 5.5H7.879a1.5 1.5 0 001.06-.44l1.122-1.12A1.5 1.5 0 0111.121 3.5H16A1.5 1.5 0 0117.5 5v1.5a.75.75 0 01-1.5 0V5H11.121l-1.122 1.12A3 3 0 017.879 7H4v8h4.75a.75.75 0 010 1.5H4A1.5 1.5 0 012.5 15V4z" />
                      <path d="M12.22 9.47a.75.75 0 011.06 0l2.5 2.5a.75.75 0 010 1.06l-2.5 2.5a.75.75 0 11-1.06-1.06l1.22-1.22H9.75a.75.75 0 010-1.5h3.69l-1.22-1.22a.75.75 0 010-1.06z" />
                    </svg>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Changes</p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto custom-scroll">
                    {/* Mock diff entries */}
                    {[
                      { file: "src/app/page.tsx", additions: 12, deletions: 3, status: "modified" as const },
                      { file: "src/components/navbar.tsx", additions: 28, deletions: 0, status: "added" as const },
                      { file: "src/lib/utils.ts", additions: 5, deletions: 8, status: "modified" as const },
                    ].map((change) => (
                      <div
                        key={change.file}
                        className="flex items-center gap-3 border-b border-black/[0.04] px-3 py-3 transition cursor-pointer hover:bg-black/[0.02] dark:border-white/[0.04] dark:hover:bg-white/[0.02]"
                        onClick={() => void handleOpenChangedFile(change.file)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleOpenChangedFile(change.file); }}
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${change.status === "added" ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>
                          {change.status === "added" ? "A" : "M"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium theme-fg">{change.file}</p>
                          <p className="text-[10px] theme-muted">
                            <span className="text-emerald-500">+{change.additions}</span>
                            {change.deletions > 0 ? <span className="ml-1.5 text-red-400">−{change.deletions}</span> : null}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => showToast("Changes accepted")} className="rounded-md bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-500 transition hover:bg-emerald-500/20" title="Accept changes">Keep</button>
                          <button type="button" onClick={() => showToast("Changes reverted")} className="rounded-md bg-red-500/10 px-2 py-1 text-[9px] font-semibold text-red-400 transition hover:bg-red-500/20" title="Revert changes">Undo</button>
                        </div>
                      </div>
                    ))}
                    <div className="px-3 py-6 text-center">
                      <p className="text-[11px] theme-muted">3 files changed since last push</p>
                      <button type="button" onClick={() => showToast("All changes accepted")} className="mt-3 rounded-xl bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold text-emerald-500 transition hover:bg-emerald-500/20">
                        Accept all changes
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Fixed-position model picker overlay — renders outside any overflow:hidden container */}
      {showModelMenu && modelMenuPos ? (
        <div
          ref={modelMenuRef}
          className="fixed z-[9999] max-h-[420px] w-[300px] overflow-hidden rounded-[1.2rem] border border-black/[0.08] bg-[rgba(255,255,255,0.98)] shadow-[0_20px_44px_rgba(0,0,0,0.14)] backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1e1f25]/98 dark:shadow-[0_20px_44px_rgba(0,0,0,0.4)]"
          style={{ left: modelMenuPos.left, bottom: modelMenuPos.bottom }}
        >
          <div className="flex items-center gap-2 border-b border-black/[0.06] px-2.5 py-2 dark:border-white/[0.08]">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 theme-muted">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder="Search models"
              autoFocus
              className="w-full bg-transparent text-[12px] theme-fg outline-none placeholder:theme-muted"
            />
          </div>
          <div className="custom-scroll max-h-[370px] overflow-y-auto py-1">
            {(["featured", "other"] as const).map((group) => {
              const groupModels = filteredModels.filter((entry) => entry.group === group);
              if (groupModels.length === 0) return null;
              return (
                <div key={group} className="mb-0.5 last:mb-0">
                  <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted">
                    {group === "featured" ? "Recommended" : "Other models"}
                  </p>
                  {groupModels.map((entry) => {
                    const isSelected = entry.id === selectedModel;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => { setSelectedModel(entry.id); setShowModelMenu(false); setModelSearch(""); }}
                        className={`flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition ${isSelected ? "bg-[#0078d4] text-white" : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11.5px] font-medium">{entry.label}</span>
                            {entry.warning ? <span className={`text-[10px] ${isSelected ? "text-white/70" : "theme-muted"}`}>{entry.warning}</span> : null}
                          </div>
                          <div className={`mt-0.5 flex items-center gap-2 text-[10px] ${isSelected ? "text-white/72" : "theme-muted"}`}>
                            <span>{entry.provider}</span>
                            <span>{entry.contextWindow}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`text-[10px] font-medium ${isSelected ? "text-white/70" : "theme-muted"}`}>{entry.usage}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Toast notification */}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[9999] flex justify-center">
          <div className="pointer-events-auto animate-in slide-in-from-bottom-4 rounded-2xl bg-[#111214] px-5 py-3 text-[13px] font-medium text-white shadow-[0_16px_40px_rgba(0,0,0,0.25)] ring-1 ring-white/[0.08]">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
