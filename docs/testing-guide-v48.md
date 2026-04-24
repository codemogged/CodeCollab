# CodeBuddy v48 — Testing Guide

This guide walks you through everything that changed in this build.
Each step tells you **what to do** and **what you should see**.

> Start the app from `FRESH-START.bat` (or the regular shortcut) and open the `test-sync-v1` project.

---

## 1. Task status is now a dropdown

1. Go to the **workspace page** (the main task list).
2. Find any task row. Look at the small status pill on the right (says **Planned**, **Building**, **Review**, or **Done**).
3. Click the status pill.
   - **You should see:** a small menu pops down with all 4 choices and a tiny colored dot next to each. The currently selected one shows a checkmark.
4. Pick a different status.
   - **You should see:** the menu closes, the pill updates to the new status and color (green = Done, violet = Building, orange = Review, gray = Planned).
5. Click somewhere else on the page.
   - **You should see:** the menu closes if you hadn't selected anything (click-outside works).

## 2. Subproject status dropdown + auto-complete

1. On the workspace page, look at each **subproject header row** (the uppercase title bar above each task group, like "Signup flow").
2. You should now see a **status pill on the right of each subproject header**, next to the "1/5" counter.
3. Click the subproject status pill.
   - **You should see:** the same 4-option dropdown (Planned / Building / Review / Done).
4. Now test **auto-complete**: open a subproject that has tasks, mark **all** of them as "Done" one by one using the task pills.
   - **You should see:** as soon as the last task flips to Done, the subproject's status pill also flips to **Done** automatically.
5. Re-open one of the done tasks (set it back to Building).
   - **You should see:** the subproject status changes from Done back to **Building** automatically.

## 3. Details drawer now opens on the workspace page

1. On the workspace page, hover over a task row.
2. Click the small **Details** pill (the one with a document icon, next to the status pill).
   - **You should see:** a dark panel slides in from the right with the task title, a row of 4 status buttons, an "Assign" pill, a "Due date" pill, and the conversation history.
3. Inside the drawer:
   - Click a different status button. **You should see:** the active status button highlight moves, and the task row behind it updates too.
   - Click "Assign" and pick a different person. **You should see:** the pill label updates.
   - Click "Due date" and pick "+3 days". **You should see:** the due date updates.
4. Click outside the drawer (the dim area) or the X in the top right to close.
   - **You should see:** the drawer slides away and you're back on the workspace.

> Clicking the **task title** (not the Details pill) still takes you into the task chat — that is intentional.

## 4. Task chat "Details" pane is now editable

1. On the workspace page, click a task **title** (not the Details pill). You'll land in the task chat.
2. At the top-right of the chat, click the **Details** button.
   - **You should see:** a right-hand pane opens titled "Task details".
3. Inside the Details pane you now have:
   - A **Status** card with 4 selectable buttons.
   - An **Assignee** card with 2 selectable people.
   - An editable **Notes** textarea.
4. Click a status button.
   - **You should see:** the selected status button lights up immediately.
5. Click an assignee.
   - **You should see:** the selected assignee button highlights.
6. Type something in the Notes box and click anywhere outside it.
   - **You should see:** nothing flashy, but it saves automatically on blur. Reload the page (or close the pane and reopen it) — your note is still there.

## 5. Drag-and-drop: reorder tasks and subprojects

1. On the workspace page, **hover** over a task row.
   - **You should see:** a small drag handle (⋮⋮ dot grid) appears on the far left of the task row on hover.
2. Click-and-drag the handle **up or down over another task** inside the same or a different subproject.
   - **While dragging:** the task you're dragging looks faded. The target task shows a violet line above it.
3. Release.
   - **You should see:** the task snaps into its new position, and the order persists.
4. Now try a **subproject**: hover over any subproject header row. A drag handle appears on the left (always visible on the subproject header).
5. Drag the subproject header onto another subproject header and release.
   - **You should see:** the whole subproject (with all its tasks) moves to the new position. A violet ring briefly shows on the drop target.

> Ordering is preserved for the session and saved back to the plan file, so your teammates see the same order too.

## 6. Files page — light-mode colors fixed

1. Make sure you're in **light mode** (moon/sun toggle in the left rail).
2. Go to **Files**.
3. Look at the **Branches** card.
   - **You should see:** the active branch pill is a solid blue ("⚡ Working") or solid emerald ("🏠 Main") with **white text**, clearly readable.
   - Other branches (like `testing123`) appear as **violet** pills with readable text. **No** white-on-white areas anywhere.
