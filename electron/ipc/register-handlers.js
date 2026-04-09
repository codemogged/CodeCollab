const { dialog, shell, ipcMain } = require("electron");

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

function registerIpcHandlers({ app, mainWindow, processService, repoService, settingsService, toolingService, activityService, projectService, sharedStateService, p2pService, fileWatcherService }) {
  const BUILD_TAG = "copilot-fix-v21";
  console.log(`[IPC] Registering all handlers... (build: ${BUILD_TAG})`);
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
    if (category === "plan" && data?.plan) {
      try {
        const result = await settingsService.atomicUpdate((settings) => {
          // Use the projectId from the P2P session to find the right project
          let projectIndex = settings.projects?.findIndex(p => p.id === projectId);

          // Fallback: try matching by sender's ID
          if (projectIndex < 0) {
            projectIndex = settings.projects?.findIndex(p => p.id === id);
          }

          console.log(`[P2P-apply] category=${category} projectId=${projectId} senderId=${id} matchIndex=${projectIndex} peerName=${peerName}`);

          if (projectIndex >= 0 && settings.projects[projectIndex].dashboard) {
            const subCount = data.plan?.subprojects?.length || 0;
            const taskCount = data.plan?.subprojects?.reduce((n, sp) => n + (sp.tasks?.length || 0), 0) || 0;
            console.log(`[P2P-apply] Applying plan: ${subCount} subprojects, ${taskCount} tasks from ${peerName}`);

            // Last-write-wins: accept incoming task statuses as-is (peer intended the change)
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
            console.log(`[P2P-apply] SUCCESS — wrote to settings and sent settings:changed`);
            return { ...settings };
          } else {
            console.warn(`[P2P-apply] SKIP — no matching project found (index=${projectIndex})`);
            return undefined; // no-op
          }
        });
        if (result) sendEvent("settings:changed", result);
      } catch (err) {
        console.warn("[P2P-apply] ERROR:", err?.message);
      }
    } else if (category === "tasks" && data?.taskId && data?.status) {
      // ── Task status sync: update task status on this machine ──
      try {
        const result = await settingsService.atomicUpdate((settings) => {
          let projectIndex = settings.projects?.findIndex(p => p.id === projectId);
          if (projectIndex < 0) projectIndex = settings.projects?.findIndex(p => p.id === data.projectId);

          if (projectIndex >= 0 && settings.projects[projectIndex].dashboard?.plan?.subprojects) {
            const subprojects = settings.projects[projectIndex].dashboard.plan.subprojects;
            let updated = false;
            for (const sp of subprojects) {
              const task = sp.tasks?.find(t => t.id === data.taskId);
              if (task) {
                console.log(`[P2P-apply] Task status: "${task.title}" ${task.status} → ${data.status} (from ${peerName})`);
                task.status = data.status;
                updated = true;
                break;
              }
            }
            if (updated) {
              console.log(`[P2P-apply] Task status sync SUCCESS for ${data.taskId}`);
              return { ...settings };
            }
          }
          return undefined; // no-op
        });
        if (result) sendEvent("settings:changed", result);
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
              dashboard.conversation = [...(dashboard.conversation || []), ...taggedMessages];
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
              thread.messages = [...(thread.messages || []), ...taggedMessages];
            } else if (msgType === "solo-chat" && data.sessionId) {
              let session = dashboard.soloSessions?.find(s => s.id === data.sessionId);
              if (!session) {
                session = { id: data.sessionId, title: `Peer session`, messages: [] };
                if (!dashboard.soloSessions) dashboard.soloSessions = [];
                dashboard.soloSessions.push(session);
              }
              session.messages = [...(session.messages || []), ...taggedMessages];
            }

            console.log(`[P2P-apply] Conversation sync: appended ${taggedMessages.length} messages (${msgType}) from ${peerName}`);
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
              console.log(`[P2P-apply] Thread sync from ${peerName}: merged ${data.taskThreads?.length || 0} threads, ${data.conversation?.length || 0} PM messages, ${data.soloSessions?.length || 0} freestyle sessions`);
              return { ...settings };
            }
          }
          return undefined; // no-op
        });
        if (result) sendEvent("settings:changed", result);
      } catch (err) {
        console.warn("[P2P-apply] Thread sync error:", err?.message);
      }
    } else if (category === "new-commits") {
      // Peer pushed new commits to codebuddy-build — auto-pull them
      try {
        const settings = await settingsService.readSettings();
        const project = settings.projects?.find(p => p.id === projectId);
        if (project?.repoPath && fileWatcherService) {
          console.log(`[P2P-apply] Received new-commits from ${peerName} for project ${projectId.slice(0, 8)} — auto-pulling codebuddy-build...`);
          const pullResult = await fileWatcherService.autoPull(project.repoPath);
          console.log(`[P2P-apply] Auto-pull result: ${JSON.stringify(pullResult)}`);
          sendEvent("fileWatcher:peerSync", { peerName, branch: data?.branch, pullResult });
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
            console.log(`[P2P-apply] Fetched main branch from ${peerName}'s push.`);
          } catch {
            // fetch origin main:main fails when main is checked out — fetch the remote ref first
            execSync("git fetch origin main", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
            try {
              const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", env: gitEnv }).trim();
              if (currentBranch === "main") {
                // Main is checked out — fast-forward merge so the working tree updates
                execSync("git merge --ff-only origin/main", { cwd, encoding: "utf8", env: gitEnv, timeout: 60000 });
                console.log(`[P2P-apply] Fast-forward merged origin/main into checked-out main from ${peerName}'s push.`);
              } else {
                console.log(`[P2P-apply] Fetched origin/main ref from ${peerName}'s push (on ${currentBranch}, skipping merge).`);
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
          // Fetch the full snapshot from the peer's shared state (it was committed + pushed via auto-sync)
          // For immediate availability before git sync, store the signal metadata as a lightweight marker
          const markerData = {
            ...data,
            receivedAt: new Date().toISOString(),
            fromPeer: peerName,
          };
          await sharedStateService.writeSharedFile(
            activeProject.repoPath,
            `agents/context/${data.snapshotId}.signal.json`,
            JSON.stringify(markerData, null, 2)
          );
          console.log(`[P2P-apply] Agent context signal received: ${data.snapshotId} from ${peerName} (${data.messageCount || 0} messages)`);
          sendEvent("agentContext:peerUpdated", { peerName, snapshotId: data.snapshotId, scope: data.scope, taskTitle: data.taskTitle });
        }
      } catch (err) {
        console.warn("[P2P-apply] Agent context signal error:", err?.message);
      }
    } else {
      console.log(`[P2P-apply] Non-plan state change: category=${category} id=${id} from ${peerName}`);
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

  safeHandle("system:openExternal", async (_event, url) => {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      throw new Error("Only http and https URLs are allowed.");
    }

    await shell.openExternal(url);
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
      actor: "CodeBuddy",
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

  safeHandle("repo:writeFileContent", async (_event, payload) => {
    const file = await repoService.writeFileContent(payload.targetPath, payload.content);
    logActivity({
      type: "status",
      title: "File updated",
      description: `Saved ${file.path}.`,
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
      actorInitials: "CB",
    });
    return inspection;
  });

  safeHandle("repo:checkoutBranch", async (_event, payload) => {
    const inspection = await repoService.checkoutBranch(payload.repoPath, payload.branchName, payload.create ?? false);
    logActivity({
      type: "status",
      title: payload.create ? "Branch created" : "Branch switched",
      description: `${payload.create ? "Created and switched to" : "Switched to"} ${inspection.branch}.`,
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
      actorInitials: "CB",
    });
    return result;
  });

  safeHandle("settings:get", async () => {
    return settingsService.readSettings();
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
      actor: "CodeBuddy",
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
        ? `Removed a project from CodeBuddy and deleted ${deleteTargets.join(" and ")}.`
        : "Removed a project from CodeBuddy. Local files and GitHub were left untouched.",
      actor: "CodeBuddy",
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
    const settings = await settingsService.readSettings();
    const project = settings.projects?.find(p => p.id === projectId);
    if (!project) return { imported: false, reason: "project not found" };
    if (project.dashboard?.plan) return { imported: false, reason: "plan already exists" };
    if (!project.repoPath) return { imported: false, reason: "no repoPath" };

    try {
      const planFile = await sharedStateService.readSharedFile(project.repoPath, "plan.json");
      if (!planFile?.exists || !planFile.content) {
        console.log("[importSyncedPlan] No plan.json found in .codebuddy/");
        return { imported: false, reason: "no plan.json" };
      }

      const planData = JSON.parse(planFile.content);
      if (!planData.plan) return { imported: false, reason: "plan.json has no plan data" };

      console.log("[importSyncedPlan] Found plan with", planData.plan.subprojects?.length || 0, "subprojects");
      const projectIndex = settings.projects.findIndex(p => p.id === projectId);
      if (projectIndex < 0) return { imported: false, reason: "project index not found" };

      settings.projects[projectIndex].dashboard.plan = planData.plan;
      if (planData.taskThreads?.length) {
        settings.projects[projectIndex].dashboard.taskThreads = planData.taskThreads;
      }
      if (planData.projectManagerContextMarkdown) {
        settings.projects[projectIndex].dashboard.projectManagerContextMarkdown = planData.projectManagerContextMarkdown;
      }
      await settingsService.writeSettings(settings);
      sendEvent("settings:changed", settings);

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
    const addLog = (msg) => { console.log("[syncWorkspace]", msg); log.push(msg); };
    addLog("Starting workspace sync for project " + projectId);

    try {
      const settings = await settingsService.readSettings();
      const project = settings.projects?.find(p => p.id === projectId);
      if (!project) { addLog("ERROR: Project not found in settings"); return { success: false, log }; }
      if (!project.repoPath) { addLog("ERROR: No repoPath on project"); return { success: false, log }; }
      addLog("Project: " + project.name + " at " + project.repoPath);

      // Step 1: Git pull to get latest changes
      addLog("Step 1: Pulling latest from remote...");
      try {
        const remoteUrl = await repoService.getRemoteUrl(project.repoPath);
        addLog("  Remote URL: " + (remoteUrl || "NONE"));
        if (remoteUrl) {
          // Stash any uncommitted changes so pull --rebase doesn't fail
          const { execSync } = require("child_process");
          let didStash = false;
          try {
            const stashOut = execSync("git stash", { cwd: project.repoPath, encoding: "utf8" }).trim();
            didStash = !stashOut.includes("No local changes");
            addLog("  Stash: " + stashOut);
          } catch (stashErr) {
            addLog("  Stash warning: " + stashErr.message);
          }

          const pullResult = await repoService.pullFromRemote(project.repoPath, {});
          addLog("  Pull result: branch=" + pullResult?.branch + " commits=" + pullResult?.recentCommits?.length);

          // Pop stash if we stashed something
          if (didStash) {
            try {
              const popOut = execSync("git stash pop", { cwd: project.repoPath, encoding: "utf8" }).trim();
              addLog("  Stash pop: " + popOut);
            } catch (popErr) {
              addLog("  Stash pop warning: " + popErr.message);
            }
          }
        } else {
          addLog("  No remote configured — skipping pull");
        }
      } catch (pullErr) {
        addLog("  Pull warning: " + pullErr.message);
        // Don't fail — local .codebuddy might still have the plan from clone
      }

      // Step 2: Check for .codebuddy/plan.json
      addLog("Step 2: Looking for .codebuddy/plan.json...");
      const fs = require("fs");
      const path = require("path");
      const planPath = path.join(project.repoPath, ".codebuddy", "plan.json");
      addLog("  Plan path: " + planPath);
      addLog("  Exists: " + fs.existsSync(planPath));

      let planFile;
      try {
        planFile = await sharedStateService.readSharedFile(project.repoPath, "plan.json");
        addLog("  readSharedFile result: exists=" + planFile?.exists + " contentLength=" + (planFile?.content?.length || 0));
      } catch (err) {
        addLog("  readSharedFile error: " + err.message);
        return { success: false, log };
      }

      if (!planFile?.exists || !planFile.content) {
        addLog("No plan.json found — nothing to import.");

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
        planData = JSON.parse(planFile.content);
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

        // Last-write-wins: accept incoming task statuses as-is (git is the latest pushed version)

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

      return { success: true, subprojects: subCount, tasks: taskCount, log };
    } catch (err) {
      addLog("UNHANDLED ERROR: " + err.message);
      addLog("  Stack: " + err.stack?.split("\n").slice(0, 3).join(" | "));
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
    if (project.repoPath && !skipGitPush) {
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
          const { execSync } = require("child_process");
          try {
            const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
            execSync("git add .codebuddy/plan.json", { cwd: project.repoPath, encoding: "utf8", env: gitEnv });
            execSync('git commit -m "sync: update plan" --allow-empty', { cwd: project.repoPath, encoding: "utf8", env: gitEnv });
            execSync("git push origin HEAD", { cwd: project.repoPath, encoding: "utf8", env: gitEnv });
          } catch (gitErr) {
            console.warn("[savePlan] Git push failed:", gitErr.message);
          }
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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

  safeHandle("project:forceResetAgent", async (_event, payload) => {
    return projectService.forceResetAgent(payload?.repoPath);
  });

  safeHandle("project:getActiveRequest", async () => {
    return projectService.getActiveRequest();
  });

  safeHandle("project:launchDevServer", async (_event, payload) => {
    const result = await projectService.launchDevServer(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "build",
      title: "Dev server launched",
      description: `Agent analyzed and launched the dev server for the project.`,
      actor: "CodeBuddy",
      actorInitials: "CB",
    });
    return result;
  });

  safeHandle("project:restoreCheckpoint", async (_event, payload) => {
    const project = await projectService.restoreCheckpoint(payload.projectId, payload.checkpointId);
    sendEvent("settings:changed", await settingsService.readSettings());
    return project;
  });

  safeHandle("tools:listStatus", async () => {
    return toolingService.getToolStatus();
  });

  safeHandle("tools:runCopilotPrompt", async (_event, payload) => {
    logActivity({
      type: "comment",
      title: "Copilot prompt started",
      description: `Running GitHub Copilot CLI in ${payload.cwd}.`,
      actor: "CodeBuddy",
      actorInitials: "CB",
    });
    return toolingService.runCopilotPrompt(payload);
  });

  safeHandle("tools:installCopilot", async () => {
    return toolingService.installCopilot();
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
        actor: "CodeBuddy",
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
        actor: "CodeBuddy",
        actorInitials: "CB",
      });
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
        actor: "CodeBuddy",
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
      actor: "CodeBuddy",
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
    const result = await p2pService.joinProject(payload.projectId, payload.repoPath, payload.remoteUrl, payload.member);
    logActivity({
      type: "join",
      title: "Joined P2P workspace",
      description: `Connected to shared workspace for real-time collaboration.`,
      actor: payload.member?.name || "CodeBuddy",
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
    const code = p2pService.generateInviteCode(payload.remoteUrl, payload.projectName);

    // Export the project plan to .codebuddy/plan.json so the joining machine gets it
    try {
      const settings = await settingsService.readSettings();
      const activeProject = settings.projects?.find(p => p.id === settings.activeProjectId);
      if (activeProject?.dashboard?.plan && activeProject.repoPath) {
        console.log("[generateInvite] Exporting plan to .codebuddy/plan.json...");
        const planExport = {
          plan: activeProject.dashboard.plan,
          taskThreads: activeProject.dashboard.taskThreads || [],
          projectManagerContextMarkdown: activeProject.dashboard.projectManagerContextMarkdown || "",
          exportedAt: new Date().toISOString(),
          exportedBy: activeProject.creatorName || "Unknown",
        };
        await sharedStateService.writeSharedFile(activeProject.repoPath, "plan.json", JSON.stringify(planExport, null, 2));
        console.log("[generateInvite] Plan exported. Committing and pushing...");

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
            console.log("[generateInvite] Also merged and pushed to main for clone.");
          }
        } catch (mainErr) {
          console.warn("[generateInvite] Main merge warning:", mainErr?.message);
        }
        console.log("[generateInvite] Plan pushed to GitHub.");
      } else {
        console.log("[generateInvite] No plan to export or no repoPath.");
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

  safeHandle("p2p:acceptInvite", async (_event, payload) => {
    console.log("[acceptInvite] Starting invite acceptance...");
    console.log("[acceptInvite] Payload:", JSON.stringify({ code: payload.code?.slice(0, 20) + "...", memberName: payload.memberName, targetDirectory: payload.targetDirectory }));

    // Decode invite → clone repo → create project → join P2P
    const { remoteUrl, projectName } = p2pService.decodeInviteCode(payload.code);
    console.log("[acceptInvite] Decoded invite — remoteUrl:", remoteUrl, "projectName:", projectName);

    // Determine target directory for the clone
    const settings = await settingsService.readSettings();
    const rootDir = settings.projectDefaults?.rootDirectory || app.getPath("documents");
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const targetPath = payload.targetDirectory
      ? require("path").resolve(payload.targetDirectory)
      : require("path").join(rootDir, safeName);
    console.log("[acceptInvite] Target path:", targetPath);

    const fs = require("fs");

    // Check if target already has a valid git clone; if the folder exists but has no .git, remove it and re-clone
    const targetGitDir = require("path").join(targetPath, ".git");
    if (fs.existsSync(targetPath) && !fs.existsSync(targetGitDir)) {
      console.log("[acceptInvite] Target path exists but has no .git — removing stale folder and re-cloning.");
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    if (!fs.existsSync(targetPath)) {
      console.log("[acceptInvite] Cloning repo...");
      // Clone the remote repo
      const result = await processService.run(
        `git clone "${remoteUrl}" "${targetPath}"`, rootDir, { timeoutMs: 120000 }
      );
      console.log("[acceptInvite] Clone result — exitCode:", result.exitCode, "stderr:", result.stderr?.slice(0, 500));
      if (result.exitCode !== 0) {
        throw new Error(`Clone failed: ${result.stderr || "Unknown error"}`);
      }
      console.log("[acceptInvite] Clone succeeded.");

      // Configure credential helper so git push/pull can authenticate
      try {
        const { execSync } = require("child_process");
        execSync('git config credential.helper "!gh auth git-credential"', { cwd: targetPath, encoding: "utf8", stdio: "pipe" });
        console.log("[acceptInvite] Credential helper configured.");
      } catch { /* gh may not be available */ }

      // Switch to codebuddy-build branch (created by the project owner)
      try {
        const { execSync } = require("child_process");
        const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
        execSync("git switch codebuddy-build", { cwd: targetPath, encoding: "utf8", env: gitEnv });
        console.log("[acceptInvite] Switched to codebuddy-build branch.");
      } catch {
        // Branch might not exist yet — create it
        try {
          const { execSync } = require("child_process");
          const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
          execSync("git switch -c codebuddy-build", { cwd: targetPath, encoding: "utf8", env: gitEnv });
          console.log("[acceptInvite] Created codebuddy-build branch.");
        } catch (branchErr) {
          console.warn("[acceptInvite] codebuddy-build branch warning:", branchErr?.message);
        }
      }
    } else {
      console.log("[acceptInvite] Target path already exists, skipping clone.");
    }

    // Create a CodeBuddy project pointing at the cloned repo
    console.log("[acceptInvite] Creating project entry...");
    const project = await projectService.createProject({
      name: projectName,
      description: `Joined via invite from ${remoteUrl}`,
      importExistingPath: targetPath,
      createGithubRepo: false,
    });
    console.log("[acceptInvite] Project created:", project?.id || "no id");

    // Load plan from .codebuddy/plan.json if it exists (synced from the project owner)
    try {
      const planFile = await sharedStateService.readSharedFile(targetPath, "plan.json");
      if (planFile?.exists && planFile.content) {
        console.log("[acceptInvite] Found .codebuddy/plan.json — importing plan...");
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
            console.log("[acceptInvite] Plan imported successfully —", planData.plan.subprojects?.length || 0, "subprojects,", planData.plan.subprojects?.reduce((n, sp) => n + (sp.tasks?.length || 0), 0) || 0, "tasks");
          } else {
            console.log("[acceptInvite] Could not find project in settings to merge plan into.");
          }
        }
      } else {
        console.log("[acceptInvite] No plan.json found — project starts with empty plan.");
      }
    } catch (err) {
      console.warn("[acceptInvite] Plan import warning:", err.message);
    }

    // Initialize shared state directory (.codebuddy/)
    console.log("[acceptInvite] Initializing shared state...");
    await sharedStateService.ensureSharedDir(targetPath);
    console.log("[acceptInvite] Shared state initialized.");

    // Immediately commit any scaffolding changes so the Files tab doesn't show them as "Changed"
    try {
      const { execSync } = require("child_process");
      const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
      const status = execSync("git status --porcelain", { cwd: targetPath, encoding: "utf8", env: gitEnv }).trim();
      if (status) {
        execSync("git add -A", { cwd: targetPath, encoding: "utf8", env: gitEnv });
        execSync('git commit -m "auto: initialize shared workspace" --no-verify', { cwd: targetPath, encoding: "utf8", env: gitEnv });
        execSync("git push origin codebuddy-build", { cwd: targetPath, encoding: "utf8", env: gitEnv, timeout: 60000 });
        console.log("[acceptInvite] Committed and pushed scaffolding changes.");
      } else {
        console.log("[acceptInvite] No scaffolding changes to commit.");
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
    console.log("[acceptInvite] Joining P2P room as:", member.name);
    const p2pResult = await p2pService.joinProject(project.id, targetPath, remoteUrl, member);
    console.log("[acceptInvite] P2P join result:", JSON.stringify(p2pResult));

    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "join",
      title: "Joined shared project",
      description: `Joined "${projectName}" via invite code.`,
      actor: member.name,
      actorInitials: member.initials,
    });

    console.log("[acceptInvite] Done! Returning project + p2p result.");
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
        actor: "CodeBuddy",
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
        actor: "CodeBuddy",
        actorInitials: "CB",
      });
    }

    if (kind === "completed") {
      logActivity({
        type: payload.exitCode === 0 ? "status" : "review",
        title: payload.exitCode === 0 ? "Process completed" : "Process finished with errors",
        description: payload.command ? `${payload.command} exited with code ${payload.exitCode}.` : `A process exited with code ${payload.exitCode}.`,
        actor: "CodeBuddy",
        actorInitials: "CB",
      });
    }

    if (kind === "error") {
      logActivity({
        type: "review",
        title: "Process error",
        description: payload.message ?? "A local process failed.",
        actor: "CodeBuddy",
        actorInitials: "CB",
      });
    }

    if (kind === "cancelled") {
      logActivity({
        type: "status",
        title: "Process cancelled",
        description: "A local process was stopped.",
        actor: "CodeBuddy",
        actorInitials: "CB",
      });
    }
  });
}

module.exports = {
  registerIpcHandlers,
};
