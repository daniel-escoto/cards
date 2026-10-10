const assert = require("node:assert/strict");
const engine = require("../dist/shared/engine.node");
const {
  READY_TIMER_DEFAULT_MS,
  READY_TIMER_MAX_MS,
  READY_TIMER_MIN_MS,
  READY_TIMER_MS,
  READY_TIMER_OPTIONS_MS,
  SHOT_CLOCK_DEFAULT_MS,
  clearReadyTimer,
  clearTurnTimer,
  emitRoom,
  normalizeReadyTimerMs,
  resetShotClockTime,
  restoreRoom,
  rooms,
  scheduleReadyTimer,
  serializeRoom,
  serializeRoomForStorage,
  setRoomReadyTimer,
  setRoomShotClock,
  setShotClockTime,
} = require("../dist/server");

engine.setRandomInt(() => 0);

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

function advance(ms) {
  fakeNow += ms;
  const due = pendingTimers.filter((timer) => !timer.cleared && timer.at <= fakeNow);
  for (const timer of due) {
    timer.cleared = true;
    timer.fn();
  }
}

function cleanupRoom(room) {
  if (!room) return;
  clearTimeout(room.botTimer);
  clearTimeout(room.showdownTimer);
  clearTurnTimer(room);
  clearReadyTimer(room);
  rooms.delete(room.id);
}

function makeReadyRoom({
  id = "READY1",
  phase = "complete",
  turnTimeLimitMs = SHOT_CLOCK_DEFAULT_MS,
  readyTimeLimitMs = READY_TIMER_DEFAULT_MS,
  withBot = false,
} = {}) {
  const room = {
    id,
    hostId: "alice",
    tableSize: 0,
    status: phase === "lobby" ? "lobby" : "complete",
    phase,
    deck: engine.makeDeck(),
    community: [],
    dealer: 0,
    turn: null,
    currentBet: 0,
    minRaise: 20,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(),
    message: "Ready timer test.",
    winners: [],
    actionLog: [],
    handNumber: phase === "lobby" ? 0 : 1,
    moneyMode: false,
    buyInCents: 0,
    baseSmallBlind: 10,
    baseBigBlind: 20,
    settlements: [],
    moneyLedger: [],
    turnTimeLimitMs,
    readyTimeLimitMs,
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
        id: "alice",
        name: "Alice",
        color: "#4ade80",
        stack: 1000,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        showCards: false,
        ready: false,
        connected: true,
        isBot: false,
        sittingOut: false,
        socketIds: new Set(["sock-alice"]),
        buyInsCents: 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
        disconnectExpiresAt: null,
        disconnectTimer: null,
      },
      {
        id: "bob",
        name: "Bob",
        color: "#60a5fa",
        stack: 1000,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        showCards: false,
        ready: false,
        connected: true,
        isBot: false,
        sittingOut: false,
        socketIds: new Set(["sock-bob"]),
        buyInsCents: 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
        disconnectExpiresAt: null,
        disconnectTimer: null,
      },
    ],
  };
  if (withBot) {
    room.players.push({
      id: "bot:READY1:1",
      name: "CPU 1",
      color: null,
      stack: 1000,
      hand: [],
      folded: false,
      allIn: false,
      bet: 0,
      invested: 0,
      showCards: false,
      ready: false,
      connected: true,
      isBot: true,
      sittingOut: false,
      socketIds: new Set(),
      buyInsCents: 0,
      cashOutCents: 0,
      preflopShoveStreak: 0,
      disconnectExpiresAt: null,
      disconnectTimer: null,
    });
  }
  rooms.set(room.id, room);
  return room;
}

assert.equal(READY_TIMER_MS, 20000);
assert.equal(READY_TIMER_DEFAULT_MS, 20000);
assert.equal(READY_TIMER_MIN_MS, 5000);
assert.equal(READY_TIMER_MAX_MS, 300000);
assert.deepEqual([...READY_TIMER_OPTIONS_MS], [0, 10000, 20000, 30000, 60000]);

assert.equal(normalizeReadyTimerMs(10000), 10000);
assert.equal(normalizeReadyTimerMs(20000), 20000);
assert.equal(normalizeReadyTimerMs(30000), 30000);
assert.equal(normalizeReadyTimerMs(60000), 60000);
assert.equal(normalizeReadyTimerMs(0), 0);
assert.equal(normalizeReadyTimerMs(45000), 45000);
assert.equal(normalizeReadyTimerMs(4000), READY_TIMER_DEFAULT_MS);
assert.equal(normalizeReadyTimerMs(301000), READY_TIMER_DEFAULT_MS);
assert.equal(normalizeReadyTimerMs("abc"), READY_TIMER_DEFAULT_MS);

