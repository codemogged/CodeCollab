# 02 — Electron Backend

This document covers every file under `electron/`. Each section lists the file's purpose, every
exported function / IPC handler, the key internal helpers, IPC channels consumed or emitted, and
notable state.

**Files covered (14):**

1. [`electron/main.js`](#1-electronmainjs)
2. [`electron/preload.js`](#2-electronpreloadjs)
3. [`electron/ipc/register-handlers.js`](#3-electronipcregister-handlersjs)
4. [`electron/services/activity-service.js`](#4-activity-service)
5. [`electron/services/file-watcher-service.js`](#5-file-watcher-service)
6. [`electron/services/git-queue-service.js`](#6-git-queue-service)
7. [`electron/services/p2p-service.js`](#7-p2p-service)
8. [`electron/services/process-service.js`](#8-process-service)
9. [`electron/services/project-service.js`](#9-project-service-4600-loc)
10. [`electron/services/repo-service.js`](#10-repo-service)
11. [`electron/services/settings-service.js`](#11-settings-service)
12. [`electron/services/shared-state-service.js`](#12-shared-state-service)
13. [`electron/services/tooling-service.js`](#13-tooling-service)
14. [`electron/config/model-catalogs.json`](#14-model-catalogsjson)

---

## 1. `electron/main.js`

Entry point for the Electron main process. Owns the singleton `BrowserWindow`, bootstraps every
service, wires IPC, and performs cleanup on quit. Also contains diagnostic logging with secret
redaction and GPU detection for VM environments.

**Exported helpers**

| Function | Purpose |
|---|---|
| `createWindow()` | Builds the hardened `BrowserWindow` with `preload.js`, context isolation, permission checks, and blocked navigation. |
| `bootstrapDesktopServices()` | Instantiates all services in dependency order (settings → repo → file-watcher → shared-state → project → p2p → activity) and calls `registerIpcHandlers`. |
| `cleanupBeforeQuit()` | Serialized cleanup chain: stop file watcher, close all P2P sessions, shut down static server. |

**Internal helpers**

- `logDiagnostics()` — redacts GitHub tokens, OAuth codes, and API keys from anything it logs.
- `startStaticServer()` — HTTP server used in packaged (production) mode to serve the Next.js static export.
- `readyApp()` — runs after Electron `app.whenReady()` and triggers service bootstrap.

**Notable state**

- `mainWindow` — singleton `BrowserWindow`
- `staticServer` — HTTP server used only in packaged mode
- `BUILD_TAG = "v105-sync-fixes"`

**Dependencies:** `electron`, `fs`, `http`, `path`, `child_process` (for NVIDIA/GPU detection).

---

## 2. `electron/preload.js`

The sole security bridge between the renderer and the main process. Every capability the UI can
use is registered here via `contextBridge.exposeInMainWorld('electronAPI', …)`. Runs in an isolated
world; no `require()` is reachable from the renderer.

**Namespaces exposed on `window.electronAPI`**

| Namespace | Capability |
|---|---|
| `system` | `openDirectory`, `openFiles`, `readFileAsDataUrl`, `saveUploadedFile`, `openExternal`, `openTerminal`, `getCommonPaths`, `getBuildTag`, `platform` |
| `process` | `run`, `runProgram`, `cancel`, `listRunning`, `onStarted`, `onOutput`, `onCompleted`, `onError`, `onCancelled`, `onTimeout` |
| `repo` | `inspectRepository`, `listDirectory`, `readFile`, `writeFile`, `getFileDiff`, `stageFiles`, `unstageFiles`, `commit`, `checkoutBranch`, `getCommitDetails`, `getRemoteUrl`, `pushToRemote`, `pullFromRemote`, `syncSharedState` |
| `settings` | `get`, `set`, `patch`, `completeOnboarding`, `isFirstRun`, `onChange` |
| `project` | `list`, `create`, `delete`, `setActive`, `generatePlan`, `sendPMMessage`, `sendTaskMessage`, `sendSoloMessage`, `launchDevServer`, `listCollaborators`, `setVisibility`, `cancelAgent`, `onChanged`, `onAgentEvent`, `onChatStream`, `getModelCatalog` |
| `tools` | `listStatus`, `installGit`, `installNode`, `installPython`, `installGh`, `installCopilot`, `installClaude`, `installCodex`, `githubAuthStatus`, `githubAuthLogin`, `githubListAccounts`, `githubSwitchAccount`, `githubAuthLogout`, `claudeAuthStatus`, `claudeAuthLogin`, `codexAuthStatus`, `codexAuthLogin`, `setupGit`, `onGithubAuthProgress` |
| `sharedState` | `init`, `readFile`, `writeFile`, `listDirectory`, `saveConversation`, `loadConversation`, `listConversations`, `isInitialized`, `listMembers`, `saveMember` |
| `p2p` | `join`, `leave`, `status`, `decodeInvite`, `acceptInvite`, `onPresence`, `onChatToken`, `onChatMessage`, `onStateChange`, `onReconnecting` |
| `activity` | `list`, `addEvent`, `onCreated` |
| `fileWatcher` | `start`, `stop`, `status` |

**Helper**

- `subscribe(channel, callback)` — wraps `ipcRenderer.on` and returns an unsubscribe function; used by every `on*` method above.

**Security posture:** context isolation on, no node integration, every IPC method is explicitly listed (no wildcard passthrough).

---

## 3. `electron/ipc/register-handlers.js`

Single entry point that registers all ~80 `ipcMain.handle` / `ipcMain.on` handlers and wires them
to services. This is where most "business logic glue" lives, including P2P state broadcasting,
sync orchestration, and project mutation flows.

**Exported**

- `registerIpcHandlers(mainWindow, services)` — registers every handler; takes the full services bundle and the window (for sending events to the renderer).

**Handler groups** (full list; for behavior-level detail see the referenced service section)

### System (4)

| Channel | Purpose |
|---|---|
| `system:openDirectory` | Folder picker (returns path or `null`). |
| `system:openExternal` | Open URL in default browser (allow-listed schemes). |
| `system:getAppVersion` | Returns `app.getVersion()`. |
| `system:getPlatform` | Returns `process.platform`. |
| `system:openTerminal` | Opens a real OS terminal (`wt`/`cmd`/`powershell`) at `cwd` with optional pre-populated command. |
| `system:getCommonPaths` | Returns desktop/documents/downloads/home paths. |
| `system:readFileAsDataUrl` / `system:saveUploadedFile` | File → base64 data URL / base64 → disk (for image attachments). |

### Process (5 + lifecycle events)

| Channel | Purpose |
|---|---|
| `process:run` | Shell command with streaming stdout/stderr. |
| `process:runProgram` | Argv-based (no shell) — safer for AI-generated invocations. |
| `process:cancel` | Kill a running process by `processId`. |
| `process:listRunning` | Active process IDs. |
| Events (sender → renderer) | `process:started`, `process:output`, `process:completed`, `process:error`, `process:cancelled`, `process:timeout`. |

### Repository (12)

See [repo-service](#10-repo-service). Channels: `repo:inspect`, `repo:listDirectory`, `repo:readFile`, `repo:writeFile`, `repo:status`, `repo:selectFiles`, `repo:branch`, `repo:commit`, `repo:diff`, `repo:commitDetail`, `repo:getRemoteUrl`, `repo:pushToRemote`, `repo:pullFromRemote`, `repo:syncSharedState`.

### Settings (3)

`settings:get`, `settings:patch`, `settings:completeOnboarding` — plus the push event `settings:changed`.

### Project (12)

`project:list`, `project:create`, `project:delete`, `project:setActive`, `project:generatePlan`, `project:sendPMMessage`, `project:sendTaskMessage`, `project:sendSoloMessage`, `project:launchDevServer`, `project:listCollaborators`, `project:setVisibility`, `project:cancelAgent`, `project:getModelCatalog`, `project:grantDeleteScope`. Events: `project:changed`, `project:agentStarted`, `project:agentOutput`, `project:agentCompleted`, `project:agentError`, `project:agentCancelled`, `project:agentApprovalRequest`, `project:chatStream`.

### Tools (13)

`tools:listStatus` and per-tool install / auth handlers described in [tooling-service](#13-tooling-service).

### SharedState (4)

`sharedState:readFile`, `sharedState:writeFile`, `sharedState:listDirectory`, `sharedState:saveConversation`, `sharedState:loadConversation`, `sharedState:listConversations`, `sharedState:saveMember`, `sharedState:listMembers`, `sharedState:init`, `sharedState:isInitialized`.

### P2P (4)

`p2p:join`, `p2p:leave`, `p2p:status`, `p2p:decodeInvite`, `p2p:acceptInvite`. Events: `p2p:presence`, `p2p:chatToken`, `p2p:chatMessage`, `p2p:stateChanged`, `p2p:reconnecting`.

### Activity (2)

`activity:list`, `activity:addEvent`. Event: `activity:created`.

### FileWatcher (3)

`fileWatcher:start`, `fileWatcher:stop`, `fileWatcher:status`. Events: `fileWatcher:changed`, `fileWatcher:status`, `fileWatcher:syncStart`, `fileWatcher:syncComplete`, `fileWatcher:pullComplete`, `fileWatcher:peerSync`.

**Notable state inside this file**

- `syncInProgress` flag — blocks `project-service.savePlan()` from overwriting `plan.json` while `syncWorkspace` is importing from disk.
- A single `p2p` `onStateChange` listener is attached here and fans the change out to (a) `project-service` in-memory state and (b) the renderer via `project:changed`.

---

## 4. `activity-service.js`

Small in-memory ring buffer of activity events surfaced in the "Activity" timeline in the UI.

| Function | Purpose |
|---|---|
| `addEvent(event)` | De-duplicates on event `id`, prepends to buffer (max 30), broadcasts on `activity:created`. |
| `listEvents()` | Returns current array. |
| `getActivityEmitter()` | Returns an internal `EventEmitter` for in-process subscribers. |
| `setEventSender(sender)` | Injects the renderer IPC sender so events can be pushed. |

**State:** `events[]` (ring buffer, max 30), `emit` sender.

**Events emitted:** `activity:created`, `activity:list`.

---

## 5. `file-watcher-service.js`

Watches the active project directory, debounces changes, and runs an atomic git-sync cycle on the
`codebuddy-build` branch. Coordinates with the P2P service so remote-originated commits trigger a
stash/pull/pop on the local side.

| Function | Purpose |
|---|---|
| `startWatching(repoPath)` | Attaches recursive `fs.watch` with 10-second debounce; skips heavy directories. |
| `stopWatching()` | Closes watcher and clears timers. |
| `pauseWatcher()` / `resumeWatcher()` | Gates the debounce loop around manual git operations so we don't race user actions. |
| `autoPull(repoPath)` | Invoked when P2P signals a new upstream commit: stash → `git pull --rebase` → stash pop. |
| `pushToMain(repoPath)` | Merges `codebuddy-build` → `main`, pushes, broadcasts `fileWatcher:peerSync` so peers pull. |
| `getWatcherStatus()` | Returns `{ watching, repoPath, paused, syncing, agentActive }`. |

**Key internal helpers**

- `doAutoSyncInner()` — the heart of auto-sync: git add → commit → `pull --rebase` → push, with retries and recovery from `index.lock`, aborted rebase, or detached HEAD.
- `cleanupGitState()` — removes `index.lock`, aborts in-progress rebase/merge.
- `ensureGitIdentitySync()` — if `user.name` / `user.email` is unset, derives them from `gh api user`.
- `runGit(cmd, args, cwd)` — `execFile` wrapper with `GIT_TERMINAL_PROMPT=0` to prevent stuck prompts.

**Skipped directories:** `node_modules`, `.next`, `dist`, `dist-electron`, `.git`, `out`, `tmp`, `__pycache__`, `.venv`, `venv`, `target`, `.cache`, `coverage`, `build`, `.codebuddy/checkpoints/`.

**Events emitted:** `fileWatcher:changed`, `fileWatcher:status`, `fileWatcher:syncStart`, `fileWatcher:syncComplete`, `fileWatcher:pullComplete`, `fileWatcher:peerSync`.

**State:** `watcher`, `watchedRepoPath`, `paused`, `syncing`, `agentActive`, `debounceTimer`.

---

## 6. `git-queue-service.js`

Tiny but critical: serializes all git operations per repo path so we never have two concurrent
`git push` / `commit` / `checkout` calls hitting the same working tree.

| Function | Purpose |
|---|---|
| `enqueue(repoPath, label, fn)` | Resolves repo path to a canonical key and chains `fn()` after prior ops for that key. Returns the awaited result. |
| `getDepth(repoPath)` | Number of pending ops for that repo (useful for UI spinner "N pending"). |

**State:** `queues` — `Map<string, { tail: Promise, depth: number }>`.

---

## 7. `p2p-service.js`

Hyperswarm + Yjs CRDT peer collaboration with HMAC-SHA256 authenticated framing. Handles topic
derivation (v2 HMAC vs. v1 URL-keyed legacy), connection lifecycle, presence, state broadcasting,
chat streaming, and prototype-pollution defence.

| Function | Purpose |
|---|---|
| `joinProject(projectId, repoPath, remoteUrl, memberProfile, options)` | Creates a Hyperswarm session, derives topic key, initialises the Yjs doc from disk, and joins the swarm. Attempts v2 (authenticated, 45 s window) then falls back to v1 legacy if needed. |
| `leaveProject(projectId)` | Tears down swarm, clears heartbeat timer, announces departure. |
| `broadcastStateChange(projectId, category, id, data)` | Sends an HMAC-signed mutation (categories: `plan`, `tasks`, `conversation`, `agent-context`). |
| `listPeers(projectId)` | Current connected peers. |
| `sendChatToken(projectId, token)` | Streams approval tokens / CLI tokens to peers. |
| `sendChatMessage(projectId, message)` | Sends a full chat message. |
| `onPeerReady(cb)` / `onStateChange(cb)` | In-process subscriber hooks. |
| `getSession(projectId)` | Session metadata (swarm, peers Map, ydoc). |

**Internal helpers (selected)**

- `deriveTopicKey(remoteUrl, secret)` — `SHA256(remoteUrl + secret)` for v2; bare URL hash for v1.
- `computeHmac(secret, buffer)` / `timingSafeEqualStr()` — HMAC-SHA256 + constant-time compare.
- `findJsonBoundary()` — streaming JSON frame parser (messages are length-prefixed).
- `loadSharedStateIntoYDoc()` — imports conversations / members / tasks from `.codebuddy/` into the Yjs doc on join.
- `syncStateChangeToDisk()` — persists peer-originated mutations back into `.codebuddy/` so the file watcher picks them up for git sync.
- `sanitizePeerValue()` — strips `__proto__`, enforces depth/length caps (prototype-pollution defence).
- `connectSwarm()` — the actual `swarm.join(topic)` call with dual-mode fallback.

**Hard limits:** 256 KB per-message cap, 8 MB per-peer buffer cap, 45 s v2→v1 fallback window.

**Events emitted:** `p2p:joined`, `p2p:left`, `p2p:peerJoined`, `p2p:peerLeft`, `p2p:presence`, `p2p:chatToken`, `p2p:chatMessage`, `p2p:stateChanged`, `p2p:reconnecting`.

**State:** `sessions: Map<projectId, { swarm, topic, peers: Map, peerStreamAccumulators: Map, ydoc, heartbeatInterval, reconnectTimer, lastPeerSeenAt }>`, plus global `stateChangeCallbacks`, `peerReadyCallbacks`.

**Dependencies:** `hyperswarm`, `yjs`, Node.js `crypto`, `fs`.

---

## 8. `process-service.js`

Thin wrapper around `child_process.spawn` with lifecycle events, streaming output, timeouts, and
process cancellation. Every spawned child is tracked in a map so it can be cancelled or listed.

| Function | Purpose |
|---|---|
| `run(command, cwd, options)` | Spawns with `shell: true`; supports `timeoutMs`, `stdinData`, `env`. Returns `{ processId, stdout, stderr, exitCode }`. |
| `runProgram(file, args, cwd, options)` | Argv form (`shell: false`) — preferred for AI-generated commands because it avoids shell injection. Supports keepalive tokens during long runs. |
| `cancel(processId)` | Kills the process tree. |
| `listRunning()` | Active process IDs. |
| `getProcess(processId)` | Metadata lookup. |
| `onProcessOutput(processId, cb)` | Register an in-process listener for stdout/stderr chunks. |

**Events emitted:** `process:started`, `process:output`, `process:completed`, `process:error`, `process:cancelled`, `process:timeout`.

**State:** `runningProcesses: Map<processId, { childProcess, metadata, startTime, outputBuffer }>`.

---

## 9. `project-service.js` (≈4,600 LOC)

The "operating system" of CodeBuddy. Because of its size, it is documented by concern below. Every
exported method on the returned service object is listed.

### 9.A CLI detection & provider routing

- `readConfiguredCommands()` — refreshes `PATH` from the Windows registry (HKLM + HKCU), locates each CLI (`git`, `gh`, `copilot`, `claude`, `codex`, `node`, `python`), auto-installs missing ones.
- `resolveProvider(model)` — maps a model ID to a provider (`claude`/`copilot`/`codex`) using `featureFlags` and the model catalog.
- `buildCliInvocation(provider, model, prompt, options)` — returns `{ file, args, env }` ready for spawn.
- Internal: `getCommandName(cmd)` (Windows `.cmd` mapping), `expandEnvVars(str)`.

### 9.B Agent streaming infrastructure

- `runProviderCli(provider, model, prompt, options)` — spawns the CLI, pipes its JSON stream through a parser, and emits `project:agentOutput` tokens.
- `runProgram(file, args, cwd, options)` — lower-level spawn used by both dev-server launch and agent execution, with keepalive support.
- Stream parsers: `parseClaudeStreamJsonLine`, `parseCopilotJsonLine`, `parseCodexJsonLine` — translate each provider's JSON event shape into a uniform set of UI events.
- `classifyAgentError(err)` — produces a user-friendly label (not installed, auth required, rate-limited, context-window exceeded, network, model unavailable, …).
- `buildTaskAgentSystemPrompt()` — composes the task-agent system prompt including tool descriptions.
- `loadPeerAgentContext()` / `saveAgentContextSnapshot()` — enables cross-peer task continuity by persisting agent scratch context to `.codebuddy/agents/context/`.

### 9.C Project CRUD

- `listProjects()` — `settings.projects[]`.
- `createProject(payload)` — creates the directory, README, `.gitignore`, runs `git init`, optionally creates the GitHub repo via `gh`, pushes `main` + `codebuddy-build`.
- `setActiveProject(projectId)` — updates `settings.activeProjectId` and emits `settings:changed`.
- `deleteProject(payload)` — optional local delete, optional GitHub repo delete (requires `delete_repo` scope — prompts via `grantGithubDeleteScope`).
- `ensureGithubRepoForProject(projectId)` — idempotent create of the GitHub repo + `codebuddy-build` branch if missing.

### 9.D Plan generation

- `generateProjectPlan(payload)` — invokes Claude by default; returns normalised MVP plan JSON; broadcasts on P2P; persists.
- `generateTaskPrompt(payload)` — generates the next-best task prompt given the plan; may auto-advance task status.
- `normalizeGeneratedPlan()` — defensively fills in missing subprojects / tasks / statuses.
- `updateTaskStatusInPlan()` — mutates task + cascades to parent subproject status.

### 9.E PM / task / solo chat

- `sendPMMessage(payload)` — Project Manager chat; triggers conversation compaction above 20 K chars (`COMPACT_TRIGGER`, keeps last `COMPACT_KEEP = 3` messages verbatim); broadcasts message on P2P; writes to shared state.
- `sendTaskMessage(payload)` — runs a task agent; ensures repo is on `codebuddy-build`; merges peer changes defensively before running; supports tool-approval mode (auto/manual).
- `sendSoloMessage(payload)` — standalone coding session; same streaming infra; writes agent context snapshot on finish.
- `extractTaskAgentMetadata(output)` — parses `TASK_STATUS` / `TASK_STATUS_REASON` markers embedded in agent output.

### 9.F Conversation compaction

- `compactMessagesIfNeeded(conversation)` — auto-invokes when the rolling char count exceeds `COMPACT_TRIGGER`.
- `compactConversation(target)` — manual compaction endpoint for any thread.

### 9.G Checkpoints

- `createCheckpointSnapshot(projectId)` — walks the project tree (skipping `CHECKPOINT_EXCLUDED_ROOTS`), copies files to `userData/checkpoints/<id>/`, writes a manifest.
- `restoreCheckpoint(checkpointId)` — restores files, then commits + pushes so the file watcher and peers see the change.
- `gatherProjectSnapshot()` — collects a compressed view of the tree + key files for AI context.

### 9.H Dev server detection

- `launchDevServer(payload)` — reads `package.json`, `Cargo.toml`, `requirements.txt`, etc.; asks the AI to identify the start command + expected port; returns `{ command, port, previewMode }`.

### 9.I GitHub integration

- `listRepoCollaborators(repoPath)` — `gh api repos/<owner>/<repo>/collaborators`.
- `setRepoVisibility(repoPath, visibility)` — `gh api -X PATCH` to toggle private/public.
- `grantGithubDeleteScope()` — runs a signed PowerShell that opens the browser to grant the `delete_repo` OAuth scope.

### 9.J Safety jail

- `getSafeCommandJailDir()` — creates a per-agent temp directory prepended to `PATH` containing no-op stubs for `code`, `explorer`, `start`, `powershell`, `kill`, `pkill`, `taskkill`. Reserves port 3000. Strips credential env vars from child processes.
- `ensureOnCodebuddyBuild(repoPath)` — forces the repo to the `codebuddy-build` branch before any agent runs.

### 9.K Notable state

- `activeChildProcess`, `activeRequestMeta`, `activeRequestOutput` (bounded to 12 KB), `activePendingApproval`.
- Constants: `COMPACT_TRIGGER = 20000`, `COMPACT_KEEP = 3`, `CHECKPOINT_EXCLUDED_ROOTS`, `RESPONSE_SUMMARY_INSTRUCTIONS`.

**Events emitted:** `project:agentStarted`, `project:agentOutput`, `project:agentCompleted`, `project:agentError`, `project:agentCancelled`, `project:agentApprovalRequest`, `project:changed`, `project:chatStream`.

**Dependencies:** `fs/promises`, `path`, `child_process`, `crypto`, `yjs`.

---

## 10. `repo-service.js`

Stateless wrapper around the `git` CLI.

| Function | Purpose |
|---|---|
| `inspectRepository(repoPath)` | Branch, branches list, changed files, recent commits. Detached-HEAD recovery included. |
| `listDirectory(target)` | Lists a directory, filters build artifacts. |
| `readFileContent(target)` | File read. |
| `writeFileContent(target, content)` | File write. |
| `getFileDiff(repoPath, target, staged)` | `git diff` or `git diff --staged`. |
| `stageFiles(repoPath, paths[])` / `unstageFiles(…)` | `git add` / `git restore --staged`. |
| `commit(repoPath, message)` | `git commit -m`. |
| `checkoutBranch(repoPath, branch, create, fromBranch)` | Stash → switch (optionally create) → stash pop; auto-fetches remote. |
| `getCommitDetails(repoPath, hash)` | Metadata + file list + diff. |
| `getRemoteUrl(repoPath)` | `git remote get-url origin`. |
| `pushToRemote(repoPath, { remote, branch })` | `git push -u`. |
| `pullFromRemote(repoPath, { remote, branch })` | `git pull --rebase`. |
| `syncSharedState(repoPath, message)` | Commits + pushes only the `.codebuddy/` directory. |

**Helpers:** `cleanupGitState`, `runGit` (uses `GIT_TERMINAL_PROMPT=0`), `parseStatusPorcelain`, `parseCommitFiles`, `normalizeRepoPath`, `normalizeGitPath`, `ensureRepository`, `getCommandName`.

---

## 11. `settings-service.js`

Durable user settings with atomic writes + backup fallback and a serialized read/modify/write queue.

| Function | Purpose |
|---|---|
| `readSettings()` | Queued read; falls back to `settings.json.bak` if the primary file is corrupt. |
| `writeSettings(next)` | Queued write via `tmp → rename → backup old → rename final`. |
| `atomicUpdate(mutateFn)` | Single-threaded read-modify-write that prevents stale-snapshot overwrites. |
| `updateSettings(patch)` | Convenience merge (feature flags, project defaults, CLI tool paths). |
| `isFirstRun()` | `!onboardingCompleted`. |
| `completeOnboarding()` | Sets the flag. |

**Default settings shape** (simplified):

```js
{
  onboardingCompleted: false,
  workspaceRoots: [],
  recentRepositories: [],
  projects: [],
  activeProjectId: null,
  projectDefaults: {
    rootDirectory: "",
    createGithubRepo: true,
    githubVisibility: "private",
    systemPromptMarkdown: DEFAULT_SYSTEM_PROMPT_MARKDOWN,
    copilotModel: "gpt-5.2"
  },
  shell: "default",
  cliTools: {},
  featureFlags: {
    githubCopilotCli: true,
    claudeCode: false,
    codexCli: false,
    githubCompanion: true
  }
}
```

**Helpers:** `_readFromDisk`, `_writeToDisk`, `enqueue`, `normalizeSettings`, `normalizeProject`.

**Notable constants:** `DEFAULT_SYSTEM_PROMPT_MARKDOWN` (planning prompt for new projects) and `IMPORTED_PROJECT_SYSTEM_PROMPT` (analysis prompt for imported codebases).

---

## 12. `shared-state-service.js`

Manages the `<repo>/.codebuddy/` directory: conversation history, agent context, tasks, members,
plan versions, generated docs. All files are plain JSON committed to the `codebuddy-build` branch,
which is how state moves between machines when P2P isn't available.

| Function | Purpose |
|---|---|
| `ensureSharedDir(repoPath)` | Creates `.codebuddy/` + `conversations/`, `agents/`, `tasks/`, `members/`, `versions/`, `docs/`; writes `.gitkeep` + `README`. |
| `isInitialized(repoPath)` | Boolean check. |
| `readSharedFile(repoPath, relative)` / `writeSharedFile(…)` | JSON file I/O inside the shared dir. |
| `listSharedDir(repoPath, relative)` | Directory listing (filters `.gitkeep`). |
| `saveConversation(repoPath, id, messages, metadata)` | Persists a conversation with `updatedAt`. |
| `loadConversation(repoPath, id)` | Loads one conversation. |
| `listConversations(repoPath)` | Sorted by `updatedAt` desc. |
| `saveMember(repoPath, profile)` / `listMembers(repoPath)` | Team member profiles. |

---

## 13. `tooling-service.js`

Detects, installs, and authenticates every CLI tool CodeBuddy depends on.

**Status**

- `getToolStatus()` — returns `{ git, gh, copilot, node, npm, claude, python, codex }` with installed/installable/authenticated flags and resolved binary paths.
- `getModelCatalogs()` — reads `electron/config/model-catalogs.json`; falls back to built-ins.

**Prompt execution**

- `runCopilotPrompt({ prompt, cwd, allowTools, timeoutMs, model })` — `gh copilot suggest/explain` with tool allow-list.
- `runGenericPrompt({ prompt, cwd, timeoutMs, model })` — dispatches to whichever provider is enabled.

**Installers (multi-strategy)**

| Function | Strategies tried, in order |
|---|---|
| `installGitScm()` | Known install dirs → `winget install Git.Git` (serialized) |
| `installNodeJs()` | Known dirs → `winget install OpenJS.NodeJS` |
| `installPython()` | Known dirs → `winget install Python.Python.3.12` |
| `installGithubCli()` | Known dirs → `winget install GitHub.cli` |
| `installCopilot()` | Known paths → `winget` → `npm i -g @github/copilot` → `gh extension install github/gh-copilot` |
| `installClaudeCode()` | Native PowerShell installer → `npm i -g @anthropic-ai/claude-code` → winget |
| `installCodex()` | `npm i -g @openai/codex` |

All winget calls go through `serializedWingetInstall()` to avoid lock contention.

**Auth**

- GitHub: `getGithubAuthStatus`, `startGithubAuth` (device-code flow, streams progress via `tools:githubAuthProgress`), `logoutGithub`, `listGithubAccounts`, `switchGithubAccount`.
- Claude: `getClaudeAuthStatus`, `startClaudeAuth`.
- Codex: `getCodexAuthStatus`, `startCodexAuth`.
- Git setup: `setupGitCredentialHelper()` — runs `gh auth setup-git`.

**Helpers:** `refreshSystemPath`, `tryExec`, `waitForToolOnPath`, `resolveClaudeCmd`, `getConfiguredCommands`, `serializedWingetInstall`, `expandEnvVars`.

**State:** `extraPaths: Set<string>`, `_wingetQueue`, bundled catalog path.

---

## 14. `model-catalogs.json`

Bundled, hand-editable list of AI models per provider. Schema per entry:

```
{
  id, label, provider, contextWindow, maxTokens, usage,
  group: "featured" | "other",
  warning?: string
}
```

**Copilot (15):** `auto`, `claude-opus-4.6`, `claude-sonnet-4.6`, `gpt-5.4` (featured), plus `claude-haiku-4.5`, `claude-opus-4.5`, `claude-sonnet-4`, `claude-sonnet-4.5`, `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview`, `gpt-5.2`, `gpt-5.1`, `o3`.

**Claude (6):** `sonnet`, `opus` (featured), plus `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5`.

**Codex (8):** `default` (featured), plus `o4-mini`, `o3`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o3-pro` (premium), `codex-mini` (API key only).

Editing this JSON and restarting the app adds/removes models without rebuilding.
