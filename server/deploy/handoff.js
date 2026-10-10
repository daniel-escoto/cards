const api = require("../api");
require("../config");
require("../runtime");

function clearHandoffWaiters() {
  if (api.takeoverTimer) {
    clearTimeout(api.takeoverTimer);
    api.takeoverTimer = null;
  }
  if (api.handoffPollTimer) {
    clearInterval(api.handoffPollTimer);
    api.handoffPollTimer = null;
  }
}

function isRelevantHandoffMeta(meta, { waitStartedAtMs = api.handoffWaitStartedAtMs, now = Date.now() } = {}) {
  if (!meta || typeof meta !== "object") return false;
  const atMs = Date.parse(meta.at || "");
  const flushedMs = Date.parse(meta.flushedAt || meta.shutdownFlushedAt || "");
  const stampMs = Number.isFinite(flushedMs) ? flushedMs : atMs;
  if (!Number.isFinite(stampMs)) return false;
  // Allow small clock skew; markers from the draining peer land at/after wait start.
  if (waitStartedAtMs && stampMs >= waitStartedAtMs - 5000) return true;
  // Stop-then-start: marker may predate wait start but still be a fresh shutdown flush.
  if (meta.shutdown === true && Number.isFinite(stampMs) && now - stampMs < 5 * 60 * 1000) return true;
  return false;
}

async function completeHandoffTakeover(reason = "handoff", handoffMeta = null) {
  if (api.handoffComplete) return { ok: false, reason: "already-complete" };
  clearHandoffWaiters();

  let meta = handoffMeta;
  if (!meta && api.usingRedis()) {
    try {
      meta = await api.getStateStore().readHandoff();
    } catch (error) {
      console.error("Failed to read handoff key:", error);
    }
  }
  if (meta) api.lastHandoffMeta = meta;

  // Redis: pad only by the flush→restore gap. Timeout with no marker → 0 (never idle savedAt age).
  const pad = api.usingRedis() ? api.handoffPadMs(meta, api.shotClockTime.now()) : 0;
  await api.refreshNonLiveRoomsFromStore({ downtimeMs: pad, handoffMeta: meta });
  api.handoffComplete = true;
  for (const id of api.rooms.keys()) api.liveRoomIds.add(id);
  console.log(
    `Redis handoff complete (${reason}); owning ${api.rooms.size} room(s)`
    + (pad ? ` (+${pad}ms timer pad)` : ""),
  );
  return { ok: true, reason, pad, meta };
}

async function maybeTakeoverFromHandoffKey(reason = "key") {
  if (api.handoffComplete || !api.usingRedis()) return false;
  let meta;
  try {
    meta = await api.getStateStore().readHandoff();
  } catch (error) {
    console.error("Failed to poll handoff key:", error);
    return false;
  }
  if (!isRelevantHandoffMeta(meta)) return false;
  await completeHandoffTakeover(reason, meta);
  return true;
}

async function setupHandoffSubscription() {
  if (!api.usingRedis()) return;
  const store = api.getStateStore();
  api.handoffWaitStartedAtMs = Date.now();

  // Durable key may already exist (stop-then-start: old flushed before we subscribed).
  if (await maybeTakeoverFromHandoffKey("key-preexisting")) return;

  api.unsubscribeHandoff = await store.onHandoff(async (raw) => {
    try {
      let meta = null;
      try {
        meta = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        meta = await store.readHandoff();
      }
      if (!isRelevantHandoffMeta(meta)) {
        // Still try the key — pub/sub payload may be incomplete.
        await maybeTakeoverFromHandoffKey("key");
        return;
      }
      await completeHandoffTakeover("pubsub", meta);
    } catch (error) {
      console.error("Handoff takeover failed:", error);
    }
  });

  if (api.DEPLOY_HANDOFF_POLL_MS > 0) {
    api.handoffPollTimer = setInterval(() => {
      maybeTakeoverFromHandoffKey("poll").catch((error) => {
        console.error("Handoff poll failed:", error);
      });
    }, api.DEPLOY_HANDOFF_POLL_MS);
    api.handoffPollTimer.unref?.();
  }

  if (api.DEPLOY_TAKEOVER_MS > 0) {
    api.takeoverTimer = setTimeout(() => {
      completeHandoffTakeover("timeout").catch((error) => {
        console.error("Timed handoff takeover failed:", error);
      });
    }, api.DEPLOY_TAKEOVER_MS);
    api.takeoverTimer.unref?.();
  }
}

