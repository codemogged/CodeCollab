# CodeCollab

A self-contained desktop workspace for building software with friends — powered by AI agents, real-time P2P collaboration, and GitHub integration.

## What is CodeCollab?

CodeCollab is a native desktop app that lets anyone — technical or not — create software projects, break them into tasks, and have AI agents do the coding. You invite friends to collaborate in real time over peer-to-peer connections, and everything syncs through GitHub automatically.

No VS Code. No terminal knowledge. No browser tabs. Everything happens inside one window.

## Key Features

- **AI-Powered Project Planning** — Describe what you want to build in plain English. CodeCollab generates a structured plan with subprojects, tasks, and implementation-ready starting prompts.
- **Dual AI Agents** — Tasks are executed by Claude Code or GitHub Copilot CLI (your choice per task). Agents write real code in your repo with full tool access.
- **Real-Time P2P Collaboration** — Connect with friends over Hyperswarm. See live agent output, sync task status, and chat — all without a server.
- **Multi-Project Support** — Work on multiple projects simultaneously, each with isolated P2P rooms and independent state.
- **GitHub-Backed Sync** — Every project is a Git repo. Changes auto-commit and push to a `codebuddy-build` branch. Conflicts resolve automatically via soft-reset recovery.
- **Built-In Everything** — Monaco code editor, live web preview, integrated terminal, file browser, and artifact viewer. No external tools needed.
- **Onboarding Flow** — Guided setup installs Git, Node.js, GitHub CLI, Claude Code, and Copilot CLI automatically via winget.
- **Checkpoint & Rollback** — File snapshots taken before each agent run let you undo any AI changes.

## Architecture

```
┌──────────────────────────────────────────────┐
│                  Electron Shell               │
│  ┌────────────┐  ┌─────────────────────────┐ │
│  │  Main Proc  │  │    Renderer (Next.js)   │ │
│  │             │  │                         │ │
│  │  Services:  │  │  Routes:                │ │
│  │  ├ project  │◄─┤  ├ /home       dashboard│ │
│  │  ├ p2p      │  │  ├ /project    workspace│ │
│  │  ├ process  │  │  ├ /project/chat   AI   │ │
│  │  ├ repo     │  │  ├ /project/code editor │ │
│  │  ├ settings │  │  ├ /project/preview web │ │
│  │  ├ tooling  │  │  ├ /people   collaborators│
│  │  ├ activity │  │  ├ /settings  config    │ │
│  │  ├ filewatcher│ │  └ /onboarding  setup  │ │
│  │  └ state    │  │                         │ │
│  └──────┬──────┘  └─────────────────────────┘ │
│         │              IPC Bridge              │
│         │          (preload.js)                │
│  ┌──────┴──────┐                              │
│  │ Hyperswarm  │  P2P mesh (per-project rooms)│
│  │ Yjs CRDT    │  conflict-free state merge   │
│  └─────────────┘                              │
└──────────────────────────────────────────────┘
```

### Backend Services (Electron Main Process)

| Service | Purpose |
|---------|---------|
| `project-service` | Project CRUD, AI agent execution, plan management, state broadcasting |
| `p2p-service` | Hyperswarm-based multi-room P2P with Yjs CRDT state sync |
| `process-service` | Spawns and manages Claude/Copilot CLI child processes |
| `repo-service` | Git operations — clone, commit, push, pull, conflict recovery |
| `settings-service` | Persistent user/project settings storage |
| `tooling-service` | Detects and installs dev tools (Node, Git, GitHub CLI, Claude, Copilot) |
| `file-watcher-service` | Watches project dirs, triggers auto-commit/push when agent idle |
| `activity-service` | GitHub API integration for issues, PRs, branches, deploys |
| `shared-state-service` | Cross-service singleton state |

### Frontend (Next.js + React + TypeScript)

