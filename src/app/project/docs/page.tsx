"use client";

import { useState } from "react";
import ProjectSidebar from "@/components/project-sidebar";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

/* ─── Icons ─── */
function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10 1l.894 3.553a3.5 3.5 0 002.553 2.553L17 8l-3.553.894a3.5 3.5 0 00-2.553 2.553L10 15l-.894-3.553a3.5 3.5 0 00-2.553-2.553L3 8l3.553-.894a3.5 3.5 0 002.553-2.553L10 1z" />
      <path d="M15 11l.447 1.776a1.75 1.75 0 001.277 1.277L18.5 14.5l-1.776.447a1.75 1.75 0 00-1.277 1.277L15 18l-.447-1.776a1.75 1.75 0 00-1.277-1.277L11.5 14.5l1.776-.447a1.75 1.75 0 001.277-1.277L15 11z" />
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

/* ─── Types ─── */
interface GeneratedDoc {
  id: string;
  title: string;
  emoji: string;
  content: string;
}

/* ─── Page ─── */
export default function DocumentationPage() {
  const { activeProject } = useActiveDesktopProject();
  const projectName = activeProject?.name ?? "Your Project";

  const [isGenerating, setIsGenerating] = useState(false);
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const hasGenerated = docs.length > 0;

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setDocs([
        {
          id: "overview",
          title: "Project Overview",
          emoji: "📖",
          content: `# ${projectName}\n\nThis project is built with Next.js and TypeScript. It provides a collaborative workspace for AI-assisted software development.\n\n## What it does\nA desktop app that helps you plan, build, and manage software projects with AI assistance. It includes a project manager chat, a coding IDE, file browsing, and more.\n\n## Tech Stack\n- **Next.js 16** — React framework\n- **Tailwind CSS** — Styling\n- **Electron 41** — Desktop shell\n- **Monaco Editor** — Code editing`,
        },
        {
          id: "getting-started",
          title: "Getting Started",
          emoji: "🚀",
          content: `# Getting Started\n\n## 1. Install dependencies\n\`\`\`bash\nnpm install\n\`\`\`\n\n## 2. Run the app in development\n\`\`\`bash\nnpm run dev\n\`\`\`\n\n## 3. Build for desktop\n\`\`\`bash\nnpm run build:electron\n\`\`\`\n\nThat's it! The app will open in an Electron window.`,
        },
        {
          id: "structure",
          title: "Project Structure",
          emoji: "📁",
          content: `# Project Structure\n\n\`\`\`\nsrc/\n  app/           → Pages and routes\n  components/    → Reusable UI components\n  hooks/         → Custom React hooks\n  lib/           → Utilities and types\nelectron/\n  main.js        → Electron main process\n  preload.js     → IPC bridge\n  services/      → Backend services\n\`\`\`\n\n## Key Pages\n- **/project** — Dashboard with tasks and action items\n- **/project/chat** — PM Chat for planning\n- **/project/code** — Freestyle coding IDE\n- **/project/files** — File browser\n- **/project/preview** — Run and preview the app`,
        },
        {
          id: "api",
          title: "API & IPC",
          emoji: "⚡",
          content: `# API & IPC Handlers\n\nThe app communicates between the frontend and Electron backend using IPC (Inter-Process Communication).\n\n## Available Handlers\n- **project:list** — Get all tracked projects\n- **project:open** — Open a project by path\n- **repo:status** — Get Git status\n- **repo:listDirectory** — Browse files\n- **repo:readFileContent** — Read a file\n- **process:run** — Run terminal commands`,
        },
      ]);
      setIsGenerating(false);
      setExpandedDoc("overview");
    }, 2000);
  };

  const handleRegenerate = () => {
    setDocs([]);
    setExpandedDoc(null);
    handleGenerate();
  };

  /* ─── Simple markdown renderer ─── */
  const renderContent = (text: string) => {
    const blocks = text.split(/(```[\s\S]*?```)/g);
    return blocks.map((block, bi) => {
      if (block.startsWith("```") && block.endsWith("```")) {
        const inner = block.slice(3, -3);
        const firstNl = inner.indexOf("\n");
        const code = firstNl > 0 ? inner.slice(firstNl + 1) : inner;
        return (
          <pre key={bi} className="my-3 overflow-x-auto rounded-xl bg-[#0d1117] px-4 py-3 font-mono text-[12px] leading-[1.7] text-green-300/90 ring-1 ring-white/[0.06]">
            <code>{code}</code>
          </pre>
        );
      }
      return block.split("\n").map((line, li) => {
        const key = `${bi}-${li}`;
        if (line.startsWith("## ")) return <h2 key={key} className="mt-5 text-[15px] font-bold theme-fg">{line.slice(3)}</h2>;
        if (line.startsWith("# ")) return <h1 key={key} className="mb-2 text-[18px] font-bold theme-fg">{line.slice(2)}</h1>;
        if (line.startsWith("- **")) {
          const match = line.match(/^- \*\*(.+?)\*\*\s*[—–-]\s*(.+)/);
          if (match) return <li key={key} className="ml-4 text-[13px] leading-relaxed theme-soft"><strong className="font-semibold theme-fg">{match[1]}</strong> — {match[2]}</li>;
          return <li key={key} className="ml-4 text-[13px] leading-relaxed theme-soft">{line.slice(2)}</li>;
        }
        if (line.startsWith("- ")) return <li key={key} className="ml-4 text-[13px] leading-relaxed theme-soft">{line.slice(2)}</li>;
        if (line.trim() === "") return <div key={key} className="h-2" />;
        return <p key={key} className="text-[13px] leading-relaxed theme-soft">{line}</p>;
      });
    });
  };

  return (
    <div className="flex min-h-full bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="min-w-0 flex-1 px-5 pb-32 pt-[5.6rem] sm:px-6 xl:px-8">
        <div className="mx-auto w-full max-w-[780px]">

          {/* ─── Header ─── */}
          <header className="mb-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] theme-muted">Documentation</p>
            <h1 className="mt-2 display-font text-[2rem] font-semibold leading-tight tracking-tight theme-fg sm:text-[2.4rem]">
              {projectName} Docs
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed theme-muted">
              Auto-generate documentation for your project in one click.
            </p>
          </header>

          {/* ─── Generate CTA or regenerate ─── */}
          {!hasGenerated && !isGenerating ? (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-black/[0.08] bg-white/40 px-8 py-16 text-center dark:border-white/[0.1] dark:bg-white/[0.02]">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-blue-500/15">
                <SparklesIcon className="h-8 w-8 text-violet-400" />
              </div>
              <h2 className="mt-5 text-[18px] font-semibold theme-fg">Generate your docs</h2>
              <p className="mt-2 max-w-sm text-[13px] leading-relaxed theme-muted">
                The AI will scan your project and create documentation automatically — a README, getting started guide, project structure, and API reference.
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-6 py-3 text-[14px] font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:opacity-90"
              >
                <SparklesIcon className="h-4 w-4" />
                Generate Documentation
              </button>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-col items-center rounded-3xl border border-violet-500/20 bg-violet-500/[0.04] px-8 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10">
                <svg className="h-8 w-8 animate-spin text-violet-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h2 className="mt-5 text-[18px] font-semibold theme-fg">Generating docs…</h2>
              <p className="mt-2 text-[13px] theme-muted">Scanning your project files and creating documentation.</p>
            </div>
          ) : (
            <>
              {/* ─── Success banner ─── */}
              <div className="mb-6 flex items-center justify-between rounded-2xl bg-emerald-500/[0.06] px-5 py-3 ring-1 ring-emerald-500/15">
                <div className="flex items-center gap-2.5">
                  <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
                  <p className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
                    {docs.length} sections generated
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-1.5 text-[11px] font-semibold theme-muted transition hover:bg-white hover:text-violet-500 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                >
                  <SparklesIcon className="h-3 w-3" />
                  Regenerate
                </button>
              </div>

              {/* ─── Doc cards ─── */}
              <div className="space-y-3">
                {docs.map((doc) => {
                  const isExpanded = expandedDoc === doc.id;
                  return (
                    <div
                      key={doc.id}
                      className={`overflow-hidden rounded-2xl transition app-surface shadow-[var(--shadow-card)] ring-1 ${isExpanded ? "ring-violet-500/20" : "ring-black/[0.04] dark:ring-white/[0.06]"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                        className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/[0.03] text-[18px] dark:bg-white/[0.06]">
                          {doc.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold theme-fg">{doc.title}</p>
                        </div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`h-4 w-4 theme-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        >
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {isExpanded ? (
                        <div className="border-t border-black/[0.04] px-5 py-5 dark:border-white/[0.06]">
                          {renderContent(doc.content)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