function notifyDeployWaiting() {
  try {
    api.io.emit("server:deploy-waiting", {
      buildId: api.BUILD_ID,
      message: "Updating after this hand",
    });
  } catch (error) {
    console.error("Failed to broadcast server:deploy-waiting:", error);
  }
  for (const room of api.rooms.values()) {
    try {
      api.emitRoom(room);
    } catch (error) {
      console.error("Failed to emit deploy-waiting room update:", error);
    }
  }
}

async function gracefulShutdown(signal = "SIGTERM", options = {}) {
  const shouldExit = options.exit !== false;
  if (api.shuttingDown) return { ok: false, reason: "already-shutting-down" };
  api.shuttingDown = true;
  api.holdNewHands = true;
  console.log(`Received ${signal}; holding new hands and preparing shutdown…`);

  notifyDeployWaiting();

  const waitMs = options.handWaitMs != null ? options.handWaitMs : api.DEPLOY_HAND_WAIT_MS;
  const handsDone = await api.waitForHandsToFinish(waitMs, {
    now: options.now,
    sleep: options.sleep,
  });
  const timedOutWaiting = !handsDone;
  if (timedOutWaiting) {
    console.log(`Deploy hand wait hit ${waitMs}ms cap; pausing timers and flushing`);
  } else {
    console.log("No hands in progress (or hands finished); flushing and shutting down");
  }

  // Always pause before the final snapshot so deadlines stay stable across restore.
  api.pauseAllRoomTimers();
  api.suppressPersistence = true;

  let payload = null;
  try {
    payload = await api.saveRoomsNow({ all: true, shutdownFlush: true });
  } catch (error) {
    console.error("Failed to flush game state on shutdown:", error);
  }

  if (api.usingRedis()) {
    try {
      await api.getStateStore().publishHandoff({
        buildId: api.BUILD_ID,
        shutdown: true,
        flushedAt: payload?.shutdownFlushedAt || payload?.savedAt || new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to publish Redis handoff:", error);
    }
  }

  try {
    api.io.emit("server:restarting", { buildId: api.BUILD_ID });
  } catch (error) {
    console.error("Failed to broadcast server:restarting:", error);
  }

  return new Promise((resolve) => {
    const forceExit = setTimeout(() => {
      console.error("Forced exit after shutdown timeout");
      if (shouldExit) process.exit(1);
      else resolve({ ok: false, payload, reason: "timeout", timedOutWaiting, handsDone });
    }, 8000);
    forceExit.unref?.();

    const finish = () => {
      clearTimeout(forceExit);
      if (shouldExit) process.exit(0);
      else resolve({ ok: true, payload, timedOutWaiting, handsDone });
    };

    // Yield so server:restarting can flush before sockets are torn down.
    setImmediate(() => {
      try {
        api.io.close(() => {
          api.server.close(finish);
        });
      } catch (error) {
        console.error("Error during socket/http close:", error);
        finish();
      }
    });
  });
}

function resetShutdownState() {
  api.shuttingDown = false;
  api.holdNewHands = false;
  api.suppressPersistence = false;
  clearHandoffWaiters();
  api.lastHandoffMeta = null;
  api.handoffWaitStartedAtMs = 0;
  if (typeof api.unsubscribeHandoff === "function") {
    try {
      const result = api.unsubscribeHandoff();
      if (result && typeof result.then === "function") result.catch(() => {});
    } catch {
      // ignore
    }
  }
  api.unsubscribeHandoff = null;
}

Object.assign(api, {
  clearHandoffWaiters,
  isRelevantHandoffMeta,
  completeHandoffTakeover,
  maybeTakeoverFromHandoffKey,
  setupHandoffSubscription,
  notifyDeployWaiting,
  gracefulShutdown,
  resetShutdownState,
});

module.exports = {
  clearHandoffWaiters,
  isRelevantHandoffMeta,
  completeHandoffTakeover,
  maybeTakeoverFromHandoffKey,
  setupHandoffSubscription,
  notifyDeployWaiting,
  gracefulShutdown,
  resetShutdownState,
};
