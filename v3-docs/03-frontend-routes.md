# 03 — Next.js Frontend Routes

Every file under `src/app/` is documented below. The app uses Next.js 16's App Router with static
export (`output: "export"` in `next.config.ts`) so the compiled `out/` directory can be loaded by
Electron directly.

Shared patterns:

- Every project page reads `window.electronAPI.project.*` through the `useActiveDesktopProject()` hook and listens for streaming agent output via `useStreamEvents()`.
- Most pages gracefully degrade when `window.electronAPI` is absent (browser preview mode).
- Layouts compose a `<LeftRail>` (fixed navigation) + `<MonolithPanel>` (centered content wrapper). See [04 — Components](./04-components-hooks-lib.md).

---

## 3.1 Root

### `src/app/layout.tsx` (43 LOC)

Server component root layout. Mounts `<ThemeProvider>` and Google Fonts (Inter, Inter Tight, JetBrains Mono) into CSS variables `--font-body`, `--font-display`, `--font-code`.

### `src/app/page.tsx` (5 LOC)

Delegates to `RootRedirect`.

### `src/app/root-redirect.tsx` (42 LOC)

Client component. On mount, calls `window.electronAPI.settings.isFirstRun()` and pushes the user to `/onboarding` or `/home`. Renders a loading pulse while the check runs.

---

## 3.2 `/home` — Project dashboard

### `home/layout.tsx`

Two-column `<LeftRail>` + `<MonolithPanel>`.

### `home/page.tsx` (≈1,285 LOC)

Main dashboard. Lists desktop projects (cards with stage dot, title, task progress bar, friend avatars), coding friends, and hosts the create-project, join-invite, and delete flows.

**Major state** (≈45 `useState` hooks): `projects[]`, `codingFriends[]`, `activeTab`, `showCreator`, `showFriendCreator`, draft form fields for project creation (`draftName`, `draftDescription`, `draftBaseDirectory`, `draftCreateGithubRepo`, `draftGithubVisibility`, `draftImportMode`, `draftImportPath`), friend drafts, deletion flow (`projectPendingDelete`, `projectDeletingId`, `deleteMode`, `pendingGithubAuth`), join-invite flow (`showJoinInvite`, `joinInviteCode`, `joinInviteStep`, `joinInviteProjectName`, `joinInviteRemoteUrl`, `joinInviteFolder`), `defaultProjectRoot`, `commonPaths`, `canUseDesktopProjects`, `canPickProjectLocation`.

**Helpers:** `mapDesktopProject()`, `vibeToStage()`, `formatUpdatedAgo()`, `getFriendlyProjectError()`.

**IPC:** `project.list`, `project.create`, `project.setActive`, `project.delete`, `project.grantDeleteScope`, `settings.get`, `system.getCommonPaths`, `system.openDirectory`, `p2p.decodeInvite`, `p2p.acceptInvite`.

---

## 3.3 `/onboarding`

### `onboarding/page.tsx` (≈1,106 LOC)

Six-step wizard: Welcome → Tools → GitHub → Providers → Profile → Done.

**State:** `step`, `displayName`; six tool-check slots (`git`, `gh`, `copilot`, `claude`, `node`, `python`, `codex`) each with `{ checking, installing, status, detail }`; `selectedProviders: Set<"copilot"|"claude"|"codex">`; GitHub device-code flow (`ghAuthStatus`, `ghAuthUsername`, `ghAuthDeviceCode`, `ghAuthUrl`, `ghAuthError`); mirrors for Claude / Codex; animation state (`activeInstallPhases`, `finishing`, `installLog`).

**Helpers:** `useTypewriter(text, speed)`, `truncateDetail()`; per-tool installers (`installGitScm`, `installNodeJs`, `installPython`, `installGhCli`, `installCopilotExtension`, `installClaudeExtension`, `installCodexCli`, `installAllMissing`); per-provider auth (`checkGithubAuth`, `startGithubAuth`, `checkClaudeAuth`, `startClaudeAuth`, `checkCodexAuth`, `startCodexAuth`).