{
  installFakeClock();
  const room = makeReadyRoom();
  scheduleReadyTimer(room);
  assert.equal(room.readyEndsAt, fakeNow + READY_TIMER_MS);
  const view = serializeRoom(room, "alice");
  assert.equal(view.readyEndsAt, room.readyEndsAt);
  assert.equal(view.readyTimeLimitMs, READY_TIMER_MS);
  assert.equal(view.canChangeReadyTimer, true);
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // Timeout sits out non-ready humans; ready players + bot start the next hand.
  installFakeClock();
  const room = makeReadyRoom({ withBot: true });
  room.players[0].ready = true; // Alice ready
  // Bob not ready; bot never sits out
  scheduleReadyTimer(room);
  const deadline = room.readyEndsAt;
  advance(READY_TIMER_MS);
  assert.equal(room.players[0].sittingOut, false);
  assert.equal(room.players[0].ready, false); // cleared at hand start
  assert.equal(room.players[1].sittingOut, true, "non-ready human sits out");
  assert.equal(room.players[1].stack, 1000, "sit-out keeps stack");
  assert.equal(room.players[2].sittingOut, false, "bots are never sat out");
  assert.ok(
    ["preflop", "flop", "turn", "river"].includes(room.phase),
    "hand starts with ready + bot",
  );
  assert.equal(room.readyEndsAt, null, "deadline clears at hand start");
  assert.ok(!room.players[1].hand.length, "sat-out player is not dealt");
  assert.ok(room.players[0].hand.length === 2, "ready player is dealt");
  assert.ok(room.players[2].hand.length === 2, "bot is dealt");
  assert.notEqual(deadline, null);
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // First-deal lobby (handNumber 0) does not arm the ready timer.
  installFakeClock();
  const firstLobby = makeReadyRoom({ phase: "lobby" });
  firstLobby.handNumber = 0;
  scheduleReadyTimer(firstLobby);
  assert.equal(firstLobby.readyEndsAt, null, "pre-first-hand lobby stays untimed");
  cleanupRoom(firstLobby);
  resetShotClockTime();
}

{
  // Sit back in rejoins for the next ready cycle.
  installFakeClock();
  const room = makeReadyRoom({ phase: "complete" });
  room.players[1].sittingOut = true;
  room.players[0].ready = false;
  scheduleReadyTimer(room);
  assert.equal(room.readyEndsAt, null, "need two eligible seats before arming");

  room.players[1].sittingOut = false;
  scheduleReadyTimer(room);
  assert.equal(room.readyEndsAt, fakeNow + READY_TIMER_MS);

  room.players[0].ready = true;
  room.players[1].ready = true;
  engine.maybeStartReadyHand(room);
  assert.equal(room.phase, "preflop");
  assert.ok(room.players.every((player) => !player.sittingOut || player.hand.length === 0));
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // Rejoin / restore must not reset the absolute readyEndsAt.
  installFakeClock();
  const room = makeReadyRoom();
  scheduleReadyTimer(room);
  const deadline = room.readyEndsAt;
  advance(5000);
  assert.equal(room.readyEndsAt, deadline);

  room.players[0].connected = false;
  emitRoom(room);
  assert.equal(room.readyEndsAt, deadline, "disconnect must not reset readyEndsAt");

  room.players[0].connected = true;
  emitRoom(room);
  assert.equal(room.readyEndsAt, deadline, "rejoin must not reset readyEndsAt");

  const raw = serializeRoomForStorage(room);
  assert.equal(raw.readyEndsAt, deadline);
  cleanupRoom(room);

  const restored = restoreRoom(raw);
  rooms.set(restored.id, restored);
  assert.equal(restored.readyEndsAt, deadline);
  scheduleReadyTimer(restored);
  assert.equal(restored.readyEndsAt, deadline, "restore must keep the original readyEndsAt");
  cleanupRoom(restored);
  resetShotClockTime();
}

