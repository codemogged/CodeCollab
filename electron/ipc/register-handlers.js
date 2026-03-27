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

function registerIpcHandlers({ app, mainWindow, processService, repoService, settingsService, toolingService, activityService, projectService }) {
  console.log("[IPC] Registering all handlers...");
  const sendEvent = (channel, payload) => {
    const window = mainWindow();

    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  const logActivity = (event) => {
    activityService.addEvent(event);
  };

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

  safeHandle("settings:get", async () => {
    return settingsService.readSettings();
  });

  safeHandle("settings:update", async (_event, patch) => {
    const nextSettings = await settingsService.updateSettings(patch);
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

  safeHandle("project:setActive", async (_event, projectId) => {
    const project = await projectService.setActiveProject(projectId);
    sendEvent("settings:changed", await settingsService.readSettings());
    return project;
  });

  safeHandle("project:generatePlan", async (_event, payload) => {
    const project = await projectService.generateProjectPlan(payload.projectId, payload.prompt, payload.model);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({
      type: "build",
      title: "MVP plan generated",
      description: `Created a planning dashboard for ${project.name}.`,
      actor: "CodeBuddy",
      actorInitials: "CB",
    });
    return project;
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

  safeHandle("project:sendTaskMessage", async (_event, payload) => {
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
  });

  safeHandle("project:sendPMMessage", async (_event, payload) => {
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
  });

  safeHandle("project:cancelActiveRequest", async () => {
    projectService.cancelActiveRequest();
    return { cancelled: true };
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

  safeHandle("activity:list", async () => {
    return activityService.listEvents();
  });

  console.log("[IPC] All handlers registered successfully.");
  projectService.__setEventSender?.(sendEvent);
  processService.__setEventSender(sendEvent);
  activityService.__setEventSender(sendEvent);

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