**IPC:** `tools.listStatus`, each tool install handler, `tools.githubAuthStatus`/`Login`/`Progress`, `tools.claude*`, `tools.codex*`, `tools.setupGit`, `settings.update`, `settings.completeOnboarding`.

---

## 3.4 `/people`

Layout + 47 LOC page. Static friend list (mock data) with online status and an invite link (`codebuddy.app/join/cam-x3k9`).

---

## 3.5 `/settings` — Global app settings

### `settings/page.tsx` (≈941 LOC)

Global configuration: theme toggle, GitHub account manager (multi-account with switch / logout), tool statuses, AI provider setup cards (Claude/Copilot/Codex), project defaults, Copilot default model dropdown.

**State (partial):** `theme` (from `useTheme`), `githubAccounts[]`, `githubLoading`, `githubAuthInProgress`, `deviceCode`, `verificationUrl`, `desktopSettings`, `toolStatuses[]`, `gitPath`, `githubCliPath`, `projectRoot`, `createGithubRepoByDefault`, `projectGithubVisibility`, `copilotModel`, `claudeCodeSetup`, `copilotSetup`, `codexSetup`, `expandedTools: Set<string>`, `toast`.

**Helpers:** `showToast`, `loadGithubAccounts`, `handleAddGithubAccount`, `handleSwitchAccount`, `handleLogoutAccount`, `loadDesktopIntegrations`.

**IPC:** `tools.githubListAccounts`, `tools.githubAuthLogin`, `tools.onGithubAuthProgress`, `tools.githubSwitchAccount`, `tools.githubAuthLogout`, `settings.get`/`update`, `tools.listStatus`.

---

## 3.6 `/project` — Workspace overview

### `project/layout.tsx`

Shared rail + panel layout for all project sub-routes.

### `project/page.tsx` (≈2,531 LOC)

Plan / task / action-item workspace. Renders subprojects as cards containing tasks; supports a task-detail modal with an AI chat thread, status dropdown, assignee, due date. Also hosts the Action Items section where an AI scan suggests manual setup steps (API keys, deployments…).

**Major state:** `projects[]` (subprojects + tasks), `plan[]` (build order), `expandedTask`, `selectedStatus: BuildTaskStatus[]`, `showRunAgentModal`, `projectError`, `projectNotice`, `taskThreads[]`; extensive action-items sub-state inside `ActionItemsSection`.

**Helpers:** `getPlanCounts`, `formatDueDate`, `getDueDateMeta`, `moveItem<T>`, `ProgressRing`, `RenderMarkdown`, `InlineMarkdown`, sub-component `ActionItemsSection` (loads/updates action items, expandable chat, completion tracker).

**IPC:** `activity.list`, `project.sendSoloMessage`, `project.onAgentOutput`.

### `project/activity/page.tsx` (≈403 LOC)

Activity timeline with tab groups (Builds, Reviews, Comments, Status, Deploys, Team). State: `viewMode`, `expandedCats: Set<string>`, `personFilter`, `desktopEvents[]`, `queue[]`, `nowTick` (seconds ticker for relative time). IPC: `activity.list`, `activity.onCreated`.

### `project/artifacts/page.tsx` (≈408 LOC)

Browses AI-generated deliverables grouped by session. State: `sessions[]`, `activeTab: "docs"|"code"`, `selectedArtifact`, `previewText`, `isLoading`, `isSaving`. Helpers: `getFileColor`, `getFileBadgeColor`, `extractGeneratedFiles`, `formatRelativeTime`. IPC: `project.listSessions`, `project.downloadArtifact`.

### `project/chat/page.tsx` (≈6,553 LOC — largest route)

The Project Manager chat + inline artifact previews. Because of its size, it is broken into regions:

**Region 1 — Types & constants:**
`BuildDetailTab = "details"|"preview"|"code"|"files"`, `ComposerAttachment`, `RealProjectConversationMessage`, `statusStyle` (badge palette), icon components (`GlobeIcon`, `DocumentIcon`, `CodeIcon`, `FolderIcon`, …).

