# Testing Guide — v42

## Pre-flight
1. Launch from `FRESH-START.bat` or the desktop shortcut
2. Confirm build tag shows **v42** (bottom-left of home page or workspace badge)

---

## Test 1 — Text Brightness
- Navigate through every page: Home, Workspace, Chat, Freestyle, IDE, Settings
- **Check**: All text should be significantly brighter than v41 — navbar labels, task titles, file explorer entries, chat messages, IDE explorer text
- Token targets: text-soft 0.88, text-mid 0.72, text-dim 0.52, text-ghost 0.28

## Test 2 — Scrollbars
- Find any scrollable area (chat message list, file explorer, workspace task list)
- **Check**: Scrollbar should be ultra-thin (5px), nearly invisible at rest, appear on hover with subtle glow, darken slightly on drag

## Test 3 — Workspace Width
- Open the workspace (Tasks in Focus page)
- **Check**: Content area should be wider than v41 (max-width increased from 1100px → 1400px), utilising more of the screen

## Test 4 — Inline Task Assignment
- Hover over any task row in the workspace
- **Check**: A person icon and notes icon should appear on hover (right side of task row)
- Click the person icon → an inline assign picker should appear below the task with available people
- Assign someone → the avatar should update on the task row

## Test 5 — Inline Task Notes
- Hover over any task row and click the notes icon (document icon)
- **Check**: An inline text editor should appear below the task
- Type a note, click Save
- The notes icon should now remain visible even without hovering (indicating a note exists)
- Click the notes icon again to view/edit

## Test 6 — Freestyle Navigation Tabs
- Navigate to the Freestyle page (project/code)
- **Check**: The top bar should now have **Tasks | PM | Free** navigation tabs on the left, with "Free" highlighted
- Click "Tasks" → should navigate to workspace
- Click "PM" → should navigate to PM chat

## Test 7 — Freestyle + Button
- On the Freestyle page, look at the composer input area
- **Check**: The attach button should now be a **+** icon instead of a paperclip

## Test 8 — Chat Text Size
- Open PM Chat and have a conversation (or look at existing messages)
- **Check**: Message text should be noticeably smaller than v41 — paragraphs at 13px (was 15px), headings reduced proportionally
- Bullet lists should also be smaller
- Overall should feel more compact and modern

## Test 9 — Chat Live Output Window
- Trigger an AI generation in PM Chat
- **Check**: The streaming output panel should look cleaner — darker background (#0a0a0c), "Live output" header with running indicator dot, status badge (Running/Exit/Idle), taller max height (320px vs 260px), monospace 11.5px text

## Test 10 — Chat File References
- In chat, if AI mentions file paths in backticks like \`src/app/page.tsx\`
- **Check**: File paths should render with a light blue/sky background pill, distinct from regular inline code (which gets a subtle white/grey background)

## Test 11 — White Flash Fix
- In PM Chat, switch between different tasks using the task switcher dropdown
- **Check**: There should be NO bright white flash during transitions. Background should stay dark throughout

## Test 12 — IDE: Activity Bar Cleanup
- Open the IDE page
- **Check**: Activity bar should only show **Explorer** and **Extensions** icons — NO search tab, NO source control tab

## Test 13 — IDE: Status Bar Cleanup
- Look at the IDE status bar (bottom)
- **Check**: "AI ✓" text should be REMOVED from the right side of the status bar

## Test 14 — IDE: Open Editors Removed
- In IDE, open a file in the editor
- **Check**: The file explorer sidebar should NOT show an "Open Editors" section at the top — just the project tree directly

## Test 15 — IDE: Model Picker
- In IDE, look at the AI Chat panel header (right side)
- **Check**: There should be a model picker dropdown next to "AI Chat" — shows "Auto" by default
- Click it → should show options: Auto, Claude Sonnet, GPT-4o, Copilot
- Select a model → the picker should update

## Test 16 — IDE: Right-Click Context Menu
- In IDE file explorer, right-click on a file
- **Check**: A context menu should appear with options: Open, Copy Path, Copy Name, Reveal in Explorer
- Right-click on a folder → should show: Collapse/Expand, Copy Path, Open in System Explorer

## Test 17 — IDE: File Name Colors
- In IDE file explorer, look at file names
- **Check**: File names should have subtle color tinting based on type — .ts/.tsx blue-ish, .js/.jsx yellow-ish, .py green-ish, etc.

## Test 18 — IDE: Chat ⌘L Text Removed
- In IDE, look below the chat input box
- **Check**: The "⌘L open chat · @workspace for project context" text should be REMOVED

---

## Summary of v42 Changes
| # | Area | Change |
|---|------|--------|
| 1 | Global | Text brightness tokens boosted ~30% (text-soft 0.78→0.88, text-mid 0.62→0.72, text-dim 0.44→0.52) |
| 2 | Global | Scrollbar redesigned: 5px ultra-thin, auto-fade, light mode overrides |
| 3 | Workspace | Widened from 1100px → 1400px max-width |
| 4 | Workspace | Inline task assignment button (hover-reveal person icon) |
| 5 | Workspace | Inline task notes editor with save/cancel |
| 6 | Freestyle | Tasks/PM/Free navigation tabs added to top bar |
| 7 | Freestyle | Paperclip → + icon for attach button |
| 8 | Chat | Message text reduced 15px → 13px, headings scaled down |
| 9 | Chat | Live output panel modernized (darker bg, status badges, running dot) |
| 10 | Chat | File path references render with sky-blue pill styling |
| 11 | Chat | White flash fixed with explicit bg-[var(--stage)] on containers |
| 12 | IDE | Search and Source Control tabs removed from activity bar |
| 13 | IDE | "AI ✓" removed from status bar |
| 14 | IDE | "Open Editors" section removed from explorer |
| 15 | IDE | Model picker added to AI Chat header |
| 16 | IDE | Right-click context menu on files and folders |
| 17 | IDE | File names color-tinted by extension |
| 18 | IDE | "⌘L open chat" hint text removed |
