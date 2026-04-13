# CodeBuddy — Comprehensive Product Requirements Document (PRD)

**Version:** 0.2.0 (Build Tag: v32)  
**Last Updated:** 2025-07-14  
**Purpose:** This document describes every module, function, IPC channel, component, and data flow in CodeBuddy with sufficient detail to recreate the entire application from scratch.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Electron Main Process — `electron/main.js`](#3-electron-main-process)
4. [Preload Bridge — `electron/preload.js`](#4-preload-bridge)
5. [IPC Handler Registry — `electron/ipc/register-handlers.js`](#5-ipc-handler-registry)
6. [Service: Process — `electron/services/process-service.js`](#6-service-process)
7. [Service: Settings — `electron/services/settings-service.js`](#7-service-settings)
8. [Service: Repo — `electron/services/repo-service.js`](#8-service-repo)
9. [Service: Tooling — `electron/services/tooling-service.js`](#9-service-tooling)
10. [Service: Project — `electron/services/project-service.js`](#10-service-project)
11. [Service: Activity — `electron/services/activity-service.js`](#11-service-activity)
12. [Service: Shared State — `electron/services/shared-state-service.js`](#12-service-shared-state)
13. [Service: P2P — `electron/services/p2p-service.js`](#13-service-p2p)
14. [Service: File Watcher — `electron/services/file-watcher-service.js`](#14-service-file-watcher)
15. [Dynamic Model Catalogs — `electron/config/model-catalogs.json`](#15-dynamic-model-catalogs)
16. [Complete IPC Channel Reference](#16-complete-ipc-channel-reference)
17. [Frontend Architecture](#17-frontend-architecture)
18. [Frontend: Root & Layout](#18-frontend-root-and-layout)
19. [Frontend: Onboarding — `src/app/onboarding/page.tsx`](#19-frontend-onboarding)
20. [Frontend: Home — `src/app/home/page.tsx`](#20-frontend-home)
21. [Frontend: Project Workspace — `src/app/project/page.tsx`](#21-frontend-project-workspace)
22. [Frontend: PM Chat — `src/app/project/chat/page.tsx`](#22-frontend-pm-chat)
23. [Frontend: Freestyle (Solo Chat) — `src/app/project/code/page.tsx`](#23-frontend-freestyle)
24. [Frontend: Files — `src/app/project/files/page.tsx`](#24-frontend-files)
25. [Frontend: Preview — `src/app/project/preview/page.tsx`](#25-frontend-preview)
26. [Frontend: Activity — `src/app/project/activity/page.tsx`](#26-frontend-activity)
27. [Frontend: Artifacts — `src/app/project/artifacts/page.tsx`](#27-frontend-artifacts)
28. [Frontend: Documentation — `src/app/project/docs/page.tsx`](#28-frontend-documentation)
29. [Frontend: Messages — `src/app/project/messages/page.tsx`](#29-frontend-messages)
30. [Frontend: Project Settings — `src/app/project/settings/page.tsx`](#30-frontend-project-settings)
31. [Frontend: App Settings — `src/app/settings/page.tsx`](#31-frontend-app-settings)
32. [Frontend: People — `src/app/people/page.tsx`](#32-frontend-people)
33. [Shared Components](#33-shared-components)
34. [Custom Hooks](#34-custom-hooks)
35. [Type Definitions — `src/lib/electron.d.ts`](#35-type-definitions)
36. [Mock Data — `src/lib/mock-data.ts`](#36-mock-data)
37. [Design System — `globals.css` + `tailwind.config.ts`](#37-design-system)
38. [Build & Deploy Pipeline](#38-build-and-deploy-pipeline)
39. [Scripts & Utilities](#39-scripts-and-utilities)
40. [Data Flow Diagrams](#40-data-flow-diagrams)
41. [Security Model](#41-security-model)
42. [Settings Schema](#42-settings-schema)

---

## 1. System Architecture Overview

CodeBuddy is an **Electron desktop application** that wraps a **Next.js static export** frontend. The architecture follows a strict main-process/renderer-process split:

```
┌──────────────────────────────────────────────────────┐
│                   Electron Shell                      │
│  ┌────────────────┐    IPC Bridge    ┌─────────────┐ │
│  │  Main Process   │◄──────────────►│  Renderer    │ │
│  │  (Node.js)      │   (preload.js)  │  (Next.js)  │ │
│  │                 │                 │  (React 19) │ │
│  │  9 Services:    │                 │             │ │
│  │  - process      │                 │  Routes:    │ │
│  │  - settings     │                 │  /home      │ │
│  │  - repo         │                 │  /project/* │ │
│  │  - tooling      │                 │  /settings  │ │
│  │  - project      │                 │  /onboarding│ │
│  │  - activity     │                 │  /people    │ │
│  │  - sharedState  │                 │             │ │
│  │  - p2p          │                 │  16 comps   │ │
│  │  - fileWatcher  │                 │  1 hook     │ │
│  └────────┬───────┘                 └─────────────┘ │
│           │                                          │
│  ┌────────▼───────┐   ┌──────────────────────┐      │
│  │  AI CLI Layer   │   │  P2P Mesh            │      │
│  │  - copilot.exe  │   │  Hyperswarm + Yjs    │      │
│  │  - claude.exe   │   │  CRDT state sync     │      │
│  │  - codex.cmd    │   │  NAT traversal       │      │
│  └────────────────┘   └──────────────────────┘      │
│           │                                          │
│  ┌────────▼───────┐                                  │
│  │  Git / GitHub   │                                  │
│  │  - local repos  │                                  │
│  │  - remote sync  │                                  │
│  │  - auto-commit  │                                  │
│  └────────────────┘                                  │
└──────────────────────────────────────────────────────┘
```

**Key principles:**
- `contextIsolation: true` — renderer cannot access Node.js APIs directly
- `nodeIntegration: false` — no `require()` in renderer code
- All cross-boundary communication goes through `ipcMain.handle` / `ipcRenderer.invoke`
- The renderer is a static HTML export (`next build` with `output: "export"`) served by a local HTTP server in production
- All state persists in `settings.json` at `%APPDATA%/codebuddy/`
- Git repos live on disk; GitHub is the remote sync layer
- P2P uses Hyperswarm DHT for serverless peer discovery

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Desktop shell | Electron | 41.0.3 | Window management, IPC, OS integration |
| Frontend framework | Next.js | 16.2.1 | App Router, static export, React Server Components |
| UI library | React | 19.0.0 | Component rendering |
| Styling | Tailwind CSS | 3.4.17 | Utility-first CSS with custom design tokens |
| Code editor | Monaco Editor | 0.55.1 | In-app code viewing/editing |
| P2P networking | Hyperswarm | 4.17.0 | Distributed peer discovery via DHT |
| CRDT sync | Yjs | 13.6.30 | Conflict-free replicated data types |
| AI: GitHub Copilot | `gh copilot` CLI extension | Latest | Code generation via GitHub |
| AI: Claude Code | `claude` CLI | Latest | Code generation via Anthropic |
| AI: Codex CLI | `@openai/codex` | Latest | Code generation via OpenAI |
| Build/package | electron-builder | 26.8.1 | Windows NSIS installer, portable |
| Language | TypeScript | 5.8.2 | Frontend type safety |
| Backend language | JavaScript (CommonJS) | ES2017+ | Electron main process |

### Dependencies (package.json)

**Runtime (7):**
- `@monaco-editor/react` ^4.7.0 — React wrapper for Monaco
- `hyperswarm` ^4.17.0 — P2P swarm networking
- `monaco-editor` ^0.55.1 — Code editor core
- `next` ^16.2.1 — Framework
- `react` 19.0.0 — UI
- `react-dom` 19.0.0 — DOM rendering
- `yjs` ^13.6.30 — CRDTs

**Dev (12):**
- `@eslint/eslintrc`, `eslint`, `eslint-config-next` — Linting
- `@types/node`, `@types/react`, `@types/react-dom` — Type definitions
- `autoprefixer`, `postcss`, `tailwindcss` — CSS processing
- `concurrently`, `wait-on` — Dev server orchestration
- `electron`, `electron-builder` — Build tooling
- `typescript` — Compilation

---

## 3. Electron Main Process

**File:** `electron/main.js`  
**Lines:** 229  
**Role:** Application entry point. Creates the browser window, boots all 9 services, and wires them together.

### Boot Sequence

1. **Diagnostic logger** (lines 7-21): Patches `console.log/warn/error` to also append to `%APPDATA%/codebuddy/codebuddy-debug.log` with ISO timestamps and level tags.

2. **Service instantiation** (lines 43-52): Creates services in dependency order:
   ```
   processService = createProcessService({ sendEvent: () => undefined })
   settingsService = createSettingsService({ app })
   toolingService = createToolingService({ processService, settingsService })
   activityService = createActivityService()
   sharedStateService = createSharedStateService()
   p2pService = createP2PService({ sharedStateService, sendEvent: () => undefined })
   fileWatcherService = createFileWatcherService({ repoService: null, processService, p2pService, sendEvent: () => undefined })
   projectService = createProjectService({ app, settingsService, toolingService, p2pService, sharedStateService })
   repoService = null  // created async in bootstrapDesktopServices()
   ```
   Note: `sendEvent` is initially a no-op because `mainWindow` doesn't exist yet. It gets replaced with the real sender in `registerIpcHandlers`.

3. **Static file server** (lines 95-126): In production (`app.isPackaged === true`), creates an HTTP server on a random port (`0`) bound to `127.0.0.1` that serves the Next.js static export from `../out/`. The server:
   - Resolves paths through `resolveExportedFile()` which tries `path`, `path.html`, `path/index.html` in order
   - Sets `Content-Type` via extension mapping in `getContentType()`
   - Caches `_next/` assets with `max-age=31536000, immutable`
   - Returns `no-cache` for all other files
   - Serves `404.html` for missing paths with HTTP 404 status

4. **Window creation** (lines 128-183): `createWindow()` creates `BrowserWindow` with:
   - Size: 1400×900, min 900×600
   - Security: `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: true`
   - Webview guests get `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
   - Webview window opening is denied (`setWindowOpenHandler(() => ({ action: "deny" }))`)
   - Header stripping: Removes `X-Frame-Options` and CSP `frame-ancestors` from localhost responses so the preview webview can display the user's dev server
   - In dev: loads `http://localhost:3000` and opens DevTools
   - In production: clears Chromium HTTP/code cache, then loads the static server URL

5. **Service bootstrap** (lines 185-229): `bootstrapDesktopServices()`:
   - Creates `repoService` (async because it resolves git path)
   - Calls `registerIpcHandlers()` with all 11 dependencies
   - Patches `processService`, `p2pService`, and `fileWatcherService` with the real `sendEvent` function that sends to the renderer's `mainWindow.webContents`
   - Wires `fileWatcherService` with `repoService`
   - Catches and logs all errors

6. **App lifecycle**:
   - `app.whenReady()` → `createWindow()` → `bootstrapDesktopServices()`
   - `app.on("activate")` → recreate window (macOS dock click)
   - `app.on("window-all-closed")` → `app.quit()` on non-macOS
   - `app.commandLine.appendSwitch("disable-http-cache")` in production to prevent stale JS bundles

### Key Functions

| Function | Lines | Purpose |
|----------|-------|---------|
| `writeLog(level, args)` | 11-14 | Appends timestamped log line to debug file |
| `getContentType(filePath)` | 54-70 | Maps file extension to MIME type for static server |
| `resolveExportedFile(rootDir, requestPath)` | 72-80 | Resolves URL path to file on disk with fallback chain |
| `ensureStaticServer()` | 82-126 | Creates/returns localhost HTTP server for production |
| `createWindow()` | 128-183 | Creates BrowserWindow with all security settings |
| `bootstrapDesktopServices()` | 185-229 | Wires services + registers IPC handlers |

---

## 4. Preload Bridge

**File:** `electron/preload.js`  
**Lines:** 161  
**Role:** Exposes `window.electronAPI` to the renderer via `contextBridge.exposeInMainWorld()`. This is the *only* channel between the renderer and Node.js.

### Helper Function

```javascript
function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
```
Returns an unsubscribe function. Used for all event listeners.

### API Namespaces

The `electronAPI` object has **11 namespaces** with **73 invoke channels** and **24 subscription channels**:

#### `system` (4 invoke, 0 subscribe)
| Method | IPC Channel | Parameters | Returns |
|--------|------------|------------|---------|
| `openDirectory()` | `system:openDirectory` | — | `string \| null` (selected path) |
| `openExternal(url)` | `system:openExternal` | `url: string` | `void` |
| `getCommonPaths()` | `system:getCommonPaths` | — | `{ desktop, documents, downloads, home }` |
| `getBuildTag()` | `system:getBuildTag` | — | `string` (e.g. "v32") |
| `platform` | — (direct property) | — | `string` (process.platform) |

#### `process` (3 invoke, 6 subscribe)
| Method | IPC Channel | Parameters |
|--------|------------|------------|
| `run(payload)` | `process:run` | `{ command, cwd, options? }` |
| `cancel(processId)` | `process:cancel` | `processId: string` |
| `listRunning()` | `process:listRunning` | — |
| `onStarted(cb)` | `process:started` | `{ processId, command, cwd }` |
| `onOutput(cb)` | `process:output` | `{ processId, data }` |
| `onCompleted(cb)` | `process:completed` | `{ processId, exitCode, stdout, stderr }` |
| `onError(cb)` | `process:error` | `{ processId, error }` |
| `onCancelled(cb)` | `process:cancelled` | `{ processId }` |
| `onTimeout(cb)` | `process:timeout` | `{ processId }` |

#### `repo` (14 invoke, 0 subscribe)
| Method | IPC Channel | Parameters |
|--------|------------|------------|
| `inspect(repoPath)` | `repo:inspect` | `repoPath: string` |
| `listDirectory(targetPath)` | `repo:listDirectory` | `targetPath: string` |
| `readFileContent(targetPath)` | `repo:readFileContent` | `targetPath: string` |
| `writeFileContent(payload)` | `repo:writeFileContent` | `{ targetPath, content }` |
| `getFileDiff(payload)` | `repo:getFileDiff` | `{ repoPath, targetPath, staged? }` |
| `stageFiles(payload)` | `repo:stageFiles` | `{ repoPath, filePaths }` |
| `unstageFiles(payload)` | `repo:unstageFiles` | `{ repoPath, filePaths }` |
| `commit(payload)` | `repo:commit` | `{ repoPath, message }` |
| `checkoutBranch(payload)` | `repo:checkoutBranch` | `{ repoPath, branchName, create? }` |
| `getCommitDetails(payload)` | `repo:getCommitDetails` | `{ repoPath, commitHash }` |
| `getRemoteUrl(repoPath)` | `repo:getRemoteUrl` | `repoPath: string` |
| `push(payload)` | `repo:push` | `{ repoPath, branch?, remote? }` |
| `pull(payload)` | `repo:pull` | `{ repoPath, remote? }` |
| `syncSharedState(payload)` | `repo:syncSharedState` | `{ repoPath, commitMessage }` |

#### `settings` (4 invoke, 1 subscribe)
| Method | IPC Channel | Parameters |
|--------|------------|------------|
| `get()` | `settings:get` | — |
| `update(patch)` | `settings:update` | `patch: Partial<Settings>` |
| `isFirstRun()` | `settings:isFirstRun` | — |
| `completeOnboarding()` | `settings:completeOnboarding` | — |
| `onChanged(cb)` | `settings:changed` | Full `Settings` object |

#### `project` (19 invoke, 5 subscribe)
| Method | IPC Channel | Parameters |
|--------|------------|------------|
| `list()` | `project:list` | — |
| `create(payload)` | `project:create` | `{ name, description, baseDirectory?, createGithubRepo?, githubVisibility? }` |
| `delete(payload)` | `project:delete` | `{ projectId, deleteLocalFiles?, deleteGithubRepo? }` |
| `grantDeleteScope()` | `project:grantDeleteScope` | — |
| `setActive(projectId)` | `project:setActive` | `projectId: string` |
| `importSyncedPlan(projectId)` | `project:importSyncedPlan` | `projectId: string` |
| `syncWorkspace(projectId)` | `project:syncWorkspace` | `projectId: string` |
| `savePlan(payload)` | `project:savePlan` | `{ projectId, plan, taskThreads?, skipGitPush? }` |
| `generatePlan(payload)` | `project:generatePlan` | `{ projectId, prompt, model? }` |
| `ensureGithubRepo(projectId)` | `project:ensureGithubRepo` | `projectId: string` |
| `listCollaborators(repoPath)` | `project:listCollaborators` | `repoPath: string` |
| `setRepoVisibility(payload)` | `project:setRepoVisibility` | `{ repoPath, visibility }` |
| `sendTaskMessage(payload)` | `project:sendTaskMessage` | `{ projectId, threadId, taskId, prompt, model?, attachments? }` |
| `generateTaskPrompt(payload)` | `project:generateTaskPrompt` | `{ projectId, taskId, prompt?, model? }` |
| `sendPMMessage(payload)` | `project:sendPMMessage` | `{ projectId, prompt, model?, attachments? }` |
| `sendSoloMessage(payload)` | `project:sendSoloMessage` | `{ projectId, sessionId, prompt, model?, context?, attachments? }` |
| `cancelActiveRequest()` | `project:cancelActiveRequest` | — |
| `forceResetAgent(payload)` | `project:forceResetAgent` | `{ repoPath? }` |
| `getActiveRequest()` | `project:getActiveRequest` | — |
| `launchDevServer(payload)` | `project:launchDevServer` | `{ projectId, repoPath }` |
| `restoreCheckpoint(payload)` | `project:restoreCheckpoint` | `{ projectId, checkpointId }` |
| `onAgentStarted(cb)` | `project:agentStarted` | `{ threadId, taskId }` |
| `onAgentOutput(cb)` | `project:agentOutput` | `{ threadId, data, source? }` |
| `onAgentCompleted(cb)` | `project:agentCompleted` | `{ threadId, exitCode }` |
| `onAgentError(cb)` | `project:agentError` | `{ threadId, error }` |
| `onAgentCancelled(cb)` | `project:agentCancelled` | `{ threadId }` |

#### `tools` (18 invoke, 3 subscribe)
| Method | IPC Channel |
|--------|------------|
| `listStatus()` | `tools:listStatus` |
| `getModelCatalogs()` | `tools:getModelCatalogs` |
| `installCopilot()` | `tools:installCopilot` |
| `installClaude()` | `tools:installClaude` |
| `installNode()` | `tools:installNode` |
| `installGit()` | `tools:installGit` |
| `installGh()` | `tools:installGh` |
| `installPython()` | `tools:installPython` |
| `installCodex()` | `tools:installCodex` |
| `runCopilotPrompt(payload)` | `tools:runCopilotPrompt` |
| `runGenericPrompt(payload)` | `tools:runGenericPrompt` |
| `githubAuthStatus()` | `tools:githubAuthStatus` |
| `githubAuthLogin()` | `tools:githubAuthLogin` |
| `githubAuthLogout(username)` | `tools:githubAuthLogout` |
| `githubListAccounts()` | `tools:githubListAccounts` |
| `githubSwitchAccount(username)` | `tools:githubSwitchAccount` |
| `claudeAuthStatus()` | `tools:claudeAuthStatus` |
| `claudeAuthLogin()` | `tools:claudeAuthLogin` |
| `codexAuthStatus()` | `tools:codexAuthStatus` |
| `codexAuthLogin()` | `tools:codexAuthLogin` |
| `onGithubAuthProgress(cb)` | `tools:githubAuthProgress` |
| `onClaudeAuthProgress(cb)` | `tools:claudeAuthProgress` |
| `onCodexAuthProgress(cb)` | `tools:codexAuthProgress` |

#### `sharedState` (9 invoke, 0 subscribe)
| Method | IPC Channel |
|--------|------------|
| `init(repoPath)` | `sharedState:init` |
| `isInitialized(repoPath)` | `sharedState:isInitialized` |
| `readFile(payload)` | `sharedState:readFile` |
| `writeFile(payload)` | `sharedState:writeFile` |
| `listDir(payload)` | `sharedState:listDir` |
| `saveConversation(payload)` | `sharedState:saveConversation` |
| `loadConversation(payload)` | `sharedState:loadConversation` |
| `listConversations(repoPath)` | `sharedState:listConversations` |
| `saveMember(payload)` | `sharedState:saveMember` |
| `listMembers(repoPath)` | `sharedState:listMembers` |

#### `p2p` (12 invoke, 9 subscribe)
| Method | IPC Channel |
|--------|------------|
| `join(payload)` | `p2p:join` |
| `leave(payload)` | `p2p:leave` |
| `status(payload)` | `p2p:status` |
| `peers(payload)` | `p2p:peers` |
| `joinedProjects()` | `p2p:joinedProjects` |
| `broadcastChatToken(payload)` | `p2p:broadcastChatToken` |
| `broadcastChatMessage(payload)` | `p2p:broadcastChatMessage` |
| `broadcastStateChange(payload)` | `p2p:broadcastStateChange` |
| `getActivePeerStreams(payload)` | `p2p:getActivePeerStreams` |
| `generateInvite(payload)` | `p2p:generateInvite` |
| `decodeInvite(payload)` | `p2p:decodeInvite` |
| `acceptInvite(payload)` | `p2p:acceptInvite` |
| `onJoined(cb)` | `p2p:joined` |
| `onLeft(cb)` | `p2p:left` |
| `onPeerJoined(cb)` | `p2p:peerJoined` |
| `onPeerLeft(cb)` | `p2p:peerLeft` |
| `onPresence(cb)` | `p2p:presence` |
| `onChatToken(cb)` | `p2p:chatToken` |
| `onChatMessage(cb)` | `p2p:chatMessage` |
| `onStateChanged(cb)` | `p2p:stateChanged` |
| `onReconnecting(cb)` | `p2p:reconnecting` |

#### `activity` (1 invoke, 1 subscribe)
| Method | IPC Channel |
|--------|------------|
| `list()` | `activity:list` |
| `onCreated(cb)` | `activity:created` |

#### `fileWatcher` (5 invoke, 5 subscribe)
| Method | IPC Channel |
|--------|------------|
| `start(payload)` | `fileWatcher:start` |
| `stop()` | `fileWatcher:stop` |
| `status()` | `fileWatcher:status` |
| `triggerSync()` | `fileWatcher:triggerSync` |
| `pushToMain(payload)` | `fileWatcher:pushToMain` |
| `onChanged(cb)` | `fileWatcher:changed` |
| `onSyncStart(cb)` | `fileWatcher:syncStart` |
| `onSyncComplete(cb)` | `fileWatcher:syncComplete` |
| `onPeerSync(cb)` | `fileWatcher:peerSync` |
| `onStatus(cb)` | `fileWatcher:status` (event) |

---

## 5. IPC Handler Registry

**File:** `electron/ipc/register-handlers.js`  
**Lines:** 1,440  
**Role:** Registers all IPC handlers + P2P state-change listeners. This is the routing layer between the renderer and backend services.

### Function Signature

```javascript
function registerIpcHandlers({
  app, mainWindow, processService, repoService, settingsService,
  toolingService, activityService, projectService, sharedStateService,
  p2pService, fileWatcherService
})
```

### Constants

```javascript
const BUILD_TAG = "v32";
```

### Helper Functions

| Function | Purpose |
|----------|---------|
| `safeHandle(channel, handler)` | Wraps `ipcMain.handle()` with removal of existing handler + error logging |
| `sendEvent(channel, payload)` | Sends event to renderer if window exists and isn't destroyed |
| `logActivity(event)` | Shorthand for `activityService.addEvent(event)` |

### P2P State Change Listeners (lines 30-370)

The register-handlers file sets up two critical P2P listeners:

**`p2pService.onPeerReady(projectId, peerId, peerName)`**: When a new peer completes handshake, broadcasts all local task threads, PM conversation messages, and freestyle sessions to the new peer for full history sync.

**`p2pService.onStateChange(projectId, category, id, data, peerName)`**: Handles 7 incoming state change categories:

| Category | Behavior |
|----------|----------|
| `plan` | Merges incoming project plan into settings. Task threads are merged: keeps whichever version has more messages per thread. Adds new threads. |
| `tasks` | Updates individual task status by `taskId`. Finds task across all subprojects. |
| `conversation` | Appends new messages to PM, task, or solo conversations. Creates thread/session if it doesn't exist. Tags messages with `fromPeer: true` and `peerName`. |
| `thread-sync` | Full merge on peer connect — merges taskThreads, PM conversation, and soloSessions using length-based conflict resolution. |
| `new-commits` | Peer pushed to `codebuddy-build` — triggers `fileWatcherService.autoPull()` to pull latest code changes. |
| `main-updated` | Peer pushed to `main` — runs `git fetch origin main` and fast-forward merges if main is checked out. |
| `agent-context` | Peer saved agent context snapshot — writes signal marker to `.codebuddy/agents/context/`. |

### Handler Registration Pattern

Every IPC handler follows this pattern:
```javascript
safeHandle("namespace:action", async (_event, payload) => {
  // 1. Optional: set fileWatcherService agent-active flag
  // 2. Call service method
  // 3. Optional: sendEvent("settings:changed", ...) to update renderer
  // 4. Optional: logActivity({ type, title, description, actor, actorInitials })
  // 5. Return result to renderer
});
```

For AI-related handlers (`sendTaskMessage`, `sendPMMessage`, `sendSoloMessage`, `generatePlan`, `generateTaskPrompt`), the pattern wraps with file watcher control:
```javascript
safeHandle("project:sendTaskMessage", async (_event, payload) => {
  if (fileWatcherService) fileWatcherService.setAgentActive(true);
  try {
    const result = await projectService.sendTaskMessage(payload);
    sendEvent("settings:changed", await settingsService.readSettings());
    logActivity({ ... });
    return result;
  } finally {
    if (fileWatcherService) {
      fileWatcherService.setAgentActive(false);
      fileWatcherService.doAutoSync();
    }
  }
});
```

### `tools:listStatus` Special Behavior

After getting tool statuses, this handler auto-syncs feature flags in settings. It checks whether the `githubCopilotCli`, `claudeCode`, and `codexCli` flags match actual tool availability and updates settings if they differ. This ensures the frontend always reflects real tool state.

### `project:savePlan` Flow

1. Uses `settingsService.atomicUpdate()` to prevent concurrent writes
2. Only writes to `settings.json` if plan content actually changed (prevents echo loops with file watcher)
3. If not in P2P mode (`skipGitPush` is false), exports plan to `.codebuddy/plan.json`
4. Commits and pushes to current branch for async sync
5. Does NOT send `settings:changed` event (prevents cascade)

### `project:syncWorkspace` Flow

1. Git pull with stash/pop to handle uncommitted changes
2. Read `.codebuddy/plan.json` from shared state
3. Parse plan data
4. Atomic merge into project settings with thread conflict resolution
5. Send `settings:changed` event

### `p2p:generateInvite` Flow

1. Generate invite code from `p2pService`
2. Export current plan to `.codebuddy/plan.json`
3. Commit and push to current branch
4. If on `codebuddy-build`, also merge to `main` and push (clone defaults to main)

### `p2p:acceptInvite` Flow

1. Decode invite → get remoteUrl + projectName
2. Determine target directory (user-specified or `documents/project-name`)
3. If target exists without `.git`, remove and re-clone
4. Clone repo with 120s timeout
5. Configure `gh auth git-credential` helper
6. Switch to `codebuddy-build` branch (create if needed)
7. Create project in settings via `projectService.createProject()`
8. Set as active project
9. Return project data

---

## 6. Service: Process

**File:** `electron/services/process-service.js`  
**Lines:** 141  
**Role:** Spawns, tracks, and cancels child processes with streaming output.

### Factory

```javascript
createProcessService({ sendEvent })
```

### Internal State

- `runningProcesses: Map<string, ChildProcess>` — tracks active processes by ID

### API Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `run(command, cwd, options)` | `command: string`, `cwd: string`, `options: { timeoutMs?, env?, shell? }` | `{ processId, exitCode, stdout, stderr }` | Spawns a child process. Generates UUID `processId`. Streams events: `process:started`, `process:output` (line-by-line), `process:completed`, `process:error`, `process:cancelled`, `process:timeout`. |
| `cancel(processId)` | `processId: string` | `{ cancelled: boolean }` | Kills process by ID via `process.kill()`. Sends `process:cancelled` event. |
| `listRunning()` | — | `string[]` | Returns array of active process IDs. |
| `runProgram(file, args, cwd, options)` | `file: string`, `args: string[]`, `cwd: string`, `options: object` | `{ exitCode, stdout, stderr }` | Lower-level: spawns with `execFile` instead of shell. Used by tooling service for CLI invocations. |

### Event Emission

All process events include `{ processId }` plus event-specific data. The `process:output` event fires for each line of stdout/stderr with `{ processId, data, source: "stdout"|"stderr" }`.

---

## 7. Service: Settings

**File:** `electron/services/settings-service.js`  
**Lines:** 269  
**Role:** Manages persistent JSON settings at `%APPDATA%/codebuddy/settings.json`. Thread-safe with queue-based mutex.

### Factory

```javascript
createSettingsService({ app })
```

### Exported Constants

```javascript
const DEFAULT_SYSTEM_PROMPT_MARKDOWN = `...`  // Line 5, ~44 lines
const IMPORTED_PROJECT_SYSTEM_PROMPT = `...`   // Line ~49, ~44 lines
```

These provide the system prompt templates embedded in project dashboards.

### DEFAULT_SETTINGS Shape

```javascript
const DEFAULT_SETTINGS = {
  onboardingCompleted: false,
  workspaceRoots: [],
  recentRepositories: [],
  projects: [],
  activeProjectId: null,
  projectDefaults: {
    rootDirectory: null,
    createGithubRepo: true,
    githubVisibility: "private",
    copilotModel: "claude-sonnet-4.6",
  },
  shell: { defaultShell: "powershell" },
  cliTools: {
    git: "",
    gh: "",
    copilot: "",
    claude: "",
    codex: "",
    node: "",
    npm: "",
    python: "",
  },
  featureFlags: {
    githubCopilotCli: true,
    claudeCode: false,
    codexCli: false,
    githubCompanion: false,
  },
};
```

### Internal Functions

| Function | Purpose |
|----------|---------|
| `enqueue(fn)` | Queue-based mutex. Only one settings operation runs at a time. Returns promise. |
| `_readFromDisk()` | Reads `settings.json`, parses, normalizes via `normalizeSettings()`. Returns `DEFAULT_SETTINGS` if file doesn't exist. |
| `_writeToDisk(nextSettings)` | Atomic write: write to `settings.tmp.json` → backup `settings.json` to `settings.backup.json` → rename tmp to settings.json |
| `normalizeSettings(rawSettings)` | Deep-merges raw settings with `DEFAULT_SETTINGS`. Normalizes each project via `normalizeProject()`. |
| `normalizeProject(project, systemPromptMarkdown)` | Ensures project has `dashboard`, `plan`, `taskThreads`, `soloSessions`, `conversation` arrays. Fills missing `systemPromptMarkdown`. |
| `createDefaultDashboardState(systemPromptMarkdown, initialPrompt)` | Creates a fresh dashboard object with empty arrays and the system prompt. |

### API Methods

| Method | Description |
|--------|-------------|
| `readSettings()` | Enqueues a read from disk. Returns full settings object. |
| `writeSettings(nextSettings)` | Enqueues a full write to disk. |
| `updateSettings(patch)` | Reads, shallow-merges patch, writes. Returns merged settings. |
| `atomicUpdate(mutateFn)` | Reads settings, passes to `mutateFn`. If `mutateFn` returns an object, writes it. If it returns `undefined`, no-op. Used for concurrent-safe read-modify-write. |
| `isFirstRun()` | Returns `!settings.onboardingCompleted`. |
| `completeOnboarding()` | Sets `onboardingCompleted: true`, writes, returns updated settings. |

### Write Safety

The atomic write pattern prevents data loss:
1. Write new settings to `settings.tmp.json`
2. Rename existing `settings.json` → `settings.backup.json`
3. Rename `settings.tmp.json` → `settings.json`

If the app crashes between steps 2 and 3, the backup file preserves the last good state.

---

## 8. Service: Repo

**File:** `electron/services/repo-service.js`  
**Lines:** 428  
**Role:** Git operations wrapper. All git commands run via `child_process.execFile` with `GIT_TERMINAL_PROMPT=0` to prevent interactive prompts.

### Factory

```javascript
async function createRepoService({ settingsService })
```
Async because it reads the configured git path from settings.

### Internal Helpers

| Function | Line | Purpose |
|----------|------|---------|
| `parseStatusPorcelain(output)` | 25 | Parses `git status --porcelain` output into `{ path, status, staged }` objects |
| `normalizeRepoPath(repoPath)` | 38 | `path.resolve()` wrapper |
| `normalizeGitPath(repoPath, targetPath)` | 42 | Resolves target path relative to repo root |
| `parseCommitFiles(output)` | 48 | Parses `git show --stat` output into file list |
| `cleanupGitState(repoPath)` | ~75 | Aborts rebase/merge/cherry-pick if in progress |

### Internal Constants

- `hiddenNames` — `Set`: `node_modules`, `.next`, `.git`, `dist`, `build`, `coverage`, `.turbo`, `.vercel`, `__pycache__`, `.DS_Store`

### API Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `inspectRepository(repoPath)` | `string` | `{ repoPath, branch, status[], recentCommits[], branches[] }` | Full repo inspection: branch name, changed files, last 20 commits, all branches |
| `listDirectory(targetPath)` | `string` | `{ name, type, path }[]` | Lists directory contents, filters `hiddenNames` |
| `readFileContent(targetPath)` | `string` | `{ path, content, size }` | Reads file content (string). Max 5MB guard. |
| `writeFileContent(targetPath, content)` | `string, string` | `{ path, size }` | Writes file to disk |
| `getFileDiff(repoPath, targetPath, staged)` | `string, string, boolean` | `string` | Returns `git diff` output for a file |
| `stageFiles(repoPath, filePaths)` | `string, string[]` | Inspection | Runs `git add` for specified files |
| `unstageFiles(repoPath, filePaths)` | `string, string[]` | Inspection | Runs `git reset HEAD` for specified files |
| `commit(repoPath, message)` | `string, string` | Inspection | Commits staged changes (`git commit -m`) |
| `checkoutBranch(repoPath, branchName, create)` | `string, string, boolean` | Inspection | Switches branch. If `create`, uses `git checkout -b`. |
| `getCommitDetails(repoPath, commitHash)` | `string, string` | `{ hash, message, author, date, files[] }` | Detailed commit info via `git show` |
| `getRemoteUrl(repoPath)` | `string` | `string \| null` | Returns `origin` remote URL or null |
| `pushToRemote(repoPath, options)` | `string, { branch?, remote?, force? }` | `{ success, branch }` | Pushes to remote with `-u` flag. Configures `gh auth git-credential` helper first. |
| `pullFromRemote(repoPath, options)` | `string, { remote? }` | Inspection | Pulls with `--rebase`. Calls `cleanupGitState()` first. |
| `syncSharedState(repoPath, commitMessage)` | `string, string` | `{ success }` | Stages `.codebuddy/`, commits, pushes |

---

## 9. Service: Tooling

**File:** `electron/services/tooling-service.js`  
**Lines:** 1,272  
**Role:** Detects, installs, and authenticates external developer tools. Routes AI prompts to the correct CLI.

### Factory

```javascript
createToolingService({ processService, settingsService })
```

### Module-Level Functions

| Function | Line | Purpose |
|----------|------|---------|
| `loadModelCatalogs()` | 11 | Reads and parses `electron/config/model-catalogs.json`. Returns the catalog object. Caches result. |

### Internal State

- `extraPaths: Set<string>` — runtime PATH additions discovered during tool scanning
- `CLAUDE_MODEL_IDS: Set<string>` — built dynamically from `model-catalogs.json` claude entries
- `CODEX_MODEL_IDS: Set<string>` — built dynamically from `model-catalogs.json` codex entries

### Internal Helpers

| Function | Line | Purpose |
|----------|------|---------|
| `getCommandName(command)` | ~30 | Extracts basename from full command path |
| `expandEnvVars(str)` | ~47 | Expands `%VAR%` patterns using `process.env` |
| `refreshSystemPath()` | ~52 | Re-reads `PATH` from registry (Windows) to pick up newly installed tools |
| `tryExec(file, args, cwd, options)` | ~82 | Tries to execute a command. Returns `{ stdout, stderr }` or `null` on failure. |
| `getConfiguredCommands()` | ~102 | Reads tool paths from settings. Returns `{ git, gh, copilot, claude, codex, node, npm, python }` |
| `resolveProviderForPrompt(featureFlags, modelId)` | ~220 | Determines which CLI to use based on model ID. Checks `CLAUDE_MODEL_IDS` and `CODEX_MODEL_IDS` sets. Falls back to copilot. |
| `resolveClaudeCmd(configuredCmd)` | ~1000 | Multi-strategy Claude CLI resolution: configured path → `claude` on PATH → winget installation path → npm global → LocalAppData/Programs |
| `getKnownCommandLocations(name)` | ~varies | Returns array of common install paths for a given tool name. Special handling for `claude` includes winget-installed paths. |

### API Methods — Tool Detection

| Method | Returns | Description |
|--------|---------|-------------|
| `getToolStatus()` | `ToolStatus[]` | Checks all 8 tools: `git`, `gh`, `githubCopilotCli`, `claudeCode`, `codexCli`, `node`, `npm`, `python`. For each: tries configured path → PATH → known install locations. Returns `{ id, name, available, version?, path?, detail? }`. |

### API Methods — Model Catalogs

| Method | Returns | Description |
|--------|---------|-------------|
| `getModelCatalogs()` | `ModelCatalogs` | Returns parsed `model-catalogs.json` (alias for `loadModelCatalogs()`) |

### API Methods — AI Prompt Execution

| Method | Parameters | Description |
|--------|-----------|-------------|
| `runCopilotPrompt({ prompt, cwd, allowTools, timeoutMs, model })` | Copilot-specific prompt | Runs `gh copilot suggest` or `gh copilot explain` depending on prompt type. |
| `runGenericPrompt({ prompt, cwd, timeoutMs, model })` | Generic prompt | Routes to correct CLI via `resolveProviderForPrompt()`. Builds the CLI invocation and executes via `processService.runProgram()`. |

### API Methods — Tool Installation

All install methods return `{ success: boolean, detail: string, log?: string[] }`.

| Method | Strategy |
|--------|----------|
| `installCopilot()` | `gh extension install github/gh-copilot` (requires `gh` CLI) |
| `installClaudeCode()` | `npm install -g @anthropic-ai/claude-code` or `winget install Anthropic.Claude` |
| `installNodeJs()` | `winget install OpenJS.NodeJS.LTS` |
| `installGitScm()` | `winget install Git.Git` |
| `installGithubCli()` | `winget install GitHub.cli` |
| `installPython()` | `winget install Python.Python.3.12` |
| `installCodex()` | `npm install -g @openai/codex` |

### API Methods — Authentication

| Method | Flow |
|--------|------|
| `getGithubAuthStatus()` | Checks `gh auth status`. Returns `{ authenticated, username, scopes }`. |
| `startGithubAuth(sendEvent)` | Runs `gh auth login --web`. Streams progress via `tools:githubAuthProgress` events. |
| `logoutGithub(username)` | Runs `gh auth logout -u <username>`. |
| `listGithubAccounts()` | Parses `gh auth status` for all authenticated accounts. |
| `switchGithubAccount(username)` | Switches active GitHub account via `gh auth switch`. |
| `getClaudeAuthStatus()` | Checks `claude auth status`. Returns `{ authenticated, detail }`. |
| `startClaudeAuth(sendEvent)` | Runs `claude auth login`. Streams progress via `tools:claudeAuthProgress`. |
| `getCodexAuthStatus()` | Checks `codex auth status`. Returns `{ authenticated, detail }`. |
| `startCodexAuth(sendEvent)` | Runs `codex auth login`. Streams progress via `tools:codexAuthProgress`. |

### Model ID Routing

The `CLAUDE_MODEL_IDS` and `CODEX_MODEL_IDS` sets are built at startup from `model-catalogs.json`:
```javascript
// Built from catalog entries
CLAUDE_MODEL_IDS = new Set(catalogs.claude.map(m => m.id))
// e.g.: { "sonnet", "opus", "claude-sonnet-4-6", "claude-opus-4-6", "claude-sonnet-4-5", "claude-haiku-4-5" }

CODEX_MODEL_IDS = new Set(catalogs.codex.map(m => m.id))
// e.g.: { "default", "o4-mini", "o3", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3-pro", "codex-mini" }
```

`resolveProviderForPrompt(featureFlags, modelId)`:
1. If `modelId` is in `CLAUDE_MODEL_IDS` AND `featureFlags.claudeCode` is true → return `"claude"`
2. If `modelId` is in `CODEX_MODEL_IDS` AND `featureFlags.codexCli` is true → return `"codex"`
3. Otherwise → return `"copilot"`

---

## 10. Service: Project

**File:** `electron/services/project-service.js`  
**Lines:** 3,386  
**Role:** The largest and most complex service. Handles project CRUD, AI plan generation, all three chat modes (task/PM/solo), checkpoint management, CLI invocation, and dev server launching.

### Factory

```javascript
createProjectService({ app, settingsService, toolingService, p2pService, sharedStateService })
```

### Constants (built dynamically at startup)

```javascript
const BUILD_TAG = "v32";
let CLAUDE_CLI_MODEL_IDS = new Set();  // populated from model-catalogs.json
let CODEX_CLI_MODEL_IDS = new Set();   // populated from model-catalogs.json
```

### Internal State

- `activeRequest: { processId, threadId, taskId, abortController } | null` — tracks the currently running AI request
- `pendingSendEvent: Function` — deferred event sender (set externally)

### Critical Internal Functions

| Function | Approx Line | Purpose |
|----------|-------------|---------|
| `generateId()` | ~15 | UUID v4 generator for project/thread/session IDs |
| `resolveProvider(featureFlags, modelId)` | ~30 | Same routing logic as tooling service: checks `CLAUDE_CLI_MODEL_IDS` / `CODEX_CLI_MODEL_IDS` to determine which CLI to invoke |
| `buildCliInvocation(provider, modelId, prompt, cwd, options)` | ~80 | Constructs the full CLI command for any provider. Returns `{ file, args, env }`. Handles model-specific flags, system prompts, file context. |
| `runProviderCli(provider, modelId, prompt, cwd, options)` | ~150 | Executes the CLI invocation from `buildCliInvocation()`. Streams output via `sendEvent("project:agentOutput", ...)`. Handles timeout, cancellation, error recovery. |
| `createCheckpoint(repoPath, threadId, label)` | ~250 | Snapshots all files in the project directory (excluding `.git`, `node_modules`, `.next`). Stores as JSON in `.codebuddy/checkpoints/<id>.json`. |
| `restoreCheckpoint(projectId, checkpointId)` | ~300 | Reads checkpoint file. Restores each file to its snapshot state. Deletes files that weren't in the snapshot. |
| `buildAgentContextMarkdown(project, scope, taskId)` | ~380 | Builds a Markdown document describing the project state, plan, task details, and recent conversation history. Fed to AI as system context. |
| `parseAgentResponse(rawOutput)` | ~450 | Parses AI CLI output. Strips ANSI codes, extracts structured data (file changes, status updates, error messages). |
| `savePeerConversation(projectId, conversationType, threadId, newMessages)` | ~500 | Broadcasts conversation updates to P2P peers via `p2pService.broadcastStateChange()`. |

### API Methods — Project CRUD

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `listProjects()` | — | `Project[]` | Reads all projects from settings |
| `createProject(payload)` | `{ name, description, baseDirectory?, createGithubRepo?, githubVisibility?, importFromGit? }` | `Project` | Creates project: generates ID, creates directory, runs `git init`, optionally creates GitHub repo via `gh repo create`. Initializes `.codebuddy/` shared state. Creates default dashboard. Saves to settings. |
| `deleteProject(payload)` | `{ projectId, deleteLocalFiles?, deleteGithubRepo? }` | `{ deletedLocalFiles, deletedGithubRepo }` | Removes from settings. Optionally: deletes directory (`rm -rf`), deletes GitHub repo (`gh repo delete --yes`). GitHub delete requires `delete_repo` scope. |
| `grantGithubDeleteScope()` | — | `{ success }` | Runs `gh auth refresh -s delete_repo` to grant permission |
| `setActiveProject(projectId)` | `string` | `Project` | Sets `activeProjectId` in settings |
| `ensureGithubRepoForProject(projectId)` | `string` | `Project` | If project has no remote, creates GitHub repo and pushes. Uses `gh repo create`. |

### API Methods — Plan Generation

| Method | Parameters | Description |
|--------|-----------|-------------|
| `generateProjectPlan(projectId, prompt, model)` | `string, string, string?` | Sends the project description to the AI with a structured plan prompt. Parses the response to extract subprojects and tasks. Saves plan to project dashboard. Broadcasts to P2P peers. |

### API Methods — Chat Modes

CodeBuddy has three distinct chat modes, each with its own conversation storage and context:

#### Task Chat (`sendTaskMessage`)
```javascript
sendTaskMessage({ projectId, threadId, taskId, prompt, model?, attachments? })
```
- Creates/continues a task-specific conversation thread
- System context includes the specific task details from the plan
- Creates a checkpoint before each AI invocation
- Stores messages in `dashboard.taskThreads[threadId].messages[]`
- Broadcasts new messages to P2P peers with `type: "task-agent"`

#### PM Chat (`sendPMMessage`)  
```javascript
sendPMMessage({ projectId, prompt, model?, attachments? })
```
- Project-manager-scoped conversation
- System context includes the full project plan and recent conversation history
- Stores messages in `dashboard.conversation[]`
- Broadcasts to P2P peers with `type: "project-manager"`

#### Solo/Freestyle Chat (`sendSoloMessage`)
```javascript
sendSoloMessage({ projectId, sessionId, prompt, model?, context?, attachments? })
```
- Free-form coding chat, not tied to any task
- Creates/continues named sessions stored in `dashboard.soloSessions[]`
- Each session has its own message history
- Broadcasts to P2P peers with `type: "solo-chat"`

### Common Chat Flow (all three modes)

1. **Resolve provider**: `resolveProvider(featureFlags, modelId)` → `"copilot" | "claude" | "codex"`
2. **Build context**: Assemble system prompt + conversation history + file attachments
3. **Create checkpoint**: Snapshot current project files (task chat only)
4. **Build CLI invocation**: `buildCliInvocation(provider, modelId, fullPrompt, cwd, options)`
5. **Set active request**: Store `{ processId, threadId, abortController }` in `activeRequest`
6. **Send `project:agentStarted` event** to renderer
7. **Execute CLI**: `runProviderCli()` with streaming output
8. **Stream output**: Send `project:agentOutput` events line-by-line
9. **Broadcast tokens**: Send each token to P2P peers via `p2pService.broadcastChatToken()`
10. **Complete**: Parse final response, create AI message object, append to conversation
11. **Send `project:agentCompleted` event** with exit code
12. **Broadcast completion**: Send `p2pService.broadcastChatMessage()` with final message
13. **Save to settings**: Write updated conversation to settings.json
14. **Return**: `{ threadId, messages, exitCode }`

### API Methods — Other

| Method | Description |
|--------|-------------|
| `getActiveRequest()` | Returns current active request info (for reconnecting after page navigation) |
| `cancelActiveRequest()` | Kills the running AI process. Sends `project:agentCancelled` event. |
| `forceResetAgent(repoPath)` | Kills any Claude/Copilot/Codex processes in the project directory. Resets `activeRequest` to null. |
| `launchDevServer(payload)` | Uses Copilot to analyze the project and determine the correct dev server command (`npm run dev`, `python manage.py runserver`, etc.), then launches it. |
| `listRepoCollaborators(repoPath)` | Runs `gh api repos/:owner/:repo/collaborators`. Returns collaborator list. |
| `setRepoVisibility(repoPath, visibility)` | Runs `gh api -X PATCH repos/:owner/:repo` to set public/private. |
| `editMessage(payload)` | Replaces a message in conversation history and re-runs the AI from that point. |
| `restoreCheckpoint(projectId, checkpointId)` | Restores project files from a saved checkpoint snapshot. |

### CLI Invocation Details (`buildCliInvocation`)

For **Copilot CLI** (`gh copilot`):
```
gh copilot suggest -t shell "<prompt>"
```
Or with model flag: `--model <modelId>`

For **Claude Code** (`claude`):
```
claude --print --output-format text --model <modelId> "<prompt>"
```
Uses `resolveClaudeCmd()` from tooling service to find the correct `claude.exe` path.

For **Codex CLI** (`codex`):
```
codex --model <modelId> --quiet "<prompt>"
```
If `modelId` is `"default"`, omits the `--model` flag entirely.

---

## 11. Service: Activity

**File:** `electron/services/activity-service.js`  
**Lines:** 43  
**Role:** In-memory activity event log with a 30-event cap.

### Factory

```javascript
createActivityService()
```

### Internal State

- `events: ActivityEvent[]` — circular buffer, max 30

### API Methods

| Method | Parameters | Returns |
|--------|-----------|---------|
| `addEvent(event)` | `{ type, title, description, actor, actorInitials }` | `void`. Adds timestamp, trims to 30 events, emits `activity:created` via sendEvent. |
| `getEvents()` | — | `ActivityEvent[]` — returns copy of events array |

### Event Types

Used across all handlers: `"build"`, `"status"`, `"comment"`, `"deploy"`, `"join"`, `"review"`

---

## 12. Service: Shared State

**File:** `electron/services/shared-state-service.js`  
**Lines:** 184  
**Role:** Manages the `.codebuddy/` directory inside project repos. All shared data (conversations, agents, tasks, members) stored as plain JSON files that sync via git.

### Factory

```javascript
createSharedStateService()
```

### Constants

```javascript
const SHARED_DIR = ".codebuddy";
const SUBDIRS = ["conversations", "agents", "tasks", "members", "versions", "docs"];
```

### API Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `ensureSharedDir(repoPath)` | `string` | `{ initialized: true }` | Creates `.codebuddy/` and all subdirectories. Adds `.codebuddy/.gitkeep` files. |
| `isInitialized(repoPath)` | `string` | `boolean` | Checks if `.codebuddy/` exists |
| `readSharedFile(repoPath, relativePath)` | `string, string` | `{ exists, content? }` | Reads a file from `.codebuddy/<relativePath>` |
| `writeSharedFile(repoPath, relativePath, content)` | `string, string, string` | `{ written: true }` | Writes file to `.codebuddy/<relativePath>`. Creates parent dirs if needed. |
| `listSharedDir(repoPath, relativePath)` | `string, string` | `string[]` | Lists files in `.codebuddy/<relativePath>` |
| `saveConversation(repoPath, conversationId, messages, metadata)` | `string, string, Message[], object` | `{ saved: true }` | Writes `conversations/<id>.json` with messages + metadata |
| `loadConversation(repoPath, conversationId)` | `string, string` | `{ messages, metadata }` | Reads `conversations/<id>.json` |
| `listConversations(repoPath)` | `string` | `{ id, metadata }[]` | Lists all conversation files |
| `saveMember(repoPath, memberProfile)` | `string, object` | `{ saved: true }` | Writes `members/<id>.json` |
| `listMembers(repoPath)` | `string` | `object[]` | Lists all member profiles |

---

## 13. Service: P2P

**File:** `electron/services/p2p-service.js`  
**Lines:** 661  
**Role:** Peer-to-peer collaboration via Hyperswarm + Yjs CRDTs. Supports multiple simultaneous project rooms.

### Factory

```javascript
createP2PService({ sharedStateService, sendEvent })
```

### Architecture

- **Hyperswarm** — distributed hash table for peer discovery. Each project gets a unique swarm topic derived from `sha256(remoteUrl)`.
- **Yjs** — conflict-free replicated data types for state synchronization.
- Each connected peer gets a dedicated data channel. Messages are length-prefixed JSON.

### Internal State (per project room)

```javascript
rooms: Map<projectId, {
  swarm: Hyperswarm,
  topic: Buffer,         // sha256 of remote URL
  connections: Map<peerId, { stream, name, lastSeen }>,
  ydoc: Y.Doc,
  member: { name, initials, id },
  heartbeatInterval: NodeJS.Timer,
  activePeerStreams: Map<conversationId, { peerName, tokens[], scope }>,
}>
```

### Message Protocol

All messages are JSON objects with a `type` field:

| Type | Direction | Payload | Purpose |
|------|-----------|---------|---------|
| `hello` | Both | `{ name, initials, peerId, projectId }` | Handshake on connection |
| `yjs-update` | Both | `{ update: Uint8Array }` | Yjs document state update |
| `yjs-sync` | Both | `{ stateVector: Uint8Array }` | Request missing Yjs updates |
| `heartbeat` | Both | `{ timestamp }` | Keep-alive (30s interval) |
| `chat-token` | Both | `{ conversationId, token, scope }` | Stream AI response tokens to peers |
| `chat-message` | Both | `{ conversationId, message, scope }` | Complete message (clears typing indicator) |
| `state-change` | Both | `{ category, id, data }` | Plan/task/conversation/thread state changes |

### API Methods

| Method | Parameters | Description |
|--------|-----------|-------------|
| `joinProject(projectId, repoPath, remoteUrl, member)` | Join a P2P room | Creates Hyperswarm, derives topic from `sha256(remoteUrl)`, starts listening. Emits `p2p:joined`. |
| `leaveProject(projectId)` | Leave a specific room | Closes all peer connections, destroys swarm. Emits `p2p:left`. |
| `leaveAllProjects()` | Leave all rooms | Iterates and leaves each project room. |
| `getStatus(projectId)` | Get room status | Returns `{ joined, peerCount, topic }` |
| `getConnectedPeers(projectId)` | Get peer list | Returns array of `{ peerId, name, initials, lastSeen }` |
| `getJoinedProjectIds()` | List joined rooms | Returns array of project IDs |
| `broadcastChatToken(projectId, conversationId, token, scope)` | Stream token | Sends `chat-token` message to all peers in the room |
| `broadcastChatMessage(projectId, conversationId, message, scope)` | Send complete message | Sends `chat-message` to all peers. Clears active peer stream. |
| `broadcastStateChange(projectId, category, id, data)` | Sync state | Sends `state-change` to all peers |
| `getActivePeerStreams(projectId)` | Get active streams | Returns map of peers currently streaming AI output |
| `generateInviteCode(remoteUrl, projectName)` | Generate invite | Base64-encodes `{ remoteUrl, projectName }` |
| `decodeInviteCode(code)` | Decode invite | Base64-decodes to get `{ remoteUrl, projectName }` |

### Event Callbacks

| Callback | Set By | Purpose |
|----------|--------|---------|
| `onPeerReady(callback)` | `register-handlers.js` | Called when peer completes hello handshake |
| `onStateChange(callback)` | `register-handlers.js` | Called when peer sends a state-change message |

### Connection Lifecycle

1. `joinProject()` creates Hyperswarm with topic = `sha256(remoteUrl)`
2. Swarm discovers peers via DHT (NAT traversal built-in)
3. On connection: send `hello` message with member info
4. On `hello` received: fire `onPeerReady` callback, emit `p2p:peerJoined` event
5. Start 30s heartbeat interval
6. On data: parse JSON, dispatch by `type` field
7. On connection close: emit `p2p:peerLeft`, clean up peer state
8. On `leaveProject()`: close all connections, destroy swarm, emit `p2p:left`

---

## 14. Service: File Watcher

**File:** `electron/services/file-watcher-service.js`  
**Lines:** 510  
**Role:** Watches project directories for file changes. Auto-commits and pushes to `codebuddy-build` branch. Suppresses during agent operations.

### Factory

```javascript
createFileWatcherService({ repoService, processService, p2pService, sendEvent })
```

### Internal State

- `watcher: fs.FSWatcher | null` — the active file system watcher
- `watchPath: string | null` — currently watched directory
- `debounceTimer: NodeJS.Timer | null` — 10-second debounce for auto-sync
- `agentActive: boolean` — when true, suppresses auto-sync
- `lastSyncTime: number` — epoch ms of last completed sync
- `syncInProgress: boolean` — prevents concurrent syncs

### API Methods

| Method | Parameters | Description |
|--------|-----------|-------------|
| `start({ repoPath })` | Start watching | Starts recursive `fs.watch()` on the project directory. Ignores: `node_modules`, `.git`, `.next`, `dist`, `build`, `.codebuddy`, `package-lock.json` |
| `stop()` | Stop watching | Closes the watcher and clears timers |
| `status()` | Get status | Returns `{ active, watchPath, lastSyncTime, agentActive }` |
| `triggerSync()` | Manual sync | Triggers immediate auto-sync |
| `setAgentActive(active)` | Control suppression | When `true`, file changes are detected but auto-sync is deferred until agent completes |
| `doAutoSync()` | Execute sync | The core sync operation (called after debounce or agent completion) |
| `pushToMain({ repoPath })` | Push to main | Merges `codebuddy-build` into `main` and pushes. Used for manual "push to production". |
| `autoPull(repoPath)` | Pull latest | Pulls latest changes from remote `codebuddy-build` branch |

### Auto-Sync Flow

1. File change detected by `fs.watch()` (recursive)
2. Check: is the changed path in an ignored directory? → skip
3. Reset 10-second debounce timer
4. After 10 seconds of no changes:
   - If `agentActive` → defer (sync will happen when agent finishes)
   - If `syncInProgress` → skip
   - Emit `fileWatcher:syncStart` event
   - Ensure on `codebuddy-build` branch (create if needed)
   - `git add -A`
   - `git commit -m "auto: sync changes"` (skip if nothing staged)
   - `git push origin codebuddy-build`
   - Broadcast `new-commits` state change to P2P peers
   - Emit `fileWatcher:syncComplete` event
5. On error: emit `fileWatcher:status` with error details

### `pushToMain` Flow

1. Stash any uncommitted changes
2. Switch to `main` branch
3. Merge `codebuddy-build` into `main` (`--no-edit`)
4. Push `main` to origin
5. Switch back to `codebuddy-build`
6. Pop stash
7. Broadcast `main-updated` to P2P peers

---

## 15. Dynamic Model Catalogs

**File:** `electron/config/model-catalogs.json`  
**Lines:** ~45  
**Role:** Editable JSON configuration for available AI models. Used by both frontend (model selectors) and backend (routing/validation).

### Structure

```json
{
  "_version": 1,
  "_updated": "2025-07-14",
  "_note": "Edit this file to add/remove models without rebuilding the app.",
  "copilot": [ { "id", "label", "provider", "contextWindow", "maxTokens", "usage", "group", "warning?" } ],
  "claude":  [ { "id", "label", "provider", "contextWindow", "maxTokens", "usage", "group" } ],
  "codex":   [ { "id", "label", "provider", "contextWindow", "maxTokens", "usage", "group", "warning?" } ]
}
```

### Model Entries

**Copilot (15 models):** `auto`, `claude-opus-4.6`, `claude-sonnet-4.6`, `gpt-5.4`, `claude-haiku-4.5`, `claude-opus-4.5`, `claude-sonnet-4`, `claude-sonnet-4.5`, `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview`, `gpt-5.2`, `gpt-5.1`, `o3`

**Claude (6 models):** `sonnet`, `opus`, `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5`  
*Note:* Claude model IDs use hyphens (`claude-sonnet-4-6`) not dots (`claude-sonnet-4.6`). This is critical — the Copilot catalog uses dots because Copilot's API expects them, while Claude Code CLI expects hyphens.

**Codex (8 models):** `default`, `o4-mini`, `o3`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o3-pro`, `codex-mini`

### Field Descriptions

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | CLI-specific model identifier passed to `--model` flag |
| `label` | string | Human-readable name shown in UI dropdown |
| `provider` | string | Company name (Anthropic, OpenAI, Google) |
| `contextWindow` | string | Display string ("200K", "1M") |
| `maxTokens` | number | Numeric context window size |
| `usage` | string | Billing info ("1x", "3x", "Included") |
| `group` | string | `"featured"` (shown first) or `"other"` |
| `warning` | string? | Optional warning text (e.g. "Preview model", "Requires API key") |

---

## 16. Complete IPC Channel Reference

### Invoke Channels (73 total)

| # | Channel | Handler |
|---|---------|---------|
| 1 | `system:getBuildTag` | Returns BUILD_TAG constant |
| 2 | `system:openDirectory` | Opens native directory picker dialog |
| 3 | `system:openExternal` | Opens URL in system browser (http/https only) |
| 4 | `system:getCommonPaths` | Returns desktop/documents/downloads/home paths |
| 5 | `process:run` | Spawns child process |
| 6 | `process:cancel` | Kills running process |
| 7 | `process:listRunning` | Lists active process IDs |
| 8-21 | `repo:*` | 14 git operation handlers |
| 22-25 | `settings:*` | 4 settings handlers |
| 26-44 | `project:*` | 19 project handlers |
| 45-62 | `tools:*` | 18 tool handlers |
| 63-71 | `sharedState:*` | 9 shared state handlers |
| 72-83 | `p2p:*` | 12 P2P handlers |
| 84-88 | `fileWatcher:*` | 5 file watcher handlers |
| 89 | `activity:list` | Returns activity events |

### Event/Subscribe Channels (24 total)

| Channel | Source | Purpose |
|---------|--------|---------|
| `process:started` | processService | Process spawned |
| `process:output` | processService | Process stdout/stderr line |
| `process:completed` | processService | Process exited |
| `process:error` | processService | Process error |
| `process:cancelled` | processService | Process killed |
| `process:timeout` | processService | Process timed out |
| `settings:changed` | register-handlers | Settings file updated |
| `project:agentStarted` | projectService | AI agent began processing |
| `project:agentOutput` | projectService | AI agent output chunk |
| `project:agentCompleted` | projectService | AI agent finished |
| `project:agentError` | projectService | AI agent error |
| `project:agentCancelled` | projectService | AI agent cancelled |
| `tools:githubAuthProgress` | toolingService | GitHub auth progress |
| `tools:claudeAuthProgress` | toolingService | Claude auth progress |
| `tools:codexAuthProgress` | toolingService | Codex auth progress |
| `activity:created` | activityService | New activity event |
| `fileWatcher:changed` | fileWatcherService | File system change detected |
| `fileWatcher:syncStart` | fileWatcherService | Auto-sync starting |
| `fileWatcher:syncComplete` | fileWatcherService | Auto-sync finished |
| `fileWatcher:peerSync` | register-handlers | Peer pushed new commits |
| `fileWatcher:status` | fileWatcherService | Watcher status update |
| `p2p:joined` | p2pService | Joined P2P room |
| `p2p:left` | p2pService | Left P2P room |
| `p2p:peerJoined` | p2pService | Peer connected |
| `p2p:peerLeft` | p2pService | Peer disconnected |
| `p2p:presence` | p2pService | Peer heartbeat/presence |
| `p2p:chatToken` | p2pService | Streaming AI token from peer |
| `p2p:chatMessage` | p2pService | Complete message from peer |
| `p2p:stateChanged` | p2pService | State change from peer |
| `p2p:reconnecting` | p2pService | Reconnection attempt |
| `fileWatcher:mainUpdated` | register-handlers | Peer pushed to main |
| `agentContext:peerUpdated` | register-handlers | Peer updated agent context |

---

## 17. Frontend Architecture

The frontend uses **Next.js App Router** with static export (`output: "export"`).

### Route Structure

```
src/app/
├── page.tsx                  → /           (root redirect)
├── root-redirect.tsx         → (component)
├── layout.tsx                → Root layout
├── globals.css               → Design system
├── home/
│   ├── layout.tsx            → /home layout
│   └── page.tsx              → /home
├── onboarding/
│   ├── layout.tsx            → /onboarding layout
│   └── page.tsx              → /onboarding
├── people/
│   ├── layout.tsx            → /people layout
│   └── page.tsx              → /people
├── settings/
│   ├── layout.tsx            → /settings layout
│   └── page.tsx              → /settings
└── project/
    ├── layout.tsx            → /project layout
    ├── page.tsx              → /project (workspace dashboard)
    ├── chat/
    │   └── page.tsx          → /project/chat (PM Chat)
    ├── code/
    │   ├── layout.tsx
    │   └── page.tsx          → /project/code (Freestyle)
    ├── files/
    │   └── page.tsx          → /project/files
    ├── preview/
    │   └── page.tsx          → /project/preview
    ├── activity/
    │   └── page.tsx          → /project/activity
    ├── artifacts/
    │   ├── layout.tsx
    │   └── page.tsx          → /project/artifacts (Downloads)
    ├── docs/
    │   ├── layout.tsx
    │   └── page.tsx          → /project/docs
    ├── messages/
    │   └── page.tsx          → /project/messages
    └── settings/
        └── page.tsx          → /project/settings
```

### Component Architecture

```
src/components/
├── index.ts            → Re-exports: Avatar, StatusDot, Navbar, ChatBubble, EmptyState
├── navbar.tsx           → Top navigation bar
├── project-sidebar.tsx  → Project page sidebar with 9 nav items
├── theme-provider.tsx   → Light/dark theme context
├── avatar.tsx           → Initials-based avatar
├── avatar-stack.tsx     → Overlapping avatar row
├── chat-bubble.tsx      → Chat message bubble (3 variants)
├── empty-state.tsx      → Empty state placeholder
├── expert-card.tsx      → Expert profile card
├── feature-icon.tsx     → 6 SVG icon variants
├── progress-ring.tsx    → Circular progress SVG
├── project-card.tsx     → Project grid card
├── stat-block.tsx       → Stat display block
├── status-dot.tsx       → Online/busy/offline indicator
├── task-row.tsx         → Task list row
└── timeline-item.tsx    → Timeline entry with connector
```

### Shared Hooks

```
src/hooks/
└── use-active-desktop-project.ts  → Loads active project from settings
```

### Lib

```
src/lib/
├── electron.d.ts   → TypeScript declarations for window.electronAPI (759 lines)
└── mock-data.ts    → All mock/demo data + type definitions (1,123 lines)
```

---

## 18. Frontend: Root and Layout

### `src/app/page.tsx` (4 lines)
Root entry point. Renders `<RootRedirect />`.

### `src/app/root-redirect.tsx` (37 lines)
Client component. Checks `window.electronAPI.settings.isFirstRun()`.
- If first run → `router.replace("/onboarding")`
- If not → `router.replace("/home")`
- Shows CB logo spinner while loading.

### `src/app/layout.tsx` (33 lines)
Root layout. Server component.
- Configures **Inter** (body text) and **Instrument Sans** (display text) fonts
- Wraps children in `<ThemeProvider>`
- Adds `ambient-mesh` background div for subtle animated background

### `src/app/globals.css` (563 lines)
Comprehensive design system:
- Tailwind `@tailwind` directives
- CSS custom properties for light/dark themes (23 variables each)
- Glass morphism utility classes (`.glass`, `.glass-heavy`, `.glass-card`)
- Surface classes (`.surface-primary`, `.surface-secondary`, `.surface-elevated`)
- Card variants (`.card-base`, `.card-interactive`, `.card-highlighted`)
- Ambient mesh animation (`.ambient-mesh` with radial gradient keyframes)
- Custom scrollbar styles
- Typography scale classes (`text-body`, `text-label`, `display-font`)
- Avatar ring glow animation
- Status dot animations (live pulse, busy pulse)
- Pill badge styles
- Gradient page backgrounds

---

## 19. Frontend: Onboarding

**File:** `src/app/onboarding/page.tsx`  
**Lines:** 1,088

### Steps (6-step wizard)

1. **Welcome** — Branding, "Get Started" CTA
2. **Tools** — Detects/installs: Git, Node.js, Python, GitHub CLI, Copilot CLI, Claude Code, Codex CLI
3. **GitHub** — GitHub device-flow OAuth authentication
4. **Provider** — Select AI providers to enable (Copilot, Claude, Codex toggles)
5. **Profile** — Set display name
6. **Done** — Completion screen with optional invite code

### Key State Variables (~20)

| State | Type | Purpose |
|-------|------|---------|
| `step` | `Step` enum | Current wizard step |
| `displayName` | `string` | User's display name |
| `git/gh/copilot/claude/node/python/codex` | `ToolCheckState` | Per-tool: `{ status, version?, detail? }` |
| `selectedProviders` | `Set<ProviderKey>` | Which AI providers are enabled |
| `ghAuthStatus/Username/DeviceCode/Url/Error` | mixed | GitHub OAuth state |
| `claudeAuthStatus/Error` | mixed | Claude auth state |
| `codexAuthStatus/Error` | mixed | Codex auth state |
| `activeInstallPhases` | `Map` | Animation state for install progress |

### IPC Calls

- `tools.listStatus()` — Check all tool availability
- `tools.install{Copilot,Claude,Codex,Node,Git,Gh,Python}()` — Install individual tools
- `tools.githubAuthStatus/Login()` — GitHub OAuth flow
- `tools.claudeAuthStatus/Login()` — Claude auth
- `tools.codexAuthStatus/Login()` — Codex auth
- `settings.update()` — Save feature flags + display name
- `settings.completeOnboarding()` — Mark onboarding done
- `system.openExternal()` — Open GitHub device code URL

### Tool Detection Flow

`checkAllTools()` calls `tools.listStatus()` and maps results to individual tool states. Each tool card shows:
- Status icon (spinner/check/x)
- Version if available
- Install button if not available
- Install log during installation

---

## 20. Frontend: Home

**File:** `src/app/home/page.tsx`  
**Lines:** 1,355

### Tabs

1. **Projects** — Grid of project cards with create/import/delete
2. **Coding Friends** — Friend list with messaging (placeholder)

### Key State Variables (~30)

| State | Type | Purpose |
|-------|------|---------|
| `projects` | `ManagedProject[]` | Loaded from `project.list()` |
| `showCreator` | `boolean` | Project creation modal |
| `draftName/Description/BaseDirectory` | `string` | Creation form fields |
| `createGithubRepo/githubVisibility` | `boolean/string` | GitHub integration options |
| `importMode/importPath` | `string` | Import existing project |
| `projectPendingDelete/deletingId/deleteMode` | mixed | Delete confirmation flow |
| `showJoinInvite/joinInviteCode/Loading/Error/Step` | mixed | P2P invite join flow |
| `defaultProjectRoot/commonPaths/canPickProjectLocation` | mixed | Directory selection |

### Project Creation Flow

1. User fills name/description, optionally chooses directory
2. Optionally enables GitHub repo creation (public/private)
3. `project.create()` → creates directory, git init, optional GitHub repo
4. Redirects to `/project` (workspace dashboard)

### P2P Invite Join Flow

1. User pastes invite code
2. `p2p.decodeInvite()` → shows project name + remote URL
3. User optionally picks target directory
4. `p2p.acceptInvite()` → clone → create project → set active
5. Redirects to `/project`

### Project Delete Flow

Three delete modes:
- **CodeBuddy only** — removes from settings, keeps files
- **Local files too** — removes from settings + deletes directory
- **Everything** — removes from settings + deletes directory + deletes GitHub repo (requires `delete_repo` scope)

---

## 21. Frontend: Project Workspace

**File:** `src/app/project/page.tsx`  
**Lines:** 2,190

### Layout

Project workspace dashboard with:
- Header: project name, sync/push/P2P controls
- Kanban board: subprojects as columns, tasks as cards
- Task detail modal
- Action items panel with AI chat

### Key State Variables (~40)

| State | Type | Purpose |
|-------|------|---------|
| `subprojects` | `ProjectSubproject[]` | Kanban columns |
| `showSubprojectCreator/TaskCreator/TaskDetails` | `boolean` | Modal toggles |
| `subprojectOrder/taskOrder` | `string[]` | Drag ordering |
| `fileWatcherActive/autoSyncing/lastAutoSync` | mixed | File sync status |
| `p2pJoined/Joining/Peers/Error/inviteCode` | mixed | P2P connection state |
| `pushingToGithub/Main/pushResult` | mixed | Git push state |

### Task Status Values

`"todo"`, `"in-progress"`, `"review"`, `"done"`

### Sync Controls

- **Sync Workspace**: Pulls latest from git, imports plan from `.codebuddy/plan.json`
- **Push to GitHub**: Pushes current branch to remote
- **Push to Main**: Merges `codebuddy-build` into `main` and pushes
- **P2P Toggle**: Joins/leaves the Hyperswarm room for real-time collaboration

### Auto-Sync

30-second interval + window focus triggers `project.syncWorkspace()` in background.

### Action Items (embedded component: `ActionItemsSection`)

AI-powered action item scanner:
- `handleCheckForItems()` — asks AI to scan project for action items
- `handleAskForHelp(item)` — asks AI for help on specific action item
- Chat interface for follow-up questions
- Items have: type (bug/feature/improvement), priority, completion checkbox

---

## 22. Frontend: PM Chat

**File:** `src/app/project/chat/page.tsx`  
**Lines:** 5,206 (largest frontend file)

### Architecture

Dual-mode page:
1. **Mock mode** (`ProjectChatPageContent`) — demo/mock-data projects
2. **Real mode** (`RealProjectChatPage`) — desktop projects with actual AI

### `ProjectChatPageContent` — Mock Mode

State (~38 variables). Provides a fully interactive UI with:
- Build artifact inspector (4 tabs: details, preview, code, files)
- Monaco editor for code viewing
- Provider tab selector (Copilot/Claude/Codex)
- Model dropdown with featured/other groups
- Quick prompt menu
- File attachment dropzone
- Copilot prompt execution via `tools.runGenericPrompt()` / `tools.runCopilotPrompt()`

### `RealProjectChatPage` — Real Mode

State (~40 variables). Full-featured AI chat:

| Feature | Implementation |
|---------|---------------|
| **Message sending** | `project.sendPmMessage()` → streams response via `project.onAgentOutput()` |
| **Model selection** | Dynamic catalogs from `tools.getModelCatalogs()` with provider tabs |
| **File attachments** | Drag-drop or click. `ComposerAttachment[]` with file content. Embedded in prompt. |
| **Streaming** | `project.onAgentOutput()` listener updates `agentLiveStatus` in real-time |
| **P2P peer streams** | Shows other users' AI responses in real-time via `p2p.onChatToken()` |
| **Build artifacts** | Extracts file changes from AI responses, shows in split-pane inspector |
| **Inline editing** | Edit previous messages, re-run AI from that point |
| **Checkpoint restore** | Restore project files to pre-AI state |
| **Quick prompts** | Pre-built prompts: "Review code", "Fix bugs", "Add tests", etc. |
| **Preview server** | Launch and view dev server output in embedded panel |
| **Keyboard shortcuts** | Cmd+Enter to send |

### Key Internal Functions

| Function | Purpose |
|----------|---------|
| `getActiveModelCatalog(catalogSources, providerTab, featureFlags)` | Filters model catalog by active provider tab |
| `getDefaultModelId(catalog, providerTab)` | Returns first featured model ID for provider |
| `getModelRecommendation(catalog, providerTab)` | Returns recommended model entry |
| `estimateTokens(text)` | Rough token count: `text.length / 4` |
| `buildPromptWithAttachments(prompt, attachments)` | Wraps prompt with file contents in XML-like tags |
| `buildRealProjectManagerMarkdown(project, conversation)` | Builds full context markdown for PM mode |
| `renderChatMessageBody(text)` | Renders message with inline formatting (bold, code, links) |

### Provider Tab System

The model selector shows tabs for each enabled provider:
1. Read feature flags from settings → determine which providers are enabled
2. Load model catalogs from `tools.getModelCatalogs()`
3. Group models by provider tab (Copilot/Claude/Codex)
4. Each tab shows models from that provider's catalog
5. Selected model ID is from the active provider's catalog (correct CLI-specific format)

---

## 23. Frontend: Freestyle (Solo Chat)

**File:** `src/app/project/code/page.tsx`  
**Lines:** 1,527

### Architecture

Tab-based session manager + chat + code viewing IDE.

### Key Features

| Feature | Implementation |
|---------|---------------|
| **Sessions** | Multiple named chat sessions per project. CRUD via `soloSessions[]` in project dashboard. |
| **Model selection** | Same dynamic catalog system as PM Chat. Provider tabs + model dropdown. |
| **Chat** | `project.sendSoloMessage()` with streaming via `project.onAgentOutput()` |
| **Right panel** | Three modes: File Tree, Terminal, Code Changes |
| **File tree** | `repo.listDirectory()` + `repo.readFileContent()` → Monaco viewer |
| **Terminal** | Execute commands via `process.run()`. Shows output. Cancel via `process.cancel()`. |
| **P2P peer streams** | Same as PM Chat |
| **Context panel** | View/edit system prompt and agent context |

### Key State Variables (~35)

| State | Type | Purpose |
|-------|------|---------|
| `sessions` | `SoloSession[]` | All freestyle sessions |
| `activeSessionId` | `string` | Current session |
| `openTabIds` | `string[]` | Open session tabs |
| `rightPanel` | `"files" \| "terminal" \| "changes" \| null` | Right panel mode |
| `fileTree/fileTreePath` | mixed | File browser state |
| `terminalOutput/Command/ProcessId` | mixed | Terminal state |
| `catalogSources` | `CatalogSources` | Dynamic model catalogs |
| `providerTab` | `string` | Active provider tab |
| `peerStreams` | `Map` | Active P2P streams |

### Session Lifecycle

1. `handleNewSession()` — creates new session with auto-generated name
2. Session stored in `dashboard.soloSessions[]` via settings
3. Messages accumulated in `session.messages[]`
4. Tab system: sessions open as tabs, closeable

---

## 24. Frontend: Files

**File:** `src/app/project/files/page.tsx`  
**Lines:** 976

### Three Tabs

1. **Code** — Directory listing with file/folder navigation
2. **Updates** — Git commit history with details
3. **IDE** — Multi-tab text editor with diff viewer

### Key Features

| Feature | Implementation |
|---------|---------------|
| **Directory browsing** | `repo.listDirectory()` with parent navigation |
| **File viewing** | `repo.readFileContent()` → Monaco editor |
| **File editing** | Edit in Monaco → `repo.writeFileContent()` on Ctrl+S |
| **Git staging** | `repo.stageFiles()` / `repo.unstageFiles()` |
| **Commits** | `repo.commit()` with auto-push |
| **Diff viewer** | `repo.getFileDiff()` — shows unified diff |
| **Branch management** | `repo.checkoutBranch()` — switch/create branches |
| **Commit details** | `repo.getCommitDetails()` — files changed per commit |
| **GitHub repo** | `project.ensureGithubRepo()` — create/connect repo |

### Key State Variables (~25)

| State | Type | Purpose |
|-------|------|---------|
| `tab` | `"code" \| "updates" \| "ide"` | Active tab |
| `liveDirectoryEntries` | `LiveDirectoryEntry[]` | Current directory listing |
| `currentDirectoryPath` | `string` | Current browsing path |
| `openEditorTabs` | `string[]` | Open file tabs in IDE |
| `selectedDiffPath/Text/Staged` | mixed | Diff viewer state |
| `commitMessage` | `string` | Commit message input |
| `branchDraft` | `string` | New branch name input |

---

## 25. Frontend: Preview

**File:** `src/app/project/preview/page.tsx`  
**Lines:** 559

### Architecture

Launches the project's dev server and renders it in a `<webview>` element.

### Preview Flow

1. `handleRunApp()` → `project.launchDevServer()` → AI determines correct command
2. Listen to `process:output` events for server output
3. Regex scan output for localhost URLs
4. Health-check detected URL with fetch
5. If URL is healthy → load in `<webview>`
6. If no URL detected → probe common ports (3000, 3001, 5173, 8000, 8080)

### Device Modes

Three responsive sizes:
- Desktop (100% width)
- Tablet (768px)
- Mobile (375px)

### Modes

- **Web** — `<webview>` rendering the detected URL
- **Terminal** — Shows raw server output

### Key State Variables (~15)

| State | Type | Purpose |
|-------|------|---------|
| `previewProcessId` | `string \| null` | Running server process |
| `previewReady` | `boolean` | URL detected and healthy |
| `detectedPreviewUrl` | `string \| null` | Auto-detected localhost URL |
| `previewMode` | `"web" \| "terminal"` | Display mode |
| `device` | `"desktop" \| "tablet" \| "mobile"` | Responsive size |
| `previewFullscreen` | `boolean` | Fullscreen overlay |

---

## 26. Frontend: Activity

**File:** `src/app/project/activity/page.tsx`  
**Lines:** 269

### Views

1. **Categories** — Events grouped by type (build/review/comment/status/deploy/join)
2. **All** — Flat chronological list

### Features

- Loads real events from `activity.list()`
- Live updates via `activity.onCreated()` subscription
- Person filter buttons
- Collapsible category groups

---

## 27. Frontend: Artifacts

**File:** `src/app/project/artifacts/page.tsx`  
**Lines:** 384

### Purpose

Shows files generated by AI agents across all chat sessions. Extracts file references from AI response messages via regex patterns.

### Features

- Grid/list view toggle
- Session filter dropdown
- File preview panel with `repo.readFileContent()`
- Stats: total files, sessions, file types

---

## 28. Frontend: Documentation

**File:** `src/app/project/docs/page.tsx`  
**Lines:** 211

### Purpose

Auto-generates project documentation sections (overview, getting started, project structure, API reference).

### Implementation

Currently uses a simulated 2-second delay (mock). The generated docs are expandable accordion cards with inline markdown rendering.

---

## 29. Frontend: Messages

**File:** `src/app/project/messages/page.tsx`  
**Lines:** 257

### Purpose

Team chat and direct messages. Two views: team channels and direct message threads.

### Implementation

Data comes from the active project dashboard (via `useActiveDesktopProject` hook). Currently renders pre-existing channel/DM data from the project — the chat input is present but sends messages that stay local.

---

## 30. Frontend: Project Settings

**File:** `src/app/project/settings/page.tsx`  
**Lines:** 385

### Sections

1. **General** — Project name, description, repository visibility
2. **Collaborators** — GitHub API collaborator list via `project.listCollaborators()`
3. **System Prompt** — Edit the planner system prompt (saved to `settings.update()`)
4. **Shared Workspace** — Initialize `.codebuddy/` folder, view synced members/conversations
5. **Danger Zone** — Delete project

### IPC Calls

- `project.listCollaborators(repoPath)` — fetch GitHub collaborators
- `project.setRepoVisibility({ repoPath, visibility })` — toggle public/private
- `sharedState.isInitialized/init/listMembers/listConversations` — shared workspace
- `settings.get/update` — read/write project settings
- `tools.githubListAccounts()` — current GitHub user

---

## 31. Frontend: App Settings

**File:** `src/app/settings/page.tsx`  
**Lines:** 891

### Sections

1. **Theme** — Light/dark toggle
2. **GitHub Accounts** — Multi-account management with device-flow auth
3. **AI Tools** — Three tool cards (Copilot, Claude, Codex) with install/check/toggle
4. **Desktop Integration** — CLI paths, project defaults, default model selection

### GitHub Multi-Account Flow

1. Start auth → `tools.githubAuthLogin()` → device code + verification URL
2. User opens URL, enters code
3. Auth completes → account added
4. Switch: `tools.githubSwitchAccount(username)`
5. Remove: `tools.githubAuthLogout(username)`

### AI Tool Cards

Each shows:
- Install state (not installed / installing / installed)
- Version
- Auth state (not authenticated / authenticating / authenticated)
- Enable/disable toggle (sets feature flag)
- Expand for detailed status

---

## 32. Frontend: People

**File:** `src/app/people/page.tsx`  
**Lines:** 44

Server component. Renders friend list from mock data with avatars, status dots, and a message button. Has an "Invite someone" section. Static — no IPC calls.

---

## 33. Shared Components

### `project-sidebar.tsx` (360 lines)
Fixed sidebar for project pages. 9 navigation items:
1. Workspace (`/project`)
2. PM Chat (`/project/chat`)
3. Freestyle (`/project/code`)
4. Files (`/project/files`)
5. Downloads (`/project/artifacts`)
6. Preview (`/project/preview`)
7. Activity (`/project/activity`)
8. Documentation (`/project/docs`)
9. Project settings (`/project/settings`)

Features: Collapsible, chat tree grouped by subproject→task→thread, user avatar at bottom.

### `navbar.tsx` (67 lines)
Top navigation bar: CB logo, "All Projects" / "Coding Friends" tab links, user avatar. Hidden on project dashboard routes.

### `theme-provider.tsx` (36 lines)
React context for light/dark theme. Stores preference in localStorage (`cb-theme`). Falls back to `prefers-color-scheme`. Toggles `dark` CSS class on `<html>`.

### `chat-bubble.tsx` (102 lines)
Three message variants:
- **User** — right-aligned, dark background
- **AI** — left-aligned with gradient ✦ avatar, optional build artifact card
- **Other** — left-aligned with initials avatar

### `avatar.tsx` (23 lines)
Initials-based avatar with `sm/md/lg` sizes, optional online dot, optional ring glow.

### `avatar-stack.tsx` (24 lines)
Overlapping avatar row with overflow count badge. `max` prop (default 4).

### Other Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| `empty-state.tsx` | 18 | Empty state with emoji, title, description, action button |
| `expert-card.tsx` | 39 | Expert profile card (marketplace concept) |
| `feature-icon.tsx` | 68 | 6 SVG icon variants: room, ai, tasks, friends, timeline, expert |
| `progress-ring.tsx` | 42 | SVG circular progress indicator |
| `project-card.tsx` | 31 | Project card with progress ring + avatar stack |
| `stat-block.tsx` | 19 | Large stat value with label |
| `status-dot.tsx` | 12 | Live/busy/offline dot indicator |
| `task-row.tsx` | 30 | Task row with priority dot and status pill |
| `timeline-item.tsx` | 29 | Timeline entry with colored connector |

---

## 34. Custom Hooks

### `use-active-desktop-project.ts` (126 lines)

Loads the active project from `electronAPI.settings.get()`, normalizes it, and listens for settings changes.

```typescript
function useActiveDesktopProject(): { activeProject, canUseDesktopProject }
```

**Internal helpers:**
- `createDefaultDashboard()` — creates fresh dashboard if missing
- `normalizeActiveProject()` — ensures all required fields exist

**IPC calls:**
- `settings.get()` — initial load
- `settings.onChanged()` — subscription for updates

---

## 35. Type Definitions

**File:** `src/lib/electron.d.ts`  
**Lines:** 759

Declares the `window.electronAPI` TypeScript interface for the entire IPC surface. Key type definitions:

### Core Types

| Type | Description |
|------|-------------|
| `ElectronAPI` | Main interface with all 11 namespaces |
| `DesktopProject` | `{ id, name, description, repoPath, githubRepoUrl?, createdAt, creatorName?, dashboard }` |
| `ProjectDashboard` | `{ plan?, conversation[], taskThreads[], soloSessions[], projectManagerContextMarkdown? }` |
| `DesktopSettings` | Full settings object shape |
| `ToolStatus` | `{ id, name, available, version?, path?, detail? }` |
| `ModelCatalog` | `{ id, label, provider, contextWindow, maxTokens, usage, group, warning? }` |
| `ProcessRunPayload` | `{ command, cwd, options? }` |
| `RepoInspection` | `{ repoPath, branch, status[], recentCommits[], branches[] }` |
| `SoloSession` | `{ id, title, messages[], context? }` |
| `ComposerAttachment` | `{ name, path, content, size }` |

### P2P Types

| Type | Description |
|------|-------------|
| `P2PMember` | `{ name, initials, id }` |
| `P2PPeer` | `{ peerId, name, initials, lastSeen }` |
| `P2PStatus` | `{ joined, peerCount, topic }` |

---

## 36. Mock Data

**File:** `src/lib/mock-data.ts`  
**Lines:** 1,123

Provides all mock/demo data and type definitions for the app's data model.

### Type Exports (30+)

| Type | Purpose |
|------|---------|
| `Friend` | Friend with name, initials, color, status |
| `Project` | Project with tasks, events, members |
| `Task` | Task with priority, status, assignee |
| `BuildArtifact` | AI-generated build with multi-mode preview |
| `ProjectBuildPlan` | Structured plan with subprojects/tasks |
| `Message` | Chat message (user/AI/system) |
| `SoloSession` | Freestyle chat session |

### Data Exports

- `friends` — 5 demo friends
- `ideas` — 3 project ideas
- `buildArtifacts` — 6 demo build artifacts with interface/flow/runtime/data previews
- `projectBuildPlans` — 2 complete demo plans with subprojects, tasks, threads
- `conversation` — 8 demo PM chat messages
- `taskConversationThreads` — 3 demo task threads
- `repoTree` — complete mock file tree

---

## 37. Design System

### Tailwind Config (`tailwind.config.ts`)

**Dark mode:** class-based

**Custom Colors (14):**

| Token | Hex | Purpose |
|-------|-----|---------|
| `ink` | #0a0a0a | Primary text |
| `ink-secondary` | #3a3a3a | Secondary text |
| `ink-muted` | #8a8a8a | Muted text |
| `sun` | #ff9f1c | Primary accent (amber/gold) |
| `sun-light` | #fff0d4 | Sun tint |
| `cream` | #fafaf8 | Background |
| `cream-deep` | #f0efe8 | Deeper background |
| `coral` | #ff6b6b | Alert/error |
| `coral-light` | #ffe0e0 | Coral tint |
| `aqua` | #4ecdc4 | Success |
| `aqua-light` | #d4f5f2 | Aqua tint |
| `violet` | #7c5cfc | Feature accent |
| `violet-light` | #ede8ff | Violet tint |
| `glass/glass-heavy` | rgba white | Glass morphism |

**Custom Animations (9):** fade-in, fade-up, slide-in-right, scale-in, pulse-soft, float, shimmer, orbit, breathe

**Custom Shadows (7):** card, card-hover, glow, glow-coral, glow-violet, float, inner-ring

**Custom Font Sizes (8):** display-xl through label, each with line-height, letter-spacing, font-weight

---

## 38. Build & Deploy Pipeline

### npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev --turbopack` | Dev mode with Turbopack |
| `dev:electron` | `concurrently` Next.js + Electron | Full dev environment |
| `build` | `next build` | Static export to `out/` |
| `build:electron` | `next build && electron-builder` | Full production build |
| `deploy` | build + copy to install folder | Builds and deploys to `C:\Users\cameron\Desktop\CodeBuddy Install\` |

### electron-builder Config

```json
{
  "appId": "com.codebuddy.app",
  "productName": "CodeBuddy",
  "files": ["electron/**/*", "out/**/*"],
  "directories": { "output": "dist-electron", "buildResources": "build/" },
  "win": {
    "target": "nsis",
    "signAndEditExecutable": false,
    "icon": "build/icon.ico"
  },
  "nsis": {
    "allowToChangeInstallationDirectory": true,
    "oneClick": false
  }
}
```

### Next.js Config

```typescript
{ output: "export", reactStrictMode: true }
```

The `output: "export"` is critical — it produces a static `out/` directory that Electron serves via localhost HTTP server (not `file://` protocol).

### Deploy Flow

1. `next build` → generates `out/` (static HTML/CSS/JS)
2. `electron-builder` → packages `out/` + `electron/` into `dist-electron/win-unpacked/`
3. Copy `win-unpacked/*` → `C:\Users\cameron\Desktop\CodeBuddy Install\`
4. Copy utility scripts: `FRESH-START.bat`, `UPDATE.ps1`, `debug-start.bat`

---

## 39. Scripts & Utilities

### `debug-start.bat`
Launches CodeBuddy with diagnostic logging. Tries 4 paths in order:
1. Same folder (deployed install)
2. `dist-electron\win-unpacked\` (dev build)
3. `%LOCALAPPDATA%\Programs\codebuddy\` (NSIS install)
4. `npx electron .` (dev mode)

All paths pass `--enable-logging --v=1` and pipe stderr to stdout.

### `FRESH-START.bat`
Factory reset: kills process → deletes `%APPDATA%/codebuddy` + `%LOCALAPPDATA%/codebuddy` → relaunches.

### `UNINSTALL-ALL.bat`
Complete uninstaller with auto-elevation to Administrator. Removes in 8 steps:
1. CodeBuddy process
2. CodeBuddy app data
3. Codex CLI (npm + config)
4. Claude Code (npm + winget + config)
5. GitHub Copilot CLI (gh extension + npm + winget)
6. GitHub CLI (winget + registry + auth revoke)
7. Node.js + npm (winget + registry + folders)
8. Python + Git (winget)

### `deploy-clean.ps1`
Clean-install deploy: kill → delete old install → copy fresh `dist-electron/win-unpacked/` → verify → launch.

### `UPDATE.ps1`
Data-preserving update: kill → preserve settings → clear GPU/code cache only → verify → launch.

### `scripts/generate-icon.ps1`
Generates multi-resolution ICO + PNG icon using .NET System.Drawing. Draws "CB" in white Consolas bold on indigo-violet gradient. Sizes: 256, 128, 64, 48, 32, 16.

### `scripts/update-desktop-shortcut.js`
Creates Windows desktop shortcut (.lnk) via PowerShell + WScript.Shell COM object.

---

## 40. Data Flow Diagrams

### Chat Message Flow (Task/PM/Solo)

```
User types message in renderer
        │
        ▼
project.sendTaskMessage/sendPMMessage/sendSoloMessage  (IPC invoke)
        │
        ▼
register-handlers.js
  ├── fileWatcherService.setAgentActive(true)
  ├── projectService.send*Message(payload)
  │       │
  │       ▼
  │   resolveProvider(featureFlags, modelId) → "copilot"|"claude"|"codex"
  │       │
  │       ▼
  │   buildCliInvocation(provider, modelId, prompt, cwd)
  │       │
  │       ▼
  │   createCheckpoint(repoPath)  [task chat only]
  │       │
  │       ▼
  │   runProviderCli() → spawns CLI process
  │       │
  │       ├── sendEvent("project:agentStarted")
  │       ├── sendEvent("project:agentOutput") ◄── streaming line by line
  │       ├── p2pService.broadcastChatToken()  ◄── stream to peers
  │       ├── sendEvent("project:agentCompleted")
  │       └── p2pService.broadcastChatMessage() ◄── final message to peers
  │       │
  │       ▼
  │   Save messages to settings.json
  │       │
  │       ▼
  │   sendEvent("settings:changed")
  │
  ├── fileWatcherService.setAgentActive(false)
  └── fileWatcherService.doAutoSync()
        │
        ▼
  Auto-commit + push to codebuddy-build
        │
        ▼
  p2pService.broadcastStateChange("new-commits")
```

### P2P State Sync Flow

```
Peer A makes change (e.g., moves task to "done")
        │
        ▼
  p2p.broadcastStateChange(projectId, "tasks", taskId, { status: "done" })
        │
        ▼
  All peers receive "state-change" message
        │
        ▼
  register-handlers.js → onStateChange callback
        │
        ▼
  settingsService.atomicUpdate() — merge change into local settings
        │
        ▼
  sendEvent("settings:changed") — update renderer
```

### File Watcher Auto-Sync Flow

```
File changed on disk
        │
        ▼
  fs.watch() detects change
        │
        ▼
  Check: ignored path? → skip
  Check: agentActive? → defer
        │
        ▼
  Start 10-second debounce timer
        │
        ▼ (10 seconds of quiet)
        │
  git checkout codebuddy-build (create if needed)
        │
  git add -A
        │
  git commit -m "auto: sync changes"
        │
  git push origin codebuddy-build
        │
        ▼
  p2pService.broadcastStateChange("new-commits")
        │
        ▼
  All peers receive → fileWatcherService.autoPull()
```

---

## 41. Security Model

### Electron Security

| Control | Implementation |
|---------|---------------|
| Context isolation | `contextIsolation: true` — renderer cannot access Node |
| No Node in renderer | `nodeIntegration: false` — no `require()` |
| Preload API boundary | Only `window.electronAPI` methods exposed |
| Webview sandbox | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` |
| Window opening blocked | `setWindowOpenHandler(() => ({ action: "deny" }))` |
| URL validation | `system:openExternal` only allows `http://` and `https://` |
| Cache clearing | Clears HTTP + code cache on startup (production) |

### Git Security

| Control | Implementation |
|---------|---------------|
| No terminal prompts | `GIT_TERMINAL_PROMPT=0` on all git operations |
| No interactive credentials | `GCM_INTERACTIVE=never` on all git operations |
| Credential helper | `gh auth git-credential` for GitHub authentication |
| Scoped deletion | `delete_repo` scope required for repo deletion, granted via `gh auth refresh` |

### Data Security

| Control | Implementation |
|---------|---------------|
| Local-first storage | Settings in `%APPDATA%/codebuddy/settings.json` |
| Atomic writes | Write tmp → backup old → rename tmp (prevents corruption) |
| No cloud dependency | All data on local disk + git repos |
| P2P encryption | Hyperswarm uses Noise protocol for encrypted connections |

---

## 42. Settings Schema

### Full Settings Object

```typescript
interface Settings {
  onboardingCompleted: boolean;
  workspaceRoots: string[];
  recentRepositories: string[];
  projects: Project[];
  activeProjectId: string | null;
  projectDefaults: {
    rootDirectory: string | null;
    createGithubRepo: boolean;         // default: true
    githubVisibility: "private" | "public";  // default: "private"
    copilotModel: string;              // default: "claude-sonnet-4.6"
  };
  shell: {
    defaultShell: string;              // default: "powershell"
  };
  cliTools: {
    git: string;    // configured path or ""
    gh: string;
    copilot: string;
    claude: string;
    codex: string;
    node: string;
    npm: string;
    python: string;
  };
  featureFlags: {
    githubCopilotCli: boolean;   // default: true
    claudeCode: boolean;         // default: false
    codexCli: boolean;           // default: false
    githubCompanion: boolean;    // default: false
  };
}
```

### Project Object

```typescript
interface Project {
  id: string;
  name: string;
  description: string;
  repoPath: string;
  githubRepoUrl?: string;
  createdAt: string;
  creatorName?: string;
  dashboard: ProjectDashboard;
}
```

### Dashboard Object

```typescript
interface ProjectDashboard {
  systemPromptMarkdown: string;
  plan?: {
    subprojects: Subproject[];
  };
  conversation: Message[];           // PM chat messages
  taskThreads: TaskThread[];         // task-scoped conversations
  soloSessions: SoloSession[];       // freestyle sessions
  projectManagerContextMarkdown?: string;
}
```

### Subproject & Task

```typescript
interface Subproject {
  id: string;
  title: string;
  description?: string;
  tasks: Task[];
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in-progress" | "review" | "done";
  assignee?: string;
  dueDate?: string;
  priority?: "low" | "medium" | "high";
}
```

### Message

```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  model?: string;
  checkpointId?: string;
  fromPeer?: boolean;
  peerName?: string;
  attachments?: { name: string; content: string }[];
}
```

### SoloSession

```typescript
interface SoloSession {
  id: string;
  title: string;
  messages: Message[];
  context?: string;
}
```

### TaskThread

```typescript
interface TaskThread {
  id: string;
  taskId: string;
  title: string;
  agentName: string;
  messages: Message[];
}
```

---

*End of PRD — every module, function, IPC channel, component, state variable, and data flow in CodeBuddy v32 is documented above.*
