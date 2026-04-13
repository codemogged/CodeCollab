# CodeBuddy — User Guide

Welcome to CodeBuddy! This guide walks you through everything the app can do.

---

## What is CodeBuddy?

CodeBuddy is a desktop app that helps you build software using AI. You describe what you want in plain English, and AI agents write the code for you. You can work solo or invite friends to collaborate in real-time.

CodeBuddy runs entirely on your computer — no cloud accounts or monthly subscriptions required.

---

## Getting Started

### Installation

1. Download `CodeBuddy Setup.exe` and run it
2. Launch CodeBuddy from your desktop shortcut

### Onboarding (First Launch)

When you first open CodeBuddy, a setup wizard walks you through 6 steps:

1. **Welcome** — Introduction screen
2. **Tools** — CodeBuddy checks for and installs required developer tools (Git, Node.js, Python, GitHub CLI). Click **Install** next to any missing tool — the app handles everything automatically.
3. **GitHub** — Connect your GitHub account. A browser window opens where you enter a code displayed in the app.
4. **Providers** — Choose which AI providers to enable:
   - **GitHub Copilot** — Free with a GitHub account
   - **Claude Code** — Anthropic's coding agent
   - **Codex** — OpenAI's coding agent
5. **Profile** — Set your display name (shown to collaborators)
6. **Done** — You're ready to go!

---

## Home Screen

The home screen has two tabs:

### Projects Tab

Your project dashboard. Each project appears as a card showing its name and status.

**Creating a project:**
1. Click the **New project** card
2. Enter a name and description
3. Optionally choose a directory (or use the default)
4. Optionally create a GitHub repository (private by default)
5. Click **Create**

**Importing an existing project:**
Choose "Import existing" and select a folder that already contains code.

**Opening a project:**
Click any project card to enter its workspace.

**Deleting a project:**
Click the delete button on a project card. You can choose to:
- Remove from CodeBuddy only (keeps files)
- Delete local files too
- Delete everything including the GitHub repo

### Coding Friends Tab

Manage your collaborators list and send quick messages.

---

## Project Workspace

When you open a project, a sidebar appears with 9 sections:

### 1. Workspace (Dashboard)

The main project view with:

**Task Board:** A kanban-style board with columns for your subprojects. Each subproject contains tasks that move through stages: *To Do → In Progress → Review → Done*.

**Creating tasks:**
- Click **+ Add Subproject** to create a new column
- Click **+ Add Task** within a subproject to add a task
- Click a task to see details, assign it, set a due date, or change its priority

