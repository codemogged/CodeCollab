"use client";

import React, { useState, useMemo } from "react";
import { buildRunSummary, type RunSummary, type RunSummarySection, type RunStatus, type ResponseMode, type ActionStep } from "@/lib/run-summary";
import { RunInTerminalButton } from "./run-in-terminal-button";

/* ═══════════════════════════════════════════════════════════════
   RunSummaryCard — mode-aware response renderer
   ═══════════════════════════════════════════════════════════════
   Renders AI responses using the mode determined by the summary
   engine. Explanatory answers get a clean conversational layout.
   Task executions get structured sections. Analysis gets its own
   treatment. Each mode only shows sections with strong evidence.
   ═══════════════════════════════════════════════════════════════ */

// ─── Status config ────────────────────────────────────────────

const STATUS_CONFIG: Record<RunStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  success: {
    label: "Completed",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
      </svg>
    ),
  },
  partial: {
    label: "Partially completed",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
    ),
  },
  warning: {
    label: "Completed with notes",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
    ),
  },
  blocked: {
    label: "Blocked",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm2.78-4.22a.75.75 0 0 1-1.06 0L8 9.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L6.94 8 5.22 6.28a.75.75 0 0 1 1.06-1.06L8 6.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L9.06 8l1.72 1.72a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
      </svg>
    ),
  },
  info: {
    label: "Response",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
        <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
      </svg>
    ),
  },
};

// Mode-specific status icons for conversational/analysis modes
const MODE_ICONS: Partial<Record<ResponseMode, React.ReactNode>> = {
  conversational: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M1 8.74c0 .983.713 1.825 1.69 1.943.764.092 1.534.164 2.31.216v2.351a.75.75 0 0 0 1.28.53l2.51-2.51c.182-.181.427-.284.684-.288a44.78 44.78 0 0 0 3.837-.153A1.98 1.98 0 0 0 15 8.74V4.26c0-.983-.713-1.825-1.69-1.943A44.9 44.9 0 0 0 8 2a44.9 44.9 0 0 0-5.31.317A1.98 1.98 0 0 0 1 4.26v4.482Z" clipRule="evenodd" />
    </svg>
  ),
  analysis: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
    </svg>
  ),
  instructional: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M8 1a.75.75 0 0 1 .75.75V6h4.5a.75.75 0 0 1 0 1.5h-4.5v4.25a.75.75 0 0 1-1.5 0V7.5h-4.5a.75.75 0 0 1 0-1.5h4.5V1.75A.75.75 0 0 1 8 1Z" />
      <path d="M2.75 12.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" />
    </svg>
  ),
};

// ─── Section icon ─────────────────────────────────────────────

function SectionIcon({ heading }: { heading: string }) {
  const h = heading.toLowerCase();
  // Purpose / core / goal
  if (h.includes("purpose") || h.includes("goal") || h.includes("mission") || h.includes("core")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-emerald-500 dark:text-emerald-400">
        <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 12.07l-3.136 1.924a.75.75 0 0 1-1.12-.814l.853-3.574-2.791-2.39a.75.75 0 0 1 .428-1.318l3.664-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
      </svg>
    );
  }
  // Architecture / structure / stack
  if (h.includes("architecture") || h.includes("structure") || h.includes("stack") || h.includes("design")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-blue-500 dark:text-blue-400">
        <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
      </svg>
    );
  }
  // Features / completed / built
  if (h.includes("feature") || h.includes("completed") || h.includes("built") || h.includes("implemented") || h.includes("capabilit")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-green-500 dark:text-green-400">
        <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
      </svg>
    );
  }
  // Technical / database / API
  if (h.includes("database") || h.includes("api") || h.includes("backend") || h.includes("frontend") || h.includes("technical") || h.includes("schema")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-cyan-500 dark:text-cyan-400">
        <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (h.includes("changed") || h.includes("change")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-green-500 dark:text-green-400">
        <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.306a1 1 0 0 0-.26.445l-.95 3.168a.75.75 0 0 0 .927.927l3.168-.95a1 1 0 0 0 .445-.26l7.793-7.793a1.75 1.75 0 0 0 0-2.475l-.855-.855Z" />
      </svg>
    );
  }
  if (h.includes("command")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-cyan-500 dark:text-cyan-400">
        <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (h.includes("check") || h.includes("verif") || h.includes("inspect") || h.includes("finding")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-blue-500 dark:text-blue-400">
        <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (h.includes("recommend")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-emerald-500 dark:text-emerald-400">
        <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (h.includes("key point")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-violet-500 dark:text-violet-400">
        <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 12.07l-3.136 1.924a.75.75 0 0 1-1.12-.814l.853-3.574-2.791-2.39a.75.75 0 0 1 .428-1.318l3.664-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (h.includes("next") || h.includes("remaining") || h.includes("how") || h.includes("use") || h.includes("step") || h.includes("future") || h.includes("todo")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-violet-500 dark:text-violet-400">
        <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (h.includes("gap") || h.includes("caveat") || h.includes("note") || h.includes("warning") || h.includes("limitation")) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-amber-500 dark:text-amber-400">
        <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 theme-muted">
      <path fillRule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm.75 3.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Inline formatting ────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code key={i} className="rounded-[0.25rem] bg-black/[0.04] px-1.5 py-[1px] font-code text-[0.86em] dark:bg-white/[0.06] text-violet-600/90 dark:text-violet-400/90">
          {part.slice(1, -1)}
        </code>,
      );
    } else {
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      boldParts.forEach((bp, j) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          nodes.push(<strong key={`${i}-${j}`} className="font-semibold">{bp.slice(2, -2)}</strong>);
        } else if (bp) {
          nodes.push(<span key={`${i}-${j}`}>{bp}</span>);
        }
      });
    }
  });
  return nodes;
}

