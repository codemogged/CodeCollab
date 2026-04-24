# Testing Guide — Build v46

Run **FRESH-START.bat**, wait for the app to open, then test each item below.

---

## Test 1 — IDE file names are easy to read

1. Open any project with files.
2. Click **IDE** in the left sidebar.
3. Look at the file names in the left panel (Explorer).
4. **Light mode:** File names should be dark text on a light background — easy to read.
5. **Dark mode:** File names should be light text on a dark background — easy to read.
6. **Pass** = You don't have to squint or struggle to read any file name.

---

## Test 2 — IDE model picker matches the chat page picker

1. In the IDE page, look at the very bottom status bar (the thin bar at the bottom).
2. Find the model name on the right side (says "Auto" or a model name).
3. Click it.
4. A floating picker should appear with:
   - A **search bar** at the top.
   - **Provider tabs** (Claude Code / GitHub Copilot / Codex CLI) if you have more than one tool installed.
   - Models grouped into **Recommended** and **Other models**.
   - Each model shows its **name**, **provider**, **context window**, and **usage**.
5. Click a tab to switch providers. The models should change.
6. Type in the search bar. Models should filter.
7. Click a model to select it. The picker closes and the status bar updates.
8. Click outside the picker. It should close.
9. **Pass** = Picker looks like the one on the chat page — tabs, search, grouped models, readable in both light and dark mode.

---

## Test 3 — Ctrl+` opens/closes the terminal

1. In the IDE page, click inside the code editor (where you edit code).
2. Press **Ctrl + `** (the backtick key, top-left of keyboard, below Esc).
3. A terminal panel should appear at the bottom.
4. Press **Ctrl + `** again.
5. The terminal should close.
6. **Pass** = Terminal opens and closes with Ctrl+` while the editor has focus.

---

## Test 4 — Model picker looks good in dark mode

1. Switch to **dark mode** (Settings → Theme).
2. Open the IDE page.
3. Click the model name in the bottom status bar.
4. The picker should have a dark background with white/light text.
5. Tabs, search bar, and model entries should all be readable.
6. **Pass** = No white-on-white or invisible text. Everything is readable.

---

## Test 5 — IDE chat draft is saved

1. In the IDE page, type something in the chat input box (bottom right) — DON'T send it.
2. Click away to another page (like Home or Settings).
3. Come back to the IDE page.
4. Your typed text should still be there.
5. **Pass** = Your draft text survived navigating away and back.

---

## Test 6 — PM prompt stays during generation

1. Go to a project's chat page (PM chat).
2. Pick a task and send a message.
3. While the AI is generating its response, look at the text input area.
4. The input should be cleared (your sent message moved to the chat).
5. You should NOT see the text you just sent appear again in the input box.
6. **Pass** = Input is clean during generation, no duplicates.

---

## Test 7 — PM chat draft is saved

1. On the PM chat page, type something in the prompt box — DON'T send it.
2. Click to another page (like Home or Settings).
3. Come back to the PM chat page.
4. Your typed text should still be there.
5. **Pass** = Your draft survived the navigation.

---

## Test 8 — Task details button toggles open/close

1. On the PM chat page, pick a task from the dropdown.
2. Click the **task details** button (the small button with a document icon, next to the task dropdown).
3. A panel should open on the right showing task details.
4. Click the same button again.
5. The panel should close.
6. **Pass** = First click opens, second click closes.

---

## Test 9 — Freestyle double messages (still works)

1. Go to the Freestyle page (left sidebar).
2. Type a message and send it.
3. Only ONE user message should appear in the chat.
4. **Pass** = No duplicate user messages.

---

## Test 10 — Freestyle draft (still works)

1. On Freestyle, type something — DON'T send it.
2. Navigate away (Home, Settings, etc.).
3. Come back to Freestyle.
4. Your typed text should still be there.
5. **Pass** = Draft survived.

---

## Test 11 — Claude Code live output

1. Go to the IDE page.
2. Send a prompt to the AI chat (e.g., "list the files in this project").
3. Watch the AI response area.
4. Text should appear progressively (streaming) — not all at once after a long wait.
5. **Pass** = You see text appearing gradually as the AI generates it.

---

## Test 12 — Model picker readable in light mode

1. Switch to **light mode**.
2. Open the IDE model picker (bottom status bar).
3. All text should be dark on a light background.
4. **Pass** = Everything is readable.

---

## Test 13 — Model picker readable in dark mode

1. Switch to **dark mode**.
2. Open the IDE model picker (bottom status bar).
3. All text should be light on a dark background.
4. **Pass** = Everything is readable.

---

## Test 14 — Dark mode overall

1. Switch to dark mode.
2. Browse around: Home, project pages, IDE, Settings.
3. Nothing should be invisible, unreadable, or have a wrong background color.
4. **Pass** = Everything looks normal in dark mode.

---

## What changed in v46

| # | Area | Change |
|---|------|--------|
| 1 | IDE file explorer | Removed custom color tinting from file names — they now use the standard theme text color for maximum readability |
| 2 | IDE model picker | Complete redesign — now uses the same tabbed picker as the chat page (search, provider tabs, grouped models, metadata) via portal |
| 3 | IDE Ctrl+` | Changed from Monaco `addAction` to `onKeyDown` for reliable backtick key capture |
| 4 | IDE model picker dark mode | Fixed — uses proper `dark:` Tailwind classes for background, text, and borders |
| 5 | PM chat draft | Fixed — prompt is no longer cleared on first render, so sessionStorage draft survives navigation |
| 6 | Task details toggle | Fixed — clicking the button when panel is already open now closes it |
| 7 | IDE model catalog | Added IPC loading of feature flags and model catalogs (same as chat page) |
| 8 | Global | BUILD_TAG updated to v46 |
