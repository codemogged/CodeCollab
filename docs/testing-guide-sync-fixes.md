# Sync Fixes — Easy Test Guide

A super-simple checklist for you and a friend. Only the **new fixes** are tested here.

You will use **two computers**:
- **Computer A** (you, the project owner).
- **Computer B** (your friend).

Each step has a ✅ check. If it works, tick it. If it doesn't, write down what happened.

---

## Before you start

1. On **both** computers, close CodeBuddy if it's open.
2. On **both** computers, double-click `FRESH-START.bat` (it installs the newest build).
3. On **Computer B only**, open a terminal and type:
   ```
   gh auth login
   ```
   Pick **GitHub.com** → **HTTPS** → **Login with web browser** and finish. This lets Computer B push files to GitHub without a pop-up.
4. Put both computers on the same Wi-Fi (or any internet works, Wi-Fi is just easier to think about).

---

## Fix 1 — The big invite box now fits on the screen

**Computer A:**

1. Open a project that has a GitHub link.
2. Click the **Invite** button near the top.
3. The box should pop up in the **middle of the screen** and be **small enough to read without zooming out**.

✅ The copy-code line is easy to see and click.  
✅ The "Add collaborator on GitHub" button fits inside the box.  
✅ Clicking the dark area outside the box closes it.

---

## Fix 2 — Computer A joins the secret room after making the first invite

This one is sneaky. Before, Computer A was stuck in the **old** room until restarted. Now it should jump to the **new secret room** right after you make the invite.

**Computer A:**

1. Open the project.
2. Open the **DevTools console** (press `Ctrl+Shift+I`, click the **Console** tab).
3. Click **Invite** → copy the code.
4. In the console, look for a line like:
   ```
   [generateInvite] Upgrading P2P session ... to v2 (secret-authenticated)
   ```
   ✅ You see that line.

**Computer B:**

5. Click **Join project** → paste the code → join.
6. After 5–15 seconds, on **both** computers, the **peer dot should turn green** and show your friend's name.

✅ Both computers show each other as connected.

> If you did this before and it didn't work, restart **Computer A** once after updating, then run the steps above.

---

## Fix 3 — Tasks change status on both computers at the same time

**Computer A:**

1. Click a task's status pill (the little colored word like *Planned* / *Building* / *Review* / *Done*).
2. Pick a new status.

**Computer B:**

3. Watch the same task. Within 2 seconds it should change to the new status. ✅

---

## Fix 4 — When the last task becomes "Done", the subproject also turns "Done" on the other computer

This was the broken one. Before, only **your** computer saw the subproject turn green. Now both computers see it.

**Computer A:**

1. Pick a subproject that has 2+ tasks.
2. Mark **all of its tasks** as **Done** one by one.
3. On Computer A, the **subproject pill** should turn **Done** by itself.

**Computer B:**

4. The **same subproject** should turn **Done** at the same time. ✅

**Now test the reverse:**

5. On Computer A, take one task from Done back to **Building**.
6. Computer A's subproject should flip back to **Building**. ✅
7. Computer B's subproject should flip back to **Building** too. ✅

---

## Fix 5 — Dragging tasks around shows up on the other computer right away

**Computer A:**

1. Grab a task by its drag handle (the little dots on the left) and drop it in a new spot in the list.

**Computer B:**

2. The task should jump to the new spot on Computer B within 2 seconds. ✅

**Now subprojects:**

3. On Computer A, drag a whole subproject to a new position.
4. On Computer B, the subproject order should match. ✅

---

## Fix 6 — You can delete tasks and subprojects

**Computer A:**

1. Hover your mouse over any task row. A small **trash can** 🗑 appears on the right.
2. Click it → click **OK** in the popup.
3. The task disappears. ✅

**Computer B:**

4. The same task disappears on Computer B within ~10 seconds (this goes through the normal plan save). ✅

**Now subprojects:**

5. On Computer A, click the **trash can** in a subproject's header row (next to the count badge).
6. The popup warns how many tasks it will also delete. Click **OK**.
7. The whole subproject and all its tasks disappear. ✅
8. Same thing on Computer B within ~10 seconds. ✅

---

## Fix 7 — You can pick which subproject a new task belongs to

**Computer A:**

1. Click **+ Task**.
2. The form now has a **Subproject** dropdown at the bottom.
3. Type a task name, pick a **different** subproject in the dropdown, click **Add**.
4. The new task shows up inside the subproject you picked (not the one that was selected before). ✅

---

## Fix 8 — Your friend's name is in the "Assign to" list

**Both computers must be connected (green peer dot).**

**Computer A:**

1. Click the small **+** avatar next to any task.
2. The pop-up list should now include **your friend's name** (from Computer B), not just "You" and "Project Manager". ✅

**Optional:** pick your friend's name. The owner avatar changes. Computer B sees the change too within a few seconds.

---

## Fix 9 — No more "push rejected" errors when the AI writes files

This was the really ugly one. Before, saving a task and the AI writing a file at the same time would crash one of them. Now they politely take turns.

**Computer A:**

1. Open DevTools console (`Ctrl+Shift+I` → Console).
2. Start an **agent** job that writes code files (any task that makes the AI edit files).
3. While the agent is working, **quickly change a few task statuses** (click status pills, drag tasks, change owners — do it fast for ~30 seconds).

**Watch the console. You should see:**

✅ No red lines that say `non-fast-forward`.  
✅ No red lines that say `rejected`.  
✅ You may see `[git-queue] "savePlan-push" waited 1234ms` — **that is good**, it means the queue worked.

**When the agent finishes:**

4. Go to your GitHub repo in a browser.
5. Check the `codebuddy-build` branch. The agent's new files should be there. ✅

**Computer B:**

6. Within ~30 seconds, the same files should arrive on Computer B's disk (open the project folder to check). ✅

---

## Final sanity check

On **Computer A**, press `Ctrl+Shift+I` and scroll the console. You should **not** see:

- ❌ `fatal: Cannot prompt because user interactivity has been disabled` (if you see this on Computer B, its `gh auth login` didn't stick — redo step 3 at the top).
- ❌ `rejected` / `non-fast-forward`.
- ❌ `v1-legacy` after step 2 of Fix 2.

---

## If something doesn't work

Write down:
1. Which step broke.
2. What you expected to happen.
3. What actually happened.
4. Copy the last ~20 lines from the DevTools console.

Send that back and it can be fixed. Nice work testing!
