# CodeBuddy Testing Guide v4.7 — Step-by-Step (5th-Grade Friendly)

> **How to use this guide:** Just follow each step in order. After every step, look at the "What you should see" line to check it worked. If something doesn't match, stop and tell me.

---

## Step 0 — Open the app

1. Double-click **`FRESH-START.bat`** on your Desktop (or go to `C:\Users\cameron\Desktop\CodeBuddy Install` and open `CodeBuddy.exe`).

**What you should see:** The CodeBuddy app opens and shows your project list. Click any project to open it.

---

## Step 1 — Change a task's status from the workspace page

1. On the left sidebar, click **Workspace**.
2. Look at the task list. Next to each task you'll see three little **pills** (rounded buttons): a **Status pill**, a **Details pill**, and an **Assignee pill**.
3. Click the **Status pill** (it says something like "Planned", "Building", "Review", or "Done").

**What you should see:** The pill changes color and text to the next status (Planned → Building → Review → Done → back to Planned). The color swaps right away: grey for Planned, purple for Building, yellow for Review, green for Done.

---

## Step 2 — Open task details using the Details pill

1. On the same task row, click the **Details pill**.

**What you should see:** A panel slides in from the right showing the full task — its description, status, who it's assigned to, and a due date. You can change any of these from inside the panel too.

---

## Step 3 — Assign a teammate with the Assignee pill

1. Close the details panel (X or click outside).
2. Click the **Assignee pill** on a task row. If no one is assigned it says "Assign".

**What you should see:** A small list pops up with teammates. Click a name. The pill instantly shows that person's initials and name. Click it again and pick someone else — it changes right away.

---

## Step 4 — Change status from inside the task chat

1. From the Workspace, click the **Details pill** on any task, then click **"Open in chat"** (or click the big title to enter task chat).
2. At the top of the chat page you'll see a **status pill** next to "Details".
3. Click the status pill.

**What you should see:** Same status cycle as Step 1 (Planned → Building → Review → Done). If you bounce back to the Workspace page, the task shows the new status too — it syncs across the app.

---

## Step 5 — Generate Technical Documentation

1. Click **Docs** in the left sidebar.

**What you should see:** Two big cards side-by-side. The left (purple) says **Technical Documentation**. The right (green) says **Plain-English Overview**.

2. Click the purple **Technical Documentation** card.

**What you should see:** A loading spinner with text like "Scanning codebase…" then "Writing detailed sections…". Wait about 20–60 seconds.

3. When it's done, you'll see **6 collapsible doc cards**: Architecture Overview, Tech Stack, Directory Structure, API/IPC Reference, Data Flows, Development & Build.

**What you should see:** Each card opens when clicked and shows real, detailed engineer-level documentation about the project.

---

## Step 6 — Switch to Plain-English Overview

1. Near the top of the docs page, click **Switch style**.
2. Click the green **Plain-English Overview** card.

**What you should see:** Spinner again, then **5 friendly doc cards**: What Is This?, Why It Matters, How It Works, What You Can Do, Getting Started. The writing is simple — no code, no jargon, so anyone can read it.

3. Click **Regenerate** to get a fresh version.

**What you should see:** The same 5 sections rewritten with new wording.

---

## Step 7 — See the Action Queue on the Activity page

1. Click **Activity** in the left sidebar.

**What you should see:** At the top, a card labeled **Action Queue** with a number badge. When nothing is happening, it says "You're all caught up — no pushes, approvals, or agent runs queued."

2. To fill it up, open the Planner and send a message, or start a Solo chat.
3. Quickly go back to **Activity**.

**What you should see:** The Action Queue now shows a row like "Solo chat running…" or "Waiting for your approval" with a **pulsing violet dot** and a "Queued · 3s ago" time stamp. Multiple actions stack in a numbered list.

---

## Step 8 — Check the model picker in the IDE

