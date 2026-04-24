# Testing Guide — v45

## Pre-flight
1. Launch from `FRESH-START.bat` or the desktop shortcut
2. Confirm build shows **v45** behavior (check changes below)

---

## Test 1 — IDE: File Explorer Text Visible in Light Mode
- Switch to **light mode** (Settings → Appearance)
- Open IDE and expand the file explorer sidebar
- **Check**: File and folder names should be fully opaque and clearly readable
- No washed-out or nearly-invisible text on light backgrounds
- **Root cause fixed**: Inline RGBA alpha was 0.85 → changed to 1.0

## Test 2 — IDE: Model Names Match Catalog
- Open IDE and click the model picker in the status bar
- **Check**: Model list should show valid names: `auto`, `claude-sonnet-4.6`, `claude-opus-4.6`, `gpt-5.4`, `claude-haiku-4.5`
- Default model should be `auto` (not `copilot` or `claude-sonnet`)
- No console errors about invalid model names
- **Root cause fixed**: Hardcoded model IDs updated to match `model-catalogs.json`

## Test 3 — IDE: Ctrl+` Terminal Toggle in Monaco
- Open IDE and click inside the code editor (Monaco) so it has focus
- Press **Ctrl+`** (backtick)
- **Check**: Terminal panel should toggle even when Monaco has keyboard focus
- Also test **Ctrl+B** (sidebar toggle) and **Ctrl+S** (save notification)
- **Root cause fixed**: `addCommand` → `addAction` for more reliable keybinding capture

## Test 4 — IDE: Model Picker Dropdown Readable
- In dark mode, click the IDE model picker
- **Check**: Dropdown has dark background (`#1a1a2e`), white text, visible hover states
- Switch to light mode and repeat — should still be readable (dark bg, light text)
- **Root cause fixed**: Explicit dark background instead of theme-relative CSS variables

## Test 5 — IDE: Chat Draft Persists
- Open IDE, type a message in the AI Chat panel (do NOT send)
- Navigate away (e.g. go to Home)
- Navigate back to IDE
- **Check**: Your unsent draft text should still be in the input
- **Technical**: Uses `sessionStorage` with key `codebuddy:ide:draft`

## Test 6 — PM Chat: Prompt Persists During Generation
- Open PM Chat, send a prompt to trigger AI generation
- While the agent is streaming, navigate away (go to Home or IDE)
- Navigate back to PM Chat
- **Check**: Your original prompt should appear above the thinking panel
- The thinking panel should show accumulated live output
- **Root cause fixed**: `promptText` added to `generateProjectPlan` requestMeta; reconnect logic restores it

## Test 7 — PM Chat: Draft Persists Across Navigation
- Open PM Chat, type a long message (do NOT send)
- Navigate away and back
- **Check**: Draft still in composer
- **Technical**: Uses `sessionStorage` with key `codebuddy:chat:draft`

## Test 8 — PM Chat: Task Details Button
- Navigate to a Task Chat (click a task from the task menu)
- **Check**: A "Details" button appears in the header, next to the task switcher
- Click it → right pane opens showing:
  - Task title and subproject name
  - Status with colored dot (green=done, gold=building, violet=review, grey=ready)
  - Notes (if task has notes)
  - Starting prompt (if task has one)
- The right pane header should show a "Task" tab in the mode switcher
- **Not visible** when viewing PM Chat (button hidden, tab hidden)

## Test 9 — Freestyle: No Double Messages
- Open Freestyle, start a new session
- Send a prompt and watch the response stream
- **Check**: Only ONE copy of each message appears — no duplicates
- During streaming, only the streaming indicator shows (not message + indicator)
- **Root cause fixed**: `isGenerating` guard prevents session sync from replacing local state while streaming

## Test 10 — Freestyle: Draft Persists
- Open Freestyle, type text in the composer (do NOT send)
- Navigate away and back
- **Check**: Draft text persists
- **Technical**: Uses `sessionStorage` with key `codebuddy:freestyle:draft`

## Test 11 — Claude Code: Live Streaming Output
- In Settings, select Claude Code as the provider (or pick a Claude model)
- Send a prompt in PM Chat or Task Chat
- **Check**: Output should stream token-by-token in real time
- Watch the thinking panel — text should appear progressively
- Navigate away during streaming, then return → output should be restored
- **Root cause fixed**: `promptText` added to `sendSoloMessage` requestMeta; backend uses `spawn()` for all providers

## Test 12 — Model Picker: Light Mode Readable
- Switch to light mode
- Open model picker on any chat page (PM, Task, Freestyle, IDE)
- **Check**: Dropdown uses dark background with light text — no light-on-light issues
- Hover states should be visible

## Test 13 — Model Picker: Dark Mode Readable
- Switch to dark mode
- Open model picker on any chat page
- **Check**: Dropdown uses dark background with light text
- IDE model picker specifically should not be transparent or invisible

## Test 14 — Dark Mode: Full Regression
- Switch to dark mode
- Visit all pages: Home, Workspace, PM Chat, Task Chat, Freestyle, IDE, Settings
- **Check**: All v45 changes work in dark mode — no broken surfaces, readable text, proper contrast

---

## Summary of v45 Changes
| # | Area | Change |
|---|------|--------|
| 1 | IDE | File explorer text opacity: 0.85 → 1.0 for light mode readability |
| 2 | IDE | Model names updated to match catalogs (`auto`, `claude-sonnet-4.6`, etc.) |
| 3 | IDE | Default model changed from `claude-sonnet` → `auto` |
| 4 | IDE | Ctrl+`/Ctrl+B/Ctrl+S: `addCommand` → `addAction` for reliable keybinding capture |
| 5 | IDE | Model picker dropdown: explicit dark bg (`#1a1a2e`) + white text |
| 6 | IDE | Chat draft persistence via `sessionStorage` |
| 7 | PM Chat | `promptText` added to `generateProjectPlan` requestMeta — fixes prompt loss on nav |
| 8 | PM Chat | Dead code cleanup: removed unused `liveOutputTitle/Body/Footer` variables |
| 9 | PM Chat | Task Details button + right pane panel for task info (status, notes, starting prompt) |
| 10 | Freestyle | `isGenerating` guard on session sync prevents double messages during streaming |
| 11 | Freestyle | Draft persistence via `sessionStorage` |
| 12 | Backend | `promptText` added to `sendSoloMessage` requestMeta — fixes solo chat prompt loss on nav |
| 13 | Model Picker | Light + dark mode styling fixes across all chat pages |
