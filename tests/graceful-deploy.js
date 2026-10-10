const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { shouldReloadForNewBuild, isActiveHandPhase } = require("../public/deploy-handoff");

const STATE_PATH = path.join(os.tmpdir(), `cards-graceful-deploy-${process.pid}.json`);
process.env.GAME_STATE_FILE = STATE_PATH;
try {
  fs.unlinkSync(STATE_PATH);
} catch {
  // ignore missing
}

const {
  BUILD_ID,
  READY_TIMER_MS,
  SHOT_CLOCK_DEFAULT_MS,
  STATE_FILE,
  clearReadyTimer,
  clearTurnTimer,
  downtimeMsFromSavedAt,
  extendDeadlinesAfterRestore,
  gracefulShutdown,
  io,
  loadRooms,
  pauseRoomTimers,
  resetShutdownState,
  resetShotClockTime,
  rooms,
  saveRoomsNow,
  scheduleHumanTurnTimer,
  scheduleReadyTimer,
  scheduleSave,
  serializeRoom,
  server,
  setShotClockTime,
} = require("../server");
const { io: clientIo } = require("socket.io-client");

assert.equal(STATE_FILE, STATE_PATH);

let fakeNow = 1_000_000;
const pendingTimers = [];

function installFakeClock() {
  fakeNow = 1_000_000;
  pendingTimers.length = 0;
  setShotClockTime({
    now: () => fakeNow,
    setTimeout(fn, ms) {
      const handle = { fn, at: fakeNow + Math.max(0, Number(ms) || 0), cleared: false };
      pendingTimers.push(handle);
      return handle;
    },
    clearTimeout(handle) {
      if (handle) handle.cleared = true;
    },
  });
}

function cleanupRoom(room) {
  if (!room) return;
  clearTimeout(room.botTimer);
  clearTimeout(room.showdownTimer);
  clearTurnTimer(room);
  clearReadyTimer(room);
  rooms.delete(room.id);
}

function makeHandRoom({
  id = "DEPLOY1",
  phase = "flop",
  turnTimeLimitMs = SHOT_CLOCK_DEFAULT_MS,
} = {}) {
  return {
    id,
    hostId: "hero",
    tableSize: 0,
    status: "playing",
    phase,
    deck: [],
    community: phase === "flop" ? ["Ah", "Kd", "7c"] : [],
    dealer: 1,
    turn: "hero",
    currentBet: 0,
    minRaise: 20,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(["hero", "villain"]),
    message: "Graceful deploy test.",
    winners: [],
    actionLog: [],
    handNumber: 1,
    moneyMode: false,
    buyInCents: 0,
    baseSmallBlind: 10,
    baseBigBlind: 20,
    settlements: [],
    moneyLedger: [],
    turnTimeLimitMs,
    readyTimeLimitMs: READY_TIMER_MS,
    turnTimer: null,
    turnEndsAt: null,
    turnTimerPlayerId: null,
    readyTimer: null,
    readyEndsAt: null,
    botTimer: null,
    showdownTimer: null,
    dormantTimer: null,
    dormantSince: null,
    players: [
      {
        id: "hero",
        reconnectTokenHash: null,
        socketIds: new Set(),
        name: "Hero",
        color: "#4ade80",
        stack: 980,
        hand: ["As", "Kh"],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 20,
        showCards: false,
        ready: false,
        sittingOut: false,
        connected: true,
        isBot: false,
        buyInsCents: 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
        disconnectExpiresAt: null,
        disconnectTimer: null,
      },
      {
        id: "villain",
        reconnectTokenHash: null,
        socketIds: new Set(),
        name: "Villain",
        color: "#60a5fa",
        stack: 980,
        hand: ["Qd", "Jc"],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 20,
        showCards: false,
        ready: false,
        sittingOut: false,
        connected: true,
        isBot: false,
        buyInsCents: 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
        disconnectExpiresAt: null,
        disconnectTimer: null,
      },
    ],
  };
}

