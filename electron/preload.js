const { contextBridge, ipcRenderer } = require("electron");

// This file runs in a special sandbox between Node and the browser.
// It exposes a safe, limited API to your React code via window.electronAPI.

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("electronAPI", {
  system: {
    openDirectory: () => ipcRenderer.invoke("system:openDirectory"),
    openExternal: (url) => ipcRenderer.invoke("system:openExternal", url),
    getCommonPaths: () => ipcRenderer.invoke("system:getCommonPaths"),
    platform: process.platform,
  },

  process: {
    run: (payload) => ipcRenderer.invoke("process:run", payload),
    cancel: (processId) => ipcRenderer.invoke("process:cancel", processId),
    listRunning: () => ipcRenderer.invoke("process:listRunning"),
    onStarted: (callback) => subscribe("process:started", callback),
    onOutput: (callback) => subscribe("process:output", callback),
    onCompleted: (callback) => subscribe("process:completed", callback),
    onError: (callback) => subscribe("process:error", callback),
    onCancelled: (callback) => subscribe("process:cancelled", callback),
    onTimeout: (callback) => subscribe("process:timeout", callback),
  },

  repo: {
    inspect: (repoPath) => ipcRenderer.invoke("repo:inspect", repoPath),
    listDirectory: (targetPath) => ipcRenderer.invoke("repo:listDirectory", targetPath),
    readFileContent: (targetPath) => ipcRenderer.invoke("repo:readFileContent", targetPath),
    writeFileContent: (payload) => ipcRenderer.invoke("repo:writeFileContent", payload),
    getFileDiff: (payload) => ipcRenderer.invoke("repo:getFileDiff", payload),
    stageFiles: (payload) => ipcRenderer.invoke("repo:stageFiles", payload),
    unstageFiles: (payload) => ipcRenderer.invoke("repo:unstageFiles", payload),
    commit: (payload) => ipcRenderer.invoke("repo:commit", payload),
    checkoutBranch: (payload) => ipcRenderer.invoke("repo:checkoutBranch", payload),
    getCommitDetails: (payload) => ipcRenderer.invoke("repo:getCommitDetails", payload),
  },

  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (patch) => ipcRenderer.invoke("settings:update", patch),
    onChanged: (callback) => subscribe("settings:changed", callback),
  },

  project: {
    list: () => ipcRenderer.invoke("project:list"),
    create: (payload) => ipcRenderer.invoke("project:create", payload),
    delete: (payload) => ipcRenderer.invoke("project:delete", payload),
    setActive: (projectId) => ipcRenderer.invoke("project:setActive", projectId),
    generatePlan: (payload) => ipcRenderer.invoke("project:generatePlan", payload),
    ensureGithubRepo: (projectId) => ipcRenderer.invoke("project:ensureGithubRepo", projectId),
    sendTaskMessage: (payload) => ipcRenderer.invoke("project:sendTaskMessage", payload),
    sendPMMessage: (payload) => ipcRenderer.invoke("project:sendPMMessage", payload),
    cancelActiveRequest: () => ipcRenderer.invoke("project:cancelActiveRequest"),
    restoreCheckpoint: (payload) => ipcRenderer.invoke("project:restoreCheckpoint", payload),
    onAgentStarted: (callback) => subscribe("project:agentStarted", callback),
    onAgentOutput: (callback) => subscribe("project:agentOutput", callback),
    onAgentCompleted: (callback) => subscribe("project:agentCompleted", callback),
    onAgentError: (callback) => subscribe("project:agentError", callback),
    onAgentCancelled: (callback) => subscribe("project:agentCancelled", callback),
  },

  tools: {
    listStatus: () => ipcRenderer.invoke("tools:listStatus"),
    runCopilotPrompt: (payload) => ipcRenderer.invoke("tools:runCopilotPrompt", payload),
  },

  activity: {
    list: () => ipcRenderer.invoke("activity:list"),
    onCreated: (callback) => subscribe("activity:created", callback),
  },

  openDirectory: () => ipcRenderer.invoke("system:openDirectory"),
  openExternal: (url) => ipcRenderer.invoke("system:openExternal", url),
  runCommand: (command, cwd) => ipcRenderer.invoke("process:run", { command, cwd }),
  onTerminalOutput: (callback) => subscribe("process:output", (payload) => callback(payload.chunk)),
  platform: process.platform,
});