The UI follows the **"Pulse"** design system with a left-side navigation rail (`LeftRail`) and a content wrapper (`MonolithPanel`). Light and dark modes are supported via CSS custom properties and Tailwind's `darkMode: "class"` strategy.

**Layout Components:**
- **LeftRail** — Collapsible left-side nav rail (52px collapsed, 200px expanded). Context-aware: shows project-specific links when on `/project/*` routes.
- **MonolithPanel** — Content area wrapper with 4 modes: `standard` (680px), `wide` (900px), `full` (100%), and `onboarding` (520px centered).

**Routes:**
- **Home** — Project dashboard, create/import projects
- **Project** — Task board, plan viewer, P2P controls, subproject navigation
- **Chat** — Send prompts to AI agents, view streaming responses, P2P message relay
- **Code** — Monaco editor with file tree, peer stream display
- **Preview** — Live iframe preview of web apps running on localhost
- **Files** — File browser with artifact detection
- **People** — Manage collaborators, send P2P invites
- **Settings** — Tool installation status, model selection, GitHub auth
- **Onboarding** — First-run setup wizard

**Design Tokens:**
- Fonts: Inter (body), Space Grotesk (display headings), JetBrains Mono (code)
- Colors: void/stage/edge surfaces, accent palette (sun, coral, aqua, violet, mint, sky, gold)
- Per-project color DNA with breathing orb animation

### P2P Protocol

Each project gets an isolated Hyperswarm room derived from the repo's remote URL. The wire protocol supports 7 message types:

| Type | Purpose |
|------|---------|
| `hello` | Peer identity exchange (name, member info) |
| `yjs-update` | CRDT document incremental update |
| `yjs-sync` | Full CRDT state vector exchange |
| `heartbeat` | Keepalive (30s interval) |
| `chat-token` | Streaming AI agent output token relay |
| `chat-message` | Complete chat message broadcast |
| `state-change` | Task status, plan, thread, and conversation sync |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 41 |
| Frontend framework | Next.js 16 + React 19 |
| Language | TypeScript (frontend), JavaScript (backend services) |
| Styling | Tailwind CSS 3 |
| Code editor | Monaco Editor |
| P2P networking | Hyperswarm 4 |
| State sync | Yjs CRDT |
| AI agents | Claude Code CLI, GitHub Copilot CLI |
| Version control | Git (via `simple-git`-style shell exec) |
| Build/package | electron-builder |

## Getting Started

### Prerequisites

- Windows 10/11 (macOS/Linux support planned)
- Node.js 18+
- Git
- GitHub CLI (`gh`) with authentication

### Development

```bash
# Install dependencies
npm install

# Run in development mode (Next.js + Electron)
npm run dev:electron

# Build and deploy to local install folder
npm run deploy
```

### Production Build

```bash
# Build standalone Windows executable
npx electron-builder --win portable

# Or use the deploy script (builds + copies to install folder)
npm run deploy
```

The deploy target is `C:\Users\<you>\Desktop\CodeCollab Install\`.

### Running the Built App

Use `debug-start.bat` for diagnostics output, or launch `CodeCollab.exe` directly.

## Project Structure

```
CodeCollab/
├── electron/
│   ├── main.js              # Electron entry point
│   ├── preload.js            # IPC bridge (sandboxed)
│   ├── ipc/
│   │   └── register-handlers.js  # All IPC channel registrations
│   └── services/             # Backend service modules
├── src/
│   ├── app/                  # Next.js pages and routes
│   ├── components/           # Shared React components (LeftRail, MonolithPanel, etc.)
│   ├── hooks/                # Custom React hooks
│   └── lib/                  # Types, mock data, utilities
├── docs/                     # Product strategy and architecture docs
├── build/                    # App icons and build resources
├── scripts/                  # Build helper scripts
└── dist-electron/            # Build output (electron-builder)
```

## Current Build

**Version:** 0.2.0

## License

Private — not yet open-sourced.
