"use strict";

/**
 * Copilot model catalog discovery
 *
 * Scans the GitHub Copilot CLI's own debug logs (~/.copilot/logs/*.log) for
 * the line emitted on every session:
 *
 *     [DEBUG] Listed models: [id,Name], [id,Name], ...
 *
 * That listing is the authoritative, per-account, always-current set of
 * models the CLI will accept for `--model`. We turn it into a UI catalog,
 * inferring reasoning-effort support from the model id (gpt-5.x, o3, o4*,
 * claude-sonnet-*, claude-opus-* support reasoning; haiku/gemini/grok/
 * gpt-4.x/gpt-3.x do not).
 *
 * The result is cached to userData/copilot-catalog-cache.json with a 24h
 * TTL so the picker is instant on subsequent launches. Every successful
 * Copilot CLI run causes a fresh log file to appear, so the cache stays
 * accurate even as GitHub adds new models on the back end.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// Pattern: id contains lowercase letters, digits, dots, dashes; name can include anything but commas/brackets.
// Capture pairs like: [gpt-5.4-mini,GPT-5.4 mini]
const MODELS_LINE_RE = /Listed models:\s*((?:\[[^\]]+\]\s*,?\s*)+)/i;
const PAIR_RE = /\[([^,\]]+),\s*([^\]]+)\]/g;

// Models we never want to surface in the picker (embeddings, deprecated chat)
const EXCLUDE_RE = /(?:^|-)(?:embedding|3-small|ada|3\.5-turbo|inference)|^gpt-3\.5/i;

// Reasoning-capable model id patterns (regex).
// Sources: Copilot CLI default-effort metadata (capi:<id>:defaultReasoningEffort=...)
// + provider documentation. Update this list when GitHub adds new reasoning families.
const REASONING_PATTERNS = [
  /^gpt-5(?:[._-]|$)/i,       // gpt-5, gpt-5.x, gpt-5-mini, gpt-5.x-codex, etc.
  /^o[34](?:-mini|-nano)?$/i, // o3, o4, o4-mini, o3-nano
  /^claude-sonnet-/i,         // claude-sonnet-4, 4.5, 4.6, 4.7, ...
  /^claude-opus-/i,           // claude-opus-4, 4.5, 4.7, ...
];

// Models that explicitly do NOT support reasoning, even if they otherwise match
// (e.g. claude-haiku is sonnet-shaped but is not a reasoning model).
const NO_REASONING_RE = /^(?:claude-haiku-|gemini-|grok-|gpt-4|gpt-41|text-embedding-)/i;

const REASONING_LEVELS = ["low", "medium", "high"];

function modelSupportsReasoning(id) {
  if (NO_REASONING_RE.test(id)) return false;
  return REASONING_PATTERNS.some((re) => re.test(id));
}

function isCodexModel(id) {
  return /codex/i.test(id);
}

// ─── Log scan ─────────────────────────────────────────────────

function getLogDir() {
  return path.join(os.homedir(), ".copilot", "logs");
}

function findRecentLogFiles(maxFiles = 30) {
  const dir = getLogDir();
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const logs = entries
    .filter((n) => /\.log$/i.test(n))
    .map((n) => {
      const full = path.join(dir, n);
      let mtime = 0;
      try { mtime = fs.statSync(full).mtimeMs; } catch {}
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, maxFiles)
    .map((e) => e.full);
  return logs;
}

/** Read the most recent log line containing "Listed models:" and parse the id/name pairs. */
function discoverFromLogs() {
  const files = findRecentLogFiles();
  // Lines beginning with a timestamp like "2026-04-30T14:19:25.213Z" mark a new log entry.
  const TS_LINE_RE = /^\s*[>\s]*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    // Walk from the end; when we hit a "Listed models:" line, collect that line plus
    // any subsequent continuation lines (which don't start with a timestamp) into one block.
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!/Listed models:/i.test(lines[i])) continue;
      let block = lines[i];
      for (let j = i + 1; j < lines.length; j++) {
        if (TS_LINE_RE.test(lines[j])) break;
        block += " " + lines[j];
      }
      const m = block.match(MODELS_LINE_RE);
      if (!m) continue;
      const pairs = [];
      const re = new RegExp(PAIR_RE.source, "g");
      let pm;
      while ((pm = re.exec(block)) !== null) {
        const id = pm[1].trim();
        const name = pm[2].trim();
        if (id && name) pairs.push({ id, name });
      }
      if (pairs.length > 0) {
        let mtime = 0;
        try { mtime = fs.statSync(file).mtimeMs; } catch {}
        return { pairs, sourceFile: file, sourceMtime: mtime };
      }
    }
  }
  return null;
}

