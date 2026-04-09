const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

// ── Diagnostic file logger ──
const logFile = path.join(app.getPath("userData"), "codebuddy-debug.log");
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
function writeLog(level, args) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a, null, 0)).join(" ")}\n`;
  try { fs.appendFileSync(logFile, line); } catch {}
}
console.log = (...args) => { originalConsoleLog(...args); writeLog("LOG", args); };
console.warn = (...args) => { originalConsoleWarn(...args); writeLog("WARN", args); };
console.error = (...args) => { originalConsoleError(...args); writeLog("ERR", args); };
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
const fileWatcherService = createFileWatcherService({ repoService: null, processService, p2pService, sendEvent: () => undefined });
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
    title: "CodeBuddy [build copilot-fix-v3]",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,   // security: renderer can't access Node
      nodeIntegration: false,   // security: no require() in renderer
      webviewTag: true,         // allow <webview> tags for preview iframe
    },
  });

  // Keep preview guests sandboxed and block any attempt to open external windows.
  mainWindow.webContents.on("will-attach-webview", (_event, webPreferences) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  mainWindow.webContents.on("did-attach-webview", (_event, webContents) => {
    webContents.setWindowOpenHandler(() => ({ action: "deny" }));
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
    });
  } catch (handlerError) {
    console.error("[Main] Critical: registerIpcHandlers threw:", handlerError);
  }
}

// ── App lifecycle ──────────────────────────────────────────────
app.whenReady().then(async () => {
  await bootstrapDesktopServices();
  await createWindow();
});

app.on("window-all-closed", () => {
  // Clean up file watcher
  fileWatcherService.stopWatching().catch(() => {});
  // Clean up P2P connections
  p2pService.leaveProject().catch(() => {});

  if (staticServer) {
    staticServer.close();
    staticServer = null;
    staticServerUrl = null;
  }

  // On macOS, apps typically stay open until Cmd+Q
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
