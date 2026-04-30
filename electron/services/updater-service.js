// ── electron-updater integration ──
//
// Auto-updates work on Windows out of the box because the NSIS installer can
// silently replace itself. macOS auto-updates require the .app to be
// codesigned + notarized, which we don't do yet — so on Mac the updater is a
// no-op (users keep their current version until they manually re-download).
//
// The updater reads release metadata from GitHub:
//   https://github.com/codemogged/CodeCollab/releases
// It looks for `latest.yml` (Win) / `latest-mac.yml` (Mac) which electron-builder
// generates automatically next to each .exe / .dmg.
//
// Wire-in: main.js calls initAutoUpdater({ getMainWindow }) after the window
// is created. Renderer subscribes via window.electronAPI.updater.on*().

const { app, ipcMain } = require("electron");

let initialised = false;
let lastStatus = { state: "idle", info: null };

function broadcast(getMainWindow, channel, payload) {
  try {
    const win = typeof getMainWindow === "function" ? getMainWindow() : null;
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  } catch (_) { /* ignore */ }
}

function setStatus(getMainWindow, state, info) {
  lastStatus = { state, info: info ?? null };
  broadcast(getMainWindow, "updater:status", lastStatus);
}

function initAutoUpdater({ getMainWindow }) {
  if (initialised) return;
  initialised = true;

  // Skip auto-updates in dev (the updater throws if it can't find a packaged app)
  if (!app.isPackaged) {
    console.log("[updater] Skipping in dev mode");
    return;
  }

  // macOS auto-update requires codesigning. We're unsigned, so disable it on Mac.
  if (process.platform === "darwin") {
    console.log("[updater] Skipping on macOS (unsigned build — manual updates only)");
    ipcMain.handle("updater:check", () => ({ ok: false, reason: "unsupported-platform" }));
    ipcMain.handle("updater:installNow", () => ({ ok: false, reason: "unsupported-platform" }));
    ipcMain.handle("updater:getStatus", () => ({ state: "unsupported", info: null }));
    return;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    console.error("[updater] Failed to load electron-updater:", err?.message ?? err);
    return;
  }

  // ── Configuration ──
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = {
    info:  (...a) => console.log("[updater]", ...a),
    warn:  (...a) => console.warn("[updater]", ...a),
    error: (...a) => console.error("[updater]", ...a),
    debug: () => { /* silent */ },
  };

  // ── Event wiring ──
  autoUpdater.on("checking-for-update", () => setStatus(getMainWindow, "checking"));
  autoUpdater.on("update-available", (info) => setStatus(getMainWindow, "available", {
    version: info?.version ?? null,
    releaseDate: info?.releaseDate ?? null,
  }));
  autoUpdater.on("update-not-available", () => setStatus(getMainWindow, "up-to-date"));
  autoUpdater.on("download-progress", (p) => setStatus(getMainWindow, "downloading", {
    percent: typeof p?.percent === "number" ? Math.round(p.percent) : 0,
    transferred: p?.transferred ?? 0,
    total: p?.total ?? 0,
  }));
  autoUpdater.on("update-downloaded", (info) => setStatus(getMainWindow, "downloaded", {
    version: info?.version ?? null,
    releaseDate: info?.releaseDate ?? null,
    releaseNotes: typeof info?.releaseNotes === "string" ? info.releaseNotes.slice(0, 5000) : null,
  }));
  autoUpdater.on("error", (err) => setStatus(getMainWindow, "error", {
    message: (err && err.message) ? err.message : String(err),
  }));

  // ── IPC handlers ──
  ipcMain.handle("updater:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version ?? null };
    } catch (err) {
      return { ok: false, reason: err?.message ?? String(err) };
    }
  });

  ipcMain.handle("updater:installNow", () => {
    try {
      // isSilent=true, isForceRunAfter=true → close app, install, relaunch new version
      autoUpdater.quitAndInstall(true, true);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err?.message ?? String(err) };
    }
  });

  ipcMain.handle("updater:getStatus", () => lastStatus);

  // ── Initial check (5s after window ready, then every 4 hours) ──
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[updater] Initial check failed:", err?.message ?? err);
    });
  }, 5000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => { /* silent — handled by error event */ });
  }, 4 * 60 * 60 * 1000);

  console.log("[updater] Initialised — checking GitHub Releases for codemogged/CodeCollab");
}

module.exports = { initAutoUpdater };
