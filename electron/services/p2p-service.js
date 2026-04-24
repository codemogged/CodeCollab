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

  // --- Security limits to prevent peer-initiated DoS / abuse ---
  // Single framed JSON message cannot exceed this.
  const MAX_MESSAGE_BYTES = 256 * 1024;            // 256 KB per message
  // Total unparsed buffer per peer cannot exceed this (prevents unbounded growth
  // from a peer that streams data without ever producing a complete JSON).
  const MAX_PEER_BUFFER_BYTES = 8 * 1024 * 1024;   // 8 MB
  // Chat token accumulator rolling window is already bounded (8000 chars);
  // keep it that way.
  // Forbidden keys when merging peer-provided objects into local state.
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  const PROTOCOL_VERSION = 2;

  /**
   * Remove dangerous keys (prototype pollution) from an object tree that
   * came from an untrusted peer. Also caps depth and string length to
   * prevent pathological payloads from exhausting memory.
   */
  function sanitizePeerValue(value, depth = 0) {
    if (depth > 12) return null;
    if (value === null) return null;
    const t = typeof value;
    if (t === "string") {
      // 64 KB per string is more than enough for chat/plan content
      return value.length > 65536 ? value.slice(0, 65536) : value;
    }
    if (t === "number" || t === "boolean") return value;
    if (t !== "object") return undefined;
    if (Array.isArray(value)) {
      const out = [];
      const max = Math.min(value.length, 2000);
      for (let i = 0; i < max; i++) {
        const v = sanitizePeerValue(value[i], depth + 1);
        if (v !== undefined) out.push(v);
      }
      return out;
    }
    const out = Object.create(null);
    let count = 0;
    for (const key of Object.keys(value)) {
      if (count++ > 500) break;
      if (FORBIDDEN_KEYS.has(key)) continue;
      const v = sanitizePeerValue(value[key], depth + 1);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }

  /** Safe ID / category: alphanumeric, dash, underscore, dot only, length-capped. */
  function sanitizeId(id) {
    if (typeof id !== "string") return null;
    const trimmed = id.slice(0, 200);
    if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return null;
    return trimmed;
  }

  function computeHmac(secret, payloadBuffer) {
    if (!secret) return null;
    return crypto.createHmac("sha256", secret).update(payloadBuffer).digest("base64url");
  }

  /**
   * Constant-time string compare to avoid HMAC timing leaks.
   */
  function timingSafeEqualStr(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    try { return crypto.timingSafeEqual(ab, bb); } catch { return false; }
  }

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

  function deriveTopicKey(remoteUrl, secret) {
    // v2 (authenticated): topic depends on secret — only invitees can discover the room
    // v1 (legacy): topic depends only on remoteUrl — backward compatible for older invites
    const h = crypto.createHash("sha256");
    if (secret) {
      h.update(`codebuddy:v2:${remoteUrl}:`);
      h.update(secret);
    } else {
      h.update(`codebuddy:${remoteUrl}`);
    }
    return h.digest();
  }

  function makePeerId(connection) {
    return connection.remotePublicKey?.toString("hex")?.slice(0, 16) ?? crypto.randomUUID().slice(0, 16);
  }

  function broadcastToPeers(session, messageObj) {
    const envelope = session.secret
      ? (() => {
          const body = JSON.stringify(messageObj);
          return {
            v: PROTOCOL_VERSION,
            sig: computeHmac(session.secret, Buffer.from(body, "utf8")),
            body,
          };
        })()
      : messageObj;
    const data = Buffer.from(JSON.stringify(envelope));
    if (data.length > MAX_MESSAGE_BYTES) {
      // Refuse to send oversized frames — prevents us from being used to amplify
      console.warn(`[P2P] Dropping oversized outbound message (${data.length} bytes)`);
      return;
    }
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

    // Cancel the v2→v1 fallback — a peer joined, so the current topic works.
    if (session.v1FallbackTimer) {
      clearTimeout(session.v1FallbackTimer);
      session.v1FallbackTimer = null;
    }

    session.peers.set(peerId, {
      id: peerId,
      name: "Unknown",
      initials: "??",
      role: "Member",
      lastSeen: Date.now(),
      connection,
    });

    try {
      const helloMsg = {
        type: "hello",
        member: session.member,
        stateVector: getStateVector(session),
      };
      if (session.secret) {
        const body = JSON.stringify(helloMsg);
        connection.write(Buffer.from(JSON.stringify({
          v: PROTOCOL_VERSION,
          sig: computeHmac(session.secret, Buffer.from(body, "utf8")),
          body,
        })));
      } else {
        connection.write(Buffer.from(JSON.stringify(helloMsg)));
      }
    } catch { /* ignore */ }

    let buffer = "";

    const processFrame = (jsonStr) => {
      if (jsonStr.length > MAX_MESSAGE_BYTES) {
        console.warn(`[P2P:${session.projectId.slice(0, 8)}] Dropping oversized frame from ${peerId} (${jsonStr.length} bytes)`);
        return;
      }
      let parsed;
      try { parsed = JSON.parse(jsonStr); } catch { return; }
      if (!parsed || typeof parsed !== "object") return;

      // v2 authenticated envelope: { v, sig, body }
      let inner = parsed;
      if (session.secret) {
        if (parsed.v !== PROTOCOL_VERSION || typeof parsed.body !== "string" || typeof parsed.sig !== "string") {
          // This session requires authenticated messages; drop anything else.
          return;
        }
        const expectedSig = computeHmac(session.secret, Buffer.from(parsed.body, "utf8"));
        if (!timingSafeEqualStr(expectedSig, parsed.sig)) {
          console.warn(`[P2P:${session.projectId.slice(0, 8)}] Rejecting peer message with bad HMAC from ${peerId}`);
          return;
        }
        try { inner = JSON.parse(parsed.body); } catch { return; }
        if (!inner || typeof inner !== "object") return;
      } else if (parsed.v === PROTOCOL_VERSION && typeof parsed.body === "string") {
        // Legacy session received an authenticated frame — unwrap without verifying
        try { inner = JSON.parse(parsed.body); } catch { return; }
      }
      try { handlePeerMessage(session, peerId, inner); } catch { /* ignore */ }
    };

    connection.on("data", (data) => {
      buffer += data.toString();
      if (buffer.length > MAX_PEER_BUFFER_BYTES) {
        console.warn(`[P2P:${session.projectId.slice(0, 8)}] Peer ${peerId} exceeded buffer limit — disconnecting.`);
        try { connection.destroy(); } catch { /* ignore */ }
        buffer = "";
        return;
      }
      let boundary;
      while ((boundary = findJsonBoundary(buffer)) !== -1) {
        const jsonStr = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary);
        processFrame(jsonStr);
      }
      // Try parsing remaining buffer as a complete frame (message may have arrived whole)
      if (buffer.length > 0 && buffer.length <= MAX_MESSAGE_BYTES) {
        try {
          JSON.parse(buffer);
          processFrame(buffer);
          buffer = "";
        } catch { /* incomplete */ }
      }
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
        if (peer && msg.member && typeof msg.member === "object") {
          const m = msg.member;
          peer.name = (typeof m.name === "string" ? m.name : "Unknown").slice(0, 80);
          peer.initials = (typeof m.initials === "string" ? m.initials : "??").slice(0, 4);
          peer.role = (typeof m.role === "string" ? m.role : "Member").slice(0, 40);
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
              const syncMsg = {
                type: "yjs-sync",
                update: Buffer.from(update).toString("base64"),
              };
              if (session.secret) {
                const body = JSON.stringify(syncMsg);
                peer.connection.write(Buffer.from(JSON.stringify({
                  v: PROTOCOL_VERSION,
                  sig: computeHmac(session.secret, Buffer.from(body, "utf8")),
                  body,
                })));
              } else {
                peer.connection.write(Buffer.from(JSON.stringify(syncMsg)));
              }
            }
          } catch { /* ignore */ }
        }
        emitPresence(session);
        break;
      }

      case "yjs-update":
      case "yjs-sync": {
        if (typeof msg.update !== "string") break;
        // Cap base64 length (base64 is ~4/3 of original). MAX_MESSAGE_BYTES already
        // bounds the enclosing frame, but belt-and-braces here too.
        if (msg.update.length > MAX_MESSAGE_BYTES) break;
        applyRemoteUpdate(session, msg.update);
        break;
      }

      case "heartbeat": {
        session.lastPeerSeenAt = Date.now();
        session.forcedReconnectLogged = false;
        if (peer && msg.member && typeof msg.member === "object") {
          const m = msg.member;
          if (typeof m.name === "string") peer.name = m.name.slice(0, 80) || peer.name;
          if (typeof m.initials === "string") peer.initials = m.initials.slice(0, 4) || peer.initials;
        }
        emitPresence(session);
        break;
      }

      case "chat-token": {
        const existing = session.peerStreamAccumulators.get(peerId) || { tokens: "" };
        const safeConversationId = sanitizeId(msg.conversationId) || "unknown";
        const safeScope = typeof msg.scope === "string" ? msg.scope.slice(0, 40) : undefined;
        const safeToken = typeof msg.token === "string" ? msg.token.slice(0, 16384) : "";
        const accumulated = {
          peerName: peer?.name ?? "Unknown",
          conversationId: safeConversationId,
          scope: safeScope,
          tokens: (existing.tokens + safeToken).slice(-500000),
          taskId: sanitizeId(msg.taskId) || existing.taskId || null,
          taskName: typeof msg.taskName === "string" ? msg.taskName.slice(0, 200) : existing.taskName || null,
          sessionId: sanitizeId(msg.sessionId) || existing.sessionId || null,
          sessionTitle: typeof msg.sessionTitle === "string" ? msg.sessionTitle.slice(0, 200) : existing.sessionTitle || null,
          updatedAt: Date.now(),
        };
        session.peerStreamAccumulators.set(peerId, accumulated);
        sendEvent("p2p:chatToken", {
          projectId: session.projectId,
          peerId,
          peerName: peer?.name ?? "Unknown",
          conversationId: safeConversationId,
          token: safeToken,
          scope: safeScope,
          taskId: accumulated.taskId,
          taskName: accumulated.taskName,
          sessionId: accumulated.sessionId,
          sessionTitle: accumulated.sessionTitle,
        });
        break;
      }

      case "chat-message": {
        session.peerStreamAccumulators.delete(peerId);
        const safeConversationId = sanitizeId(msg.conversationId) || "unknown";
        const safeScope = typeof msg.scope === "string" ? msg.scope.slice(0, 40) : undefined;
        const safeMessage = sanitizePeerValue(msg.message);
        sendEvent("p2p:chatMessage", {
          projectId: session.projectId,
          peerId,
          peerName: peer?.name ?? "Unknown",
          conversationId: safeConversationId,
          message: safeMessage,
          scope: safeScope,
        });
        break;
      }

      case "state-change": {
        const safeCategory = sanitizeId(msg.category);
        const safeId = sanitizeId(msg.id);
        const safeData = sanitizePeerValue(msg.data);
        if (!safeCategory || !safeId || safeData === null || typeof safeData !== "object") {
          // Malformed or unsafe — drop silently
          break;
        }
        const peerInfo = peer?.name ?? "Unknown";
        console.log(`[P2P:${session.projectId.slice(0, 8)}] Received state-change: category=${safeCategory} id=${safeId} from=${peerInfo}`);
        sendEvent("p2p:stateChanged", {
          projectId: session.projectId,
          peerId,
          peerName: peer?.name ?? "Unknown",
          category: safeCategory,
          id: safeId,
          data: safeData,
        });
        for (const cb of stateChangeCallbacks) {
          try { cb(session.projectId, safeCategory, safeId, safeData, peer?.name); } catch { /* ignore */ }
        }
        syncStateChangeToDisk(session, safeCategory, safeId, safeData);
        if (session.ydoc) {
          try {
            const yMap = session.ydoc.getMap(safeCategory);
            session.ydoc.transact(() => {
              yMap.set(safeId, { id: safeId, updatedAt: new Date().toISOString(), ...safeData });
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

  async function joinProject(projectId, repoPath, remoteUrl, memberProfile, options = {}) {
    // If this project is already joined, leave it first (rejoin)
    if (sessions.has(projectId)) {
      await leaveProject(projectId);
    }

    if (!remoteUrl) {
      throw new Error("No Git remote URL. Push to GitHub first to enable P2P collaboration.");
    }

    // Optional per-project shared secret. If present, the Hyperswarm topic is
    // derived from (remoteUrl + secret) and every frame carries an HMAC signature.
    // This means anyone who only knows the (possibly public) GitHub URL cannot
    // discover the P2P room or forge messages.
    let secret = null;
    if (typeof options.secret === "string" && options.secret.length > 0) {
      try {
        secret = Buffer.from(options.secret, "base64url");
        if (secret.length < 16) secret = null; // require ≥128 bits of entropy
      } catch { secret = null; }
    }

    const session = {
      projectId,
      swarm: null,
      topic: deriveTopicKey(remoteUrl, secret),
      repoPath,
      member: memberProfile,
      remoteUrl,
      secret,
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
    // Log "Joined room" only on the initial join. Silent reconnects happen every ~60s while idle and would spam.
    if (!session.hasEverJoined) {
      console.log(`[P2P:${session.projectId.slice(0, 8)}] Joined room: ${session.topic.toString("hex").slice(0, 16)}... mode=${session.secret ? "v2" : "v1"}`);
      session.hasEverJoined = true;
    }

    // Auto-fallback from v2 (authenticated) to v1 (legacy) if no peer appears
    // within 45s. This recovers installs where two machines self-generated
    // different per-project secrets (and thus derived different topics) so
    // they can still discover each other. A real invite-based pairing would
    // connect well within 45s since both sides share the same secret.
    if (session.secret && !session.v1FallbackArmed) {
      session.v1FallbackArmed = true;
      session.v1FallbackTimer = setTimeout(async () => {
        if (!session.isJoined) return;
        if (session.peers.size > 0) return;
        console.log(`[P2P:${session.projectId.slice(0, 8)}] No peers after 45s in v2 mode — falling back to v1 (legacy) topic.`);
        try {
          if (session.topic) { try { await session.swarm.leave(session.topic); } catch {} }
          try { await session.swarm.destroy(); } catch {}
        } catch {}
        session.swarm = null;
        if (session.heartbeatInterval) { clearInterval(session.heartbeatInterval); session.heartbeatInterval = null; }
        session.secret = null;
        session.topic = deriveTopicKey(session.remoteUrl, null);
        session.isJoined = false;
        session.hasEverJoined = false; // re-log the joined-room line for the new topic
        try { await connectSwarm(session); } catch (err) {
          console.error(`[P2P:${session.projectId.slice(0, 8)}] v1 fallback failed:`, err?.message);
        }
      }, 45000);
    }

    session.heartbeatInterval = setInterval(() => {
      broadcastToPeers(session, {
        type: "heartbeat",
        member: session.member,
        timestamp: Date.now(),
      });
      emitPresence(session);
      if (session.peers.size === 0 && !session.reconnectTimer && Date.now() - session.lastPeerSeenAt > 60000) {
        // Only log first forced reconnect per dry spell; suppress repeats until a peer appears.
        if (!session.forcedReconnectLogged) {
          console.log(`[P2P:${session.projectId.slice(0, 8)}] No peers for 60s - forcing reconnect...`);
          session.forcedReconnectLogged = true;
        }
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
    // Only log the first reconnect attempt per cycle to avoid recurring noise while idle.
    if (session.reconnectAttempts === 1) {
      console.log(`[P2P:${session.projectId.slice(0, 8)}] Reconnecting (attempt 1/${MAX_RECONNECT_ATTEMPTS})...`);
    }
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
        // Silent on success \u2014 "Joined room" already logged by connectSwarm. Only log if prior attempt made noise.
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
    if (session.v1FallbackTimer) {
      clearTimeout(session.v1FallbackTimer);
      session.v1FallbackTimer = null;
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

  /**
   * Generate a fresh 32-byte shared secret (base64url-encoded).
   * Callers (project settings) should persist this once per project and
   * include it in every invite they issue.
   */
  function generateProjectSecret() {
    return crypto.randomBytes(32).toString("base64url");
  }

  function generateInviteCode(remoteUrl, projectName, secret) {
    if (!remoteUrl) throw new Error("Project must be pushed to GitHub to generate an invite code.");
    const payload = { v: 2, r: remoteUrl, n: projectName || "Project" };
    if (typeof secret === "string" && secret.length > 0) payload.s = secret;
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
  }

  function decodeInviteCode(code) {
    try {
      const decoded = Buffer.from(code, "base64url").toString("utf8");
      const payload = JSON.parse(decoded);
      if (!payload.r || typeof payload.r !== "string") {
        throw new Error("Invalid invite code - missing remote URL.");
      }
      // Only accept http(s) / ssh git URLs — prevent file:// or data: masquerading
      const urlOk = /^(https?:\/\/|git@|ssh:\/\/)/.test(payload.r);
      if (!urlOk) throw new Error("Invalid invite code - unsupported remote URL scheme.");
      return {
        remoteUrl: payload.r,
        projectName: typeof payload.n === "string" ? payload.n.slice(0, 120) : "Project",
        secret: typeof payload.s === "string" ? payload.s.slice(0, 256) : null,
      };
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

  // Lightweight read-only session probe used by IPC handlers that need to
  // decide whether to rejoin (e.g. v1→v2 upgrade after the owner generates
  // the first invite). We deliberately expose only the fields callers need.
  function getProjectSession(projectId) {
    const session = sessions.get(projectId);
    if (!session) return null;
    return {
      isJoined: !!session.isJoined,
      hasSecret: !!session.secret,
      // Expose as `secret` so callers can treat absence as "v1-legacy".
      secret: session.secret || null,
      remoteUrl: session.remoteUrl || null,
      repoPath: session.repoPath || null,
    };
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
    generateProjectSecret,
    onStateChange,
    onPeerReady,
    getActivePeerStreams,
    isProjectJoined,
    getJoinedProjectIds,
    getProjectSession,
    __setEventSender,
  };
}

module.exports = { createP2PService };
