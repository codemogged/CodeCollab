# CodeBuddy — Product Overview

## The Easiest Place to Build Software With Friends

CodeBuddy is a self-contained desktop application that turns ideas into working software through AI-powered collaboration. It combines three commercial-grade AI coding agents, real-time peer-to-peer teamwork, and GitHub-backed project management into a single install — no cloud subscriptions, no configuration, no prior coding experience required.

---

## The Problem

Building software in 2025 still requires assembling a fragile toolchain: an IDE, a terminal, a git client, a project manager, a deployment pipeline, and multiple AI subscriptions. Every step assumes you already know how to code. For the millions of people who have ideas but not engineering experience, the distance between *"I want to build this"* and *"it's running on a screen"* remains enormous.

The current generation of AI coding tools — Copilot, Claude Code, Codex — are individually powerful but isolated. Each lives in its own CLI, speaks its own model-ID format, and requires its own authentication flow. There is no single surface that:

1. Lets you **switch between AI providers mid-project** without reconfiguring anything
2. Lets you **collaborate with friends in real-time** on the same AI-powered workspace
3. Lets you **see plain-English progress** on what the AI built, without reading diffs
4. Works **entirely locally** — no cloud account, no SaaS billing, no data leaving your machine

CodeBuddy fills all four gaps.

---

## What Makes CodeBuddy Different

### 1. Three AI Agents, One Interface

CodeBuddy integrates **GitHub Copilot CLI**, **Claude Code**, and **OpenAI Codex CLI** behind a unified chat interface. Users select a model from a single dropdown — the app routes the prompt to the correct CLI with the correct model-ID format, handles authentication, and streams the response back in real-time.

**Why this matters:** No other tool lets you start a conversation with Copilot, switch to Claude Opus mid-task for a harder problem, then switch to Codex for a different perspective — all without leaving the app or reconfiguring anything. The dynamic model catalog (`model-catalogs.json`) can be edited by the user to add new models as providers release them, without rebuilding the app.

### 2. Serverless Real-Time Collaboration

CodeBuddy uses **Hyperswarm** (a distributed hash table protocol) for peer discovery and **Yjs CRDTs** for conflict-free state synchronization. When two users work on the same project:

- They see each other's AI responses **token-by-token** as they stream in
- Task status changes, plan updates, and new chat messages **sync instantly** with no server
- An automatic **file watcher** detects code changes, commits them to a `codebuddy-build` branch, and pushes — peers auto-pull the latest code
- All communication is **end-to-end encrypted** via the Noise protocol (built into Hyperswarm)
- **No server, no account, no monthly fee.** Peers find each other through a decentralized DHT with built-in NAT traversal.

**Why this matters:** Every collaborative coding tool (Replit, Cursor, GitHub Codespaces) requires a cloud backend. CodeBuddy is the first to offer real-time AI collaboration that works entirely peer-to-peer, with zero infrastructure cost.

### 3. Project Manager AI — Not Just Code Generation

Most AI coding tools generate code and stop. CodeBuddy includes a **Project Manager mode** that:

- Takes a plain-English project description and generates a structured **MVP plan** with subprojects, tasks, and dependencies
- Tracks task status across a **kanban board** that syncs with collaborators
- Maintains **conversation history** across sessions — the AI remembers what was already built and what comes next
- Creates **checkpoints** before every AI operation so you can always roll back

**Why this matters:** The gap between "generate some code" and "ship a product" is project management. CodeBuddy is the first tool that treats AI-powered planning and AI-powered coding as parts of the same workflow.

### 4. Completely Self-Contained

CodeBuddy is one download. The onboarding wizard detects and installs every required tool:

- Git, Node.js, Python (via `winget`)
- GitHub CLI with OAuth device-flow authentication
- All three AI provider CLIs

After onboarding, the user has a fully configured development environment — even if they've never opened a terminal before.

---

## Feature Summary

