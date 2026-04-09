# CodeBuddy P2P Collaboration — Implementation Plan

> Reference document for building real-time shared workspaces.
> Every piece of this system is free. No paid services, no cloud subscriptions, no recurring costs — ever.

---

## 1. What We're Building

A system where multiple people can work on the same project and:
- See each other's AI chat conversations appear live (token by token)
- Share the same agent configurations (system prompts, model preferences, context files)
- See the same task board and action items
- Know who's online and what they're doing right now
- All of this syncs automatically — push to share, pull to receive, P2P for live updates

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      CodeBuddy App                          │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  Chat / AI   │   │  Task Board  │   │  Agent Config  │  │
│  │  Sessions    │   │  & Actions   │   │  & Prompts     │  │
│  └──────┬───────┘   └──────┬───────┘   └───────┬────────┘  │
│         │                  │                    │           │
│         ▼                  ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Shared State Manager (Layer 0)             │   │
│  │   Reads/writes JSON files in .codebuddy/ directory   │   │
│  └─────────────┬───────────────────────┬───────────────┘   │
│                │                       │                    │
│       ┌────────▼────────┐    ┌─────────▼──────────┐        │
│       │   Git Sync      │    │   P2P Real-Time    │        │
│       │   (Layer 1)     │    │   (Layer 2)        │        │
│       │                 │    │                    │        │
│       │ • git add/      │    │ • Hyperswarm DHT   │        │
│       │   commit/push   │    │ • Direct peer      │        │
│       │ • Permanent     │    │   connections      │        │
│       │   record        │    │ • Live token       │        │
│       │ • Works offline │    │   streaming        │        │
│       └────────┬────────┘    └─────────┬──────────┘        │
│                │                       │                    │
└────────────────┼───────────────────────┼────────────────────┘
                 │                       │
                 ▼                       ▼
          ┌────────────┐         ┌──────────────┐
          │  GitHub /   │         │  Teammate's  │
          │  GitLab /   │         │  CodeBuddy   │
          │  Any remote │         │  App         │
          └────────────┘         └──────────────┘
```

---

## 3. Layer 0 — Shared State Manager (DONE ✅)

**Status:** Implemented in Phase 10.

**What it does:** Manages a `.codebuddy/` directory inside the project repo. All shared data is stored as plain JSON files organized by category.

**Directory structure:**
```
.codebuddy/
├── README.md              ← explains what this folder is
├── conversations/         ← every AI chat saved as {id}.json
│   ├── pm-chat-001.json
│   ├── solo-session-abc.json
│   └── task-thread-xyz.json
├── agents/                ← agent configs & system prompts
│   └── default-agent.json
├── tasks/                 ← task board state
│   └── board-state.json
├── members/               ← team member profiles
│   ├── owner.json
│   └── cameron.json
├── versions/              ← version snapshots
└── docs/                  ← auto-generated docs
```

**Files:**
- `electron/services/shared-state-service.js` — backend service
- IPC handlers: `sharedState:init`, `sharedState:isInitialized`, `sharedState:readFile`, `sharedState:writeFile`, `sharedState:listDir`, `sharedState:saveConversation`, `sharedState:loadConversation`, `sharedState:listConversations`, `sharedState:saveMember`, `sharedState:listMembers`
- Settings page UI: "Shared Workspace" section with enable button

---

## 4. Layer 1 — Git Sync (BUILDING 🔨)

**Purpose:** The permanent record. Everything shared goes through Git so it survives across sessions, machines, and team members.

### 4.1 Push Flow (Share your work)

```
User clicks "Push to GitHub"
        │
        ▼
┌───────────────────────┐
│ 1. Stage all files in │
│    .codebuddy/        │
│    (git add .codebuddy)│
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 2. Commit with auto   │
│    message:            │
│    "chore(codebuddy): │
│     sync shared state" │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 3. git push origin    │
│    {current-branch}   │
└───────────┬───────────┘
            │
            ▼
   Teammates can now pull
```

### 4.2 Pull Flow (Get teammate's work)

```
App opens / User clicks "Sync"
        │
        ▼
┌───────────────────────┐
│ 1. git pull --rebase  │
│    origin {branch}    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 2. Read .codebuddy/   │
│    directory           │
│    Parse all JSON files│
└───────────┬───────────┘
            │
            ▼
   UI updates with latest
   conversations, agents,
   tasks, members
