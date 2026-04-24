# Testing Guide — v44

## Pre-flight
1. Launch from `FRESH-START.bat` or the desktop shortcut
2. Confirm build tag shows **v44** (bottom-left of home page or workspace badge)

---

## Test 1 — Light Mode: Colors Darkened Further
- Toggle to light mode (Settings → Appearance)
- Navigate through Home, Workspace, Chat, IDE
- **Check**: Surfaces should be noticeably darker than v43 — void is now `#dddcd8`, stage `#eae9e6`, stage-up `#d4d3cf`
- Text should be near-black (`#020202`), with soft at 90%, mid at 74%, dim at 52%, ghost at 28%

## Test 2 — Scrollbar: No Dark/Light Clashing
- In **dark mode**, scroll any scrollable area (chat messages, file explorer, task list)
- **Check**: Scrollbar thumb should be light-on-dark (white/rgba). No light-mode grey scrollbar leaking through
- Switch to **light mode** and repeat — scrollbar should be dark-on-light (black/rgba)
- **Root cause fixed**: `.dark` CSS overrides now properly scope scrollbar styles

## Test 3 — PM Chat: Prompt Persists Across Navigation
- Open PM Chat, type a long message in the composer (do NOT send)
- Navigate away (e.g. go to Home or IDE)
- Navigate back to PM Chat
- **Check**: The draft text should still be in the composer exactly as you left it
- **Technical**: Uses `sessionStorage` with key `codebuddy:chat:draft`

## Test 4 — PM Chat: Streaming Output ANSI Stripped
- Trigger an AI generation (send a prompt or start a task agent)
- Watch the streaming output panel as text appears
- **Check**: No ANSI escape codes should be visible — no `[32m`, `[0m`, `←[1;36m` garbled text
- Output should be clean plain text

## Test 5 — PM Chat: Edit Prompt Auto-Sizing
- Send a message in PM Chat
- Click the edit button on your sent message
- **Check**: The edit textarea should auto-size to fit the content:
  - Short messages: compact (min ~3.3em tall)
  - Long single-line messages: textarea grows to show full text without horizontal scroll
  - Multi-line messages: grows up to 240px max, then shows scrollbar
- Type more text → textarea should grow dynamically

## Test 6 — PM Chat: No Double Scroll
- Open PM Chat with an existing conversation
- Scroll through messages
- **Check**: There should be only ONE scrollbar/scroll context — the conversation area
- The page itself should NOT scroll independently from the chat content
- **Root cause fixed**: `h-screen` → `h-full` to prevent nested scroll containers

## Test 7 — PM Chat: Task Menu Redesign
- Open PM Chat and click the **"All Conversations"** button (top-right area of header)
- **Check**: The button should be visually prominent:
  - Has a filter icon on the left
  - When a task is active, shows the task name in sun/gold color with ring
  - When on PM, shows "All Conversations" in neutral style
- **Check** the dropdown menu:
  - Tasks are numbered (1.1, 1.2, 2.1, 2.2, etc.) with subproject grouping
  - Each task shows a colored status dot (green=done, gold=building with pulse, violet=review, grey=ready)
  - Task notes/description preview below the title (if available)
  - "has thread" indicator with chat bubble icon for tasks with existing conversations
  - Status pills: Done, Building, Review, Ready, Active
  - Larger click targets than v43

## Test 8 — IDE: Real AI Chat Routing
- Navigate to IDE, open a file, and send a message in the AI Chat panel
- **Check**: Response should come from the **real AI model** (not fake simulated text)
  - Output streams live via `onAgentOutput` events
  - ANSI codes are stripped from streamed chunks
  - The status bar model picker determines which model is used
- **Fallback behavior**: If Electron API is not available (e.g. browser dev), a simulated response appears instead

## Test 9 — IDE: Model Picker Dark Mode Fix
- Switch to dark mode and open IDE
- Click the model picker in the status bar
- **Check**: The dropdown menu should have a visible dark background — not transparent or invisible
- Light mode should also render correctly
- **Root cause fixed**: Uses `style={{ background: "var(--stage)" }}` instead of broken `bg-stage` class

