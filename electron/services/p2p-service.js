const crypto = require("crypto");
const Y = require("yjs");

/**
 * P2P collaboration service using Hyperswarm for peer discovery
 * and Yjs CRDTs for conflict-free state merging.
 *
 * Supports multiple simultaneous project rooms - each project
 * gets its own Hyperswarm topic, Yjs doc, peer map, and heartbeat.
 *
 * Runs in Electron main process (full Node.js access).
 * Communicates with the renderer via an event sender function.
 */
function createP2PService({ sharedStateService, sendEvent: initialSendEvent }) {
  let sendEvent = initialSendEvent || (() => {});

  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY_MS = 3000;
  const HEARTBEAT_MS = 5000;
  const PEER_TIMEOUT_MS = 30000;

  /**
   * Active sessions keyed by projectId.
   * Each session = {
   *   projectId, swarm, topic, repoPath, member, remoteUrl,
   *   ydoc, peers (Map), peerStreamAccumulators (Map),
   *   heartbeatInterval, reconnectTimer, reconnectAttempts,
   *   isJoined, lastPeerSeenAt
   * }
   */
  const sessions = new Map();

  // Callback hooks for main-process integration
  const stateChangeCallbacks = [];
  const peerReadyCallbacks = [];

  /* --- Helpers --- */

  function deriveTopicKey(remoteUrl) {
    return crypto.createHash("sha256").update(`codebuddy:${remoteUrl}`).digest();
  }

  function makePeerId(connection) {
    return connection.remotePublicKey?.toString("hex")?.slice(0, 16) ?? crypto.randomUUID().slice(0, 16);
  }

  function broadcastToPeers(session, messageObj) {
    const data = Buffer.from(JSON.stringify(messageObj));
    for (const [, peer] of session.peers) {
      try {
        if (peer.connection && !peer.connection.destroyed) {
          peer.connection.write(data);
        }
      } catch { /* ignore */ }
    }
  }

  function emitPresence(session) {
    const peerList = [];
    const now = Date.now();
    for (const [id, peer] of session.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
        session.peers.delete(id);
        sendEvent("p2p:peerLeft", { projectId: session.projectId, peerId: id, name: peer.name });
        continue;
      }
      peerList.push({
        id,
        name: peer.name || "Unknown",
        initials: peer.initials || "??",
        role: peer.role || "Member",
        status: now - peer.lastSeen < HEARTBEAT_MS * 2 ? "online" : "away",
        lastSeen: peer.lastSeen,
      });
    }
    sendEvent("p2p:presence", { projectId: session.projectId, peers: peerList, memberCount: peerList.length });
  }

  /* --- Yjs state sync --- */

  function initYDoc(session) {
    session.ydoc = new Y.Doc();
    session.ydoc.on("update", (update, origin) => {
      if (origin !== "remote") {
        broadcastToPeers(session, {
          type: "yjs-update",
          update: Buffer.from(update).toString("base64"),
        });
      }
    });
    return session.ydoc;
  }

  function applyRemoteUpdate(session, base64Update) {
    if (!session.ydoc) return;
    try {
      const update = Buffer.from(base64Update, "base64");
      Y.applyUpdate(session.ydoc, new Uint8Array(update), "remote");
    } catch { /* corrupted */ }
  }

  function getStateVector(session) {
    if (!session.ydoc) return null;
    return Buffer.from(Y.encodeStateVector(session.ydoc)).toString("base64");
  }

  /* --- Connection handling --- */

  function handlePeerConnection(session, connection) {
    const peerId = makePeerId(connection);
    console.log(`[P2P:${session.projectId.slice(0, 8)}] Peer connected: ${peerId}`);

    session.peers.set(peerId, {
      id: peerId,
      name: "Unknown",
      initials: "??",
      role: "Member",
      lastSeen: Date.now(),
      connection,
    });

    try {
      connection.write(Buffer.from(JSON.stringify({
        type: "hello",
        member: session.member,
        stateVector: getStateVector(session),
      })));
    } catch { /* ignore */ }

    let buffer = "";

    connection.on("data", (data) => {
      buffer += data.toString();
      let boundary;
      while ((boundary = findJsonBoundary(buffer)) !== -1) {
        const jsonStr = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary);
        try {
          const msg = JSON.parse(jsonStr);
          handlePeerMessage(session, peerId, msg);
        } catch { /* skip */ }
      }
      try {
        const msg = JSON.parse(buffer);
        handlePeerMessage(session, peerId, msg);
        buffer = "";
      } catch { /* incomplete */ }
    });

    connection.on("close", () => {
      console.log(`[P2P:${session.projectId.slice(0, 8)}] Peer disconnected: ${peerId}`);
      const peer = session.peers.get(peerId);
      session.peers.delete(peerId);
      sendEvent("p2p:peerLeft", { projectId: session.projectId, peerId, name: peer?.name ?? "Unknown" });
      emitPresence(session);
      if (session.isJoined && session.peers.size === 0) {
        setTimeout(() => {
          if (session.isJoined && session.peers.size === 0) {
            console.log(`[P2P:${session.projectId.slice(0, 8)}] All peers lost - scheduling reconnect...`);
            scheduleReconnect(session);
          }
        }, 10000);
      }
    });

    connection.on("error", (err) => {
      console.error(`[P2P:${session.projectId.slice(0, 8)}] Peer ${peerId} error:`, err?.message);
    });

    sendEvent("p2p:peerJoined", { projectId: session.projectId, peerId, name: "Unknown", initials: "??" });
    emitPresence(session);
  }

  function findJsonBoundary(str) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) return i + 1; }
    }
    return -1;
  }

  function handlePeerMessage(session, peerId, msg) {
    const peer = session.peers.get(peerId);
    if (peer) peer.lastSeen = Date.now();

    switch (msg.type) {
      case "hello": {
        if (peer && msg.member) {
          peer.name = msg.member.name || "Unknown";
          peer.initials = msg.member.initials || "??";
          peer.role = msg.member.role || "Member";
          sendEvent("p2p:peerJoined", { projectId: session.projectId, peerId, name: peer.name, initials: peer.initials });
          for (const cb of peerReadyCallbacks) {
            try { cb(session.projectId, peerId, peer.name); } catch { /* ignore */ }
          }
        }
        if (msg.stateVector && session.ydoc) {
          try {
            const remoteVector = new Uint8Array(Buffer.from(msg.stateVector, "base64"));
            const update = Y.encodeStateAsUpdate(session.ydoc, remoteVector);
            if (update.length > 0 && peer?.connection && !peer.connection.destroyed) {
              peer.connection.write(Buffer.from(JSON.stringify({
                type: "yjs-sync",
                update: Buffer.from(update).toString("base64"),
              })));
            }
          } catch { /* ignore */ }
        }
        emitPresence(session);
        break;
      }

      case "yjs-update":
      case "yjs-sync": {
        if (msg.update) applyRemoteUpdate(session, msg.update);
        break;
      }

      case "heartbeat": {
        session.lastPeerSeenAt = Date.now();
        if (peer && msg.member) {
          peer.name = msg.member.name || peer.name;
          peer.initials = msg.member.initials || peer.initials;
        }
        emitPresence(session);
        break;
      }

      case "chat-token": {
        const existing = session.peerStreamAccumulators.get(peerId) || { tokens: "" };
        const accumulated = {
          peerName: peer?.name ?? "Unknown",
          conversationId: msg.conversationId,
          scope: msg.scope,
          tokens: (existing.tokens + (msg.token || "")).slice(-8000),
          taskId: msg.taskId || existing.taskId || null,
          taskName: msg.taskName || existing.taskName || null,
          sessionId: msg.sessionId || existing.sessionId || null,
          sessionTitle: msg.sessionTitle || existing.sessionTitle || null,
          updatedAt: Date.now(),
        };
        session.peerStreamAccumulators.set(peerId, accumulated);
        sendEvent("p2p:chatToken", {
          projectId: session.projectId,
          peerId,
          peerName: peer?.name ?? "Unknown",
          conversationId: msg.conversationId,
          token: msg.token,
          scope: msg.scope,
          taskId: msg.taskId || null,
          taskName: msg.taskName || null,
          sessionId: msg.sessionId || null,
          sessionTitle: msg.sessionTitle || null,
        });
        break;
      }

      case "chat-message": {
        session.peerStreamAccumulators.delete(peerId);
        sendEvent("p2p:chatMessage", {
          projectId: session.projectId,
          peerId,
          peerName: peer?.name ?? "Unknown",
          conversationId: msg.conversationId,
          message: msg.message,
          scope: msg.scope,
        });
        break;
      }

      case "state-change": {
        const peerInfo = peer?.name ?? "Unknown";
        console.log(`[P2P:${session.projectId.slice(0, 8)}] Received state-change: category=${msg.category} id=${msg.id} from=${peerInfo}`);
        sendEvent("p2p:stateChanged", {
          projectId: session.projectId,
          peerId,
          peerName: peer?.name ?? "Unknown",
          category: msg.category,
          id: msg.id,
          data: msg.data,
        });
        for (const cb of stateChangeCallbacks) {
          try { cb(session.projectId, msg.category, msg.id, msg.data, peer?.name); } catch { /* ignore */ }
        }
        syncStateChangeToDisk(session, msg.category, msg.id, msg.data);
        if (session.ydoc && msg.category && msg.id) {
          try {
            const yMap = session.ydoc.getMap(msg.category);
            session.ydoc.transact(() => {
              yMap.set(msg.id, { id: msg.id, updatedAt: new Date().toISOString(), ...msg.data });
            }, "remote");
          } catch { /* ignore */ }
        }
        break;
      }

      default:
        break;
    }
  }

  /* --- Public API --- */

  async function joinProject(projectId, repoPath, remoteUrl, memberProfile) {
    // If this project is already joined, leave it first (rejoin)
    if (sessions.has(projectId)) {
      await leaveProject(projectId);
    }

    if (!remoteUrl) {
      throw new Error("No Git remote URL. Push to GitHub first to enable P2P collaboration.");
    }

    const session = {
      projectId,
      swarm: null,
      topic: deriveTopicKey(remoteUrl),
      repoPath,
      member: memberProfile,
      remoteUrl,
      ydoc: null,
      peers: new Map(),
      peerStreamAccumulators: new Map(),
      heartbeatInterval: null,
      reconnectTimer: null,
      reconnectAttempts: 0,
      isJoined: false,
      lastPeerSeenAt: Date.now(),
    };

    sessions.set(projectId, session);
    initYDoc(session);
    await loadSharedStateIntoYDoc(session);
    await connectSwarm(session);

    return {
      projectId,
      topic: session.topic.toString("hex"),
      joined: true,
    };
  }

  async function connectSwarm(session) {
    const Hyperswarm = require("hyperswarm");
    session.swarm = new Hyperswarm();

    session.swarm.on("connection", (connection) => {
      session.lastPeerSeenAt = Date.now();
      handlePeerConnection(session, connection);
    });

    const discovery = session.swarm.join(session.topic, { server: true, client: true });
    await discovery.flushed();

    session.isJoined = true;
    console.log(`[P2P:${session.projectId.slice(0, 8)}] Joined room: ${session.topic.toString("hex").slice(0, 16)}...`);

    session.heartbeatInterval = setInterval(() => {
      broadcastToPeers(session, {
        type: "heartbeat",
        member: session.member,
        timestamp: Date.now(),
      });
      emitPresence(session);
      if (session.peers.size === 0 && !session.reconnectTimer && Date.now() - session.lastPeerSeenAt > 60000) {
        console.log(`[P2P:${session.projectId.slice(0, 8)}] No peers for 60s - forcing reconnect...`);
        session.lastPeerSeenAt = Date.now();
        session.reconnectAttempts = 0;
        scheduleReconnect(session);
      }
    }, HEARTBEAT_MS);

    sendEvent("p2p:joined", {
      projectId: session.projectId,
      topic: session.topic.toString("hex"),
      repoPath: session.repoPath,
      remoteUrl: session.remoteUrl,
    });
  }

  function scheduleReconnect(session) {
    if (session.reconnectTimer) return;
    if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`[P2P:${session.projectId.slice(0, 8)}] Max reconnect attempts reached.`);
      sendEvent("p2p:left", { projectId: session.projectId, topic: session.topic?.toString("hex"), reason: "max-reconnect" });
      return;
    }
    const delay = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(1.5, session.reconnectAttempts), 30000);
    session.reconnectAttempts++;
    console.log(`[P2P:${session.projectId.slice(0, 8)}] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${session.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    sendEvent("p2p:reconnecting", { projectId: session.projectId, attempt: session.reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS, delayMs: delay });

    session.reconnectTimer = setTimeout(async () => {
      session.reconnectTimer = null;
      if (!session.topic || !session.repoPath || !session.member) return;
      try {
        if (session.swarm) {
          try {
            if (session.topic) await session.swarm.leave(session.topic);
            await session.swarm.destroy();
          } catch { /* ignore */ }
          session.swarm = null;
        }
        if (session.heartbeatInterval) {
          clearInterval(session.heartbeatInterval);
          session.heartbeatInterval = null;
        }
        session.peers.clear();
        session.isJoined = false;
        await connectSwarm(session);
        session.reconnectAttempts = 0;
        console.log(`[P2P:${session.projectId.slice(0, 8)}] Reconnected successfully.`);
      } catch (err) {
        console.error(`[P2P:${session.projectId.slice(0, 8)}] Reconnect failed:`, err?.message);
        scheduleReconnect(session);
      }
    }, delay);
  }

  async function loadSharedStateIntoYDoc(session) {
    if (!session.ydoc || !sharedStateService) return;
    try {
      const conversations = await sharedStateService.listConversations(session.repoPath);
      const yConversations = session.ydoc.getArray("conversations");
      if (yConversations.length === 0 && conversations.length > 0) {
        session.ydoc.transact(() => {
          for (const conv of conversations) yConversations.push([conv]);
        });
      }
      const members = await sharedStateService.listMembers(session.repoPath);
      const yMembers = session.ydoc.getMap("members");
      if (yMembers.size === 0) {
        session.ydoc.transact(() => {
          for (const m of members) yMembers.set(m.id || m.name, m);
        });
      }
      const yTasks = session.ydoc.getMap("tasks");
      if (yTasks.size === 0) {
        try {
          const taskEntries = await sharedStateService.listSharedDir(session.repoPath, "tasks");
          for (const entry of taskEntries) {
            if (entry.type === "file" && entry.name.endsWith(".json")) {
              const result = await sharedStateService.readSharedFile(session.repoPath, `tasks/${entry.name}`);
              if (result.exists && result.content) {
                try {
                  const d = JSON.parse(result.content);
                  session.ydoc.transact(() => { yTasks.set(d.id || entry.name, d); });
                } catch { /* skip corrupted */ }
              }
            }
          }
        } catch { /* tasks dir may not exist */ }
      }
      const yAgents = session.ydoc.getMap("agents");
      if (yAgents.size === 0) {
        try {
          const agentEntries = await sharedStateService.listSharedDir(session.repoPath, "agents");
          for (const entry of agentEntries) {
            if (entry.type === "file" && entry.name.endsWith(".json")) {
              const result = await sharedStateService.readSharedFile(session.repoPath, `agents/${entry.name}`);
              if (result.exists && result.content) {
                try {
                  const d = JSON.parse(result.content);
                  session.ydoc.transact(() => { yAgents.set(d.id || entry.name, d); });
                } catch { /* skip corrupted */ }
              }
            }
          }
        } catch { /* agents dir may not exist */ }
      }
    } catch (err) {
      console.error(`[P2P:${session.projectId.slice(0, 8)}] Error loading shared state:`, err?.message);
    }
  }

  async function syncStateChangeToDisk(session, category, id, data) {
    if (!sharedStateService || !session.repoPath) return;
    try {
      const validCategories = ["tasks", "agents", "members", "conversations"];
      if (!validCategories.includes(category)) return;
      const sanitizedId = String(id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
      await sharedStateService.writeSharedFile(
        session.repoPath,
        `${category}/${sanitizedId}.json`,
        JSON.stringify({ id, updatedAt: new Date().toISOString(), ...data }, null, 2)
      );
    } catch (err) {
      console.error(`[P2P:${session.projectId.slice(0, 8)}] Error syncing ${category}/${id} to disk:`, err?.message);
    }
  }

  async function leaveProject(projectId) {
    const session = sessions.get(projectId);
    if (!session) return { left: true };

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    session.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;

    if (session.heartbeatInterval) {
      clearInterval(session.heartbeatInterval);
      session.heartbeatInterval = null;
    }

    for (const [, peer] of session.peers) {
      try { peer.connection?.destroy(); } catch { /* ignore */ }
    }
    session.peers.clear();
    session.peerStreamAccumulators.clear();

    if (session.swarm) {
      try {
        if (session.topic) await session.swarm.leave(session.topic);
        await session.swarm.destroy();
      } catch { /* ignore */ }
      session.swarm = null;
    }

    if (session.ydoc) {
      session.ydoc.destroy();
      session.ydoc = null;
    }

    const wasTopic = session.topic?.toString("hex");
    sessions.delete(projectId);

    if (wasTopic) {
      sendEvent("p2p:left", { projectId, topic: wasTopic });
      console.log(`[P2P:${projectId.slice(0, 8)}] Left project room`);
    }

    return { left: true };
  }

  async function leaveAllProjects() {
    const projectIds = [...sessions.keys()];
    for (const pid of projectIds) {
      await leaveProject(pid);
    }
    return { left: true, count: projectIds.length };
  }

  function broadcastChatToken(projectId, conversationId, token, scope, extra = {}) {
    const session = sessions.get(projectId);
    if (!session?.isJoined) return;
    broadcastToPeers(session, {
      type: "chat-token",
      conversationId,
      token,
      scope: scope || "solo-chat",
      ...extra,
    });
  }

  function broadcastChatMessage(projectId, conversationId, message, scope) {
    const session = sessions.get(projectId);
    if (!session?.isJoined) return;
    broadcastToPeers(session, {
      type: "chat-message",
      conversationId,
      message,
      scope: scope || "solo-chat",
    });
    if (session.ydoc) {
      const yConversations = session.ydoc.getArray("conversations");
      yConversations.push([{
        id: conversationId,
        title: message?.text?.slice(0, 50) || conversationId,
        updatedAt: new Date().toISOString(),
        type: scope || "solo-chat",
      }]);
    }
  }

  function broadcastStateChange(projectId, category, id, data) {
    const session = sessions.get(projectId);
    if (!session?.isJoined) return;
    broadcastToPeers(session, {
      type: "state-change",
      category,
      id,
      data,
    });
    if (session.ydoc && category && id) {
      try {
        const yMap = session.ydoc.getMap(category);
        session.ydoc.transact(() => {
          yMap.set(id, { id, updatedAt: new Date().toISOString(), ...data });
        });
      } catch { /* ignore */ }
    }
    syncStateChangeToDisk(session, category, id, data);
  }

  function getConnectedPeers(projectId) {
    const session = sessions.get(projectId);
    if (!session) return [];
    const peerList = [];
    const now = Date.now();
    for (const [id, peer] of session.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) continue;
      peerList.push({
        id,
        name: peer.name || "Unknown",
        initials: peer.initials || "??",
        role: peer.role || "Member",
        status: now - peer.lastSeen < HEARTBEAT_MS * 2 ? "online" : "away",
      });
    }
    return peerList;
  }

  function getStatus(projectId) {
    if (projectId) {
      const session = sessions.get(projectId);
      if (!session) return { joined: false, topic: null, repoPath: null, peerCount: 0, member: null, reconnecting: false, reconnectAttempts: 0, projectId };
      return {
        projectId: session.projectId,
        joined: session.isJoined,
        topic: session.topic?.toString("hex") ?? null,
        repoPath: session.repoPath,
        peerCount: session.peers.size,
        member: session.member,
        reconnecting: session.reconnectTimer !== null,
        reconnectAttempts: session.reconnectAttempts,
      };
    }
    // Return status for all active sessions
    const result = {};
    for (const [pid, session] of sessions) {
      result[pid] = {
        projectId: pid,
        joined: session.isJoined,
        topic: session.topic?.toString("hex") ?? null,
        repoPath: session.repoPath,
        peerCount: session.peers.size,
        member: session.member,
        reconnecting: session.reconnectTimer !== null,
        reconnectAttempts: session.reconnectAttempts,
      };
    }
    return result;
  }

  function __setEventSender(fn) {
    sendEvent = fn;
  }

  /* --- Invite system --- */

  function generateInviteCode(remoteUrl, projectName) {
    if (!remoteUrl) throw new Error("Project must be pushed to GitHub to generate an invite code.");
    const payload = JSON.stringify({ r: remoteUrl, n: projectName || "Project" });
    return Buffer.from(payload).toString("base64url");
  }

  function decodeInviteCode(code) {
    try {
      const decoded = Buffer.from(code, "base64url").toString("utf8");
      const payload = JSON.parse(decoded);
      if (!payload.r) throw new Error("Invalid invite code - missing remote URL.");
      return { remoteUrl: payload.r, projectName: payload.n || "Project" };
    } catch (err) {
      if (err.message?.includes("Invalid invite")) throw err;
      throw new Error("Invalid invite code - could not decode.");
    }
  }

  function onStateChange(callback) {
    stateChangeCallbacks.push(callback);
  }

  function onPeerReady(callback) {
    peerReadyCallbacks.push(callback);
  }

  function getActivePeerStreams(projectId) {
    const session = sessions.get(projectId);
    if (!session) return {};
    const result = {};
    for (const [peerId, acc] of session.peerStreamAccumulators) {
      if (Date.now() - acc.updatedAt < 60000) {
        result[peerId] = { ...acc };
      } else {
        session.peerStreamAccumulators.delete(peerId);
      }
    }
    return result;
  }

  function isProjectJoined(projectId) {
    const session = sessions.get(projectId);
    return session?.isJoined ?? false;
  }

  function getJoinedProjectIds() {
    const ids = [];
    for (const [pid, session] of sessions) {
      if (session.isJoined) ids.push(pid);
    }
    return ids;
  }

  return {
    joinProject,
    leaveProject,
    leaveAllProjects,
    broadcastChatToken,
    broadcastChatMessage,
    broadcastStateChange,
    getConnectedPeers,
    getStatus,
    generateInviteCode,
    decodeInviteCode,
    onStateChange,
    onPeerReady,
    getActivePeerStreams,
    isProjectJoined,
    getJoinedProjectIds,
    __setEventSender,
  };
}

module.exports = { createP2PService };
