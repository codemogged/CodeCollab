# CodeBuddy — Two-Machine Sync Testing Guide

> **What this is:** A checklist to make sure two computers can work on the same CodeBuddy project at the same time without losing anything. Do every step before you ship.

> **How to use it:** Follow each step in order. After every step there's a **"What you should see"** line — check that it matches. If it doesn't match, write down **FAIL** and a quick note, then keep going.

---

## What you need before you start

- **Two Windows computers.** Call them **Computer A** and **Computer B**. They can be two real computers, or one computer + a virtual machine. They just have to be on the same internet connection.
- CodeBuddy **installed and open** on both computers. (Double-click `FRESH-START.bat` or `CodeBuddy.exe`.)
- A **GitHub account** that both computers can use.
- A **throwaway test project.** Do NOT use a real project — create a brand new empty GitHub repo called `codebuddy-sync-test` just for this.
- The ability to **turn Wi-Fi off and back on** on each computer. You'll use this to pretend the internet went out.
- A **phone timer** or stopwatch — some steps say "wait 30 seconds" or "wait 1 minute."
- A **notepad** (paper or digital) to write PASS or FAIL for each step.

---

## How CodeBuddy keeps two computers in sync

CodeBuddy uses **three ways** to share information between computers. Think of them like three mail carriers with different speeds:

| What it's called | What it delivers | How fast |
|---|---|---|
| **Live connection (P2P)** | Chat messages, task changes, who's online | Instant — under 1 second |
| **Git / GitHub** | Code files, auto-saves of your work | A few seconds to a minute |
| **Saved files (`.codebuddy/` folder)** | Chat history, plans, agent memory | When you hit Sync |

Each test section below will tell you which of these three carriers you're testing.

---

## Section 0 — Get both computers set up

### 0.1 Create the project on Computer A

1. On **Computer A**, open CodeBuddy.
2. Click **New Project**.
3. Pick an empty folder on your computer.
4. Type the project name `codebuddy-sync-test`.
5. When asked, let CodeBuddy create a GitHub repo for you (or paste in a new empty one you already made).
6. Wait until the project fully opens and you can see the workspace page with tasks.

**What you should see:** The workspace page with a task list. The project is connected to GitHub.

---

### 0.2 Get an invite code from Computer A

1. On Computer A, open project **Settings**.
2. Find the button that says something like **Invite a teammate**, **Share project**, or **Get invite code**.
3. Copy the code that appears.

**What you should see:** A long string of random-looking letters and numbers. Copy it so you can get it onto Computer B (text it, email it, or type it in a shared doc).

> **Why this matters:** The invite code is like a secret handshake. It has the GitHub address AND a secret password baked in. Without it, Computer B might not be able to find Computer A at all.

---

### 0.3 Join the project from Computer B

1. On **Computer B**, open CodeBuddy.
2. Click **Join project** or **Add project from invite**.
3. Paste in the invite code you copied.
4. Pick a fresh empty folder on Computer B for the project files.
5. Wait for it to finish downloading.

**What you should see:** The project opens on Computer B and looks the same as Computer A — same tasks, same plan, same chat history. Within about 5 seconds you should see Computer A show up as a green/connected teammate in the top bar.

**If nothing shows up after 45 seconds:** Write FAIL and a note. Keep going — we'll check this again in the "hard cases" section.

---

## Section 1 — Basic sync (the easy stuff first)

> Before starting this section, make sure both computers show each other as connected.

---

### 1.1 Change a task's status — does the other computer update?

1. On Computer A, find any task in the workspace.
2. Click its **Status** button and change it from **Planned** to **Building**.
3. Look at Computer B's workspace — don't touch anything on B.

**What you should see:** Within 1–2 seconds, Computer B's task automatically changes to **Building** without you doing anything.

---

### 1.2 Do it the other way

1. On Computer B, change that same task from **Building** to **Review**.
2. Look at Computer A.

**What you should see:** Computer A shows **Review** within 1–2 seconds.

---

### 1.3 Change who a task is assigned to

1. On Computer A, find a task and click its **Assignee** button. Pick someone.

**What you should see:** Computer B's task shows the same person within 1–2 seconds.

---

### 1.4 Add new tasks on both computers at the same time

1. On Computer A, add a **new subproject** and a **new task** inside it.
2. On Computer B, add a **different task** in a different subproject.

**What you should see:** After a few seconds, BOTH computers show ALL the new stuff. Nothing disappears.

---

### 1.5 Watch the AI answer stream live on both computers

1. On Computer A, open a task and ask the AI agent a question. Watch it type out the answer word by word.
2. On Computer B, open that same task.