**Sync Controls (top bar):**
- **Sync** — Pull the latest changes from GitHub
- **Push to GitHub** — Push your `codebuddy-build` branch to GitHub
- **Push to Main** — Merge your work into the `main` branch
- **P2P Toggle** — Turn on real-time collaboration (see [Collaboration](#collaboration))

**Auto-Sync:** CodeBuddy automatically saves your code changes every 10 seconds. It commits to a `codebuddy-build` branch and pushes to GitHub, so your work is always backed up.

### 2. PM Chat

**Project Manager mode.** Have a conversation with the AI about your entire project.

**What it does:**
- Describe your app idea in plain English
- The AI generates an **MVP plan** with subprojects and tasks
- Ask follow-up questions to refine the plan
- The AI remembers your full conversation history

**How to use it:**
1. Type your message in the composer at the bottom
2. Choose a model from the dropdown (each provider has its own models)
3. Press Enter or click Send
4. Watch the AI response stream in real-time

**Model Selection:** Click the model dropdown to see available models grouped by provider (Copilot, Claude, Codex). Switch between providers using the tabs at the top of the dropdown.

**File Attachments:** Drag files into the composer or click the attach button to include file contents in your prompt.

**Quick Prompts:** Click the menu icon for pre-built prompts like "Review my code" or "Fix bugs."

### 3. Freestyle

**Solo coding mode.** A free-form chat with AI for any coding task, not tied to a specific plan task.

**Sessions:** Create multiple named sessions for different topics. Sessions appear as tabs at the top.

**Right Panel:** Three tools available via buttons:
- **Files** — Browse your project's file tree, click to view in Monaco editor
- **Terminal** — Run commands directly (e.g., `npm install`, `python app.py`)
- **Changes** — See what files the AI modified

### 4. Files

A full git-powered file manager with three tabs:

- **Code** — Browse directories, click files to view
- **Updates** — See commit history, click a commit for details
- **IDE** — Edit files with a built-in text editor. Save with Ctrl+S. Stage, unstage, and commit changes.

**Branch Management:** Switch branches or create new ones from the toolbar.

### 5. Downloads (Artifacts)

Shows all files generated by AI agents across your chat sessions. Filter by session, view in grid or list, and preview file contents.

### 6. Preview

Launch your app and see it running inside CodeBuddy:

1. Click **Run App**
2. The AI determines the correct start command (e.g., `npm run dev`)
3. CodeBuddy detects the server URL and shows it in an embedded browser
4. Switch between Desktop, Tablet, and Mobile views

### 7. Activity

A feed of everything that happened in your project: builds, commits, file changes, AI interactions, P2P connections.

### 8. Documentation

Auto-generate documentation for your project (overview, getting started guide, structure, API reference).

### 9. Project Settings

- **General** — Edit project name, description, GitHub repo visibility
- **Collaborators** — See who has access on GitHub
- **System Prompt** — Customize the AI's instructions for this project
- **Shared Workspace** — Initialize the `.codebuddy/` sync folder
- **Danger Zone** — Delete the project

---

## Collaboration

### Inviting Someone

1. Open your project's **Workspace**
2. Click the **P2P** toggle to go online
3. An **invite code** appears — copy and send it to your friend

### Joining a Project

1. On the **Home** screen, click **Join with Invite Code**
2. Paste the code your friend sent
3. Choose where to save the project on your computer
4. Click **Join** — CodeBuddy clones the repo and sets everything up

### Real-Time Features

When two or more people are connected via P2P:

- **Live AI streaming** — See your friend's AI responses appear token-by-token in chat
- **Task sync** — When someone moves a task to "Done," it updates on your screen instantly
- **Plan sync** — Plan changes (new subprojects, new tasks) sync automatically
- **Code sync** — File changes auto-commit and push; peers auto-pull the latest

### How It Works

CodeBuddy uses **Hyperswarm**, a decentralized networking protocol. Your computers find each other through a distributed hash table (like BitTorrent) — no server in the middle. All communication is encrypted.

---

## AI Providers

CodeBuddy supports three AI providers. You can enable/disable them in **Settings > AI Tools**.

### GitHub Copilot

- **What it is:** GitHub's AI coding assistant
- **How to get it:** Free with a GitHub account
- **Models:** 15 models including Claude Opus/Sonnet (via GitHub), GPT-5.4, Gemini 2.5 Pro, o3
- **Best for:** General coding tasks, wide model selection

### Claude Code

- **What it is:** Anthropic's coding agent
- **How to get it:** Install via the onboarding wizard or Settings
- **Models:** 6 models including Sonnet (latest), Opus (latest)
- **Best for:** Complex reasoning, large codebases

### Codex CLI

- **What it is:** OpenAI's coding agent
- **How to get it:** Install via the onboarding wizard or Settings
- **Models:** 8 models including Default (ChatGPT), o4-mini, GPT-4.1
- **Best for:** Quick code generation, ChatGPT-powered workflows

### Switching Between Providers

In any chat (PM Chat or Freestyle), click the model dropdown. Use the tabs at the top (Copilot / Claude / Codex) to switch providers. Each provider shows its own model list with correct model IDs.

---

## Settings

Access from the top navigation bar.

### Theme
Toggle between light and dark mode.

### GitHub Accounts
- Add multiple GitHub accounts
- Switch between them
- Remove accounts you no longer need

### AI Tools
For each provider (Copilot, Claude, Codex):
- Install if not yet installed
- Check authentication status
- Connect/disconnect
- Enable/disable as a provider

### Desktop Integration
- Set custom paths for CLI tools (git, node, etc.)
- Choose default project directory
- Set default model for new projects

---

## Checkpoints & Safety

**Checkpoints:** Before every AI coding operation (in task chat), CodeBuddy snapshots all your project files. If the AI breaks something, click **Restore** to go back to the checkpoint.

**Auto-Sync:** Your code is automatically committed and pushed to a `codebuddy-build` branch every 10 seconds. Your `main` branch is never touched automatically — you push to main manually.

**Fresh Start:** If something goes wrong, run `FRESH-START.bat` from the install folder to reset CodeBuddy to factory settings (your project files on disk are not deleted).

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Enter | Send message |
| Ctrl+S | Save file (in IDE) |
| Escape | Close modal / exit fullscreen |

---

## Troubleshooting

### AI isn't responding
- Check that the provider is enabled in Settings > AI Tools
- Verify authentication status (click "Check" on the tool card)
- Try switching to a different model or provider

### P2P won't connect
- Both users must have the project open
- Both must click the P2P toggle to go online
- Ensure your firewall isn't blocking outbound connections
- Hyperswarm uses UDP for peer discovery

### Onboarding tool installation fails
- Ensure you have internet connectivity
- Some tools require `winget` (Windows Package Manager) — it ships with Windows 11 and recent Windows 10 updates
- Try installing the tool manually and using Settings > Desktop Integration to set the path

### Debug logs
Run `debug-start.bat` from the install folder to launch CodeBuddy with full logging. Logs are saved to `%APPDATA%\codebuddy\codebuddy-debug.log`.

---

## Files in the Install Folder

| File | Purpose |
|------|---------|
| `CodeBuddy.exe` | The main application |
| `FRESH-START.bat` | Factory reset (wipes settings, keeps project files) |
| `UPDATE.ps1` | Update helper (preserves your data, clears caches) |
| `debug-start.bat` | Launch with diagnostic logging |

---

*Questions? Issues? Open an issue on the GitHub repository or ask the AI inside CodeBuddy for help!*
