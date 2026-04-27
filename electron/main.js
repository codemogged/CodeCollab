const { app, BrowserWindow, session, Menu, MenuItem, clipboard, shell } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

// ── Native right-click context menu (cross-platform) ──
function attachContextMenu(webContents) {
  if (!webContents || webContents.__cbContextMenuAttached) return;
  webContents.__cbContextMenuAttached = true;

  webContents.on("context-menu", (_event, params) => {
    const menu = new Menu();
    const editFlags = params.editFlags || {};
    const hasSelection = !!(params.selectionText && params.selectionText.length > 0);

    if (params.isEditable && params.misspelledWord) {
      const suggestions = Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : [];
      if (suggestions.length > 0) {
        suggestions.slice(0, 5).forEach((suggestion) => {
          menu.append(new MenuItem({
            label: suggestion,
            click: () => webContents.replaceMisspelling(suggestion),
          }));
        });
        menu.append(new MenuItem({
          label: "Add to Dictionary",
          click: () => {
            try { webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord); } catch { /* ignore */ }
          },
        }));
        menu.append(new MenuItem({ type: "separator" }));
      } else {
        menu.append(new MenuItem({ label: "No spelling suggestions", enabled: false }));
        menu.append(new MenuItem({ type: "separator" }));
      }
    }

    if (params.linkURL) {
      menu.append(new MenuItem({
        label: "Open Link in Browser",
        click: () => { try { shell.openExternal(params.linkURL); } catch { /* ignore */ } },
      }));
      menu.append(new MenuItem({
        label: "Copy Link Address",
        click: () => { try { clipboard.writeText(params.linkURL); } catch { /* ignore */ } },
      }));
      menu.append(new MenuItem({ type: "separator" }));
    }

    menu.append(new MenuItem({ role: "undo", accelerator: "CmdOrCtrl+Z", enabled: !!editFlags.canUndo }));
    menu.append(new MenuItem({ role: "redo", accelerator: "CmdOrCtrl+Shift+Z", enabled: !!editFlags.canRedo }));
    menu.append(new MenuItem({ type: "separator" }));
    menu.append(new MenuItem({ role: "cut", accelerator: "CmdOrCtrl+X", enabled: !!editFlags.canCut }));
    menu.append(new MenuItem({ role: "copy", accelerator: "CmdOrCtrl+C", enabled: !!(editFlags.canCopy || hasSelection) }));
    menu.append(new MenuItem({ role: "paste", accelerator: "CmdOrCtrl+V", enabled: !!editFlags.canPaste }));
    menu.append(new MenuItem({ role: "pasteAndMatchStyle", accelerator: "CmdOrCtrl+Shift+V", enabled: !!editFlags.canPaste }));
    menu.append(new MenuItem({ type: "separator" }));
    menu.append(new MenuItem({ role: "selectAll", accelerator: "CmdOrCtrl+A", enabled: editFlags.canSelectAll !== false }));

    if (!app.isPackaged) {
      menu.append(new MenuItem({ type: "separator" }));
      menu.append(new MenuItem({
        label: "Inspect Element",
        click: () => { try { webContents.inspectElement(params.x, params.y); } catch { /* ignore */ } },
      }));
    }

    try {
      menu.popup({ window: BrowserWindow.fromWebContents(webContents) || undefined });
    } catch { /* ignore */ }
  });
}

