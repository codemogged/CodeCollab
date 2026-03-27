const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { registerIpcHandlers } = require("./ipc/register-handlers");
const { createProcessService } = require("./services/process-service");
const { createRepoService } = require("./services/repo-service");
const { createSettingsService } = require("./services/settings-service");
const { createToolingService } = require("./services/tooling-service");
const { createActivityService } = require("./services/activity-service");
const { createProjectService } = require("./services/project-service");

// Keep a global reference so the window isn't garbage-collected
let mainWindow = null;
let staticServer = null;
let staticServerUrl = null;

const isDev = !app.isPackaged;
const processService = createProcessService({ sendEvent: () => undefined });
const settingsService = createSettingsService({ app });
const toolingService = createToolingService({ processService, settingsService });
const activityService = createActivityService();
const projectService = createProjectService({ app, settingsService });
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
    title: "CodeBuddy",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,   // security: renderer can't access Node
      nodeIntegration: false,   // security: no require() in renderer
    },
  });

  // In dev, load the Next.js dev server; in prod, serve the exported app over localhost.
  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
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
