# Testing Guide — v43

## Pre-flight
1. Launch from `FRESH-START.bat` or the desktop shortcut
2. Confirm build tag shows **v43** (bottom-left of home page or workspace badge)

---

## Test 1 — Light Mode: Darker Backgrounds
- Toggle to light mode (Settings → Appearance)
- Navigate through Home, Workspace, Chat, Freestyle, IDE
- **Check**: Backgrounds should be noticeably darker/warmer than v42 — no more stark white. Stage surface should be an off-white (#f2f1ef), void should be a warm grey (#e9e8e5)

## Test 2 — Light Mode: Stronger Text Contrast
- Stay in light mode, read text on any page
- **Check**: All text should have stronger contrast than v42 — body text darker, muted labels more readable, ghost text actually visible
- Token targets: text-soft 0.85, text-mid 0.68, text-dim 0.45, text-ghost 0.20

## Test 3 — Light Mode: Scrollbar Visibility
- In light mode, scroll any scrollable area (chat, file explorer, task list)
- **Check**: Scrollbar thumb should be clearly visible (not invisible). Should have ~18% opacity at rest, ~30% on hover

## Test 4 — PM Chat: No Duplicate Messages
- Open PM Chat and send a prompt (or look at existing conversation)
- **Check**: Each message should appear **exactly once** — no 2x or 3x duplicates
- If P2P is connected with no peers, the same message should NOT be appended multiple times

## Test 5 — Streaming Output Panel Redesign
- Trigger an AI generation in PM Chat or Task Chat
- **Check**: The streaming panel should appear with:
  - Clean flat border (not heavy rounded card)
  - Animated violet pulse indicator on the left
  - Status text in violet color ("Working...", "Starting agent...")
  - Dark `--void` background for the streaming text area
  - Compact Stop and Reset buttons (not pill-shaped, just text buttons)
  - Interrupt input at the bottom
  - Expand/collapse chevron

## Test 6 — Workspace Width
- Open the workspace (Tasks in Focus page) on a wide monitor
- **Check**: Content area should be wider than v42 — max-width now 1800px (was 1400px), filling more of the screen

## Test 7 — IDE: Activity Bar Removed
- Navigate to the IDE page
- **Check**: The narrow icon strip on the far left (activity bar) should be **completely gone**
- The file explorer sidebar should be the leftmost panel, with a close button (×) in its header

## Test 8 — IDE: Resizable Sidebar
- In IDE, hover over the border between the file explorer and the editor
- **Check**: A thin drag handle should appear (turns violet on hover)
- Drag left/right → sidebar should resize smoothly (min 160px, max 400px)
- **Ctrl+B** should toggle sidebar visibility

## Test 9 — IDE: Resizable Chat Panel
- In IDE, hover over the border between the editor and the AI Chat panel
- **Check**: A thin drag handle should appear
- Drag left/right → chat panel should resize smoothly (min 240px, max 600px)

## Test 10 — IDE: Model Picker in Status Bar
- In IDE, look at the bottom status bar (rightmost area)
- **Check**: There should be a model picker showing the current model name (e.g. "Claude Sonnet") with a violet dot
- Click it → a menu should open **upward** showing: Claude Sonnet, Claude Opus, GPT-4.1, GitHub Copilot, Codex Mini — each with their provider name on the right
- Select a different model → the status bar label should update

## Test 11 — IDE: Chat Toggle in Status Bar
- In IDE status bar, look for a "Chat" button with a speech bubble icon
- **Check**: Clicking it should toggle the AI Chat panel open/closed
- When chat is open, the button text should appear in violet

## Test 12 — IDE: Streaming Chat Responses
- In IDE, type a message in the AI Chat input and press Enter
- **Check**: The AI response should stream in character-by-character with a blinking violet cursor
- Response should reference the currently open file if one is active

## Test 13 — IDE: Ctrl+` Terminal Toggle
- In IDE, press **Ctrl+`** (backtick)
- **Check**: Terminal panel should toggle open/closed at the bottom

## Test 14 — IDE: Sidebar Toggle (Ctrl+B)
- In IDE, press **Ctrl+B**
- **Check**: File explorer sidebar should toggle hidden/visible
- The sidebar close button (×) in the header should also work

## Test 15 — Freestyle: "New Session" Button
- Navigate to the Freestyle page (project/code)
- **Check**: The button for creating a new session should show **"+ New Session"** text — not just a bare + icon

## Test 16 — Dark Mode: Everything Still Works
- Switch back to dark mode
- Quickly check: Chat, IDE, Workspace, Freestyle
- **Check**: All v43 changes should work correctly in dark mode too — no broken colors or invisible elements

---

## Summary of v43 Changes
| # | Area | Change |
|---|------|--------|
| 1 | Light Mode | Backgrounds darkened ~25% (void #f7f7f5→#e9e8e5, stage #fff→#f2f1ef) |
| 2 | Light Mode | Text contrast increased ~30% (soft 0.72→0.85, mid 0.55→0.68, dim 0.32→0.45) |
| 3 | Light Mode | Scrollbar thumb opacity tripled (0.06→0.18 base, 0.14→0.30 hover) |
| 4 | PM Chat | Duplicate message bug fixed — ID-based deduplication in frontend + P2P sync backend |
| 5 | Chat | Streaming output panel redesigned — flat border, violet pulse, dark output bg, compact buttons |
| 6 | Workspace | Max-width widened 1400px → 1800px |
| 7 | IDE | Activity bar completely removed — explorer is always visible |
| 8 | IDE | Sidebar is drag-to-resize (160–400px) with Ctrl+B toggle |
| 9 | IDE | Chat panel is drag-to-resize (240–600px) |
| 10 | IDE | Model picker moved to status bar — opens upward, shows provider names |
| 11 | IDE | Chat toggle button added to status bar |
| 12 | IDE | Chat responses now stream character-by-character with cursor animation |
| 13 | IDE | Ctrl+` terminal toggle confirmed working |
| 14 | IDE | Ctrl+B sidebar toggle added |
| 15 | Freestyle | "+ New Session" button now shows text label instead of bare icon |
| 16 | Global | BUILD_TAG updated to v43 |
