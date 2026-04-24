# 04 — Components, Hooks & Lib

Reference for everything under `src/components/`, `src/hooks/`, and `src/lib/`. Every exported
symbol is listed.

---

## 4.1 Components (`src/components/`)

### `index.ts`

Barrel re-export: `Avatar`, `StatusDot`, `LeftRail`, `MonolithPanel`, `ChatBubble`, `EmptyState`.

### `avatar.tsx`

`Avatar({ initials, size?, online?, ring? })` — circular initials badge, sizes `sm|md|lg` (8 / 10 / 14). When `online` is a boolean, overlays a colored status dot (aqua = online, muted = offline). `ring` adds an accent ring. Tailwind size map lives in the `sizes` constant.

### `avatar-stack.tsx`

`AvatarStack({ members, max? })` — overlapping avatars (default max 4) with `-space-x-2`; overflow shown as a `+N` badge.

### `chat-bubble.tsx`

`ChatBubble({ msg, artifact?, isSelected?, isSplitView?, onOpenBuild? })` — three styles (user, AI, system). User bubbles are right-aligned dark; AI bubbles are left-aligned light with a project-manager label; system bubbles are neutral. If an `artifact` is supplied with `onOpenBuild`, renders a card with Details / Preview buttons that invoke `onOpenBuild(artifactId, tab)`.

### `empty-state.tsx`

`EmptyState({ emoji, title, description, action? })` — centered placeholder with optional `{ label, href }` button.

### `expert-card.tsx`

`ExpertCard({ expert })` — marketing card for the (currently mock) expert marketplace. Avatar (lg + ring if available), name, specialty, rate, star rating, skills pills, jobs completed, availability button.

### `feature-icon.tsx`

`FeatureIcon({ icon, className? })` — inline 24×24 SVG for keys `room | ai | tasks | friends | timeline | expert`. Paths stored in the `iconPaths` record.

### `formatted-live-output.tsx`

`FormattedLiveOutput({ text, showRunButton? })` — parses raw CLI / AI text into typed blocks (code, heading, list, table, paragraph) and renders them. Code blocks are collapsible and copy-enabled; shell-like snippets also get an inline `<RunInTerminalButton>` when `showRunButton` is true.

Exports internal helpers: `parseBlocks(text)` (text → `Block[]`), `renderInline(text)` (inline markdown → JSX), and `CodeBlock({ lang, code })`.

### `left-rail.tsx`

`LeftRail()` — fixed 52 px navigation rail that expands to 200 px on hover/focus. Two groups: `alwaysItems` (Home, People, Settings) and `projectItems` (Workspace, Chat, Freestyle, Files, IDE, Downloads, Preview, Activity). Uses `usePathname()` + `useSearchParams()` to highlight the active route with an orange accent bar.

Exports the `RailNavItem` type and the `ICON_SIZE = "w-[18px] h-[18px]"` constant.

### `monolith-panel.tsx`

`MonolithPanel({ children })` — route-aware content wrapper. Four modes chosen by `usePathname()`:

- **onboarding** — full bleed, no margins.
- **full** — IDE / Files / Code — full width, no horizontal margin.
- **wide** — Chat / Preview — slightly inset.
- **standard** — default, centered with small side margins.

### `progress-ring.tsx`

`ProgressRing({ percent, size?=48, strokeWidth?=3.5, color?="#4ecdc4" })` — SVG ring with percentage label centered.

### `project-card.tsx`

`ProjectCard({ project })` — clickable card linking to `/dashboard/room`. Emoji in a colored square (based on `project.color` → `colorMap`), display name, status, `ProgressRing`, `AvatarStack`, "Updated X ago".

### `prompt-card.tsx`

`PromptCard({ text, sender?, initials?, time?, badge?, attachments?, onEdit?, models?, modelCatalog?, enabledProviders?, currentModel?, modes?, currentMode?, showEdit?, compact?, className? })` — edit-in-place prompt card. When `onEdit` is passed and `showEdit` is true, clicking the card opens an editor where the user can change text, pick a model (provider-tabbed catalog), pick a `ChatMode` (`"agent" | "ask" | "plan"`), and add/remove attachments. Image attachments render with a lightbox preview.

Exports types `ChatMode`, `ProviderKey`, `ModelCatalogEntry`.

### `run-in-terminal-button.tsx`

- `isShellLikeCode(lang, code): boolean` — true if the language tag is bash/shell/sh/zsh/powershell, or if the code starts with a shell command (`npm`, `git`, `curl`, …).
- `RunInTerminalButton({ code, lang?, variant? })` — renders a button that calls `window.electronAPI.system.openTerminal({ cwd, command: code, run: false })`, opening the OS terminal with the command pre-populated. Returns `null` for non-shell snippets. Supports a `muted` styling variant.

### `run-summary-card.tsx`

