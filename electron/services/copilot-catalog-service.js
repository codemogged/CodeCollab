"use strict";

/**
 * Copilot model catalog discovery
 *
 * Strategy (in order of preference):
 *
 *  1. Live API: read the Copilot CLI's OAuth token from the OS keychain
 *     (Windows Credential Manager / macOS Keychain / Linux libsecret) and
 *     call `GET https://api.individual.githubcopilot.com/models` directly.
 *     This is the same endpoint the CLI itself uses and returns the
 *     authoritative list including `capabilities.supports.reasoning_effort`
 *     (the exact set of reasoning levels supported per model — e.g.
 *     claude-opus-4.7 returns `["medium"]` only, gpt-5.4 returns
 *     `["low","medium","high","xhigh"]`).
 *
 *  2. Multipliers: parsed from `[DEBUG] Got model info: {...}` JSON blocks
 *     across recent CLI logs (`~/.copilot/logs/*.log`). The /models endpoint
 *     does not include `billing.multiplier` for the developer-cli integration,
 *     but every model the user has actually run gets logged with full billing
 *     info, so the union of recent logs covers most models. Unknown
 *     multipliers are left blank rather than guessed.
 *
 *  3. Fallback: if the keychain or API is unreachable, parse the
 *     `[DEBUG] Listed models: [id,Name], ...` line from the most recent log
 *     and apply per-family heuristics for reasoning levels (less precise but
 *     still better than the static JSON).
 *
 * The result is cached to userData/copilot-catalog-cache.json (TTL 6h).
 * `getDiscoveredCopilotCatalog()` is synchronous and returns the cache;
 * `refreshCatalog()` is async and updates the cache. Call `refreshCatalog`
 * from app startup so the next read is fresh.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { spawnSync } = require("child_process");

const HOST = "api.individual.githubcopilot.com";
const INTEGRATION_ID = "copilot-developer-cli";
const USER_AGENT = "copilot/1.0.39";
const TTL_MS = 6 * 60 * 60 * 1000;

// Embeddings + deprecated chat models we never want in the picker.
const EXCLUDE_RE = /(?:^|-)(?:embedding|3-small|ada|inference)|^gpt-3\.5/i;

// Featured model ids (shown at top of picker).
const FEATURED_RE = /^(?:gpt-5\.5|gpt-5\.4|claude-sonnet-4\.5|claude-opus-4\.5|claude-haiku-4\.5|claude-sonnet-4\.6|claude-opus-4\.7|gpt-5\.5-codex)$/i;

function classifyGroup(id) { return FEATURED_RE.test(id) ? "featured" : "other"; }
function isCodex(id) { return /codex/i.test(id); }

// ─── Token retrieval ─────────────────────────────────────────

function readCopilotConfigLogin() {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), ".copilot", "config.json"), "utf-8");
    // Strip leading // line comments before JSON.parse.
    const json = raw.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
    const obj = JSON.parse(json);
    return (obj && obj.lastLoggedInUser && obj.lastLoggedInUser.login)
      || (obj && Array.isArray(obj.loggedInUsers) && obj.loggedInUsers[0] && obj.loggedInUsers[0].login)
      || null;
  } catch {
    return null;
  }
}

function tryReadKeychainToken() {
  const login = readCopilotConfigLogin();
  if (!login) return null;
  const target = `copilot-cli/https://github.com:${login}`;
  try {
    if (process.platform === "win32") return readWindowsCred(target);
    if (process.platform === "darwin") return readMacKeychain(target, login);
    return readLinuxSecret(target, login);
  } catch {
    return null;
  }
}

function readWindowsCred(target) {
  // PowerShell + C# P/Invoke to CredRead. Returns UTF-8 of CredentialBlob.
  const targetEsc = target.replace(/`/g, "``").replace(/"/g, '`"');
  const ps = `
$ErrorActionPreference='Stop'
$sig=@"
using System;using System.Runtime.InteropServices;
public class CC{
[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
public struct C{public uint F;public uint T;public IntPtr N;public IntPtr Co;public System.Runtime.InteropServices.ComTypes.FILETIME L;public uint Bs;public IntPtr B;public uint P;public uint Ac;public IntPtr A;public IntPtr Ta;public IntPtr U;}
[DllImport("Advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]public static extern bool CredRead(string t,uint y,uint f,out IntPtr c);
[DllImport("Advapi32.dll")]public static extern void CredFree(IntPtr c);
}
"@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
$p=[IntPtr]::Zero
if(-not [CC]::CredRead("${targetEsc}",1,0,[ref]$p)){exit 1}
$c=[System.Runtime.InteropServices.Marshal]::PtrToStructure($p,[type][CC+C])
$bytes=New-Object byte[] $c.Bs
[System.Runtime.InteropServices.Marshal]::Copy($c.B,$bytes,0,$c.Bs)
[System.Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($bytes))
[CC]::CredFree($p)
`.trim();
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { encoding: "utf-8", windowsHide: true, timeout: 10000 }
  );
  if (r.status !== 0) return null;
  const tok = (r.stdout || "").trim();
  return /^gh[op]_/.test(tok) ? tok : null;
}

function readMacKeychain(service, account) {
  const r = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", "-s", service, "-a", account, "-w"],
    { encoding: "utf-8", timeout: 10000 }
  );
  if (r.status !== 0) return null;
  const tok = (r.stdout || "").trim();
  return /^gh[op]_/.test(tok) ? tok : null;
}

function readLinuxSecret(service, account) {
  const r = spawnSync(
    "secret-tool",
    ["lookup", "service", service, "account", account],
    { encoding: "utf-8", timeout: 10000 }
  );
  if (r.status !== 0) return null;
  const tok = (r.stdout || "").trim();
  return /^gh[op]_/.test(tok) ? tok : null;
}

// ─── Live API ────────────────────────────────────────────────

function fetchModelsLive(token) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        method: "GET",
        hostname: HOST,
        path: "/models",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": USER_AGENT,
          "Copilot-Integration-Id": INTEGRATION_ID,
          Accept: "application/json",
        },
        timeout: 8000,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve(null);
          try {
            const json = JSON.parse(body);
            const data = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : null;
            resolve(data);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { try { req.destroy(); } catch {} resolve(null); });
    req.end();
  });
}

// ─── Multiplier scrape ───────────────────────────────────────

function getLogDir() { return path.join(os.homedir(), ".copilot", "logs"); }

function findRecentLogFiles(maxFiles = 60) {
  let entries;
  try { entries = fs.readdirSync(getLogDir()); } catch { return []; }
  return entries
    .filter((n) => /\.log$/i.test(n))
    .map((n) => {
      const full = path.join(getLogDir(), n);
      let mtime = 0;
      try { mtime = fs.statSync(full).mtimeMs; } catch {}
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, maxFiles)
    .map((e) => e.full);
}

/** Walk recent logs, parse `[DEBUG] Got model info: { ... }` blocks, return { id -> multiplier }. */
function scrapeMultipliersFromLogs() {
  const out = {};
  for (const file of findRecentLogFiles()) {
    let raw;
    try { raw = fs.readFileSync(file, "utf-8"); } catch { continue; }
    let pos = 0;
    while (true) {
      const tag = raw.indexOf("Got model info:", pos);
      if (tag < 0) break;
      const braceStart = raw.indexOf("{", tag);
      if (braceStart < 0) break;
      // Walk to matching `}`, respecting JSON string escapes.
      let depth = 0, i = braceStart, inStr = false, esc = false;
      for (; i < raw.length; i++) {
        const ch = raw[i];
        if (inStr) {
          if (esc) { esc = false; continue; }
          if (ch === "\\") { esc = true; continue; }
          if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
      }
      const jsonStr = raw.slice(braceStart, i);
      try {
        const obj = JSON.parse(jsonStr);
        if (obj && obj.id && obj.billing && typeof obj.billing.multiplier === "number") {
          if (!(obj.id in out)) out[obj.id] = obj.billing.multiplier;
        }
      } catch {
        /* malformed block; skip */
      }
      pos = i;
    }
  }
  return out;
}

// ─── Catalog assembly ────────────────────────────────────────

function formatMultiplier(n) {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return "";
  return `${+n.toFixed(2)}x`;
}

function formatContextWindow(n) {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return "";
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function reasoningLabel(eff) {
  return eff[0].toUpperCase() + eff.slice(1);
}

function buildEntriesFromApi(models, multipliers) {
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

  for (const m of models) {
    if (!m || !m.id) continue;
    const id = m.id;
    if (EXCLUDE_RE.test(id)) continue;
    if (m.capabilities && m.capabilities.type && m.capabilities.type !== "chat") continue;
    if (m.policy && m.policy.state && m.policy.state !== "enabled") continue;
    if (m.model_picker_enabled === false) continue;
    if (isCodex(id)) continue; // codex models are routed via the `codex` provider instead

    const baseLabel = m.name || id;
    const provider = m.vendor || "OpenAI";
    const limits = (m.capabilities && m.capabilities.limits) || {};
    const ctxN = limits.max_context_window_tokens;
    const ctx = formatContextWindow(ctxN);
    const maxTokens = typeof limits.max_output_tokens === "number"
      ? limits.max_output_tokens
      : (typeof ctxN === "number" ? ctxN : 200000);
    const usage = formatMultiplier(multipliers[id]);
    const group = classifyGroup(id);

    const supportedRaw = m.capabilities && m.capabilities.supports && m.capabilities.supports.reasoning_effort;
    const supports = Array.isArray(supportedRaw) ? supportedRaw.filter((e) => e !== "none") : [];

    if (supports.length > 1) {
      for (const eff of supports) {
        entries.push({
          id: `${id}|${eff}`,
          label: `${baseLabel} (Reasoning: ${reasoningLabel(eff)})`,
          baseId: id,
          baseLabel,
          reasoningEffort: eff,
          provider,
          contextWindow: ctx,
          maxTokens,
          usage,
          group,
        });
      }
    } else if (supports.length === 1) {
      const eff = supports[0];
      entries.push({
        id: `${id}|${eff}`,
        label: `${baseLabel} (Reasoning: ${reasoningLabel(eff)})`,
        baseId: id,
        baseLabel,
        reasoningEffort: eff,
        provider,
        contextWindow: ctx,
        maxTokens,
        usage,
        group,
      });
    } else {
      entries.push({
        id,
        label: baseLabel,
        provider,
        contextWindow: ctx,
        maxTokens,
        usage,
        group,
      });
    }
  }
  return entries;
}

// ─── Fallback: "Listed models" log line ─────────────────────

const PAIR_RE = /\[([^,\]]+),\s*([^\]]+)\]/g;
const TS_LINE_RE = /^\s*[>\s]*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function discoverPairsFromLogs() {
  for (const file of findRecentLogFiles(30)) {
    let content;
    try { content = fs.readFileSync(file, "utf-8"); } catch { continue; }
    const lines = content.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!/Listed models:/i.test(lines[i])) continue;
      let block = lines[i];
      for (let j = i + 1; j < lines.length; j++) {
        if (TS_LINE_RE.test(lines[j])) break;
        block += " " + lines[j];
      }
      const pairs = [];
      const re = new RegExp(PAIR_RE.source, "g");
      let pm;
      while ((pm = re.exec(block)) !== null) {
        const id = pm[1].trim();
        const name = pm[2].trim();
        if (id && name) pairs.push({ id, name });
      }
      if (pairs.length > 0) return { pairs, sourceFile: file };
    }
  }
  return null;
}

