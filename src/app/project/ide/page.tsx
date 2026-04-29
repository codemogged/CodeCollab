"use client";

/**
 * IDE Page — VS Code-style editor with integrated AI chat, file explorer, and terminal.
 *
 * TESTING GUIDE:
 * 1. File Explorer: Open a project → sidebar should list repo files. Click to open in editor.
 * 2. Monaco Editor: Verify syntax highlighting, Ctrl+S save, and modified-tab indicator (dot).
 * 3. AI Chat (real routing): Send a message → should stream via Electron sendSoloMessage API.
 *    - Fallback: Without Electron, a simulated response appears.
 *    - Model picker: Click model in status bar → dropdown should render in both light/dark mode.
 * 4. Session sharing: ?sessionId=<id> in URL loads a solo session from project dashboard.
 *    - Session list dropdown in chat header shows all saved sessions.
 *    - Starting a new session clears sessionId from URL.
 * 5. Terminal toggle: Ctrl+T should toggle terminal even when Monaco editor has focus.
 * 6. Keyboard shortcuts: Ctrl+B (sidebar), Ctrl+S (save) — all work inside Monaco.
 * 7. Panel resize: Drag sidebar and chat panel edges to resize.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";
import ActivityStream from "@/components/activity-stream-v2";
import RunSummaryCard from "@/components/run-summary-card";
import PromptCard from "@/components/prompt-card";
import { useStreamEvents } from "@/hooks/use-stream-events";
import { nowTimestamp } from "@/lib/format-time";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

/* --─ Types --─ */

type FileEntry = { name: string; path: string; type: "directory" | "file" };
type TerminalTab = "terminal" | "output" | "problems";

type OpenTab = {
  path: string;
  name: string;
  modified: boolean;
};

type ChatMessage = {
  id: string;
  from: "user" | "copilot";
  text: string;
  time?: string;
  codeBlock?: { file: string; code: string };
  streaming?: boolean;
};

/* --─ Helpers --─ */

function getFileTypeIndicator(name: string): { label: string; color: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts": case "tsx": return { label: "TS", color: "#5b9ef0" };
    case "js": case "jsx": return { label: "JS", color: "#d4a830" };
    case "py": return { label: "PY", color: "#34b87a" };
    case "css": case "scss": return { label: "CS", color: "#8a6aed" };
    case "html": return { label: "HT", color: "#e06060" };
    case "json": return { label: "{ }", color: "#c89e30" };
    case "md": return { label: "MD", color: "#9090a0" };
    case "yml": case "yaml": return { label: "YM", color: "#d06060" };
    default: return { label: "", color: "#808090" };
  }
}

function getMonacoLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
    json: "json", md: "markdown", css: "css", scss: "scss", html: "html",
    py: "python", yml: "yaml", yaml: "yaml", xml: "xml", sh: "shell",
    env: "plaintext", txt: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

function getLanguageLabel(filePath: string | null): string {
  if (!filePath) return "Plain Text";
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript React", js: "JavaScript", jsx: "JavaScript React",
    json: "JSON", md: "Markdown", css: "CSS", scss: "SCSS", html: "HTML",
    py: "Python", yml: "YAML", yaml: "YAML",
  };
  return map[ext] ?? "Plain Text";
}

function getBreadcrumb(filePath: string, repoPath: string | null): string[] {
  if (!repoPath || !filePath) return [filePath];
  const norm = (p: string) => p.replace(/\\/g, "/");
  const rel = norm(filePath).replace(norm(repoPath) + "/", "");
  return rel.split("/");
}

/* --─ Model Catalog Types --─ */

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

type FeatureFlags = { githubCopilotCli?: boolean; claudeCode?: boolean; codexCli?: boolean };
type CatalogSources = { copilot: ModelCatalogEntry[]; claude: ModelCatalogEntry[]; codex: ModelCatalogEntry[] };

const DEFAULT_copilotModels: ModelCatalogEntry[] = [
  { id: "auto", label: "Auto", provider: "Best available", contextWindow: "Auto", maxTokens: 200000, usage: "10% discount", group: "featured" },
  { id: "claude-sonnet-4.7", label: "Claude Sonnet 4.7", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "featured" },
  { id: "claude-opus-4.7", label: "Claude Opus 4.7", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "3x", group: "featured" },
  { id: "gpt-5.5", label: "GPT-5.5", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "featured" },
  { id: "gpt-5.5-codex-medium", label: "GPT-5.5 Codex (Reasoning: Medium)", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "featured" },
];
const DEFAULT_claudeModels: ModelCatalogEntry[] = [
  { id: "sonnet", label: "Claude Sonnet (Latest)", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "", group: "featured" },
  { id: "opus", label: "Claude Opus (Latest)", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "", group: "featured" },
  { id: "haiku", label: "Claude Haiku (Latest)", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "", group: "featured" },
];
const DEFAULT_codexModels: ModelCatalogEntry[] = [
  { id: "default", label: "GPT-5.5 Codex (Latest)", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "", group: "featured" },
];

function getActiveModelCatalog(flags: FeatureFlags, catalogs: CatalogSources): ModelCatalogEntry[] {
  const items: ModelCatalogEntry[] = [];
  if (flags.claudeCode) items.push(...catalogs.claude);
  if (flags.githubCopilotCli) items.push(...catalogs.copilot);
  if (flags.codexCli) items.push(...catalogs.codex);
  return items.length > 0 ? items : catalogs.copilot;
}

/* --─ Component --─ */

export default function IdePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-text-ghost">Loading IDE...</div>}>
      <IdePageInner />
    </Suspense>
  );
}

