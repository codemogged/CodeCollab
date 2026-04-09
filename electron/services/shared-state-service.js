const fs = require("fs/promises");
const path = require("path");

/**
 * Manages the .codebuddy/ directory inside project repos.
 * All shared data (conversations, agents, tasks, members) is stored as
 * plain JSON files in the repo so it syncs for free via git push/pull.
 */
function createSharedStateService() {
  const SHARED_DIR = ".codebuddy";

  const SUBDIRS = [
    "conversations",
    "agents",
    "tasks",
    "members",
    "versions",
    "docs",
  ];

  async function ensureSharedDir(repoPath) {
    const baseDir = path.join(repoPath, SHARED_DIR);
    await fs.mkdir(baseDir, { recursive: true });

    for (const sub of SUBDIRS) {
      await fs.mkdir(path.join(baseDir, sub), { recursive: true });
    }

    // Create .gitkeep files so empty dirs are tracked
    for (const sub of SUBDIRS) {
      const keepFile = path.join(baseDir, sub, ".gitkeep");
      try {
        await fs.access(keepFile);
      } catch {
        await fs.writeFile(keepFile, "", "utf-8");
      }
    }

    // Create README for the shared directory
    const readmePath = path.join(baseDir, "README.md");
    try {
      await fs.access(readmePath);
    } catch {
      await fs.writeFile(
        readmePath,
        [
          "# .codebuddy — Shared Workspace State",
          "",
          "This directory is managed by CodeBuddy. It stores shared project state",
          "so collaborators can see each other's conversations, agents, tasks, and more.",
          "",
          "Everything syncs for free through Git — no cloud services needed.",
          "",
          "## Structure",
          "- `conversations/` — Chat history (PM chat, Freestyle sessions, task threads)",
          "- `agents/` — Agent configurations and system prompts",
          "- `tasks/` — Task board state and action items",
          "- `members/` — Team member profiles and preferences",
          "- `versions/` — Version snapshots and checkpoints",
          "- `docs/` — Auto-generated documentation",
          "",
          "**Do not edit these files by hand** — CodeBuddy manages them automatically.",
        ].join("\n"),
        "utf-8"
      );
    }

    return { initialized: true, path: baseDir };
  }

  async function isInitialized(repoPath) {
    try {
      const baseDir = path.join(repoPath, SHARED_DIR);
      const stat = await fs.stat(baseDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async function readSharedFile(repoPath, relativePath) {
    const filePath = path.join(repoPath, SHARED_DIR, relativePath);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { exists: true, content };
    } catch {
      return { exists: false, content: null };
    }
  }

  async function writeSharedFile(repoPath, relativePath, content) {
    const filePath = path.join(repoPath, SHARED_DIR, relativePath);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return { path: filePath };
  }

  async function listSharedDir(repoPath, relativePath) {
    const dirPath = path.join(repoPath, SHARED_DIR, relativePath);
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => e.name !== ".gitkeep")
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          type: e.isDirectory() ? "directory" : "file",
        }));
    } catch {
      return [];
    }
  }

  async function saveConversation(repoPath, conversationId, messages, metadata) {
    const data = {
      id: conversationId,
      updatedAt: new Date().toISOString(),
      ...metadata,
      messages,
    };
    await writeSharedFile(
      repoPath,
      `conversations/${conversationId}.json`,
      JSON.stringify(data, null, 2)
    );
    return data;
  }

  async function loadConversation(repoPath, conversationId) {
    const result = await readSharedFile(repoPath, `conversations/${conversationId}.json`);
    if (!result.exists || !result.content) return null;
    try {
      return JSON.parse(result.content);
    } catch {
      return null;
    }
  }

  async function listConversations(repoPath) {
    const entries = await listSharedDir(repoPath, "conversations");
    const conversations = [];
    for (const entry of entries) {
      if (entry.type === "file" && entry.name.endsWith(".json")) {
        try {
          const content = await fs.readFile(entry.path, "utf-8");
          const data = JSON.parse(content);
          conversations.push({
            id: data.id,
            title: data.title || data.id,
            updatedAt: data.updatedAt,
            messageCount: data.messages?.length ?? 0,
            type: data.type || "chat",
          });
        } catch { /* skip corrupted files */ }
      }
    }
    return conversations.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async function saveMember(repoPath, memberProfile) {
    const data = {
      ...memberProfile,
      updatedAt: new Date().toISOString(),
    };
    await writeSharedFile(
      repoPath,
      `members/${memberProfile.id || memberProfile.name}.json`,
      JSON.stringify(data, null, 2)
    );
    return data;
  }

  async function listMembers(repoPath) {
    const entries = await listSharedDir(repoPath, "members");
    const members = [];
    for (const entry of entries) {
      if (entry.type === "file" && entry.name.endsWith(".json")) {
        try {
          const content = await fs.readFile(entry.path, "utf-8");
          members.push(JSON.parse(content));
        } catch { /* skip */ }
      }
    }
    return members;
  }

  return {
    ensureSharedDir,
    isInitialized,
    readSharedFile,
    writeSharedFile,
    listSharedDir,
    saveConversation,
    loadConversation,
    listConversations,
    saveMember,
    listMembers,
  };
}

module.exports = { createSharedStateService };