**What you should see:** Computer B also sees the answer being typed out word by word in real time. When it finishes, both computers show the exact same final answer.

**If the final answers look different:** Write FAIL. That means some words got lost.

---

## Section 2 — What happens when both computers change the same thing?

These tests check what CodeBuddy does when two people edit the same thing at the exact same time.

---

### 2.1 Edit different parts of the same task at the same time

1. Pick one task — call it **Task X**.
2. Count down 3-2-1 together, then at the same moment:
   - Computer A: change the **Status** to Building.
   - Computer B: change the **Assignee** to a different person.

**What you should see:** After 2–3 seconds, BOTH computers show BOTH changes. The status AND the assignee are both updated. Neither one got erased.

---

### 2.2 Change the exact same thing at the exact same time

1. Pick Task X again.
2. Count down 3-2-1, then at the same moment:
   - Computer A: change Status → **Done**.
   - Computer B: change Status → **Review**.

**What you should see:** After about 3 seconds, BOTH computers show the SAME status. It doesn't matter if it says Done or Review — they just have to match. If Computer A says Done but Computer B still says Review after 10 seconds, write FAIL.

---

### 2.3 What if one computer is offline and falls behind?

This tests a rule CodeBuddy has: **the more finished status always wins.**

1. Turn Computer B's **Wi-Fi off**.
2. On Computer A: change Task X to **Done**.
3. On Computer B (still offline, no internet): change Task X to **Building**.
4. Turn Computer B's **Wi-Fi back on** and wait 15 seconds.
5. On Computer B, click the **Sync workspace** button (or just reload the project).

**What you should see:** Task X ends up as **Done** on BOTH computers. Computer B's "Building" gets thrown away because "Done" is further along. Done beats Building.

---

### 2.4 Both computers save the plan at the same time

1. On Computer A, make any change to the plan and save it.
2. Within 2 seconds, on Computer B, make a different change to the plan and save it.

**What you should see:** Both saves work fine. A few seconds later, both computers show a plan that has ALL the edits from both sides. No error messages, no conflict warnings.

**If you see an error message about a conflict:** Write it down with which file it mentions. This is a known tricky case (E4 in the table at the end).

---

## Section 3 — File changes saved to GitHub

> CodeBuddy waits **10 seconds** after you stop making changes, then it automatically saves your files to GitHub. These tests check that file changes move between computers correctly.

---

### 3.1 Edit a file on A, see it on B

1. On Computer A, open the file called `README.md` in any text editor (like Notepad). Add a new line that says "Hello from A". Save the file.
2. Wait **15 seconds** (CodeBuddy needs time to send it to GitHub).
3. On Computer B, click **Sync workspace**.

**What you should see:** Computer B's `README.md` now has your "Hello from A" line.

---

### 3.2 Both computers edit the same file but different lines

1. Turn Computer B's **Wi-Fi off**.
2. On Computer A: change **line 1** of `README.md`. Save. Wait 15 seconds (so it uploads to GitHub).
3. On Computer B (offline): change **line 20** of `README.md` (a completely different line). Save.
4. Turn Computer B's **Wi-Fi back on**. Wait 15–30 seconds.

**What you should see:** Both changes end up in the file on both computers. Computer A's change to line 1 is there AND Computer B's change to line 20 is there. Neither one is missing.

---

### 3.3 Both computers edit the EXACT same line

1. Turn Computer B's **Wi-Fi off**.
2. On Computer A: change **line 1** of `README.md` to say `Hello from A`. Save. Wait 15 seconds for it to upload.
3. On Computer B (offline): change **line 1** to say `Hello from B`. Save.
4. Turn Computer B's **Wi-Fi back on**. Wait 30 seconds.

**What you should see:** Computer B shows an error message or a toast notification saying there was a conflict or that the save failed. That's GOOD — it means CodeBuddy caught the problem instead of silently throwing one side away.

**If one computer quietly shows a clean file with no error, and one side's edit is just gone:** Write FAIL. That's a silent data loss bug.

---

## Section 4 — Going offline and coming back

---

### 4.1 Close CodeBuddy on one computer

1. On Computer B, close the CodeBuddy window completely.
2. Watch Computer A's teammate/peer list.

**What you should see:** Within about **30 seconds**, Computer B disappears from Computer A's list. It should NOT stay stuck as "online" forever.

---

### 4.2 Reopen and reconnect

1. Reopen CodeBuddy on Computer B. Open the same project.

**What you should see:** Within 5–10 seconds, both computers see each other as connected again. Any changes made while B was closed show up on B automatically.

---

### 4.3 Quick internet cut and restore

1. While both computers are connected, turn Computer A's **Wi-Fi off for 10 seconds**, then turn it back on.

