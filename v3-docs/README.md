# CodeBuddy Windows Production Build V3 Docs

> **North Star documentation for the current Windows production build of CodeBuddy.**
>
> This documentation captures the *current, as-shipped* architecture, backend services, frontend routes,
> components, build/deploy pipeline, P2P protocol, security posture, and styling system of the
> CodeBuddy desktop application (version **0.2.0**, build tag **v105-sync-fixes**).
>
> A reader who works through these files should be able to understand every module, every IPC handler,
> every React route, and every meaningful function in the codebase.

---

## Table of Contents

| # | Doc | Scope |
|---|-----|-------|
| 01 | [Architecture Overview](./01-architecture.md) | System diagram, processes, data flows, dependency graph |
| 02 | [Electron Backend](./02-electron-backend.md) | `main.js`, `preload.js`, IPC registry, all services |
| 03 | [Next.js Frontend Routes](./03-frontend-routes.md) | Every page/layout under `src/app/`, state, IPC calls |
| 04 | [Components, Hooks & Lib](./04-components-hooks-lib.md) | Every component, hook, utility, type definition |
| 05 | [Build, Deploy & Configuration](./05-build-deploy-config.md) | `package.json`, electron-builder, scripts, installers |
| 06 | [Styling & UI System](./06-styling-ui.md) | Design tokens, global CSS, theming, layout primitives |
| 07 | [Security & P2P Collaboration](./07-security-p2p.md) | Threat model, Hyperswarm, Yjs CRDTs, HMAC auth |

---

## Product one-liner

CodeBuddy is a **local-first desktop workspace for collaborative vibe coding**: an Electron-shelled
Next.js app that drives Claude Code / GitHub Copilot CLI / OpenAI Codex CLI from a unified UI,
syncs project state across friends over a pure peer-to-peer Hyperswarm + Yjs CRDT network, and
auto-commits project files to a hidden `codebuddy-build` Git branch so every machine stays in sync
without a central server.

## Technology snapshot

| Layer | Stack |
|-------|-------|
| Shell | Electron 41 (context-isolated, no node integration in renderer) |
| Frontend | Next.js 16 (static export), React 19, TypeScript 5, Tailwind CSS 3 |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| P2P | Hyperswarm 4 + Yjs 13 CRDTs, HMAC-SHA256 auth |
| AI providers | GitHub Copilot CLI, Claude Code CLI, OpenAI Codex CLI |
| Git | Shell `git` / `gh` CLI invoked via `child_process.execFile` |
| Packaging | electron-builder (NSIS on Windows, DMG on macOS, AppImage on Linux) |
| Persistence | `app.getPath('userData')/settings.json` + `<repo>/.codebuddy/` |

## Repository layout

```
CodeBuddy/
├── electron/              # Main process (Node.js)
│   ├── main.js            # Entry, BrowserWindow, service bootstrap
│   ├── preload.js         # contextBridge → window.electronAPI
│   ├── config/            # model-catalogs.json
│   ├── ipc/               # register-handlers.js (≈80 IPC handlers)
│   └── services/          # 11 feature services (see doc 02)
├── src/                   # Renderer (Next.js)
│   ├── app/               # App Router routes
│   ├── components/        # Reusable UI
│   ├── hooks/             # Shared hooks
│   └── lib/               # Types, utils, mock data, stream parser
├── scripts/               # Deploy / icon / shortcut PowerShell + Node helpers
├── build/                 # App icons
├── docs/                  # Product docs (existing)
├── v3-docs/               # ← THIS documentation set
├── dist-electron/         # electron-builder output (gitignored in prod)
├── public/                # Next.js static assets
├── *.bat / *.ps1          # Developer / installer scripts at repo root
└── package.json           # Single source of truth for build
```

## Version & build tag

- `package.json` version: **0.2.0**
- `electron/main.js` `BUILD_TAG`: **v105-sync-fixes**
- Target installer: `dist-electron/CodeBuddy Setup 0.2.0.exe`
- Default install folder: `C:\Users\<user>\Desktop\CodeBuddy Install` (via `scripts/deploy-install.ps1`)

## How to read these docs

1. Start with **[01 — Architecture](./01-architecture.md)** to understand the big picture.
2. Jump to **[02 — Electron Backend](./02-electron-backend.md)** for anything server-side (IPC, git, P2P, AI CLIs).
3. Jump to **[03 — Frontend Routes](./03-frontend-routes.md)** for anything user-facing.
4. Use **04**, **05**, **06**, **07** as reference material.

Every `ipc:channel`, service method, React page, and component is listed with a one-or-two sentence description of what it does, what it takes in, and what it returns. When grouping was unavoidable
(large files like `project-service.js` at ≈4,600 LOC and `app/project/chat/page.tsx` at ≈6,500 LOC),
content is split by region/concern so no function is hidden.