`RunSummaryCard({ fullText, isStreaming?, onCollapsed?, className? })` — feeds `fullText` through `buildRunSummary()` and renders a collapsible card with status badge, outcome text, mode icon, sections (with rich action steps when present), and prose. Shows a spinner while `isStreaming` is true.

Constants: `STATUS_CONFIG` (RunStatus → label/colors/icon), `MODE_ICONS`.

### `stat-block.tsx`

`StatBlock({ value, label, accent? })` — large value (display-4) + uppercase label. Accent colors `"sun" | "coral" | "aqua" | "violet"` tint the value.

### `status-dot.tsx`

`StatusDot({ status, label? })` — colored breathing dot with optional text label. `"live"` = aqua + breathing, `"busy"` = sun + breathing, `"offline"` = muted, no animation.

### `task-row.tsx`

`TaskRow({ task })` — single-line task card: priority dot + title + assignee + status badge. Completed tasks are strike-through with reduced opacity.

### `theme-provider.tsx`

- `useTheme(): { theme, toggle }` — must be used inside `ThemeProvider`.
- `ThemeProvider({ children })` — reads `cb-theme` from localStorage or falls back to `prefers-color-scheme: dark`; adds/removes the `dark` class on the document root and persists changes.

### `timeline-item.tsx`

`TimelineItem({ event })` — vertical timeline node with connector line, colored dot (AI=sun, human=aqua, expert=violet, system=muted), title, optional badge, description, timestamp. Constants: `typeStyles`.

### `activity-stream.tsx`

`ActivityStream({ events?, text?, onSelect?, selectedEventId?, compact? })` — renders a scrollable, collapsible timeline of agent execution phases. Takes either pre-parsed `events[]` or raw `text` (parsed inline). Sub-helpers: `parseActivityEvents`, `ActivityIcon`, `renderInline`, `MarkdownTable`.

### `activity-stream-v2.tsx`

`ActivityStreamV2({ events?, text?, onSelect?, selectedEventId?, compact? })` — enhanced version of `ActivityStream` with better markdown table alignment, inline formatting, and line-by-line collapsible bodies.

---

## 4.2 Hooks (`src/hooks/`)

### `use-active-desktop-project.ts`

- `useActiveDesktopProject(): { activeProject, canUseDesktopProject }`
  - Reads the currently active project from `window.electronAPI.settings` and subscribes to `settings:changed`.
  - **De-bounces large dashboard updates** — hashes a lightweight set of fields (`id`, `name`, `repoPath`, …) before committing re-renders, so big dashboard arrays (`conversation`, `activity`, `taskThreads`) don't cause UI thrash.
  - Falls back to `null` when `window.electronAPI` is absent; `canUseDesktopProject` reflects that.
- Exports `ActiveDesktopProject` type, `createDefaultDashboard()`, `normalizeActiveProject()`.

### `use-stream-events.ts`

- `useStreamEvents(): { events, processChunk, startStreaming, finalize, reset, getRawText, setScrollCallback }`
- Internally holds a `StreamEventParser`. `startStreaming()` begins a 200 ms poll that flushes parsed events to React state; `processChunk(text)` feeds a new CLI chunk; `finalize()` flushes remaining text and stops polling; `setScrollCallback(cb)` registers an optional scroll handler.

---

## 4.3 Lib (`src/lib/`)

### `format-time.ts`

- `nowTimestamp(): string` — returns the current time formatted like `"Apr 19, 3:42 PM"`.

### `mock-data.ts` (≈1,176 LOC)

Static demo data + shared types. Type exports:

| Type | Fields |
|---|---|
| `Friend` | `name, initials, online` |
| `Member` | extends `Friend` with optional `role` |
| `ProjectColor` | `"sun" | "coral" | "aqua" | "violet"` |
| `Project` | `id, name, emoji, status, progress, color, members[], updatedAgo` |
| `Task` | `id, title, status, priority?, assignee?` |
| `TimelineEvent` | `id, title, note, time, type` |
| `Expert` | `id, name, initials, specialty, rate, rating, bio, skills[], jobs, available` |
| `Idea` | `id, name, emoji, description, friends[], vibe, lastUpdate, updatedAgo` |
| `ArtifactPreviewMode` | `"interface" | "flow" | "runtime" | "data"` |
| `ArtifactPreviewView`, `ArtifactInterfaceScreen`, `ArtifactFlowStep`, `ArtifactRuntimeMetric`, `ArtifactRuntimeEvent`, `ArtifactDataColumn`, `ArtifactDataRow`, `ArtifactPreviewModel` | Rich preview model used by the Chat page's artifact view. |
| `BuildArtifact` | `id, title, description, status, updatedAgo, changes[], code, preview` |
| `Message`, `TaskConversationThread`, `SocialMessage`, `ProjectChannel`, `DirectMessageThread` | Chat/thread primitives. |