function IdePageInner() {
  const { activeProject } = useActiveDesktopProject();
  const repoPath = activeProject?.repoPath ?? null;

  /* -- Activity bar -- */
  const [sidebarVisible, setSidebarVisible] = useState(true);

  /* -- Resizable panel widths -- */
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(320);
  const isDraggingSidebar = useRef(false);
  const isDraggingChat = useRef(false);

  /* -- File explorer -- */
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileEntry[]>>({});
  const [treeLoading, setTreeLoading] = useState(false);

  /* -- Editor -- */
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const editorRef = useRef<unknown>(null);

  /* -- Context menu -- */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);

  /* -- Chat model & catalog -- */
  const [chatModel, setChatModel] = useState("auto");
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({});
  const [catalogSources, setCatalogSources] = useState<CatalogSources>({
    copilot: DEFAULT_copilotModels,
    claude: DEFAULT_claudeModels,
    codex: DEFAULT_codexModels,
  });
  const modelCatalog = getActiveModelCatalog(featureFlags, catalogSources);
  const [providerTab, setProviderTab] = useState<"claude" | "copilot" | "codex">("copilot");
  const [modelSearch, setModelSearch] = useState("");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const hasMultipleProviders = [featureFlags.claudeCode, featureFlags.githubCopilotCli, featureFlags.codexCli].filter(Boolean).length > 1;
  const filteredModels = modelCatalog.filter((entry) => {
    const hay = `${entry.label} ${entry.provider} ${entry.id}`.toLowerCase();
    const q = modelSearch.trim().toLowerCase();
    const matchesSearch = !q || hay.includes(q);
    if (!hasMultipleProviders) return matchesSearch;
    if (providerTab === "claude") return matchesSearch && catalogSources.claude.some((m) => m.id === entry.id);
    if (providerTab === "codex") return matchesSearch && catalogSources.codex.some((m) => m.id === entry.id);
    return matchesSearch && catalogSources.copilot.some((m) => m.id === entry.id);
  });
  const selectedModelMeta = modelCatalog.find((e) => e.id === chatModel) ?? modelCatalog[0] ?? { id: "auto", label: "Auto" };
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  /* -- Copilot chat panel -- */
  const searchParams = useSearchParams();
  const [chatOpen, setChatOpen] = useState(true);
  const [ideApprovalMode, setIdeApprovalMode] = useState<"default" | "auto" | "manual">("default");
  const [ideSettingsApprovalMode, setIdeSettingsApprovalMode] = useState<"auto" | "manual">("auto");
  const [showIdeApprovalMenu, setShowIdeApprovalMenu] = useState(false);
  const ideApprovalMenuRef = useRef<HTMLDivElement | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      from: "copilot",
      text: "Hi! I'm Copilot. Ask me anything about your code, or use slash commands like /fix, /explain, or /tests.",
    },
  ]);
  const [isCompacting, setIsCompacting] = useState(false);
  const [chatInput, setChatInputRaw] = useState(() => {
    try { return sessionStorage.getItem("codebuddy:ide:draft") ?? ""; } catch { return ""; }
  });
  const setChatInput = useCallback((v: string) => {
    setChatInputRaw(v);
    try { sessionStorage.setItem("codebuddy:ide:draft", v); } catch { /* quota */ }
  }, []);

  const handleIdeAttachPaths = useCallback(async (paths: string[]) => {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    const newFiles: Array<{ id: string; label: string; path?: string; dataUrl?: string }> = [];
    for (const p of paths) {
      if (!p || !(p.startsWith("/") || /^[A-Za-z]:/.test(p))) continue;
      const label = p.split(/[/\\]/).pop() || p;
      newFiles.push({ id: p, label, path: p });
    }
    if (newFiles.length === 0) return;
    setIdeAttachedFiles((prev) => {
      const next = [...prev];
      for (const f of newFiles) {
        if (!next.some((x) => x.id === f.id)) next.push(f);
      }
      return next;
    });
    if (api?.system?.readFileAsDataUrl) {
      for (const f of newFiles) {
        if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.label) && f.path) {
          const dataUrl = await api.system.readFileAsDataUrl(f.path);
          if (dataUrl) setIdeAttachedFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, dataUrl } : x));
        }
      }
    }
  }, []);

  /** Handle File objects from drag-drop or <input>. Saves to .codebuddy/uploads/ when .path is missing. */
  const handleIdeAttachDroppedFiles = useCallback(async (files: File[]) => {
    const api = typeof window !== "undefined" ? window.electronAPI : null;
    const projectDir = repoPath;

    const withPath: string[] = [];
    const withoutPath: File[] = [];
    for (const f of files) {
      const fp = (f as File & { path?: string }).path;
      if (fp && (fp.startsWith("/") || /^[A-Za-z]:/.test(fp))) withPath.push(fp);
      else withoutPath.push(f);
    }
    if (withPath.length) void handleIdeAttachPaths(withPath);

    if (withoutPath.length && projectDir && api?.system?.saveUploadedFile) {
      for (const file of withoutPath) {
        const buf = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const savedPath = await api.system.saveUploadedFile({ projectDir, fileName: file.name, base64Data: base64 });
        if (savedPath) {
          const label = file.name;
          const att = { id: savedPath, label, path: savedPath } as { id: string; label: string; path?: string; dataUrl?: string };
          setIdeAttachedFiles((prev) => prev.some((x) => x.id === att.id) ? prev : [...prev, att]);
          if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(label) && api.system.readFileAsDataUrl) {
            const dataUrl = await api.system.readFileAsDataUrl(savedPath);
            if (dataUrl) setIdeAttachedFiles((prev) => prev.map((x) => x.id === att.id ? { ...x, dataUrl } : x));
          }
        } else {
          const att = { id: `${file.name}-${file.size}-${file.lastModified}`, label: file.name };
          setIdeAttachedFiles((prev) => prev.some((x) => x.id === att.id) ? prev : [...prev, att]);
        }
      }
    } else if (withoutPath.length) {
      const fallback = withoutPath.map((f) => ({ id: `${f.name}-${f.size}-${f.lastModified}`, label: f.name }));
      setIdeAttachedFiles((prev) => { const next = [...prev]; for (const a of fallback) { if (!next.some((x) => x.id === a.id)) next.push(a); } return next; });
    }
  }, [repoPath, handleIdeAttachPaths]);

  const handleIdeOpenFilePicker = useCallback(async () => {
    const api = typeof window !== "undefined" ? (window as { electronAPI?: { system?: { openFiles?: () => Promise<string[]> } } }).electronAPI : null;
    if (api?.system?.openFiles) {
      const paths = await api.system.openFiles();
      if (paths.length > 0) void handleIdeAttachPaths(paths);
    } else {
      ideFileInputRef.current?.click();
    }
  }, [handleIdeAttachPaths]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const ideFileInputRef = useRef<HTMLInputElement | null>(null);
  const [ideAttachedFiles, setIdeAttachedFiles] = useState<Array<{ id: string; label: string; path?: string; dataUrl?: string }>>([]);
  const [ideDragging, setIdeDragging] = useState(false);
  const [ideLightboxSrc, setIdeLightboxSrc] = useState<string | null>(null);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [showSessionList, setShowSessionList] = useState(false);
  const { events: liveEvents, processChunk: liveProcessChunk, startStreaming: liveStartStreaming, finalize: liveFinalize, reset: liveResetEvents, getRawText: liveGetRawText } = useStreamEvents();
  const liveStreamIdRef = useRef<string | null>(null);

  /* -- Session management: share sessions between IDE & freestyle -- */
  type SoloSessionItem = NonNullable<NonNullable<typeof activeProject>["dashboard"]["soloSessions"]>[number];
  const ideSoloSessionId = useRef<string | null>(searchParams.get("sessionId"));
  const soloSessions: SoloSessionItem[] = activeProject?.dashboard?.soloSessions ?? [];

  // Load session from URL param or when switching sessions
  const loadSession = useCallback((sessionId: string) => {
    const session = soloSessions.find((s) => s.id === sessionId);
    if (!session) return;
    ideSoloSessionId.current = sessionId;
    const msgs: ChatMessage[] = session.messages.map((m) => ({
      id: m.id,
      from: m.isAI ? "copilot" as const : "user" as const,
      text: m.text,
      time: (m as { time?: string }).time,
    }));
    if (msgs.length === 0) {
      msgs.push({ id: "welcome", from: "copilot", text: `Session "${session.title}" loaded. How can I help?` });
    }
    setChatMessages(msgs);
    setShowSessionList(false);
    // Update URL without navigation
    const url = new URL(window.location.href);
    url.searchParams.set("sessionId", sessionId);
    window.history.replaceState({}, "", url.toString());
  }, [soloSessions]);

  // Auto-load session from URL on mount
  useEffect(() => {
    const sid = searchParams.get("sessionId");
    if (sid && soloSessions.length > 0) {
      loadSession(sid);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNewSession = useCallback(() => {
    ideSoloSessionId.current = null;
    setChatMessages([{ id: "welcome", from: "copilot", text: "New conversation started. How can I help?" }]);
    setShowSessionList(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("sessionId");
    window.history.replaceState({}, "", url.toString());
  }, []);

  /* -- Terminal panel -- */
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalTab, setTerminalTab] = useState<TerminalTab>("terminal");
  const [terminalOutput, setTerminalOutput] = useState<string[]>(["$ "]);
  const [terminalInput, setTerminalInput] = useState("");
  const terminalHeight = 200;

  /* -- Search -- */
  const [searchQuery, setSearchQuery] = useState("");

  /* -- Load file tree -- */
  const loadDirectory = useCallback(async (dirPath: string) => {
    if (!window.electronAPI?.repo?.listDirectory) return [];
    try {
      const entries = await window.electronAPI.repo.listDirectory(dirPath);
      return (entries as FileEntry[]).sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!repoPath) return;
    setTreeLoading(true);
    loadDirectory(repoPath).then((entries) => {
      setFileTree(entries);
      setTreeLoading(false);
    });
  }, [repoPath, loadDirectory]);

  /* -- Load changed files for source control -- */

  /* -- Toggle directory -- */
  const toggleDir = useCallback(async (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) { next.delete(dirPath); } else { next.add(dirPath); }
      return next;
    });
    if (!dirContents[dirPath]) {
      const entries = await loadDirectory(dirPath);
      setDirContents((prev) => ({ ...prev, [dirPath]: entries }));
    }
  }, [dirContents, loadDirectory]);

  /* -- Open file -- */
  const openFile = useCallback(async (filePath: string, fileName: string) => {
    if (!window.electronAPI?.repo?.readFileContent) return;
    try {
      const result = await window.electronAPI.repo.readFileContent(filePath);
      const text = typeof result === "object" && result?.content ? result.content : typeof result === "string" ? result : "";
      setEditorContent(text);
      setOriginalContent(text);
      setActiveTabPath(filePath);

      setOpenTabs((prev) => {
        if (prev.some((t) => t.path === filePath)) return prev;
        return [...prev, { path: filePath, name: fileName, modified: false }];
      });
    } catch {
      setEditorContent("// Failed to read file");
      setOriginalContent("");
    }
  }, []);

  /* -- Switch tab -- */
  const switchTab = useCallback((path: string) => {
    const tab = openTabs.find((t) => t.path === path);
    if (tab) {
      setActiveTabPath(path);
      if (window.electronAPI?.repo?.readFileContent) {
        window.electronAPI.repo.readFileContent(path).then((result) => {
          const text = typeof result === "object" && result?.content ? result.content : typeof result === "string" ? result : "";
          setEditorContent(text);
          setOriginalContent(text);
        }).catch(() => {});
      }
    }
  }, [openTabs]);

  /* -- Close tab -- */
  const closeTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      if (activeTabPath === path) {
        const newActive = next.length > 0 ? next[next.length - 1].path : null;
        setActiveTabPath(newActive);
        if (newActive && window.electronAPI?.repo?.readFileContent) {
          window.electronAPI.repo.readFileContent(newActive).then((result) => {
            setEditorContent(typeof result === "object" && result?.content ? result.content : "");
          }).catch(() => {});
        } else {
          setEditorContent("");
        }
      }
      return next;
    });
  }, [activeTabPath]);

  /* -- Save file -- */
  const saveFile = useCallback(async () => {
    if (!activeTabPath || !window.electronAPI?.repo?.writeFileContent) return;
    try {
      await window.electronAPI.repo.writeFileContent({ targetPath: activeTabPath, content: editorContent });
      setOriginalContent(editorContent);
      setOpenTabs((prev) => prev.map((t) => t.path === activeTabPath ? { ...t, modified: false } : t));
    } catch (e) {
      console.warn("[IDE] Save failed:", e);
    }
  }, [activeTabPath, editorContent]);

  /* -- Keyboard shortcuts -- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveFile(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        void window.electronAPI?.system?.openTerminal?.({ cwd: repoPath ?? undefined });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") { e.preventDefault(); setSidebarVisible((v) => !v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile]);

  /* -- Drag-to-resize panels -- */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isDraggingSidebar.current) {
        const next = Math.max(160, Math.min(400, e.clientX));
        setSidebarWidth(next);
      }
      if (isDraggingChat.current) {
        const next = Math.max(240, window.innerWidth - e.clientX);
        if (next / window.innerWidth >= 0.95) {
          setChatFullscreen(true);
          isDraggingChat.current = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        } else {
          setChatFullscreen(false);
          setChatWidth(next);
        }
      }
    };
    const onUp = () => {
      isDraggingSidebar.current = false;
      isDraggingChat.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  /* -- Close context menu on click outside -- */
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  /* -- Load feature flags & model catalogs from IPC -- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = window.electronAPI;
        if (!api?.tools?.listStatus) return;
        await api.tools.listStatus();
        const settings = await (api as unknown as { settings: { get: () => Promise<Record<string, unknown>> } }).settings?.get?.();
        if (cancelled) return;
        if (settings?.featureFlags) setFeatureFlags(settings.featureFlags as FeatureFlags);
        if (settings?.projectDefaults) {
          const pd = settings.projectDefaults as Record<string, unknown>;
          if (pd.approvalMode === "manual" || pd.approvalMode === "auto") {
            setIdeSettingsApprovalMode(pd.approvalMode);
          }
          setIdeApprovalMode("default");
        }
        try {
          const catalogs = await api.tools.getModelCatalogs?.();
          if (!cancelled && catalogs) {
            const c = catalogs as CatalogSources;
            setCatalogSources({
              copilot: c.copilot?.length ? c.copilot : DEFAULT_copilotModels,
              claude: c.claude?.length ? c.claude : DEFAULT_claudeModels,
              codex: c.codex?.length ? c.codex : DEFAULT_codexModels,
            });
          }
        } catch { /* keep defaults */ }
      } catch { /* no electron */ }
    })();
    const stop = (window as unknown as { electronAPI?: { settings?: { onChanged?: (cb: (s: Record<string, unknown>) => void) => () => void } } }).electronAPI?.settings?.onChanged?.((s) => {
      if (!cancelled && s.featureFlags) setFeatureFlags(s.featureFlags as FeatureFlags);
    });
    return () => { cancelled = true; stop?.(); };
  }, []);

  /* -- Close model menu on click outside -- */
  useEffect(() => {
    if (!showModelMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (modelMenuRef.current?.contains(target) || modelButtonRef.current?.contains(target)) return;
      setShowModelMenu(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showModelMenu]);

  /* -- Close approval menu on click outside -- */
  useEffect(() => {
    if (!showIdeApprovalMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ideApprovalMenuRef.current?.contains(target)) return;
      setShowIdeApprovalMenu(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showIdeApprovalMenu]);

  /* -- Mark tab modified on edit -- */
  const handleEditorChange = useCallback((value: string | undefined) => {
    const v = value ?? "";
    setEditorContent(v);
    if (activeTabPath) {
      setOpenTabs((prev) => prev.map((t) =>
        t.path === activeTabPath ? { ...t, modified: v !== originalContent } : t
      ));
    }
  }, [activeTabPath, originalContent]);

  /* -- Chat: send message -- */
  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() && ideAttachedFiles.length === 0) return;
    const text = chatInput.trim();
    const currentFiles = ideAttachedFiles;
    const promptWithFiles = currentFiles.length > 0
      ? [text, "Attached files:", ...currentFiles.map((f) => `- ${f.path || f.label}`)].join("\n")
      : text;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, from: "user", text: promptWithFiles, time: nowTimestamp() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIdeAttachedFiles([]);

    const streamId = `c-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: streamId, from: "copilot", text: "", time: nowTimestamp(), streaming: true }]);

    // Try to route through real Electron API
    const api = window.electronAPI;
    if (api?.project?.sendSoloMessage && activeProject?.id) {
      liveStartStreaming();
      liveStreamIdRef.current = streamId;

      const stopOutput = api.project.onAgentOutput((event) => {
        const chunk = event.chunk || "";
        if (chunk) liveProcessChunk(chunk);
      });

      try {
        const result = await api.project.sendSoloMessage({
          projectId: activeProject.id,
          sessionId: ideSoloSessionId.current ?? undefined,
          prompt: promptWithFiles,
          model: chatModel,
        });
        ideSoloSessionId.current = result.sessionId;

        // Update URL so session can be shared/resumed
        const url = new URL(window.location.href);
        url.searchParams.set("sessionId", result.sessionId);
        window.history.replaceState({}, "", url.toString());

        // Find the last AI message from the result
        const session = result.project.dashboard.soloSessions?.find((s) => s.id === result.sessionId);
        const lastAi = session?.messages?.filter((m) => m.isAI).pop();
        const finalText = lastAi?.text || liveGetRawText() || "Done.";

        stopOutput();
        await liveFinalize();

        setChatMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, text: finalText, streaming: false } : m));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Request failed";
        setChatMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, text: `Error: ${errMsg}`, streaming: false } : m));
      } finally {
        liveResetEvents();
        liveStreamIdRef.current = null;
      }
    } else {
      // Fallback: simulate response for non-Electron environments
      const fullResponse = activeTabPath
        ? `I analyzed **${activeTabPath.split(/[/\\]/).pop()}** and here's what I found:\n\n- The file structure looks clean\n- Consider extracting repeated patterns into a shared utility\n- No obvious issues detected\n\nWant me to make any changes?`
        : "I can help with your code. Open a file from the explorer to get context-aware suggestions, or ask me anything about your project.";

      let charIndex = 0;
      const streamInterval = setInterval(() => {
        charIndex += Math.floor(Math.random() * 3) + 1;
        if (charIndex >= fullResponse.length) {
          charIndex = fullResponse.length;
          clearInterval(streamInterval);
          setChatMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, text: fullResponse, streaming: false } : m));
        } else {
          setChatMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, text: fullResponse.slice(0, charIndex) } : m));
        }
      }, 20);
    }
  }, [chatInput, ideAttachedFiles, activeTabPath, activeProject, chatModel]);

  const handleCompactConversation = useCallback(async () => {
    if (!window.electronAPI?.project?.compactConversation || !activeProject || !ideSoloSessionId.current) return;
    if (isCompacting) return;
    try {
      setIsCompacting(true);
      await window.electronAPI.project.compactConversation({
        projectId: activeProject.id,
        sessionId: ideSoloSessionId.current,
      });
    } catch { /* */ } finally {
      setIsCompacting(false);
    }
  }, [activeProject, isCompacting]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* -- Breadcrumb -- */
  const breadcrumb = useMemo(() => {
    if (!activeTabPath) return [];
    return getBreadcrumb(activeTabPath, repoPath);
  }, [activeTabPath, repoPath]);

  /* -- File tree renderer -- */
  const renderTree = useCallback((entries: FileEntry[], depth: number): React.ReactNode => {
    return entries.map((entry) => {
      const isDir = entry.type === "directory";
      const isExpanded = expandedDirs.has(entry.path);
      const isActive = entry.path === activeTabPath;
      const ft = getFileTypeIndicator(entry.name);
      const indent = depth * 16 + 12;

      // Filter out common non-essential dirs
      if (isDir && /^(node_modules|\.git|\.next|dist|build|__pycache__)$/.test(entry.name)) return null;

      return (
        <div key={entry.path}>
          <button
            type="button"
            onClick={() => isDir ? toggleDir(entry.path) : openFile(entry.path, entry.name)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, entry }); }}
            className={`w-full flex items-center gap-1.5 py-[3px] text-left text-[12px] hover:bg-stage-up ${
              isActive ? "bg-stage-up text-text-soft" : "text-text-dim"
            }`}
            style={{ paddingLeft: indent }}
          >
            {isDir ? (
              <span className="text-[10px] text-text-ghost w-3 text-center">{isExpanded ? "▾" : "▸"}</span>
            ) : ft.label ? (
              <span className="text-[9px] font-semibold w-3 text-center" style={{ color: ft.color }}>{ft.label}</span>
            ) : (
              <span className="w-3" />
            )}
            <span className="truncate">{entry.name}</span>
          </button>
          {isDir && isExpanded && dirContents[entry.path] && renderTree(dirContents[entry.path], depth + 1)}
        </div>
      );
    });
  }, [expandedDirs, dirContents, activeTabPath, toggleDir, openFile]);

  /* ------------------------------------------------------- */
  /* --─ RENDER --─ */
  /* ------------------------------------------------------- */

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--stage)" }}>

      {/* ------------------ SIDEBAR (resizable, no activity bar) ------------------ */}
      {sidebarVisible && (
        <>
          <div className="flex flex-shrink-0 flex-col border-r border-edge overflow-hidden"
            style={{ background: "var(--void)", width: sidebarWidth }}>

            {/* Sidebar header */}
            <div className="flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-dim">Explorer</span>
              </span>
              <button type="button" onClick={() => setSidebarVisible(false)} className="text-text-ghost hover:text-text-dim p-0.5" title="Hide sidebar (Ctrl+B)">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
              </button>
            </div>

            {/* File explorer */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scroll">
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-ghost cursor-pointer">
                  ▾ {activeProject?.name?.toUpperCase() ?? "PROJECT"}
                </div>
                {treeLoading ? (
                  <div className="px-3 py-4 text-[11px] text-text-ghost">Loading…</div>
                ) : (
                  renderTree(fileTree, 0)
                )}
              </div>
            </div>
          </div>
          {/* Sidebar resize handle */}
          <div
            className="w-[3px] cursor-col-resize hover:bg-violet/20 active:bg-violet/30 transition-colors shrink-0"
            onMouseDown={() => { isDraggingSidebar.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
          />
        </>
      )}

      {/* ------------------ EDITOR AREA (flex grow) ------------------ */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Tab bar */}
        <div className="flex h-[35px] items-stretch border-b border-edge"
          style={{ background: "var(--void)" }}>
          {openTabs.map((tab) => {
            const ft = getFileTypeIndicator(tab.name);
            const isActive = tab.path === activeTabPath;
            return (
              <button key={tab.path} type="button" onClick={() => switchTab(tab.path)}
                className={`flex items-center gap-1.5 px-3 text-[12px] ${
                  isActive
                    ? "bg-stage text-text-mid border-b border-b-sun"
                    : "text-text-ghost hover:bg-stage-up"
                }`}>
                {ft.label && <span className="text-[9px] font-semibold" style={{ color: ft.color }}>{ft.label}</span>}
                {tab.name}
                {tab.modified && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-text-dim" />}
                <span onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
                  className="ml-1.5 text-[10px] text-text-ghost hover:text-text-dim cursor-pointer">×</span>
              </button>
            );
          })}
        </div>

        {/* Breadcrumb */}
        {activeTabPath && (
          <div className="px-3 py-1 text-[11px] text-text-ghost bg-stage-up/50">
            {breadcrumb.map((seg, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1 text-text-ghost/50">›</span>}
                <span className={i === breadcrumb.length - 1 ? "text-text-dim" : ""}>{seg}</span>
              </span>
            ))}
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 min-h-0 relative">
          {activeTabPath ? (
            <MonacoEditor
              height="100%"
              language={getMonacoLanguage(activeTabPath)}
              value={editorContent}
              onChange={handleEditorChange}
              theme="vs-dark"
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                // Ctrl+T toggle terminal
                editor.onKeyDown((e: { ctrlKey: boolean; metaKey: boolean; browserEvent: KeyboardEvent; preventDefault: () => void; stopPropagation: () => void }) => {
                  if ((e.ctrlKey || e.metaKey) && e.browserEvent.key === 't') {
                    e.preventDefault();
                    e.stopPropagation();
                    void window.electronAPI?.system?.openTerminal?.({ cwd: repoPath ?? undefined });
                  }
                });
                // Ctrl+B toggle sidebar
                editor.addAction({
                  id: "toggle-sidebar",
                  label: "Toggle Sidebar",
                  keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB],
                  run: () => setSidebarVisible((v) => !v),
                });
                // Ctrl+S save file
                editor.addAction({
                  id: "save-file",
                  label: "Save File",
                  keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
                  run: () => saveFile(),
                });
              }}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                minimap: { enabled: true, maxColumn: 80 },
                lineNumbers: "on",
                renderWhitespace: "selection",
                wordWrap: "off",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8 },
                suggest: { showIcons: true },
                bracketPairColorization: { enabled: true },
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mb-3 text-[32px] font-bold text-text-ghost/30">{'</>'}</div>
                <p className="text-[13px] text-text-ghost">Open a file from the explorer to start editing</p>
                <p className="mt-1 text-[11px] text-text-ghost/50">Ctrl+T to toggle terminal</p>
              </div>
            </div>
          )}

          {/* Removed hardcoded model indicator — model info is in the status bar */}
        </div>

        {/* -- Terminal panel -- */}
        {terminalOpen && (
          <div className="border-t border-edge flex flex-col" style={{ height: terminalHeight, background: "var(--void)" }}>
            {/* Terminal tabs */}
            <div className="flex items-center gap-0 border-b border-edge px-2">
              {(["terminal", "output", "problems"] as TerminalTab[]).map((tab) => (
                <button key={tab} type="button" onClick={() => setTerminalTab(tab)}
                  className={`px-3 py-1.5 text-[11px] font-medium capitalize ${
                    terminalTab === tab ? "text-text-mid border-b border-b-sun" : "text-text-ghost"
                  }`}>
                  {tab}
                </button>
              ))}
              <div className="flex-1" />
              <button type="button" onClick={() => setTerminalOpen(false)} className="p-1 text-text-ghost hover:text-text-dim">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5"><path d="m6 6 8 8M14 6l-8 8" /></svg>
              </button>
            </div>

            {/* Terminal content */}
            <div className="flex-1 overflow-y-auto p-2 font-mono text-[12px] text-text-dim custom-scroll">
              {terminalOutput.map((line, i) => <div key={i}>{line}</div>)}
              <div className="flex items-center gap-1">
                <span className="text-mint/50">$</span>
                <input
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && terminalInput.trim()) {
                      setTerminalOutput((prev) => [...prev, `$ ${terminalInput}`, `Command: ${terminalInput} (placeholder)`]);
                      setTerminalInput("");
                    }
                  }}
                  className="flex-1 bg-transparent text-text-mid outline-none placeholder:text-text-ghost caret-sun"
                  placeholder="Type a command…"
                />
              </div>
            </div>
          </div>
        )}

        {/* -- Status bar -- */}
        <div className="flex h-[22px] items-center border-t border-edge px-2 text-[11px] text-text-ghost gap-3"
          style={{ background: "var(--void)" }}>
          <button type="button" onClick={() => setSidebarVisible((v) => !v)} className="hover:text-text-dim" title="Toggle Explorer (Ctrl+B)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9zM3.5 3a.5.5 0 00-.5.5v9a.5.5 0 00.5.5H6V3H3.5zM7 3v10h5.5a.5.5 0 00.5-.5v-9a.5.5 0 00-.5-.5H7z"/></svg>
          </button>
          <span className="text-sky/60">main</span>
          <span>{getLanguageLabel(activeTabPath)}</span>
          <span>UTF-8</span>
          <div className="flex-1" />
          <button type="button" onClick={() => setChatOpen((v) => !v)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-stage-up transition text-[10px] ${chatOpen ? "text-violet" : ""}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M1 3.5A1.5 1.5 0 012.5 2h11A1.5 1.5 0 0115 3.5v7a1.5 1.5 0 01-1.5 1.5H8.5l-3.3 2.475A.5.5 0 014.5 14V12h-2A1.5 1.5 0 011 10.5v-7z"/>
            </svg>
            Chat
          </button>
        </div>
      </div>

      {/* ====== AI COPILOT RAIL ====== */}
      {chatOpen && (
        <>
          {/* Resize handle — hidden when fullscreen */}
          {!chatFullscreen && (
            <div className="w-[3px] cursor-col-resize shrink-0"
              onMouseDown={() => { isDraggingChat.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}>
              <div className="h-full w-full transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rail-accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} />
            </div>
          )}

          <div
            className={chatFullscreen ? "fixed inset-0 z-[9990] flex flex-col" : "flex flex-shrink-0 flex-col"}
            style={chatFullscreen ? { background: 'var(--rail-bg)' } : { background: 'var(--rail-bg)', width: chatWidth, borderLeft: '1px solid var(--rail-edge)' }}>

            {/* -- Header -- */}
            <div className="flex items-center justify-between h-10 px-3.5 shrink-0" style={{ borderBottom: '1px solid var(--rail-edge)' }}>
              <div className="flex items-center gap-2">
                <div className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px]" style={{ background: 'var(--rail-accent-subtle)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-[9px] w-[9px]" style={{ color: 'var(--rail-accent)' }}>
                    <path d="M8 1a.75.75 0 0 1 .75.75v1.5h2a2.25 2.25 0 0 1 2.25 2.25v.75h1.25a.75.75 0 0 1 0 1.5H13v.75h1.25a.75.75 0 0 1 0 1.5H13v.75a2.25 2.25 0 0 1-2.25 2.25h-2v1.25a.75.75 0 0 1-1.5 0v-1.25h-2A2.25 2.25 0 0 1 3 9.75V9H1.75a.75.75 0 0 1 0-1.5H3v-.75H1.75a.75.75 0 0 1 0-1.5H3v-.75A2.25 2.25 0 0 1 5.25 2.25h2V1.75A.75.75 0 0 1 8 1ZM4.5 5.25a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1-.75-.75v-5.5Z" />
                  </svg>
                </div>
                <span className="text-[11px] font-medium tracking-[0.03em]" style={{ color: 'var(--rail-text-secondary)', letterSpacing: '0.03em' }}>Copilot</span>
              </div>
              <div className="flex items-center gap-0.5">
                {/* Fullscreen toggle */}
                <button type="button"
                  onClick={() => setChatFullscreen((v) => !v)}
                  className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--rail-text-ghost)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--rail-text-tertiary)'; e.currentTarget.style.background = 'var(--rail-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rail-text-ghost)'; e.currentTarget.style.background = 'transparent'; }}
                  title={chatFullscreen ? "Exit fullscreen" : "Fullscreen chat"}
                >
                  {chatFullscreen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M5.75 1a.75.75 0 0 1 .75.75V4.5h3V1.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 5.25v-3.5A.75.75 0 0 1 5.75 1ZM1 10.75A.75.75 0 0 1 1.75 10H4.5V7.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 1 11.25v-.5ZM10.75 10H10v.75a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-2.75V13.5a.75.75 0 0 1-1.5 0V10h1.25Z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M1.75 1h3.5a.75.75 0 0 1 0 1.5H3.5v1.75a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 1.75 1ZM10.75 1h3.5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0V2.5h-1.75a.75.75 0 0 1 0-1.5h-1ZM1 10.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5H3.5v1.75a.75.75 0 0 1-1.5 0v-2.5ZM14.25 10a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1 0-1.5h1.75v-1.75a.75.75 0 0 1 .75-.75h1Z" />
                    </svg>
                  )}
                </button>
                <div className="relative">
                  <button type="button" onClick={() => setShowSessionList((v) => !v)}
                    className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                    style={{ color: 'var(--rail-text-ghost)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--rail-text-tertiary)'; e.currentTarget.style.background = 'var(--rail-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rail-text-ghost)'; e.currentTarget.style.background = 'transparent'; }}
                    title="Sessions">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M1 3a1 1 0 011-1h12a1 1 0 110 2H2a1 1 0 01-1-1zM1 8a1 1 0 011-1h12a1 1 0 110 2H2a1 1 0 01-1-1zM1 13a1 1 0 011-1h12a1 1 0 110 2H2a1 1 0 01-1-1z" />
                    </svg>
                  </button>
                  {showSessionList && (
                    <div className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl"
                      style={{ background: 'var(--rail-dropdown-bg)', border: '1px solid var(--rail-dropdown-border)', boxShadow: 'var(--rail-dropdown-shadow)' }}>
                      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--rail-edge)' }}>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--rail-text-ghost)' }}>Sessions</span>
                      </div>
                      <div className="py-0.5">
                        <button type="button" onClick={startNewSession}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11.5px] font-medium tracking-[-0.003em] transition-colors"
                          style={{ color: 'var(--rail-accent)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rail-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
                          New session
                        </button>
                      </div>
                      {soloSessions.length === 0 ? (
                        <div className="px-3 py-3 text-[10.5px] text-center font-medium" style={{ color: 'var(--rail-text-ghost)' }}>No saved sessions</div>
                      ) : (
                        <div className="max-h-[180px] overflow-y-auto custom-scroll py-0.5" style={{ borderTop: '1px solid var(--rail-edge)' }}>
                          {soloSessions.map((s) => (
                            <button key={s.id} type="button" onClick={() => loadSession(s.id)}
                              className="w-full flex flex-col gap-0.5 px-3 py-1.5 text-left transition-colors"
                              style={{ background: ideSoloSessionId.current === s.id ? 'var(--rail-accent-ghost)' : 'transparent' }}
                              onMouseEnter={(e) => { if (ideSoloSessionId.current !== s.id) e.currentTarget.style.background = 'var(--rail-hover)'; }}
                              onMouseLeave={(e) => { if (ideSoloSessionId.current !== s.id) e.currentTarget.style.background = 'transparent'; }}>
                              <span className="text-[11.5px] truncate leading-snug tracking-[-0.003em]" style={{ color: ideSoloSessionId.current === s.id ? 'var(--rail-accent)' : 'var(--rail-text-secondary)', fontWeight: ideSoloSessionId.current === s.id ? 600 : 450 }}>
                                {s.title || "Untitled"}
                              </span>
                              <span className="text-[9.5px] font-medium" style={{ color: 'var(--rail-text-ghost)' }}>{s.messages.length} messages</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button type="button" onClick={startNewSession}
                  className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--rail-text-ghost)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--rail-text-tertiary)'; e.currentTarget.style.background = 'var(--rail-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rail-text-ghost)'; e.currentTarget.style.background = 'transparent'; }}
                  title="New Session">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* -- Messages -- */}
            <div className="flex-1 overflow-y-auto custom-scroll">
              <div className="flex flex-col gap-5 px-3.5 py-4">
                {chatMessages.length <= 1 && chatMessages[0]?.id === "welcome" ? (
                  /* -- Welcome -- */
                  <div className="flex flex-col items-center justify-center py-20 px-3">
                    <div className="relative mb-5">
                      <div className="absolute -inset-3 rounded-full blur-2xl opacity-60" style={{ background: 'var(--rail-accent-ghost)' }} />
                      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--rail-accent-subtle)', boxShadow: 'var(--rail-card-shadow)' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-[18px] w-[18px]" style={{ color: 'var(--rail-accent)' }}>
                          <path d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06a.75.75 0 1 1-1.06 1.061L5.05 4.111a.75.75 0 0 1 0-1.06ZM14.95 3.05a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 0 1-1.062-1.06l1.061-1.06a.75.75 0 0 1 1.06 0ZM3 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 3 8ZM14 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 14 8ZM7.172 13.828a.75.75 0 0 1-1.06 0l-1.061-1.06a.75.75 0 0 1 1.06-1.061l1.06 1.06a.75.75 0 0 1 0 1.06ZM13.89 12.768a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM10 14a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 14Z" />
                          <path fillRule="evenodd" d="M10 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-1 3a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <p className="font-display text-[13px] font-semibold tracking-[-0.01em] mb-1.5" style={{ color: 'var(--rail-text-secondary)' }}>What can I help with?</p>
                    <p className="text-[11px] text-center leading-[1.6] mb-7 max-w-[210px] font-normal" style={{ color: 'var(--rail-text-ghost)' }}>
                      Code analysis, refactoring, debugging, and generation with full project context.
                    </p>
                    <div className="flex flex-col gap-0.5 w-full max-w-[220px]">
                      {[
                        { label: "Explain this file", prompt: "/explain" },
                        { label: "Fix a problem", prompt: "/fix" },
                        { label: "Generate tests", prompt: "/tests" },
                        { label: "Refactor code", prompt: "/refactor" },
                      ].map((action) => (
                        <button key={action.prompt} type="button" onClick={() => { setChatInput(action.prompt + " "); }}
                          className="group/chip flex items-center justify-between rounded-lg px-2.5 py-[6px] text-left transition-colors"
                          style={{ border: '1px solid transparent' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--rail-hover)'; e.currentTarget.style.borderColor = 'var(--rail-card-border)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                          <span className="text-[11.5px] font-medium tracking-[-0.003em]" style={{ color: 'var(--rail-text-tertiary)' }}>{action.label}</span>
                          <span className="text-[9.5px] font-code opacity-0 group-hover/chip:opacity-100 transition-opacity" style={{ color: 'var(--rail-text-ghost)' }}>{action.prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* -- Conversation -- */
                  chatMessages.map((msg, idx) => (
                    <div key={msg.id}>
                      {msg.from === "user" ? (
                        /* User turn */
                        <div className="flex justify-end">
                          <div className="max-w-[88%]">
                            {msg.time && <div className="mb-1 flex justify-end"><span className="text-[9px] font-medium" style={{ color: 'var(--rail-text-ghost)' }}>{msg.time}</span></div>}
                            <div className="rounded-xl px-3 py-2" style={{ background: 'var(--rail-user-bg)', border: '1px solid var(--rail-user-border)' }}>
                              <p className="text-[12.5px] leading-[1.65] tracking-[-0.003em] whitespace-pre-wrap break-words" style={{ color: 'var(--rail-text)' }}>{msg.text}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Assistant turn */
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-1.5 pl-0.5">
                            <div className="relative h-1 w-1 rounded-full" style={{ background: msg.streaming ? 'var(--rail-accent-solid)' : 'var(--rail-accent)' }}>
                              {msg.streaming && <div className="absolute inset-0 rounded-full animate-ping" style={{ background: 'var(--rail-accent-solid)' }} />}
                            </div>
                            <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--rail-accent)' }}>Copilot</span>
                            {msg.time && !msg.streaming && <span className="text-[9px] font-medium" style={{ color: 'var(--rail-text-ghost)' }}>{msg.time}</span>}
                            {msg.streaming && <span className="text-[9.5px] font-medium" style={{ color: 'var(--rail-text-ghost)' }}>generating...</span>}
                          </div>
                          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--rail-card)', border: '1px solid var(--rail-card-border)', boxShadow: 'var(--rail-card-shadow)' }}>
                            <div className="px-3.5 py-3">
                              {msg.id === liveStreamIdRef.current && liveEvents.length > 0 ? (
                                <ActivityStream events={liveEvents} rawText={liveGetRawText()} isStreaming={!!msg.streaming} className="text-[12.5px] leading-[1.65] tracking-[-0.003em]" />
                              ) : (
                                <RunSummaryCard text={msg.text} className="text-[12.5px] leading-[1.65] tracking-[-0.003em]" />
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.codeBlock && (
                        <div className="mt-2.5 overflow-hidden rounded-xl" style={{ background: 'var(--rail-code-bg)', border: '1px solid var(--rail-code-border)' }}>
                          <div className="flex items-center justify-between px-3.5 py-1.5" style={{ borderBottom: '1px solid var(--rail-code-border)', background: 'var(--rail-code-header)' }}>
                            <span className="text-[10px] font-code font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{msg.codeBlock.file}</span>
                            <div className="flex gap-3">
                              <button type="button" className="text-[10px] font-medium transition-colors" style={{ color: 'rgba(52,211,153,0.5)' }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(52,211,153,0.85)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(52,211,153,0.5)'; }}>Apply</button>
                              <button type="button" className="text-[10px] font-medium transition-colors" style={{ color: 'rgba(255,255,255,0.25)' }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}>Copy</button>
                            </div>
                          </div>
                          <pre className="overflow-x-auto px-3.5 py-3 font-code text-[11.5px] leading-[1.6]" style={{ color: 'rgba(255,255,255,0.68)' }}>
                            <code>{msg.codeBlock.code}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* -- Composer -- */}
            {ideSoloSessionId.current ? (
              <div className="flex justify-end px-3 pt-1.5">
                <button
                  type="button"
                  onClick={() => void handleCompactConversation()}
                  disabled={isCompacting}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium opacity-60 transition hover:opacity-100 disabled:opacity-30"
                  style={{ color: 'var(--rail-text-secondary)' }}
                >
                  {isCompacting ? "Compacting\u2026" : "Compact conversation"}
                </button>
              </div>
            ) : null}
            <div
              style={{ borderTop: '1px solid var(--rail-edge)' }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.types.includes("Files")) setIdeDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIdeDragging(false); }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation(); setIdeDragging(false);
                const droppedFiles = Array.from(e.dataTransfer.files);
                if (droppedFiles.length) void handleIdeAttachDroppedFiles(droppedFiles);
              }}
            >
              <div className="px-3 py-2.5">
                <input ref={ideFileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) void handleIdeAttachDroppedFiles(files);
                  e.currentTarget.value = '';
                }} />
                <div className={`rounded-[11px] transition-all${ideDragging ? ' ring-1 ring-sky-400/60' : ''}`} style={{ background: 'var(--rail-elevated)', border: '1px solid var(--rail-elevated-border)', boxShadow: 'var(--rail-elevated-shadow)' }}>
                  {ideAttachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                  {ideAttachedFiles.map((f) => {
                        const isImg = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(f.label);
                        const imgSrc = isImg ? (f.dataUrl ?? null) : null;
                        return (
                          <span key={f.id} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium cursor-pointer" style={{ background: 'var(--rail-hover)', color: 'var(--rail-text-secondary)' }}
                            onClick={() => { if (f.dataUrl && isImg) setIdeLightboxSrc(f.dataUrl); }}
                          >
                            {imgSrc ? <img src={imgSrc} alt="" className="h-4 w-4 rounded object-cover" /> : null}
                            {f.label}
                            <button type="button" onClick={() => setIdeAttachedFiles((p) => p.filter((x) => x.id !== f.id))} style={{ color: 'var(--rail-text-ghost)', lineHeight: 0 }}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 px-3 py-[7px]">
                    <button type="button" onClick={handleIdeOpenFilePicker}
                      className="shrink-0 flex h-[20px] w-[20px] items-center justify-center rounded-full transition-all"
                      style={{ color: 'var(--rail-text-ghost)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--rail-text-secondary)'; e.currentTarget.style.background = 'var(--rail-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rail-text-ghost)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                        <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                      </svg>
                    </button>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                      placeholder="Ask anything..."
                      className="flex-1 min-w-0 bg-transparent text-[12.5px] tracking-[-0.003em] outline-none leading-normal"
                      style={{ color: 'var(--rail-text)', caretColor: 'var(--rail-accent-solid)' }}
                    />
                    <button type="button" onClick={sendChatMessage}
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] transition-all"
                      style={(chatInput.trim() || ideAttachedFiles.length > 0) ? {
                        background: 'var(--rail-accent-solid)',
                        color: 'white',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      } : {
                        background: 'var(--rail-hover)',
                        color: 'var(--rail-text-ghost)',
                      }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-[10px] w-[10px]">
                        <path d="M2.87 2.298a.75.75 0 0 0-.812.81l.501 4.511A1 1 0 0 0 3.554 8.5H8a.5.5 0 0 1 0 1H3.554a1 1 0 0 0-.995.881l-.5 4.511a.75.75 0 0 0 .812.81 24.58 24.58 0 0 0 10.545-5.69.75.75 0 0 0 0-1.024A24.58 24.58 0 0 0 2.87 2.298Z" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Model selector */}
                <div className="flex items-center pt-1.5 px-0.5">
                  <div className="relative">
                    <button ref={modelButtonRef} type="button" onClick={() => {
                      if (!showModelMenu && modelButtonRef.current) {
                        const rect = modelButtonRef.current.getBoundingClientRect();
                        setModelMenuPos({ left: Math.max(8, rect.left), bottom: window.innerHeight - rect.top + 6 });
                      }
                      setShowModelMenu((v) => !v);
                      setModelSearch("");
                    }}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors"
                      style={{ color: 'var(--rail-text)', background: 'var(--rail-hover)', border: '1px solid var(--rail-edge)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--rail-text)'; e.currentTarget.style.background = 'var(--rail-surface-2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rail-text)'; e.currentTarget.style.background = 'var(--rail-hover)'; }}>
                      <span className="h-[5px] w-[5px] rounded-full" style={{ background: 'var(--rail-accent)' }} />
                      <span className="text-[11px] font-semibold tracking-[0.01em]">{selectedModelMeta?.label ?? "Auto"}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-2.5 w-2.5 transition ${showModelMenu ? "rotate-180" : ""}`}><path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                    </button>
                  {showModelMenu && modelMenuPos ? createPortal(
                    <div
                      ref={modelMenuRef}
                      className="fixed z-[9999] max-h-[min(420px,70vh)] w-[300px] overflow-hidden rounded-[1.2rem] backdrop-blur-xl"
                      style={{ left: modelMenuPos.left, bottom: modelMenuPos.bottom, background: 'var(--rail-picker-bg)', border: '1px solid var(--rail-picker-border)', boxShadow: 'var(--rail-dropdown-shadow)', color: 'var(--rail-text)' }}
                    >
                      <div className="flex items-center gap-2 px-2.5 py-2" style={{ borderBottom: '1px solid var(--rail-edge)' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" style={{ color: 'var(--rail-text-ghost)' }}><path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" /></svg>
                        <input
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          placeholder="Search models"
                          autoFocus
                          className="w-full bg-transparent text-[12.5px] tracking-[-0.003em] outline-none"
                          style={{ color: 'var(--rail-text)' }}
                        />
                      </div>
                      {hasMultipleProviders ? (
                        <div className="flex gap-1 px-2.5 py-1.5" style={{ borderBottom: '1px solid var(--rail-edge)' }}>
                          {(["claude", "copilot", "codex"] as const)
                            .filter((tab) => {
                              if (tab === "claude") return !!featureFlags.claudeCode;
                              if (tab === "copilot") return !!featureFlags.githubCopilotCli;
                              return !!featureFlags.codexCli;
                            })
                            .map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setProviderTab(tab)}
                              className="rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.01em] transition-colors"
                              style={providerTab === tab ? { background: 'var(--rail-accent-solid)', color: 'white' } : { color: 'var(--rail-text-secondary)' }}
                            >
                              {tab === "claude" ? "Claude Code" : tab === "codex" ? "Codex CLI" : "GitHub Copilot"}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className={`overflow-y-auto pb-3 pt-1 ${hasMultipleProviders ? "max-h-[min(330px,calc(70vh-90px))]" : "max-h-[min(370px,calc(70vh-50px))]"}`}>
                        {(["featured", "other"] as const).map((group) => {
                          const groupModels = filteredModels.filter((entry) => entry.group === group);
                          if (groupModels.length === 0) return null;
                          return (
                            <div key={group} className="mb-0.5 last:mb-0">
                              <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--rail-text-ghost)' }}>
                                {group === "featured" ? "Recommended" : "Other models"}
                              </p>
                              {groupModels.map((entry) => {
                                const isSelected = entry.id === chatModel;
                                return (
                                  <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => { setChatModel(entry.id); setShowModelMenu(false); setModelSearch(""); }}
                                    className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition-colors"
                                    style={isSelected ? { background: 'var(--rail-accent-solid)', color: 'white' } : { color: 'var(--rail-text)' }}
                                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--rail-hover)'; }}
                                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11.5px] font-medium tracking-[-0.006em]">{entry.label}</span>
                                        {entry.warning ? <span className="text-[10px]" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--rail-text-tertiary)' }}>{entry.warning}</span> : null}
                                      </div>
                                      <div className="mt-0.5 flex items-center gap-2 text-[10px]" style={{ color: isSelected ? 'rgba(255,255,255,0.72)' : 'var(--rail-text-secondary)' }}>
                                        <span>{entry.provider}</span>
                                        <span>{entry.contextWindow}</span>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      {entry.usage ? <span className="text-[10px] font-medium" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--rail-text-tertiary)' }}>{entry.usage}</span> : null}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>,
                    document.body
                  ) : null}
                </div>
              </div>
            </div>

            {/* Context + approval bar */}
            <div className="flex items-center gap-2 px-2 pt-1 pb-0.5 flex-wrap">
              {/* Context usage pill */}
              <div
                className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: 'var(--rail-hover)', color: 'var(--rail-text)' }}
                title="Estimated context usage"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 6.5a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Zm.75-3.75a.75.75 0 0 0 0 1.5H8a.75.75 0 0 0 0-1.5H2.75Z" clipRule="evenodd" /></svg>
                <span>Context</span>
                <span
                  className="rounded-full px-1.5 py-px text-[9px] font-semibold"
                  style={{ background: 'var(--rail-elevated)', color: 'var(--rail-text)' }}
                >
                  {Math.min(100, Math.round((chatMessages.reduce((acc, m) => acc + m.text.length, 0) / 4 / (selectedModelMeta?.maxTokens ?? 200000)) * 100))}%
                </span>
              </div>

              {/* Approval mode dropdown */}
              <div className="relative" ref={ideApprovalMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowIdeApprovalMenu((v) => !v)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors"
                  style={{ background: 'var(--rail-hover)', color: ideApprovalMode === "manual" ? 'var(--rail-accent-amber, #d97706)' : 'var(--rail-text)' }}
                  title="Change approval mode for tool calls"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v4A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-4A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                  </svg>
                  <span>{ideApprovalMode === "manual" ? "Manual" : ideApprovalMode === "auto" ? "Auto" : `Default (${ideSettingsApprovalMode === "manual" ? "Manual" : "Auto"})`}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5" style={{ color: 'var(--rail-text-secondary)' }}><path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                </button>
                {showIdeApprovalMenu && (
                  <div className="absolute bottom-full left-0 mb-1.5 z-50 min-w-[180px] rounded-xl border border-black/[0.08] bg-white py-1 shadow-lg dark:border-white/[0.1] dark:bg-[#1e1e1e]">
                    {(["default", "auto", "manual"] as const).map((opt) => {
                      const label = opt === "default" ? `Default (${ideSettingsApprovalMode === "manual" ? "Manual" : "Auto"})` : opt === "auto" ? "Auto Approve" : "Manual Approval";
                      const desc = opt === "default" ? "Follow your Settings value" : opt === "auto" ? "Approve all tool calls automatically" : "Confirm before each tool use";
                      const isActive = ideApprovalMode === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={async () => {
                            setIdeApprovalMode(opt);
                            setShowIdeApprovalMenu(false);
                            if (opt !== "default") {
                              setIdeSettingsApprovalMode(opt);
                              await (window as unknown as { electronAPI?: { settings?: { update?: (s: Record<string, unknown>) => Promise<void> } } }).electronAPI?.settings?.update?.({ projectDefaults: { approvalMode: opt } });
                            }
                          }}
                          className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                          style={{ color: opt === "manual" && isActive ? 'var(--rail-accent-amber, #d97706)' : 'var(--rail-text)' }}
                        >
                          <span className="text-[10px] font-semibold">{label}{isActive ? " ✓" : ""}</span>
                          <span className="text-[9px]" style={{ color: 'var(--rail-text-secondary)' }}>{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ------------------ CONTEXT MENU ------------------ */}
      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[180px] rounded-lg border border-edge bg-stage shadow-2xl py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
        >
          {contextMenu.entry.type === "file" && (
            <>
              <button type="button" onClick={() => openFile(contextMenu.entry.path, contextMenu.entry.name)}
                className="w-full px-3 py-1.5 text-left text-[11px] text-text-mid hover:bg-stage-up">Open</button>
              <button type="button" onClick={() => { navigator.clipboard.writeText(contextMenu.entry.path); }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-text-mid hover:bg-stage-up">Copy Path</button>
              <button type="button" onClick={() => { navigator.clipboard.writeText(contextMenu.entry.name); }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-text-mid hover:bg-stage-up">Copy Name</button>
              <div className="my-1 h-px bg-edge" />
              <button type="button" onClick={() => {
                const dir = contextMenu.entry.path.replace(/[\\/][^\\/]+$/, "");
                window.electronAPI?.system?.openExternal?.(`file://${dir}`);
              }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-text-mid hover:bg-stage-up">Reveal in Explorer</button>
            </>
          )}
          {contextMenu.entry.type === "directory" && (
            <>
              <button type="button" onClick={() => toggleDir(contextMenu.entry.path)}
                className="w-full px-3 py-1.5 text-left text-[11px] text-text-mid hover:bg-stage-up">
                {expandedDirs.has(contextMenu.entry.path) ? "Collapse" : "Expand"}
              </button>
              <button type="button" onClick={() => { navigator.clipboard.writeText(contextMenu.entry.path); }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-text-mid hover:bg-stage-up">Copy Path</button>
              <div className="my-1 h-px bg-edge" />
              <button type="button" onClick={() => { window.electronAPI?.system?.openExternal?.(`file://${contextMenu.entry.path}`); }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-text-mid hover:bg-stage-up">Open in System Explorer</button>
            </>
          )}
        </div>
      )}

      {/* Image lightbox */}
      {ideLightboxSrc ? (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setIdeLightboxSrc(null)}
        >
          <img
            src={ideLightboxSrc}
            alt="Preview"
            className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setIdeLightboxSrc(null)}
            className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
