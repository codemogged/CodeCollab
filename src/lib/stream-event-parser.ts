/* ═══════════════════════════════════════════════════════════════
   StreamEventParser – real-time CLI output → structured events
   ═══════════════════════════════════════════════════════════════
   Processes raw CLI chunks as they arrive and classifies each
   line into a typed ActivityEvent (thinking, read, search, edit,
   run, etc.).  Designed for streaming: call processChunk() on
   every stdout/stderr chunk and read getEvents() to get the
   current structured timeline.
   ═══════════════════════════════════════════════════════════════ */

// ─── Types ────────────────────────────────────────────────────

export type ActivityKind =
  | "system"
  | "thinking"
  | "read"
  | "search"
  | "edit"
  | "run"
  | "list"
  | "result"
  | "error";

export interface ActivityEvent {
  id: number;
  kind: ActivityKind;
  label: string;
  body: string;
  timestamp: number;
  /** Set when a thinking phase completes (tool/result event starts). */
  endTime?: number;
}

// ─── ANSI strip ───────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

// ─── Helpers ──────────────────────────────────────────────────

function extractFilename(p: string): string {
  const cleaned = p.replace(/[`"']/g, "").replace(/[,;:.]$/, "").replace(/[/\\]+$/, "");
  const parts = cleaned.split(/[/\\]/).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join("/");
  return parts[parts.length - 1] || cleaned;
}

function truncate(s: string, max: number): string {
  const cleaned = s.replace(/[`"']/g, "").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

// ─── Classification patterns ─────────────────────────────────

interface ToolPattern {
  kind: ActivityKind;
  pattern: RegExp;
  label: (m: RegExpMatchArray) => string;
}

const TOOL_PATTERNS: ToolPattern[] = [
  // ── File Reading ──
  { kind: "read", pattern: /^(?:⏺\s*)?(?:Read(?:ing)?|read_file|ReadFile|View(?:ing)?)\s+(?:(?:a|an|the)\s+)*(?:(?:file|contents?)\s+(?:of\s+)?)?[`"']?([^\s`"'\n,){}]+)/i, label: m => `Read ${extractFilename(m[1])}` },
  { kind: "read", pattern: /^(?:⏺\s*)?(?:I(?:'ll| will| need to)? (?:read|look at|check|open|view|inspect|examine))\s+(?:(?:a|an|the)\s+)*(?:(?:file|contents?)\s+(?:of\s+)?)?[`"']?([^\s`"'\n,)]+\.\w+)/i, label: m => `Read ${extractFilename(m[1])}` },
  // ── Searching ──
  { kind: "search", pattern: /^(?:⏺\s*)?(?:Search(?:ing|ed)?|Grep(?:ping)?|grep_search|find(?:ing)?|Searched)\s+(?:for\s+)?[`"']?(.+?)(?:[`"']?\s*(?:in|across|—|$))/i, label: m => `Search "${truncate(m[1], 30)}"` },
  { kind: "search", pattern: /^(?:⏺\s*)?(?:I(?:'ll| will| need to)? (?:search|grep|look for|find))\s+(?:for\s+)?[`"']?(.+?)(?:[`"']?\s*(?:in|across|—|$))/i, label: m => `Search "${truncate(m[1], 30)}"` },
  { kind: "search", pattern: /^(?:⏺\s*)?(?:file_search|FileSearch|find_files?)\s+/i, label: () => "Search files" },
  // ── File Editing ──
  { kind: "edit", pattern: /^(?:⏺\s*)?(?:Edit(?:ing|ed)?|Writ(?:ing|e)|Creat(?:ing|e)|Updat(?:ing|e)|Modif(?:ying|y)|Replace|replac(?:ing|e))\s+(?:(?:a|an|the|new)\s+)*(?:(?:file|config|code|contents?)\s+(?:in\s+|of\s+|for\s+)?)*[`"']?([^\s`"'\n,)]+\.\w+)/i, label: m => `Edit ${extractFilename(m[1])}` },
  { kind: "edit", pattern: /^(?:⏺\s*)?(?:I(?:'ll| will| need to)? (?:edit|update|modify|create|write to|change))\s+(?:(?:a|an|the|new)\s+)*(?:(?:file|config|code|contents?)\s+(?:in\s+|of\s+|for\s+)?)*[`"']?([^\s`"'\n,)]+\.\w+)/i, label: m => `Edit ${extractFilename(m[1])}` },
  // ── Terminal Commands ──
  { kind: "run", pattern: /^(?:⏺\s*)?(?:Run(?:ning)?|Exec(?:uting)?|run_in_terminal|run_command|execute|bash|shell|terminal)\s*:?\s*[`"']?(.+?)(?:[`"']?\s*$)/i, label: m => `Run ${truncate(m[1].replace(/^[`"']+|[`"']+$/g, ""), 40)}` },
  { kind: "run", pattern: /^(?:⏺\s*)?(?:I(?:'ll| will| need to)? (?:run|execute))\s+[`"']?(.+?)(?:[`"']?\s*$)/i, label: m => `Run ${truncate(m[1].replace(/^[`"']+|[`"']+$/g, ""), 40)}` },
  { kind: "run", pattern: /^(?:⏺\s*)?(?:\$\s+|>\s+)?(npm|npx|node|pip|python|cargo|git|mkdir|cd)\s+(.+)/i, label: m => `Run ${truncate(`${m[1]} ${m[2]}`, 40)}` },
  { kind: "run", pattern: /^(?:⏺\s*)?Install(?:ing)?\s+(.+?)(?:\s*$)/i, label: m => `Install ${truncate(m[1], 40)}` },
  // ── Directory Listing ──
  { kind: "list", pattern: /^(?:⏺\s*)?(?:List(?:ing)?|ls|dir|list_dir|list_directory)\s+(?:the\s+)?(?:contents?\s+of\s+)?[`"']?([^\s`"'\n]+)/i, label: m => `List ${extractFilename(m[1])}` },
];

const SYSTEM_PATTERNS = [
  /^Preparing context/i,
  /^Waiting for model response/i,
  /^Starting agent/i,
  /^Agent (?:finished|completed)/i,
  /^⏺\s*$/,
];

const RESULT_PATTERNS = [
  /^(?:Here(?:'s| is)|The (?:result|answer|output|summary)|In summary|To summarize|I've (?:completed|finished|done|made)|Done[.!]?|Finished[.!]?|Complete[.!]?|Result)/i,
  /^(?:## (?:Summary|Result|Output|Answer|Done|Complete|What I did))/i,
  /^TASK_STATUS:/i,
];

function isToolOutputContinuation(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("|") ||
    t.startsWith("```") ||
    /^\d+[:\s]/.test(t) ||
    /^[│├└┌┐┘┤┬┴┼─]/.test(t) ||
    /^\.\.\./.test(t) ||
    /^\s{2,}/.test(line) ||
    /^[+\->!]/.test(t) ||
    /^\(?\d+ (?:line|match|result|file|change)/i.test(t)
  );
}

function isNewThoughtStart(line: string): boolean {
  const t = line.trim();
  return /^(?:Now|Next|Let me|I (?:need|will|should|can|'ll|found|noticed|see|just|'ve)|Looking|Based|The |This |After|Before|First|Then|Also|However|Since|So |Ok |Alright|Good|Great|Perfect|Excellent|Important|Smoke|Tests?\b|Everything|All \d)/i.test(t);
}

// ─── Natural language prefix stripping ────────────────────────

/** Strip natural language lead-ins to expose the core action verb for pattern matching */
const NATURAL_PREFIX = /^(?:(?:Now|Next|First|Then|Also|Finally|After that|OK|Alright|Good|Great|Perfect|Excellent|Sure|Right)[,.:!]?\s+)*(?:(?:I'll|I will|I need to|I should|I'm going to|I can|Let me|Let's|Going to|Time to|We need to|We should|We'll)\s+)?/i;

// ─── Segmentation helpers ─────────────────────────────────────

/** Broader check for lines that signal a new intent or thought */
function isIntentPhrase(line: string): boolean {
  const t = line.trim();
  return /^(?:Now|Next|Let me|Let's|I'll|I will|I need|I should|I'm going|I can|Going to|Time to|We need|We'll|Looking|Based|This |After|Before|First|Then|Also|However|Since|So |OK|Alright|Good|Great|Perfect|Excellent|Important|Moving|Sure|Right|Hmm|Well|Actually|The (?:next|first|last|final)|I (?:found|noticed|see|just|'ve)|Smoke|Tests?\b|Everything|All \d)/i.test(t);
}

/** Lines ending with ":" that announce a new action/step */
function isAnnouncementLine(line: string): boolean {
  const t = line.trim();
  if (!t.endsWith(":")) return false;
  if (t.length > 120 || t.length < 10) return false;
  // Reject mid-sentence fragments (start with lowercase → continuation, not new intent)
  if (/^[a-z]/.test(t)) return false;
  return /\b(?:create|update|edit|modify|write|install|run|check|view|read|search|fix|add|set|configure|initialize|build|test|verify|open|remove|delete|move|try|use|prepare|make|start|download|copy|rename|import|export|format|instead|approach|manually|implement|scaffold|wire|connect|integrate|patch|extend|rebuild|rewrite|adjust|hook|setup)\b/i.test(t);
}

/** Infer event kind from text keywords */
function inferKindFromText(text: string): ActivityKind {
  const t = text.toLowerCase();
  // Check result BEFORE run so "test passing" → result, not run
  if (/\b(?:passing|passed|done|complete|finish|success|verified|confirmed|ready|summary|summarize)\b/.test(t)) return "result";
  if (/\b(?:install|run|execute|restart|start|stop|npm|pip|yarn|pnpm|node|python|cargo|git|npx|curl|command|terminal|shell|script|mkdir|test|launch|deploy|serve)\b/.test(t)) return "run";
  if (/\b(?:create|update|edit|modify|write|add|set up|change|fix|replace|configure|initialize|make|refactor|store|document|put|implement|scaffold|wire|hook|connect|integrate|patch|extend|build|rebuild|rewrite|adjust|setup)\b/.test(t)) return "edit";
  if (/\b(?:read|check|view|look at|inspect|examine|open|review|see|verify|confirm|understand|parse|scan|analyze)\b/.test(t)) return "read";
  if (/\b(?:search|find|grep|look for|locate)\b/.test(t)) return "search";
  if (/\b(?:list|directory|contents|ls|dir)\b/.test(t)) return "list";
  return "thinking";
}

// ─── Action-intent detector for thinking phase breakout ───────

/**
 * When inside a thinking block, determine whether a line expresses
 * a concrete action that should break out into its own event row.
 * Returns { kind, label } if the line is an action, or null if
 * the line is pure reasoning/explanation and should stay in thinking.
 *
 * The heuristic: the line must (a) start with an intent phrase or
 * end with ":" (an announcement), AND (b) contain an action verb
 * that maps to a non-thinking ActivityKind.
 */
function detectActionBreakout(line: string): { kind: ActivityKind; label: string } | null {
  const t = line.trim();

  // Very short lines are typically fragments, not actions
  if (t.length < 10) return null;

  // For long paragraphs (e.g. Copilot CLI / GPT output), split into
  // sentences and check each one. This lets us detect action phases
  // even when the CLI streams paragraph-length narrative text.
  if (t.length > 160) {
    const sentences = t.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (s.length < 10 || s.length > 160) continue;
      const sIntent = isIntentPhrase(s);
      const sAnnounce = s.endsWith(":") && s.length >= 12 &&
        /\b(?:create|update|edit|modify|write|install|run|check|view|read|search|fix|add|set|configure|initialize|build|test|verify|open|remove|delete|move|try|use|prepare|make|restart|start|download|copy|rename|import|export|format|store|document|launch|deploy|serve|stop|curl|execute|implement|scaffold|wire|connect|integrate|patch|extend|rebuild|rewrite|adjust|hook|setup)\b/i.test(s);
      if (!sIntent && !sAnnounce) continue;
      const sKind = inferKindFromText(s);
      if (sKind === "thinking") continue;
      const finalKind = sKind === "result" ? "read" : sKind;
      return { kind: finalKind, label: deriveLabelFromLine(s) };
    }
    return null;
  }

  // Must express an intent (starts with intent phrase or is an announcement ending with ":")
  const isIntent = isIntentPhrase(t);
  const isAnnouncement = t.endsWith(":") && t.length >= 12 &&
    /\b(?:create|update|edit|modify|write|install|run|check|view|read|search|fix|add|set|configure|initialize|build|test|verify|open|remove|delete|move|try|use|prepare|make|restart|start|download|copy|rename|import|export|format|store|document|launch|deploy|serve|stop|curl|execute|implement|scaffold|wire|connect|integrate|patch|extend|rebuild|rewrite|adjust|hook|setup)\b/i.test(t);

  if (!isIntent && !isAnnouncement) return null;

  // Infer the kind from the action verbs in the text
  const kind = inferKindFromText(t);
  if (kind === "thinking") return null;  // Still just reasoning
  // "result" inferred from "verify/confirm" is really a read/check action
  const finalKind = kind === "result" ? "read" : kind;

  return { kind: finalKind, label: deriveLabelFromLine(t) };
}

/** Create a descriptive label from a line of text.
 *  Does NOT truncate — that's the job of the per-kind formatter. */
function deriveLabelFromLine(line: string): string {
  let t = line.trim();
  t = t.replace(/[:.!?]+$/, "").trim();
  t = t.replace(/^(?:(?:Now|OK|Alright|Good|Great|Perfect|Excellent|Next|First|Then|Also|Finally|Sure|Right|Awesome)[,.:!]?\s*)+/i, "").trim();

  // Multi-sentence: pick the first sentence with an intent phrase
  if (t.includes(". ") || t.includes("! ")) {
    const sentences = t.split(/[.!]\s+/);
    if (sentences.length > 1) {
      for (const s of sentences) {
        if (/(?:I'll|I will|Let me|Let's|I need to|I should|I'm going to|Now I|Going to|Time to)/i.test(s)) {
          t = s.replace(/[:.!?]+$/, "").trim();
          break;
        }
      }
    }
  }

  t = t.replace(/^(?:(?:Now|OK|Alright|Good|Great|Perfect|Excellent|Sure|Right|Awesome)[,.:!]?\s*)+/i, "").trim();
  t = t.replace(/^(?:I'll|I will|I need to|I should|I'm going to|Let me|Let's|Going to|Time to|I can|We need to|We'll)\s+/i, "").trim();
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t || "Working";
}

// ─── Simple event label: action type only ─────────────────────

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

/** Return the action-type label for the event kind. No summarization. */
function formatEventLabel(kind: ActivityKind): string {
  return PHASE_LABELS[kind] || "Working";
}

// ─── Parser ───────────────────────────────────────────────────

export class StreamEventParser {
  private events: ActivityEvent[] = [];
  private nextId = 0;
  private pendingLine = "";
  private currentKind: ActivityKind = "system";
  private hasHadToolAction = false;
  private rawText = "";

  /** Feed a raw chunk (may contain partial lines, ANSI codes, etc.) */
  processChunk(rawChunk: string): void {
    const chunk = stripAnsi(rawChunk);
    if (!chunk) return;

    this.rawText += chunk;
    this.pendingLine += chunk;

    // Process complete lines
    const parts = this.pendingLine.split("\n");
    this.pendingLine = parts.pop() || "";

    for (const line of parts) {
      this.classifyLine(line);
    }
  }

  /** Flush any remaining partial line (call when stream ends) */
  flush(): void {
    if (this.pendingLine.trim()) {
      this.classifyLine(this.pendingLine);
      this.pendingLine = "";
    }
    // End timing for final thinking event
    const last = this.lastEvent();
    if (last && last.kind === "thinking" && !last.endTime) {
      last.endTime = Date.now();
    }
  }

  /**
   * Non-destructive flush: if there's a pending partial line that hasn't
   * been terminated by \n yet, classify it so it appears as an event
   * immediately.  The pending buffer is consumed so the text isn't doubled
   * when the real \n eventually arrives.
   */
  flushPending(): void {
    const t = this.pendingLine.trim();
    if (t.length === 0) return;

    // Always flush if line ends with sentence-ending punctuation
    if (/[.!?;]$/.test(t)) {
      this.classifyLine(this.pendingLine);
      this.pendingLine = "";
      return;
    }

    // For mid-stream text, only flush at a word boundary (ends with space
    // or punctuation followed by space). This prevents splitting words like
    // "fronten" / "d" when streaming deltas arrive token-by-token.
    // Use a higher threshold (80 chars) to accumulate more natural sentence
    // chunks before flushing, and require the buffer to end at a word boundary.
    if (t.length >= 80 && /\s$/.test(this.pendingLine)) {
      this.classifyLine(this.pendingLine);
      this.pendingLine = "";
      return;
    }

    // Safety: flush very long buffers regardless (avoid unbounded growth)
    if (t.length >= 500) {
      this.classifyLine(this.pendingLine);
      this.pendingLine = "";
    }
  }

  private classifyLine(line: string): void {
    const trimmed = line.trim();

    // Empty line → append to current event body
    if (!trimmed) {
      const current = this.lastEvent();
      if (current && current.body.length > 0) {
        current.body += "\n";
      }
      return;
    }

    // ── System messages ──
    if (SYSTEM_PATTERNS.some(p => p.test(trimmed))) {
      this.startEvent("system", trimmed.replace(/\.\.\.$/, ""));
      this.appendLine(line);
      return;
    }

    // ── Direct tool-use patterns ──
    for (const tp of TOOL_PATTERNS) {
      const m = trimmed.match(tp.pattern);
      if (m) {
        this.startEvent(tp.kind, tp.label(m));
        this.hasHadToolAction = true;
        this.appendLine(line);
        return;
      }
    }

    // ── Strip natural-language prefix and retry tool patterns ──
    const stripped = trimmed.replace(NATURAL_PREFIX, "").trim();
    if (stripped.length > 0 && stripped !== trimmed) {
      for (const tp of TOOL_PATTERNS) {
        const m = stripped.match(tp.pattern);
        if (m) {
          this.startEvent(tp.kind, tp.label(m));
          this.hasHadToolAction = true;
          this.appendLine(line);
          return;
        }
      }
    }

    // ── Result / summary (only after at least one tool action) ──
    if (this.hasHadToolAction && RESULT_PATTERNS.some(p => p.test(trimmed))) {
      this.startEvent("result", "Result");
      this.appendLine(line);
      return;
    }

    // ── Thinking breakout: if currently in thinking phase, check whether
    //    this line expresses a concrete action. If so, break out into a
    //    real activity event. Otherwise keep accumulating in thinking. ──
    if (this.lastEvent()?.kind === "thinking") {
      const breakout = detectActionBreakout(trimmed);
      if (breakout) {
        this.startEvent(breakout.kind, breakout.label);
        this.hasHadToolAction = true;
        this.appendLine(line);
        return;
      }
      // Pure reasoning / explanation → stay grouped in thinking
      this.appendLine(line);
      return;
    }

    // ── Transition from tool event to new thinking ──
    const current = this.lastEvent();
    if (
      current &&
      (current.kind === "read" || current.kind === "search" ||
       current.kind === "edit" || current.kind === "run" || current.kind === "list") &&
      current.body.length > 0 &&
      !isToolOutputContinuation(line) &&
      trimmed.length > 20 &&
      isNewThoughtStart(trimmed)
    ) {
      const kind = inferKindFromText(trimmed);
      this.startEvent(kind, deriveLabelFromLine(trimmed));
      this.appendLine(line);
      return;
    }

    // ── Segmentation: split when current event has content and new intent appears ──
    if (current && current.body.trim().length > 40 && !isToolOutputContinuation(line)) {
      if (isAnnouncementLine(trimmed)) {
        const kind = inferKindFromText(trimmed);
        this.startEvent(kind, deriveLabelFromLine(trimmed));
        this.hasHadToolAction = this.hasHadToolAction || kind !== "thinking";
        this.appendLine(line);
        return;
      }
      if (isIntentPhrase(trimmed) && trimmed.length > 15) {
        const kind = inferKindFromText(trimmed);
        this.startEvent(kind, deriveLabelFromLine(trimmed));
        this.hasHadToolAction = this.hasHadToolAction || kind !== "thinking";
        this.appendLine(line);
        return;
      }
    }

    // ── No event yet, or current event is "system" → start thinking ──
    if (!current || current.kind === "system") {
      this.startEvent("thinking", deriveLabelFromLine(trimmed));
      this.appendLine(line);
      return;
    }

    // ── Default: append to current event ──
    this.appendLine(line);
  }

  private lastEvent(): ActivityEvent | null {
    return this.events.length > 0 ? this.events[this.events.length - 1] : null;
  }

  private ensureCurrent(): void {
    if (this.events.length === 0) {
      this.events.push({
        id: this.nextId++,
        kind: this.currentKind,
        label: this.currentKind === "system" ? "Preparing" : "Thinking",
        body: "",
        timestamp: Date.now(),
      });
    }
  }

  private startEvent(kind: ActivityKind, _label: string): void {
    const prev = this.lastEvent();
    // v61: labels are just the action-type name, no summarization
    const normalizedLabel = formatEventLabel(kind);

    // ── End timing for completed thinking phase ──
    if (prev && prev.kind === "thinking" && kind !== "thinking" && !prev.endTime) {
      prev.endTime = Date.now();
    }

    // ── Merge: same kind + same label → update existing event ──
    if (prev && prev.kind === kind && prev.label.toLowerCase() === normalizedLabel.toLowerCase()) {
      prev.timestamp = Date.now();
      return;
    }

    // ── Merge: consecutive thinking events → keep first label ──
    if (prev && prev.kind === "thinking" && kind === "thinking") {
      prev.timestamp = Date.now();
      delete prev.endTime;
      return;
    }

    // Trim trailing whitespace on previous event
    if (prev) {
      prev.body = prev.body.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
    }

    this.currentKind = kind;
    this.events.push({
      id: this.nextId++,
      kind,
      label: normalizedLabel,
      body: "",
      timestamp: Date.now(),
    });

    // Memory: cap at 100 events
    if (this.events.length > 100) {
      this.events = this.events.slice(-80);
    }
  }

  private appendLine(line: string): void {
    this.ensureCurrent();
    const current = this.events[this.events.length - 1];
    current.body += line + "\n";

    // Memory: cap individual event body
    if (current.body.length > 8000) {
      current.body = "…" + current.body.slice(-6000);
    }
  }

  /** Get the current event list (reference — do not mutate). */
  getEvents(): ActivityEvent[] {
    return this.events;
  }

  /** Get accumulated raw text. */
  getRawText(): string {
    return this.rawText;
  }

  /** Reset parser state for a new stream. */
  reset(): void {
    this.events = [];
    this.nextId = 0;
    this.pendingLine = "";
    this.currentKind = "system";
    this.hasHadToolAction = false;
    this.rawText = "";
  }

  /** One-shot: parse a complete text blob into events (for saved messages). */
  static parseText(text: string): ActivityEvent[] {
    if (!text || !text.trim()) return [];
    const parser = new StreamEventParser();
    parser.processChunk(text + "\n");
    parser.flush();
    return [...parser.getEvents()];
  }

  /**
   * Generate a structured "Actions taken" summary from a list of events.
   * Groups by action type, de-duplicated, for rendering in the result panel.
   */
  static buildActionSummary(events: ActivityEvent[]): ActionSummary {
    const result: ActionSummary = { changes: [], executions: [], inspections: [] };
    const seen = new Set<string>();

    for (const ev of events) {
      if (!ev.label) continue;
      const key = `${ev.kind}:${ev.label.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      switch (ev.kind) {
        case "edit":
          result.changes.push(ev.label);
          break;
        case "run":
          result.executions.push(ev.label);
          break;
        case "read":
        case "list":
        case "search":
          result.inspections.push(ev.label);
          break;
      }
    }

    return result;
  }
}

export interface ActionSummary {
  changes: string[];
  executions: string[];
  inspections: string[];
}