// ─── Catalog assembly ─────────────────────────────────────────

const FEATURED_RE = /^(?:gpt-5\.5|gpt-5\.4|claude-sonnet-4\.5|claude-opus-4\.5|claude-haiku-4\.5|gpt-5\.5-codex|claude-sonnet-4\.6|claude-opus-4\.7)$/i;

function classifyGroup(id) {
  return FEATURED_RE.test(id) ? "featured" : "other";
}

function inferUsage(id, name) {
  // Best-effort cost/usage hints. The CLI doesn't expose a structured value here.
  const lower = id.toLowerCase();
  if (/-mini|-nano|haiku|flash/.test(lower)) return "0.33x";
  if (/^claude-opus/.test(lower)) return "3x";
  if (/^grok-/.test(lower)) return "0.5x";
  return "1x";
}

function inferProvider(id) {
  if (/^claude-/i.test(id)) return "Anthropic";
  if (/^gemini-/i.test(id)) return "Google";
  if (/^grok-/i.test(id)) return "xAI";
  if (/^o[34]\b/i.test(id)) return "OpenAI";
  return "OpenAI";
}

function buildCopilotEntries(pairs) {
  const entries = [
    {
      id: "auto",
      label: "Auto",
      provider: "Best available",
      contextWindow: "Auto",
      maxTokens: 200000,
      usage: "10% discount",
      group: "featured",
    },
  ];

  for (const { id, name } of pairs) {
    if (EXCLUDE_RE.test(id)) continue;
    if (isCodexModel(id)) continue; // codex models are routed through `codex` provider, not copilot picker
    const baseLabel = name;
    const provider = inferProvider(id);
    const usage = inferUsage(id, name);
    const group = classifyGroup(id);

    if (modelSupportsReasoning(id)) {
      for (const eff of REASONING_LEVELS) {
        entries.push({
          id: `${id}|${eff}`,
          label: `${baseLabel} (Reasoning: ${eff[0].toUpperCase() + eff.slice(1)})`,
          baseId: id,
          baseLabel,
          reasoningEffort: eff,
          provider,
          contextWindow: "256K",
          maxTokens: 256000,
          usage,
          group,
        });
      }
    } else {
      entries.push({
        id,
        label: baseLabel,
        provider,
        contextWindow: "200K",
        maxTokens: 200000,
        usage,
        group,
      });
    }
  }
  return entries;
}

// ─── Persistent cache ─────────────────────────────────────────

let _cachePath = null;
function setCachePath(p) { _cachePath = p; }

function readCache() {
  if (!_cachePath) return null;
  try {
    const raw = fs.readFileSync(_cachePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(payload) {
  if (!_cachePath) return;
  try {
    fs.mkdirSync(path.dirname(_cachePath), { recursive: true });
    fs.writeFileSync(_cachePath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.warn("[copilot-catalog] failed to write cache:", err.message);
  }
}

const TTL_MS = 24 * 60 * 60 * 1000;

/** Returns { copilot, _discoveredAt, _source } or null when no log is available. */
function getDiscoveredCopilotCatalog({ force = false } = {}) {
  const now = Date.now();
  if (!force) {
    const cached = readCache();
    if (cached && cached.fetchedAt && (now - cached.fetchedAt) < TTL_MS && Array.isArray(cached.copilot)) {
      return cached;
    }
  }

  const result = discoverFromLogs();
  if (!result) return readCache(); // stale cache is better than nothing

  const copilot = buildCopilotEntries(result.pairs);
  const payload = {
    fetchedAt: now,
    sourceFile: result.sourceFile,
    sourceMtime: result.sourceMtime,
    copilot,
    _rawPairs: result.pairs,
  };
  writeCache(payload);
  return payload;
}

module.exports = {
  setCachePath,
  getDiscoveredCopilotCatalog,
  modelSupportsReasoning,
  // Exposed for tests/diagnostics
  _internal: { discoverFromLogs, buildCopilotEntries, REASONING_PATTERNS, NO_REASONING_RE },
};
