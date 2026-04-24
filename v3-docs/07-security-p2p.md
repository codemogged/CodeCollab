# 07 — Security & P2P Collaboration

CodeBuddy is intentionally serverless: there is no CodeBuddy backend hosting projects or messages.
All sync happens on the user's own machine via Git + Hyperswarm + Yjs. This doc describes the
threat model, the authentication layer, the framing / rate protection, and the three sync lanes.

---

## 7.1 Threat model

| Threat | Surface | Mitigation |
|---|---|---|
| Malicious peer on a Hyperswarm topic | Public DHT | v2 HMAC-SHA256 message authentication using a per-project secret derived from the invite code. Unauthenticated (v1) sessions are opt-in legacy only. |
| Tampered / forged messages | P2P stream | HMAC over framed JSON; constant-time string compare to defeat timing attacks. |
| Prototype pollution via peer payload | JSON parse | `sanitizePeerValue()` removes `__proto__` / `constructor.prototype`, caps nesting depth and string length. |
| DoS by flooding peer | Stream buffer | Per-peer 8 MB buffer cap, per-message 256 KB cap. |
| Tampered invite code | UI paste | `p2p.decodeInvite` validates shape, derives the expected topic, and surfaces errors instead of silently joining. |
| Token / key leakage in logs | Console, diagnostic dump | `logDiagnostics()` redacts GitHub tokens, OAuth codes, and provider API keys from anything it writes. |
| AI-driven shell injection | Agent spawns | `process-service` exposes `runProgram` (argv, no shell) in addition to `run`; task agents execute inside a command jail that shadows `code`, `explorer`, `start`, `powershell`, `kill`, `pkill`, `taskkill` with no-op stubs. Port 3000 is reserved. |
| Preview iframe abuse | `/project/preview` | The iframe loads user-controlled localhost URLs; origin is restricted to `http://localhost:*` and CSP is enforced where the dev server permits. |
| Unauthorized navigation | Renderer | `BrowserWindow.webContents.on('will-navigate')` blocks anything outside the local `file://` / `http://localhost` origin. |
| Renderer access to Node | All IPC | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Every callable method is explicitly exposed via `contextBridge` in `preload.js`. |

---

## 7.2 Invite codes & topic derivation

An invite code is a base64-encoded JSON payload (`p2p-service.encodeInvite`) containing:

- `remoteUrl` — the GitHub repo URL
- `projectName` — for UI display
- `secret` — a 32-byte random value generated at project creation and stored in the repo's shared
  state (so every peer with access to the repo gets it automatically)

On `p2p.acceptInvite`, the renderer posts the payload to `p2p-service.joinProject` which:

1. Derives the Hyperswarm topic key:
   - **v2:** `SHA256(remoteUrl || secret)` — 32 bytes, used as the swarm topic and as the HMAC key for every subsequent message.
   - **v1 (legacy fallback):** `SHA256(remoteUrl)` only, no HMAC.
2. Joins the swarm and waits up to 45 s for a peer response.
3. If v2 handshake fails (unexpected HMAC or timeout), retries in v1 mode for backward compatibility with older peers.

---

## 7.3 Message format & framing

Wire format:

```
[4-byte big-endian length][JSON payload][optional 32-byte HMAC]
```

- Length allows streaming JSON recovery via `findJsonBoundary()`.
- HMAC is appended in v2; verified with `timingSafeEqualStr()` (constant-time).
- Every payload has `{ type, projectId, memberId, timestamp, data }`.

Recognised `type` values: `presence`, `state-change`, `chat-token`, `chat-message`, `heartbeat`, `request-state`, `peer-left`, `agent-context`.

---

## 7.4 CRDT state via Yjs

On join, `loadSharedStateIntoYDoc()` reads `.codebuddy/conversations/*.json`,
`.codebuddy/members/*.json`, and `.codebuddy/tasks/*.json` and populates a Yjs document. Subsequent
mutations broadcast via `broadcastStateChange(projectId, category, id, data)` are replayed on
remote peers and also persisted to disk via `syncStateChangeToDisk()` so the file watcher commits
them to `codebuddy-build`.

Yjs guarantees conflict-free merging: simultaneous edits (e.g. both peers changing a task status)
converge to the same final state regardless of arrival order.

---

## 7.5 Three sync lanes (recap)

| Lane | Speed | Durable? | Contents |
|---|---|---|---|
| Live P2P (Hyperswarm + Yjs) | <1 s | No (RAM) | presence, chat tokens, plan/task/conversation edits |
| Git auto-sync (`codebuddy-build` branch) | 10–60 s | Yes (GitHub) | actual code files + JSON snapshots of `.codebuddy/` |
| Manual workspace sync | On demand | Yes | full re-import of `.codebuddy/` from git |

A CRDT update that lands while a peer is offline will reach them next time they:

1. Reconnect (peer re-sends current state), **or**
2. `git pull` / click Sync workspace (Yjs doc is re-hydrated from on-disk JSON).

---

## 7.6 Reconnection & heartbeat

- A 15 s heartbeat is sent over every active peer connection; miss threshold is 30 s before the peer is considered gone.
- On swarm disconnect, `reconnectTimer` retries join with exponential backoff, emitting `p2p:reconnecting` so the UI can show a reconnect banner.
- `lastPeerSeenAt` is used by the UI presence indicator to fade peers to "away" after missed heartbeats.

---

## 7.7 Git-layer security

- All `git` and `gh` calls use `child_process.execFile` (argv form) — never shell strings. This prevents quoting / injection issues.
- `GIT_TERMINAL_PROMPT=0` is set on every invocation so a missing credential never hangs.
- `cleanupGitState()` removes stuck `index.lock` files and aborts in-progress rebases / merges.
- The `file-watcher-service` calls `ensureGitIdentitySync()` to inject `user.name` / `user.email` from `gh api user` when they're unset, so commits from the AI always have a valid author.
- Agent runs force a switch to `codebuddy-build` via `ensureOnCodebuddyBuild()` so the AI never touches `main` directly; merges back to `main` happen only through `pushToMain()` which broadcasts `fileWatcher:peerSync` to remote peers.

---

## 7.8 Known gaps (as of v105-sync-fixes)

- `settings.json` is not encrypted at rest. An OS-native credential-store backing is planned.
- P2P has per-message and per-peer buffer caps but no per-second rate limiter.
- The preview iframe loads whatever the dev server serves; CSP on the previewed content is not enforced by CodeBuddy.
- `v1` legacy P2P sessions (URL-keyed only, no HMAC) remain enabled for backward compat. A future release will require a flag to allow them.

---

## 7.9 Where to look in the code

| Concern | File |
|---|---|
| Window security flags | `electron/main.js#createWindow` |
| Preload bridge | `electron/preload.js` |
| HMAC / topic derivation / sanitization | `electron/services/p2p-service.js` |
| Command jail / dangerous shell stubs | `electron/services/project-service.js#getSafeCommandJailDir` |
| Argv git execution | `electron/services/repo-service.js#runGit`, `electron/services/file-watcher-service.js#runGit` |
| Log redaction | `electron/main.js#logDiagnostics` |
| Threat doc (legacy, product-facing) | `SECURITY.md` at repo root |
