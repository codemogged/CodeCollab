/**
 * Git Queue Service
 *
 * Serializes ALL git operations (pull/push/commit) per repository so that
 * the file-watcher auto-sync, savePlan push, manual sync, etc. can never
 * run at the same time on the same repo.
 *
 * Behavior:
 *   - One promise chain per repoPath (keyed by resolved path).
 *   - `enqueue(repoPath, label, fn)` returns a promise that resolves to
 *     `fn`'s result after every previously enqueued op on that repo has
 *     finished, whether they succeeded or failed.
 *   - Errors inside `fn` are propagated to the caller but do NOT break
 *     the chain for subsequent operations.
 */
const path = require("path");

function createGitQueueService() {
  // Map<repoPath, { tail: Promise, depth: number }>
  const queues = new Map();

  function getKey(repoPath) {
    try {
      return path.resolve(repoPath || "");
    } catch {
      return String(repoPath || "");
    }
  }

  function enqueue(repoPath, label, fn) {
    const key = getKey(repoPath);
    const entry = queues.get(key) || { tail: Promise.resolve(), depth: 0 };
    entry.depth += 1;
    const startedAt = Date.now();
    const next = entry.tail.then(
      () => runOp(label, fn, startedAt),
      () => runOp(label, fn, startedAt)
    );
    // Ensure the chain never rejects (so future enqueues still wait).
    entry.tail = next.catch(() => {});
    queues.set(key, entry);
    next.finally(() => {
      entry.depth = Math.max(0, entry.depth - 1);
      // Trim idle entries to keep the map small
      if (entry.depth === 0 && queues.get(key) === entry) {
        queues.delete(key);
      }
    });
    return next;
  }

  async function runOp(label, fn, enqueuedAt) {
    const waitedMs = Date.now() - enqueuedAt;
    if (waitedMs > 1000) {
      console.log(`[git-queue] "${label || "op"}" waited ${waitedMs}ms`);
    }
    return fn();
  }

  function getDepth(repoPath) {
    const entry = queues.get(getKey(repoPath));
    return entry ? entry.depth : 0;
  }

  return { enqueue, getDepth };
}

module.exports = { createGitQueueService };