Exported data: `friends[]`, `ideas[]`, `buildArtifacts[]` (5 artifacts, each with interface/flow/runtime/data preview modes).

### `run-summary.ts` (≈1,130 LOC)

Dynamic response classifier that turns raw AI output into a structured, mode-aware summary.

**Types:**

- `RunStatus` — `"success" | "partial" | "warning" | "blocked" | "info"`
- `ResponseMode` — `"structured" | "conversational" | "analysis" | "instructional" | "plain"`
- `ResponseIntent` — `"action" | "explanation" | "analysis" | "debug" | "instructional" | "unknown"`
- `RunSummarySection` — `{ heading, items[], actionSteps? }`
- `ActionStep` — `{ title, details[] }`
- `RunSummary` — full structured output (`status, statusLabel, intent, mode, confidence, outcome, sections[], proseText, summaryText, fullText, hasSummary, hasModelSummary`).

**Main export:**

- `buildRunSummary(fullText): RunSummary` — parses `fullText` via `StreamEventParser`, extracts `## Summary` if present, detects intent / mode / status, builds filtered sections, and scores item quality.

**Internal helpers:** `extractModelSummary`, `detectIntent`, `detectResponseNature`, `classifyMode`, `buildSections`, `scoreItemQuality`, `filterSectionsByQuality`.

### `stream-event-parser.ts` (≈577 LOC)

Streaming CLI output → typed timeline events.

**Class:** `StreamEventParser`

| Method | Purpose |
|---|---|
| `processChunk(text)` | Appends a chunk, strips ANSI codes, splits by line, classifies each line. |
| `flushPending()` | Finalise a partial trailing line. |
| `getEvents()` | Current `ActivityEvent[]`. |
| `getRawText()` | Full accumulated raw text (ANSI-stripped). |
| `reset()` | Clear state. |

**Types:** `ActivityKind = "system"|"thinking"|"read"|"search"|"edit"|"run"|"list"|"result"|"error"`; `ActivityEvent = { id, kind, label, body, timestamp, endTime? }`.

**Parsing strategy:** regex-based tool detection (`Reading file`, `Searching for`, `Editing file`, `Running command`, etc.), narrative breakout (embedded action phrases inside thinking), multi-line continuation (indentation, pipes, prefixes), ANSI stripping.

### `electron.d.ts` (≈859 LOC)

The authoritative TypeScript description of `window.electronAPI`. Grouped by namespace; mirror of the preload bridge.

**Namespaces:**

- `system` — `openDirectory`, `openFiles`, `readFileAsDataUrl`, `saveUploadedFile`, `openExternal`, `openTerminal({ cwd?, command?, run? })`, `getCommonPaths`, `getBuildTag`, `platform`.
- `process` — `run`, `runProgram`, `cancel`, `listRunning`, `onStarted`, `onOutput`, `onCompleted`, `onError`, `onCancelled`, `onTimeout`. Types: `ProcessRunPayload`, `ProcessOutputEvent`, `ProcessLifecycleEvent`, `TerminalResult`, `RunningProcess`.
- `repo` — all 12 operations with typed inputs/outputs (`RepoStatusFile`, `RepoCommitSummary`, `RepoInspection`, `RepoDirectoryEntry`, `RepoFileContent`, `RepoWriteFilePayload`, `RepoFileDiff`, `RepoCommitPayload`, `RepoCommitDetails`).
- `settings` — `read`, `patch`, `onChange`. Types `DesktopSettings`, `DesktopSettingsPatch`.
- `project` — `list`, `create`, `setActive`, `delete`, `generatePlan`, `sendPMMessage`, `sendTaskMessage`, `sendSoloMessage`, `onChanged`, `onAgentEvent`. Types `DesktopProject`, `ProjectCreatePayload`, `ProjectDeletePayload`, `ProjectGeneratePlanPayload`, `ProjectSendPMMessagePayload`, `SoloSession`, `SendSoloMessagePayload`.
- `modelCatalogs` — `list() → ModelCatalogs` (with `copilot[]`, `claude[]`, `codex[]`, `_version`, `_updated`).
- `sharedState` — `init`, `readFile`, `writeFile`, `listDirectory`, `saveConversation`, `loadConversation`, `saveMember`. Types `SharedConversationData`, `SharedStateFileResult`, `SharedStateDirEntry`.
- `p2p` — `join`, `leave`, `status`, `onPresence`, `onChatToken`, `onChatMessage`, `onStateChange`, `onReconnecting`. Types `P2PJoinPayload`, `P2PJoinResult`, `P2PStatus`, `P2PPeer`, `P2PPresenceEvent`.

Every `on*` method returns an unsubscribe function.

---

## 4.4 Global styles (`src/app/globals.css`)

See **[06 — Styling & UI System](./06-styling-ui.md)** for a full breakdown of tokens, component
classes, scrollbars, and animations.