**What you should see:** Computer B might briefly show A as disconnected. But within about **60 seconds** of A's internet coming back, they're connected again. Nothing is lost.

---

### 4.4 Long internet outage

1. Turn Computer B's **Wi-Fi off**. Leave it off for **2 full minutes**.
2. Turn it back on.

**What you should see:** Computer B reconnects and catches up on everything it missed. If 3 minutes pass after turning the Wi-Fi back on and they still don't see each other, write FAIL.

---

### 4.5 Check that the "are you still there?" signal works

1. Open CodeBuddy's developer console on Computer B: press **Ctrl + Shift + I**, then click the **Console** tab.
2. Watch the messages that scroll by.

**What you should see:** Every **5 seconds** you should see a heartbeat message from Computer A. If more than **30 seconds** go by without one but Computer A still shows as "online," write it down — that's a presence display bug.

---

## Section 5 — Chat edge cases

---

### 5.1 Internet cuts out in the middle of an AI answer

1. On Computer A, ask the agent a long question — something that will take 10+ seconds to answer.
2. While the answer is being typed out word by word, turn Computer A's **Wi-Fi off**.
3. Wait 20 seconds. Turn Wi-Fi back on.

**What you should see:** Computer B's chat either finishes loading the answer once A reconnects, OR shows the message as "incomplete" or stopped. It must **not** stay stuck in a "still typing..." state forever.

---

### 5.2 Two AI agents running at the same time

1. On Computer A, open Task X and ask the agent something.
2. On Computer B, **at the same time**, open a totally different Task Y and ask the agent something.

**What you should see:** Both chat windows show their own separate answers. Task X's words never appear in Task Y's chat, and vice versa. They stay completely separate.

---

### 5.3 Both people send a chat message at the exact same time

1. In the Project Manager chat, both Computer A and Computer B type a message and press Send within about 1 second of each other.

**What you should see:** Both messages show up on BOTH computers, in the same order on both sides. No message is missing, no message shows up twice.

---

### 5.4 Send a gigantic message

1. On Computer A, paste a really long block of text into the PM chat — like a huge essay or a big log file (around 100,000 characters).

**What you should see:** The message either shows up on Computer B just fine, OR Computer A shows a clear error saying the message is too big. What must NOT happen is the connection breaking — Computer B should still show Computer A as connected after this.

> If you can, try an even bigger message (300,000+ characters). This one should definitely be rejected with an error.

---

## Section 6 — Joining a project (invite code edge cases)

---

### 6.1 Use a broken invite code

1. Generate an invite code on Computer A.
2. On Computer B, paste the invite code but **change one letter or number** in the middle of it.
3. Try to join.

**What you should see:** Computer B shows a clear error like "invalid invite code" or "couldn't join." It does NOT quietly join a weird broken room.

---

### 6.2 Join with only the GitHub URL (no secret code)

1. On Computer B, leave/remove the project.
2. On Computer B, try to join by typing in just the GitHub repo URL, with no invite code.
3. Wait **60 seconds**.

**What you should see:** Either the two computers eventually find each other (after about 45 seconds of trying), OR Computer B shows a warning that it couldn't verify the connection. Either way is okay — it just can't silently do nothing forever.

---

### 6.3 Three computers at once (if you have a third)

1. Get a third computer (Computer C) and join the same project with the invite code.

**What you should see:** All three computers see each other. A change made on Computer A shows up on BOTH B and C. A change on C shows up on both A and B.

---

### 6.4 Join while an AI task is already running

1. On Computer A, start a long agent task — something that will run for 30+ seconds.
2. While it's still running, have Computer B join the project using the invite code.

**What you should see:** Computer B finishes joining and starts seeing the agent's answer being typed out in real time (even though B wasn't there when it started). All old task history also shows up on B.

---

## Section 7 — What happens after a restart?

---

### 7.1 Close and reopen both computers

1. Quit CodeBuddy on **both** computers completely.
2. Reopen CodeBuddy on both. Open the project on both.

**What you should see:** Both computers automatically reconnect — you don't have to use the invite code again. All tasks, plan changes, and chat history from before the restart are still there.

---

### 7.2 Delete the local data folder on one side

1. Quit CodeBuddy on **Computer B**.
2. In Windows Explorer, go to Computer B's project folder and **delete the `.codebuddy` folder** inside it.
3. Reopen CodeBuddy on Computer B.

**What you should see:** Computer B downloads everything fresh from GitHub and syncs up with Computer A. All the data on Computer A is safe. Computer B ends up with the same plan, tasks, and recent chat history as A.

---

### 7.3 Remove the project and re-add it

