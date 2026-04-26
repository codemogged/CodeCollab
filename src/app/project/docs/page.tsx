"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

function SparklesIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} style={style}>
      <path d="M10 1l.894 3.553a3.5 3.5 0 002.553 2.553L17 8l-3.553.894a3.5 3.5 0 00-2.553 2.553L10 15l-.894-3.553a3.5 3.5 0 00-2.553-2.553L3 8l3.553-.894a3.5 3.5 0 002.553-2.553L10 1z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  );
}

function CodeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} style={style}>
      <path fillRule="evenodd" d="M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function BookIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} style={style}>
      <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.963 8.963 0 00-4.25 1.065V16.82zM9.25 4.065A8.963 8.963 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
    </svg>
  );
}

type DocMode = "technical" | "overview";

interface GeneratedDoc {
  id: string;
  title: string;
  emoji: string;
  content: string;
}

interface SavedDoc {
  path: string;
  filename: string;
  mode: "technical" | "overview" | "doc";
  timestamp: string;
  bytes: number;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const MODE_BADGE: Record<SavedDoc["mode"], { label: string; className: string }> = {
  technical: { label: "Technical", className: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
  overview:  { label: "Overview",  className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  doc:       { label: "Doc",       className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 10) return `${kb.toFixed(1)} KB`;
  return `${Math.round(kb)} KB`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

interface SavedDocsPanelProps {
  savedDocs: SavedDoc[];
  showHint: boolean;
  onOpen: (doc: SavedDoc) => void;
  onDelete: (doc: SavedDoc) => void;
}

function SavedDocsPanel({ savedDocs, showHint, onOpen, onDelete }: SavedDocsPanelProps) {
  if (savedDocs.length === 0) {
    if (!showHint) return null;
    return (
      <div className="mt-6 rounded-2xl border border-black/[0.06] bg-white/40 px-5 py-4 text-[12px] theme-muted dark:border-white/[0.06] dark:bg-white/[0.02]">
        Saved docs will appear here once you generate documentation. Files are written to <code className="rounded bg-black/[0.05] px-1 py-0.5 text-[11px] dark:bg-white/[0.06]">docs/</code> in your project.
      </div>
    );
  }
  return (
    <div className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] theme-muted">Saved Docs</h3>
        <span className="text-[11px] theme-muted">{savedDocs.length} file{savedDocs.length === 1 ? "" : "s"}</span>
      </div>
      <ul className="space-y-2">
        {savedDocs.map((doc) => {
          const badge = MODE_BADGE[doc.mode] || MODE_BADGE.doc;
          return (
            <li
              key={doc.path}
              className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3 ring-1 ring-black/[0.04] dark:bg-white/[0.03] dark:ring-white/[0.06]"
            >
              <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.className}`}>
                {badge.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium theme-fg">{doc.filename}</p>
                <p className="text-[11px] theme-muted">{formatTimestamp(doc.timestamp)} · {formatBytes(doc.bytes)}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpen(doc)}
                className="rounded-md px-2 py-1 text-[11px] font-medium theme-muted transition hover:bg-black/[0.04] hover:theme-fg dark:hover:bg-white/[0.06]"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => onDelete(doc)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-500/10"
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const TECHNICAL_PROMPT = "You are a senior technical writer. Scan this project codebase. Return ONLY a JSON array of 6 doc sections with keys id, title, emoji, content. Sections: (1) id:overview title:Architecture Overview emoji:BUILD (2) id:stack title:Tech Stack emoji:PKG (3) id:structure title:Directory Structure emoji:DIR (4) id:api title:API/IPC Reference emoji:BOLT (5) id:flows title:Key Data Flows emoji:FLOW (6) id:dev title:Development and Build emoji:TOOLS. Each 300-600 words. Use markdown code fences where useful. CRITICAL: Return ONLY the raw JSON array.";

const OVERVIEW_PROMPT = "You are writing a friendly, non-technical product overview. Return ONLY a JSON array of 5 doc sections with keys id, title, emoji, content. Sections: (1) id:what title:What Is This emoji:SPARK (2) id:why title:Why It Matters emoji:BULB (3) id:how title:How It Works emoji:TARGET (4) id:features title:What You Can Do emoji:ROCKET (5) id:next title:Getting Started emoji:SEED. Plain English. Avoid jargon. Short sentences. Each 200-400 words. CRITICAL: Return ONLY the raw JSON array.";

export default function DocumentationPage() {
  const { activeProject } = useActiveDesktopProject();
  const projectName = activeProject?.name ?? "Your Project";
  const projectId = activeProject?.id;
  const repoPath = activeProject?.repoPath ?? "";

  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<DocMode | null>(null);
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [savedDocs, setSavedDocs] = useState<SavedDoc[]>([]);
  const [openSavedDoc, setOpenSavedDoc] = useState<{ doc: SavedDoc; content: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const streamRef = useRef("");

  const hasGenerated = docs.length > 0;

  const refreshSavedDocs = useCallback(async () => {
    if (!repoPath) { setSavedDocs([]); return; }
    try {
      const list = await window.electronAPI?.repo?.listDocs?.({ repoPath });
      if (Array.isArray(list)) setSavedDocs(list as SavedDoc[]);
    } catch {
      /* ignore */
    }
  }, [repoPath]);

  useEffect(() => { void refreshSavedDocs(); }, [refreshSavedDocs]);

  const persistGeneratedDocs = useCallback(async (docMode: DocMode, parsed: GeneratedDoc[]) => {
    if (!repoPath) return;
    setSaveStatus("saving");
    try {
      const ts = new Date();
      const heading = docMode === "technical" ? "# Technical Documentation" : "# Project Overview";
      const whenLabel = ts.toLocaleString();
      const meta = `<!-- mode: ${docMode} | generated: ${ts.toISOString()} | project: ${projectName} -->`;
      const sections = parsed.map((d) => `## ${d.emoji} ${d.title}\n\n${d.content}`).join("\n\n---\n\n");
      const content = `${meta}\n\n${heading}\n\n_Generated ${whenLabel}_\n\n${sections}\n`;
      await window.electronAPI?.repo?.saveDoc?.({
        repoPath,
        mode: docMode,
        content,
        timestamp: ts.toISOString(),
      });
      setSaveStatus("saved");
      void refreshSavedDocs();
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2400);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus((s) => (s === "error" ? "idle" : s)), 3500);
    }
  }, [repoPath, projectName, refreshSavedDocs]);

  const handleOpenSavedDoc = useCallback(async (doc: SavedDoc) => {
    try {
      const file = await window.electronAPI?.repo?.readFileContent?.(doc.path);
      const content = (file && typeof file.content === "string") ? file.content : "";
      setOpenSavedDoc({ doc, content });
    } catch {
      setOpenSavedDoc({ doc, content: "_Failed to read file._" });
    }
  }, []);

  const handleDeleteSavedDoc = useCallback(async (doc: SavedDoc) => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(`Delete ${doc.filename}? This cannot be undone.`);
    if (!ok) return;
    try {
      await window.electronAPI?.repo?.deleteDoc?.({ repoPath, filename: doc.filename });
      void refreshSavedDocs();
    } catch {
      /* ignore */
    }
  }, [repoPath, refreshSavedDocs]);

  const runGenerate = async (selectedMode: DocMode) => {
    if (!projectId || !window.electronAPI?.project?.sendSoloMessage) {
      setDocs([{ id: "missing", title: "Open a project first", emoji: "!", content: "# No active project\n\nOpen or connect a project to generate documentation." }]);
      setMode(selectedMode);
      return;
    }

    setIsGenerating(true);
    setMode(selectedMode);
    setDocs([]);
    setExpandedDoc(null);
    streamRef.current = "";
    setProgress(selectedMode === "technical" ? "Scanning codebase..." : "Getting to know your project...");

    const stop = window.electronAPI.project.onAgentOutput((event) => {
      if (event.scope !== "solo-chat") return;
      streamRef.current += event.chunk ?? "";
      const len = streamRef.current.length;
      if (len > 8000) setProgress("Almost done - polishing sections...");
      else if (len > 3000) setProgress(selectedMode === "technical" ? "Writing detailed sections..." : "Writing a clear overview...");
      else if (len > 500) setProgress(selectedMode === "technical" ? "Documenting architecture..." : "Explaining what it does...");
    });

    try {
      await window.electronAPI.project.sendSoloMessage({
        projectId,
        prompt: selectedMode === "technical" ? TECHNICAL_PROMPT : OVERVIEW_PROMPT,
      });
    } catch (err) {
      console.error("[docs] generation failed", err);
    }
    stop();

    const raw = streamRef.current.trim();
    const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)?.[0];
    let parsed: GeneratedDoc[] = [];
    if (jsonMatch) {
      try {
        const arr = JSON.parse(jsonMatch) as Array<{ id: string; title: string; emoji?: string; content: string }>;
        parsed = arr.map((d) => ({ id: d.id, title: d.title, emoji: d.emoji ?? "*", content: d.content }));
      } catch (err) {
        console.error("[docs] JSON parse failed", err);
      }
    }

    if (parsed.length === 0) {
      parsed = [{
        id: "result",
        title: selectedMode === "technical" ? "Technical Documentation" : "Project Overview",
        emoji: selectedMode === "technical" ? "*" : "#",
        content: raw || "The AI returned no content. Try again in a moment.",
      }];
    }

    setDocs(parsed);
    setExpandedDoc(parsed[0]?.id ?? null);
    setIsGenerating(false);
    setProgress("");
    void persistGeneratedDocs(selectedMode, parsed);
  };