```

### 4.3 Implementation Tasks

| #  | Task | Status | Files |
|----|------|--------|-------|
| 1a | Add `pushToRemote()` to repo service | Doing | `electron/services/repo-service.js` |
| 1b | Add `pullFromRemote()` to repo service | Todo | `electron/services/repo-service.js` |
| 1c | Add `syncSharedState()` that stages + commits + pushes `.codebuddy/` | Todo | `electron/services/shared-state-service.js` |
| 1d | Wire IPC handlers for push/pull | Doing | `electron/ipc/register-handlers.js` |
| 1e | Add preload bridge | Doing | `electron/preload.js` |
| 1f | Add TypeScript types | Doing | `src/lib/electron.d.ts` |
| 1g | Add "Push to GitHub" button to dashboard | Doing | `src/app/project/page.tsx` |
| 1h | Add "Sync" button to dashboard | Todo | `src/app/project/page.tsx` |
| 1i | Auto-save conversations to `.codebuddy/` after each chat | Todo | chat pages |

---

## 5. Layer 2 — P2P Real-Time (PLANNED 📋)

**Purpose:** Live updates between teammates without any server. When two people have the same project open, they see each other's changes in real time.

### 5.1 Technology Stack (all free, all open-source)

| Component | Library | What it does | Cost |
|-----------|---------|-------------|------|
| Peer discovery | [Hyperswarm](https://github.com/holepunchto/hyperswarm) | Finds peers on a decentralized hash table (DHT). No central server. | Free |
| Data sync | [Yjs](https://github.com/yjs/yjs) | CRDT library — merges concurrent edits automatically without conflicts | Free |
| NAT traversal | Built into Hyperswarm | Punches through firewalls using free STUN servers | Free |
| Encryption | Built into Hyperswarm | All P2P connections are encrypted end-to-end | Free |

### 5.2 Connection Flow

```
1. User opens project in CodeBuddy
2. App reads the project's Git remote URL (e.g. github.com/cameron/sneaker-swap)
3. Hash the remote URL → 32-byte topic key
4. Join Hyperswarm with that topic key
5. Hyperswarm's DHT broadcasts: "I'm in this room"
6. Any other CodeBuddy user with the same project finds you
7. Direct encrypted TCP connection established
8. Yjs documents sync automatically
```

### 5.3 What Gets Synced in Real-Time

| Data Type | Sync Strategy | Conflict Resolution |
|-----------|--------------|-------------------|
| Chat messages (new tokens from AI) | Broadcast each token as it arrives | Append-only — no conflicts possible |
| Chat history | Yjs Array — ordered list of messages | CRDT merge — automatic ordering |
| Agent configs | Yjs Map — key-value store | Last-writer-wins per field |
| Task board state | Yjs Map per task | Last-writer-wins per field, CRDT merge for lists |
| Presence (who's online) | Heartbeat every 5s over P2P | Timeout after 15s = offline |
| Cursor/activity indicators | Direct broadcast | Ephemeral — not persisted |

### 5.4 Implementation Tasks

| #  | Task | Dependencies | Files to Create/Modify |
|----|------|-------------|----------------------|
| 2a | Install Hyperswarm + Yjs (`npm install hyperswarm yjs`) | None | `package.json` |
| 2b | Create P2P service | 2a | `electron/services/p2p-service.js` |
| 2c | Topic key derivation from Git remote URL | 2b | `electron/services/p2p-service.js` |
| 2d | Peer discovery and connection management | 2b | `electron/services/p2p-service.js` |
| 2e | Yjs document initialization per project | 2a | `electron/services/p2p-service.js` |
| 2f | Wire Yjs ↔ shared-state-service (bidirectional sync) | 2e, Layer 0 | `electron/services/p2p-service.js` |
| 2g | Chat token broadcasting (send) | 2d | `electron/services/project-service.js` (modify) |
| 2h | Chat token receiving (display) | 2d | `src/app/project/chat/page.tsx` (modify) |
| 2i | Presence system (online/offline/typing indicators) | 2d | `electron/services/p2p-service.js` |
| 2j | IPC handlers for P2P events | 2b | `electron/ipc/register-handlers.js` |
| 2k | Preload bridge for P2P | 2j | `electron/preload.js` |
| 2l | TypeScript types for P2P | 2k | `src/lib/electron.d.ts` |
| 2m | UI: Online member indicators | 2i | `src/app/project/page.tsx`, shared components |
| 2n | UI: Live chat streaming from peers | 2h | `src/app/project/chat/page.tsx` |
| 2o | Graceful disconnect on app close / project switch | 2d | `electron/services/p2p-service.js` |

### 5.5 P2P Service API Design

```javascript
// electron/services/p2p-service.js (planned)

createP2PService({
  sharedStateService,
  sendEvent,            // push events to renderer
})