**Region 2 — Helpers:**
`stripAnsi(text)`, `inferTaskArtifactId(taskTitle, subprojectTitle, responseText)`, `extractTaskArtifactChanges(text)`, `normalizeChatDisplayText(text)`.

**Region 3 — State:**
`messages[]`, `input`, `isStreaming`, `attachments[]`, `selectedBuildDetail`, `buildDetailTab`, `selectedModel`, `showTaskMenu`, `filteredTasks[]`, `showModelMenu`, model catalog + feature flags.

**Region 4 — Functions:**
Composer: `handleAttachFile`, `handleRemoveAttachment`, `handleSendMessage`, `handleEditMessage`. Stream: `handleStreamStart`, `onStreamChunk`, `handleStreamEnd`. UI: `renderBuildDetailTab`. Model: `getActiveModelCatalog`, `filteredModelList`. Task inference: `inferTaskId`, `guessTaskFromContext`.

**Region 5 — IPC:**
`project.chat` / `project.onChatStream`, `project.editMessage`, `project.generateArtifact`, `project.getModelCatalog`.

**Region 6 — UI sections:**
chat composer (textarea, attachments, model selector, send); message bubbles (user / AI / system with inline code blocks); build artifact inline cards (preview); task dropdown (1.1/1.2 numbering); emerald "recommended model" badge; split view (artifact on right, chat on left).

**Region 7 — Contexts:** `useActiveDesktopProject`, `useStreamEvents`, `useSearchParams` (reads `selectedTask`, `selectedArtifact`).

### `project/code/page.tsx` (≈1,921 LOC)

File-based code browser + Git panel + embedded IDE tab.

**Tabs:** `code | updates | ide`.

**State:** repo connection (`connectedRepo`, `repoError`, `isConnectingRepo`); file explorer (`liveDirectoryEntries[]`, `currentDirectoryPath`, `expandedDirs`); editor (`selectedLiveFilePath`, `selectedLiveFileContent`, `liveFileDraft`, `openEditorTabs[]`, `activeTabPath`); diffs (`selectedDiffPath`, `selectedDiffText`, `selectedDiffStaged`); branches (`branchDraft`, `branchSource`); commits (`selectedCommitDetails`, `commitMessage`); `canUseDesktopRepo`.

**Helpers:** `getEditorLanguageLabel`, `getRelativeRepoPath`, `normalizeRepoErrorMessage`; file ops: `handleOpenFile`, `handleSaveFile`, `handleStageFile`, `handleUnstageFile`; git: `handleCreateBranch`, `handleCommit`, `handlePushChanges`.