  const handleReset = () => { setDocs([]); setExpandedDoc(null); setMode(null); };

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold theme-fg">{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-mono text-[12px] theme-fg dark:bg-white/[0.08]">{part.slice(1, -1)}</code>;
      return <span key={i}>{part}</span>;
    });
  };

  const renderContent = (text: string) => {
    const blocks = text.split(/(```[\s\S]*?```)/g);
    return blocks.map((block, bi) => {
      if (block.startsWith("```") && block.endsWith("```")) {
        const inner = block.slice(3, -3);
        const firstNl = inner.indexOf("\n");
        const lang = firstNl > 0 ? inner.slice(0, firstNl).trim() : "";
        const code = firstNl > 0 ? inner.slice(firstNl + 1) : inner;
        return (
          <div key={bi} className="my-4 overflow-hidden rounded-xl bg-[#0d1117] ring-1 ring-white/[0.06]">
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
      return block.split("\n").map((line, li) => {
        const key = bi + "-" + li;
        const trimmed = line.trimEnd();
        if (trimmed.startsWith("### ")) return <h3 key={key} className="mt-5 text-[14px] font-bold theme-fg">{trimmed.slice(4)}</h3>;
        if (trimmed.startsWith("## ")) return <h2 key={key} className="mt-6 text-[16px] font-bold theme-fg">{trimmed.slice(3)}</h2>;
        if (trimmed.startsWith("# ")) return <h1 key={key} className="mb-3 mt-2 text-[20px] font-bold theme-fg">{trimmed.slice(2)}</h1>;
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <li key={key} className="ml-5 flex items-start gap-2 text-[13.5px] leading-[1.7] theme-soft">
              <span className="mt-[8px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400/70" />
              <span className="min-w-0">{renderInline(trimmed.slice(2))}</span>
            </li>
          );
        }
        const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (numMatch) {
          return (
            <li key={key} className="ml-5 flex items-start gap-2.5 text-[13.5px] leading-[1.7] theme-soft">
              <span className="mt-[1px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[10px] font-bold text-violet-400">{numMatch[1]}</span>
              <span className="min-w-0">{renderInline(numMatch[2])}</span>
            </li>
          );
        }
        if (trimmed === "") return <div key={key} className="h-2.5" />;
        return <p key={key} className="my-1.5 text-[13.5px] leading-[1.75] theme-soft">{renderInline(trimmed)}</p>;
      });
    });
  };

  return (
    <div className="min-h-full text-text">
      <div className="px-6 py-8 pb-32">
        <div className="mx-auto w-full max-w-[820px]">
          <header className="mb-8">
            <p className="text-label font-medium uppercase tracking-[0.18em] text-text-dim">Documentation</p>
            <h1 className="mt-2 font-display text-display-sm font-semibold leading-tight tracking-tight text-text sm:text-display-md">{projectName} Docs</h1>
            <p className="mt-2 text-body leading-relaxed text-text-soft">Pick the style of documentation you want - the AI will read your project and write it for you.</p>
          </header>

          {!hasGenerated && !isGenerating ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <button type="button" onClick={() => void runGenerate("technical")} aria-label="Generate technical documentation" className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-3xl border border-black/[0.08] bg-white p-6 text-left shadow-[0_10px_32px_rgba(17,24,39,0.06)] transition hover:-translate-y-[2px] hover:border-violet-500/40 hover:shadow-[0_18px_44px_rgba(124,92,252,0.22)] dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.06] to-blue-500/[0.06] opacity-0 transition group-hover:opacity-100" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg shadow-violet-600/30 ring-1 ring-violet-700/20" style={{ backgroundColor: "#6d28d9" }}><CodeIcon className="h-6 w-6" style={{ color: "#ffffff" }} /></div>
                  <div className="relative">
                    <h3 className="text-[16px] font-bold theme-fg">Technical Documentation</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed theme-muted">Deep, engineer-ready docs. Architecture, API reference, data flows, build and deploy - everything a developer needs.</p>
                  </div>
                  <div className="relative mt-1 flex flex-wrap gap-1.5">
                    {["Architecture", "API reference", "Data flows", "Build and deploy"].map((tag) => (
                      <span key={tag} className="rounded-full bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-500/25 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-400/30">{tag}</span>
                    ))}
                  </div>
                  <div className="relative mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-600 transition group-hover:gap-2 dark:text-violet-300">
                    <span>Click card or button below to start</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
                  </div>
                </button>

                <button type="button" onClick={() => void runGenerate("overview")} aria-label="Generate plain-english overview" className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-3xl border border-black/[0.08] bg-white p-6 text-left shadow-[0_10px_32px_rgba(17,24,39,0.06)] transition hover:-translate-y-[2px] hover:border-emerald-500/40 hover:shadow-[0_18px_44px_rgba(52,211,153,0.22)] dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.06] to-amber-400/[0.06] opacity-0 transition group-hover:opacity-100" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg shadow-emerald-600/30 ring-1 ring-emerald-700/20" style={{ backgroundColor: "#047857" }}><BookIcon className="h-6 w-6" style={{ color: "#ffffff" }} /></div>
                  <div className="relative">
                    <h3 className="text-[16px] font-bold theme-fg">Plain-English Overview</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed theme-muted">A friendly, jargon-free tour. Perfect for stakeholders, family, investors, or anyone non-technical.</p>
                  </div>
                  <div className="relative mt-1 flex flex-wrap gap-1.5">
                    {["What it is", "Who its for", "How it helps", "Getting started"].map((tag) => (
                      <span key={tag} className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30">{tag}</span>
                    ))}
                  </div>
                  <div className="relative mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 transition group-hover:gap-2 dark:text-emerald-300">
                    <span>Click card or button below to start</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
                  </div>
                </button>
              </div>

              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => void runGenerate("technical")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[13px] font-semibold shadow-lg transition hover:-translate-y-[1px] sm:w-auto"
                  style={{ backgroundColor: "#6d28d9", color: "#ffffff", boxShadow: "0 10px 30px rgba(109,40,217,0.35)" }}
                >
                  <SparklesIcon className="h-4 w-4" style={{ color: "#ffffff" }} />
                  Generate Technical Docs
                </button>
                <button
                  type="button"
                  onClick={() => void runGenerate("overview")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[13px] font-semibold shadow-lg transition hover:-translate-y-[1px] sm:w-auto"
                  style={{ backgroundColor: "#047857", color: "#ffffff", boxShadow: "0 10px 30px rgba(4,120,87,0.35)" }}
                >
                  <SparklesIcon className="h-4 w-4" style={{ color: "#ffffff" }} />
                  Generate Plain-English Overview
                </button>
              </div>
              <SavedDocsPanel
                savedDocs={savedDocs}
                showHint
                onOpen={handleOpenSavedDoc}
                onDelete={handleDeleteSavedDoc}
              />
            </>
          ) : isGenerating ? (
            <div className="flex flex-col items-center rounded-3xl border border-violet-500/20 bg-violet-500/[0.04] px-8 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10">
                <svg className="h-8 w-8 animate-spin text-violet-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h2 className="mt-5 text-[18px] font-semibold theme-fg">{mode === "technical" ? "Writing technical docs..." : "Writing a friendly overview..."}</h2>
              <p className="mt-2 text-[13px] theme-muted">{progress || "Scanning your project..."}</p>
            </div>
          ) : (
            <>
              <div className={"mb-6 flex items-center justify-between rounded-2xl px-5 py-3 ring-1 " + (mode === "technical" ? "bg-violet-500/[0.06] ring-violet-500/15" : "bg-emerald-500/[0.06] ring-emerald-500/15")}>
                <div className="flex items-center gap-2.5">
                  <CheckCircleIcon className={"h-5 w-5 " + (mode === "technical" ? "text-violet-500" : "text-emerald-500")} />
                  <div>
                    <p className={"text-[13px] font-semibold " + (mode === "technical" ? "text-violet-600 dark:text-violet-400" : "text-emerald-600 dark:text-emerald-400")}>
                      {docs.length} {docs.length === 1 ? "section" : "sections"} generated
                      {saveStatus === "saving" ? <span className="theme-muted"> · Saving to docs/...</span> : null}
                      {saveStatus === "saved" ? <span className="theme-muted"> · Saved to docs/</span> : null}
                      {saveStatus === "error" ? <span className="text-red-500"> · Save failed</span> : null}
                    </p>
                    <p className="text-[11px] theme-muted">{mode === "technical" ? "Technical documentation" : "Plain-English overview"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleReset} className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-1.5 text-[11px] font-semibold theme-muted transition hover:bg-white hover:text-[var(--fg)] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]">Switch style</button>
                  <button type="button" onClick={() => mode && void runGenerate(mode)} className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-1.5 text-[11px] font-semibold theme-muted transition hover:bg-white hover:text-violet-500 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]">
                    <SparklesIcon className="h-3 w-3" />
                    Regenerate
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {docs.map((doc) => {
                  const isExpanded = expandedDoc === doc.id;
                  return (
                    <div key={doc.id} className={"overflow-hidden rounded-2xl transition app-surface shadow-[var(--shadow-card)] ring-1 " + (isExpanded ? (mode === "technical" ? "ring-violet-500/25" : "ring-emerald-500/25") : "ring-black/[0.04] dark:ring-white/[0.06]")}>
                      <button type="button" onClick={() => setExpandedDoc(isExpanded ? null : doc.id)} className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.03] text-[20px] dark:bg-white/[0.06]">{doc.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14.5px] font-semibold theme-fg">{doc.title}</p>
                          <p className="mt-0.5 text-[11px] theme-muted">{isExpanded ? "Click to collapse" : "Click to read"}</p>
                        </div>
                      </button>
                      {isExpanded ? (
                        <div className="border-t border-black/[0.04] px-5 py-5 dark:border-white/[0.06]">{renderContent(doc.content)}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <SavedDocsPanel
                savedDocs={savedDocs}
                showHint={false}
                onOpen={handleOpenSavedDoc}
                onDelete={handleDeleteSavedDoc}
              />
            </>
          )}
        </div>
      </div>

      {openSavedDoc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8" onClick={() => setOpenSavedDoc(null)}>
          <div
            className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#0d1117]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3 dark:border-white/[0.06]">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold theme-fg">{openSavedDoc.doc.filename}</p>
                <p className="text-[11px] theme-muted">{formatTimestamp(openSavedDoc.doc.timestamp)} · {formatBytes(openSavedDoc.doc.bytes)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { try { navigator.clipboard.writeText(openSavedDoc.content); } catch { /* ignore */ } }}
                  className="rounded-md px-3 py-1.5 text-[12px] font-medium theme-muted transition hover:bg-black/[0.04] hover:theme-fg dark:hover:bg-white/[0.06]"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setOpenSavedDoc(null)}
                  className="rounded-md bg-black/[0.05] px-3 py-1.5 text-[12px] font-medium theme-fg transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-5 py-5">
              {renderContent(openSavedDoc.content)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
