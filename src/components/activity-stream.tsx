"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { RunInTerminalButton } from "./run-in-terminal-button";

/* ═══════════════════════════════════════════════════════════════
   ActivityStream – structured live agent execution view
   ═══════════════════════════════════════════════════════════════
   Transforms raw CLI agent output into a readable activity
   timeline with distinct phases: thinking, reading files,
   searching, editing, running commands, evaluating, done.
   
   Provider-agnostic: works with Claude, Copilot, and Codex CLI
   output by detecting common tool-use patterns in the text.
   ═══════════════════════════════════════════════════════════════ */

// ─── Activity Event Types ─────────────────────────────────────

type ActivityKind =
  | "system"     // System messages (Preparing, Waiting...)
  | "thinking"   // Reasoning / planning text
  | "read"       // File read
  | "search"     // Grep / search / find
  | "edit"       // File edit / write
  | "run"        // Terminal command
  | "list"       // Directory listing
  | "result"     // Final answer / output
  | "error";     // Error output

interface ActivityEvent {
  id: number;
  kind: ActivityKind;
  label: string;          // e.g. "Read src/index.ts" or "Thinking"
  summary?: string;       // short one-line summary for collapsed view
  body: string;           // full content
  isCollapsible: boolean; // whether this can be collapsed
  timestamp: number;
}

// ─── Pattern Matchers ─────────────────────────────────────────
// These detect tool-use boundaries in raw CLI output from
// Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI.

