const { dialog, shell, ipcMain, clipboard } = require("electron");
const copilotCatalogService = require("../services/copilot-catalog-service");

// Background refresh of the discovered Copilot model catalog. Fires after any
// auth/install event that could newly enable the live /models API + log
// scraping pipeline (gh login writes the OAuth token; copilot install adds
// the CLI). Non-blocking so the UI flow finishes immediately even if the
// keychain isn't readable yet.
function kickCopilotCatalogRefresh(reason) {
  setImmediate(() => {
    copilotCatalogService.refreshCatalog()
      .then((cat) => {
        const n = Array.isArray(cat?.entries) ? cat.entries.length : 0;
        console.log(`[copilot-catalog] refresh after ${reason}: ${n} entries`);
      })
      .catch((err) => {
        console.warn(`[copilot-catalog] refresh after ${reason} failed:`, err && err.message);
      });
  });
}

// Promisified child_process.execFile. Using execFile (not exec) avoids a shell
// and is safe to call in async handlers — unlike execSync, it does NOT block
// the Electron main process event loop, so concurrent IPC messages
// (settings.get, UI input round-trips, etc.) keep flowing while git runs.
function runGit(args, opts = {}) {
  const { execFile } = require("child_process");
  return new Promise((resolve, reject) => {
    execFile("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

function safeHandle(channel, handler) {
  try {
    ipcMain.removeHandler(channel);
  } catch { /* ignore */ }
  try {
    ipcMain.handle(channel, handler);
  } catch (err) {
    console.error(`[IPC] Failed to register handler for '${channel}':`, err?.message ?? err);
  }
}

function registerIpcHandlers({ app, mainWindow, processService, repoService, settingsService, toolingService, activityService, projectService, sharedStateService, p2pService, fileWatcherService, gitQueueService }) {
  // Fallback queue for callers that don't provide one. A queue that just
  // runs the op lets existing code work without crashing, but loses the
  // serialization guarantee. The real queue is injected from main.js.
  const gitQueue = gitQueueService || {
    enqueue: (_repo, _label, fn) => Promise.resolve().then(fn),
    getDepth: () => 0,
  };
  const BUILD_TAG = "v110-codecollab";
  // Guard: prevent savePlan from overwriting plan.json while syncWorkspace is importing
  let syncInProgress = false;
  console.log(`[IPC] Registering all handlers... (build: ${BUILD_TAG})`);

  // ---------- Repo-resident P2P secret ----------
  // Source of truth for a project's P2P shared secret is the codebuddy-build
  // branch of the repo, at .codebuddy/p2p-secret. Every collaborator with git
  // access reads the same value, so they automatically derive the same
  // Hyperswarm topic. Settings cache the value for fast lookup.
  //
  // Trust scope: P2P access == git read access to the codebuddy-build branch.
  // For private repos this is exactly the desired boundary. For public repos
  // the secret is world-readable, which is acceptable because the file
  // contents being synced (plan.json, conversations, agent context) are
  // already in the public branch — anyone who can read them can read the
  // wire payloads too.
  //
  // The HMAC envelope on every wire message still gates *write* access:
  // a bystander who reads the secret can connect and observe, but cannot
  // forge messages without the secret, and we already trust everyone with
  // the secret to participate.
  const SECRET_FILE_REL = "p2p-secret";
  async function readRepoSecret(repoPath) {
    if (!repoPath) return null;
    try {
      const result = await sharedStateService.readSharedFile(repoPath, SECRET_FILE_REL);
      if (!result?.exists || typeof result.content !== "string") return null;
      const trimmed = result.content.trim();
      // Defensive: only accept a base64url-shaped token of reasonable length.
      if (!/^[A-Za-z0-9_\-]{20,512}$/.test(trimmed)) return null;
      return trimmed;
    } catch { return null; }
  }
  async function writeRepoSecret(repoPath, secret) {
    if (!repoPath || !secret) return false;
    await sharedStateService.ensureSharedDir(repoPath);
    await sharedStateService.writeSharedFile(repoPath, SECRET_FILE_REL, `${secret}\n`);
    return true;
  }
  // Commit + push the .codebuddy/p2p-secret file to codebuddy-build. Best-effort:
  // any git failure is logged but not thrown, so a temporarily offline owner
  // can still join the swarm with the freshly-generated secret. The next
  // online sync will publish it.
  async function commitAndPushSecret(repoPath) {
    if (!repoPath) return false;
    try {
      const { execSync } = require("child_process");
      const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
      const opts = { cwd: repoPath, encoding: "utf8", env, stdio: "pipe", timeout: 30000 };
      execSync("git add .codebuddy/p2p-secret", opts);
      // Only commit if there's something to commit (avoids empty-commit error).
      let dirty = "";
      try { dirty = execSync("git status --porcelain .codebuddy/p2p-secret", opts).toString(); } catch { /* ignore */ }
      if (dirty.trim().length > 0) {
        execSync('git -c user.name=CodeCollab -c user.email=codecollab@local.invalid commit -m "chore: publish P2P secret"', opts);
      }
      try {
        execSync("git push origin codebuddy-build", opts);
      } catch {
        // First push may need -u
        try { execSync("git push -u origin codebuddy-build", opts); } catch (err) {
          console.warn(`[p2p-secret] push failed (will retry on next auto-sync): ${err?.message?.slice(0, 200)}`);
        }
      }
      return true;
    } catch (err) {
      console.warn(`[p2p-secret] commit failed: ${err?.message?.slice(0, 200)}`);
      return false;
    }
  }
  // Pull the latest codebuddy-build before reading, so a freshly-cloned or
  // out-of-date checkout picks up a newly-rotated secret. Best-effort.
  async function pullCodebuddyBranch(repoPath) {
    if (!repoPath) return;
    try {
      const { execSync } = require("child_process");
      const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
      const opts = { cwd: repoPath, encoding: "utf8", env, stdio: "pipe", timeout: 20000 };
      execSync("git fetch origin codebuddy-build", opts);
      // Fast-forward only — don't clobber local work.
      try { execSync("git merge --ff-only origin/codebuddy-build", opts); } catch { /* divergent is fine */ }
    } catch { /* offline/unauth — fall through */ }
  }

  const sendEvent = (channel, payload) => {
    const window = mainWindow();

    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  const logActivity = (event) => {
    activityService.addEvent(event);
  };

  // When a P2P peer completes hello handshake, broadcast all local threads so they get full history
  p2pService.onPeerReady(async (projectId, peerId, peerName) => {
    try {
      const settings = await settingsService.readSettings();
      // Find the project that this P2P session belongs to
      const project = settings.projects?.find(p => p.id === projectId);
      if (!project) return;

      const dashboard = project.dashboard;
      const localThreads = dashboard?.taskThreads || [];
      const localConversation = dashboard?.conversation || [];
      const localSoloSessions = dashboard?.soloSessions || [];

      if (localThreads.length > 0 || localConversation.length > 0 || localSoloSessions.length > 0) {
        console.log(`[P2P-sync] Peer "${peerName}" connected to project ${projectId.slice(0, 8)} — broadcasting ${localThreads.length} threads, ${localConversation.length} PM messages, ${localSoloSessions.length} freestyle sessions for sync`);
        p2pService.broadcastStateChange(projectId, "thread-sync", projectId, {
          projectId,
          taskThreads: localThreads,
          conversation: localConversation,
          soloSessions: localSoloSessions,
        });
      }
    } catch (err) {
      console.warn("[P2P-sync] Peer-ready thread broadcast error:", err?.message);
    }
  });

  // Listen for P2P state changes from peers — apply plan updates to settings in real-time
  p2pService.onStateChange(async (projectId, category, id, data, peerName) => {
    // Block plan and task status changes while an agent is running — deferred auto-sync will catch up
    const isAgentBusy = fileWatcherService && typeof fileWatcherService.isAgentActive === "function" && fileWatcherService.isAgentActive();
    if (isAgentBusy && (category === "plan" || category === "tasks")) {
      console.log(`[P2P-apply] BLOCKED — agent is active, skipping ${category} from ${peerName} (id=${id})`);
      return;
    }

    if (category === "plan" && data?.plan) {
      try {
        let didChange = false;
        const result = await settingsService.atomicUpdate((settings) => {
          // Use the projectId from the P2P session to find the right project
          let projectIndex = settings.projects?.findIndex(p => p.id === projectId);

          // Fallback: try matching by sender's ID
          if (projectIndex < 0) {
            projectIndex = settings.projects?.findIndex(p => p.id === id);
          }

          if (projectIndex >= 0 && settings.projects[projectIndex].dashboard) {
            const subCount = data.plan?.subprojects?.length || 0;
            const taskCount = data.plan?.subprojects?.reduce((n, sp) => n + (sp.tasks?.length || 0), 0) || 0;
            console.log(`[P2P-apply] plan from ${peerName}: ${subCount} subprojects, ${taskCount} tasks`);

            // Forward-only merge: don't let incoming plan revert task statuses that are more advanced locally
            const STATUS_ORDER_P2P = { planned: 0, building: 1, review: 2, done: 3 };
            const existingPlanP2P = settings.projects[projectIndex].dashboard.plan;
            if (existingPlanP2P?.subprojects && data.plan.subprojects) {
              const localStatusMap = new Map();
              for (const sp of existingPlanP2P.subprojects) {
                for (const t of (sp.tasks || [])) {
                  localStatusMap.set(t.id, t.status);
                }
              }
              for (const sp of data.plan.subprojects) {
                for (const t of (sp.tasks || [])) {
                  const localStatus = localStatusMap.get(t.id);
                  if (localStatus && (STATUS_ORDER_P2P[localStatus] || 0) > (STATUS_ORDER_P2P[t.status] || 0)) {
                    t.status = localStatus;
                  }
                }
              }
            }

            settings.projects[projectIndex].dashboard.plan = data.plan;
            if (data.taskThreads) {
              // Merge taskThreads: keep local threads not present in incoming, merge messages for shared threads
              const localThreads = settings.projects[projectIndex].dashboard.taskThreads || [];
              const incomingMap = new Map(data.taskThreads.map(t => [t.id, t]));
              const localMap = new Map(localThreads.map(t => [t.id, t]));
              const mergedThreads = [];
              // Keep all incoming threads
              for (const inThread of data.taskThreads) {
                const localThread = localMap.get(inThread.id);
                if (localThread && localThread.messages?.length > inThread.messages?.length) {
                  // Local has more messages (e.g. from P2P conversation sync) — keep local version
                  mergedThreads.push(localThread);
                } else {
                  mergedThreads.push(inThread);
                }
              }
              // Add any local-only threads not in incoming
              for (const localThread of localThreads) {
                if (!incomingMap.has(localThread.id)) {
                  mergedThreads.push(localThread);
                }
              }
              settings.projects[projectIndex].dashboard.taskThreads = mergedThreads;
            }
            didChange = true;
            return { ...settings };
          } else {
            console.warn(`[P2P-apply] plan SKIP — no matching project (peer=${peerName})`);
            return undefined; // no-op
          }
        });
        if (didChange && result) sendEvent("settings:changed", result);
      } catch (err) {
        console.warn("[P2P-apply] ERROR:", err?.message);
      }
    } else if (category === "tasks" && data?.taskId && data?.status) {
      // ── Task status sync: update task status on this machine ──
      try {
        let didChange = false;
        const result = await settingsService.atomicUpdate((settings) => {
          let projectIndex = settings.projects?.findIndex(p => p.id === projectId);
          if (projectIndex < 0) projectIndex = settings.projects?.findIndex(p => p.id === data.projectId);

          if (projectIndex >= 0 && settings.projects[projectIndex].dashboard?.plan?.subprojects) {
            const subprojects = settings.projects[projectIndex].dashboard.plan.subprojects;
            let updated = false;
            for (const sp of subprojects) {
              const task = sp.tasks?.find(t => t.id === data.taskId);
              if (task) {
                console.log(`[P2P-apply] task "${task.title}" ${task.status} → ${data.status} (from ${peerName})`);
                task.status = data.status;
                // Cascade subproject status using the same rule as the sender.
                // Keeps the subproject pill in sync across machines when a task
                // flip auto-advances/rewinds the parent subproject.
                const nextTasks = sp.tasks || [];
                if (nextTasks.length > 0) {
                  const allDone = nextTasks.every(t => t.status === "done");
                  const anyBuilding = nextTasks.some(t => t.status === "building");
                  if (allDone) {
                    sp.status = "done";
                  } else if (sp.status === "done") {
                    // a task was reopened
                    sp.status = "building";
                  } else if (anyBuilding && sp.status === "planned") {
                    sp.status = "building";
                  }
                }
                updated = true;
                break;
              }
            }
            if (updated) {
              didChange = true;
              return { ...settings };
            }
          }
          return undefined; // no-op
        });
        if (didChange && result) sendEvent("settings:changed", result);
      } catch (err) {
        console.warn("[P2P-apply] Task status sync error:", err?.message);
      }
    } else if (category === "conversation" && data?.newMessages?.length > 0) {
      // ── Shared agent context: append peer conversation messages to local project ──
      try {
        const result = await settingsService.atomicUpdate((settings) => {
          let projectIndex = settings.projects?.findIndex(p => p.id === projectId);
          if (projectIndex < 0) projectIndex = settings.projects?.findIndex(p => p.id === data.projectId);

          if (projectIndex >= 0 && settings.projects[projectIndex].dashboard) {
            const dashboard = settings.projects[projectIndex].dashboard;
            const msgType = data.type; // "project-manager", "task-agent", "solo-chat"

            // Tag incoming messages so we know they came from a peer
            const taggedMessages = data.newMessages.map(m => ({
              ...m,
              fromPeer: true,
              peerName: peerName || "Peer",
            }));

            if (msgType === "project-manager") {
              const existing = new Set((dashboard.conversation || []).map(m => m.id));
              const deduped = taggedMessages.filter(m => !existing.has(m.id));
              if (deduped.length > 0) {
                dashboard.conversation = [...(dashboard.conversation || []), ...deduped];
              }
            } else if (msgType === "task-agent" && data.threadId) {
              let thread = dashboard.taskThreads?.find(t => t.id === data.threadId);
              if (!thread) {
                // Create the thread if it doesn't exist yet (peer started the task chat first)
                thread = {
                  id: data.threadId,
                  taskId: data.taskId || data.threadId.replace("thread-", ""),
                  title: `Peer task session`,
                  agentName: "Task Agent",
                  messages: [],
                };
                if (!dashboard.taskThreads) dashboard.taskThreads = [];
                dashboard.taskThreads.push(thread);
              }
              const existingThread = new Set((thread.messages || []).map(m => m.id));
              const dedupedThread = taggedMessages.filter(m => !existingThread.has(m.id));
              if (dedupedThread.length > 0) {
                thread.messages = [...(thread.messages || []), ...dedupedThread];
              }
            } else if (msgType === "solo-chat" && data.sessionId) {
              let session = dashboard.soloSessions?.find(s => s.id === data.sessionId);
              if (!session) {
                session = { id: data.sessionId, title: `Peer session`, messages: [] };
                if (!dashboard.soloSessions) dashboard.soloSessions = [];
                dashboard.soloSessions.push(session);
              }
              session.messages = [...(session.messages || []), ...taggedMessages];
            }

            console.log(`[P2P-apply] conversation from ${peerName}: +${taggedMessages.length} ${msgType} messages`);
            return { ...settings };
          }
          return undefined; // no-op
        });
        if (result) sendEvent("settings:changed", result);
      } catch (err) {
        console.warn("[P2P-apply] Conversation sync error:", err?.message);
      }
    } else if (category === "thread-sync" && (data?.taskThreads || data?.conversation || data?.soloSessions)) {
      // ── Full thread sync from a peer that just connected — merge their history into ours ──
      try {
        let didChange = false;
        const result = await settingsService.atomicUpdate((settings) => {
          let projectIndex = settings.projects?.findIndex(p => p.id === projectId);
          if (projectIndex < 0) projectIndex = settings.projects?.findIndex(p => p.id === data.projectId);

          if (projectIndex >= 0 && settings.projects[projectIndex].dashboard) {
            const dashboard = settings.projects[projectIndex].dashboard;
            let changed = false;

            // Merge taskThreads: keep whichever version has more messages per thread, add new threads
            if (data.taskThreads?.length) {
              const localThreads = dashboard.taskThreads || [];
              const localMap = new Map(localThreads.map(t => [t.id, t]));
              const mergedThreads = [...localThreads]; // start with local

              for (const inThread of data.taskThreads) {
                const localThread = localMap.get(inThread.id);
                if (!localThread) {
                  // New thread from peer — add it
                  mergedThreads.push(inThread);
                  changed = true;
                } else if ((inThread.messages?.length || 0) > (localThread.messages?.length || 0)) {
                  // Peer has more messages — use their version
                  const idx = mergedThreads.findIndex(t => t.id === inThread.id);
                  if (idx >= 0) mergedThreads[idx] = inThread;
                  changed = true;
                }
              }

              if (changed) {
                dashboard.taskThreads = mergedThreads;
              }
            }

            // Merge PM conversation: use whichever is longer
            if (data.conversation?.length) {
              const localConv = dashboard.conversation || [];
              if (data.conversation.length > localConv.length) {
                dashboard.conversation = data.conversation;
                changed = true;
              }
            }

            // Merge freestyle/solo sessions: keep whichever version has more messages per session, add new sessions
            if (data.soloSessions?.length) {
              const localSessions = dashboard.soloSessions || [];
              const localSessionMap = new Map(localSessions.map(s => [s.id, s]));
              const mergedSessions = [...localSessions];

              for (const inSession of data.soloSessions) {
                const localSession = localSessionMap.get(inSession.id);
                if (!localSession) {
                  mergedSessions.push(inSession);
                  changed = true;
                } else if ((inSession.messages?.length || 0) > (localSession.messages?.length || 0)) {
                  const idx = mergedSessions.findIndex(s => s.id === inSession.id);
                  if (idx >= 0) mergedSessions[idx] = inSession;
                  changed = true;
                }
              }

              if (changed || mergedSessions.length > localSessions.length) {
                dashboard.soloSessions = mergedSessions;
                changed = true;
              }
            }

            if (changed) {
              console.log(`[P2P-apply] thread-sync from ${peerName}: ${data.taskThreads?.length || 0} threads, ${data.conversation?.length || 0} PM msgs, ${data.soloSessions?.length || 0} solo sessions`);
              didChange = true;
              return { ...settings };
            }
          }
          return undefined; // no-op
        });
        if (didChange && result) sendEvent("settings:changed", result);
      } catch (err) {
        console.warn("[P2P-apply] Thread sync error:", err?.message);
      }
    } else if (category === "new-commits") {
      // Peer pushed new commits to codebuddy-build — auto-pull them
      // But NOT while a task agent is running — defer until agent finishes
      try {
        const isAgentBusy = fileWatcherService && typeof fileWatcherService.isAgentActive === "function" && fileWatcherService.isAgentActive();
        if (isAgentBusy) {
          console.log(`[P2P-apply] new-commits from ${peerName} — deferring (agent busy)`);
        } else {
          const settings = await settingsService.readSettings();
          const project = settings.projects?.find(p => p.id === projectId);
          if (project?.repoPath && fileWatcherService) {
            console.log(`[P2P-apply] new-commits from ${peerName} — auto-pulling codebuddy-build...`);
            const pullResult = await fileWatcherService.autoPull(project.repoPath);
            if (!pullResult?.ok) console.warn(`[P2P-apply] auto-pull failed:`, pullResult);
            sendEvent("fileWatcher:peerSync", { peerName, branch: data?.branch, pullResult });
          }
        }
      } catch (err) {
        console.warn("[P2P-apply] Auto-pull from new-commits error:", err?.message);
      }
    } else if (category === "main-updated") {
      // Peer pushed to main — fetch to update our local main ref
      try {
        const settings = await settingsService.readSettings();
        const project = settings.projects?.find(p => p.id === projectId);
        if (project?.repoPath) {
          const { execSync } = require("child_process");
          const cwd = require("path").resolve(project.repoPath);
          const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
          try {
            execSync("git fetch origin main:main", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
          } catch {
            // fetch origin main:main fails when main is checked out — fetch the remote ref first
            execSync("git fetch origin main", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
            try {
              const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", env: gitEnv }).trim();
              if (currentBranch === "main") {
                // Main is checked out — fast-forward merge so the working tree updates
                execSync("git merge --ff-only origin/main", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
              }
            } catch (mergeErr) {
              console.warn(`[P2P-apply] Could not ff-merge origin/main: ${mergeErr?.message}`);
            }
          }
          sendEvent("fileWatcher:mainUpdated", { peerName, branch: "main" });
        }
      } catch (err) {
        console.warn("[P2P-apply] Main branch fetch error:", err?.message);
      }
    } else if (category === "agent-context" && data?.snapshotId) {
      // ── Shared agent context: peer saved a context snapshot — write it locally so we can load it ──
      try {
        const settings = await settingsService.readSettings();
        const activeProject = settings.projects?.find(p => p.id === settings.activeProjectId);
        if (activeProject?.repoPath && sharedStateService) {
          // Sanitize the peer-supplied snapshotId before using it as a filename.
          // Without this a malicious peer could write outside .codebuddy/ via
          // a crafted ID like "../../etc/passwd". Allow alnum + dash + underscore + dot only.
          const rawId = String(data.snapshotId);
          const safeSnapshotId = rawId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
          if (!safeSnapshotId || safeSnapshotId === "." || safeSnapshotId === "..") {
            console.warn(`[P2P-apply] Refusing agent-context with unsafe snapshotId from ${peerName}`);
            return;
          }
          // Fetch the full snapshot from the peer's shared state (it was committed + pushed via auto-sync)
          // For immediate availability before git sync, store the signal metadata as a lightweight marker
          const markerData = {
            ...data,
            snapshotId: safeSnapshotId,
            receivedAt: new Date().toISOString(),
            fromPeer: peerName,
          };
          await sharedStateService.writeSharedFile(
            activeProject.repoPath,
            `agents/context/${safeSnapshotId}.signal.json`,
            JSON.stringify(markerData, null, 2)
          );
          console.log(`[P2P-apply] agent-context signal ${safeSnapshotId.slice(-8)} from ${peerName} (${data.messageCount || 0} msgs)`);
          sendEvent("agentContext:peerUpdated", { peerName, snapshotId: safeSnapshotId, scope: data.scope, taskTitle: data.taskTitle });
        }
      } catch (err) {
        console.warn("[P2P-apply] Agent context signal error:", err?.message);
      }
    } else {
      // Unknown category — silently ignore
    }
  });

  safeHandle("system:getBuildTag", async () => BUILD_TAG);

  safeHandle("system:openDirectory", async () => {
    const window = mainWindow();
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
    });

    return result.canceled ? null : result.filePaths[0];
  });

  safeHandle("system:openFiles", async () => {
    const window = mainWindow();
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "All Files", extensions: ["*"] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  safeHandle("system:readFileAsDataUrl", async (_event, filePath) => {
    if (typeof filePath !== "string" || !filePath) return null;
    try {
      const fs = require("fs");
      const path = require("path");
      // Resolve to an absolute path and reject obvious non-files.
      const resolved = path.resolve(filePath);
      let stat;
      try { stat = fs.statSync(resolved); } catch { return null; }
      if (!stat.isFile()) return null;
      // Hard cap so a malicious or accidental huge file can't OOM the main process.
      const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
      if (stat.size > MAX_FILE_BYTES) {
        console.warn(`[IPC] readFileAsDataUrl refused oversized file (${stat.size} bytes): ${resolved}`);
        return null;
      }
      const ext = path.extname(resolved).toLowerCase().replace(".", "");
      const mimeMap = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
        bmp: "image/bmp", ico: "image/x-icon",
        pdf: "application/pdf",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        xls: "application/vnd.ms-excel",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        doc: "application/msword",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ppt: "application/vnd.ms-powerpoint",
        csv: "text/csv",
        txt: "text/plain", md: "text/markdown", json: "application/json",
        ts: "text/typescript", tsx: "text/typescript",
        js: "text/javascript", jsx: "text/javascript",
        py: "text/x-python", html: "text/html", css: "text/css",
        sh: "text/x-sh", yaml: "text/yaml", yml: "text/yaml",
        xml: "text/xml", toml: "text/plain", env: "text/plain",
      };
      const mime = mimeMap[ext] || "application/octet-stream";
      const data = fs.readFileSync(resolved);
      return `data:${mime};base64,${data.toString("base64")}`;
    } catch { return null; }
  });

  safeHandle("system:saveUploadedFile", async (_event, { projectDir, fileName, base64Data }) => {
    if (!projectDir || !fileName || !base64Data) return null;
    try {
      const fs = require("fs");
      const path = require("path");
      // Sanitize filename to prevent path traversal
      const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
      const uploadsDir = path.join(projectDir, ".codebuddy", "uploads");
      fs.mkdirSync(uploadsDir, { recursive: true });
      const destPath = path.join(uploadsDir, safeName);
      const buffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(destPath, buffer);
      return destPath;
    } catch (err) {
      console.error("[IPC] saveUploadedFile error:", err?.message ?? err);
      return null;
    }
  });

  safeHandle("system:openExternal", async (_event, url) => {
    if (typeof url !== "string") {
      throw new Error("URL must be a string.");
    }
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("Invalid URL."); }
    // Only allow http(s) — never file:, javascript:, data:, vscode:, etc.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http and https URLs are allowed.");
    }
    await shell.openExternal(parsed.toString());
  });

  // Launch a real OS terminal window. Supports optional cwd, optional pre-loaded
  // command (prefill: the command is typed but not executed — user presses Enter),
  // or run: true (VS Code-style "Run in Terminal" — executes immediately, keeps
  // the window open so the user can see output).
  safeHandle("system:openTerminal", async (_event, payload) => {
    const opts = (payload && typeof payload === "object") ? payload : {};
    const cwd = typeof opts.cwd === "string" && opts.cwd ? opts.cwd : process.cwd();
    const command = typeof opts.command === "string" ? opts.command : "";
    const run = !!opts.run;
    const fs = require("fs");
    const path = require("path");
    const { spawn } = require("child_process");

    // Defence-in-depth: even though this handler runs commands the user
    // explicitly asked to run, the `command` and `cwd` strings flow through
    // shell concatenation on every platform (cmd /K, AppleScript do script,
    // bash -c). Reject inputs that contain control characters, embedded
    // newlines, NULs, or are absurdly long — these are the building blocks
    // of an injection attack if any upstream caller (AI suggestion, peer
    // shared state, drag-and-drop file content) ever pipes attacker-
    // controlled text into either field.
    const CTRL_RE = /[\x00-\x09\x0b-\x1f\x7f]/; // allow \n (0x0a) is intentionally excluded; reject others
    const hasBadChars = (s) => /[\x00-\x1f\x7f]/.test(s); // reject ALL ctrl chars including \r\n
    if (command && (command.length > 4096 || hasBadChars(command))) {
      throw new Error("Terminal command rejected: too long or contains control characters.");
    }
    if (cwd.length > 4096 || hasBadChars(cwd)) {
      throw new Error("Terminal cwd rejected: too long or contains control characters.");
    }
    void CTRL_RE; // reserved for future use

    // Always copy to clipboard as a safety net when there is a command.
    if (command) {
      try { clipboard.writeText(command); } catch { /* ignore */ }
    }

    const cwdResolved = path.resolve(cwd);

    if (process.platform === "win32") {
      // Locate pwsh.exe (preferred) or fall back to powershell.exe.
      // Note: many of these executables are App Execution Aliases (zero-byte
      // reparse points under WindowsApps) which CreateProcess cannot launch
      // directly — we must invoke them via the shell so cmd.exe resolves the alias.
      const findOnPath = (exe) => {
        const pathDirs = (process.env.PATH || "").split(path.delimiter);
        for (const dir of pathDirs) {
          if (!dir) continue;
          const candidate = path.join(dir, exe);
          try {
            const st = fs.statSync(candidate);
            // Skip zero-byte execution-alias stubs; they exist but spawn() can't run them.
            if (st && st.size > 0) return candidate;
          } catch { /* ignore */ }
        }
        return null;
      };
      const pwshResolved = findOnPath("pwsh.exe");
      // For shell-launched fallbacks, use the bare name so cmd.exe resolves aliases.
      const pwshShellName = pwshResolved ? "pwsh.exe" : "powershell.exe";
      console.log(`[openTerminal] win32 cwd=${cwdResolved} cmdLen=${command.length} run=${run} pwsh=${pwshShellName}`);

      if (run && command) {
        // Execute immediately. cmd /K keeps the window open after the command exits.
        // Using `start "" cmd.exe /K ...` detaches a new console window.
        const args = ["/D", "/C", "start", "", "cmd.exe", "/K", `cd /d "${cwdResolved}" && ${command}`];
        try {
          const child = spawn("cmd.exe", args, { detached: true, stdio: "ignore", windowsHide: false });
          child.on("error", (err) => { console.error("[openTerminal] cmd run spawn error:", err?.message ?? err); });
          child.unref();
          return { ok: true, mode: "run", shell: "cmd.exe" };
        } catch (err) {
          console.error("[openTerminal] cmd run failed:", err?.message ?? err);
          return { ok: false, error: err && err.message ? err.message : String(err) };
        }
      }

      // Prefill mode — pwsh runs in MTA, where System.Windows.Forms.SendKeys
      // and Clipboard silently no-op, so we cannot SendKeys from inside the
      // launched shell. Instead: launch a plain pwsh window in the cwd, then
      // from a SEPARATE Windows-PowerShell -STA helper process (spawned here
      // from Node), wait briefly for the new wt window to gain focus and
      // SendKeys('^v') to it. Clipboard already holds the command.
      const escSingle = (s) => String(s).replace(/'/g, "''");
      const innerCommand = `Set-Location -LiteralPath '${escSingle(cwdResolved)}'`;

      // Build a single shell-string command so cmd.exe handles quoting and so
      // App Execution Aliases (wt.exe under WindowsApps) resolve correctly.
      // The PowerShell -Command argument is wrapped in double quotes with any
      // embedded double quotes escaped as "".
      const psCmdQuoted = `"${innerCommand.replace(/"/g, '""')}"`;
      const cwdQuoted = `"${cwdResolved.replace(/"/g, '""')}"`;

      try {
        const localApp = process.env.LOCALAPPDATA || "";
        const wtAlias = localApp ? path.join(localApp, "Microsoft", "WindowsApps", "wt.exe") : "";
        const wtOnPath = findOnPath("wt.exe");
        const hasWt = !!wtOnPath || (!!wtAlias && fs.existsSync(wtAlias));

        // Helper that, after the new terminal window appears, activates it
        // (by window-title match) and pastes the clipboard via SendKeys.
        // We use cscript+VBScript because WScript.Shell.SendKeys is the most
        // reliable Windows scripting API for synthetic input — it's STA by
        // default and AppActivate guarantees the right window is focused.
        const sendKeysHelper = (windowTitleNeedle, delayMs) => {
          if (!command) return;
          const os = require("os");
          const vbsPath = path.join(os.tmpdir(), `cb-prefill-${process.pid}-${Date.now()}.vbs`);
          // Note: VBScript string literals use "" to escape ".
          const titleEsc = String(windowTitleNeedle).replace(/"/g, '""');
          const vbs = [
            `Option Explicit`,
            `Dim sh, attempts, ok`,
            `Set sh = CreateObject("WScript.Shell")`,
            `WScript.Sleep ${delayMs}`,
            `attempts = 0`,
            `ok = False`,
            `Do While attempts < 20 And Not ok`,
            `  ok = sh.AppActivate("${titleEsc}")`,
            `  If Not ok Then`,
            `    WScript.Sleep 250`,
            `    attempts = attempts + 1`,
            `  End If`,
            `Loop`,
            `WScript.Sleep 200`,
            `sh.SendKeys "^v"`,
            ``
          ].join("\r\n");
          try {
            fs.writeFileSync(vbsPath, vbs, "utf8");
            console.log(`[openTerminal] sendkeys helper wrote ${vbsPath} title="${windowTitleNeedle}" delay=${delayMs}`);
            const helper = spawn("cscript.exe", ["//Nologo", "//B", vbsPath], {
              detached: true, stdio: "ignore", windowsHide: true,
            });
            helper.on("error", (err) => { console.error("[openTerminal] sendkeys helper spawn error:", err?.message ?? err); });
            helper.on("exit", (code) => {
              console.log(`[openTerminal] sendkeys helper exit code=${code}`);
              try { fs.unlinkSync(vbsPath); } catch { /* ignore */ }
            });
            helper.unref();
          } catch (err) {
            console.error("[openTerminal] sendkeys helper failed:", err?.message ?? err);
          }
        };

        if (hasWt) {
          // wt.exe sets its window title to the running profile name (e.g.
          // "PowerShell" or "Windows PowerShell"). Match on a stable token.
          const cmdLine = `start "" wt.exe -d ${cwdQuoted} ${pwshShellName} -NoExit -Command ${psCmdQuoted}`;
          console.log(`[openTerminal] launching wt: ${cmdLine}`);
          const child = spawn(cmdLine, [], { shell: true, detached: true, stdio: "ignore", windowsHide: false });
          child.on("error", (err) => { console.error("[openTerminal] wt spawn error:", err?.message ?? err); });
          child.unref();
          // wt's window title is "PowerShell" for pwsh / "Windows PowerShell" for powershell.
          const titleNeedle = pwshShellName === "pwsh.exe" ? "PowerShell" : "Windows PowerShell";
          sendKeysHelper(titleNeedle, 1200);
          return { ok: true, mode: "prefill", shell: pwshShellName, terminal: "wt.exe" };
        }

        // Fallback: open a plain PowerShell console.
        const cmdLine = `start "" ${pwshShellName} -NoExit -Command ${psCmdQuoted}`;
        console.log(`[openTerminal] launching ps console: ${cmdLine}`);
        const child = spawn(cmdLine, [], { shell: true, cwd: cwdResolved, detached: true, stdio: "ignore", windowsHide: false });
        child.on("error", (err) => { console.error("[openTerminal] ps spawn error:", err?.message ?? err); });
        child.unref();
        const titleNeedle = pwshShellName === "pwsh.exe" ? "PowerShell" : "Windows PowerShell";
        sendKeysHelper(titleNeedle, 900);
        return { ok: true, mode: "prefill", shell: pwshShellName };
      } catch (err) {
        console.error("[openTerminal] prefill failed:", err?.message ?? err);
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    }

    if (process.platform === "darwin") {
      const escDouble = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
      const cdLine = `cd "${escDouble(cwdResolved)}"`;
      const inner = run && command
        ? `${cdLine}; ${command}`
        : (command ? `${cdLine}; print -z "${escDouble(command)}"` : cdLine);
      const osa = `tell application "Terminal" to activate\n` +
        `tell application "Terminal" to do script "${escDouble(inner)}"`;
      try {
        spawn("osascript", ["-e", osa], { detached: true, stdio: "ignore" }).unref();
        return { ok: true, mode: run ? "run" : "prefill", shell: "zsh" };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    }

    // Linux: try common terminals.
    const candidates = [
      ["x-terminal-emulator", ["--working-directory=" + cwdResolved]],
      ["gnome-terminal", ["--working-directory=" + cwdResolved]],
      ["konsole", ["--workdir", cwdResolved]],
      ["xterm", []],
    ];
    for (const [bin, baseArgs] of candidates) {
      try {
        const args = [...baseArgs];
        if (run && command) {
          args.push("--", "bash", "-c", `cd "${cwdResolved}"; ${command}; exec bash`);
        } else if (command) {
          args.push("--", "bash", "-c", `cd "${cwdResolved}"; echo "# Command ready (also on clipboard): ${command.replace(/"/g, '\\"')}"; exec bash`);
        } else {
          args.push("--", "bash");
        }
        spawn(bin, args, { detached: true, stdio: "ignore" }).unref();
        return { ok: true, mode: run ? "run" : "prefill", shell: "bash", terminal: bin };
      } catch { /* try next */ }
    }
    return { ok: false, error: "No supported terminal emulator found." };
  });

  safeHandle("system:getCommonPaths", async () => {
    return {
      desktop: app.getPath("desktop"),
      documents: app.getPath("documents"),
      downloads: app.getPath("downloads"),
      home: app.getPath("home"),
    };
  });

  safeHandle("process:run", async (_event, payload) => {
    return processService.run(payload.command, payload.cwd, payload.options ?? {});
  });

  safeHandle("process:cancel", async (_event, processId) => {
    return processService.cancel(processId);
  });

  safeHandle("process:listRunning", async () => {
    return processService.listRunning();
  });

  safeHandle("repo:inspect", async (_event, repoPath) => {
    const inspection = await repoService.inspectRepository(repoPath);
    logActivity({
      type: "build",
      title: "Repository connected",
      description: `Connected ${inspection.repoPath} on branch ${inspection.branch}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return inspection;
  });

  safeHandle("repo:listDirectory", async (_event, targetPath) => {
    return repoService.listDirectory(targetPath);
  });

  safeHandle("repo:readFileContent", async (_event, targetPath) => {
    return repoService.readFileContent(targetPath);
  });

  safeHandle("repo:saveDoc", async (_event, payload) => {
    const opts = (payload && typeof payload === "object") ? payload : {};
    const saved = await repoService.saveGeneratedDoc(opts.repoPath, opts.mode, opts.content, { timestamp: opts.timestamp });
    logActivity({
      type: "status",
      title: "Documentation saved",
      description: `Saved ${saved.filename} to docs/.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return saved;
  });

  safeHandle("repo:listDocs", async (_event, payload) => {
    return repoService.listGeneratedDocs(payload?.repoPath);
  });

  safeHandle("repo:deleteDoc", async (_event, payload) => {
    return repoService.deleteGeneratedDoc(payload?.repoPath, payload?.filename);
  });

  safeHandle("repo:writeFileContent", async (_event, payload) => {
    const file = await repoService.writeFileContent(payload.targetPath, payload.content);
    logActivity({
      type: "status",
      title: "File updated",
      description: `Saved ${file.path}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return file;
  });

  safeHandle("repo:getFileDiff", async (_event, payload) => {
    return repoService.getFileDiff(payload.repoPath, payload.targetPath, payload.staged ?? false);
  });

  safeHandle("repo:stageFiles", async (_event, payload) => {
    const inspection = await repoService.stageFiles(payload.repoPath, payload.filePaths);
    logActivity({
      type: "status",
      title: "Files staged",
      description: `Staged ${payload.filePaths.length} file${payload.filePaths.length === 1 ? "" : "s"}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return inspection;
  });

  safeHandle("repo:unstageFiles", async (_event, payload) => {
    const inspection = await repoService.unstageFiles(payload.repoPath, payload.filePaths);
    logActivity({
      type: "status",
      title: "Files unstaged",
      description: `Unstaged ${payload.filePaths.length} file${payload.filePaths.length === 1 ? "" : "s"}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return inspection;
  });

  safeHandle("repo:commit", async (_event, payload) => {
    const inspection = await repoService.commit(payload.repoPath, payload.message);
    logActivity({
      type: "build",
      title: "Commit created",
      description: payload.message,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return inspection;
  });

  safeHandle("repo:checkoutBranch", async (_event, payload) => {
    const inspection = await repoService.checkoutBranch(payload.repoPath, payload.branchName, payload.create ?? false, payload.fromBranch ?? null);
    logActivity({
      type: "status",
      title: payload.create ? "Branch created" : "Branch switched",
      description: `${payload.create ? "Created and switched to" : "Switched to"} ${inspection.branch}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return inspection;
  });

  safeHandle("repo:getCommitDetails", async (_event, payload) => {
    return repoService.getCommitDetails(payload.repoPath, payload.commitHash);
  });

  safeHandle("repo:getRemoteUrl", async (_event, repoPath) => {
    return repoService.getRemoteUrl(repoPath);
  });

  safeHandle("repo:push", async (_event, payload) => {
    const result = await repoService.pushToRemote(payload.repoPath, payload);
    logActivity({
      type: "deploy",
      title: "Pushed to GitHub",
      description: `Pushed ${payload.branch || "current branch"} to ${payload.remote || "origin"}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
  });

  safeHandle("repo:pull", async (_event, payload) => {
    const result = await repoService.pullFromRemote(payload.repoPath, payload);
    logActivity({
      type: "status",
      title: "Pulled from remote",
      description: `Pulled latest changes from ${payload.remote || "origin"}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
  });

  safeHandle("repo:syncSharedState", async (_event, payload) => {
    const result = await repoService.syncSharedState(payload.repoPath, payload.commitMessage);
    logActivity({
      type: "deploy",
      title: "Shared workspace synced",
      description: "Committed and pushed .codebuddy/ shared state to remote.",
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
  });

  safeHandle("settings:get", async () => {
    const settings = await settingsService.readSettings();
    return settings;
  });

  safeHandle("settings:update", async (_event, patch) => {
    const nextSettings = await settingsService.updateSettings(patch);
    sendEvent("settings:changed", nextSettings);
    return nextSettings;
  });

  safeHandle("settings:isFirstRun", async () => {
    return settingsService.isFirstRun();
  });

  safeHandle("settings:completeOnboarding", async () => {
    const nextSettings = await settingsService.completeOnboarding();
    sendEvent("settings:changed", nextSettings);
    return nextSettings;
  });

  safeHandle("project:list", async () => {
    return projectService.listProjects();
  });

  safeHandle("project:create", async (_event, payload) => {
    const project = await projectService.createProject(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "build",
      title: "Project created",
      description: `${project.name} was created at ${project.repoPath}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return project;
  });

  safeHandle("project:delete", async (_event, payload) => {
    const result = await projectService.deleteProject(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    const deleteTargets = [
      result.deletedLocalFiles ? "local files" : null,
      result.deletedGithubRepo ? "GitHub repo" : null,
    ].filter(Boolean);
    logActivity({
      type: "status",
      title: "Project removed",
      description: deleteTargets.length > 0
        ? `Removed a project from CodeCollab and deleted ${deleteTargets.join(" and ")}.`
        : "Removed a project from CodeCollab. Local files and GitHub were left untouched.",
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
  });

  safeHandle("project:grantDeleteScope", async () => {
    return projectService.grantGithubDeleteScope();
  });

  safeHandle("project:setActive", async (_event, projectId) => {
    const project = await projectService.setActiveProject(projectId);
    sendEvent("settings:changed", await settingsService.readSettings());
    return project;
  });

  // Auto-import plan from .codebuddy/plan.json if the project has no plan yet
  safeHandle("project:importSyncedPlan", async (_event, projectId) => {
    console.log("[importSyncedPlan] Checking for synced plan...", projectId);
    const preCheck = await settingsService.readSettings();
    const preProject = preCheck.projects?.find(p => p.id === projectId);
    if (!preProject) return { imported: false, reason: "project not found" };
    if (preProject.dashboard?.plan) return { imported: false, reason: "plan already exists" };
    if (!preProject.repoPath) return { imported: false, reason: "no repoPath" };

    try {
      const planFile = await sharedStateService.readSharedFile(preProject.repoPath, "plan.json");
      if (!planFile?.exists || !planFile.content) {
        console.log("[importSyncedPlan] No plan.json found in .codebuddy/");
        return { imported: false, reason: "no plan.json" };
      }

      const planData = JSON.parse(planFile.content);
      if (!planData.plan) return { imported: false, reason: "plan.json has no plan data" };

      console.log("[importSyncedPlan] Found plan with", planData.plan.subprojects?.length || 0, "subprojects");

      const result = await settingsService.atomicUpdate((settings) => {
        const projectIndex = settings.projects?.findIndex(p => p.id === projectId);
        if (projectIndex < 0) return undefined;

        settings.projects[projectIndex].dashboard.plan = planData.plan;
        if (planData.taskThreads?.length) {
          settings.projects[projectIndex].dashboard.taskThreads = planData.taskThreads;
        }
        if (planData.projectManagerContextMarkdown) {
          settings.projects[projectIndex].dashboard.projectManagerContextMarkdown = planData.projectManagerContextMarkdown;
        }
        return { ...settings };
      });
      if (result) sendEvent("settings:changed", result);

      console.log("[importSyncedPlan] Plan imported successfully!");
      return { imported: true, subprojects: planData.plan.subprojects?.length || 0 };
    } catch (err) {
      console.warn("[importSyncedPlan] Error:", err.message);
      return { imported: false, reason: err.message };
    }
  });

  // Sync workspace: pull latest from git, import plan from .codebuddy/plan.json
  safeHandle("project:syncWorkspace", async (_event, projectId) => {
    const log = [];
    // addLog pushes to returned log array (for UI) without spamming console; console gets a single summary line at end.
    const addLog = (msg) => { log.push(msg); };
    addLog("Starting workspace sync for project " + projectId);

    try {
      const settings = await settingsService.readSettings();
      const project = settings.projects?.find(p => p.id === projectId);
      if (!project) { addLog("ERROR: Project not found in settings"); return { success: false, log }; }
      if (!project.repoPath) { addLog("ERROR: No repoPath on project"); return { success: false, log }; }
      addLog("Project: " + project.name + " at " + project.repoPath);

      // Step 1: Hard pull — remote always wins (Google Sheets model)
      addLog("Step 1: Fetching latest from remote (hard pull — remote wins)...");
      try {
        const remoteUrl = await repoService.getRemoteUrl(project.repoPath);
        addLog("  Remote URL: " + (remoteUrl || "NONE"));
        if (remoteUrl) {
          const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
          try {
            // Async — does NOT block the main process event loop. IPC from the
            // renderer (UI responsiveness) keeps flowing while git runs.
            await runGit(["fetch", "origin", "codebuddy-build"], { cwd: project.repoPath, env: gitEnv, timeout: 30000 });
            await runGit(["reset", "--hard", "origin/codebuddy-build"], { cwd: project.repoPath, env: gitEnv, timeout: 30000 });
            addLog("  Hard pull complete — working tree matches remote");
          } catch (fetchResetErr) {
            addLog("  fetch+reset failed: " + fetchResetErr.message.split("\n")[0]);
            // Fallback to autoPull (rebase-based)
            if (fileWatcherService) {
              const pullResult = await fileWatcherService.autoPull(project.repoPath);
              addLog("  autoPull fallback result: " + JSON.stringify(pullResult));
            }
          }
        } else {
          addLog("  No remote configured — skipping pull");
        }
      } catch (pullErr) {
        addLog("  Pull warning: " + pullErr.message);
        // Don't fail — local .codebuddy might still have the plan from clone
      }

      // Step 2: Read plan.json from the committed version (avoids race with auto-save writing to working tree)
      addLog("Step 2: Reading .codebuddy/plan.json from git HEAD...");
      const fs = require("fs");
      const path = require("path");
      const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };

      syncInProgress = true;
      let planContent = null;
      try {
        planContent = await runGit(["show", "HEAD:.codebuddy/plan.json"], { cwd: project.repoPath, env: gitEnv, timeout: 15000 });
        addLog("  git show result: contentLength=" + (planContent?.length || 0));
      } catch (gitShowErr) {
        addLog("  git show .codebuddy/plan.json failed: " + gitShowErr.message.split("\n")[0]);
        // Fallback: try reading from filesystem
        try {
          const planFile = await sharedStateService.readSharedFile(project.repoPath, "plan.json");
          if (planFile?.exists && planFile.content) {
            planContent = planFile.content;
            addLog("  Fallback readSharedFile: contentLength=" + planContent.length);
          }
        } catch { /* ignore fallback error */ }
      }

      if (!planContent) {
        addLog("No plan.json found — nothing to import.");
        syncInProgress = false;

        // Check what files ARE in .codebuddy/
        const codebuddyDir = path.join(project.repoPath, ".codebuddy");
        if (fs.existsSync(codebuddyDir)) {
          const entries = fs.readdirSync(codebuddyDir);
          addLog("  .codebuddy/ contents: " + entries.join(", "));
        } else {
          addLog("  .codebuddy/ directory does not exist!");
        }

        return { success: false, log };
      }

      // Step 3: Parse and import the plan
      addLog("Step 3: Parsing plan.json...");
      let planData;
      try {
        planData = JSON.parse(planContent);
        addLog("  Plan has " + (planData.plan?.subprojects?.length || 0) + " subprojects");
        addLog("  Plan has " + (planData.taskThreads?.length || 0) + " task threads");
        addLog("  Exported by: " + (planData.exportedBy || "unknown") + " at " + (planData.exportedAt || "unknown"));
      } catch (parseErr) {
        addLog("  JSON parse error: " + parseErr.message);
        return { success: false, log };
      }

      if (!planData.plan) {
        addLog("  Plan data has no 'plan' key — contents: " + Object.keys(planData).join(", "));
        return { success: false, log };
      }

      // Step 4: Merge into project settings (atomic to prevent race conditions)
      addLog("Step 4: Merging plan into project settings...");
      let hadExistingPlan = false;
      const result = await settingsService.atomicUpdate((freshSettings) => {
        const projectIndex = freshSettings.projects?.findIndex(p => p.id === projectId);
        addLog("  Project index in settings: " + projectIndex);

        if (projectIndex < 0) {
          addLog("ERROR: Project not found in settings array");
          return undefined; // no-op
        }

        if (!freshSettings.projects[projectIndex].dashboard) {
          addLog("ERROR: Project has no dashboard object");
          return undefined; // no-op
        }

        hadExistingPlan = Boolean(freshSettings.projects[projectIndex].dashboard.plan);
        addLog("  Had existing plan: " + hadExistingPlan);
        addLog("  Conversation count BEFORE sync merge: " + (freshSettings.projects[projectIndex].dashboard.conversation?.length ?? 0));

        // Forward-only merge: preserve task statuses that are more advanced in memory
        // (P2P may have updated statuses after the last plan.json export to git)
        const STATUS_ORDER = { planned: 0, building: 1, review: 2, done: 3 };
        if (hadExistingPlan && planData.plan?.subprojects) {
          const existingPlan = freshSettings.projects[projectIndex].dashboard.plan;
          const existingStatusMap = new Map();
          for (const sp of (existingPlan.subprojects || [])) {
            for (const t of (sp.tasks || [])) {
              existingStatusMap.set(t.id, t.status);
            }
          }
          let preserved = 0;
          for (const sp of planData.plan.subprojects) {
            for (const t of (sp.tasks || [])) {
              const localStatus = existingStatusMap.get(t.id);
              if (localStatus && (STATUS_ORDER[localStatus] || 0) > (STATUS_ORDER[t.status] || 0)) {
                addLog(`  Preserving task "${t.title}" status: ${localStatus} (local) vs ${t.status} (git)`);
                t.status = localStatus;
                preserved++;
              }
            }
          }
          if (preserved > 0) addLog(`  Forward-only merge: preserved ${preserved} task statuses`);
        }

        freshSettings.projects[projectIndex].dashboard.plan = planData.plan;
        if (planData.taskThreads?.length) {
          // Smart merge: keep local threads with more messages, add new ones from git
          const localThreads = freshSettings.projects[projectIndex].dashboard.taskThreads || [];
          const incomingMap = new Map(planData.taskThreads.map(t => [t.id, t]));
          const localMap = new Map(localThreads.map(t => [t.id, t]));
          const mergedThreads = [];
          for (const inThread of planData.taskThreads) {
            const localThread = localMap.get(inThread.id);
            if (localThread && localThread.messages?.length > inThread.messages?.length) {
              mergedThreads.push(localThread);
            } else {
              mergedThreads.push(inThread);
            }
          }
          for (const localThread of localThreads) {
            if (!incomingMap.has(localThread.id)) {
              mergedThreads.push(localThread);
            }
          }
          freshSettings.projects[projectIndex].dashboard.taskThreads = mergedThreads;
        }
        if (planData.projectManagerContextMarkdown) {
          freshSettings.projects[projectIndex].dashboard.projectManagerContextMarkdown = planData.projectManagerContextMarkdown;
        }
        addLog("  Conversation count AFTER sync merge: " + (freshSettings.projects[projectIndex].dashboard.conversation?.length ?? 0));
        return { ...freshSettings };
      });

      if (result) {
        sendEvent("settings:changed", result);
      } else {
        return { success: false, log };
      }

      const subCount = planData.plan.subprojects?.length || 0;
      const taskCount = planData.plan.subprojects?.reduce((n, sp) => n + (sp.tasks?.length || 0), 0) || 0;
      addLog("SUCCESS: Imported " + subCount + " subprojects, " + taskCount + " tasks");
      addLog(hadExistingPlan ? "  (replaced existing plan)" : "  (project had no plan before)");
      console.log(`[syncWorkspace] ${projectId.slice(0, 8)} imported ${subCount} subprojects, ${taskCount} tasks${hadExistingPlan ? " (replaced)" : ""}`);

      syncInProgress = false;
      return { success: true, subprojects: subCount, tasks: taskCount, log };
    } catch (err) {
      syncInProgress = false;
      addLog("UNHANDLED ERROR: " + err.message);
      addLog("  Stack: " + err.stack?.split("\n").slice(0, 3).join(" | "));
      console.error(`[syncWorkspace] ${projectId?.slice?.(0, 8) || "?"} failed: ${err.message}`);
      return { success: false, log };
    }
  });

  // Save plan to settings + .codebuddy/plan.json + commit + push (for async sync)
  // When P2P is live, skip git push (P2P handles real-time sync)
  safeHandle("project:savePlan", async (_event, { projectId, plan, taskThreads, skipGitPush }) => {
    // Use atomicUpdate to prevent concurrent read-modify-write races
    let planChanged = false;
    let project = null;
    const updatedSettings = await settingsService.atomicUpdate((settings) => {
      const projectIndex = settings.projects?.findIndex(p => p.id === projectId);
      if (projectIndex < 0) return undefined; // no-op

      // 1. Write to settings.json ONLY if plan content actually changed
      //    (avoids file-watcher → settings:changed → auto-save → write → echo loop)
      const existingPlanJson = JSON.stringify(settings.projects[projectIndex].dashboard?.plan?.subprojects ?? []);
      const incomingPlanJson = JSON.stringify(plan?.subprojects ?? []);
      planChanged = existingPlanJson !== incomingPlanJson;
      project = settings.projects[projectIndex];
      if (planChanged) {
        settings.projects[projectIndex].dashboard.plan = plan;
        if (taskThreads) {
          settings.projects[projectIndex].dashboard.taskThreads = taskThreads;
        }
        return { ...settings };
      }
      return undefined; // no-op — content identical
    });
    if (!project) return { saved: false, reason: "Project not found" };

    // 2. Export to .codebuddy/plan.json + git push only when NOT live on P2P
    //    Also skip when syncWorkspace is importing or agent is active (deferred auto-sync will handle it)
    const isAgentBusy = fileWatcherService && typeof fileWatcherService.isAgentActive === "function" && fileWatcherService.isAgentActive();
    if (project.repoPath && !skipGitPush && !syncInProgress && !isAgentBusy) {
      try {
        const freshSettings = await settingsService.readSettings();
        const freshProject = freshSettings.projects?.find(p => p.id === projectId);
        const planExport = {
          plan,
          taskThreads: freshProject?.dashboard?.taskThreads || [],
          projectManagerContextMarkdown: freshProject?.dashboard?.projectManagerContextMarkdown || "",
          exportedBy: "auto-save",
          exportedAt: new Date().toISOString(),
        };
        await sharedStateService.writeSharedFile(project.repoPath, "plan.json", JSON.stringify(planExport, null, 2));

        // 3. Commit + push if remote exists
        const remoteUrl = await repoService.getRemoteUrl(project.repoPath);
        if (remoteUrl) {
          // Serialize with the file-watcher auto-sync so both cannot run at once.
          gitQueue.enqueue(project.repoPath, "savePlan-push", async () => {
            try {
              const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
              await runGit(["add", ".codebuddy/plan.json"], { cwd: project.repoPath, env: gitEnv, timeout: 10000 });
              try {
                await runGit(["commit", "-m", "sync: update plan", "--allow-empty"], { cwd: project.repoPath, env: gitEnv, timeout: 10000 });
              } catch { /* nothing to commit is fine */ }
              // Always pull-rebase before push
              try {
                await runGit(["pull", "origin", "codebuddy-build", "--rebase"], { cwd: project.repoPath, env: gitEnv, timeout: 60000 });
              } catch {
                try { await runGit(["rebase", "--abort"], { cwd: project.repoPath, env: gitEnv, timeout: 10000 }); } catch { /* ignore */ }
              }
              try {
                await runGit(["push", "origin", "codebuddy-build"], { cwd: project.repoPath, env: gitEnv, timeout: 60000 });
              } catch (pushErr) {
                const msg = pushErr?.message || "";
                if (/non-fast-forward|rejected|behind/i.test(msg)) {
                  // Remote moved between our pull and push — pull again and retry once.
                  try { await runGit(["rebase", "--abort"], { cwd: project.repoPath, env: gitEnv, timeout: 10000 }); } catch { /* ignore */ }
                  try {
                    await runGit(["pull", "origin", "codebuddy-build", "--rebase"], { cwd: project.repoPath, env: gitEnv, timeout: 60000 });
                    await runGit(["push", "origin", "codebuddy-build"], { cwd: project.repoPath, env: gitEnv, timeout: 60000 });
                  } catch (retryErr) {
                    console.warn("[savePlan] Git push retry failed:", retryErr.message);
                  }
                } else {
                  console.warn("[savePlan] Git push failed:", msg);
                }
              }
            } catch (gitErr) {
              console.warn("[savePlan] Git operation failed:", gitErr.message);
            }
          }).catch(() => { /* swallow — already logged */ });
        }
      } catch (exportErr) {
        console.warn("[savePlan] Plan export failed:", exportErr.message);
      }
    }

    // Don't send settings:changed here — the renderer already has the plan it just saved.
    // Sending it would cause a cascade: settings:changed → plan re-set → subprojects change → savePlan fires again.
    return { saved: true };
  });

  safeHandle("project:generatePlan", async (_event, payload) => {
    if (fileWatcherService) fileWatcherService.setAgentActive(true);
    try {
    const project = await projectService.generateProjectPlan(payload.projectId, payload.prompt, payload.model);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "build",
      title: "MVP plan generated",
      description: `Created a planning dashboard for ${project.name}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });

    // Broadcast plan + PM conversation to P2P peers so they get the plan immediately
    try {
      if (p2pService && typeof p2pService.broadcastStateChange === "function" && project.dashboard?.plan) {
        p2pService.broadcastStateChange(project.id, "plan", project.id, {
          plan: project.dashboard.plan,
          taskThreads: project.dashboard.taskThreads || [],
        });
        console.log(`[generatePlan] Broadcast plan to P2P peers: ${project.dashboard.plan.subprojects?.length || 0} subprojects`);
      }
      if (p2pService && typeof p2pService.broadcastStateChange === "function" && project.dashboard?.conversation?.length) {
        p2pService.broadcastStateChange(project.id, "conversation", `pm-${project.id}`, {
          type: "project-manager",
          projectId: project.id,
          newMessages: project.dashboard.conversation,
        });
        console.log(`[generatePlan] Broadcast PM conversation to P2P peers: ${project.dashboard.conversation.length} messages`);
      }
      // Send chat-message completion signal so peer "AI responding" indicator clears
      if (p2pService && typeof p2pService.broadcastChatMessage === "function") {
        const lastMsg = project.dashboard?.conversation?.slice(-1)[0];
        p2pService.broadcastChatMessage(project.id, `pm-${project.id}`, lastMsg || { text: "Plan generated." }, "project-manager");
      }
    } catch (_) { /* P2P is best-effort */ }

    return project;
    } finally {
      if (fileWatcherService) {
        fileWatcherService.setAgentActive(false);
        fileWatcherService.doAutoSync();
      }
    }
  });

  safeHandle("project:ensureGithubRepo", async (_event, projectId) => {
    const project = await projectService.ensureGithubRepoForProject(projectId);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "build",
      title: "GitHub repo connected",
      description: `${project.name} is now connected to ${project.githubRepoUrl ?? "GitHub"}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return project;
  });

  safeHandle("project:listCollaborators", async (_event, repoPath) => {
    return projectService.listRepoCollaborators(repoPath);
  });

  safeHandle("project:setRepoVisibility", async (_event, payload) => {
    return projectService.setRepoVisibility(payload.repoPath, payload.visibility);
  });

  safeHandle("project:sendTaskMessage", async (_event, payload) => {
    if (fileWatcherService) fileWatcherService.setAgentActive(true);
    try {
    const result = await projectService.sendTaskMessage(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "comment",
      title: "Task agent updated",
      description: `Continued task session ${result.threadId}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
    } finally {
      if (fileWatcherService) {
        fileWatcherService.setAgentActive(false);
        fileWatcherService.doAutoSync();
      }
    }
  });

  safeHandle("project:generateTaskPrompt", async (_event, payload) => {
    if (fileWatcherService) fileWatcherService.setAgentActive(true);
    try {
    const result = await projectService.generateTaskPrompt(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: result.taskStatus === "done" ? "status" : "comment",
      title: result.taskStatus === "done" ? "Task prompt marked done" : "Task prompt generated",
      description: result.reason,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
    } finally {
      if (fileWatcherService) {
        fileWatcherService.setAgentActive(false);
        fileWatcherService.doAutoSync();
      }
    }
  });

  safeHandle("project:sendPMMessage", async (_event, payload) => {
    if (fileWatcherService) fileWatcherService.setAgentActive(true);
    try {
    const result = await projectService.sendPMMessage(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "comment",
      title: "Project manager responded",
      description: `PM conversation updated.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
    } finally {
      if (fileWatcherService) {
        fileWatcherService.setAgentActive(false);
        fileWatcherService.doAutoSync();
      }
    }
  });

  safeHandle("project:sendSoloMessage", async (_event, payload) => {
    if (fileWatcherService) fileWatcherService.setAgentActive(true);
    try {
    const result = await projectService.sendSoloMessage(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "comment",
      title: "Solo coding session updated",
      description: `Coding agent responded in session.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
    } finally {
      if (fileWatcherService) {
        fileWatcherService.setAgentActive(false);
        fileWatcherService.doAutoSync();
      }
    }
  });

  safeHandle("project:cancelActiveRequest", async () => {
    projectService.cancelActiveRequest();
    return { cancelled: true };
  });

  safeHandle("project:approveToolCall", async (_event, payload) => {
    const approved = payload?.approved !== false; // default true
    return projectService.sendToolApproval(approved);
  });

  safeHandle("project:forceResetAgent", async (_event, payload) => {
    return projectService.forceResetAgent(payload?.repoPath);
  });

  safeHandle("project:getActiveRequest", async () => {
    return projectService.getActiveRequest();
  });

  safeHandle("project:getPendingApproval", async () => {
    return projectService.getPendingApproval();
  });

  safeHandle("project:launchDevServer", async (_event, payload) => {
    const result = await projectService.launchDevServer(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "build",
      title: "Dev server launched",
      description: `Agent analyzed and launched the dev server for the project.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
  });

  safeHandle("project:restoreCheckpoint", async (_event, payload) => {
    const project = await projectService.restoreCheckpoint(payload.projectId, payload.checkpointId);
    sendEvent("settings:changed", await settingsService.readSettings());
    return project;
  });

  safeHandle("project:compactConversation", async (_event, payload) => {
    const project = await projectService.compactConversation(payload.projectId, { taskId: payload.taskId, threadId: payload.threadId, sessionId: payload.sessionId });
    sendEvent("settings:changed", await settingsService.readSettings());
    return project;
  });

  safeHandle("tools:listStatus", async () => {
    const statuses = await toolingService.getToolStatus();

    // NOTE: featureFlags are user-controlled via the Settings toggle.
    // We intentionally do NOT auto-sync flags based on tool availability here,
    // because that would override the user's manual disable choice every time
    // any page calls listStatus().  Tool availability is shown separately
    // via ProviderStatusRow ("Ready" / "Not installed").

    return statuses;
  });

  safeHandle("tools:getModelCatalogs", async () => {
    return toolingService.getModelCatalogs();
  });

  safeHandle("tools:runCopilotPrompt", async (_event, payload) => {
    logActivity({
      type: "comment",
      title: "Copilot prompt started",
      description: `Running GitHub Copilot CLI in ${payload.cwd}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return toolingService.runCopilotPrompt(payload);
  });

  safeHandle("tools:runGenericPrompt", async (_event, payload) => {
    logActivity({
      type: "comment",
      title: "AI prompt started",
      description: `Running AI CLI in ${payload.cwd}.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return toolingService.runGenericPrompt(payload);
  });

  safeHandle("tools:installCopilot", async () => {
    const result = await toolingService.installCopilot();
    if (result && result.success) kickCopilotCatalogRefresh("installCopilot");
    return result;
  });

  // Manual catalog refresh — invoked by the renderer after onboarding flows
  // that may have just unlocked the live /models API (gh auth login,
  // copilot extension install). Non-blocking from the renderer's POV: kicks
  // a background refresh and returns the current cached snapshot.
  safeHandle("tools:refreshCopilotCatalog", async () => {
    try {
      const cat = await copilotCatalogService.refreshCatalog();
      const entries = Array.isArray(cat?.entries) ? cat.entries.length : 0;
      return { success: !!cat, entries, source: cat?.source || null };
    } catch (err) {
      return { success: false, entries: 0, error: err && err.message };
    }
  });

  safeHandle("tools:installClaude", async () => {
    return toolingService.installClaudeCode();
  });

  safeHandle("tools:installNode", async () => {
    return toolingService.installNodeJs();
  });

  safeHandle("tools:installGit", async () => {
    return toolingService.installGitScm();
  });

  safeHandle("tools:installGh", async () => {
    return toolingService.installGithubCli();
  });

  safeHandle("tools:installPython", async () => {
    return toolingService.installPython();
  });

  safeHandle("tools:installCodex", async () => {
    const result = await toolingService.installCodex();
    console.log(`[tools] installCodex: success=${result.success}${result.detail ? ` (${result.detail})` : ""}`);
    return result;
  });

  safeHandle("tools:setupGit", async () => {
    return toolingService.setupGitCredentialHelper();
  });

  safeHandle("tools:codexAuthStatus", async () => {
    return toolingService.getCodexAuthStatus();
  });

  safeHandle("tools:codexAuthLogin", async () => {
    const result = await toolingService.startCodexAuth(sendEvent);
    console.log(`[tools] codexAuth: success=${result.success}${result.timedOut ? " (timed out)" : ""}`);
    if (result.success) {
      logActivity({
        type: "status",
        title: "Codex CLI connected",
        description: "Successfully authenticated with OpenAI Codex.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
    }
    return result;
  });

  safeHandle("tools:copilotAuthStatus", async () => {
    return toolingService.getCopilotAuthStatus();
  });

  safeHandle("tools:copilotAuthLogin", async () => {
    const result = await toolingService.startCopilotAuth(sendEvent);
    console.log(`[tools] copilotAuth: success=${result.success}${result.timedOut ? " (timed out)" : ""}`);
    if (result.success) {
      logActivity({
        type: "status",
        title: "Copilot CLI connected",
        description: "Successfully authenticated with GitHub Copilot.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
      // Token now in OS keychain — refresh the discovered model catalog so
      // the live /models response (correct reasoning levels + multipliers)
      // populates without an app restart.
      kickCopilotCatalogRefresh("copilotAuthLogin");
    }
    return result;
  });

  safeHandle("tools:claudeAuthStatus", async () => {
    return toolingService.getClaudeAuthStatus();
  });

  safeHandle("tools:claudeAuthLogin", async () => {
    const result = await toolingService.startClaudeAuth(sendEvent);
    if (result.success) {
      logActivity({
        type: "status",
        title: "Claude Code connected",
        description: "Successfully authenticated with Claude Code.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
    }
    return result;
  });

  safeHandle("tools:githubAuthStatus", async () => {
    return toolingService.getGithubAuthStatus();
  });

  safeHandle("tools:githubAuthLogin", async () => {
    const result = await toolingService.startGithubAuth(sendEvent);
    if (result.success) {
      logActivity({
        type: "status",
        title: "GitHub connected",
        description: "Successfully authenticated with GitHub.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
      // gh auth writes the Copilot CLI OAuth token to the OS keychain;
      // refresh now so the catalog populates without an app restart.
      kickCopilotCatalogRefresh("githubAuthLogin");
    }
    return result;
  });

  safeHandle("tools:githubAuthLogout", async (_event, username) => {
    const result = await toolingService.logoutGithub(username);
    if (result.success) {
      logActivity({
        type: "status",
        title: "GitHub disconnected",
        description: "Logged out of GitHub CLI.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
    }
    return result;
  });

  safeHandle("tools:githubListAccounts", async () => {
    return toolingService.listGithubAccounts();
  });

  safeHandle("tools:githubSwitchAccount", async (_event, username) => {
    return toolingService.switchGithubAccount(username);
  });

  // ---------- Shared State ----------

  safeHandle("sharedState:init", async (_event, repoPath) => {
    return sharedStateService.ensureSharedDir(repoPath);
  });

  safeHandle("sharedState:isInitialized", async (_event, repoPath) => {
    return sharedStateService.isInitialized(repoPath);
  });

  safeHandle("sharedState:readFile", async (_event, payload) => {
    return sharedStateService.readSharedFile(payload.repoPath, payload.relativePath);
  });

  safeHandle("sharedState:writeFile", async (_event, payload) => {
    return sharedStateService.writeSharedFile(payload.repoPath, payload.relativePath, payload.content);
  });

  safeHandle("sharedState:listDir", async (_event, payload) => {
    return sharedStateService.listSharedDir(payload.repoPath, payload.relativePath);
  });

  safeHandle("sharedState:saveConversation", async (_event, payload) => {
    const result = await sharedStateService.saveConversation(payload.repoPath, payload.conversationId, payload.messages, payload.metadata);
    logActivity({
      type: "comment",
      title: "Conversation synced",
      description: `Saved conversation "${payload.metadata?.title || payload.conversationId}" to shared workspace.`,
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return result;
  });

  safeHandle("sharedState:loadConversation", async (_event, payload) => {
    return sharedStateService.loadConversation(payload.repoPath, payload.conversationId);
  });

  safeHandle("sharedState:listConversations", async (_event, repoPath) => {
    return sharedStateService.listConversations(repoPath);
  });

  safeHandle("sharedState:saveMember", async (_event, payload) => {
    return sharedStateService.saveMember(payload.repoPath, payload.profile);
  });

  safeHandle("sharedState:listMembers", async (_event, repoPath) => {
    return sharedStateService.listMembers(repoPath);
  });

  // ---------- P2P Collaboration ----------

  safeHandle("p2p:join", async (_event, payload) => {
    // Resolve the per-project shared secret. v3 protocol requires it; without
    // it we cannot derive a topic or HMAC-authenticate peers.
    //
    // Resolution order:
    //   1. payload.secret (caller passed one explicitly — rarely used)
    //   2. .codebuddy/p2p-secret in the repo's codebuddy-build branch
    //      (single source of truth — every collaborator who can read the
    //      branch derives the same Hyperswarm topic)
    //   3. settings cache (fast path / offline fallback)
    //   4. generate a fresh one and publish it (first owner to join)
    //
    // The repo-file approach replaces the v107-era model where each install
    // generated its own secret and shared it via invite codes. Invite codes
    // are still supported as a bootstrap convenience (they include the
    // secret so an invitee can join *before* completing their first pull),
    // but the repo file is authoritative on every subsequent join.

    let secret = (typeof payload?.secret === "string" && payload.secret) || null;
    let secretSource = secret ? "payload" : null;

    // Try to refresh codebuddy-build so we get the latest secret if it was
    // rotated by another collaborator while this install was offline.
    if (!secret && payload?.repoPath) {
      await pullCodebuddyBranch(payload.repoPath);
      const repoSecret = await readRepoSecret(payload.repoPath);
      if (repoSecret) {
        secret = repoSecret;
        secretSource = "repo";
      }
    }

    // Fall back to settings cache (offline / brand-new project just imported).
    if (!secret) {
      try {
        const settings = await settingsService.readSettings();
        const proj = settings.projects?.find(p => p.id === payload.projectId);
        if (proj?.p2pSecret) {
          secret = proj.p2pSecret;
          secretSource = "settings";
        }
      } catch (err) {
        console.warn("[p2p:join] settings read failed:", err?.message);
      }
    }

    // Last resort: this install is the first to join. Generate, persist to
    // the repo, and publish. Any future joiner (invitee or manual cloner)
    // will read the same value from .codebuddy/p2p-secret.
    let generatedNew = false;
    if (!secret) {
      if (typeof p2pService.generateProjectSecret !== "function") {
        throw new Error("P2P shared secret missing and generator unavailable.");
      }
      secret = p2pService.generateProjectSecret();
      secretSource = "generated";
      generatedNew = true;
    }

    // Persist to settings cache regardless of source.
    try {
      await settingsService.atomicUpdate((s) => {
        const idx = s.projects?.findIndex(p => p.id === payload.projectId);
        if (idx >= 0) s.projects[idx].p2pSecret = secret;
        return s;
      });
    } catch (err) {
      console.warn("[p2p:join] Could not persist secret to settings:", err?.message);
    }

    // If we just generated a new one, write it into the repo and push so
    // the next collaborator finds it. Best-effort — failure here doesn't
    // block the join.
    if (generatedNew && payload?.repoPath) {
      try {
        await writeRepoSecret(payload.repoPath, secret);
        await commitAndPushSecret(payload.repoPath);
      } catch (err) {
        console.warn("[p2p:join] Could not publish secret to repo:", err?.message);
      }
    } else if (secretSource === "settings" && payload?.repoPath) {
      // We had a cached secret but the repo file may not exist yet (legacy
      // project from before this build). Publish it so the next manual
      // cloner can find us.
      try {
        const existing = await readRepoSecret(payload.repoPath);
        if (!existing) {
          await writeRepoSecret(payload.repoPath, secret);
          await commitAndPushSecret(payload.repoPath);
        }
      } catch { /* best-effort */ }
    }

    console.log(`[p2p:join] projectId=${payload.projectId?.slice(0,8)} mode=v3-authenticated source=${secretSource}${generatedNew ? " (published)" : ""}`);

    const result = await p2pService.joinProject(
      payload.projectId,
      payload.repoPath,
      payload.remoteUrl,
      payload.member,
      { secret }
    );
    logActivity({
      type: "join",
      title: "Joined P2P workspace",
      description: `Connected to shared workspace for real-time collaboration.`,
      actor: payload.member?.name || "CodeCollab",
      actorInitials: payload.member?.initials || "CB",
    });
    return result;
  });

  safeHandle("p2p:leave", async (_event, payload) => {
    if (payload?.projectId) {
      return p2pService.leaveProject(payload.projectId);
    }
    // Legacy: leave all if no projectId provided
    return p2pService.leaveAllProjects();
  });

  safeHandle("p2p:status", async (_event, payload) => {
    return p2pService.getStatus(payload?.projectId);
  });

  safeHandle("p2p:peers", async (_event, payload) => {
    return p2pService.getConnectedPeers(payload?.projectId);
  });

  safeHandle("p2p:joinedProjects", async () => {
    return p2pService.getJoinedProjectIds();
  });

  safeHandle("p2p:broadcastChatToken", async (_event, payload) => {
    p2pService.broadcastChatToken(payload.projectId, payload.conversationId, payload.token, payload.scope);
    return { sent: true };
  });

  safeHandle("p2p:getActivePeerStreams", async (_event, payload) => {
    if (typeof p2pService.getActivePeerStreams === "function") {
      return p2pService.getActivePeerStreams(payload?.projectId);
    }
    return {};
  });

  safeHandle("p2p:broadcastChatMessage", async (_event, payload) => {
    p2pService.broadcastChatMessage(payload.projectId, payload.conversationId, payload.message, payload.scope);
    return { sent: true };
  });

  safeHandle("p2p:broadcastStateChange", async (_event, payload) => {
    p2pService.broadcastStateChange(payload.projectId, payload.category, payload.id, payload.data);
    return { sent: true };
  });

  safeHandle("p2p:generateInvite", async (_event, payload) => {
    // Ensure the project has a persistent P2P secret so invitees share an
    // authenticated channel with us. Without this, anyone who learns the
    // (possibly public) GitHub URL could join the P2P room.
    let secret = null;
    try {
      await settingsService.atomicUpdate((s) => {
        const idx = s.projects?.findIndex(p =>
          p.id === payload.projectId || p.remoteUrl === payload.remoteUrl || p.id === s.activeProjectId
        );
        if (idx >= 0) {
          if (!s.projects[idx].p2pSecret && typeof p2pService.generateProjectSecret === "function") {
            s.projects[idx].p2pSecret = p2pService.generateProjectSecret();
          }
          secret = s.projects[idx].p2pSecret || null;
        }
        return s;
      });
    } catch (err) {
      console.warn("[generateInvite] Could not persist project secret:", err?.message);
    }

    const code = p2pService.generateInviteCode(
      payload.remoteUrl,
      payload.projectName,
      secret,
      { ttlMs: typeof payload.ttlMs === "number" ? payload.ttlMs : undefined }
    );

    // v3: every session is authenticated by construction (p2p:join auto-creates
    // and persists a secret if one is missing). The owner is therefore already
    // on the same v3 topic the invitee will derive — no upgrade dance needed.

    // Export the project plan to .codebuddy/plan.json so the joining machine gets it
    try {
      const settings = await settingsService.readSettings();
      const activeProject = settings.projects?.find(p => p.id === settings.activeProjectId);
      if (activeProject?.dashboard?.plan && activeProject.repoPath) {
        const planExport = {
          plan: activeProject.dashboard.plan,
          taskThreads: activeProject.dashboard.taskThreads || [],
          projectManagerContextMarkdown: activeProject.dashboard.projectManagerContextMarkdown || "",
          exportedAt: new Date().toISOString(),
          exportedBy: activeProject.creatorName || "Unknown",
        };
        await sharedStateService.writeSharedFile(activeProject.repoPath, "plan.json", JSON.stringify(planExport, null, 2));

        // Commit and push the plan so the cloning machine gets it
        // Push to both current branch AND main (clone defaults to main)
        await processService.run(
          `git add .codebuddy/plan.json && git commit -m "chore(codebuddy): sync project plan for collaborators" --no-verify`,
          activeProject.repoPath,
          { timeoutMs: 30000 }
        );
        await processService.run(`git push`, activeProject.repoPath, { timeoutMs: 60000 });
        // Also push plan to main so the clone (which defaults to main) gets it
        try {
          const { execSync } = require("child_process");
          const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
          const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: activeProject.repoPath, encoding: "utf8", env: gitEnv }).trim();
          if (currentBranch === "codebuddy-build") {
            execSync("git checkout main", { cwd: activeProject.repoPath, encoding: "utf8", env: gitEnv });
            execSync("git merge codebuddy-build --no-edit", { cwd: activeProject.repoPath, encoding: "utf8", env: gitEnv });
            execSync("git push origin main", { cwd: activeProject.repoPath, encoding: "utf8", env: gitEnv, timeout: 60000 });
            execSync("git checkout codebuddy-build", { cwd: activeProject.repoPath, encoding: "utf8", env: gitEnv });
          }
        } catch (mainErr) {
          console.warn("[generateInvite] Main merge warning:", mainErr?.message);
        }
        console.log(`[generateInvite] plan exported & pushed (${activeProject.dashboard.plan.subprojects?.length || 0} subprojects)`);
      }
    } catch (err) {
      // Don't fail the invite if plan export fails — just log
      console.warn("[generateInvite] Plan export warning:", err.message);
    }

    return { code };
  });

  safeHandle("p2p:decodeInvite", async (_event, payload) => {
    return p2pService.decodeInviteCode(payload.code);
  });

  // Rotate a project's P2P shared secret. Use this when removing a teammate:
  // disconnects all current peers and rejoins under a fresh secret. Existing
  // outstanding invites become invalid — the owner must regenerate and
  // re-share invites with remaining trusted collaborators.
  //
  // OWNER-ONLY: This action is restricted to the project owner — the install
  // that originally created the project. Invitees (whose project record is
  // tagged with `joinedViaInvite: true` by p2p:acceptInvite) cannot rotate
  // the key from their machine. The check is local — it prevents accidental
  // and casual misuse, not a determined attacker who can edit settings.json.
  // Combined with the HMAC-authenticated wire protocol, this is sufficient:
  // even if an invitee bypassed the local guard, the owner's session would
  // ignore their rotate (it's a local IPC, not a peer message).
  safeHandle("p2p:rotateSecret", async (_event, payload) => {
    if (!payload?.projectId) throw new Error("projectId is required.");
    if (typeof p2pService.rotateProjectSecret !== "function") {
      throw new Error("rotateProjectSecret unavailable.");
    }
    // Owner check
    try {
      const settings = await settingsService.readSettings();
      const proj = settings.projects?.find(p => p.id === payload.projectId);
      if (!proj) throw new Error("Project not found.");
      if (proj.joinedViaInvite) {
        throw new Error("Only the project owner can rotate the P2P key. Ask the project owner to rotate it for you.");
      }
    } catch (err) {
      // Re-throw so the renderer surfaces it as a normal error (not a silent no-op).
      throw err;
    }
    const { rotated, secret: newSecret } = await p2pService.rotateProjectSecret(payload.projectId);
    // Persist the new secret to settings AND publish it to the repo's
    // codebuddy-build branch so other collaborators pick it up on their
    // next pull.
    try {
      await settingsService.atomicUpdate((s) => {
        const idx = s.projects?.findIndex(p => p.id === payload.projectId);
        if (idx >= 0) s.projects[idx].p2pSecret = newSecret;
        return s;
      });
    } catch (err) {
      console.warn("[p2p:rotateSecret] Could not persist new secret:", err?.message);
    }
    try {
      const settings = await settingsService.readSettings();
      const proj = settings.projects?.find(p => p.id === payload.projectId);
      if (proj?.repoPath) {
        await writeRepoSecret(proj.repoPath, newSecret);
        await commitAndPushSecret(proj.repoPath);
      }
    } catch (err) {
      console.warn("[p2p:rotateSecret] Could not publish new secret to repo:", err?.message);
    }
    logActivity({
      type: "security",
      title: "Rotated P2P key",
      description: "All peers were disconnected. Existing invite codes are now invalid.",
      actor: "CodeCollab",
      actorInitials: "CB",
    });
    return { rotated, projectId: payload.projectId };
  });

  // Lightweight helper so the renderer can hide owner-only UI (e.g. the
  // "Rotate P2P key" button in Settings → Danger zone) without having to
  // read settings directly. Returns `{ isOwner: boolean }`.
  safeHandle("p2p:isOwner", async (_event, payload) => {
    if (!payload?.projectId) return { isOwner: false };
    try {
      const settings = await settingsService.readSettings();
      const proj = settings.projects?.find(p => p.id === payload.projectId);
      if (!proj) return { isOwner: false };
      return { isOwner: !proj.joinedViaInvite };
    } catch {
      return { isOwner: false };
    }
  });

  safeHandle("p2p:acceptInvite", async (_event, payload) => {
    console.log(`[acceptInvite] START member=${payload.memberName || "(anonymous)"}`);

    // Decode invite → clone repo → create project → join P2P
    const { remoteUrl, projectName, secret: inviteSecret } = p2pService.decodeInviteCode(payload.code);

    // Determine target directory for the clone
    const settings = await settingsService.readSettings();
    const rootDir = settings.projectDefaults?.rootDirectory || app.getPath("documents");
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const targetPath = payload.targetDirectory
      ? require("path").resolve(payload.targetDirectory)
      : require("path").join(rootDir, safeName);

    const fs = require("fs");

    // Check if target already has a valid git clone; if the folder exists but has no .git, remove it and re-clone
    const targetGitDir = require("path").join(targetPath, ".git");
    if (fs.existsSync(targetPath) && !fs.existsSync(targetGitDir)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    if (!fs.existsSync(targetPath)) {
      console.log(`[acceptInvite] cloning "${projectName}" → ${targetPath}`);
      // Clone the remote repo. ALWAYS use runProgram (argv array) to avoid
      // any shell interpretation of the remote URL (which originates from an
      // untrusted invite code). decodeInviteCode also rejects URLs containing
      // shell metacharacters, but we treat that as defense-in-depth.
      if (typeof processService.runProgram !== "function") {
        throw new Error("processService.runProgram is required for safe git clone (refusing to fall back to shell).");
      }
      const result = await processService.runProgram(
        "git",
        ["clone", remoteUrl, targetPath],
        rootDir,
        { timeoutMs: 120000 }
      );
      if (result.exitCode !== 0) {
        console.error(`[acceptInvite] clone failed (exit=${result.exitCode}):`, result.stderr?.slice(0, 300));
        const stderr = (result.stderr || "").toString();
        // GitHub returns 404 ("Repository not found") for unauthorized access
        // to a private repo. If the user has no `gh` auth on this machine,
        // surface a friendlier message so they don't think the repo is gone.
        if (/Repository not found/i.test(stderr) || /authentication failed/i.test(stderr) || /could not read Username/i.test(stderr)) {
          throw new Error(
            `Could not clone ${remoteUrl}. This usually means GitHub authentication is not set up on this machine. ` +
            `Run \`gh auth login\` (or sign in to GitHub Desktop) and try the invite again. ` +
            `If the repo is genuinely missing, ask the project owner to confirm the URL.`
          );
        }
        throw new Error(`Clone failed: ${stderr || "Unknown error"}`);
      }

      // Configure credential helper so git push/pull can authenticate
      try {
        const { execSync } = require("child_process");
        execSync('git config credential.helper "!gh auth git-credential"', { cwd: targetPath, encoding: "utf8", stdio: "pipe" });
      } catch { /* gh may not be available */ }

      // Switch to codebuddy-build branch (created by the project owner)
      try {
        const { execSync } = require("child_process");
        const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
        execSync("git switch codebuddy-build", { cwd: targetPath, encoding: "utf8", env: gitEnv });
      } catch {
        // Branch might not exist yet — create it
        try {
          const { execSync } = require("child_process");
          const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
          execSync("git switch -c codebuddy-build", { cwd: targetPath, encoding: "utf8", env: gitEnv });
        } catch (branchErr) {
          console.warn("[acceptInvite] codebuddy-build branch warning:", branchErr?.message);
        }
      }
    }

    // Create a CodeCollab project pointing at the cloned repo
    const project = await projectService.createProject({
      name: projectName,
      description: `Joined via invite from ${remoteUrl}`,
      importExistingPath: targetPath,
      createGithubRepo: false,
    });

    // Load plan from .codebuddy/plan.json if it exists (synced from the project owner)
    try {
      const planFile = await sharedStateService.readSharedFile(targetPath, "plan.json");
      if (planFile?.exists && planFile.content) {
        const planData = JSON.parse(planFile.content);
        if (planData.plan) {
          // Merge the synced plan into the new project's dashboard
          const currentSettings = await settingsService.readSettings();
          const projectIndex = currentSettings.projects?.findIndex(p => p.id === project.id);
          if (projectIndex >= 0 && currentSettings.projects[projectIndex].dashboard) {
            currentSettings.projects[projectIndex].dashboard.plan = planData.plan;
            if (planData.taskThreads?.length) {
              currentSettings.projects[projectIndex].dashboard.taskThreads = planData.taskThreads;
            }
            if (planData.projectManagerContextMarkdown) {
              currentSettings.projects[projectIndex].dashboard.projectManagerContextMarkdown = planData.projectManagerContextMarkdown;
            }
            await settingsService.writeSettings(currentSettings);
            const subCount = planData.plan.subprojects?.length || 0;
            const taskCount = planData.plan.subprojects?.reduce((n, sp) => n + (sp.tasks?.length || 0), 0) || 0;
            console.log(`[acceptInvite] plan imported: ${subCount} subprojects, ${taskCount} tasks`);
          }
        }
      }
    } catch (err) {
      console.warn("[acceptInvite] Plan import warning:", err.message);
    }

    // Initialize shared state directory (.codebuddy/)
    await sharedStateService.ensureSharedDir(targetPath);

    // Immediately commit any scaffolding changes so the Files tab doesn't show them as "Changed"
    try {
      const { execSync } = require("child_process");
      const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
      const opts = { cwd: targetPath, encoding: "utf8", env: gitEnv, stdio: "pipe", timeout: 10000 };

      // Ensure git identity is configured before committing (prevent "Author identity unknown")
      let hasName = false, hasEmail = false;
      try { hasName = !!execSync("git config user.name", opts).trim(); } catch { /* not set */ }
      try { hasEmail = !!execSync("git config user.email", opts).trim(); } catch { /* not set */ }
      if (!hasName || !hasEmail) {
        let name = "CodeCollab";
        let email = "codecollab@local.invalid";
        try {
          const login = execSync("gh api user --jq .login", opts).trim();
          if (login) { name = login; email = `${login}@users.noreply.github.com`; }
        } catch { /* gh not available */ }
        // Use execFileSync with argv array — prevents shell injection if the
        // name/email derived from `gh api user` ever contains shell metacharacters.
        const { execFileSync } = require("child_process");
        const fileOpts = { cwd: targetPath, encoding: "utf8", env: gitEnv, stdio: "pipe", timeout: 10000, windowsHide: true };
        if (!hasName) try { execFileSync("git", ["config", "user.name", name], fileOpts); } catch { /* ignore */ }
        if (!hasEmail) try { execFileSync("git", ["config", "user.email", email], fileOpts); } catch { /* ignore */ }
      }

      const status = execSync("git status --porcelain", { cwd: targetPath, encoding: "utf8", env: gitEnv }).trim();
      if (status) {
        execSync("git add -A", { cwd: targetPath, encoding: "utf8", env: gitEnv });
        execSync('git commit -m "auto: initialize shared workspace" --no-verify', { cwd: targetPath, encoding: "utf8", env: gitEnv });
        execSync("git push origin codebuddy-build", { cwd: targetPath, encoding: "utf8", env: gitEnv, timeout: 60000 });
      }
    } catch (commitErr) {
      console.warn("[acceptInvite] Scaffolding commit warning:", commitErr?.message);
    }

    // Auto-join P2P
    const member = {
      name: payload.memberName || "Friend",
      initials: (payload.memberName || "FR").slice(0, 2).toUpperCase(),
      role: "Member",
    };
    // Resolve the effective P2P secret: the codebuddy-build branch's
    // .codebuddy/p2p-secret file is the source of truth (in case the owner
    // rotated since this invite was minted). Fall back to the invite's
    // secret if the repo doesn't have one yet (legacy projects, or the very
    // first invitee joining before the owner has published the file).
    let effectiveSecret = inviteSecret;
    let secretSource = "invite";
    try {
      const repoSecret = await readRepoSecret(targetPath);
      if (repoSecret) {
        effectiveSecret = repoSecret;
        secretSource = "repo";
      } else if (inviteSecret) {
        // Publish the invite's secret to the repo so future joiners can find it.
        try {
          await writeRepoSecret(targetPath, inviteSecret);
          await commitAndPushSecret(targetPath);
          secretSource = "invite (published to repo)";
        } catch (err) {
          console.warn("[acceptInvite] Could not publish invite secret to repo:", err?.message);
        }
      }
    } catch { /* fall through with inviteSecret */ }
    console.log(`[acceptInvite] secret source=${secretSource}`);

    // Persist the effective secret on the new project record. Also flag
    // this project as `joinedViaInvite` so destructive actions like
    // rotating the P2P secret are restricted to the project owner.
    try {
      await settingsService.atomicUpdate((s) => {
        const idx = s.projects?.findIndex(p => p.id === project.id);
        if (idx >= 0) {
          if (effectiveSecret) s.projects[idx].p2pSecret = effectiveSecret;
          s.projects[idx].joinedViaInvite = true;
          s.projects[idx].invitedFromUrl = remoteUrl;
        }
        return s;
      });
    } catch (err) {
      console.warn("[acceptInvite] Could not persist invite metadata:", err?.message);
    }

    const p2pResult = await p2pService.joinProject(project.id, targetPath, remoteUrl, member, { secret: effectiveSecret });

    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "join",
      title: "Joined shared project",
      description: `Joined "${projectName}" via invite code.`,
      actor: member.name,
      actorInitials: member.initials,
    });

    console.log(`[acceptInvite] DONE project=${project.id?.slice(0,8)} p2p=${p2pResult?.joined ? "joined" : "failed"}`);
    return { project, p2p: p2pResult };
  });

  safeHandle("activity:list", async () => {
    return activityService.listEvents();
  });

  // ---------- File Watcher ----------

  safeHandle("fileWatcher:start", async (_event, payload) => {
    if (!fileWatcherService) return { watching: false, error: "File watcher not available" };
    return fileWatcherService.startWatching(payload.repoPath);
  });

  safeHandle("fileWatcher:stop", async () => {
    if (!fileWatcherService) return { watching: false };
    return fileWatcherService.stopWatching();
  });

  safeHandle("fileWatcher:status", async () => {
    if (!fileWatcherService) return { watching: false, repoPath: null, paused: false, syncing: false };
    return fileWatcherService.getStatus();
  });

  safeHandle("fileWatcher:triggerSync", async () => {
    if (!fileWatcherService) return { error: "File watcher not available" };
    await fileWatcherService.doAutoSync();
    return { triggered: true };
  });

  safeHandle("fileWatcher:pushToMain", async (_event, payload) => {
    if (!fileWatcherService) return { success: false, message: "File watcher not available" };
    const result = await fileWatcherService.pushToMain(payload.repoPath);
    if (result.success) {
      logActivity({
        type: "deploy",
        title: "Pushed to main",
        description: "Merged codebuddy-build → main and pushed to GitHub.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
    }
    return result;
  });

  console.log("[IPC] All handlers registered successfully.");
  projectService.__setEventSender?.(sendEvent);
  processService.__setEventSender(sendEvent);
  activityService.__setEventSender(sendEvent);
  p2pService.__setEventSender(sendEvent);

  processService.__setActivityLogger?.((kind, payload) => {
    if (kind === "started") {
      logActivity({
        type: "build",
        title: "Process started",
        description: payload.command ? `Started ${payload.command}.` : "Started a local process.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
    }

    if (kind === "completed") {
      logActivity({
        type: payload.exitCode === 0 ? "status" : "review",
        title: payload.exitCode === 0 ? "Process completed" : "Process finished with errors",
        description: payload.command ? `${payload.command} exited with code ${payload.exitCode}.` : `A process exited with code ${payload.exitCode}.`,
        actor: "CodeCollab",
        actorInitials: "CB",
      });
    }

    if (kind === "error") {
      logActivity({
        type: "review",
        title: "Process error",
        description: payload.message ?? "A local process failed.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
    }

    if (kind === "cancelled") {
      logActivity({
        type: "status",
        title: "Process cancelled",
        description: "A local process was stopped.",
        actor: "CodeCollab",
        actorInitials: "CB",
      });
    }
  });
}

module.exports = {
  registerIpcHandlers,
};