4. Look at the **Create branch** card.
   - The tiny `?` help hint on the right side now has a visible circle background when you hover, not a ghost.
5. Look at the **Save to GitHub** card. Same idea — nothing should be white-on-white.

## 7. Create branch — picks a source and actually pushes to GitHub

1. On the Files page, Create branch card now has **two rows**:
   - A **From** row with a dropdown listing every branch (current branch is marked `(current)`).
   - A **Name** row with a text box and the `+ Create` button.
2. Pick a source branch from the **From** dropdown — for example `codebuddy-build`.
3. Type a new branch name like `testing-push-v2` in the Name box.
4. Click **+ Create**.
   - **You should see:**
     - The button shows `...` for a moment.
     - When it finishes, the branches list updates to include a new violet pill labeled `testing-push-v2`, and the "On" label in the top-right of the Branches card updates to it.
5. Open the repo on GitHub in your browser (`Open on GitHub` button at the top of Files).
6. Click the branches dropdown on GitHub.
   - **You should see:** your new branch `testing-push-v2` is listed on GitHub. Before this fix, it only lived locally.

> If pushing fails (no internet, no credentials), the branch is still created locally and you'll see a warning in the debug log but no UI error — run `Save to GitHub` later to publish it.

## 8. Docs page — clickable cards, prominent generate buttons, visible tags

1. Open **Docs** from the left rail.
2. You should now see:
   - Two cards side-by-side: **Technical Documentation** (violet/indigo icon tile) and **Plain-English Overview** (emerald/amber icon tile).
   - **Both icon tiles are dark and saturated** on light mode — no more faint/white blob on the Technical card.
   - Each card shows keyword pills under the description (e.g. **Architecture**, **API reference**). Each pill now has a clearly colored background and ring — not invisible.
3. **Click the Technical Documentation card body.**
   - **You should see:** the cards disappear and a violet spinner appears with progress text ("Scanning codebase...", etc.).
4. Wait for generation to finish.
   - **You should see:** a success banner at the top and a list of expandable section cards below.
5. Click **Switch style** in the success banner to go back to the picker.
6. Below the two cards, you should also see **two big gradient buttons**:
   - "Generate Technical Docs" (violet → indigo).
   - "Generate Plain-English Overview" (emerald → amber).
7. Click either big button.
   - **You should see:** same generation flow kicks off.

## 9. Workspace should feel more responsive on first load

This is a background fix — there isn't a button to click. Here's how to verify:

1. Quit CodeBuddy entirely (close all windows).
2. Relaunch from `FRESH-START.bat`.
3. Open the project and immediately click around: click a task, open the Details pill, click a status dropdown.
   - **You should see:** the first click registers noticeably faster than before. The 3–5 second "dead zone" at startup is reduced because the auto-sync plan import now defers to browser idle time instead of fighting the first paint.
4. Look at the debug console window that pops up.
   - **You should see:** the line `[importSyncedPlan] Checking for synced plan...` appears a moment after the UI becomes interactive, not before.

---

## 10. Quick smoke test checklist

Mark each one as you confirm it:

- [ ] Task status pill opens a dropdown (not a cycle)
- [ ] Subproject has its own status dropdown
- [ ] Marking all tasks "Done" auto-marks the subproject "Done"
- [ ] Re-opening a task auto-flips subproject back to "Building"
- [ ] Clicking "Details" on a task row opens the right-side drawer (stays on workspace page)
- [ ] Drawer lets you change status, assignee, due date inline
- [ ] Task chat Details pane has Status / Assignee / Notes editors
- [ ] Hover on task shows drag handle; dragging reorders tasks
- [ ] Dragging a subproject header reorders subprojects
- [ ] Files page light mode: no white-on-white text
- [ ] Create branch has a "From" dropdown
- [ ] New branch appears on GitHub (not only locally)
- [ ] Docs page: clicking cards starts generation
- [ ] Docs page: big generate buttons appear below the cards
- [ ] Docs page: keyword tags ("Architecture", "Data flows", etc.) have visible backgrounds
- [ ] First-click delay on app launch feels noticeably shorter

If any item fails, note which one and I'll dig in on the next pass.