// ── Application menu (cross-platform; ensures Edit shortcuts always work) ──
function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push({
    label: "File",
    submenu: [
      isMac ? { role: "close" } : { role: "quit" },
    ],
  });

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "delete" },
      { type: "separator" },
      { role: "selectAll" },
    ],
  });

  template.push({
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  });

  template.push({
    label: "Window",
    submenu: isMac
      ? [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "window" },
      ]
      : [
        { role: "minimize" },
        { role: "close" },
      ],
  });

  template.push({
    label: "Help",
    submenu: [
      {
        label: "Learn More",
        click: () => { try { shell.openExternal("https://github.com/wuddup-02120/CodeBuddy"); } catch { /* ignore */ } },
      },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Auto-disable GPU in VMs / environments without hardware acceleration ──
if (process.argv.includes("--disable-gpu")) {
  app.disableHardwareAcceleration();
} else {
  // Detect common VM indicators and auto-disable GPU to prevent crashes
  try {
    const { execSync } = require("child_process");
    const sysInfo = execSync("powershell -NoProfile -Command \"(Get-CimInstance Win32_ComputerSystem).Model\"", { encoding: "utf8", windowsHide: true, timeout: 8000 }).toLowerCase();
    if (sysInfo.includes("virtualbox") || sysInfo.includes("vmware") || sysInfo.includes("virtual machine") || sysInfo.includes("kvm") || sysInfo.includes("hyper-v")) {
      console.log("[startup] VM detected — disabling hardware GPU acceleration");
      app.disableHardwareAcceleration();
    }
  } catch { /* not critical — keep GPU enabled */ }
}

// ── Diagnostic file logger ──
const logFile = path.join(app.getPath("userData"), "codebuddy-debug.log");
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Redact obvious secrets before anything hits the on-disk log. This is a
// defence-in-depth measure — the authoritative guarantee is to not log
// secrets in the first place, but CLI tools we spawn (gh, git, npm) can
// print tokens or Authorization headers in their stderr.
const REDACTION_PATTERNS = [
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, "ghX_[REDACTED]"],       // GitHub tokens
  [/github_pat_[A-Za-z0-9_]{20,}/g, "github_pat_[REDACTED]"],
  [/\bsk-[A-Za-z0-9\-_]{16,}\b/g, "sk-[REDACTED]"],        // OpenAI-style
  [/AKIA[0-9A-Z]{16}/g, "AKIA[REDACTED]"],                  // AWS access key
  [/\b[Bb]earer\s+[A-Za-z0-9._\-]+/g, "Bearer [REDACTED]"],
  [/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, "[REDACTED_JWT]"],
  [/x-oauth-basic[^\s]{0,200}/g, "[REDACTED_OAUTH]"],
  // CodeBuddy P2P shared secrets and invite codes (base64url, ≥20 chars).
  // Match when a token is preceded by a key like "secret"/"p2pSecret"/"invite"/"code"/"s":
  // so we don't accidentally redact arbitrary IDs.
  [/("?(?:p2pSecret|secret|inviteCode|code|invite|s)"?\s*[:=]\s*"?)([A-Za-z0-9_\-]{20,})("?)/gi, '$1[REDACTED_P2P]$3'],
];
function redactSecrets(str) {
  let out = str;
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function writeLog(level, args) {
  const ts = new Date().toISOString();
  const raw = `[${ts}] [${level}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a, null, 0)).join(" ")}\n`;
  try { fs.appendFileSync(logFile, redactSecrets(raw)); } catch {}
}
// Log filtering: keep the on-disk log comprehensive, but control what prints
// to the interactive debug console. Use `CODEBUDDY_LOG_ALLOW` (comma list)
// to whitelist tags (e.g. "startup,file-watcher,p2p"). Untagged messages
// are only shown when `CODEBUDDY_LOG_LEVEL=debug`.
const LOG_ALLOWLIST = (process.env.CODEBUDDY_LOG_ALLOW || "startup,sync,p2p,file-watcher,shared-context,deploy,launcher,shutdown,repo,openterminal")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);
function extractTag(args) {
  const first = args[0];
  if (typeof first === "string") {
    const m = first.match(/^\[([^\]]+)\]/);
    if (m) return m[1].toLowerCase();
  }
  return null;
}
function shouldShowOnConsole(level, args) {
  if (level === "ERR" || level === "WARN") return true;
  const tag = extractTag(args);
  if (tag) {
    // Exact match OR prefix match (so "p2p" allows "p2p:abcd1234", "p2p-sync", "p2p-apply";
    // "pm-chat" stays specific; "checkpoint-restore" stays specific).
    if (LOG_ALLOWLIST.includes(tag)) return true;
    for (const allowed of LOG_ALLOWLIST) {
      if (tag === allowed) return true;
      if (tag.startsWith(allowed + ":") || tag.startsWith(allowed + "-")) return true;
    }
    return false;
  }
  return (process.env.CODEBUDDY_LOG_LEVEL || "").toLowerCase() === "debug";
}

console.log = (...args) => { writeLog("LOG", args); if (shouldShowOnConsole("LOG", args)) originalConsoleLog(...args); };
console.warn = (...args) => { writeLog("WARN", args); originalConsoleWarn(...args); };
console.error = (...args) => { writeLog("ERR", args); originalConsoleError(...args); };
console.log(`[startup] Log file: ${logFile}`);
console.log(`[startup] App version: ${app.getVersion()}, platform: ${process.platform}, arch: ${process.arch}`);
console.log(`[startup] Time: ${new Date().toISOString()}`);

const { registerIpcHandlers } = require("./ipc/register-handlers");
const { createProcessService } = require("./services/process-service");
const { createRepoService } = require("./services/repo-service");
const { createSettingsService } = require("./services/settings-service");
const { createToolingService } = require("./services/tooling-service");
const { createActivityService } = require("./services/activity-service");
const { createProjectService } = require("./services/project-service");
const { createSharedStateService } = require("./services/shared-state-service");
const { createP2PService } = require("./services/p2p-service");
const { createFileWatcherService } = require("./services/file-watcher-service");
const { createGitQueueService } = require("./services/git-queue-service");

// Keep a global reference so the window isn't garbage-collected
let mainWindow = null;
let staticServer = null;
let staticServerUrl = null;

const isDev = !app.isPackaged;

// Prevent Chromium from caching old JS bundles after updates
if (!isDev) {
  app.commandLine.appendSwitch("disable-http-cache");
}
const processService = createProcessService({ sendEvent: () => undefined });
const settingsService = createSettingsService({ app });
const toolingService = createToolingService({ processService, settingsService });
const activityService = createActivityService();
const sharedStateService = createSharedStateService();
const p2pService = createP2PService({ sharedStateService, sendEvent: () => undefined });
const gitQueueService = createGitQueueService();
const fileWatcherService = createFileWatcherService({ repoService: null, processService, p2pService, gitQueueService, sendEvent: () => undefined });
const projectService = createProjectService({ app, settingsService, toolingService, p2pService, sharedStateService });
let repoService = null;

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  return contentTypes[extension] || "application/octet-stream";
}