{
  // Ready-up timer Off disables the ready timer; Ready still works manually.
  installFakeClock();
  const room = makeReadyRoom({ phase: "complete" });
  const off = setRoomReadyTimer(room, 0);
  assert.equal(off.ok, true);
  assert.equal(room.readyTimeLimitMs, 0);
  scheduleReadyTimer(room);
  assert.equal(room.readyEndsAt, null);
  assert.equal(serializeRoom(room, "alice").readyEndsAt, null);
  assert.equal(serializeRoom(room, "alice").readyTimeLimitMs, 0);

  room.players[0].ready = true;
  room.players[1].ready = true;
  engine.maybeStartReadyHand(room);
  assert.equal(room.phase, "preflop", "manual ready still starts when ready timer is Off");
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // Shot clock Off does not disable the ready-up timer (settings are independent).
  installFakeClock();
  const room = makeReadyRoom({ phase: "complete" });
  const shotOff = setRoomShotClock(room, 0);
  assert.equal(shotOff.ok, true);
  assert.equal(room.turnTimeLimitMs, 0);
  scheduleReadyTimer(room);
  assert.equal(
    room.readyEndsAt,
    fakeNow + READY_TIMER_DEFAULT_MS,
    "ready timer still arms when shot clock is Off",
  );
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // Host presets and custom validation for ready-up timer.
  installFakeClock();
  const room = makeReadyRoom({ phase: "complete" });

  assert.equal(setRoomReadyTimer(room, 10).ok, true);
  assert.equal(room.readyTimeLimitMs, 10000);
  assert.equal(room.readyEndsAt, fakeNow + 10000);

  assert.equal(setRoomReadyTimer(room, 30).ok, true);
  assert.equal(room.readyTimeLimitMs, 30000);
  assert.equal(room.readyEndsAt, fakeNow + 30000);

  assert.equal(setRoomReadyTimer(room, 60).ok, true);
  assert.equal(room.readyTimeLimitMs, 60000);

  assert.equal(setRoomReadyTimer(room, 20).ok, true);
  assert.equal(room.readyTimeLimitMs, 20000);

  assert.equal(setRoomReadyTimer(room, 45).ok, true, "custom mid-range allowed");
  assert.equal(room.readyTimeLimitMs, 45000);

  assert.equal(setRoomReadyTimer(room, 5).ok, true, "custom min allowed");
  assert.equal(room.readyTimeLimitMs, 5000);
  assert.equal(setRoomReadyTimer(room, 300).ok, true, "custom max allowed");
  assert.equal(room.readyTimeLimitMs, 300000);

  const tooLow = setRoomReadyTimer(room, 4);
  assert.equal(tooLow.ok, false);
  assert.match(tooLow.error, /5 to 300/);
  assert.equal(room.readyTimeLimitMs, 300000, "invalid value leaves prior setting");

  const tooHigh = setRoomReadyTimer(room, 301);
  assert.equal(tooHigh.ok, false);
  assert.match(tooHigh.error, /5 to 300/);

  const nonNumeric = setRoomReadyTimer(room, "abc");
  assert.equal(nonNumeric.ok, false);

  const fractional = setRoomReadyTimer(room, 20.5);
  assert.equal(fractional.ok, false);

  cleanupRoom(room);
  resetShotClockTime();
}

{
  // readyTimeLimitMs persists through rooms.json restore.
  installFakeClock();
  const room = makeReadyRoom({ id: "READYPERSIST", readyTimeLimitMs: 45000 });
  scheduleReadyTimer(room);
  const deadline = room.readyEndsAt;
  const raw = serializeRoomForStorage(room);
  assert.equal(raw.readyTimeLimitMs, 45000);
  assert.equal(raw.readyEndsAt, deadline);
  cleanupRoom(room);

  const restored = restoreRoom(raw);
  rooms.set(restored.id, restored);
  assert.equal(restored.readyTimeLimitMs, 45000);
  assert.equal(restored.readyEndsAt, deadline);
  scheduleReadyTimer(restored);
  assert.equal(restored.readyEndsAt, deadline, "restore keeps readyEndsAt and readyTimeLimitMs");
  assert.equal(serializeRoom(restored, "alice").readyTimeLimitMs, 45000);
  cleanupRoom(restored);
  resetShotClockTime();
}

{
  // Fewer than 2 eligible after timeout: keep waiting (no hand start).
  installFakeClock();
  const room = makeReadyRoom({ phase: "lobby" });
  room.handNumber = 2; // post-hand lobby (e.g. after host end / restart edge)
  // Neither readies; both sit out → only 0 eligible
  scheduleReadyTimer(room);
  advance(READY_TIMER_MS);
  assert.equal(room.players[0].sittingOut, true);
  assert.equal(room.players[1].sittingOut, true);
  assert.equal(room.phase, "lobby");
  assert.equal(room.readyEndsAt, null);
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // Everyone readies early → start immediately; deadline clears.
  installFakeClock();
  const room = makeReadyRoom({ phase: "complete" });
  scheduleReadyTimer(room);
  assert.ok(room.readyEndsAt);
  room.players[0].ready = true;
  room.players[1].ready = true;
  engine.maybeStartReadyHand(room);
  emitRoom(room);
  assert.equal(room.phase, "preflop");
  assert.equal(room.readyEndsAt, null);
  cleanupRoom(room);
  resetShotClockTime();
}

console.log("Ready timer checks passed.");