1. On Computer B, go to the project list and **remove the project** from CodeBuddy. (Don't delete the actual files — just remove it from the app's list.)
2. Re-add the project using the invite code from Computer A.

**What you should see:** Computer B rejoins the project like normal. Nothing is lost on Computer A.

---

## Section 8 — Weird input stress tests

> These don't have to be perfect — they just must not crash the app or erase data.

---

### 8.1 Crazy long username

1. On Computer B, go to your profile/settings and change your name to something weird — emojis, symbols, more than 200 characters long.

**What you should see:** Computer A shows a shortened or cleaned-up version of the name. The app doesn't crash.

---

### 8.2 A project with 200 tasks

1. On Computer A, create a subproject and add 200 tasks to it (copy-paste the same task 200 times if needed).

**What you should see:** All 200 tasks eventually show up on Computer B. It might be a little slow but nothing crashes and no tasks disappear.

---

### 8.3 Click the status button really fast

1. On Computer A, click the same task's status button 20 times as fast as you can.

**What you should see:** Computer B eventually settles on the same final status as Computer A. No spinning/loading icons that get stuck, no error messages.

---

## Section 9 — Tricky edge cases to watch out for

These are things CodeBuddy might not handle perfectly. Run each one, then write down whether it happened and how bad it is.

| # | What to test | What to look for |
|---|---|---|
| **E1** | Use the invite code but with a wrong secret, then wait 60 seconds | Does CodeBuddy eventually find the other computer, or does it just hang forever doing nothing? |
| **E2** | Force-quit CodeBuddy on one computer mid-edit (Alt+F4), then reopen it | Does that computer's data look correct after reopening? Does it have everything from before the crash? |
| **E3** | Both computers change the same task status at the exact same time | Do they end up showing the same status? (This is the same as test 2.2) |
| **E4** | Both computers save the plan within 1 second of each other | Does the plan look the same on both sides? Open the `.codebuddy/plan.json` file and compare what's in it to what the app shows. |
| **E5** | Edit a file on one computer exactly when the other computer is pulling from GitHub | Does any "save in progress" or "conflict" error show up? |
| **E6** | Do test 3.3 (same-line conflict) and check the project folder after | Are there any leftover partial files or a `.git/rebase-merge` folder sitting around? There shouldn't be. |
| **E7** | Ask the agent to do something, immediately switch to Computer B before the agent pushes to GitHub | When B tries to open the agent's result, does it show a "not found" error or just work fine? |
| **E8** | Give both Computer A and Computer B the same teammate name in their profile | Does the presence list show duplicates? Do chat messages still say the correct computer's name? |
| **E9** | Open `.codebuddy/plan.json` in Notepad, edit it by hand, save it, then immediately save the plan inside CodeBuddy | Does CodeBuddy overwrite your manual change? (This is probably expected — just confirm it.) |
| **E10** | Watch Computer B's screen in the first 1–2 seconds right after joining | Does B miss any task changes that Computer A made right as B was connecting? |

For each one, write: **Did it happen? Yes / No** and **How bad is it? Must fix before shipping / Fix later / Just cosmetic**

---

## Section 10 — Final checklist before shipping

Go through this list at the very end. If everything is checked, you're good to ship.

- [ ] Section 1 (basic sync) — all steps PASS
- [ ] Section 2 (both editing at once) — all steps PASS
- [ ] Section 3 (file changes through GitHub) — all steps PASS
- [ ] Section 4 (disconnect and reconnect) — all steps PASS
- [ ] Section 5 (chat edge cases) — all steps PASS or show a clear error message (no silent failures)
- [ ] Section 6 (invite code edge cases) — all steps PASS
- [ ] Section 7 (restart and data recovery) — all steps PASS
- [ ] Section 8 (stress tests) — nothing crashes
- [ ] E1–E10 — each one labeled: must fix / fix later / cosmetic
- [ ] No data was lost on either computer during the whole test run
- [ ] The teammate list always settled down — no one shows as "online" forever after disconnecting
- [ ] Both computers' git history looks clean at the end (no stuck saves)

**Any FAIL in Sections 1–4 means do NOT ship yet.**

---

## What to capture when something breaks

When a step fails, collect these three things before moving on. You'll need them to figure out what went wrong later.

1. **The app's log:** In CodeBuddy, press **Ctrl + Shift + I** to open the developer console. Click the **Console** tab. Copy the last 50 or so lines of text.
2. **The git history:** In the project folder, open a terminal and run these three commands. Save the output.
   ```
   git status
   git log --oneline -20
   git branch -v
   ```
3. **A screenshot** of both computers side by side showing the mismatch.

Put all three things in the same note so whoever looks at the bug has everything they need.