// Build synthetic API-shaped objects from id/name pairs so we can reuse `buildEntriesFromApi`.
function pairsToSyntheticModels(pairs) {
  return pairs.map(({ id, name }) => {
    let supports = [];
    if (/^(?:claude-haiku-|gemini-|grok-|gpt-4|gpt-41|gpt-3)/.test(id)) supports = [];
    else if (/^claude-opus-/.test(id)) supports = ["medium"];           // narrow default until API confirms
    else if (/^claude-sonnet-/.test(id)) supports = ["low", "medium", "high"];
    else if (/^gpt-5(?:[._-]|$)/.test(id)) supports = ["low", "medium", "high", "xhigh"];
    else if (/^o[34]\b/.test(id)) supports = ["low", "medium", "high"];
    let provider = "OpenAI";
    if (/^claude-/.test(id)) provider = "Anthropic";
    else if (/^gemini-/.test(id)) provider = "Google";
    else if (/^grok-/.test(id)) provider = "xAI";
    return {
      id,
      name,
      vendor: provider,
      capabilities: {
        type: "chat",
        supports: { reasoning_effort: supports },
        limits: { max_context_window_tokens: 200000 },
      },
      policy: { state: "enabled" },
      model_picker_enabled: true,
    };
  });
}

// ─── Cache + entry points ───────────────────────────────────