const TOOL_PATTERNS: Array<{
  kind: ActivityKind;
  // Match the "start" of a tool block
  start: RegExp;
  // Extract a human-readable label from the match
  label: (match: RegExpMatchArray) => string;
  // Extract a summary from the match (optional)
  summary?: (match: RegExpMatchArray) => string;
}> = [
  // ── File Reading ──
  {
    kind: "read",
    start: /^(?:⏺\s*)?(?:Read(?:ing)?|read_file|ReadFile|View(?:ing)?)\s+(?:file\s+)?[`"']?([^\s`"'\n,)]+)/im,
    label: (m) => `Read ${extractFilename(m[1])}`,
    summary: (m) => m[1],
  },
  {
    kind: "read",
    start: /^(?:⏺\s*)?(?:I (?:will |'ll )?(?:read|look at|check|open|view|inspect|examine))\s+(?:the\s+)?(?:file\s+)?[`"']?([^\s`"'\n,)]+\.\w+)/im,
    label: (m) => `Read ${extractFilename(m[1])}`,
    summary: (m) => m[1],
  },
  // ── Searching ──
  {
    kind: "search",
    start: /^(?:⏺\s*)?(?:Search(?:ing|ed)?|Grep(?:ping)?|grep_search|Rg|rg|find(?:ing)?)\s+(?:for\s+)?[`"']?(.+?)(?:[`"']?\s*(?:in|across|—|$))/im,
    label: (m) => `Search ${truncate(m[1], 40)}`,
    summary: (m) => m[1],
  },
  {
    kind: "search",
    start: /^(?:⏺\s*)?(?:I (?:will |'ll )?(?:search|grep|look for|find))\s+(?:for\s+)?[`"']?(.+?)(?:[`"']?\s*(?:in|across|—|$))/im,
    label: (m) => `Search ${truncate(m[1], 40)}`,
    summary: (m) => m[1],
  },
  {
    kind: "search",
    start: /^(?:⏺\s*)?(?:file_search|FileSearch|find_files?)\s+/im,
    label: () => "Search files",
  },
  // ── File Editing ──
  {
    kind: "edit",
    start: /^(?:⏺\s*)?(?:Edit(?:ing|ed)?|Writ(?:ing|e)|Creat(?:ing|e)|Updat(?:ing|e)|Modif(?:ying|y)|Replace|replac(?:ing|e)|replace_string_in_file|edit_file|write_file|create_file)\s+(?:file\s+)?[`"']?([^\s`"'\n,)]+)/im,
    label: (m) => `Edit ${extractFilename(m[1])}`,
    summary: (m) => m[1],
  },
  {
    kind: "edit",
    start: /^(?:⏺\s*)?(?:I (?:will |'ll )?(?:edit|update|modify|create|write to|change))\s+(?:the\s+)?(?:file\s+)?[`"']?([^\s`"'\n,)]+\.\w+)/im,
    label: (m) => `Edit ${extractFilename(m[1])}`,
    summary: (m) => m[1],
  },
  // ── Terminal Commands ──
  {
    kind: "run",
    start: /^(?:⏺\s*)?(?:Run(?:ning)?|Exec(?:uting)?|run_in_terminal|run_command|execute|bash|shell|terminal)\s*:?\s*[`"']?(.+?)(?:[`"']?\s*$)/im,
    label: (m) => `Run ${truncate(m[1].replace(/^[`"']+|[`"']+$/g, ""), 50)}`,
    summary: (m) => m[1],
  },
  {
    kind: "run",
    start: /^(?:⏺\s*)?(?:I (?:will |'ll )?(?:run|execute))\s+[`"']?(.+?)(?:[`"']?\s*$)/im,
    label: (m) => `Run ${truncate(m[1].replace(/^[`"']+|[`"']+$/g, ""), 50)}`,
    summary: (m) => m[1],
  },
  // ── Directory Listing ──
  {
    kind: "list",
    start: /^(?:⏺\s*)?(?:List(?:ing)?|ls|dir|list_dir|list_directory)\s+(?:the\s+)?(?:contents?\s+of\s+)?[`"']?([^\s`"'\n]+)/im,
    label: (m) => `List ${extractFilename(m[1])}`,
    summary: (m) => m[1],
  },
];

// ── System message patterns ──
const SYSTEM_PATTERNS = [
  /^Preparing context/i,
  /^Waiting for model response/i,
  /^Starting agent/i,
  /^Agent (?:finished|completed)/i,
  /^⏺\s*$/,
];

// ── Result indicators ── (final answer after tool use)
const RESULT_INDICATORS = [
  /^(?:Here(?:'s| is)|The (?:result|answer|output|summary)|In summary|To summarize|Based on|I've (?:completed|finished|done|made)|Done[.!]|Finished[.!]|Complete[.!])/im,
  /^(?:## (?:Summary|Result|Output|Answer|Done|Complete))/im,
];

// ─── Parser ───────────────────────────────────────────────────

function parseActivityEvents(text: string): ActivityEvent[] {
  if (!text || !text.trim()) return [];

  const events: ActivityEvent[] = [];
  const lines = text.split("\n");
  let eventId = 0;

  let currentKind = "system" as ActivityKind;
  let currentLabel = "Preparing";
  let currentLines: string[] = [];
  let lastToolKind = null as ActivityKind | null;

  function flush() {
    const body = currentLines.join("\n").trim();
    if (!body) return;

    // Determine if this is collapsible
    const lineCount = body.split("\n").length;
    const isCollapsible =
      (currentKind === "thinking" && lineCount > 4) ||
      (currentKind === "read" && lineCount > 3) ||
      (currentKind === "search" && lineCount > 3) ||
      (currentKind === "edit" && lineCount > 6) ||
      (currentKind === "run" && lineCount > 3) ||
      (currentKind === "list" && lineCount > 5) ||
      (currentKind === "result" && lineCount > 8);

    // Generate summary for collapsible items
    let summary: string | undefined;
    if (isCollapsible) {
      const firstMeaningful = body.split("\n").find(l => l.trim().length > 0);
      summary = firstMeaningful ? truncate(firstMeaningful.replace(/^[#*\-`>]+\s*/, ""), 80) : undefined;
    }

    events.push({
      id: eventId++,
      kind: currentKind,
      label: currentLabel,
      summary,
      body,
      isCollapsible,
      timestamp: Date.now(),
    });
  }

  function startEvent(kind: ActivityKind, label: string) {
    flush();
    currentKind = kind;
    currentLabel = label;
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines at event boundaries
    if (trimmed === "") {
      if (currentLines.length > 0) {
        currentLines.push(line);
      }
      continue;
    }

    // Check for system messages
    if (SYSTEM_PATTERNS.some(p => p.test(trimmed))) {
      if (currentKind !== "system" || currentLines.length > 0) {
        startEvent("system", trimmed.replace(/\.\.\.$/, ""));
      }
      currentLines.push(line);
      continue;
    }

    // Check for tool-use patterns
    let matched = false;
    for (const pattern of TOOL_PATTERNS) {
      const m = trimmed.match(pattern.start);
      if (m) {
        startEvent(pattern.kind, pattern.label(m));
        lastToolKind = pattern.kind;
        currentLines.push(line);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Check for result indicators (only after at least one tool action)
    if (lastToolKind && RESULT_INDICATORS.some(p => p.test(trimmed))) {
      startEvent("result", "Result");
      currentLines.push(line);
      continue;
    }

    // Check for horizontal rule / section break
    if (/^[-=]{3,}\s*$/.test(trimmed) || /^---\s*$/.test(trimmed)) {
      // Treat as boundary between sections
      if (currentKind === "thinking" && currentLines.length > 0) {
        flush();
        currentKind = "thinking";
        currentLabel = "Thinking";
        currentLines = [];
      } else {
        currentLines.push(line);
      }
      continue;
    }

    // If we're still in system mode (start of stream), switch to thinking
    if (currentKind === "system" && events.length === 0 && currentLines.length === 0) {
      currentKind = "thinking";
      currentLabel = "Thinking";
    }

    // If current event is a tool action and we see free text that doesn't
    // look like tool output, start a new thinking block
    if ((currentKind === "read" || currentKind === "search" || currentKind === "edit" ||
         currentKind === "run" || currentKind === "list") &&
        currentLines.length > 0) {
      // Check if this line looks like it's continuing tool output
      const isToolOutput =
        trimmed.startsWith("|") ||      // table
        trimmed.startsWith("```") ||    // code fence
        /^\d+[:\s]/.test(trimmed) ||    // line numbers
        /^[│├└┌┐┘┤┬┴┼─]/.test(trimmed) || // box drawing
        /^\.\.\./.test(trimmed) ||      // truncation
        /^\s/.test(line) ||             // indented content
        /^[+\-!>]/.test(trimmed) ||     // diff markers
        /^\(?\d+ (?:line|match|result|file|change)/.test(trimmed); // counts

      if (!isToolOutput && trimmed.length > 20) {
        // Check if this looks like the start of a new thought
        const looksLikeThought =
          /^(?:Now|Next|Let me|I (?:need|will|should|can|'ll)|Looking|Based|The |This |After|Before|First|Then|Also|However|Since|So |Ok |Alright)/i.test(trimmed) ||
          /^(?:[A-Z][a-z]+ ){2,}/.test(trimmed); // Two+ capitalized words (sentence start)

        if (looksLikeThought) {
          startEvent("thinking", "Thinking");
          currentLines.push(line);
          continue;
        }
      }
    }

    // If nothing else matched, continue accumulating into current event
    currentLines.push(line);
  }

  // Flush remaining
  flush();

  // Post-process: merge adjacent small thinking blocks
  return mergeAdjacentThinking(events);
}

function mergeAdjacentThinking(events: ActivityEvent[]): ActivityEvent[] {
  if (events.length <= 1) return events;

  const merged: ActivityEvent[] = [];
  for (const event of events) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === "thinking" && event.kind === "thinking") {
      // Merge
      prev.body = prev.body + "\n\n" + event.body;
      prev.isCollapsible = prev.body.split("\n").length > 4;
      if (prev.isCollapsible) {
        const firstLine = prev.body.split("\n").find(l => l.trim().length > 0);
        prev.summary = firstLine ? truncate(firstLine.replace(/^[#*\-`>]+\s*/, ""), 80) : undefined;
      }
    } else {
      merged.push({ ...event });
    }
  }
  return merged;
}

// ─── Helpers ──────────────────────────────────────────────────

function extractFilename(p: string): string {
  const cleaned = p.replace(/[`"']/g, "").replace(/[,;:.]$/, "");
  const parts = cleaned.split(/[/\\]/);
  const name = parts[parts.length - 1];
  // Show parent/file for context if path has 2+ segments
  if (parts.length >= 2) {
    return parts.slice(-2).join("/");
  }
  return name;
}

function truncate(s: string, max: number): string {
  const cleaned = s.replace(/[`"']/g, "").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

// ─── Icons ────────────────────────────────────────────────────

function ActivityIcon({ kind, isActive }: { kind: ActivityKind; isActive: boolean }) {
  const activeClass = isActive ? "text-violet-500 dark:text-violet-400" : "theme-muted";

  switch (kind) {
    case "thinking":
      return (
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${isActive ? "bg-violet-500/10" : "bg-black/[0.03] dark:bg-white/[0.04]"}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${activeClass}`}>
            <path d="M8 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 1ZM10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM12.95 4.11a.75.75 0 1 0-1.06-1.06l-1.062 1.06a.75.75 0 0 0 1.061 1.062l1.06-1.062ZM15 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 15 8ZM11.889 12.95a.75.75 0 0 0 1.06-1.06l-1.06-1.062a.75.75 0 0 0-1.062 1.061l1.062 1.06ZM8 12a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 12ZM5.172 11.889a.75.75 0 0 0-1.061-1.062l-1.06 1.061a.75.75 0 1 0 1.06 1.06l1.06-1.06ZM4 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 4 8ZM4.11 5.172A.75.75 0 0 0 5.173 4.11L4.11 3.05a.75.75 0 1 0-1.06 1.06l1.06 1.062Z" />
          </svg>
        </div>
      );
    case "read":
      return (
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${isActive ? "bg-blue-500/10" : "bg-black/[0.03] dark:bg-white/[0.04]"}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${isActive ? "text-blue-500 dark:text-blue-400" : "theme-muted"}`}>
            <path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 12.5 5H7.621a1.5 1.5 0 0 1-1.06-.44L5.439 3.44A1.5 1.5 0 0 0 4.378 3H3.5Z" />
          </svg>
        </div>
      );
    case "search":
      return (
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${isActive ? "bg-amber-500/10" : "bg-black/[0.03] dark:bg-white/[0.04]"}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${isActive ? "text-amber-500 dark:text-amber-400" : "theme-muted"}`}>
            <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
          </svg>
        </div>
      );
    case "edit":
      return (
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${isActive ? "bg-green-500/10" : "bg-black/[0.03] dark:bg-white/[0.04]"}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${isActive ? "text-green-500 dark:text-green-400" : "theme-muted"}`}>
            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.306a1 1 0 0 0-.26.445l-.95 3.168a.75.75 0 0 0 .927.927l3.168-.95a1 1 0 0 0 .445-.26l7.793-7.793a1.75 1.75 0 0 0 0-2.475l-.855-.855Z" />
          </svg>
        </div>
      );
    case "run":
      return (
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${isActive ? "bg-cyan-500/10" : "bg-black/[0.03] dark:bg-white/[0.04]"}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${isActive ? "text-cyan-500 dark:text-cyan-400" : "theme-muted"}`}>
            <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
          </svg>
        </div>
      );
    case "list":
      return (
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${isActive ? "bg-indigo-500/10" : "bg-black/[0.03] dark:bg-white/[0.04]"}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${isActive ? "text-indigo-500 dark:text-indigo-400" : "theme-muted"}`}>
            <path fillRule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm.75 3.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" clipRule="evenodd" />
          </svg>
        </div>
      );
    case "result":
      return (
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${isActive ? "bg-emerald-500/10" : "bg-black/[0.03] dark:bg-white/[0.04]"}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${isActive ? "text-emerald-500 dark:text-emerald-400" : "theme-muted"}`}>
            <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
          </svg>
        </div>
      );
    case "error":
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/10">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-red-500 dark:text-red-400">
            <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
        </div>
      );
    default: // system
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-black/[0.03] dark:bg-white/[0.04]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 theme-muted">
            <path fillRule="evenodd" d="M6.455 1.45A.5.5 0 0 1 6.952 1h2.096a.5.5 0 0 1 .497.45l.186 1.858a4.996 4.996 0 0 1 1.466.848l1.703-.769a.5.5 0 0 1 .639.206l1.048 1.814a.5.5 0 0 1-.142.656l-1.517 1.09a5.026 5.026 0 0 1 0 1.694l1.517 1.09a.5.5 0 0 1 .142.656l-1.048 1.814a.5.5 0 0 1-.639.206l-1.703-.769c-.433.36-.928.647-1.466.848l-.186 1.858a.5.5 0 0 1-.497.45H6.952a.5.5 0 0 1-.497-.45l-.186-1.858a4.993 4.993 0 0 1-1.466-.848l-1.703.769a.5.5 0 0 1-.639-.206L1.413 10.6a.5.5 0 0 1 .142-.656l1.517-1.09a5.026 5.026 0 0 1 0-1.694l-1.517-1.09a.5.5 0 0 1-.142-.656L2.46 3.6a.5.5 0 0 1 .639-.206l1.703.769c.433-.36.928-.647 1.466-.848l.186-1.858ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" clipRule="evenodd" />
          </svg>
        </div>
      );
  }
}

// ─── Kind Labels ──────────────────────────────────────────────

function kindLabel(kind: ActivityKind): string {
  switch (kind) {
    case "thinking": return "Thinking";
    case "read": return "Reading";
    case "search": return "Searching";
    case "edit": return "Editing";
    case "run": return "Running";
    case "list": return "Listing";
    case "result": return "Result";
    case "error": return "Error";
    case "system": return "System";
    default: return "Activity";
  }
}

// ─── Inline Markdown Renderer ─────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code key={i} className="rounded bg-black/[0.05] px-1 py-0.5 font-mono text-[0.88em] dark:bg-white/[0.08] text-violet-600 dark:text-violet-400">
          {part.slice(1, -1)}
        </code>
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

// ─── Body Renderer ────────────────────────────────────────────
// Renders the body content of a single activity event with
// markdown-like formatting (code blocks, lists, paragraphs).

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
      if (idx < lines.length) idx++; // skip closing ```
      const code = codeLines.join("\n");
      const lineCount = codeLines.length;
      elements.push(
        <CollapsibleCode key={elements.length} lang={lang} code={code} lineCount={lineCount} />
      );
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      elements.push(
        <div key={elements.length} className="mt-2 mb-1 first:mt-0">
          {level <= 2 ? (
            <span className="text-[12px] font-semibold theme-fg">{renderInline(headingMatch[2])}</span>
          ) : (
            <span className="text-[11.5px] font-medium theme-fg">{renderInline(headingMatch[2])}</span>
          )}
        </div>
      );
      idx++;
      continue;
    }

    // Bullet/numbered list
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (idx < lines.length && (/^\s*[-*]\s+/.test(lines[idx]) || /^\s*\d+\.\s+/.test(lines[idx]))) {
        items.push(lines[idx].replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, ""));
        idx++;
      }
      elements.push(
        <ul key={elements.length} className="my-1 space-y-0.5 pl-0.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5 text-[12px] theme-soft">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-violet-500/40" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (trimmed === "") {
      idx++;
      continue;
    }

    // Regular text line
    elements.push(
      <p key={elements.length} className="text-[12px] leading-[1.65] theme-soft">
        {renderInline(line)}
      </p>
    );
    idx++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Collapsible Code Block ──────────────────────────────────

function CollapsibleCode({ lang, code, lineCount }: { lang: string; code: string; lineCount: number }) {
  const [collapsed, setCollapsed] = useState(lineCount > 12);
  const displayLang = lang || "text";

  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-black/[0.08] dark:border-white/[0.06]">
      <div
        className="flex cursor-pointer items-center justify-between bg-[#0d1117] px-3 py-1.5 border-b border-white/[0.08]"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white">{displayLang}</span>
          <span className="text-[10px] font-medium text-white/55">{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <RunInTerminalButton code={code} lang={lang} variant="muted" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              try { navigator.clipboard.writeText(code); } catch { /* */ }
            }}
            className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-white/85 hover:text-white transition"
          >
            Copy
          </button>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
            className={`h-3 w-3 text-white/75 transition ${collapsed ? "" : "rotate-180"}`}>
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      {!collapsed && (
        <pre className="overflow-x-auto bg-[#0d1117] px-3 py-2 font-mono text-[10.5px] leading-[1.6] text-white/95 dark:bg-[#0a0e14]">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

// ─── Single Activity Row ─────────────────────────────────────

function ActivityRow({
  event,
  isLast,
  isStreaming,
  defaultExpanded,
}: {
  event: ActivityEvent;
  isLast: boolean;
  isStreaming: boolean;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isActive = isLast && isStreaming;

  // Auto-expand the active (last) event, auto-collapse old thinking blocks
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    } else if (event.kind === "thinking" && event.isCollapsible && !isLast) {
      // Auto-collapse old thinking blocks once they're no longer active
      setExpanded(false);
    }
  }, [isActive, isLast, event.kind, event.isCollapsible]);

  const kindColor = {
    thinking: "text-violet-500 dark:text-violet-400",
    read: "text-blue-500 dark:text-blue-400",
    search: "text-amber-600 dark:text-amber-400",
    edit: "text-green-600 dark:text-green-400",
    run: "text-cyan-600 dark:text-cyan-400",
    list: "text-indigo-500 dark:text-indigo-400",
    result: "text-emerald-600 dark:text-emerald-400",
    error: "text-red-500 dark:text-red-400",
    system: "theme-muted",
  }[event.kind] || "theme-muted";

  // System events render minimally
  if (event.kind === "system") {
    return (
      <div className="flex items-center gap-2.5 py-1">
        <ActivityIcon kind="system" isActive={isActive} />
        <span className="text-[11px] theme-muted italic">{event.body}</span>
        {isActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500/60" />}
      </div>
    );
  }

  const canCollapse = event.isCollapsible;
  const showBody = canCollapse ? expanded : true;

  return (
    <div className={`group relative ${isLast ? "" : "pb-1"}`}>
      {/* Timeline connector line */}
      {!isLast && (
        <div className="absolute left-3 top-8 bottom-0 w-px bg-black/[0.06] dark:bg-white/[0.06]" />
      )}

      {/* Header row */}
      <div
        className={`flex items-center gap-2.5 ${canCollapse ? "cursor-pointer" : ""}`}
        onClick={canCollapse ? () => setExpanded(!expanded) : undefined}
      >
        <ActivityIcon kind={event.kind} isActive={isActive} />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${kindColor}`}>
            {kindLabel(event.kind)}
          </span>
          <span className="min-w-0 truncate text-[11.5px] font-medium theme-fg">
            {event.label !== kindLabel(event.kind) && event.label !== "Thinking" && event.label !== "Result"
              ? event.label
              : event.summary || ""}
          </span>
          {isActive && (
            <span className="ml-auto flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500/60" />
            </span>
          )}
        </div>
        {canCollapse && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
            className={`h-3 w-3 shrink-0 theme-muted transition ${expanded ? "rotate-180" : ""}`}>
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {/* Body content */}
      {showBody && (
        <div className="ml-[34px] mt-1 mb-1.5">
          <EventBody body={event.body} kind={event.kind} />
        </div>
      )}
    </div>
  );
}

// ─── Raw Output Drawer ───────────────────────────────────────

function RawOutputDrawer({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-black/[0.04] dark:border-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] theme-muted hover:theme-fg transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
          <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5ZM4.75 4a.75.75 0 0 0-.53 1.28l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l2.75-2.75a.75.75 0 0 0 0-1.06L5.28 4.22A.75.75 0 0 0 4.75 4ZM8.5 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
        </svg>
        Raw output
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
          className={`ml-auto h-2.5 w-2.5 transition ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <pre className="max-h-[300px] overflow-auto bg-[#0d1117] px-3 py-2 font-mono text-[10px] leading-[1.6] text-green-300/80 dark:bg-[#0a0e14] custom-scroll whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function ActivityStream({
  text,
  isStreaming = false,
  className = "",
  showRawOutput = false,
}: {
  text: string;
  isStreaming?: boolean;
  className?: string;
  showRawOutput?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const events = useMemo(() => parseActivityEvents(text), [text]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [text, isStreaming]);

  if (!text) {
    return (
      <div className={`flex items-center gap-2 px-3 py-4 ${className}`}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500/60" />
        <span className="theme-muted italic text-[11px]">Waiting for model response…</span>
      </div>
    );
  }

  // If parsing produces no structured events (plain text), fall back to
  // showing the text as a single thinking block
  const displayEvents = events.length > 0 ? events : [{
    id: 0,
    kind: "thinking" as ActivityKind,
    label: "Thinking",
    body: text,
    isCollapsible: text.split("\n").length > 4,
    timestamp: Date.now(),
  }];

  return (
    <div className={`flex flex-col ${className}`}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll px-3 py-2.5 space-y-1">
        {displayEvents.map((event, i) => (
          <ActivityRow
            key={event.id}
            event={event}
            isLast={i === displayEvents.length - 1}
            isStreaming={isStreaming}
            defaultExpanded={
              // Expand the last event, result events, and non-collapsible events
              i === displayEvents.length - 1 ||
              event.kind === "result" ||
              !event.isCollapsible
            }
          />
        ))}
      </div>

      {/* Optional raw output for debugging */}
      {showRawOutput && text && <RawOutputDrawer text={text} />}
    </div>
  );
}

// Also export the parser for testing
export { parseActivityEvents, type ActivityEvent, type ActivityKind };