// Methods:
.joinProject(repoPath, remoteUrl, memberProfile)
  → Derives topic, joins Hyperswarm, starts Yjs sync

.leaveProject()
  → Disconnects from swarm, cleans up

.broadcastChatToken(conversationId, token)
  → Sends a single AI token to all connected peers

.broadcastStateChange(category, id, data)
  → Sends a state change (task update, agent config, etc.)

.getConnectedPeers()
  → Returns list of { id, name, initials, lastSeen }

.onPeerJoined(callback)
.onPeerLeft(callback)
.onChatToken(callback)
.onStateChange(callback)
```

### 5.6 Renderer Events (via IPC)

```
p2p:peerJoined    → { peerId, name, initials }
p2p:peerLeft      → { peerId }
p2p:chatToken     → { conversationId, token, from }
p2p:stateChanged  → { category, id, data }
p2p:presence      → { peers: [{ id, name, status, activity }] }
```

---

## 6. Layer 3 — Conflict Resolution Details

### 6.1 Conversations (Append-Only)

Conversations are naturally conflict-free because:
- Messages are only ever appended to the end
- Each message has a unique ID + timestamp
- Two people can't send a message as the same person at the same time
- Yjs Y.Array handles ordering automatically

If two people send messages simultaneously, both messages appear in order of their timestamps.

### 6.2 Agent Configs (Last-Writer-Wins per Field)

Agent configurations are Yjs Y.Map objects:
```json
{
  "systemPrompt": "...",        ← Alice changes this
  "model": "claude-sonnet-4.5",  ← Bob changes this
  "contextFile": "..."           ← neither touches this
}
```
If Alice changes `systemPrompt` while Bob changes `model`, both changes land cleanly.
If both change `systemPrompt`, the last write wins. Previous versions are recoverable from Git history.

### 6.3 Tasks (Field-Level Merge)

Each task is a Yjs Y.Map:
```json
{
  "id": "task-1",
  "title": "Build login page",
  "status": "building",    ← Alice marks "done"
  "assignee": "Bob"        ← Bob reassigns to "Alice"
}
```
Field-level merge means Alice's status change and Bob's assignee change both apply.

---

## 7. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| P2P connections expose IP addresses | Hyperswarm encrypts connections; consider optional relay mode in future |
| Malicious peers joining a project room | Topic key derived from exact Git remote URL — hard to guess without repo access |
| Corrupted state files | JSON parse errors silently skip bad files; Git history allows rollback |
| Shared prompt injection | Conversations are displayed as plain text / rendered markdown only, never executed |
| Large state directories | Implement size limits on individual files and total `.codebuddy/` size |

---

## 8. Build Order (Recommended)

### Phase 10A — Git Sync (Current)
1. ✅ Shared state service + `.codebuddy/` directory
2. 🔨 Push to GitHub button (stage → commit → push)
3. Pull from GitHub (pull → reload state)
4. Auto-save conversations to `.codebuddy/` after each AI response

### Phase 10B — P2P Foundation
5. Install Hyperswarm + Yjs
6. P2P service with topic derivation + peer discovery
7. Presence system (who's online)
8. UI for online indicators on dashboard

### Phase 10C — Live Chat Sync
9. Broadcast AI chat tokens to peers
10. Receive and display peer chat tokens in real time
11. Conversation merge on disconnect/reconnect

### Phase 10D — Full State Sync
12. Yjs ↔ shared state bidirectional sync
13. Live task board updates across peers
14. Live agent config sync across peers
15. Polish: connection status indicator, reconnect logic, error handling

---

## 9. Testing Strategy

| Scenario | How to Test |
|----------|------------|
| Push/Pull sync | Two local repos, push from one, pull to another, verify `.codebuddy/` contents |
| P2P discovery | Two Electron instances on same machine, verify they find each other |
| P2P across network | Two machines on same LAN, then across internet |
| Chat token streaming | One instance sends AI prompt, other sees tokens appear live |
| Conflict resolution | Both instances modify same file, verify CRDT merge |
| Offline fallback | Disconnect one machine, verify Git sync still works |
| Reconnection | Disconnect and reconnect, verify state catches up |

---

## 10. Costs

| Item | Cost |
|------|------|
| Hyperswarm (DHT) | $0 — decentralized, no server |
| Yjs (CRDT) | $0 — client-side library |
| Git hosting | $0 — GitHub/GitLab free tier |
| STUN servers (NAT traversal) | $0 — Google/Twilio provide free public STUN |
| Storage | $0 — everything is local + in Git |
| **Total recurring cost** | **$0/month** |
