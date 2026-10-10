const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const STATE_PATH = path.join(os.tmpdir(), `cards-redis-deploy-${process.pid}.json`);
process.env.GAME_STATE_FILE = STATE_PATH;
delete process.env.REDIS_URL;
try {
  fs.unlinkSync(STATE_PATH);
} catch {
  // ignore
}

const { createMemoryRedisBacking, createMemoryStateStore } = require("../state-store");
const {
  DEPLOY_HAND_WAIT_MS,
  DEPLOY_HANDOFF_POLL_MS,
  DEPLOY_TAKEOVER_MS,
  STATE_FILE,
  anyHandInProgress,
  completeHandoffTakeover,
  gracefulShutdown,
  handoffPadMs,
  io,
  isHandoffComplete,
  isRelevantHandoffMeta,
  liveRoomIds,
  loadRooms,
  markServerListening,
  markStateRestored,
  maybeTakeoverFromHandoffKey,
  resetShutdownState,
  resetShotClockTime,
  rooms,
  saveRoomsNow,
  serializeRoom,
  server,
  setShotClockTime,
  setStateStore,
  setupHandoffSubscription,
  tryStartReadyHand,
  usingRedis,
  waitForHandsToFinish,
} = require("../server");

assert.equal(STATE_FILE, STATE_PATH);
assert.equal(DEPLOY_HAND_WAIT_MS, 25000);
assert.ok(DEPLOY_TAKEOVER_MS < 30000, "takeover timeout must stay under Railway's ~30s window");
assert.equal(DEPLOY_TAKEOVER_MS, 20000);
assert.equal(DEPLOY_HANDOFF_POLL_MS, 200);
assert.equal(handoffPadMs(null), 0);
assert.equal(handoffPadMs({ flushedAt: new Date(1_000_000).toISOString() }, 1_000_040), 40);
assert.equal(
  isRelevantHandoffMeta(
    {
      at: new Date(1_000_000).toISOString(),
      shutdown: true,
      flushedAt: new Date(1_000_000).toISOString(),
    },
    { waitStartedAtMs: 1_000_010, now: 1_000_100 },
  ),
  true,
  "handoff stamped just before wait start still counts (clock skew)",
);

function makeStoredRoom(id = "REDIS1", phase = "flop") {
  return {
    id,
    hostId: "hero",
    tableSize: 0,
    status: phase === "complete" ? "complete" : "playing",
    phase,
    deck: [],
    community: phase === "flop" ? ["Ah", "Kd", "7c"] : [],
    dealer: 0,
    turn: phase === "complete" ? null : "hero",
    currentBet: 0,
    minRaise: 20,
    deadPot: 0,
    acted: [],
    raiseEligible: phase === "complete" ? [] : ["hero", "villain"],
    message: "Redis deploy test.",
    winners: [],
    actionLog: [],
    handNumber: 1,
    moneyMode: false,
    buyInCents: 2000,
    baseSmallBlind: 10,
    baseBigBlind: 20,
    turnTimeLimitMs: 30000,
    readyTimeLimitMs: 20000,
    turnEndsAt: null,
    turnTimerPlayerId: null,
    readyEndsAt: null,
    settlements: [],
    moneyLedger: [],
    players: [
      {
        id: "hero",
        reconnectTokenHash: null,
        name: "Hero",
        color: "#4ade80",
        stack: 980,
        hand: phase === "complete" ? [] : ["As", "Kh"],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 20,
        showCards: false,
        ready: false,
        sittingOut: false,
        connected: false,
        isBot: false,
        buyInsCents: 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
      },
      {
        id: "villain",
        reconnectTokenHash: null,
        name: "Villain",
        color: "#60a5fa",
        stack: 980,
        hand: phase === "complete" ? [] : ["Qd", "Jc"],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 20,
        showCards: false,
        ready: false,
        sittingOut: false,
        connected: false,
        isBot: false,
        buyInsCents: 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
      },
    ],
  };
}

function makeLiveRoom(id, phase) {
  const raw = makeStoredRoom(id, phase);
  return {
    ...raw,
    acted: new Set(raw.acted),
    raiseEligible: new Set(raw.raiseEligible),
    spectators: [],
    botTimer: null,
    showdownTimer: null,
    turnTimer: null,
    readyTimer: null,
    dormantTimer: null,
    dormantSince: null,
    players: raw.players.map((player) => ({
      ...player,
      socketIds: new Set(),
      disconnectTimer: null,
      disconnectExpiresAt: null,
      connected: true,
    })),
  };
}

function httpGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: "127.0.0.1", port, path: urlPath }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      })
      .on("error", reject);
  });
}

function cleanupRooms() {
  for (const room of rooms.values()) {
    clearTimeout(room.botTimer);
    clearTimeout(room.showdownTimer);
    clearTimeout(room.turnTimer);
    clearTimeout(room.readyTimer);
    clearTimeout(room.dormantTimer);
  }
  rooms.clear();
  liveRoomIds.clear();
}

(async () => {
  // --- In-memory Redis store: save / load same shape as file ---
  {
    const backing = createMemoryRedisBacking();
    const store = createMemoryStateStore(backing);
    setStateStore(store);
    assert.equal(usingRedis(), true);
    cleanupRooms();

    const room = makeLiveRoom("SAVE01", "flop");
    rooms.set(room.id, room);
    liveRoomIds.add(room.id);
    const payload = await saveRoomsNow({ all: true });
    assert.equal(payload.version, 1);
    assert.ok(payload.savedAt);
    assert.equal(payload.rooms.length, 1);
    assert.equal(payload.rooms[0].id, "SAVE01");
    assert.deepEqual(payload.rooms[0].community, ["Ah", "Kd", "7c"]);
    assert.equal("spectators" in payload.rooms[0], false);

    cleanupRooms();
    const loaded = await store.load();
    assert.equal(loaded.rooms[0].id, "SAVE01");
    const result = await loadRooms({ activate: false, markLive: false });
    assert.equal(result.ok, true);
    assert.equal(result.restored, 1);
    assert.ok(rooms.get("SAVE01"));
    assert.equal(liveRoomIds.has("SAVE01"), false, "redis boot keeps rooms passive");
    cleanupRooms();
  }

  // --- File → Redis one-time migration ---
  {
    const backing = createMemoryRedisBacking();
    const store = createMemoryStateStore(backing);
    setStateStore(store);
    cleanupRooms();

    const filePayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      buildId: "migrate-test",
      rooms: [makeStoredRoom("MIG001", "turn")],
    };
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(filePayload, null, 2)}\n`);

    assert.equal(await store.load(), null);
    const result = await loadRooms({ activate: false, markLive: false });
    assert.equal(result.ok, true);
    assert.equal(result.migratedFromFile, true);
    assert.ok(rooms.get("MIG001"));
    const redisPayload = await store.load();
    assert.equal(redisPayload.rooms[0].id, "MIG001");
    assert.equal(redisPayload.rooms[0].phase, "turn");

    cleanupRooms();
    const again = await loadRooms({ activate: false, markLive: false });
    assert.equal(again.migratedFromFile, false);
    assert.ok(rooms.get("MIG001"));
    cleanupRooms();
    try {
      fs.unlinkSync(STATE_PATH);
    } catch {
      // ignore
    }
  }

  // --- Redis boot must NOT pad clocks by idle time since last save ---
  {
    const backing = createMemoryRedisBacking();
    setStateStore(createMemoryStateStore(backing));
    cleanupRooms();
    resetShutdownState();

    const deadline = 5_000_000;
    const idleSavedAt = new Date(deadline - 459_235).toISOString();
    const stored = makeStoredRoom("PAD001", "flop");
    stored.turnEndsAt = deadline;
    stored.turnTimerPlayerId = "hero";
    await createMemoryStateStore(backing).save({
      version: 1,
      savedAt: idleSavedAt,
      buildId: "idle",
      rooms: [stored],
    });

    let fakeNow = deadline + 1000;
    setShotClockTime({ now: () => fakeNow });
    const result = await loadRooms({ activate: false, markLive: false });
    assert.equal(result.downtimeMs, 0, "redis boot pad must ignore idle savedAt age");
    assert.equal(
      rooms.get("PAD001").turnEndsAt,
      deadline,
      "turnEndsAt must stay unpadded on redis boot",
    );
    cleanupRooms();
    resetShotClockTime();
    resetShutdownState();
  }

  // --- Handoff pad uses flush marker gap only ---
  {
    const backing = createMemoryRedisBacking();
    setStateStore(createMemoryStateStore(backing));
    cleanupRooms();
    resetShutdownState();

    const deadline = 9_000_000;
    const stored = makeStoredRoom("PAD002", "flop");
    stored.turnEndsAt = deadline;
    stored.turnTimerPlayerId = "hero";
    await createMemoryStateStore(backing).save({
      version: 1,
      savedAt: new Date(deadline - 400_000).toISOString(),
      shutdownFlushedAt: new Date(deadline + 50).toISOString(),
      rooms: [stored],
    });
    await loadRooms({ activate: false, markLive: false });
    assert.equal(rooms.get("PAD002").turnEndsAt, deadline);

    let fakeNow = deadline + 80;
    setShotClockTime({ now: () => fakeNow });
    const flushedAt = new Date(deadline + 50).toISOString();
    const takeover = await completeHandoffTakeover("poll", {
      at: flushedAt,
      flushedAt,
      shutdown: true,
      buildId: "old",
    });
    assert.equal(takeover.ok, true);
    assert.equal(takeover.pad, 30, "pad is now - flushedAt, not idle save age");
    assert.equal(rooms.get("PAD002").turnEndsAt, deadline + 30);
    assert.equal(isHandoffComplete(), true);
    cleanupRooms();
    resetShotClockTime();
    resetShutdownState();
  }

  // --- Handoff via durable key alone (no pub/sub delivery) ---
  {
    const backing = createMemoryRedisBacking();
    const store = createMemoryStateStore(backing);
    setStateStore(store);
    cleanupRooms();
    resetShutdownState();

    await store.save({
      version: 1,
      savedAt: new Date().toISOString(),
      rooms: [makeStoredRoom("KEY01", "flop")],
    });
    await loadRooms({ activate: false, markLive: false });
    assert.equal(rooms.get("KEY01").phase, "flop");
    assert.equal(isHandoffComplete(), false);

    // Start waiters; then write the key without invoking pub/sub handlers.
    await setupHandoffSubscription();
    assert.equal(isHandoffComplete(), false);
    backing.handlers.clear();
    backing.handoff = {
      at: new Date().toISOString(),
      flushedAt: new Date().toISOString(),
      shutdown: true,
      buildId: "old",
    };
    await store.save({
      version: 1,
      savedAt: new Date().toISOString(),
      shutdownFlushedAt: new Date().toISOString(),
      rooms: [makeStoredRoom("KEY01", "complete")],
    });

    const tookOver = await maybeTakeoverFromHandoffKey("poll");
    assert.equal(tookOver, true, "durable handoff key must complete takeover without pub/sub");
    assert.equal(isHandoffComplete(), true);
    assert.equal(rooms.get("KEY01").phase, "complete");
    cleanupRooms();
    resetShutdownState();
  }

  // --- Pub/sub handoff still refreshes non-live rooms ---
  {
    const backing = createMemoryRedisBacking();
    const oldStore = createMemoryStateStore(backing);
    const newStore = createMemoryStateStore(backing);
    setStateStore(newStore);
    cleanupRooms();
    resetShutdownState();

    await oldStore.save({
      version: 1,
      savedAt: new Date().toISOString(),
      rooms: [makeStoredRoom("HAND01", "flop")],
    });
    await loadRooms({ activate: false, markLive: false });
    assert.equal(rooms.get("HAND01").phase, "flop");

    await setupHandoffSubscription();
    await oldStore.save({
      version: 1,
      savedAt: new Date().toISOString(),
      shutdownFlushedAt: new Date().toISOString(),
      rooms: [makeStoredRoom("HAND01", "complete")],
    });
    await oldStore.publishHandoff({
      buildId: "old",
      shutdown: true,
      flushedAt: new Date().toISOString(),
    });
    assert.equal(rooms.get("HAND01").phase, "complete");
    assert.equal(isHandoffComplete(), true);
    cleanupRooms();
    resetShutdownState();
  }

  // --- Preexisting handoff key at boot (stop-then-start) ---
  {
    const backing = createMemoryRedisBacking();
    const store = createMemoryStateStore(backing);
    setStateStore(store);
    cleanupRooms();
    resetShutdownState();

    await store.save({
      version: 1,
      savedAt: new Date().toISOString(),
      shutdownFlushedAt: new Date().toISOString(),
      rooms: [makeStoredRoom("PRE01", "complete")],
    });
    backing.handoff = {
      at: new Date().toISOString(),
      flushedAt: new Date().toISOString(),
      shutdown: true,
      buildId: "previous",
    };
    await loadRooms({ activate: false, markLive: false });
    await setupHandoffSubscription();
    assert.equal(
      isHandoffComplete(),
      true,
      "preexisting shutdown handoff key takes ownership immediately",
    );
    assert.equal(rooms.get("PRE01").phase, "complete");
    cleanupRooms();
    resetShutdownState();
  }

  // --- /healthz before and after restore + listen ---
  markStateRestored(false);
  markServerListening(false);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  let health = await httpGet(port, "/healthz");
  assert.equal(health.status, 503);
  assert.match(health.body, /not ready/);

  markStateRestored(true);
  health = await httpGet(port, "/healthz");
  assert.equal(health.status, 503, "still 503 until listening flag is set");

  markServerListening(true);
  health = await httpGet(port, "/healthz");
  assert.equal(health.status, 200);
  assert.equal(health.body, "ok");

  // --- SIGTERM waits for in-progress hand ---
  {
    const backing = createMemoryRedisBacking();
    setStateStore(createMemoryStateStore(backing));
    cleanupRooms();
    resetShutdownState();

    const room = makeLiveRoom("WAIT01", "flop");
    rooms.set(room.id, room);
    liveRoomIds.add(room.id);
    assert.equal(anyHandInProgress(), true);
    assert.equal(serializeRoom(room, "hero").updatingAfterHand, false);

    let now = 1_000_000;
    const done = await waitForHandsToFinish(1000, {
      now: () => now,
      sleep: async () => {
        now += 50;
        if (now >= 1_000_200) {
          room.phase = "complete";
          room.status = "complete";
          room.turn = null;
        }
      },
    });
    assert.equal(done, true);
    assert.equal(anyHandInProgress(), false);

    room.phase = "flop";
    room.status = "playing";
    room.turn = "hero";
    now = 2_000_000;
    let ticks = 0;
    const result = await gracefulShutdown("SIGTERM", {
      exit: false,
      handWaitMs: 500,
      now: () => now,
      sleep: async () => {
        ticks += 1;
        now += 50;
        if (ticks >= 3) {
          room.phase = "complete";
          room.status = "complete";
          room.turn = null;
        }
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.handsDone, true);
    assert.equal(result.timedOutWaiting, false);
    assert.ok(
      backing.value.rooms.some((item) => item.id === "WAIT01" && item.phase === "complete"),
    );
    resetShutdownState();
  }

  // --- SIGTERM wait cap uses pause/flush path ---
  {
    const backing = createMemoryRedisBacking();
    setStateStore(createMemoryStateStore(backing));
    cleanupRooms();
    resetShutdownState();

    if (!server.listening) {
      await new Promise((resolve) => server.listen(0, resolve));
      markServerListening(true);
    }

    const room = makeLiveRoom("CAP001", "river");
    rooms.set(room.id, room);
    liveRoomIds.add(room.id);

    let now = 3_000_000;
    const result = await gracefulShutdown("SIGTERM", {
      exit: false,
      handWaitMs: 120,
      now: () => now,
      sleep: async () => {
        now += 60;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.handsDone, false);
    assert.equal(result.timedOutWaiting, true);
    assert.ok(result.payload.rooms.some((item) => item.id === "CAP001" && item.phase === "river"));
    resetShutdownState();
  }

  // Direct holdNewHands gate (exported via tryStartReadyHand).
  {
    cleanupRooms();
    resetShutdownState();
    const room = makeLiveRoom("GATE01", "complete");
    room.players[0].ready = true;
    room.players[0].connected = true;
    room.players[1].ready = true;
    room.players[1].connected = true;
    rooms.set(room.id, room);

    // Force hold by running shutdown wait with injectable sleep that never finishes hands,
    // but instead check tryStartReadyHand while hold is active via a custom path:
    // set hold by calling gracefulShutdown with a room that finishes immediately after we
    // observe updatingAfterHand on a parallel tick — simpler: unit-check via shutdown options.
    let sawHold = false;
    let now = 4_000_000;
    const roomInHand = makeLiveRoom("GATE02", "flop");
    rooms.set(roomInHand.id, roomInHand);
    liveRoomIds.add(roomInHand.id);

    const pending = gracefulShutdown("SIGTERM", {
      exit: false,
      handWaitMs: 200,
      now: () => now,
      sleep: async () => {
        if (!sawHold) {
          sawHold = serializeRoom(roomInHand, "hero").updatingAfterHand === true;
          assert.equal(tryStartReadyHand(room), false, "no new hands while draining");
        }
        now += 100;
        roomInHand.phase = "complete";
        roomInHand.status = "complete";
        roomInHand.turn = null;
      },
    });
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(sawHold, true);
    resetShutdownState();
    cleanupRooms();
  }

  console.log("Redis deploy checks passed.");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      fs.unlinkSync(STATE_PATH);
    } catch {
      // ignore
    }
    resetShutdownState();
    markStateRestored(false);
    markServerListening(false);
    cleanupRooms();
    try {
      io.close();
    } catch {
      // ignore
    }
    await new Promise((resolve) => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
    setTimeout(() => process.exit(process.exitCode || 0), 50).unref?.();
  });
