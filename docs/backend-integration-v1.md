# Backend Integration V1

## Goal

Turn CodeBuddy into a local-first desktop app that can work with:

- local repositories
- Git and GitHub-backed workflows
- local CLI AI tools such as GitHub Copilot through `gh copilot`
- generic shell-driven developer tools such as npm, pnpm, bun, tests, and build commands
- future local AI CLIs through a provider model

This plan keeps orchestration on the user's machine through Electron. The desktop app owns local repo access, local process execution, streamed output, tool detection, and settings. The current frontend should remain intact and progressively swap mock data for real backend data.

## Product Direction For V1

- Local-first desktop only
- Git and local repo operations included in v1
- Generic shell execution included in v1
- GitHub Copilot through `gh copilot` included as the first local AI provider path
- GitHub remote linkage included in a lightweight form after local repo flows are stable
- Claude Code remains optional and secondary in v1

## Core Backend Modules

### 1. System and settings layer

Responsibilities:

- remember workspace roots and known repositories
- store preferred shell and CLI tool paths
- store feature flags and desktop preferences
- keep secrets out of renderer state

Notes:

- non-secret preferences can live in a local desktop config store
- secrets and tokens should move to OS-native secure storage

### 2. Repo service

Responsibilities:

- open and inspect local repositories
- read current branch, changed files, commit history, and diff summaries
- support safe repo actions such as checkout, pull, and commit in later phases

Notes:

- prefer a higher-level Git abstraction for standard flows
- use controlled shell fallback only where needed

### 3. Process runner

Responsibilities:

- run commands in a selected working directory
- stream stdout and stderr to the renderer
- support timeout, cancellation, and exit status
- detect long-lived preview processes and report their ports

Notes:

- this becomes the backend for the current Preview screen first
- later it also powers chat-triggered runs and tool actions

### 4. AI provider layer

Responsibilities:

- define one provider contract for local AI CLIs
- support provider detection, configuration, prompt execution, streaming output, and normalized results
- make GitHub Copilot through `gh copilot` the first provider implementation

Notes:

- GitHub Copilot has a viable CLI entry path through `gh copilot`, though the command is still preview and should be treated carefully
- other local AI tools should plug into the same provider contract

### 5. Activity event layer

Responsibilities:

- normalize git, process, and AI events into one desktop event stream
- feed the Activity screen and selected chat summaries
- make backend work legible to non-technical users

## UI Integration Order

### Preview

First real backend target.

- start and stop local commands
- stream logs
- report running state truthfully from the backend
- detect and open preview URLs

### Files

Second target.

- replace mock repo tree with real repository data
- show branch state, changed files, commits, and diff summaries
- keep current interface structure intact while real data replaces mock slices

### Chat

Third target.

- stream command and AI output into the current workspace
- connect task-scoped actions to repo and tool operations
- attach generated artifacts and summaries to the current conversation model

### Activity

Fourth target.

- show normalized git, process, and AI events
- reuse the current timeline structure rather than inventing a second event UI

### Settings

Fifth target.

- configure workspace defaults
- manage CLI paths and provider enablement
- display GitHub connection state

## Phase Plan

### Phase 1: contract and service seams

- define the renderer-facing desktop API
- split Electron into IPC registration and focused services
- add a local settings store for non-secret preferences

### Phase 2: local execution core

- build repo inspection APIs
- build process execution with streaming and cancellation
- add the first provider contract and GitHub Copilot CLI provider scaffold

### Phase 3: wire the current UI

- Preview consumes process APIs
- Files consumes repo APIs
- Chat consumes process and provider streams
- Activity consumes normalized event streams

### Phase 4: GitHub remote linkage

- connect repo identity to GitHub
- expose branch or PR links and workflow status
- keep local execution independent from hosted services

## Security Rules

- validate all working directories before executing commands
- keep command execution scoped to user-selected project roots
- require explicit confirmation for destructive repo actions
- avoid storing secrets in plain config or renderer state
- keep Electron context isolation enabled and Node integration disabled in the renderer

## Migration Rule

Do not rewrite the UI around the backend. Preserve the current frontend structure and progressively replace mock data screen by screen.

## Initial Implementation Targets In This Repo

- [electron/main.js](electron/main.js)
- [electron/preload.js](electron/preload.js)
- [src/lib/electron.d.ts](src/lib/electron.d.ts)
- [src/app/project/preview/page.tsx](src/app/project/preview/page.tsx)
- [src/app/project/files/page.tsx](src/app/project/files/page.tsx)
- [src/app/project/chat/page.tsx](src/app/project/chat/page.tsx)
- [src/app/project/activity/page.tsx](src/app/project/activity/page.tsx)
- [src/app/project/settings/page.tsx](src/app/project/settings/page.tsx)