function resolveExportedFile(rootDir, requestPath) {
  const sanitizedPath = decodeURIComponent(requestPath.split("?")[0]).replace(/^\/+/, "");
  const candidates = sanitizedPath
    ? [
      path.join(rootDir, sanitizedPath),
      path.join(rootDir, `${sanitizedPath}.html`),
      path.join(rootDir, sanitizedPath, "index.html"),
    ]
    : [path.join(rootDir, "index.html")];

  const resolvedFile = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return resolvedFile || path.join(rootDir, "404.html");
}

async function ensureStaticServer() {
  if (isDev) {
    return "http://localhost:3000";
  }

  if (staticServerUrl) {
    return staticServerUrl;
  }

  const exportRoot = path.join(__dirname, "../out");

  staticServer = http.createServer((request, response) => {
    const filePath = resolveExportedFile(exportRoot, request.url || "/");

    fs.readFile(filePath, (error, fileBuffer) => {
      if (error) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Failed to load app files.");
        return;
      }

      response.writeHead(filePath.endsWith("404.html") ? 404 : 200, {
        "Content-Type": getContentType(filePath),
        "Cache-Control": filePath.includes(`${path.sep}_next${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
      });
      response.end(fileBuffer);
    });
  });

  await new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(0, "127.0.0.1", () => {
      const address = staticServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind packaged app server."));
        return;
      }

      staticServerUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  return staticServerUrl;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "CodeBuddy [build v106-windows]",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,   // security: renderer can't access Node
      nodeIntegration: false,   // security: no require() in renderer
      sandbox: true,            // security: preload runs sandboxed; only ipcRenderer + process.platform are used
      webviewTag: true,         // allow <webview> tags for preview iframe
      spellcheck: true,         // enable native spellchecker (used by context menu)
    },
  });

  // --- Navigation & new-window hardening ---
  // Block the top-level window from ever navigating to a remote origin.
  // The only legitimate origins are the Next dev server and our localhost
  // packaged static server.
  const isAllowedAppOrigin = (urlStr) => {
    try {
      const u = new URL(urlStr);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      return u.hostname === "localhost" || u.hostname === "127.0.0.1";
    } catch { return false; }
  };
  mainWindow.webContents.on("will-navigate", (event, urlStr) => {
    if (!isAllowedAppOrigin(urlStr)) {
      event.preventDefault();
      try { require("electron").shell.openExternal(urlStr); } catch { /* ignore */ }
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Never open additional BrowserWindows. External links go to the OS browser.
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        require("electron").shell.openExternal(url);
      }
    } catch { /* ignore */ }
    return { action: "deny" };
  });

  // Block any renderer attempt to request dangerous permissions.
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, cb) => {
    const allowed = new Set(["clipboard-read", "clipboard-sanitized-write"]);
    cb(allowed.has(permission));
  });
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = new Set(["clipboard-read", "clipboard-sanitized-write"]);
    return allowed.has(permission);
  });

  // Configure spellchecker languages from the OS locale, with en-US fallback.
  try {
    const sess = mainWindow.webContents.session;
    const available = sess.availableSpellCheckerLanguages || [];
    const localeRaw = (app.getLocale() || "en-US").replace(/_/g, "-");
    const desired = [];
    if (available.includes(localeRaw)) desired.push(localeRaw);
    if (!desired.includes("en-US") && available.includes("en-US")) desired.push("en-US");
    if (desired.length > 0) sess.setSpellCheckerLanguages(desired);
    sess.setSpellCheckerEnabled(true);
  } catch (err) {
    console.warn("[spellcheck] failed to configure:", err?.message ?? err);
  }

  // Keep preview guests sandboxed and block any attempt to open external windows.
  mainWindow.webContents.on("will-attach-webview", (_event, webPreferences) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  mainWindow.webContents.on("did-attach-webview", (_event, webContents) => {
    webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    attachContextMenu(webContents);
  });

  // Strip X-Frame-Options and CSP frame-ancestors from localhost responses
  // so the preview iframe can display the user's local dev server.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || "";
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url);
    if (isLocalhost && details.responseHeaders) {
      const headers = { ...details.responseHeaders };
      // Remove frame-blocking headers (case-insensitive keys)
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase();
        if (lower === "x-frame-options") {
          delete headers[key];
        } else if (lower === "content-security-policy") {
          // Remove frame-ancestors directive from CSP
          headers[key] = headers[key].map((v) =>
            v.replace(/frame-ancestors[^;]*(;|$)/gi, "").trim()
          ).filter(Boolean);
          if (headers[key].length === 0) delete headers[key];
        }
      }
      callback({ responseHeaders: headers });
    } else {
      callback({});
    }
  });

  // In dev, load the Next.js dev server; in prod, serve the exported app over localhost.
  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    // Clear Chromium's HTTP/code cache so updated JS bundles always load
    try {
      await mainWindow.webContents.session.clearCache();
      await mainWindow.webContents.session.clearCodeCaches({});
    } catch (_) { /* ignore if not supported */ }
    const appUrl = await ensureStaticServer();
    await mainWindow.loadURL(appUrl);
  }

  // Attach native right-click context menu to the main webContents.
  attachContextMenu(mainWindow.webContents);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootstrapDesktopServices() {
  try {
    repoService = await createRepoService({ settingsService });
  } catch (error) {
    console.error("Failed to create repo service:", error);
    repoService = null;
  }

  try {
    registerIpcHandlers({
      app,
      mainWindow: () => mainWindow,
      processService,
      repoService,
      settingsService,
      toolingService,
      activityService,
      projectService,
      sharedStateService,
      p2pService,
      fileWatcherService,
      gitQueueService,
    });
  } catch (handlerError) {
    console.error("[Main] Critical: registerIpcHandlers threw:", handlerError);
  }
}

// ── App lifecycle ──────────────────────────────────────────────
app.whenReady().then(async () => {
  await bootstrapDesktopServices();
  buildApplicationMenu();
  await createWindow();
});

// Track whether cleanup has already run to prevent double-cleanup
let cleanedUp = false;

async function cleanupBeforeQuit() {
  if (cleanedUp) return;
  cleanedUp = true;
  console.log("[shutdown] Cleaning up file watcher and P2P...");
  try { await fileWatcherService.stopWatching(); } catch {}
  try { await p2pService.leaveProject(); } catch {}
  if (staticServer) {
    staticServer.close();
    staticServer = null;
    staticServerUrl = null;
  }
  console.log("[shutdown] Cleanup complete.");
}

// Block quit until cleanup finishes (prevents background git pulls after close)
app.on("before-quit", (e) => {
  if (!cleanedUp) {
    e.preventDefault();
    cleanupBeforeQuit().finally(() => app.quit());
  }
});

app.on("window-all-closed", () => {
  // On macOS, apps typically stay open until Cmd+Q
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