## Test 10 — IDE: Ctrl+` Toggle Inside Monaco Editor
- Open IDE and click inside the code editor (Monaco) so it has focus
- Press **Ctrl+`** (backtick)
- **Check**: Terminal panel should toggle open/closed even when the editor has keyboard focus
- Also test **Ctrl+B** inside the editor — sidebar should toggle
- **Root cause fixed**: Monaco's `addCommand` now captures these keybindings before the editor intercepts them

## Test 11 — IDE: Session Sharing (IDE ↔ Freestyle)
- In IDE, send a few messages to the AI Chat panel
- **Check** the URL: It should now contain `?sessionId=<uuid>` after the first message
- Click the session history button (list icon in chat header)
- **Check**: A dropdown shows:
  - "+ New Session" button at the top
  - All saved solo sessions from the project with title, message count, and model
  - Active session highlighted in violet
  - Footer text: "Sessions sync with Freestyle chat"
- Click "+ New Session" → chat clears, sessionId removed from URL
- Click an existing session → messages load from that session's history

## Test 12 — IDE: Session URL Persistence
- Open IDE with a `?sessionId=<id>` in the URL (copy from a previous session)
- **Check**: The chat panel should load that session's conversation history on mount
- Refresh the page → conversation should reload from the session

## Test 13 — Claude Code: Live Streaming
- In Settings, ensure Claude Code is the active provider (or select a Claude model)
- Send a prompt that triggers Claude CLI execution
- **Check**: Output should stream **token-by-token in real time** — not buffer and appear all at once
- Long responses (>1MB) should complete without truncation
- **Root cause fixed**: `execFile` → `spawn` for non-.cmd binaries; removes 1MB maxBuffer limit

## Test 14 — Dark Mode: Full Regression
- Switch to dark mode
- Quickly verify: Chat, IDE, Workspace, Freestyle, Settings
- **Check**: All v44 changes work in dark mode:
  - Scrollbars are light-on-dark ✓
  - Model picker dropdown visible ✓
  - Task menu renders with correct colors ✓
  - Edit textarea works ✓
  - No white flash or broken surfaces ✓

---

## Summary of v44 Changes
| # | Area | Change |
|---|------|--------|
| 1 | Light Mode | Surfaces darkened further (void #e9e8e5→#dddcd8, stage #f2f1ef→#eae9e6) |
| 2 | Light Mode | Text contrast maximized (text #020202, soft 0.90, mid 0.74, dim 0.52, ghost 0.28) |
| 3 | Scrollbars | Fixed dark/light clashing — `.dark` CSS overrides properly scoped |
| 4 | PM Chat | Prompt draft persists via sessionStorage across navigation |
| 5 | PM Chat | ANSI escape codes stripped from streaming output (`stripAnsi()` helper) |
| 6 | PM Chat | Streaming output panel: max-height 480px, min-height 80px, font 11.5px, tabSize 2 |
| 7 | PM Chat | Edit textarea auto-sizes with scrollHeight measurement (max 240px) |
| 8 | PM Chat | Scroll fix: `h-screen` → `h-full` eliminates double scroll |
| 9 | PM Chat | Task menu redesigned: numbered tasks, status dots, notes preview, thread indicators, larger targets |
| 10 | PM Chat | Task menu trigger button redesigned: filter icon, contextual styling, "All Conversations" label |
| 11 | IDE | AI Chat routes through real `sendSoloMessage` API with live streaming |
| 12 | IDE | Model picker uses inline var(--stage) for reliable dark/light rendering |
| 13 | IDE | Ctrl+` and Ctrl+B work inside Monaco editor via `addCommand` |
| 14 | IDE | Session sharing: `?sessionId=` URL param, session list dropdown, loadSession/startNewSession |
| 15 | IDE | Wrapped in `<Suspense>` for `useSearchParams` SSR compatibility |
| 16 | Backend | Claude CLI: `execFile` → `spawn` for real-time streaming without buffer limits |
| 17 | Types | `soloSessions` typed with full structure in `use-active-desktop-project.ts` |
| 18 | Code | Inline TESTING GUIDE comments added to 4 key source files |
| 19 | Global | BUILD_TAG updated to v44 |
