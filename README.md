# CodeCollab

> **Build software with your friends, with AI, on your own machines — no cloud, no subscription, no server in the middle.**

CodeCollab is a local-first, peer-to-peer desktop workspace for collaborative "vibe coding." It bundles AI coding agents, real-time multiplayer collaboration, a Monaco-based editor, an integrated terminal, a live preview pane, and GitHub-backed sync into a single Electron app — and it runs entirely on hardware you already own.

There is no CodeCollab server. There is no CodeCollab account. There is no CodeCollab subscription. The app you install is the entire product. When you collaborate with a friend, your two computers talk directly to each other over an authenticated, end-to-end encrypted peer-to-peer mesh, and your code lives in your own GitHub repository under your own account.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform: Windows | macOS](https://img.shields.io/badge/platform-windows%20%7C%20macOS-lightgrey)](#platform-support)
[![Status: Beta](https://img.shields.io/badge/status-beta-orange)](#project-status)

---

## Table of Contents

- [Why CodeCollab Exists](#why-codecollab-exists)
- [What It Is](#what-it-is)
- [What Makes It Different](#what-makes-it-different)
- [Feature Tour](#feature-tour)
- [Quickstart](#quickstart)
- [Installation](#installation)
- [First-Run Onboarding](#first-run-onboarding)
- [Working Solo](#working-solo)
- [Working With Friends](#working-with-friends)
- [The AI Provider Layer](#the-ai-provider-layer)
- [The P2P Layer](#the-p2p-layer)
- [The Sync Layer (Git + GitHub)](#the-sync-layer-git--github)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Building From Source](#building-from-source)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Security Model](#security-model)
- [Privacy](#privacy)
- [Data on Disk](#data-on-disk)
- [Configuration & Environment Variables](#configuration--environment-variables)
- [Troubleshooting](#troubleshooting)
- [Performance Notes](#performance-notes)
- [Platform Support](#platform-support)
- [Roadmap](#roadmap)
- [Project Status](#project-status)
- [Contributing](#contributing)
- [Code of Conduct](#code-of-conduct)
- [License](#license)
- [Acknowledgements](#acknowledgements)
- [FAQ](#faq)

---

## Why CodeCollab Exists

Building anything that involves code with another person, in real time, using AI, should be a solved problem. It is not.

Today if you and a friend want to build an app together with the help of an AI agent, you have two options, both bad:

1. **One of you remotes into the other's machine.** Now exactly one person is productive at a time. The agent sees one person's context, which is locked on that persons computer, and the other person watches.
2. **Each of you runs your own agent on your own machine.** Now you have two agents that don't know about each other, two parallel sets of edits, two divergent understandings of "what the project is," and a merge problem the moment one of you commits.

The thing both options miss is that **the conversation with the AI is the work.** The prompts you've sent, the files the agent has read, the dead ends you've already ruled out, the architectural decisions you made on the third iteration — that context is the most valuable artifact in the entire session, and on every existing tool it lives trapped on a single computer.

CodeCollab treats that context as a first-class shared object. When you and your friend join the same project, you join the same conversation. You see each other's prompts in real time. You see each other's agent output streaming token-by-token. You move tasks across a shared board. You watch each other's files change. The AI agents themselves still run locally — your Claude runs on your machine, your friend's Copilot runs on theirs — but the **work product** they produce, the **state** of the project, and the **code itself** stay in lockstep through CRDT-based state sync and automatic Git push/pull.

This is what we mean by "vibe coding with friends." It is the Figma moment for code, except the canvas is a real Git repository and the cursors are autonomous coding agents.

---

## What It Is

CodeCollab is a desktop application written in TypeScript and JavaScript, packaged with Electron, that gives you:

- A **project dashboard** for creating, importing, opening, and deleting projects (each project is its own Git repository on disk).
- A **PM Chat** view where you talk to an AI in plain English about your whole project — describe the app you want to build and the AI generates an MVP plan with subprojects and tasks.
- A **Freestyle chat** view for ad-hoc coding sessions not tied to a specific task.
- A **Workspace task board** that turns your plan into a kanban with To-Do / In-Progress / Review / Done columns.
- An **integrated IDE** built on Monaco Editor with a file tree, multi-tab editing, and an AI side-panel.
- A **live preview pane** that detects when your project is running a dev server (`npm run dev`, `python app.py`, etc.) and embeds the running app inline.
- An **integrated terminal** for running arbitrary commands inside the project's working directory.
- A **file browser** with Git history, staged/unstaged change views, and an artifact viewer for files the AI generated.
- An **activity stream** that pulls in GitHub events (commits, PRs, issues, deploys) alongside local activity (P2P joins, agent runs, file changes).
- A **collaborator manager** for sending and receiving invite codes.
- A **settings page** for connecting your GitHub account, picking AI providers, switching themes, and configuring tooling.
- A **first-run onboarding wizard** that detects what you have installed (Git, Node, GitHub CLI, Claude Code, Copilot CLI, Codex CLI), installs what's missing via `winget` (Windows) or Homebrew (macOS), and walks you through GitHub auth and AI provider setup.

The whole app fits inside one window. There is no separate VS Code, no separate browser, no separate terminal. You can do this entire workflow without leaving CodeCollab:

> describe an app → review the plan → run an agent on a task → watch it edit your code → preview the running app → commit and push → invite a friend → see them join → watch their agent edit code in your shared repo → ship.

---

## What Makes It Different

| | Replit / GitHub Spaces / Codespaces | Cursor / Windsurf | CodeCollab |
|---|---|---|---|
| **Where the code runs** | Cloud VM | Your machine | Your machine |
| **Where collab happens** | Cloud server | None (single-player) | Direct P2P between machines |
| **Where the AI runs** | Cloud (provider) | Cloud (provider) | Local CLI (Claude / Copilot / Codex) on your machine |
| **Server dependency** | Required | None | None — Hyperswarm DHT |
| **Account required** | Yes | Yes | Just your existing GitHub account |
| **Subscription** | Yes | Yes | None |
| **Source repo location** | Their cloud | Your machine | Your machine + your GitHub |
| **Offline capable** | No | Editor yes, AI no | Editor yes, P2P no, AI yes if local CLI |
| **Conversation history shared with collaborators** | Per-cloud-room | N/A | Yes, via CRDT sync |

The combination that's hard to find anywhere else: **multiplayer, AI-native, fully local, free, and it speaks Git natively.**

---

## Feature Tour

### Project Manager Chat (PM Chat)

A long-form conversation with an AI that knows your whole project. Describe what you want to build; the AI proposes an MVP plan organized into "subprojects" (kanban columns) with concrete tasks underneath each. Iterate on the plan. Ask follow-up questions. The AI remembers everything in the session and can re-read any file in your repo before answering.

The PM Chat does not write code itself — it is the planning brain. Each generated task gets a "starting prompt" that you can hand to an executing agent in one click.

### Freestyle Chat

A free-form coding session not tied to any task. Ideal for "I just need to debug this one function" or "rewrite this regex." Sessions are named, persistent, and listed in a sidebar — you can keep multiple parallel threads going.

The Freestyle pane includes a right-hand toolbox:

- **Files tab** — browse the repo, click to open in Monaco.
- **Terminal tab** — run shell commands in the project root.
- **Changes tab** — see the diff of everything the AI just modified.

### IDE

A VS Code-style editor inside the app, powered by Monaco. Includes:

- File explorer pinned to the left.
- Multi-tab editor with syntax highlighting for every Monaco-supported language.
- An AI chat side-panel that can edit the open file.
- Standard shortcuts: `Ctrl+B` to toggle the sidebar, `Ctrl+S` to save.
- Resizable sidebar and chat panes.

> **Beta.** The IDE is functional but rough; the chat panel is the safer surface for now.

### Live Preview

Hit **Run App** and CodeCollab inspects your project, infers the right start command (`npm run dev` for Next.js, `python app.py` for Flask, etc.), spawns it, listens to stdout for a `localhost:NNNN` URL, then renders that URL in an embedded `<webview>`. Resize between desktop / tablet / mobile breakpoints. Logs stream into a collapsible panel below.

> **Beta.** Preview detection is heuristic — for unusual project layouts you can override the start command in project settings.

### Files & Git

Three tabs:

- **Code** — file tree, click to view.
- **Updates** — commit history with diffs.
- **IDE** — full editor with stage / unstage / commit / branch-switch UI.

CodeCollab does not invent its own VCS. Everything is stock Git. You can `cd` into your project from any other tool and it'll just work.

### Artifacts

Every file an AI generates during a chat session is tagged. The Artifacts tab gives you a unified gallery of those files across all your sessions, filterable by session, viewable in grid or list, with previews.

### Activity Stream

Combines local events (agent runs started/finished, files changed, P2P joins, commits) with remote GitHub events (PRs opened, issues filed, deploys finished) via the GitHub REST API. One feed, sorted chronologically, per project.

### Documentation Generator

Click a button; the AI generates a fresh `README` / getting-started guide / structure overview / API reference for your project, based on actually reading the code. Useful at the "just shipped MVP" stage when you want to onboard a friend.

### Settings

- **Profile** — display name, GitHub account.
- **Appearance** — light / dark, accent color.
- **AI Tools** — install / uninstall / sign in to Claude Code, Copilot CLI, Codex CLI.
- **GitHub** — connect, switch active account, manage repo permissions.
- **System** — version info, build tag, log location, "Reset all data."

---

## Quickstart

```bash
# 1. Clone
git clone https://github.com/<owner>/CodeCollab.git
cd CodeCollab

# 2. Install dependencies
npm install

# 3. Run in dev mode (Next.js + Electron, hot reload)
npm run dev:electron
```

That's it. The app opens, walks you through onboarding, and you're in.

For a packaged build instead of dev mode, see [Building From Source](#building-from-source).

---

## Installation

### Pre-built (recommended for non-developers)

> **Pre-built installers will be published on the GitHub Releases page once we tag the first public release.** Until then, build from source — see below.

When releases are available, you'll get:

- **Windows:** `CodeCollab Setup X.Y.Z.exe` (NSIS installer) — installs to `%LOCALAPPDATA%\Programs\CodeCollab` by default, creates desktop and Start Menu shortcuts.
- **macOS:** `CodeCollab-X.Y.Z-arm64.dmg` — drag-and-drop into `/Applications`.

After install, launch the app like any other native application.

### From source

See [Building From Source](#building-from-source) below. Short version:

```bash
git clone <repo>
cd CodeCollab
npm install
npm run build:electron     # produces installers in dist-electron/
```

---

## First-Run Onboarding

The first time you launch CodeCollab, a 6-step wizard runs:

1. **Welcome.** Brief intro and "what this app expects from your machine."
2. **Tools check.** CodeCollab detects whether the following are installed:
   - **Git** (required)
   - **Node.js** (required for most projects)
   - **GitHub CLI** (`gh`, required for GitHub auth flow)
   - **Python** (optional, for Python projects)

   Anything missing gets a one-click **Install** button that shells out to:
   - `winget install` on Windows.
   - `brew install` on macOS.

   You're never asked to run a terminal command yourself.

3. **GitHub authentication.** Click **Sign in with GitHub** and a browser tab opens with a one-time device code displayed in the app. Paste the code, authorize, come back. The token is stored by the GitHub CLI's normal token store (`gh auth status`) — CodeCollab never reads or writes raw tokens.

4. **AI providers.** Pick which agents you want to enable. Each one runs its own OAuth flow in-app immediately after install — a one-time device code appears in the wizard, the verification URL opens automatically in your browser, and the token lands in your OS credential store (Credential Manager / Keychain / libsecret). No terminal required.
   - **GitHub Copilot CLI** — separate `copilot login` device flow (uses your GitHub account but stores its own token, distinct from `gh auth`).
   - **Claude Code** — sign in via OAuth in browser, or paste an Anthropic API key.
   - **Codex CLI** — sign in via OpenAI OAuth, or paste an OpenAI API key.

   You can enable any combination and switch models per chat. You can also skip this step and add providers later from Settings.

5. **Profile.** Pick a display name. This is what shows up next to your messages and prompts when collaborating.

6. **Done.** You land on the Home screen.

The wizard is idempotent — you can re-run any step from Settings later if you skip something.

---

## Working Solo

The 60-second solo loop:

1. **Home → New Project.** Name it, optionally pick a folder, optionally create a GitHub repo (recommended; lets you back up and collaborate later).
2. **Click the project to open the workspace.**
3. **Open PM Chat.** Type: *"I want to build a habit-tracking app with a calendar view and weekly summary email."*
4. **Wait for the plan.** You'll get something like 3–5 subprojects with 3–8 tasks each.
5. **Click a task → "Run agent."** The starting prompt is pre-filled. Pick a model. Hit send.
6. **Watch the agent stream.** Tokens appear in real time. Files it edits appear in the Changes tab. You can interrupt at any time.
7. **When it's done,** review the diff. Approve, reject, or ask for changes.
8. **Click Preview.** The app launches your dev server and embeds it.
9. **Push to GitHub.** Either let auto-commit do it, or push manually from the workspace toolbar.

Every agent run is **checkpointed** — before any agent edits files, CodeCollab snapshots them. If you don't like the result, one click rolls back the entire run.

---

## Working With Friends

Sharing a project takes two clicks for the host and two for the joiner.

### Host

1. Open the project workspace.
2. Toggle **P2P** on (top-right of the project header).
3. Click **Invite friend.** A long invite code appears.
4. Send the code to your friend over any channel you trust (DM, Signal, email — treat it like a password; see [Security](#security-model)).

### Joiner

1. From Home, click **Join with Invite Code.**
2. Paste the code.
3. Pick a folder to clone the repo into.
4. Click **Join.** CodeCollab clones the repo, registers the project locally, joins the same Hyperswarm topic, and you're both online.

### What syncs in real time

When two or more people are connected:

- **AI agent output** streams between machines token-by-token. If your friend triggered a Claude run, you watch the same tokens appear in your chat as they arrive on their machine.
- **Task moves** (drag from In Progress → Done) are immediate.
- **Plan edits** (new subproject, new task, edited task title) propagate.
- **File changes** auto-commit on the host's machine to a `codecollab-build` branch and auto-push; the joiner's machine auto-pulls. There is a small (a few seconds) delay; this is not a CRDT-edit-the-same-file experience like Google Docs — it's a "we both see each other's changes within ~10 seconds" experience, mediated by Git.
- **Chat messages** in any chat surface (PM, Freestyle, task chats) sync.
- **Activity events** (X started agent run, Y finished, Z committed) appear in both feeds.

### What does not sync

- Your local terminal. If you're poking around in the integrated terminal, that's your own session.
- Your local environment variables and `.env` files.
- Your AI provider auth. Each peer uses their own AI account.

### Removing someone

Click **Regenerate invite code** in project settings. The project's shared P2P secret rotates. Anyone with the old code is locked out of the room. Existing peers stay connected.

---

## The AI Provider Layer

CodeCollab does not run its own model. It is a thin orchestrator that drives one of three first-party CLIs, all of which run as child processes on your machine:

| Provider | CLI | Auth options | What we do with it |
|---|---|---|---|
| **GitHub Copilot** | `copilot` CLI | `copilot login` OAuth device flow (own token in OS credential store) | Spawn, pipe stdin, parse stdout, relay events to UI and peers |
| **Claude Code** | `claude` CLI from Anthropic | OAuth via browser, or `ANTHROPIC_API_KEY` | Same |
| **Codex CLI** | `codex` CLI from OpenAI | OAuth via browser, or `OPENAI_API_KEY` | Same |

All three CLIs are external tools maintained by their respective vendors. CodeCollab does not bundle them. The onboarding wizard detects whether each one is installed and offers a one-click install.

### Model selection

The model picker in chat shows the **discovered** model list, refreshed in the background after every Copilot CLI auth event. Discovery has three tiers:

1. The Copilot CLI's OAuth token is read from the OS credential store and used to call the live `/models` API for authoritative reasoning levels (`low` / `medium` / `high` / `xhigh`) per model.
2. Real billing multipliers are scraped from the local Copilot CLI debug logs (`~/.copilot/logs/*.log`) once a model has been used.
3. Default multipliers seeded from the official VS Code Copilot picker fill in any model that hasn't been exercised yet, marked with a `usageIsDefault: true` flag.

The static fallback at [`electron/config/model-catalogs.json`](electron/config/model-catalogs.json) is only used if discovery fails (e.g. Copilot CLI not signed in). Models marked **"Requires API key"** are not covered by your OAuth subscription and need a configured API key.

### Why CLIs and not direct API calls?

Three reasons:

1. **Auth is the vendor's problem, not ours.** We never see your API key or OAuth token. The CLI handles it. We just spawn the binary.
2. **Tool use comes free.** Each CLI implements the agent loop (read file, edit file, run shell command) natively. We piggyback on that.
3. **You can run the CLI standalone.** If CodeCollab disappears tomorrow, your `claude` and `gh copilot` installs still work in any terminal.

---

## The P2P Layer

The collaboration mesh is built on [**Hyperswarm**](https://github.com/holepunchto/hyperswarm), the same DHT-based discovery protocol Hypercore Protocol uses for Bittorrent-style peer discovery.

### Topic derivation

Each project derives its Hyperswarm "topic" (a 32-byte buffer that determines who finds whom) from:

```
topic = SHA-256( normalized_remote_url || project.p2pSecret )
```

`project.p2pSecret` is a 32-byte random value generated once when the project is created and stored in `.codebuddy/p2p-secret`. **Both** the remote URL and the secret are required, so:

- Knowing only a project's GitHub URL is not enough to join its room (this is intentional — public repos must not have public collaboration rooms).
- The secret is included in invite codes and travels with them.

### Wire authentication

Every P2P frame is signed with HMAC-SHA256 using a key derived from the project secret:

```
hmac_key = HKDF(p2pSecret, "codebuddy:v3:hmac")
frame   = { payload, mac: HMAC-SHA256(hmac_key, payload) }
```

Receivers verify the MAC before parsing. Frames with bad MACs are dropped silently. This means a passive observer on the same DHT cannot inject messages even if they somehow learn the topic.

### Transport encryption

Hyperswarm's underlying connection is end-to-end encrypted via Noise Protocol Framework (NoisePK). HMAC sits on top of that, so we have both transport secrecy and application-layer authenticity.

### Message types

Seven application-level message types are defined:

| Type | Purpose |
|---|---|
| `hello` | Identity exchange (display name, member ID, app version) |
| `yjs-update` | Yjs CRDT incremental update |
| `yjs-sync` | Yjs CRDT state-vector exchange (for catch-up) |
| `heartbeat` | Keepalive every 30 seconds; peers timed out after 90s |
| `chat-token` | Streaming AI agent output token (one frame per token batch) |
| `chat-message` | Complete chat message (after streaming ends) |
| `state-change` | Task move, plan edit, thread update, etc. |

### CRDT state

Most shared mutable state (tasks, plan, threads, chat history) lives in a **Yjs document** per project. Yjs handles concurrent edits without conflicts by design — two peers who edit the same task title simultaneously converge to a deterministic merged result without a server.

### Hardening

Incoming peer payloads are aggressively defensive:

- Frame size capped (1 MB) before parsing.
- JSON parse depth-limited.
- Object keys filtered for prototype-pollution vectors (`__proto__`, `constructor`, `prototype`).
- All strings size-capped before reaching React.
- Unknown message types dropped silently.

See [`electron/services/p2p-service.js`](electron/services/p2p-service.js) and [`SECURITY.md`](SECURITY.md) for the full picture.

---

## The Sync Layer (Git + GitHub)

CodeCollab is opinionated about Git in exactly one way: **every project is a Git repository, and we auto-commit while agents work.**

### Auto-commit

Every ~10 seconds during an agent run, the file watcher service stages all changes inside the project root and commits them to a working branch named `codecollab-build`. The commit message is auto-generated from the agent's recent activity.

**Why a separate branch?** So your `main` is never accidentally polluted by mid-run agent state. When you're happy with the result, you (or the agent) can fast-forward `main` from `codecollab-build` via the **Push to Main** button in the workspace toolbar.

### Auto-push / auto-pull

When P2P is on:

- The host pushes `codecollab-build` after each commit.
- Connected peers pull `codecollab-build` periodically and merge into their local copy.

If a pull fails (e.g., the peer made a local edit that conflicts), CodeCollab does a **soft reset** of the working branch and re-fetches, preserving the remote state. Your work is never lost — it's stashed first — but the branch is rewound to match the host. This is the right tradeoff for "AI is the primary editor"; it would be wrong for "humans editing the same file at the same time" (and we don't claim to support that yet — see [Roadmap](#roadmap)).

### GitHub authentication

We use the official `gh` CLI for everything. CodeCollab never sees your token. When you click "Create GitHub repo" we shell out to `gh repo create`. When we push, we use the credential helper `gh` already installed.

### Argv-only Git

All Git operations use `execFile` with an explicit argv array, never `exec` with a shell-interpreted string. This means commit messages, branch names, file paths, etc. cannot break out into shell commands no matter what they contain — important because agent-generated commit messages occasionally include backticks and dollar signs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Electron Process                       │
│                                                              │
│  ┌────────────────────────┐   ┌──────────────────────────┐  │
│  │     Main Process       │   │   Renderer (Next.js)     │  │
│  │     (Node.js)          │   │   (Chromium)             │  │
│  │                        │   │                          │  │
│  │  ─── Services ───      │   │  ─── Pages ───           │  │
│  │   project-service      │◄──┤   /home                  │  │
│  │   p2p-service          │   │   /project               │  │
│  │   process-service      │   │   /project/chat          │  │
│  │   repo-service         │   │   /project/code          │  │
│  │   settings-service     │   │   /project/files         │  │
│  │   tooling-service      │   │   /project/ide           │  │
│  │   file-watcher-service │   │   /project/preview       │  │
│  │   activity-service     │   │   /project/activity      │  │
│  │   shared-state-service │   │   /project/docs          │  │
│  │                        │   │   /project/settings      │  │
│  │                        │   │   /people                │  │
│  │                        │   │   /settings              │  │
│  │                        │   │   /onboarding            │  │
│  │                        │   │                          │  │
│  └──────────┬─────────────┘   └────────────┬─────────────┘  │
│             │       contextBridge          │                 │
│             │     ┌─────────────────┐      │                 │
│             └────►│   preload.js    │◄─────┘                 │
│                   └─────────────────┘                        │
│                                                              │
│   ┌──────────────────────┐   ┌──────────────────────┐       │
│   │  Hyperswarm DHT      │   │  Spawned CLIs        │       │
│   │  + Yjs CRDT          │   │  (claude/copilot/    │       │
│   │  (P2P mesh)          │   │   codex/gh/git)      │       │
│   └──────────────────────┘   └──────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Process boundaries

**Main process** — Node.js. Owns: filesystem, child processes, network sockets, all secrets, all IPC handlers. Has full OS access.

**Renderer process** — Chromium. Owns: the UI. Sandboxed. `nodeIntegration: false`, `contextIsolation: true`. Cannot directly read/write disk, spawn processes, or open arbitrary network connections.

**Preload script** — Privileged bridge. Exposes a narrow `window.electronAPI` to the renderer with explicit, typed methods. The full surface is documented in [`src/lib/electron.d.ts`](src/lib/electron.d.ts).

This is the standard "secure-by-default" Electron architecture. The renderer cannot be tricked into reading your files even if a malicious package somehow gets loaded into the React tree.

### Backend services

| Service | Responsibility |
|---|---|
| [`project-service`](electron/services/project-service.js) | Project CRUD; AI agent spawning, prompt construction, output parsing; plan and task state |
| [`p2p-service`](electron/services/p2p-service.js) | Hyperswarm topic management, peer discovery, frame signing/verification, Yjs sync |
| [`process-service`](electron/services/process-service.js) | Generic child-process lifecycle (spawn, kill, output streaming) |
| [`repo-service`](electron/services/repo-service.js) | Git operations: clone, commit, push, pull, branch, soft-reset recovery |
| [`settings-service`](electron/services/settings-service.js) | Per-user persistent settings (`settings.json`) |
| [`tooling-service`](electron/services/tooling-service.js) | Detect / install Git, Node, gh, Claude Code, Copilot CLI, Codex CLI |
| [`file-watcher-service`](electron/services/file-watcher-service.js) | Project tree watching, debounced auto-commit, push throttling |
| [`activity-service`](electron/services/activity-service.js) | GitHub REST API integration (issues, PRs, branches, deploys) |
| [`shared-state-service`](electron/services/shared-state-service.js) | Cross-service singleton state and event bus |
| [`git-queue-service`](electron/services/git-queue-service.js) | Serialize Git operations to avoid lock contention |

### Frontend

Built on **Next.js 16 (App Router)** + **React 19** + **TypeScript** + **Tailwind CSS 3**. Despite Next being SSR-capable, we run it in fully static mode (`output: "export"`) — Electron loads the resulting HTML/JS off disk.

The design system internally is called **"Pulse"**:

- **Layout primitives** — `LeftRail` (collapsible nav rail) and `MonolithPanel` (content wrapper with width modes: standard / wide / full / onboarding).
- **Type** — Inter (body), Space Grotesk (display), JetBrains Mono (code).
- **Color** — token-driven via CSS custom properties; dark/light via Tailwind's `class` strategy.
- **Per-project color DNA** — each project gets a deterministic accent palette derived from its name, used for the breathing-orb identity mark.

---

## Project Structure

```
CodeCollab/
├── electron/
│   ├── main.js                  # Electron entry; window/lifecycle/security config
│   ├── preload.js                # contextBridge → window.electronAPI
│   ├── config/
│   │   └── model-catalogs.json   # AI model definitions per provider
│   ├── ipc/
│   │   └── register-handlers.js  # All IPC channel registrations
│   └── services/
│       ├── activity-service.js
│       ├── file-watcher-service.js
│       ├── git-queue-service.js
│       ├── p2p-service.js
│       ├── process-service.js
│       ├── project-service.js
│       ├── repo-service.js
│       ├── settings-service.js
│       ├── shared-state-service.js
│       └── tooling-service.js
│
├── src/
│   ├── app/                      # Next.js App Router routes
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── home/
│   │   ├── onboarding/
│   │   ├── people/
│   │   ├── project/
│   │   │   ├── activity/
│   │   │   ├── artifacts/
│   │   │   ├── chat/
│   │   │   ├── code/
│   │   │   ├── docs/
│   │   │   ├── files/
│   │   │   ├── ide/
│   │   │   ├── messages/
│   │   │   ├── preview/
│   │   │   └── settings/
│   │   └── settings/
│   ├── components/               # Shared React components
│   ├── hooks/                    # Custom hooks
│   └── lib/                      # Types, parsers, utilities
│       ├── electron.d.ts         # Type definitions for window.electronAPI
│       ├── format-time.ts
│       ├── mock-data.ts
│       ├── run-summary.ts
│       └── stream-event-parser.ts
│
├── docs/
│   ├── architecture.md
│   ├── User-Guide.md
│   └── White-Paper.md
│
├── public/                       # Static assets bundled into the renderer
├── build/                        # Icons & build resources (icon.ico, icon.icns, icon.png)
├── scripts/                      # Build helpers (after-pack, deploy-install, generate-icon)
│
├── debug-start.bat               # Launch packaged app with verbose logging (Windows)
├── FRESH-START.bat               # Wipe userData and relaunch (Windows)
├── UNINSTALL-ALL.bat             # Full uninstall (Windows)
├── UPDATE.ps1                    # Pull latest build into install folder (Windows)
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
├── package.json
├── README.md
├── LICENSE
├── SECURITY.md
└── CONTRIBUTING.md
```

---

## Building From Source

### Prerequisites

- **Node.js 18+** (we test on 20 and 22).
- **npm 9+** (ships with Node).
- **Git 2.40+**.
- **Platform-specific:**
  - Windows: PowerShell 5.1+ (built-in on Win10/11). For icon embedding, the build runs `rcedit` automatically — no manual setup.
  - macOS: Xcode Command Line Tools (`xcode-select --install`). For icon generation from a PNG source: `iconutil` (built-in).
  - Linux: build is supported but unverified. Standard build-essential / libnss / libgtk dev packages.

### Clone & install

```bash
git clone https://github.com/<owner>/CodeCollab.git
cd CodeCollab
npm install
```

`postinstall` runs `electron-builder install-app-deps`, which compiles native modules (sodium-native, `@hyperswarm/secret-stream`, etc.) for your platform's Electron version. This takes 1–3 minutes the first time.

### Build commands

```bash
# Next.js production build only (no Electron packaging)
npm run build

# Full Electron build → installers in dist-electron/
npm run build:electron

# Build + deploy to local install folder (Windows convenience script)
npm run deploy

# Generate app icons from build/source-logo.png
npm run build:icon
```

### Build outputs

After `npm run build:electron`:

- **Windows:** `dist-electron/CodeCollab Setup X.Y.Z.exe` (NSIS installer) plus an unpacked tree in `dist-electron/win-unpacked/`.
- **macOS:** `dist-electron/CodeCollab-X.Y.Z-arm64.dmg` plus the .app bundle in `dist-electron/mac-arm64/`.
- **Block maps and yml** for electron-updater are generated alongside.

### Code signing

Code signing is **not** configured by default. The Windows NSIS installer is built unsigned. The macOS .app is ad-hoc signed (works on the build machine, will trigger Gatekeeper prompts elsewhere).

To enable real signing:

- **Windows** — set `CSC_LINK` (path or base64 of your .pfx) and `CSC_KEY_PASSWORD` env vars. electron-builder picks them up automatically.
- **macOS** — set `CSC_LINK` to a Developer ID cert and `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD` for notarization.

We don't ship signing assets in the repo — fork it and add yours.

---

## Development Workflow

### Run the app in dev mode

```bash
npm run dev:electron
```

This concurrently:

1. Starts Next.js dev server on `http://localhost:3000` with Turbopack and hot reload.
2. Waits for `localhost:3000` to be reachable.
3. Launches Electron pointing at the dev server.

Edit any file in `src/` and the renderer hot-reloads. Edit any file in `electron/` and you need to manually relaunch (Ctrl+C and re-run).

### Debug logging

Set `DEBUG_VERBOSE=1` before launching for very chatty service-level logs. On Windows: `debug-start.bat` does this for you against the packaged build.

Logs are written to the Electron `userData` directory:

- Windows: `%APPDATA%\codebuddy\codebuddy-debug.log`
- macOS: `~/Library/Application Support/codebuddy/codebuddy-debug.log`

> **Note on legacy paths.** The userData directory is named `codebuddy` (not `codecollab`) for backwards compatibility with users who were running pre-rebrand builds. This is intentional. Same applies to the `CODEBUDDY_LOG_*` env vars and the `codebuddy:v3:` HMAC topic prefix.

### Open DevTools

Once the app is running, `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Opt+I` (macOS) opens Chromium DevTools for the renderer.

To debug the main process, launch with:

```bash
NODE_OPTIONS=--inspect=9229 npm run dev:electron
```

Then attach Chrome to `chrome://inspect` or VS Code's Node debugger.

### Linting

```bash
npm run lint
```

ESLint config is in [`eslint.config.mjs`](eslint.config.mjs). We use Next.js + TypeScript defaults plus a few project-specific rules.

### Type checking

`npm run build` does full TypeScript checking as part of the Next.js build. There is no separate `tsc --noEmit` script; build = typecheck.

---

## Testing

We don't currently have an automated test suite. **This is a gap and a roadmap item.** Today, "tests" are:

- Manual smoke testing against the dev build.
- A `npm run build` and `npm run build:electron` cycle before each release.
- A two-machine P2P test (one Windows, one Mac) for collaboration features.

If you're contributing and want to add Vitest / Playwright / electron-mocha, **yes, please.** Open an issue first to align on framework choice.

---

## Security Model

The full threat model is in [SECURITY.md](SECURITY.md). High-level:

### Electron hardening

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true` on the renderer
- `webSecurity: true`
- Renderer cannot navigate to non-localhost origins; navigation attempts are blocked at the `will-navigate` and `setWindowOpenHandler` levels.
- `window.open` calls are forced through `shell.openExternal` and only `http(s)://` URLs are honored.
- Preload exposes a narrow API surface, fully typed in [`src/lib/electron.d.ts`](src/lib/electron.d.ts).

### IPC hardening

All IPC handlers in [`electron/ipc/register-handlers.js`](electron/ipc/register-handlers.js) treat renderer input as untrusted:

- File paths are validated to live under the user-chosen project root (no `../` escape).
- Git commands are `execFile` with explicit argv (no shell interpretation).
- Sizes are bounded; pathological payloads are rejected.

### P2P hardening

See [The P2P Layer](#the-p2p-layer). Summary:

- HMAC-SHA256 on every frame keyed off a random project secret.
- Topic derived from `repo URL || secret`, so public-repo URLs ≠ public rooms.
- Incoming payloads size-capped, depth-limited, prototype-pollution-stripped.
- Peer messages cannot trigger filesystem or process operations directly — they only ever update Yjs state, which the renderer reads.

### Log redaction

Common token shapes are scrubbed from `codebuddy-debug.log` before write:

- GitHub PATs (`ghp_…`, `ghs_…`, `gho_…`, `ghu_…`, `ghr_…`)
- OpenAI keys (`sk-…`)
- Anthropic keys (`sk-ant-…`)
- AWS keys (`AKIA…`)
- JWTs (`eyJ…eyJ`)
- `Authorization: Bearer …` headers

### Dependency hygiene

- `npm audit` runs as part of every release prep.
- Currently 4 known moderate transitive vulnerabilities (DOMPurify via monaco-editor and postcss via Next). Fixes require breaking-version bumps and have been deferred — see [`SECURITY.md`](SECURITY.md).

### Reporting vulnerabilities

**Do not open a public issue.** Email the maintainers (see SECURITY.md for the address). We aim to acknowledge within 72 hours.

---

## Privacy

CodeCollab is local-first. Concretely:

- **Your code** lives on your disk and in your GitHub repo. We never see it.
- **Your AI conversations** are between you and your chosen AI vendor's CLI. We never see them. Data sent to Anthropic, OpenAI, or GitHub is governed by their respective privacy policies.
- **P2P traffic** is direct between peers and end-to-end encrypted. We never see it.
- **No telemetry.** The app makes no analytics, crash reporting, or usage-tracking calls. Search the codebase for `fetch(` or `XMLHttpRequest` — every outbound call is to either GitHub's API (using your own auth), an AI vendor (via their CLI, never directly from CodeCollab), `localhost:NNNN` (your own dev server), or the Hyperswarm DHT (P2P discovery).
- **GitHub data** is fetched on demand for the Activity stream using your own GitHub token via the `gh` CLI.

If you're auditing this for a privacy-sensitive context, [`electron/main.js`](electron/main.js) has the full network policy and [`electron/services/`](electron/services/) is where every outbound request originates.

---

## Data on Disk

CodeCollab stores three kinds of data on your machine:

### 1. App settings

A single JSON file in the Electron `userData` directory:

- Windows: `%APPDATA%\codebuddy\settings.json`
- macOS: `~/Library/Application Support/codebuddy/settings.json`

Contains: display name, GitHub account list, active provider, theme, recent projects list. **Not encrypted at rest.** OS-level credential store integration is on the roadmap.

### 2. Per-project state

Inside each project repo, in a `.codebuddy/` directory (gitignored by default):

```
<your-project>/
├── .codebuddy/
│   ├── p2p-secret              # 32-byte random; included in invite codes
│   ├── tasks/                  # task state JSON
│   ├── conversations/          # chat history per session
│   ├── members/                # known peers
│   ├── versions/               # checkpoint snapshots (rollback data)
│   └── uploads/                # file attachments dropped into chat
```

This directory is **not** committed to your repo by default. Each peer maintains their own. The `p2pSecret` is exchanged via invite codes, not via Git.

### 3. Logs

`codebuddy-debug.log` in the userData directory. Rotated when it exceeds ~10 MB.

### Wiping data

- **Soft reset:** Settings → System → "Reset all data" — wipes `settings.json` and clears recent projects, but does not touch your code.
- **Hard reset (Windows):** Run `FRESH-START.bat` from the install folder. Kills the running app and `rmdir /s` the userData directory.
- **Hard reset (macOS):** `rm -rf "~/Library/Application Support/codebuddy"`

---

## Configuration & Environment Variables

CodeCollab honors the following environment variables. None are required; all have sensible defaults.

| Variable | Purpose |
|---|---|
| `DEBUG_VERBOSE` | Set to `1` for very verbose service-level logging |
| `CODEBUDDY_LOG_DIR` | Override the directory where `codebuddy-debug.log` is written |
| `CODEBUDDY_LOG_LEVEL` | One of `error`, `warn`, `info`, `debug` (default: `info`) |
| `CODEBUDDY_INSTALL_DIR` | Override the deploy target for `npm run deploy` (Windows) |
| `ELECTRON_ENABLE_LOGGING` | Standard Electron flag; useful for `console.log` from main |
| `ANTHROPIC_API_KEY` | Picked up by the Claude Code CLI, not by us directly |
| `OPENAI_API_KEY` | Picked up by the Codex CLI, not by us directly |
| `GH_TOKEN` | Picked up by the GitHub CLI, not by us directly |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | electron-builder code-signing (build time only) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` | macOS notarization (build time only) |

The `CODEBUDDY_*` prefix is preserved across the rebrand for backwards compatibility — see the legacy-paths note above.

---

## Troubleshooting

### "Electron build fails on `npm install`"

Native modules (`sodium-native`, `@hyperswarm/secret-stream`, `node-pty`) need to be rebuilt against your platform's Electron ABI. Try:

```bash
rm -rf node_modules
npm install
```

If still failing on Windows, install Microsoft's "Desktop development with C++" workload in Visual Studio Build Tools.

### "App opens but window is blank"

Usually means the renderer can't reach the dev server. Check:

- Is `localhost:3000` actually serving? (`curl http://localhost:3000` from another terminal.)
- Is something else holding port 3000? (`netstat -ano | findstr :3000` on Windows; `lsof -i :3000` on macOS.)
- Is your firewall blocking localhost connections? Less likely but possible on hardened machines.

For the packaged build, the renderer loads files off disk; "blank window" there usually means the `out/` directory wasn't included in the packaged app. Re-run `npm run build:electron`.

### "P2P shows 'Searching for peers...' forever"

A few possibilities:

- Both peers have to be on Hyperswarm. Make sure your firewall isn't dropping outbound UDP — Hyperswarm uses UDP for hole-punching.
- Corporate / school networks frequently block DHT traffic. Try a different network.
- Both peers must have generated the *same* P2P secret. If one of you regenerated the invite code, the other has stale data — re-share the new code.
- Check `codebuddy-debug.log` for `[p2p-service]` lines. If you see `swarm.join` but no `connection`, it's a network issue, not an app issue.

### "AI agent run hangs / no output"

- Verify the underlying CLI works on its own: `claude --help`, `gh copilot --help`, `codex --help`.
- Check that the CLI is on your `PATH` from the Electron process's perspective. Mac apps launched from Finder don't inherit shell `PATH` — this is a known macOS quirk. Workaround: launch from Terminal with `open -a CodeCollab`, or set up a Launch Agent that exports `PATH`.
- Look at `codebuddy-debug.log` for `[process-service]` spawn errors.

### "Auto-commit isn't pushing"

- `gh auth status` — verify the GitHub CLI sees you as authenticated.
- Verify the project's remote is set: `git -C <project> remote -v`.
- Check for branch protection rules on `codecollab-build` in your GitHub repo. We don't push to `main` automatically; if you've protected `codecollab-build`, things will fail silently.

### "Dev server preview shows 'page not found'"

The preview pane embeds a localhost URL. If your dev server is running on a non-default port that we don't auto-detect, override the start command in **Project Settings → Run command.**

### "App won't launch after update"

Run `FRESH-START.bat` (Windows) or wipe `~/Library/Application Support/codebuddy/` (macOS). Settings will reset but your projects won't be touched.

---

## Performance Notes

- **First launch is slow** (~5–10s). Electron is loading, Hyperswarm is bootstrapping, the file watcher is doing an initial scan, and Next is hydrating. Subsequent launches are much faster.
- **Large repos slow down the file watcher.** Anything > ~5,000 files in the project root means initial indexing takes a noticeable beat. We honor `.gitignore` so `node_modules/` is skipped, but if you have other large directories add them to `.codebuddy/ignore` (one glob per line).
- **Many parallel agent runs eat memory.** Each agent run spawns a child process and holds its full conversation buffer in memory. We don't currently throttle; if you start 10 simultaneous runs your laptop will feel it. Be reasonable.
- **The IDE is Monaco**, so the same caveats apply: huge files (> 10 MB) get sluggish, very long lines without wrapping get sluggish.
- **P2P has a per-frame fixed cost.** A lot of small frames (e.g., chat-token updates at high token rates) is more expensive than fewer large frames. We batch where we can. If you see degraded P2P performance with 4+ peers, file an issue.

---

## Platform Support

| Platform | Status | Notes |
|---|---|---|
| **Windows 10 / 11 (x64)** | Primary | Built and tested every release |
| **macOS 13+ (Apple Silicon)** | Primary | Built and tested every release |
| **macOS (Intel x64)** | Best-effort | Should work; not in CI |
| **Linux (x64)** | Unverified | electron-builder config is present; no one has reported running it; YMMV |
| **ARM Windows** | Unsupported | No build target |
| **Mobile** | Out of scope | Desktop tool by design |

---

## Roadmap

This is rough and unordered. Things we want to do; nothing here is committed.

### Near term

- Real-time collaborative editing (CRDT-backed Monaco) — currently we sync via Git push/pull, not at the keystroke level.
- Encrypted-at-rest settings store (use OS keychain / Credential Manager).
- Automated test suite (Vitest unit + Playwright E2E for renderer + electron-mocha for main).
- Rate limiting on P2P message frequency (currently only size-capped).
- Linux build verification + a published AppImage.
- Replace the heuristic preview-launcher with a configurable per-project run profile.

### Medium term

- Voice / video integrated into the workspace (probably WebRTC over the same Hyperswarm topic).
- Plugin system for adding new AI providers without forking.
- Self-hostable signaling fallback for when DHT is blocked by enterprise networks.
- A plugin / extension system for tasks ("connect this project to Stripe") that generates manual-setup checklists.

### Long term

- Mobile companion (read-only at first — view tasks, see activity, get notifications).
- Marketplace of "experts" who can be invited into a room for a paid session — see [`docs/architecture.md`](docs/architecture.md).
- Repo-aware fine-tuning hooks for self-hosted local models.

---

## Project Status

**Beta.** The app works, we run it daily, but it has rough edges. The PM Chat surface is the most polished. The IDE and Preview surfaces are explicitly marked Beta in the UI. The P2P layer is solid for 2–3 peers; we haven't stress-tested 5+.

We have not yet cut a public 1.0 release. When we do it'll be tagged on the GitHub Releases page with installers attached. Until then, build from source.

---

## Contributing

Yes, please. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Quick version:

1. **Open an issue first** for anything non-trivial. Saves you from writing code we'd reject.
2. Fork the repo. Branch off `main`.
3. Make your change. Keep diffs focused.
4. `npm run lint` and `npm run build` must both pass.
5. Open a PR. Reference the issue.

We're especially interested in:

- Test coverage.
- Linux build verification.
- Accessibility audits.
- Documentation improvements.
- Bug reports with reproductions.

Things we are unlikely to merge:

- Massive refactors with no clear benefit.
- New AI provider integrations that require us to ship vendor-specific keys.
- Telemetry / analytics.
- Anything that breaks the local-first / no-server invariant.

### Branch policy

- `main` — stable; what releases are cut from.
- `windows` — Windows-specific work in flight.
- `mac-support` — macOS-specific work in flight.

The `windows` and `mac-support` branches periodically merge into `main`.

---

## Code of Conduct

We follow the standard "be excellent to each other" principle. Concretely: no harassment, no slurs, no doxxing, no demands for free labor. Maintainers reserve the right to remove comments, close PRs, and block users at our discretion. There is no formal CoC document yet; if the project grows enough to warrant one we'll adopt the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## License

[MIT](LICENSE).

You can use, copy, modify, distribute, sublicense, and sell copies of CodeCollab. Attribution required (keep the LICENSE file in derivatives). No warranty.

The third-party code we depend on is licensed by its respective authors — see `package.json` and the corresponding `node_modules/<pkg>/LICENSE` files. Notable dependencies:

- **Electron** — MIT
- **Next.js** — MIT
- **React** — MIT
- **Monaco Editor** — MIT
- **Hyperswarm** — Apache-2.0 / MIT
- **Yjs** — MIT
- **Tailwind CSS** — MIT

---

## Acknowledgements

Standing on the shoulders of:

- **Hypercore Protocol / Holepunch** — for Hyperswarm and the broader peer-to-peer toolchain that makes the no-server architecture possible.
- **Yjs** — for CRDTs that just work.
- **Anthropic, OpenAI, GitHub** — for the AI agent CLIs we drive.
- **Microsoft** — for Monaco Editor and VS Code, which set the bar for desktop developer UX.
- **The Electron team** — for making "ship a desktop app with web tech" tractable.
- **Vercel** — for Next.js.

And the dozens of smaller libraries listed in `package.json`.

---

## FAQ

**Is this just a wrapper around Claude / Copilot / Codex?**
No. The AI agents are a building block — the actual product is the multiplayer collaboration mesh, the CRDT-synced state, the GitHub-aware workflow, and the all-in-one workspace. You can use any of those agents standalone in a terminal; you can't get this experience without CodeCollab.

**Why peer-to-peer instead of a real-time server like Liveblocks?**
Cost (free vs. per-seat), privacy (your code never touches our infra because there is no infra), and ideology (the laptop is a supercomputer; we should use it). The tradeoff is NAT traversal can fail on hostile networks and you can't have async editing while everyone's offline. We accept those tradeoffs.

**What happens to my data if CodeCollab the project shuts down?**
Nothing. Your code is in your GitHub repo. Your settings are JSON files on your disk. The app itself is open source and you can keep building it. There is no service to discontinue.

**Can I use this without GitHub?**
Mostly no. GitHub is the sync substrate. You can technically have a project with no remote (you'll lose backup and collaboration), but the activity stream, the "share via repo URL" invite flow, and the auto-push pipeline all assume GitHub. Self-hosted Git remotes might work but we haven't tested.

**Can I bring my own AI model?**
Today, only via the three CLIs listed. The plugin system in [Roadmap](#roadmap) is intended to fix this.

**Why is the userData directory called `codebuddy` and not `codecollab`?**
The project was originally called CodeBuddy. When we rebranded we kept the legacy directory name so existing users wouldn't lose their settings on update. The user-visible name is CodeCollab everywhere.

**Is the AI conversation private?**
Between you, your collaborators (if any), and the AI vendor whose CLI you chose. CodeCollab itself never sees the content. Anthropic / OpenAI / GitHub each have their own privacy policy for content sent to their API.

**Does it work offline?**
Editor, IDE, Preview: yes. Local AI: yes if your AI CLI supports offline (Claude / Copilot / Codex CLIs each call the vendor API, so no — those need internet). P2P: needs at minimum DHT bootstrap, so no.

**What's the difference between PM Chat and Freestyle?**
PM Chat is for project-level conversations — planning, architecture, "what should I build next." Freestyle is for code-level conversations — "fix this function," "write a regex for X." PM Chat owns the project plan; Freestyle does not.

**Why are PM Chat, IDE, and Preview marked Beta?**
They work but they're rougher than the Workspace and Files surfaces. PM Chat is mostly stable; IDE has known bugs around multi-tab state; Preview's auto-detection is heuristic and can pick the wrong port.

**Can I run multiple projects at once?**
Yes. Switch between them from the Home screen. Each maintains its own P2P connection (only when toggled on), its own agent runs, and its own state.

**How do I uninstall it cleanly?**
Windows: `UNINSTALL-ALL.bat` from the install folder, or Add/Remove Programs and confirm "delete all data."
macOS: drag CodeCollab.app to Trash, then `rm -rf ~/Library/Application\ Support/codebuddy ~/Library/Caches/com.codecollab.app ~/Library/Logs/codebuddy*`.

---

*If you read this whole README, thank you. Open an issue and say hi.*