**IPC:** all `repo.*` channels (see [02](./02-electron-backend.md#10-repo-service)).

### `project/docs/page.tsx` (≈312 LOC)

Auto-generates project documentation in two modes (technical / overview). State: `isGenerating`, `mode`, `docs[]`, `expandedDoc`, `progress`. Helpers: `runGenerate`, `renderContent`, `renderInline`. IPC: `project.sendSoloMessage`, `project.onAgentOutput`.

### `project/files/page.tsx` (≈1,166 LOC)

Similar to `/code` but focused on file tree + Monaco editor + staged-files UI. Tabs `code|updates|ide`. Uses the same `repo.*` IPC surface. Helpers: `getEditorLanguageLabel`, `isStagedFile`, `normalizeRepoErrorMessage`, plus `FileIcon`, `EmptyState` sub-components.

### `project/ide/page.tsx` (≈1,474 LOC)

VS Code-style IDE: activity bar, file explorer with context menu, Monaco editor with tabs, resizable side chat panel, bottom terminal.

**State (selected):** `sidebarVisible`; refs `sidebarWidth`, `chatWidth`, `isDraggingSidebar`, `isDraggingChat`; `fileTree[]`, `expandedDirs`, `dirContents`, `treeLoading`; editor `openTabs[]`, `activeTabPath`, `editorContent`, `originalContent`, `editorRef`; `contextMenu`; chat model state (`chatModel`, `featureFlags`, `catalogSources`, `showModelMenu`, `modelSearch`, `modelMenuPos`); `messages[]`, `inputText`, `streaming`, `sessions[]`, `currentSessionId`; `terminalOutput`, `terminalVisible`.

**Keyboard shortcuts:** Ctrl+B (toggle sidebar), Ctrl+S (save), Ctrl+T (toggle terminal).

**Helpers:** `getFileTypeIndicator`, `getMonacoLanguage`, `getLanguageLabel`, `getBreadcrumb`, `handleOpenFile`, `handleSaveFile`, `handleCloseTab`, `handleEditTab`, model-menu handlers, chat `handleSendMessage`, `handleStreamChunk`, `handleStreamComplete`, context-menu `handleContextMenu`, `handleRenameFile`, `handleDeleteFile`.

**IPC:** `repo.listFiles`/`readFile`/`writeFile`, `process.run`/`onOutput` (terminal), `project.sendSoloMessage`/`onAgentOutput`, `project.getModelCatalog`, `settings.get`.

### `project/messages/page.tsx` (≈277 LOC)

Team channels + direct messages tabbed view.

### `project/preview/page.tsx` (≈603 LOC)

Live preview of a dev server. Auto-detects preview commands (`npm start`, `vite`, `python -m http.server`, …), waits for server readiness by probing common ports (3000, 5173, 8080…), renders either an iframe (`web` mode) or a scrolling output panel (`terminal` mode).

**State:** `pendingPreviewLaunch`, `previewProcessId`, refs `previewPortRef`, `previewReadyRef`, `previewModeRef`; `previewReady`, `previewServerStatus`, `previewServerOutput`, `previewExited`, `detectedPreviewUrl`, `previewMode`, `device`, `previewFullscreen`; subscription refs.

**Helpers:** `isPreviewCommand`, `isOurProcess`, process-event handlers (`stopStarted`, `stopOutput`, `stopExited`), `waitForServerReady`, `probePortsForServer`.

**IPC:** `process.onStarted`, `process.onOutput`, `process.onExited`; plain `fetch(url, { mode: "no-cors" })` to probe readiness.

### `project/settings/page.tsx` (≈455 LOC)

Project-scoped settings: name, description, GitHub visibility toggle, collaborators, shared workspace init (P2P), system-prompt markdown editor, approval mode (`auto` vs `manual`).

**IPC:** `project.listCollaborators`, `project.setRepoVisibility`, `sharedState.isInitialized`, `sharedState.listMembers`, `sharedState.listConversations`, `sharedState.init`, `settings.update`, `tools.githubListAccounts`.

---

## 3.7 Summary table

| Route | LOC | Purpose |
|---|---:|---|
| `/` | 5 / 42 | Redirect to `/onboarding` or `/home` |
| `/home` | 1,285 | Project + friends dashboard |
| `/onboarding` | 1,106 | 6-step setup wizard |
| `/people` | 47 | Friend list + invite link |
| `/settings` | 941 | Global settings (theme, GitHub, tools, providers) |
| `/project` | 2,531 | Workspace plan + tasks + action items |
| `/project/activity` | 403 | Event timeline |
| `/project/artifacts` | 408 | AI-generated files |
| `/project/chat` | 6,553 | PM chat + artifact split view |
| `/project/code` | 1,921 | File browser + Git |
| `/project/docs` | 312 | Auto doc generation |
| `/project/files` | 1,166 | Monaco editor + staging |
| `/project/ide` | 1,474 | Full IDE (activity bar, chat, terminal) |
| `/project/messages` | 277 | Channels + DMs |
| `/project/preview` | 603 | Live dev-server preview |
| `/project/settings` | 455 | Project config + collaborators + P2P |

Layouts are thin wrappers (`<LeftRail><MonolithPanel>{children}</MonolithPanel></LeftRail>`) except for `/onboarding` which is full-bleed.
