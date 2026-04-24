# CodeBuddy v41 — Testing Guide

> This guide walks you through every change in v41 step by step.
> Follow each step in order. If something looks wrong, write down what happened.

---

## How to Start

1. Go to your **CodeBuddy Install** folder on your Desktop.
2. Double-click **FRESH-START.bat** (this clears old data and opens the app fresh).
3. Wait for the app to open. You should see the **Onboarding** screen.
4. Complete onboarding by entering your name and picking a folder.
5. Create or open a project so you have something to test with.

---

## Test 1: Check the Build Version

1. Look at the **bottom-left corner** of the app (inside the left rail).
2. You should see **v41** displayed.
3. **Pass** = You see "v41". **Fail** = It still says "v40" or something else.

---

## Test 2: Dark Mode Readability

This was the biggest fix — text was too dark to read on dark backgrounds.

1. Look at **any page** in the app (Home, Workspace, Chat, etc.).
2. All text should be **clearly readable** against the dark background.
3. Subtle/ghost text (like timestamps and labels) should be visible — faint but not invisible.
4. Borders between sections should be slightly visible — not completely hidden.
5. **Pass** = You can read everything without squinting. **Fail** = Some text is still invisible or too dark.

---

## Test 3: Scrollbars

1. Go to **any page** that has scrollable content (like the Chat page with messages, or the Workspace task list).
2. Scroll up and down.
3. The scrollbar should be **thin** (about 6 pixels wide), have **rounded ends**, and be a subtle light color.
4. It should NOT look like the old chunky Windows scrollbar.
5. **Pass** = Thin, modern scrollbar. **Fail** = Thick, square, old-looking scrollbar.

---

## Test 4: Homepage Project Cards

1. Click the **Home** icon in the left rail (the house icon).
2. Look at the project rows listed on the page.
3. Each project should show a **colored progress bar** on the right side:
   - **Green (mint)** section = tasks that are Done
   - **Yellow (sun)** section = tasks in Review
   - **Purple (violet)** section = tasks currently Building
   - If a project has no plan yet, it should say **"No tasks yet"**
4. Next to the bar, it should say something like **"3/8 done"**.
5. **Pass** = You see the colored segments and a count. **Fail** = You see the old plain progress bar or no bar at all.

---

## Test 5: Workspace Page — Full Width

1. Click on a project from the Home page to open its **Workspace**.
2. The workspace content should be **wide** — filling most of the screen, not squeezed into a narrow column in the center.
3. The header at the top should show:
   - The **project name** on the left
   - **Chat** and **IDE** buttons in the header (not in a separate toolbar)
   - A small **fire ring** (progress circle) on the right
4. Below the header, you should see a toolbar with: version badge, **Merge to Main** button, P2P status, and invite link.
5. The **Push** button should be **gone** (it was removed because auto-sync handles this).
6. **Pass** = Wide layout, Chat/IDE in header, no Push button. **Fail** = Narrow centered layout, Push button still there.

---

## Test 6: Task Click Goes Straight to Chat

1. On the Workspace page, find a task card in the task list.
2. Click on it.
3. You should be taken **directly to the Chat page** for that task — no side drawer should pop up.
4. The Chat page should show the task name in the header.
5. **Pass** = One click goes to chat. **Fail** = A detail drawer opens first.

---

## Test 7: Chat Page — Thin Header

1. On the Chat page, look at the header bar at the very top.
2. It should be **very thin** — just one single line with:
   - A **← back arrow** on the left
   - The **project name** in small text
   - Mode tabs (**Tasks** / **PM** / **Free**) as small rounded pills
   - A task switcher dropdown on the right
3. The header should NOT take up more than about 40 pixels of height.
4. **Pass** = Ultra-thin single-line header. **Fail** = Multi-line tall header.

---

## Test 8: Chat — AI Response Style

1. In the Chat page, send a message to the AI (or look at existing AI responses).
2. If the AI's response contains file operations (like "Read src/page.tsx", "Wrote 5 files", "Ran npm install"), it should show as a **structured activity log** with icons:
   - 📄 for Read
   - ✏️ for Edited/Wrote
   - ➕ for Created
   - ▶️ for Ran commands
   - 📦 for Installed packages
   - 🔍 for Searched
3. Regular text responses should still appear as normal chat bubbles.
4. **Pass** = File operations render as icon+text log. **Fail** = Everything is plain text.

---

## Test 9: FREE Tab Goes to Freestyle Page

1. On the Chat page, look at the mode tabs in the header.
2. Click the **Free** tab.
3. You should be taken to the **Freestyle Code page** (at /project/code) — a different page with its own session tabs and coding composer.
4. You should NOT stay on the Chat page.
5. **Pass** = Navigates to the Freestyle page. **Fail** = Stays on Chat page or shows an error.

---

## Test 10: Freestyle Page — No Scrolling

1. On the Freestyle Code page (/project/code), look at the overall layout.
2. The page should **fit completely within the window** without needing to scroll the whole page.
3. The chat messages area should scroll internally if there are many messages, but the page itself (top bar, composer, etc.) should all be visible without scrolling.
4. **Pass** = Everything fits, no page-level scroll. **Fail** = You have to scroll the whole page to see the composer at the bottom.

---

## Test 11: IDE Page — Clean Labels

1. Click the **IDE** button (in the Workspace header or left rail).
2. Look at the IDE interface:
   - The status bar at the bottom should say **"AI ✓"** — not "Copilot ✓"
   - The chat panel title should say **"AI Chat"** — not "Copilot Chat"
   - The chat input should say **"Ask AI…"** — not "Ask Copilot…"
   - There should be **no floating model name** overlay in the editor area
3. All colors should use the app's design tokens — no bright white boxes or miscolored panels.
4. **Pass** = Clean labels, consistent colors. **Fail** = "Copilot" text or bright white boxes.

---

## Done!

If everything passed, v41 is working correctly. If anything failed, note which test number and what you saw.
