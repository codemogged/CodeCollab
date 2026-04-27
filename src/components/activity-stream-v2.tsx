"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { StreamEventParser, type ActivityEvent, type ActivityKind } from "@/lib/stream-event-parser";
import { RunInTerminalButton } from "./run-in-terminal-button";

/* ═══════════════════════════════════════════════════════════════
   ActivityStream v2 – event-based execution timeline
   ═══════════════════════════════════════════════════════════════
   Accepts EITHER:
     • events: ActivityEvent[]   – pre-parsed (live streaming)
     • text: string              – raw text (saved messages,
                                   parsed on render via StreamEventParser)
   ═══════════════════════════════════════════════════════════════ */

// ─── Helpers ──────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  const cleaned = s.replace(/[`"']/g, "").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

// ─── Icons ────────────────────────────────────────────────────

function ActivityIcon({ kind, isActive }: { kind: ActivityKind; isActive: boolean }) {
  const configs: Record<ActivityKind, { activeBg: string; activeText: string; icon: React.ReactNode }> = {
    thinking: {
      activeBg: "bg-violet-500/10",
      activeText: "text-violet-500 dark:text-violet-400",
      icon: <path d="M8 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 1ZM10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM12.95 4.11a.75.75 0 1 0-1.06-1.06l-1.062 1.06a.75.75 0 0 0 1.061 1.062l1.06-1.062ZM15 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 15 8ZM11.889 12.95a.75.75 0 0 0 1.06-1.06l-1.06-1.062a.75.75 0 0 0-1.062 1.061l1.062 1.06ZM8 12a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 12ZM5.172 11.889a.75.75 0 0 0-1.061-1.062l-1.06 1.061a.75.75 0 1 0 1.06 1.06l1.06-1.06ZM4 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 4 8ZM4.11 5.172A.75.75 0 0 0 5.173 4.11L4.11 3.05a.75.75 0 1 0-1.06 1.06l1.06 1.062Z" />,
    },
    read: {
      activeBg: "bg-blue-500/10",
      activeText: "text-blue-500 dark:text-blue-400",
      icon: <path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 12.5 5H7.621a1.5 1.5 0 0 1-1.06-.44L5.439 3.44A1.5 1.5 0 0 0 4.378 3H3.5Z" />,
    },
    search: {
      activeBg: "bg-amber-500/10",
      activeText: "text-amber-500 dark:text-amber-400",
      icon: <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />,
    },
    edit: {
      activeBg: "bg-green-500/10",
      activeText: "text-green-500 dark:text-green-400",
      icon: <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.306a1 1 0 0 0-.26.445l-.95 3.168a.75.75 0 0 0 .927.927l3.168-.95a1 1 0 0 0 .445-.26l7.793-7.793a1.75 1.75 0 0 0 0-2.475l-.855-.855Z" />,
    },
    run: {
      activeBg: "bg-cyan-500/10",
      activeText: "text-cyan-500 dark:text-cyan-400",
      icon: <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />,
    },
    list: {
      activeBg: "bg-indigo-500/10",
      activeText: "text-indigo-500 dark:text-indigo-400",
      icon: <path fillRule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm.75 3.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" clipRule="evenodd" />,
    },
    result: {
      activeBg: "bg-emerald-500/10",
      activeText: "text-emerald-500 dark:text-emerald-400",
      icon: <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />,
    },
    error: {
      activeBg: "bg-red-500/10",
      activeText: "text-red-500 dark:text-red-400",
      icon: <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />,
    },
    system: {
      activeBg: "bg-black/[0.03] dark:bg-white/[0.04]",
      activeText: "theme-muted",
      icon: <path fillRule="evenodd" d="M6.455 1.45A.5.5 0 0 1 6.952 1h2.096a.5.5 0 0 1 .497.45l.186 1.858a4.996 4.996 0 0 1 1.466.848l1.703-.769a.5.5 0 0 1 .639.206l1.048 1.814a.5.5 0 0 1-.142.656l-1.517 1.09a5.026 5.026 0 0 1 0 1.694l1.517 1.09a.5.5 0 0 1 .142.656l-1.048 1.814a.5.5 0 0 1-.639.206l-1.703-.769c-.433.36-.928.647-1.466.848l-.186 1.858a.5.5 0 0 1-.497.45H6.952a.5.5 0 0 1-.497-.45l-.186-1.858a4.993 4.993 0 0 1-1.466-.848l-1.703.769a.5.5 0 0 1-.639-.206L1.413 10.6a.5.5 0 0 1 .142-.656l1.517-1.09a5.026 5.026 0 0 1 0-1.694l-1.517-1.09a.5.5 0 0 1-.142-.656L2.46 3.6a.5.5 0 0 1 .639-.206l1.703.769c.433-.36.928-.647 1.466-.848l.186-1.858ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" clipRule="evenodd" />,
    },
  };

  const c = configs[kind] || configs.system;
  return (
    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${isActive ? c.activeBg : "bg-black/[0.03] dark:bg-white/[0.04]"}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${isActive ? c.activeText : "theme-muted"}`}>
        {c.icon}
      </svg>
    </div>
  );
}

// ─── Phase label ──────────────────────────────────────────────

const PHASE_LABELS: Record<ActivityKind, string> = {
  thinking: "Thinking",
  read: "Reading",
  search: "Searching",
  edit: "Editing",
  run: "Running",
  list: "Listing",
  result: "Done",
  error: "Error",
  system: "System",
};

const PHASE_COLORS: Record<ActivityKind, string> = {
  thinking: "text-violet-500 dark:text-violet-400",
  read: "text-blue-500 dark:text-blue-400",
  search: "text-amber-600 dark:text-amber-400",
  edit: "text-green-600 dark:text-green-400",
  run: "text-cyan-600 dark:text-cyan-400",
  list: "text-indigo-500 dark:text-indigo-400",
  result: "text-emerald-600 dark:text-emerald-400",
  error: "text-red-500 dark:text-red-400",
  system: "theme-muted",
};

// ─── Inline markdown helpers ──────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code key={i} className="rounded bg-black/[0.05] px-1 py-0.5 font-code text-[0.86em] dark:bg-white/[0.08] text-violet-600 dark:text-violet-400">
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

// ─── Markdown table renderer ─────────────────────────────────

function MarkdownTable({ lines }: { lines: string[] }) {
  const isSeparator = (l: string) => /^\|[\s\-:|]+\|$/.test(l);
  const parseRow = (line: string) =>
    line.split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1).map(cell => cell.trim());

  const headerLine = lines[0];
  const dataLines = lines.filter((_, i) => i > 0 && !isSeparator(lines[i]));

  if (!headerLine) return null;
  const headers = parseRow(headerLine);
  const rows = dataLines.map(parseRow);

  return (
    <div className="my-1.5 overflow-x-auto rounded-md border border-black/[0.06] dark:border-white/[0.06]">
      <table className="w-full text-[11.5px] tracking-[-0.003em]">
        <thead>
          <tr className="border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02]">
            {headers.map((h, i) => (
              <th key={i} className="px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] theme-muted whitespace-nowrap">
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 border-black/[0.04] dark:border-white/[0.04]">
              {row.map((cell, j) => (
                <td key={j} className="px-2.5 py-1.5 text-[11.5px] tracking-[-0.003em] theme-soft">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Body renderer ────────────────────────────────────────────

function EventBody({ body, kind }: { body: string; kind: ActivityKind }) {
  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      idx++;
      while (idx < lines.length && !lines[idx].trim().startsWith("```")) {
        codeLines.push(lines[idx]);
        idx++;
      }
      if (idx < lines.length) idx++;
      const code = codeLines.join("\n");
      elements.push(
        <CollapsibleCode key={elements.length} lang={lang} code={code} lineCount={codeLines.length} />,
      );
      continue;
    }

    // Horizontal rule
    if (/^[-_*]{3,}$/.test(trimmed)) {
      elements.push(<hr key={elements.length} className="my-2 border-black/[0.06] dark:border-white/[0.06]" />);
      idx++;
      continue;
    }

    // Heading
    const hm = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      elements.push(
        <div key={elements.length} className="mt-2.5 mb-1 first:mt-0">
          {hm[1].length <= 2
            ? <span className="font-display text-[13px] font-semibold tracking-[-0.01em] theme-fg">{renderInline(hm[2])}</span>
            : <span className="font-display text-[12px] font-medium tracking-[-0.006em] theme-fg">{renderInline(hm[2])}</span>}
        </div>,
      );
      idx++;
      continue;
    }

    // Markdown table (lines starting with |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1)) {
      const tableLines: string[] = [];
      while (idx < lines.length && lines[idx].trim().startsWith("|")) {
        tableLines.push(lines[idx].trim());
        idx++;
      }
      if (tableLines.length >= 2) {
        elements.push(<MarkdownTable key={elements.length} lines={tableLines} />);
      } else {
        elements.push(
          <p key={elements.length} className="text-[12.5px] leading-[1.65] tracking-[-0.003em] theme-soft">{renderInline(tableLines[0])}</p>,
        );
      }
      continue;
    }

    // Bullet / numbered list
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (idx < lines.length && (/^\s*[-*]\s+/.test(lines[idx]) || /^\s*\d+\.\s+/.test(lines[idx]))) {
        items.push(lines[idx].replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, ""));
        idx++;
      }
      elements.push(
        <ul key={elements.length} className="my-1 space-y-0.5 pl-0.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5 text-[12.5px] tracking-[-0.003em] theme-soft">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-violet-500/40" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Empty line
    if (trimmed === "") { idx++; continue; }

    // Regular text
    elements.push(
      <p key={elements.length} className="text-[12.5px] leading-[1.65] tracking-[-0.003em] theme-soft">
        {renderInline(line)}
      </p>,
    );
    idx++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Collapsible code block ──────────────────────────────────

function CollapsibleCode({ lang, code, lineCount }: { lang: string; code: string; lineCount: number }) {
  const [collapsed, setCollapsed] = useState(lineCount > 12);
  const displayLang = lang || "text";

  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-black/[0.08] dark:border-white/[0.06]">
      <div className="flex cursor-pointer items-center justify-between bg-[#0d1117] px-3 py-1.5 border-b border-white/[0.08]" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/85">{displayLang}</span>
          <span className="text-[10px] font-medium text-white/55">{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <RunInTerminalButton code={code} lang={lang} variant="muted" />
          <button type="button" onClick={(e) => { e.stopPropagation(); try { navigator.clipboard.writeText(code); } catch { /* */ } }} className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-white/85 hover:text-white transition">Copy</button>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 text-white/75 transition ${collapsed ? "" : "rotate-180"}`}>
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      {!collapsed && (
        <pre className="overflow-x-auto bg-[#0d1117] px-3 py-2 font-code text-[11px] leading-[1.6] text-white/95 dark:bg-[#0a0e14]">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

// ─── Unified activity row (v61: action type only) ───────────

function ActivityRow({ event, isLast, isStreaming }: {
  event: ActivityEvent;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const isActive = isLast && isStreaming;
  // v61: current (last) item auto-expanded, previous items collapsed
  const [expanded, setExpanded] = useState(isActive);

  // Auto-expand when this becomes the active item, collapse when superseded
  useEffect(() => {
    setExpanded(isActive);
  }, [isActive]);

  const hasBody = event.body.trim().length > 0;

  // System events → minimal inline
  if (event.kind === "system") {
    const sysText = event.body.trim();
    if (!sysText) return null;
    return (
      <div className="flex items-center gap-2.5 py-0.5">
        <ActivityIcon kind="system" isActive={isActive} />
        <span className="text-[11px] theme-muted italic tracking-[-0.003em]">{truncate(sysText, 60)}</span>
        {isActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500/60" />}
      </div>
    );
  }

  return (
    <div className={`group relative ${isLast ? "" : "pb-0.5"}`}>
      {/* Timeline connector */}
      {!isLast && <div className="absolute left-3 top-7 bottom-0 w-px bg-black/[0.06] dark:bg-white/[0.06]" />}

      {/* Header: action type only */}
      <div className={`flex items-center gap-2.5 py-0.5 ${hasBody ? "cursor-pointer" : ""}`} onClick={hasBody ? () => setExpanded(!expanded) : undefined}>
        <ActivityIcon kind={event.kind} isActive={isActive} />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] shrink-0 ${PHASE_COLORS[event.kind] || "theme-muted"}`}>
            {PHASE_LABELS[event.kind] || "Activity"}
          </span>
          {isActive && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500/60" />}
        </div>
        {hasBody && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 shrink-0 theme-muted transition ${expanded ? "rotate-180" : ""} ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {/* Body – auto-expanded for current, collapsed for previous */}
      {expanded && hasBody && (
        <div className={`ml-[34px] mt-1 mb-1.5 ${isActive ? "" : "max-h-[220px] overflow-y-auto custom-scroll"}`}>
          <EventBody body={event.body} kind={event.kind} />
        </div>
      )}
    </div>
  );
}

// ─── Raw output drawer ───────────────────────────────────────

function RawOutputDrawer({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-black/[0.04] dark:border-white/[0.04]">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] theme-muted hover:theme-fg transition">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
          <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
        </svg>
        Raw output
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`ml-auto h-2.5 w-2.5 transition ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <pre className="max-h-[300px] overflow-auto bg-[#0d1117] px-3 py-2 font-code text-[10.5px] leading-[1.6] text-green-300/80 dark:bg-[#0a0e14] custom-scroll whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

export default function ActivityStream({
  events: eventsProp,
  text,
  rawText,
  isStreaming = false,
  className = "",
  showRawOutput = false,
}: {
  events?: ActivityEvent[];
  text?: string;
  rawText?: string;
  isStreaming?: boolean;
  className?: string;
  showRawOutput?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);

  // Track whether the user is scrolled to (or near) the bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // If events are provided, use them. Otherwise parse text on the fly.
  const events = useMemo(() => {
    if (eventsProp && eventsProp.length > 0) return eventsProp;
    if (text) return StreamEventParser.parseText(text);
    return [];
  }, [eventsProp, text]);

  // Reset to "at bottom" whenever a new stream begins so we start auto-scrolling
  useEffect(() => {
    if (isStreaming) {
      isAtBottomRef.current = true;
    }
  }, [isStreaming]);

  // Auto-scroll during streaming — only if the user hasn't scrolled up
  useEffect(() => {
    if (isStreaming && isAtBottomRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current && isAtBottomRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [events, isStreaming]);

  // No content yet
  if (events.length === 0) {
    if (isStreaming) {
      return (
        <div className={`flex items-center gap-2 px-3 py-4 ${className}`}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500/60" />
          <span className="theme-muted italic text-[11px] tracking-[-0.003em]">Waiting for model response…</span>
        </div>
      );
    }
    if (!text) return null;
  }

  // Determine raw text for the debug drawer
  const debugText = rawText || text || events.map(e => e.body).join("\n");

  return (
    <div className={`flex flex-col ${className}`}>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scroll px-3 py-2.5 space-y-1">
        {events.map((event, i) => (
          <ActivityRow
            key={event.id}
            event={event}
            isLast={i === events.length - 1}
            isStreaming={isStreaming}
          />
        ))}
      </div>

      {showRawOutput && debugText && <RawOutputDrawer text={debugText} />}
    </div>
  );
}

export { type ActivityEvent, type ActivityKind };