| Category | Features |
|----------|----------|
| **AI Chat** | Three providers (Copilot/Claude/Codex), 29 models, dynamic catalog, provider tabs, model search, streaming responses |
| **Project Management** | AI-generated MVP plans, kanban board, subprojects/tasks, drag reordering, assignees, due dates |
| **Collaboration** | P2P via Hyperswarm, invite codes, real-time token streaming, presence indicators, task sync |
| **Code** | Freestyle (solo) chat sessions, integrated terminal, Monaco editor, file tree browser, code changes panel |
| **Files** | Git-native file browser, staging/unstaging, inline editing, diff viewer, commit + auto-push, branch management |
| **Preview** | Auto-detect and launch dev server, webview rendering, device-responsive (desktop/tablet/mobile) |
| **Sync** | File watcher with 10s debounce, auto-commit to `codebuddy-build` branch, auto-push, peer auto-pull |
| **Safety** | Checkpoint snapshots before AI operations, one-click rollback, atomic settings writes |
| **Onboarding** | 6-step wizard, auto-installs all tools, GitHub/Claude/Codex OAuth, display name setup |
| **Settings** | Theme toggle, multi-GitHub-account management, CLI path overrides, default model selection |

---

## Target Users

### Primary: Friend Groups With One Technical Anchor

A group of 2-4 friends who have an app idea. One person has some coding experience. The rest are non-technical but want to contribute — describing features, reviewing builds, assigning tasks. CodeBuddy lets the non-technical members prompt the AI, see results, and provide feedback without touching code.

### Secondary: Non-Technical Founders

Founders who want to translate software progress into plain English. They use the Project Manager to generate plans, assign AI tasks, and track completion — the AI does the coding, the founder does the product decisions.

### Tertiary: Creators and Community Builders

YouTubers, teachers, and community leaders who want to turn ideas into tools for their audience. CodeBuddy's invite-code system lets them onboard collaborators with zero friction.

---

## Competitive Landscape

| Competitor | Strength | CodeBuddy Differentiator |
|-----------|----------|--------------------------|
| **Replit** | Cloud IDE + AI agent | CodeBuddy is local-first, no subscription, multi-provider |
| **Cursor** | AI-powered VS Code fork | CodeBuddy adds PM layer + P2P collaboration + non-coder UX |
| **Lovable** | AI builds entire apps for you | CodeBuddy is collaborative — friends contribute, not just one person prompting |
| **Bolt** | Fast AI app generation | CodeBuddy adds project management + iterative development |
| **GitHub Copilot** | Industry-standard AI assist | CodeBuddy wraps Copilot as one of three providers + adds PM + P2P |
| **Windsurf** | AI coding agent | CodeBuddy is multi-agent + collaborative + PM-integrated |

### Strategic Position

CodeBuddy occupies the intersection of three spaces that no competitor fully covers:

1. **Multi-agent AI coding** (switch between 3 providers and 29 models)
2. **Friend-first collaboration** (serverless P2P, not workspace-as-a-service)
3. **Project management** (AI-generated plans, kanban, task tracking)

The less-contested wedge: *"Help a small group turn an idea into shipped software together, even if only one person understands code."*

---

## Go-to-Market Strategy

### Phase 1: Developer Tool (Now)

Position as "the AI coding app that talks to all three providers." Attract developers who already use Copilot, Claude, or Codex individually and want them unified. Free, open-source desktop app.

Distribution: GitHub releases, developer communities, direct download.

### Phase 2: Collaboration Layer (Next)

Once the single-user experience is solid, emphasize P2P collaboration. Position as "build software with your friends." Invite-code referral loop drives organic growth.

Distribution: Word-of-mouth via invite codes, creator/YouTuber partnerships.

### Phase 3: Platform (Future)

Add template marketplace, expert contributor marketplace, and educational workflows. Revenue through premium templates, expert hourly rates (platform fee), and optional cloud sync for teams.

---

## Technical Architecture (Summary)

- **Desktop:** Electron 41 (main process: Node.js, renderer: Next.js 16 React 19)
- **AI Layer:** 3 CLI providers routed via dynamic model catalog
- **P2P:** Hyperswarm DHT + Yjs CRDTs, encrypted, serverless
- **Sync:** Git-native — auto-commit to `codebuddy-build`, auto-push, peer auto-pull
- **Storage:** Local JSON settings + git repos on disk
- **Security:** Context isolation, no Node in renderer, preload API boundary, atomic writes
- **Build:** `next build` (static export) + `electron-builder` (NSIS installer)

---

## Key Metrics to Track

| Metric | Why It Matters |
|--------|----------------|
| Projects created per user | Engagement depth |
| AI messages sent per session | Feature usage |
| Provider switch frequency | Multi-agent value |
| P2P sessions initiated | Collaboration adoption |
| Onboarding completion rate | Friction measurement |
| Checkpoint restores | Safety feature usage |
| Invite codes generated/accepted | Viral growth |

---

*CodeBuddy: Build software with your friends, powered by AI, owned by you.*