let _cachePath = null;
function setCachePath(p) { _cachePath = p; }

function readCache() {
  if (!_cachePath) return null;
  try { return JSON.parse(fs.readFileSync(_cachePath, "utf-8")); } catch { return null; }
}

function writeCache(payload) {
  if (!_cachePath) return;
  try {
    fs.mkdirSync(path.dirname(_cachePath), { recursive: true });
    fs.writeFileSync(_cachePath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.warn("[copilot-catalog] cache write failed:", err.message);
  }
}

/** Async — fetches live API + scrapes multipliers, writes cache, returns payload. */
async function refreshCatalog() {
  const multipliers = scrapeMultipliersFromLogs();
  let copilot = null;
  let source = "none";

  const token = tryReadKeychainToken();
  if (token) {
    const live = await fetchModelsLive(token);
    if (live && live.length) {
      copilot = buildEntriesFromApi(live, multipliers);
      source = "api";
    }
  }

  if (!copilot) {
    const fallback = discoverPairsFromLogs();
    if (fallback && fallback.pairs.length) {
      copilot = buildEntriesFromApi(pairsToSyntheticModels(fallback.pairs), multipliers);
      source = "logs";
    }
  }

  if (!copilot) return null;

  const payload = {
    fetchedAt: Date.now(),
    source,
    copilot,
    _multipliers: multipliers,
  };
  writeCache(payload);
  return payload;
}

/**
 * Sync — returns the most recent cached catalog (if any). Triggers a background
 * refresh when the cache is missing or older than TTL_MS.
 */
function getDiscoveredCopilotCatalog({ force = false } = {}) {
  const cached = readCache();
  const now = Date.now();
  const stale = !cached || !cached.fetchedAt || (now - cached.fetchedAt) >= TTL_MS;
  if (force || stale) {
    // Fire-and-forget refresh; next read picks it up.
    refreshCatalog().catch(() => {});
  }
  return cached;
}

module.exports = {
  setCachePath,
  getDiscoveredCopilotCatalog,
  refreshCatalog,
  // Diagnostics
  _internal: {
    tryReadKeychainToken,
    fetchModelsLive,
    scrapeMultipliersFromLogs,
    discoverPairsFromLogs,
    buildEntriesFromApi,
    pairsToSyntheticModels,
  },
};
