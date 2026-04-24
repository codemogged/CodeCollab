# 01 — Architecture Overview

CodeBuddy is a two-tier desktop application:

1. **Electron main process** (Node.js) — all OS-level work: filesystem, git, spawning AI CLIs, Hyperswarm P2P, settings persistence, file watching.
2. **Next.js renderer** (React 19) — the entire UI. It talks to the main process **only** through a context-isolated `window.electronAPI` preload bridge.

There is no backend server. Collaboration is peer-to-peer over Hyperswarm, and durable state lives in GitHub (via the auto-managed `codebuddy-build` branch) and in each repo's `.codebuddy/` directory.

---

## 1.1 Process & data-flow diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          USER'S WINDOWS MACHINE                        │
│                                                                        │
│  ┌──────────────────────── Electron App ───────────────────────────┐   │
│  │                                                                 │   │
│  │  ┌─────────────────────┐    IPC    ┌─────────────────────────┐  │   │
│  │  │  Renderer (Next.js) │ ←──────→  │  Main (Node.js)         │  │   │
│  │  │                     │ contextBridge │                     │  │   │
│  │  │  React pages        │           │ register-handlers.js    │  │   │
│  │  │  window.electronAPI │           │        │                │  │   │
│  │  └─────────────────────┘           │        ▼                │  │   │
│  │                                    │  11 Services:           │  │   │
│  │                                    │   · settings            │  │   │
│  │                                    │   · project ←── AI CLIs │  │   │
│  │                                    │   · repo  ←── git CLI   │  │   │
│  │                                    │   · p2p   ←── Hyperswarm│  │   │
│  │                                    │   · file-watcher        │  │   │
│  │                                    │   · shared-state        │  │   │
│  │                                    │   · tooling             │  │   │
│  │                                    │   · process             │  │   │
│  │                                    │   · git-queue           │  │   │
│  │                                    │   · activity            │  │   │
│  │                                    └─────────────────────────┘  │   │
│  └────────────┬────────────────────┬────────────────┬──────────────┘   │
│               │                    │                │                  │
│        child_process         .codebuddy/        userData/              │
│        (git / gh / claude    (shared JSON)      settings.json          │
│         / copilot / codex)                                             │
└───────────────┼────────────────────┼────────────────┼──────────────────┘
                │                    │                │
                ▼                    ▼                ▼
          github.com/<user>    Hyperswarm DHT    Local disk
          (codebuddy-build       (peer-to-peer
           branch)                no central svc)
```

## 1.2 Service dependency graph

Services are instantiated in `electron/main.js#bootstrapDesktopServices()` in this order:

```
SettingsService       (must be first — every other service reads settings)
        │
        ▼
RepoService           (git wrapper, stateless)
        │
        ├──► FileWatcherService  (needs repo + shared-state)
        ├──► SharedStateService  (reads/writes .codebuddy/)
        │
        ▼
ProjectService        (central orchestrator; uses settings, repo, shared-state, tooling)
        │
        ├──► P2PService          (Hyperswarm + Yjs, shares state mutations)
        ├──► ActivityService     (in-memory ring buffer for UI timeline)
        ├──► ProcessService      (child_process lifecycle manager)
        ├──► GitQueueService     (per-repo promise queue)
        └──► ToolingService      (tool detection + install + auth)
```

All handlers are registered by a single call to `registerIpcHandlers(mainWindow, services)` inside `electron/ipc/register-handlers.js`.

## 1.3 Primary data stores

| Store | Where | Written by | Read by |
|-------|-------|-----------|---------|
| **Settings** | `app.getPath('userData')/settings.json` | `settings-service.js` atomic write (+ `.bak`) | every service that needs config |
| **Projects** | `settings.projects[]` (in settings.json) | `project-service.js` | renderer + all services |
| **Active project** | `settings.activeProjectId` | user action → `project:setActive` | `use-active-desktop-project.ts` |
| **Plan, tasks, conversations** | `<repo>/.codebuddy/*.json` | `shared-state-service.js`, `project-service.js`, P2P handlers | renderer via IPC |
| **Agent context snapshots** | `<repo>/.codebuddy/agents/context/*.json` | `project-service.js` after task run | next task agent (for continuity across peers) |
| **Auto-saves** | `<repo>/codebuddy-build` git branch | `file-watcher-service.js` (10 s debounce) | other machines on `git pull --rebase` |
| **Checkpoints** | `userData/checkpoints/<id>/` | `project-service.js#createCheckpointSnapshot` | `restoreCheckpoint` |
| **Activity ring buffer** | RAM only, 30 items | `activity-service.js` | renderer via `activity:list` |

## 1.4 Three sync lanes

CodeBuddy deliberately ships three mechanisms for moving data between peers, each with a different speed/durability trade-off:

| Lane | Carrier | Latency | Content |
|------|---------|---------|---------|
| **Live P2P** | Hyperswarm + Yjs CRDT | <1 s | presence, chat tokens, plan/task/conversation updates |
| **Git auto-sync** | `codebuddy-build` branch, push/rebase/pull | 10–60 s | actual code files + `.codebuddy/` snapshots |
| **Manual sync** | `Sync workspace` button → `syncWorkspace` IPC | on demand | full re-import of `.codebuddy/` from git |

`file-watcher-service.js` debounces file changes 10 s, then the `git-queue-service.js` promise queue serializes `git add / commit / pull --rebase / push` for that repo.

## 1.5 Security boundaries

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the `BrowserWindow`.
- `preload.js` is the **only** bridge — it exposes a hand-curated list of methods via `contextBridge.exposeInMainWorld('electronAPI', …)`.
- Navigation handlers block arbitrary URL changes inside the renderer.
- P2P messages are authenticated with HMAC-SHA256 using a per-project secret derived from the invite code; constant-time string compare prevents timing attacks; prototype-pollution sanitization is applied to every peer payload (strip `__proto__`, depth cap, length cap, 256 KB message limit, 8 MB buffer cap per peer).
- Secrets (GitHub tokens, API keys, OAuth codes) are redacted from the diagnostic log by `logDiagnostics()` in `main.js`.
- Dangerous external commands (`code`, `explorer`, `start`, `powershell`, `kill`, `pkill`, `taskkill`) are shadowed by no-op wrappers inside a per-agent command jail directory so the AI cannot launch arbitrary apps. Port 3000 is explicitly reserved.

## 1.6 AI provider routing

`project-service.js#resolveProvider(model)` inspects the model ID and the `featureFlags` in settings to dispatch the invocation to:

- **Claude Code** (`claude` CLI) — JSON event stream parsing via `parseClaudeStreamJsonLine`.
- **GitHub Copilot CLI** (`gh copilot`) — tool allow-list + JSON event stream via `parseCopilotJsonLine`.
- **OpenAI Codex CLI** (`codex`) — JSON event stream via `parseCodexJsonLine`.

All three are executed through `runProviderCli` which pipes stdout token-by-token to the renderer over the `project:agentOutput` channel.

## 1.7 Build & distribution

```
npm run dev:electron   →   local dev (Next.js on :3000 + Electron)
npm run build          →   Next.js static export → ./out
npm run build:electron →   next build && electron-builder → ./dist-electron
npm run deploy         →   build:electron + scripts/deploy-install.ps1
                          (copies win-unpacked → Desktop\CodeBuddy Install)
```

Details in **[05 — Build, Deploy & Configuration](./05-build-deploy-config.md)**.