function makeReadyRoom({ id = "READYD" } = {}) {
  const room = makeHandRoom({ id, phase: "complete" });
  room.status = "complete";
  room.turn = null;
  room.community = [];
  room.raiseEligible = new Set();
  for (const player of room.players) {
    player.hand = [];
    player.ready = false;
    player.bet = 0;
    player.invested = 0;
  }
  return room;
}

function connectClient(url) {
  const socket = clientIo(url, { transports: ["websocket"], forceNew: true });
  const hello = new Promise((resolve) => {
    socket.once("server:hello", resolve);
  });
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve({ socket, hello }));
    socket.on("connect_error", reject);
  });
}

// --- Pure reload gating ---
{
  assert.equal(isActiveHandPhase("flop"), true);
  assert.equal(isActiveHandPhase("complete"), false);
  assert.equal(shouldReloadForNewBuild({
    clientBuildId: "aaa",
    serverBuildId: "aaa",
    phase: "lobby",
  }), false);
  assert.equal(shouldReloadForNewBuild({
    clientBuildId: "aaa",
    serverBuildId: "bbb",
    phase: "flop",
  }), false, "must not reload mid-hand");
  assert.equal(shouldReloadForNewBuild({
    clientBuildId: "aaa",
    serverBuildId: "bbb",
    phase: "preflop",
  }), false);
  assert.equal(shouldReloadForNewBuild({
    clientBuildId: "aaa",
    serverBuildId: "bbb",
    phase: "showdown",
  }), false);
  assert.equal(shouldReloadForNewBuild({
    clientBuildId: "aaa",
    serverBuildId: "bbb",
    phase: "complete",
  }), true, "reload between hands");
  assert.equal(shouldReloadForNewBuild({
    clientBuildId: "aaa",
    serverBuildId: "bbb",
    phase: "lobby",
  }), true, "reload when not in a hand");
  assert.equal(shouldReloadForNewBuild({
    clientBuildId: null,
    serverBuildId: "bbb",
    phase: "lobby",
  }), false);
}

assert.ok(BUILD_ID);
assert.equal(downtimeMsFromSavedAt(new Date(1_000_000).toISOString(), 1_000_500), 500);
assert.equal(downtimeMsFromSavedAt("not-a-date", 1_000_000), 0);

