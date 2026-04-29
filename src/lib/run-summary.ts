/* ═══════════════════════════════════════════════════════════════
   RunSummary — dynamic, mode-aware response formatting engine
   ═══════════════════════════════════════════════════════════════
   Classifies AI responses into rendering modes based on:
   1. Structural events (file edits, commands, inspections)
   2. Response intent (action, explanation, analysis, etc.)
   3. Confidence scoring — only apply structured sections when
      there's strong evidence they improve readability

   Response modes:
   ─ "structured"  — task execution (files changed, commands run)
   ─ "conversational" — explanation, overview, Q&A
   ─ "analysis"    — diagnosis, assessment, gap analysis
   ─ "instructional" — how-to, tutorial, step-by-step
   ─ "plain"       — fallback when confidence is too low

   Each mode has its own section eligibility rules and renderer
   hint so the card component can choose the right presentation.
   ═══════════════════════════════════════════════════════════════ */

import { StreamEventParser, type ActivityEvent } from "./stream-event-parser";

// ─── Schema ───────────────────────────────────────────────────

export type RunStatus = "success" | "partial" | "warning" | "blocked" | "info";

export type ResponseMode = "structured" | "conversational" | "analysis" | "instructional" | "plain";

/** Response intent — determines framing of the top-level status */
export type ResponseIntent = "action" | "explanation" | "analysis" | "debug" | "instructional" | "unknown";

export interface RunSummarySection {
  heading: string;
  items: string[];
  /** Rich structured steps — renderer uses these instead of flat items when present */
  actionSteps?: ActionStep[];
}

/** Rich action step for structured next-steps / how-to rendering */
export interface ActionStep {
  title: string;
  details: string[];
}

export interface RunSummary {
  /** Overall run status */
  status: RunStatus;
  /** Context-aware label for the status (e.g. "Completed" vs "Overview") */
  statusLabel: string;
  /** Detected response intent */
  intent: ResponseIntent;
  /** Rendering mode — tells the card how to present this response */
  mode: ResponseMode;
  /** Confidence that structured formatting is appropriate (0–1) */
  confidence: number;
  /** One-line outcome description */
  outcome: string;
  /** Sections to display (dynamic — only populated sections are included) */
  sections: RunSummarySection[];
  /** Clean prose text for conversational/plain mode rendering */
  proseText: string;
  /** Concise summary text for the top of the card (not the full response) */
  summaryText: string;
  /** The full original text for the collapsed detail view */
  fullText: string;
  /** Whether a summary was actually derived (false = show full text only) */
  hasSummary: boolean;
  /** Whether the summary was authored by the model (## Summary block) vs heuristic */
  hasModelSummary: boolean;
}

// ─── Extraction helpers ───────────────────────────────────────