1. Click **IDE** in the left sidebar. Wait for the editor to load.
2. Look at the very bottom-left area of the IDE panel — you'll see a small pill showing the current AI model (e.g., "Auto" or "GPT-5").

**What you should see:** The pill is now clearly readable. It has a visible background, a little border ring, and the text is crisp (not faint grey anymore). A tiny colored dot sits on the left.

3. Click it.

**What you should see:** A dropdown opens with a search box and a list of models.

---

## Step 9 — Click a preview button on a task page

1. Go to **Workspace** and open any task via its **Details pill**.
2. Inside the task drawer, find the **Preview** button/link.
3. Click it.

**What you should see:** You're taken to the Preview page. There are 4 buttons at the top: **Run App**, **Stop**, **Refresh**, **Fullscreen**. Click **Run App** — it starts a dev server and the preview iframe loads your site. Click **Stop** — the server stops. **Refresh** reloads the frame. **Fullscreen** expands it to cover the window.

---

## Step 10 — Send a real terminal command

1. Click **IDE** in the sidebar.
2. At the bottom of the IDE, find the **Terminal** tab. Click it.
3. Type `dir` (Windows) or `echo hello codebuddy` and press **Enter**.

**What you should see:** The terminal shows the real output — a directory listing for `dir` or `hello codebuddy` for echo. Type `node --version` — you should see your installed Node version. Commands really run, not fake text.

---

## Step 11 — Redesigned Files page

1. Click **Files** in the left sidebar.

**What you should see:** The top of the Files page now has **three tidy cards**:

  - **Card 1 (wide):** "Branches" — shows all branches as colored pills. ⚡ Working (blue) and 🏠 Main (green) are the main ones; other branches appear in grey. The one you're on is highlighted with a shadow, and the right side shows `On <branch-name>`.
  - **Card 2 (left half):** "Create branch" — has a text input and a violet **+ Create** button.
  - **Card 3 (right half):** "Save to GitHub" — shows a green badge with how many changes are staged (or "No changes yet"), a message box, and a green **Save** button.

---

## Step 12 — Create a new branch and see its pill

1. In the **Create branch** card, type a name like `test-branch-1` in the input box.
2. Click the violet **+ Create** button.

**What you should see:** After a moment, the new branch `test-branch-1` **appears as a pill** in the Branches card at the top. The pill is highlighted because you're now on that branch. The "On …" label changes to "On test-branch-1". Click any other pill to switch back — the highlight moves.

---

## Step 13 — Save to GitHub (commit)

1. Make a small edit to any file in the IDE (or let the agent change something).
2. Come back to **Files**. The **Save to GitHub** card now shows "1 change ready" (or more) in a green badge.
3. Type a short message like `my first commit` in the message input.
4. Click the green **Save** button.

**What you should see:** The button briefly shows a loading state, then the change count disappears (back to "No changes yet"). Your commit is now in GitHub on the current branch.

---

## Step 14 — Final visual check (Steve Jobs lens 🍎)

Walk through each page one more time and look for:

- ✅ Buttons are **easy to see** (not faint grey-on-grey).
- ✅ Pills and cards have **consistent spacing** and rounded corners.
- ✅ Colors **match the meaning** (green = done/save, violet = AI/working, yellow = review, grey = idle).
- ✅ Nothing feels **cramped** or confusing.

If anything still feels off, tell me which screen and what looked wrong.

---

## Troubleshooting

| If this happens | Try this |
|---|---|
| App won't open | Run `UPDATE.ps1` from the project folder. |
| Docs page just shows blank text | The AI didn't return JSON — click **Regenerate**. |
| Status pill doesn't change | Make sure you have an active project open and you clicked the pill (not the task title). |
| New branch doesn't appear | Wait 2 seconds for the list to refresh, or click a different branch pill and back. |
| Terminal says command not found | That command isn't installed — try `dir`, `echo test`, or `git --version` instead. |

---

**That's it!** Every item from the request list is now covered. If any step doesn't look right, just tell me the step number.