// ─── Summary section renderer ─────────────────────────────────

function SummarySection({ heading, items }: { heading: string; items: string[] }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mt-5 first:mt-0">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="group/sec flex w-full items-center gap-2.5 text-left"
      >
        <SectionIcon heading={heading} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] theme-muted">{heading}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`ml-auto h-2.5 w-2.5 theme-muted opacity-0 group-hover/sec:opacity-50 transition-opacity ${collapsed ? "" : "rotate-180"}`}
        >
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {!collapsed && (
        <ul className="mt-2.5 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-[1.65] theme-soft">
              <span className="mt-[8px] h-[3px] w-[3px] shrink-0 rounded-full bg-current opacity-25" />
              <span className="min-w-0">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Shell syntax highlighting ────────────────────────────────

function highlightShell(code: string): React.ReactNode[] {
  // Split into lines, highlight each
  return code.split("\n").map((line, lineIdx) => {
    const nodes: React.ReactNode[] = [];
    // Tokenize: strings, comments, flags, commands, URLs, continuation
    const tokenRe = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(#.*)|(\\$)|(--?[\w-]+)|(https?:\/\/\S+|localhost:\d+\S*)|((?:curl|node|npm|npx|git|pip|python|docker|cargo|mkdir|cd|sh|bash|cat|echo|rm|cp|mv|ls|grep|sed|awk|chmod|chown|export|source|which|wget|tar|unzip|apt|brew|yarn|pnpm)\b)|(\$[\w{][\w}]*)|([^"'#\\$-]+|.)/g;
    let match: RegExpExecArray | null;
    let ki = 0;
    while ((match = tokenRe.exec(line)) !== null) {
      const [full, str, comment, cont, flag, url, cmd, envVar] = match;
      if (str) {
        nodes.push(<span key={ki++} className="text-emerald-400">{full}</span>);
      } else if (comment) {
        nodes.push(<span key={ki++} className="text-white/25 italic">{full}</span>);
      } else if (cont) {
        nodes.push(<span key={ki++} className="text-white/30">{full}</span>);
      } else if (flag) {
        nodes.push(<span key={ki++} className="text-sky-400/80">{full}</span>);
      } else if (url) {
        nodes.push(<span key={ki++} className="text-amber-300/80">{full}</span>);
      } else if (cmd) {
        nodes.push(<span key={ki++} className="text-violet-400 font-semibold">{full}</span>);
      } else if (envVar) {
        nodes.push(<span key={ki++} className="text-orange-400/80">{full}</span>);
      } else {
        nodes.push(<span key={ki++}>{full}</span>);
      }
    }
    if (lineIdx < code.split("\n").length - 1) {
      nodes.push(<br key={`br-${lineIdx}`} />);
    }
    return nodes;
  }).flat();
}

// ─── CommandBlock — premium code block with copy ──────────────

function CommandBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const displayLang = lang || detectLang(code);

  function detectLang(c: string): string {
    if (/^\s*(?:curl|wget|npm|npx|node|git|pip|python|docker|cargo|mkdir|cd|sh|bash|echo|export|source|chmod|apt|brew|yarn|pnpm)\b/m.test(c)) return "Bash";
    if (/^\s*(?:SELECT|INSERT|CREATE|ALTER|DROP|UPDATE|DELETE)\b/im.test(c)) return "SQL";
    if (/^\s*(?:import |from |def |class )\b/m.test(c)) return "Python";
    if (/^\s*(?:const |let |var |function |import |export )\b/m.test(c)) return "JavaScript";
    return "Shell";
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isShellLike = /^(?:bash|shell|sh|zsh|console|terminal)$/i.test(displayLang);

  return (
    <div className="group/cmd rounded-lg overflow-hidden bg-[#1a1d23] dark:bg-[#141619] ring-1 ring-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.06] border-b border-white/[0.08]">
        <div className="flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-white/70">
            <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
          </svg>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/85">{displayLang}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RunInTerminalButton code={code} lang={displayLang} variant="muted" />
          <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white/85 transition hover:text-white hover:bg-white/[0.06]"
        >
          {copied ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-emerald-400">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path d="M10.5 2.25a.75.75 0 0 0-1.5 0v1a.75.75 0 0 0 1.5 0v-1ZM5.5 13a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5ZM4.75 6a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5ZM4.75 9.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" />
                <path fillRule="evenodd" d="M3 1.75A.75.75 0 0 1 3.75 1h8.5a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V1.75Zm1.5.75v11h7v-11h-7Z" clipRule="evenodd" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
        </div>
      </div>
      {/* Code content */}
      <div className="overflow-x-auto px-3.5 py-3">
        <pre className="font-code text-[11.5px] leading-[1.65] text-white/85 whitespace-pre">
          <code>{isShellLike ? highlightShell(code) : code}</code>
        </pre>
      </div>
    </div>
  );
}

// ─── Rich action steps renderer ───────────────────────────────

function ActionStepsSection({ heading, steps }: { heading: string; steps: ActionStep[] }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="flex items-center gap-2 mb-3">
        <SectionIcon heading={heading} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] theme-muted">{heading}</span>
      </div>
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/[0.08] text-[10px] font-bold text-violet-600/80 dark:bg-violet-400/10 dark:text-violet-400/80">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-display text-[13px] font-medium leading-[1.5] tracking-[-0.01em] theme-fg">{renderInline(step.title)}</p>
              {step.details.length > 0 && (
                <div className="space-y-2">
                  {step.details.map((detail, j) => {
                    // Fenced code block (multi-line) — route to CommandBlock
                    const fenceMatch = detail.match(/^```(\w*)\n([\s\S]*?)\n```$/);
                    if (fenceMatch) {
                      const lang = fenceMatch[1] || undefined;
                      const codeContent = fenceMatch[2];
                      return <CommandBlock key={j} code={codeContent} lang={lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : undefined} />;
                    }

                    // Single-line command — route to CommandBlock
                    const stripped = detail.replace(/^`|`$/g, "");
                    const isCommand = /^`[^`]+`$/.test(detail) || /^(?:npm|npx|node|git|pip|python|curl|docker|cargo|mkdir|cd|sh|bash|echo|export)\s/i.test(detail);
                    if (isCommand) {
                      return <CommandBlock key={j} code={stripped} />;
                    }

                    // URL — render as a clickable-looking code line
                    const isUrl = /^https?:\/\//.test(detail) || /^localhost[:/]/.test(detail);
                    if (isUrl) {
                      return <CommandBlock key={j} code={detail} />;
                    }

                    // Validation / success criteria — muted helper text
                    const isExpect = /^(?:expect|you should see|output|response|result|all |should |move to|when |this should|success|the (?:created|updated|new) )/i.test(detail);
                    if (isExpect) {
                      return (
                        <p key={j} className="flex items-start gap-1.5 text-[11.5px] leading-[1.6] tracking-[-0.003em] theme-muted">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="mt-[2px] h-3 w-3 shrink-0 text-emerald-500/50">
                            <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
                          </svg>
                          {renderInline(detail)}
                        </p>
                      );
                    }

                    // Regular prose helper text
                    return <p key={j} className="text-[12px] leading-[1.65] tracking-[-0.003em] theme-soft">{renderInline(detail)}</p>;
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Full response detail (collapsed by default) ──────────────

function FullResponseDetail({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group/full flex items-center gap-1.5 text-left"
      >
        <span className="text-[10.5px] font-medium theme-muted opacity-40 group-hover/full:opacity-70 transition-opacity">{open ? "Hide full response" : "View full response"}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-2.5 w-2.5 theme-muted opacity-50 group-hover/full:opacity-80 transition ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="mt-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.025] px-5 py-4">
          <div className="whitespace-pre-wrap text-[12.5px] leading-[1.75] tracking-[-0.003em] theme-muted break-words">{text}</div>
        </div>
      )}
    </div>
  );
}

// ─── Section list (dispatches to rich or plain) ───────────────

function SectionList({ sections }: { sections: RunSummarySection[] }) {
  if (sections.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-black/[0.04] dark:border-white/[0.04]">
      {sections.map((section) =>
        section.actionSteps && section.actionSteps.length > 0 ? (
          <ActionStepsSection key={section.heading} heading={section.heading} steps={section.actionSteps} />
        ) : (
          <SummarySection key={section.heading} heading={section.heading} items={section.items} />
        ),
      )}
    </div>
  );
}

// ─── Conversational / prose renderer ──────────────────────────

function ConversationalCard({ summary, className }: { summary: RunSummary; className: string }) {
  const sc = STATUS_CONFIG[summary.status];
  const displayText = summary.summaryText || summary.outcome;

  return (
    <div className={`rounded-2xl bg-white/80 dark:bg-white/[0.035] ring-1 ring-black/[0.04] dark:ring-white/[0.05] ${className}`}>
      <div className="px-5 pt-4 pb-4">
        {/* ── Status whisper ── */}
        <div className="flex items-center gap-1.5 mb-3">
          <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${sc.color}`}>
            <div className="scale-[0.65]">{sc.icon}</div>
          </div>
          <span className={`text-[10px] font-semibold tracking-[0.02em] ${sc.color}`}>{summary.statusLabel}</span>
        </div>

        {/* ── Summary body ── */}
        {displayText && (
          <div className="space-y-3">
            {displayText.split("\n\n").map((para, i) => (
              <p key={i} className="text-[13.5px] leading-[1.7] theme-fg">{renderInline(para)}</p>
            ))}
          </div>
        )}

        {/* ── Sections ── */}
        <SectionList sections={summary.sections} />

        {/* ── Full response toggle ── */}
        <FullResponseDetail text={summary.fullText} />
      </div>
    </div>
  );
}

// ─── Structured (task execution) renderer ─────────────────────

function StructuredCard({ summary, className }: { summary: RunSummary; className: string }) {
  const sc = STATUS_CONFIG[summary.status];

  return (
    <div className={`rounded-2xl bg-white/80 dark:bg-white/[0.035] ring-1 ring-black/[0.04] dark:ring-white/[0.05] ${className}`}>
      <div className="px-5 pt-4 pb-4">
        {/* ── Status + outcome ── */}
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${sc.color}`}>
            <div className="scale-[0.65]">{sc.icon}</div>
          </div>
          <span className={`text-[10px] font-semibold tracking-[0.02em] ${sc.color}`}>{summary.statusLabel || sc.label}</span>
        </div>

        {summary.outcome && (
          <p className="mt-2.5 text-[13.5px] leading-[1.7] theme-fg">{renderInline(summary.outcome)}</p>
        )}

        {/* ── Model summary body ── */}
        {summary.hasModelSummary && summary.summaryText && (
          <div className="mt-3 space-y-3">
            {summary.summaryText.split("\n\n").map((para, i) => (
              <p key={i} className="text-[13.5px] leading-[1.7] theme-fg">{renderInline(para)}</p>
            ))}
          </div>
        )}

        {/* ── Sections ── */}
        <SectionList sections={summary.sections} />

        {/* ── Full response ── */}
        <FullResponseDetail text={summary.fullText} />
      </div>
    </div>
  );
}


// ─── Main component ──────────────────────────────────────────

export default function RunSummaryCard({ text, className = "" }: { text: string; className?: string }) {
  const summary = useMemo(() => buildRunSummary(text), [text]);

  if (!summary.hasSummary) {
    return (
      <div className={`rounded-2xl bg-white/80 dark:bg-white/[0.035] ring-1 ring-black/[0.04] dark:ring-white/[0.05] px-5 py-4 ${className}`}>
        <div className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.7] theme-fg">{text}</div>
      </div>
    );
  }

  if (summary.hasModelSummary) {
    return <ConversationalCard summary={summary} className={className} />;
  }

  if (summary.mode === "conversational" || summary.mode === "plain" || summary.mode === "instructional") {
    return <ConversationalCard summary={summary} className={className} />;
  }

  if (summary.mode === "analysis") {
    return <ConversationalCard summary={summary} className={className} />;
  }

  return <StructuredCard summary={summary} className={className} />;
}