/** Deduplicate and clean a list of short strings */
function dedup(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const key = raw.toLowerCase().replace(/[`"']/g, "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(raw.trim());
  }
  return result;
}

/** Cross-deduplicate: remove items from `b` that substantially overlap with `a` */
function crossDedup(a: string[], b: string[]): string[] {
  if (!a.length) return b;
  const aKeys = new Set(a.map((s) => s.toLowerCase().replace(/[`"'*]/g, "").trim().slice(0, 60)));
  return b.filter((s) => {
    const key = s.toLowerCase().replace(/[`"'*]/g, "").trim().slice(0, 60);
    // Check exact match and 80% substring overlap
    for (const ak of aKeys) {
      if (ak === key) return false;
      if (ak.length > 20 && key.includes(ak.slice(0, Math.floor(ak.length * 0.8)))) return false;
      if (key.length > 20 && ak.includes(key.slice(0, Math.floor(key.length * 0.8)))) return false;
    }
    return true;
  });
}

/** Truncate a string cleanly */
function truncClean(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const sentenceEnd = t.search(/[.!?]\s/);
  if (sentenceEnd > 20 && sentenceEnd < max) return t.slice(0, sentenceEnd + 1).trim();
  const cut = t.lastIndexOf(" ", max - 1);
  return (cut > max * 0.5 ? t.slice(0, cut) : t.slice(0, max - 1)) + "…";
}

/** Strip markdown-style formatting for plain-text summaries */
function stripMd(s: string): string {
  return s
    .replace(/^#+\s+/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

// ─── Model-authored summary extraction ────────────────────────
//
// The compiled prompt asks the model to end every response with:
//   ## Summary
//   <concise user-facing digest>
//
// This extractor reliably pulls that block out of the raw response.
// If the model didn't produce one, returns null — the existing
// heuristic summary kicks in as fallback.
// ───────────────────────────────────────────────────────────────

/** Regex that matches "## Summary" heading (case-insensitive, allows emoji/bold) */
const MODEL_SUMMARY_HEADING_RE = /^#{1,3}\s+(?:\*\*)?summary(?:\*\*)?(?:\s*[:—-].*)?$/im;

/** Sections that come AFTER the summary in our prompt contract */
const POST_SUMMARY_HEADINGS_RE = /^#{1,3}\s+(?:attention\s+user\s+input\s+required|task.?status)/im;

/** Extract the model-authored ## Summary block from the end of a response.
 *  Returns { summaryBlock, rawWithoutSummary } or null if not found. */
function extractModelSummary(text: string): { summaryBlock: string; rawWithoutSummary: string } | null {
  const lines = text.split("\n");

  // Find the LAST occurrence of ## Summary heading (model may have multiple)
  let summaryLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (MODEL_SUMMARY_HEADING_RE.test(lines[i].trim())) {
      summaryLineIdx = i;
      break;
    }
  }

  if (summaryLineIdx === -1) return null;

  // Collect summary body — everything from heading+1 until next post-summary heading,
  // another ## heading, TASK_STATUS line, or end of text
  const bodyLines: string[] = [];
  for (let i = summaryLineIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    // Stop at post-summary sections or TASK_STATUS metadata
    if (POST_SUMMARY_HEADINGS_RE.test(t)) break;
    if (/^TASK_STATUS:/i.test(t)) break;
    if (/^TASK_STATUS_REASON:/i.test(t)) break;
    // Stop at a new ## heading that isn't part of the summary
    if (/^#{1,3}\s+/.test(t) && !MODEL_SUMMARY_HEADING_RE.test(t)) break;
    bodyLines.push(lines[i]);
  }

  const summaryBlock = bodyLines.join("\n").trim();

  // Must be substantive — at least 20 chars to be a real summary
  if (summaryBlock.length < 20) return null;

  // Build the raw text without the summary block (for the collapsed detail view)
  const beforeSummary = lines.slice(0, summaryLineIdx).join("\n").trimEnd();
  // Keep TASK_STATUS and other trailing metadata in raw for integrity
  const afterSummaryStartIdx = summaryLineIdx + 1 + bodyLines.length;
  const afterSummary = lines.slice(afterSummaryStartIdx).join("\n").trimStart();

  const rawWithoutSummary = afterSummary
    ? `${beforeSummary}\n\n${afterSummary}`
    : beforeSummary;

  return { summaryBlock, rawWithoutSummary: rawWithoutSummary.trim() };
}

// ─── Section quality scoring ──────────────────────────────────
//
// Each section item is scored for specificity and usefulness.
// Generic single-word labels ("Editing", "Running", "Reading")
// and vague phrases ("Update things", "Verify stuff") are scored
// near zero and filtered out.  When a model-authored summary
// exists, the quality threshold is raised so only genuinely
// useful, concrete sections survive alongside the summary.
// ───────────────────────────────────────────────────────────────

/** Known generic / low-value labels that should never appear as section items */
const GENERIC_ITEM_RE = /^(?:editing|running|reading|checking|processing|reviewing|updating|searching|listing|working|writing|creating|building|testing|verifying|preparing|configuring|installing|deploying|fixing|starting|stopping|cleaning|copying|moving|renaming|deleting|removing|importing|exporting|formatting|documenting|launching|serving|executing|implementing|scaffolding|connecting|integrating|patching|extending|rebuilding|adjusting|hooking|file|command|changes?|verification|update\s*things?|verify\s*stuff|do\s*stuff|check\s*things?|make\s*changes?|done|thinking|system|preparing|working)$/i;

/** Score an individual section item for quality/specificity.
 *  Returns 0 (garbage) → 1 (excellent). */
function scoreItemQuality(item: string): number {
  const t = item.trim();
  if (t.length < 5) return 0;
  if (GENERIC_ITEM_RE.test(t)) return 0;
  // Single word with no specificity
  if (!/\s/.test(t) && t.length < 20) return 0.05;

  let score = 0.2;

  // File path or extension → concrete
  if (/\.\w{1,5}(?:\s|$|[`"'),])/.test(t) || /[/\\]\w/.test(t)) score += 0.3;
  // Shell command
  if (/\b(?:npm|npx|node|git|pip|python|cargo|docker|curl|mkdir|cd|cat|rm|cp|mv)\b/i.test(t)) score += 0.25;
  // Port / URL / host
  if (/\b(?:port\s*\d|localhost|:\d{4,5}|https?:\/\/)\b/i.test(t)) score += 0.2;
  // Version number
  if (/\b\d+\.\d+\.\d+\b/.test(t)) score += 0.15;
  // camelCase or kebab-case identifiers → concrete code references
  if (/[A-Z][a-z]+[A-Z]/.test(t) || /[a-z]+-[a-z]+/.test(t)) score += 0.2;
  // Backtick-wrapped code spans
  if (/`.+`/.test(t)) score += 0.2;
  // Specific technical terms
  if (/\b(?:config|component|module|function|class|interface|schema|route|endpoint|middleware|hook|provider|context|state|prop|handler|service|model|controller|template|migration|query|index|table|column|field|key|token|session|header|param|variable)\b/i.test(t)) score += 0.15;
  // Length bonus — longer items tend to be more specific
  if (t.length > 30) score += 0.1;
  if (t.length > 60) score += 0.1;

  // Penalty for vague "verb + generic noun" patterns
  if (/^(?:update|check|fix|add|remove|change|set|modify|verify|test|review|inspect|read|edit|run|create|write|build|configure|install|deploy)\s+(?:the\s+)?(?:things?|stuff|it|this|that|them|code|files?|project|app)$/i.test(t)) {
    score = Math.min(score, 0.1);
  }

  return Math.min(Math.max(score, 0), 1);
}

/** Filter sections by quality.  When a model-authored summary
 *  exists the threshold is raised so only high-value sections survive. */
function filterSectionsByQuality(
  sections: RunSummarySection[],
  hasModelSummary: boolean,
  summaryText: string,
): RunSummarySection[] {
  const threshold = hasModelSummary ? 0.4 : 0.15;
  const summaryLower = summaryText.toLowerCase();

  return sections
    .map((section) => {
      const qualityItems = section.items.filter((item) => {
        if (scoreItemQuality(item) < threshold) return false;
        // When model summary exists, suppress items that merely
        // restate something already communicated in the summary
        if (hasModelSummary && summaryLower.length > 30) {
          const itemLower = item.toLowerCase().replace(/[`"'*]/g, "").trim();
          if (itemLower.length < 40 && summaryLower.includes(itemLower)) return false;
        }
        return true;
      });
      return { ...section, items: qualityItems };
    })
    .filter((section) => section.items.length > 0);
}

/** Check if a line looks like a URL or path instruction */
const URL_OR_PATH_RE = /(?:https?:\/\/|localhost[:/]|\bvisit\b|\bopen\b|\bnavigate\b|\bgo to\b|\bbrowse\b|\.html\b|:\d{4,5}\b)/i;

/** Warning/caveat signal */
const CAVEAT_RE = /\b(?:caveat|warning|assumption|limitation|careful|keep in mind|be aware|workaround|not yet implemented|does not support|doesn't support|won't work|cannot|can't handle)\b/i;

/** Internal narration — should NOT go into sections */
const NARRATION_RE = /^(?:I'm (?:going to|inspecting|checking|looking|reading|running|now)|I (?:need|will|should)|Let me|Next I|First I|Now I|Looking at|Let's)/i;

/** Heading fragment — should NOT go into sections */
const HEADING_FRAGMENT_RE = /^(?:What (?:it|this|the) |How (?:it|the|to) |Where |When |Why |The (?:stack|architecture|structure|code|app|project|frontend|backend|database|API)[^.]*:?\s*$)/i;

/** Verification/check signal */
const VERIFY_RE = /\b(?:verified|confirmed|tested|passed|passing|smoke.?test|successfully|all (?:good|clear|passing)|no (?:errors?|issues?|failures?))\b/i;

/** Next-step signal */
const NEXT_STEP_RE = /\b(?:you can|you should|you could|you might|try |to (?:use|test|run|view|preview|access|finish|complete|add|fix|implement)|if you (?:want|need)|going forward|from here|follow.?up|after this|I (?:recommend|suggest)|consider)\b/i;

/** Numbered option */
const NUMBERED_OPTION_RE = /^\d+\.\s+/;

// ─── Intent detection ─────────────────────────────────────────

function detectIntent(events: ActivityEvent[], text: string): ResponseIntent {
  const hasEdits = events.some((e) => e.kind === "edit");
  const hasRuns = events.some((e) => e.kind === "run");

  // If there are actual file edits or command executions, it's an action run
  if (hasEdits || hasRuns) return "action";

  const lower = text.toLowerCase();

  // Debug-oriented
  if (/\b(?:debug|diagnos|error|bug|fix|issue|stack.?trace|traceback|exception)\b/i.test(lower) &&
      /\b(?:cause|reason|because|due to|root cause|the problem|the issue)\b/i.test(lower)) {
    return "debug";
  }

  // Analysis-oriented
  if (/\b(?:incomplete|inconsistent|gap|missing|not (?:implemented|mounted|live|registered))\b/i.test(lower) &&
      /\b(?:what (?:is|are)|current (?:state|status)|assessment|analysis)\b/i.test(lower)) {
    return "analysis";
  }

  // Instructional — has step-by-step structure
  if (/\b(?:step \d|first,?\s|second,?\s|third,?\s|finally,?\s|follow these|how to|tutorial|guide)\b/i.test(lower) &&
      (NUMBERED_OPTION_RE.test(text) || (text.match(/^\d+\.\s/gm)?.length ?? 0) >= 3)) {
    return "instructional";
  }

  return "explanation";
}

// ─── Response nature detection ────────────────────────────────
//
// Beyond intent (action vs explanation), detect whether an action
// response represents a "completion" (setup done, task finished,
// build complete) vs an "investigation" (debugging, exploring,
// checking code).  This drives middle-section selection:
// - completion → prefer "Recommended next steps" over "What I checked"
// - investigation → keep "What I checked" as a useful section
// - explanation → suppress action-oriented sections entirely
// ───────────────────────────────────────────────────────────────

type ResponseNature = "completion" | "investigation" | "explanation";

const COMPLETION_SIGNAL_RE = /\b(?:completed?|finished|done|ready|set up|configured|installed|deployed|created|implemented|built|established|initialized|scaffolded|generated|fixed|resolved|patched|refactored|migrated|updated|all (?:good|clear|passing|set|done|complete)|everything (?:is|works|looks)|successfully|you can now|your .{1,30} is (?:ready|live|running|working|set up))\b/i;

const INVESTIGATION_SIGNAL_RE = /\b(?:investigating|examining|inspecting|diagnosing|debugging|looking (?:at|into)|checking|analyzing|reviewing|found that|discovered|noticed|the (?:issue|problem|bug|error|cause) (?:is|was|seems)|root cause)\b/i;

function detectResponseNature(intent: ResponseIntent, text: string, events: ActivityEvent[]): ResponseNature {
  if (intent === "explanation" || intent === "instructional") return "explanation";

  const lower = text.toLowerCase();
  const hasEdits = events.some(e => e.kind === "edit");
  const hasRuns = events.some(e => e.kind === "run");
  const readCount = events.filter(e => e.kind === "read" || e.kind === "search").length;

  const completionHits = (lower.match(new RegExp(COMPLETION_SIGNAL_RE.source, "gi")) || []).length;
  const investigationHits = (lower.match(new RegExp(INVESTIGATION_SIGNAL_RE.source, "gi")) || []).length;

  // Strong completion: has edits/runs AND multiple completion signals
  if ((hasEdits || hasRuns) && completionHits >= 2) return "completion";

  // Strong investigation: lots of reads, investigation language
  if (readCount >= 3 && investigationHits >= 2) return "investigation";

  // Analysis/debug intent leans investigation
  if (intent === "analysis" || intent === "debug") return "investigation";

  // Default for action intent: if edits exist, lean completion
  if (hasEdits) return "completion";
  if (hasRuns && completionHits >= 1) return "completion";

  return "investigation";
}

// ─── Mode classification —————————————————————————————————————

interface ModeClassification {
  mode: ResponseMode;
  confidence: number;
}

function classifyMode(events: ActivityEvent[], intent: ResponseIntent, text: string): ModeClassification {
  const hasEdits = events.some((e) => e.kind === "edit");
  const hasRuns = events.some((e) => e.kind === "run");
  const editCount = events.filter((e) => e.kind === "edit").length;
  const runCount = events.filter((e) => e.kind === "run").length;
  const readCount = events.filter((e) => e.kind === "read").length;

  // ── Strong structural signals → structured mode ──
  if (hasEdits && editCount >= 1) {
    return { mode: "structured", confidence: Math.min(0.5 + editCount * 0.15 + runCount * 0.1, 1.0) };
  }
  if (hasRuns && runCount >= 2) {
    return { mode: "structured", confidence: Math.min(0.4 + runCount * 0.15, 0.95) };
  }

  // ── Single command run with mostly reading → check if it was a real action ──
  if (hasRuns && runCount === 1 && readCount >= 2) {
    // Likely an investigation run, not a task execution
    if (intent === "explanation" || intent === "analysis") {
      return { mode: intent === "analysis" ? "analysis" : "conversational", confidence: 0.6 };
    }
    return { mode: "structured", confidence: 0.45 };
  }

  // ── Intent-based classification for non-action responses ──
  if (intent === "instructional") {
    return { mode: "instructional", confidence: 0.7 };
  }
  if (intent === "analysis" || intent === "debug") {
    return { mode: "analysis", confidence: 0.65 };
  }
  if (intent === "explanation") {
    // Check if the text is predominantly prose
    const lines = text.split("\n").filter((l) => l.trim());
    const proseLines = lines.filter((l) => !l.trim().startsWith("#") && !l.trim().startsWith("-") && !l.trim().startsWith("*") && l.trim().length > 30);
    const proseRatio = proseLines.length / Math.max(lines.length, 1);
    if (proseRatio > 0.4) {
      return { mode: "conversational", confidence: 0.6 + proseRatio * 0.3 };
    }
    return { mode: "conversational", confidence: 0.5 };
  }

  // ── Fallback → plain if no strong signals ──
  return { mode: "plain", confidence: 0.3 };
}

// ─── Prose/conversational text extractor ──────────────────────

function extractCleanProse(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let skipToolBlock = false;

  for (const line of lines) {
    const t = line.trim();

    // Skip tool invocation narration
    if (NARRATION_RE.test(t)) { skipToolBlock = true; continue; }
    // Skip lines that look like file paths or code output
    if (/^[/\\]/.test(t) || /^\d+\s*[│|]/.test(t)) continue;
    // Skip empty-ish lines after narration block
    if (skipToolBlock && t.length === 0) { skipToolBlock = false; continue; }
    if (skipToolBlock && t.length < 30 && !/[.!?]$/.test(t)) continue;
    skipToolBlock = false;

    out.push(line);
  }

  // Remove leading/trailing blank lines
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();

  return out.join("\n").trim();
}

// ─── Summary text extractor ───────────────────────────────────

/** Extract a concise summary from the first substantive paragraph(s) of text.
 *  Skips narration, headings, bullets, code — returns only opening prose. */
function extractSummaryText(text: string, fallback: string): string {
  const lines = text.split("\n");
  const paras: string[] = [];
  let buf: string[] = [];
  let total = 0;
  const CAP = 400;
  let inCode = false;

  function flush() {
    if (!buf.length) return;
    const para = stripMd(buf.join(" ").trim());
    if (para.length >= 20) { paras.push(para); total += para.length; }
    buf = [];
  }

  for (const line of lines) {
    const t = line.trim();
    if (/^```/.test(t)) { inCode = !inCode; flush(); continue; }
    if (inCode) continue;
    if (NARRATION_RE.test(t)) continue;
    if (/^[/\\]/.test(t) || /^\d+\s*[│|]/.test(t)) continue;
    if (!t || /^#{1,3}\s+/.test(t)) { flush(); if (total >= CAP) break; continue; }
    if (/^[-*]\s+/.test(t) || NUMBERED_OPTION_RE.test(t)) { flush(); continue; }
    buf.push(t);
  }
  flush();

  if (!paras.length) return fallback;

  let out = paras[0];
  if (paras.length > 1 && out.length + paras[1].length + 2 <= CAP) {
    out += "\n\n" + paras[1];
  }
  return out.length > CAP ? truncClean(out, CAP) : out;
}

// ─── Markdown section parser ──────────────────────────────────

/** Canonical section types — used for mode-aware prioritization */
type CanonicalSection =
  | "overview" | "purpose" | "architecture" | "features"
  | "technical" | "workflow" | "caveats" | "next-steps" | "other";

interface ParsedMdSection {
  heading: string;
  canonical: CanonicalSection;
  items: string[];
  sourceOrder: number;
}

/** Classify a heading string into a canonical section type */
function classifyHeading(heading: string): CanonicalSection {
  const h = heading.toLowerCase();
  if (/\b(?:summary|overview|introduction|about|description|tl;?dr)\b/.test(h)) return "overview";
  if (/\b(?:purpose|goal|mission|objective|what (?:it|this) (?:is|does)|core)\b/.test(h)) return "purpose";
  if (/\b(?:architecture|structure|stack|tech(?:nology)? stack|system design|layout)\b/.test(h)) return "architecture";
  if (/\b(?:features?|completed|built|implemented|capabilities|functionality|working|included|done)\b/.test(h)) return "features";
  if (/\b(?:database|api|backend|frontend|server|models?|schema|endpoints?|routes?|config(?:uration)?|setup|dependencies|technical)\b/.test(h)) return "technical";
  if (/\b(?:workflow|process|how (?:it|this) works|flow|pipeline|lifecycle)\b/.test(h)) return "workflow";
  if (/\b(?:caveats?|limitations?|warnings?|issues?|concerns?|risks?|trade.?offs?)\b/.test(h)) return "caveats";
  if (/\b(?:next|remaining|todo|to.?do|future|roadmap|planned|upcoming|improvements?|missing|what(?:'s| is) (?:left|next))\b/.test(h)) return "next-steps";
  return "other";
}

/** Lower number = higher priority. Explanatory responses favor descriptive sections. */
const EXPLANATORY_PRIORITY: Record<CanonicalSection, number> = {
  overview: 0, purpose: 1, architecture: 2, features: 3,
  workflow: 4, technical: 5, other: 5, caveats: 6, "next-steps": 7,
};

/** Action-oriented responses favor outcome and next-action sections. */
const ACTION_PRIORITY: Record<CanonicalSection, number> = {
  overview: 3, purpose: 5, architecture: 6, features: 2,
  workflow: 4, technical: 5, other: 5, caveats: 6, "next-steps": 1,
};

/** Parse markdown text into heading-based sections with canonical types */
function parseMarkdownSections(text: string): ParsedMdSection[] {
  const lines = text.split("\n");
  const sections: ParsedMdSection[] = [];
  let currentHeading: string | null = null;
  let currentItems: string[] = [];
  let order = 0;
  let inCode = false;

  function flush() {
    if (currentHeading && currentItems.length > 0) {
      // Strip markdown, emoji, bold formatting from heading
      const clean = currentHeading
        .replace(/^#+\s+/, "")
        .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .trim();
      if (clean.length > 1) {
        sections.push({
          heading: clean,
          canonical: classifyHeading(clean),
          items: dedup(currentItems.map((i) => truncClean(i, 300))).slice(0, 8),
          sourceOrder: order++,
        });
      }
    }
    currentHeading = null;
    currentItems = [];
  }

  for (const line of lines) {
    const t = line.trim();
    if (/^```/.test(t)) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (NARRATION_RE.test(t)) continue;

    const headingMatch = t.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1];
      continue;
    }

    if (!currentHeading) continue;

    // Bullet or numbered item
    if (/^[-*]\s+/.test(t) || NUMBERED_OPTION_RE.test(t)) {
      const clean = stripMd(t.replace(/^[-*\d.]+\s+/, ""));
      if (clean.length > 8) currentItems.push(clean);
      continue;
    }

    // Bold standalone line (sub-heading like **Frontend (React on port 3002)**)
    if (/^\*\*[^*]+\*\*\s*$/.test(t)) {
      const clean = t.replace(/\*\*/g, "").trim();
      if (clean.length > 5) currentItems.push(clean);
    }
  }
  flush();

  return sections;
}

// ─── Prose section extractor ──────────────────────────────────

interface ProseExtraction {
  outcome: string;
  keyPoints: string[];
  howToUse: string[];
  checks: string[];
  caveats: string[];
  nextSteps: string[];
}

function extractProseSignals(text: string): ProseExtraction {
  const result: ProseExtraction = {
    outcome: "",
    keyPoints: [],
    howToUse: [],
    checks: [],
    caveats: [],
    nextSteps: [],
  };

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  function isNoise(s: string): boolean {
    return NARRATION_RE.test(s) || HEADING_FRAGMENT_RE.test(s) || s.length < 12;
  }

  // ── Find outcome: the first substantive sentence that reads like a summary ──
  const outcomePatterns = [
    /^(?:this (?:project|repo|app|codebase|system) (?:is|has|contains|provides|implements|uses))\b/i,
    /^(?:I(?:'ve| have) (?:completed|finished|done|made|added|created|updated|fixed|built|implemented|set up|configured|installed|deployed|refactored|resolved|patched))\b/i,
    /^(?:The .{5,60} (?:is|has been|was) (?:now |successfully |fully )?(?:completed|created|updated|added|fixed|running|working|deployed|installed|configured))/i,
    /^(?:Current state|In (?:summary|short|plain terms)|Overall|The (?:result|outcome|stack|project|app|code)[^.]{0,40}:)/i,
    /^(?:Everything|All \w+ (?:are|is|have been))/i,
  ];

  for (const line of lines) {
    const stripped = stripMd(line);
    if (stripped.length < 15 || stripped.length > 300) continue;
    if (isNoise(stripped)) continue;
    for (const pat of outcomePatterns) {
      if (pat.test(stripped)) {
        result.outcome = truncClean(stripped, 250);
        break;
      }
    }
    if (result.outcome) break;
  }

  // ── Scan lines for section signals ──
  let inNextStepsBlock = false;
  let inKeyPointsBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = stripMd(line);
    if (stripped.length < 5) continue;

    const heading = stripped.match(/^(?:#{1,3}\s+)?(.+)/)?.[1] || "";

    // Detect section heading boundaries
    if (/(?:next steps?|how to|usage|getting started|to (?:use|test|run|try)|what(?:'s| is) next|if you want|from here)/i.test(heading)) {
      inNextStepsBlock = true;
      inKeyPointsBlock = false;
      continue;
    }
    if (/(?:key (?:points?|features?|details?|components?)|overview|summary|what (?:it|this) (?:does|is)|main (?:features?|parts?)|specifically|includes?:)/i.test(heading)) {
      inKeyPointsBlock = true;
      inNextStepsBlock = false;
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      inNextStepsBlock = false;
      inKeyPointsBlock = false;
    }

    // Extract key points from bullet lists under relevant headings
    if (inKeyPointsBlock && (/^[-*]\s+/.test(stripped) || NUMBERED_OPTION_RE.test(stripped))) {
      const clean = stripped.replace(/^[-*\d.]+\s+/, "");
      if (clean.length > 10 && !isNoise(clean)) {
        result.keyPoints.push(truncClean(clean, 300));
      }
      continue;
    }

    // Next steps from heading block — capture ALL items, not just ones matching NEXT_STEP_RE
    if (inNextStepsBlock && (NUMBERED_OPTION_RE.test(stripped) || /^[-*]\s+/.test(stripped))) {
      const clean = stripped.replace(/^[-*\d.]+\s+/, "");
      if (clean.length > 5 && !isNoise(clean)) {
        result.nextSteps.push(truncClean(clean, 300));
      }
      continue;
    }

    if (isNoise(stripped)) continue;

    // URL / path instructions → how to use
    if (URL_OR_PATH_RE.test(stripped) && stripped.length < 200) {
      if (/^(?:[-*]\s+)?(?:Frontend|Backend|Database|Server|API|The |In )\[?/i.test(stripped)) continue;
      result.howToUse.push(truncClean(stripped.replace(/^[-*]\s+/, ""), 300));
    }

    // Verification signals
    if (VERIFY_RE.test(stripped) && stripped.length < 200) {
      const clean = stripped.replace(/^[-*]\s+/, "");
      if (clean.length > 10 && !isNoise(clean)) {
        result.checks.push(truncClean(clean, 300));
      }
    }

    // Caveat signals
    if (CAVEAT_RE.test(stripped) && stripped.length < 200 && stripped.length > 20) {
      const clean = stripped.replace(/^[-*]\s+/, "");
      if (!isNoise(clean)) {
        result.caveats.push(truncClean(clean, 300));
      }
    }

    // Next-step signals outside a heading block
    if (!inNextStepsBlock && NEXT_STEP_RE.test(stripped) && stripped.length < 200) {
      const clean = stripped.replace(/^[-*\d.]+\s+/, "");
      if (clean.length > 10 && !isNoise(clean) && !result.howToUse.includes(clean)) {
        result.nextSteps.push(truncClean(clean, 300));
      }
    }
  }

  return result;
}

// ─── Status inference ─────────────────────────────────────────

function inferStatus(events: ActivityEvent[], text: string, intent: ResponseIntent): RunStatus {
  const lowerText = text.toLowerCase();

  const hasError = events.some((e) => e.kind === "error");
  if (hasError) return "warning";

  if (/\b(?:blocked|cannot proceed|unable to|fatal|critical error|aborted)\b/i.test(lowerText)) return "blocked";

  // For non-action intents, don't use partial/warning status from content descriptions
  if (intent === "explanation" || intent === "analysis" || intent === "instructional") {
    return "info";
  }

  if (/\b(?:partial(?:ly)?|incomplete|not (?:fully|completely)|some .{0,20} (?:missing|incomplete|not))\b/i.test(lowerText)) return "partial";
  if (/\b(?:warning|caveat|careful|be aware|workaround|TODO|FIXME|hack)\b/i.test(lowerText)) return "warning";

  const hasActions = events.some((e) => e.kind === "edit" || e.kind === "run");
  if (hasActions) return "success";

  return "info";
}

// ─── Structured next-steps extraction ─────────────────────────
//
// Parses heading-delimited next-steps blocks into rich ActionStep
// objects that preserve title → command → URL → verification structure.
// ───────────────────────────────────────────────────────────────

function extractStructuredNextSteps(text: string): ActionStep[] {
  const lines = text.split("\n");
  const steps: ActionStep[] = [];
  let inBlock = false;
  let currentStep: ActionStep | null = null;
  let inCode = false;
  let codeFenceOpen = "";
  let codeAccum: string[] = [];

  for (const raw of lines) {
    const t = raw.trim();

    // Track code fences — capture code content as grouped detail with language tag
    if (/^```/.test(t)) {
      if (inCode) {
        // End of code block — flush as a single fenced detail preserving the opening fence
        if (currentStep && codeAccum.length > 0) {
          currentStep.details.push(codeFenceOpen + "\n" + codeAccum.join("\n") + "\n```");
        }
        codeAccum = [];
        codeFenceOpen = "";
      } else {
        codeFenceOpen = t; // e.g. "```bash" or "```"
      }
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      if (inBlock) codeAccum.push(raw.trimEnd());
      continue;
    }

    // Detect heading that signals next steps
    if (/^#{1,3}\s+/.test(t) && /(?:next\s+steps?|recommended|how\s+to\s+(?:use|test|verify|run)|getting\s+started|what(?:'s|\s+is)\s+next|from\s+here|try\s+it)/i.test(t)) {
      if (currentStep) { steps.push(currentStep); currentStep = null; }
      inBlock = true;
      continue;
    }

    // Another heading or metadata → exit block
    if ((/^#{1,3}\s+/.test(t) || /^TASK_STATUS/i.test(t)) && inBlock) {
      if (currentStep) { steps.push(currentStep); currentStep = null; }
      inBlock = false;
      continue;
    }

    if (!inBlock || !t) continue;

    // Top-level numbered or bullet item (at indent ≤ 1) → new step
    const indent = raw.search(/\S/);
    if (indent <= 1 && (NUMBERED_OPTION_RE.test(t) || /^[-*]\s+/.test(t))) {
      if (currentStep) steps.push(currentStep);
      const title = t
        .replace(/^[-*\d.]+\s+/, "")
        .replace(/^\*\*(.+?)\*\*(.*)$/, "$1$2")
        .trim();
      currentStep = title.length > 3 ? { title, details: [] } : null;
      continue;
    }

    // Paragraph text outside a list item but inside the block → attach to current or start implicit step
    if (currentStep && t.length > 2) {
      const cleaned = t.replace(/^[-*]\s+/, "").trim();
      if (cleaned.length > 2) currentStep.details.push(cleaned);
    } else if (!currentStep && t.length > 8) {
      // Standalone paragraph — treat as implicit step (e.g. "Move to the next task when...")
      currentStep = { title: t.replace(/^\*\*(.+?)\*\*(.*)$/, "$1$2").trim(), details: [] };
    }
  }

  if (currentStep) steps.push(currentStep);
  return steps.filter(s => s.title.length >= 5);
}

// ─── Section eligibility — confidence-gated ───────────────────

function buildSectionsForMode(
  mode: ResponseMode,
  intent: ResponseIntent,
  nature: ResponseNature,
  text: string,
  actionSummary: ReturnType<typeof StreamEventParser.buildActionSummary>,
  prose: ProseExtraction,
): RunSummarySection[] {
  const sections: RunSummarySection[] = [];

  // ── Markdown-aware extraction for non-structured modes ──
  // If the response has clear heading structure, parse and prioritize by mode
  if (mode === "conversational" || mode === "plain" || mode === "analysis") {
    const mdSections = parseMarkdownSections(text);
    // Skip "overview" sections — that content is already in summaryText
    const classified = mdSections.filter((s) => s.canonical !== "overview");

    if (classified.length >= 2) {
      const priority = (intent === "explanation" || mode === "conversational")
        ? EXPLANATORY_PRIORITY
        : ACTION_PRIORITY;

      const sorted = [...classified].sort((a, b) => {
        const pa = priority[a.canonical];
        const pb = priority[b.canonical];
        if (pa !== pb) return pa - pb;
        return a.sourceOrder - b.sourceOrder;
      });

      let allItems: string[] = [];
      for (const s of sorted.slice(0, 4)) {
        const items = crossDedup(allItems, s.items).slice(0, 6);
        if (items.length > 0) {
          sections.push({ heading: s.heading, items });
          allItems = [...allItems, ...items];
        }
      }

      if (sections.length > 0) return sections;
    }
  }

  // ── Signal-based fallback for conversational/plain ──
  if (mode === "conversational" || mode === "plain") {
    const keyPoints = dedup(prose.keyPoints);
    if (keyPoints.length >= 2) {
      sections.push({ heading: "Key points", items: keyPoints.slice(0, 8) });
    }
    const caveats = dedup(prose.caveats);
    if (caveats.length > 0) {
      sections.push({ heading: "Gaps & caveats", items: crossDedup(keyPoints, caveats).slice(0, 5) });
    }
    // Only show next steps in conversational mode when items are genuinely
    // actionable.  For pure explanation responses, require stronger evidence
    // so we don't show vague filler.
    const nextStepCandidates = dedup([...prose.howToUse, ...prose.nextSteps]);
    const qualifiedNextSteps = nextStepCandidates.filter(item => scoreItemQuality(item) >= 0.3);
    const minNextSteps = (intent === "explanation") ? 2 : 1;
    if (qualifiedNextSteps.length >= minNextSteps) {
      sections.push({ heading: "Next steps", items: crossDedup([...keyPoints, ...caveats], qualifiedNextSteps).slice(0, 5) });
    }
    return sections;
  }

  // ── Signal-based fallback for analysis ──
  if (mode === "analysis") {
    const keyPoints = dedup(prose.keyPoints);
    if (keyPoints.length > 0) {
      sections.push({ heading: "Key findings", items: keyPoints.slice(0, 8) });
    }
    const caveats = dedup(prose.caveats);
    if (caveats.length > 0) {
      sections.push({ heading: "Gaps & caveats", items: crossDedup(keyPoints, caveats).slice(0, 5) });
    }
    const nextSteps = dedup([...prose.howToUse, ...prose.nextSteps]);
    if (nextSteps.length > 0) {
      sections.push({ heading: "Next steps", items: crossDedup([...keyPoints, ...caveats], nextSteps).slice(0, 5) });
    }
    return sections;
  }

  if (mode === "instructional") {
    const caveats = dedup(prose.caveats);
    if (caveats.length > 0) {
      sections.push({ heading: "Notes", items: caveats.slice(0, 5) });
    }
    return sections;
  }

  // ── Structured (action/task) mode — nature-aware sections ──
  //
  // Completion responses (setup done, build finished, task complete):
  //   changes → commands → recommended next steps → how to verify → notes
  //   "What I checked" is suppressed — it's not useful for completions.
  //
  // Investigation responses (debugging, exploring, diagnosing):
  //   changes → commands → what I checked → next steps (optional) → notes
  //   "What I checked" is the natural middle section for investigations.
  // ──────────────────────────────────────────────────────────────────────

  const changes = dedup(actionSummary.changes);
  if (changes.length > 0) {
    sections.push({ heading: "What changed", items: changes.slice(0, 12) });
  }

  const commands = dedup(actionSummary.executions);
  if (commands.length > 0) {
    sections.push({ heading: "Commands run", items: commands.slice(0, 8) });
  }

  // "What I checked" is removed — it adds noise to every response type.

  // Next steps: for completions this is the preferred middle section;
  // for investigations it's optional supplementary info.
  // Only include items that are genuinely actionable (quality-gated).
  const nextStepCandidates = dedup([...prose.howToUse, ...prose.nextSteps]);
  const qualifiedNextSteps = nextStepCandidates.filter(item => scoreItemQuality(item) >= 0.25);
  if (qualifiedNextSteps.length > 0) {
    const allPrior = [...changes, ...commands];
    const filtered = crossDedup(allPrior, qualifiedNextSteps).slice(0, 6);
    if (filtered.length > 0) {
      sections.push({ heading: "Recommended next steps", items: filtered });
    }
  }

  // For completions, show verification signals as "How to verify" if present
  if (nature === "completion") {
    const verifyItems = dedup(prose.checks).filter(item => scoreItemQuality(item) >= 0.3);
    if (verifyItems.length > 0) {
      const allPrior = [...changes, ...commands, ...qualifiedNextSteps];
      const filtered = crossDedup(allPrior, verifyItems).slice(0, 5);
      if (filtered.length > 0) {
        sections.push({ heading: "How to verify", items: filtered });
      }
    }
  }

  const caveats = dedup(prose.caveats);
  if (caveats.length > 0) {
    sections.push({ heading: "Notes", items: caveats.slice(0, 5) });
  }

  return sections.filter((s) => s.items.length > 0);
}

// ─── Status label derivation ──────────────────────────────────

function deriveStatusLabel(mode: ResponseMode, intent: ResponseIntent, status: RunStatus): string {
  if (mode === "conversational" || mode === "plain") {
    if (intent === "explanation") return "Overview";
    return "Response";
  }
  if (mode === "analysis") {
    return status === "blocked" ? "Blocked" : "Analysis";
  }
  if (mode === "instructional") return "Guide";

  // Structured
  const map: Record<RunStatus, string> = {
    success: "Completed",
    partial: "Partially completed",
    warning: "Completed with notes",
    blocked: "Blocked",
    info: "Done",
  };
  return map[status];
}

// ─── Main extraction pipeline ─────────────────────────────────

export function buildRunSummary(text: string): RunSummary {
  const fullText = text || "";
  const trimmed = fullText.trim();

  // Always honor a model-authored ## Summary block, even on short responses.
  // Without this, short answers fall through to the raw renderer and the
  // "## Summary" heading shows up verbatim in the chat bubble.
  const earlyModelSummary = extractModelSummary(trimmed);
  if (earlyModelSummary) {
    return {
      status: "info",
      statusLabel: "Response",
      intent: "explanation",
      mode: "conversational",
      confidence: 0.8,
      outcome: "",
      summaryText: earlyModelSummary.summaryBlock,
      sections: [],
      proseText: earlyModelSummary.rawWithoutSummary,
      fullText,
      hasSummary: true,
      hasModelSummary: true,
    };
  }

  // Very short responses don't need summarization
  if (trimmed.length < 200 || trimmed.split("\n").length < 5) {
    return {
      status: "info",
      statusLabel: "Done",
      intent: "unknown",
      mode: "plain",
      confidence: 0,
      outcome: "",
      summaryText: trimmed,
      sections: [],
      proseText: trimmed,
      fullText,
      hasSummary: false,
      hasModelSummary: false,
    };
  }

  // 1. Re-parse text into structured events
  const events = StreamEventParser.parseText(trimmed);
  const actionSummary = StreamEventParser.buildActionSummary(events);

  // 2. Detect intent
  const intent = detectIntent(events, trimmed);

  // 2b. Detect response nature (completion vs investigation vs explanation)
  const nature = detectResponseNature(intent, trimmed, events);

  // 3. Classify rendering mode + confidence
  const { mode, confidence } = classifyMode(events, intent, trimmed);

  // 4. Extract prose signals
  const prose = extractProseSignals(trimmed);

  // 5. Extract clean prose for conversational rendering
  const proseText = (mode === "conversational" || mode === "plain" || mode === "instructional")
    ? extractCleanProse(trimmed)
    : "";

  // 6. Infer status
  const status = inferStatus(events, trimmed, intent);

  // 7. Derive context-aware status label
  const statusLabel = deriveStatusLabel(mode, intent, status);

  // 8. Build outcome
  let outcome = prose.outcome;
  if (!outcome && mode === "structured") {
    const counts: string[] = [];
    if (actionSummary.changes.length) counts.push(`${actionSummary.changes.length} change${actionSummary.changes.length > 1 ? "s" : ""}`);
    if (actionSummary.executions.length) counts.push(`${actionSummary.executions.length} command${actionSummary.executions.length > 1 ? "s" : ""}`);
    if (actionSummary.inspections.length) counts.push(`${actionSummary.inspections.length} file${actionSummary.inspections.length > 1 ? "s" : ""} inspected`);
    if (counts.length) outcome = counts.join(", ");
  }
  if (!outcome) {
    const firstLine = trimmed.split("\n").find((l) => l.trim().length > 20);
    if (firstLine) outcome = truncClean(stripMd(firstLine), 300);
  }

  // 9. Build sections — gated by mode and response nature
  const rawSections = buildSectionsForMode(mode, intent, nature, trimmed, actionSummary, prose);

  // 9+. Enhance next-steps sections with structured step extraction
  const structuredSteps = extractStructuredNextSteps(trimmed);
  if (structuredSteps.length > 0) {
    const nextIdx = rawSections.findIndex(s => /(?:next|step|recommend|how to|getting started)/i.test(s.heading));
    if (nextIdx >= 0) {
      rawSections[nextIdx].actionSteps = structuredSteps;
      rawSections[nextIdx].items = structuredSteps.map(s => s.title);
    } else {
      rawSections.push({
        heading: "Recommended next steps",
        items: structuredSteps.map(s => s.title),
        actionSteps: structuredSteps,
      });
    }
  }

  // 9a. Try to extract model-authored ## Summary block (preferred — always used if present)
  const modelSummary = extractModelSummary(trimmed);
  const hasModelSummary = modelSummary !== null;

  // 9b. Determine summary text:
  //   - If model produced a ## Summary → use it verbatim (this is the whole point of dual-output)
  //   - Otherwise → fall back to heuristic extraction from the first prose paragraphs
  const summaryText = hasModelSummary
    ? modelSummary.summaryBlock
    : extractSummaryText(trimmed, outcome);

  // 9c. Cross-dedup section items against summary text to prevent repetition
  const summaryFragments = summaryText.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 15);
  const dedupedSections = rawSections.map(s => ({
    ...s,
    items: crossDedup(summaryFragments, s.items),
  })).filter(s => s.items.length > 0);

  // 9d. Quality-gate sections — suppress generic/low-value items.
  //     When a model summary exists, apply a stricter threshold so
  //     only genuinely useful sections survive alongside the summary.
  const sections = filterSectionsByQuality(dedupedSections, hasModelSummary, summaryText);

  // 10. Final confidence gate — if structured mode but low confidence, downgrade
  const finalMode = (mode === "structured" && confidence < 0.4 && sections.length <= 1)
    ? "conversational" as ResponseMode
    : mode;

  const finalSections = finalMode !== mode
    ? filterSectionsByQuality(
        buildSectionsForMode(finalMode, intent, nature, trimmed, actionSummary, prose)
          .map(s => ({ ...s, items: crossDedup(summaryFragments, s.items) }))
          .filter(s => s.items.length > 0),
        hasModelSummary,
        summaryText,
      )
    : sections;

  return {
    status,
    statusLabel: finalMode !== mode ? deriveStatusLabel(finalMode, intent, status) : statusLabel,
    intent,
    mode: finalMode,
    confidence,
    outcome,
    summaryText,
    sections: finalSections,
    proseText: (finalMode === "conversational" || finalMode === "plain" || finalMode === "instructional") && !proseText
      ? extractCleanProse(trimmed)
      : proseText,
    fullText,
    hasSummary: hasModelSummary || summaryText.length > 0 || finalSections.length > 0 || outcome.length > 0,
    hasModelSummary,
  };
}