(async () => {
  // --- Flush bypasses debounce; pause keeps deadlines; restore extends by downtime ---
  {
    installFakeClock();
    const room = makeHandRoom();
    rooms.set(room.id, room);
    scheduleHumanTurnTimer(room);
    assert.ok(room.turnTimer);
    const deadline = room.turnEndsAt;
    assert.equal(deadline, fakeNow + SHOT_CLOCK_DEFAULT_MS);

    scheduleSave();
    pauseRoomTimers(room);
    assert.equal(room.turnTimer, null, "timeout handle cleared on pause");
    assert.equal(room.turnEndsAt, deadline, "absolute deadline kept while paused");

    fakeNow = deadline + 1000;
    const due = pendingTimers.filter((timer) => !timer.cleared && timer.at <= fakeNow);
    assert.equal(due.length, 0, "paused timer must not fire / auto-fold");

    const payload = await saveRoomsNow();
    assert.equal(payload.rooms[0].turnEndsAt, deadline);
    assert.ok(fs.existsSync(STATE_PATH), "saveRoomsNow flushes past debounce");

    rooms.clear();
    const downtimeMs = 5_000;
    const saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    saved.savedAt = new Date(fakeNow).toISOString();
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(saved, null, 2)}\n`);
    fakeNow += downtimeMs;
    await loadRooms();
    const restored = rooms.get(room.id);
    assert.equal(restored.turnEndsAt, deadline + downtimeMs,
      "restore extends turnEndsAt by downtime so remaining time is preserved");
    assert.ok(restored.turnTimer, "timer re-armed after restore");
    cleanupRoom(restored);
    resetShotClockTime();
  }

  {
    installFakeClock();
    const room = makeReadyRoom();
    rooms.set(room.id, room);
    scheduleReadyTimer(room);
    const readyDeadline = room.readyEndsAt;
    assert.equal(readyDeadline, fakeNow + READY_TIMER_MS);
    pauseRoomTimers(room);
    assert.equal(room.readyTimer, null);
    assert.equal(room.readyEndsAt, readyDeadline);

    const downtimeMs = 4_000;
    extendDeadlinesAfterRestore(room, downtimeMs);
    assert.equal(room.readyEndsAt, readyDeadline + downtimeMs);
    cleanupRoom(room);
    resetShotClockTime();
  }

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  // Build id handshake + seat rejoin across save/load (simulated restart).
  const { socket: host, hello } = await connectClient(url);
  const helloPayload = await hello;
  assert.equal(helloPayload.buildId, BUILD_ID);

  const created = await new Promise((resolve) => {
    host.emit("room:create", {
      name: "Alice",
      deviceId: "device-alice-deploy",
      moneyMode: true,
      buyInCents: 2000,
      smallBlindCents: 10,
      bigBlindCents: 20,
    }, resolve);
  });
  assert.equal(created.ok, true);
  const roomId = created.roomId;
  const reconnectToken = created.reconnectToken;
  assert.ok(roomId && reconnectToken);

  const before = serializeRoom(rooms.get(roomId), "device-alice-deploy");
  assert.equal(before.buildId, BUILD_ID);
  assert.equal(before.players.find((player) => player.isYou)?.id, "device-alice-deploy");

  // Simulate deploy: flush state, drop in-memory rooms, restore as a new boot would.
  host.disconnect();
  await saveRoomsNow();
  for (const room of rooms.values()) {
    pauseRoomTimers(room);
    clearTurnTimer(room);
    clearReadyTimer(room);
  }
  rooms.clear();
  await loadRooms();
  assert.ok(rooms.get(roomId), "room restored from rooms.json");

  const { socket: hostAgain } = await connectClient(url);
  const update = new Promise((resolve) => {
    hostAgain.on("room:update", resolve);
  });
  const rejoined = await new Promise((resolve) => {
    hostAgain.emit("room:join", {
      roomId,
      name: "Alice",
      deviceId: "device-alice-deploy",
      reconnectToken,
    }, resolve);
  });
  assert.equal(rejoined.ok, true, "rejoin after restart keeps seat via deviceId");
  const after = await update;
  assert.equal(after.players.find((player) => player.isYou)?.id, "device-alice-deploy");
  assert.equal(after.players.find((player) => player.isYou)?.isHost, true);
  assert.equal(after.buildId, BUILD_ID);
  hostAgain.close();

  // SIGTERM path: pending debounced save + broadcast + flush.
  const { socket: watcher } = await connectClient(url);
  const deployWaiting = new Promise((resolve) => {
    watcher.on("server:deploy-waiting", resolve);
  });
  const restarting = new Promise((resolve) => {
    watcher.on("server:restarting", resolve);
  });
  scheduleSave();
  const shutdownPromise = gracefulShutdown("SIGTERM", { exit: false, handWaitMs: 0 });
  const waitingPayload = await Promise.race([
    deployWaiting,
    new Promise((_, reject) => setTimeout(() => reject(new Error("server:deploy-waiting not received")), 2000)),
  ]);
  assert.equal(waitingPayload.message, "Updating after this hand");
  const restartPayload = await Promise.race([
    restarting,
    new Promise((_, reject) => setTimeout(() => reject(new Error("server:restarting not received")), 2000)),
  ]);
  assert.equal(restartPayload.buildId, BUILD_ID);
  const shutdown = await shutdownPromise;
  assert.equal(shutdown.ok, true);
  assert.ok(fs.existsSync(STATE_PATH));
  assert.ok(JSON.parse(fs.readFileSync(STATE_PATH, "utf8")).rooms.some((item) => item.id === roomId));

  watcher.close();
  console.log("Graceful deploy checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try {
    fs.unlinkSync(STATE_PATH);
  } catch {
    // ignore
  }
  resetShotClockTime();
  resetShutdownState();
  try {
    io.close();
  } catch {
    // already closed by gracefulShutdown
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
