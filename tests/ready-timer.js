const assert = require("node:assert/strict");
const engine = require("../shared/engine");
const {
  READY_TIMER_MS,
  SHOT_CLOCK_DEFAULT_MS,
  clearReadyTimer,
  clearTurnTimer,
  emitRoom,
  resetShotClockTime,
  restoreRoom,
  rooms,
  scheduleReadyTimer,
  serializeRoom,
  serializeRoomForStorage,
  setRoomShotClock,
  setShotClockTime,
} = require("../server");

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

{
  installFakeClock();
  const room = makeReadyRoom();
  scheduleReadyTimer(room);
  assert.equal(room.readyEndsAt, fakeNow + READY_TIMER_MS);
  const view = serializeRoom(room, "alice");
  assert.equal(view.readyEndsAt, room.readyEndsAt);
  assert.equal(view.readyTimeLimitMs, READY_TIMER_MS);
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
  assert.ok(["preflop", "flop", "turn", "river"].includes(room.phase), "hand starts with ready + bot");
  assert.equal(room.readyEndsAt, null, "deadline clears at hand start");
  assert.ok(!room.players[1].hand.length, "sat-out player is not dealt");
  assert.ok(room.players[0].hand.length === 2, "ready player is dealt");
  assert.ok(room.players[2].hand.length === 2, "bot is dealt");
  assert.notEqual(deadline, null);
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // Sit back in rejoins for the next ready cycle.
  installFakeClock();
  const room = makeReadyRoom({ phase: "lobby" });
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
  // Shot clock Off disables the ready timer; Ready still works manually.
  installFakeClock();
  const room = makeReadyRoom({ phase: "lobby" });
  const off = setRoomShotClock(room, 0);
  assert.equal(off.ok, true);
  scheduleReadyTimer(room);
  assert.equal(room.readyEndsAt, null);
  assert.equal(serializeRoom(room, "alice").readyEndsAt, null);

  room.players[0].ready = true;
  room.players[1].ready = true;
  engine.maybeStartReadyHand(room);
  assert.equal(room.phase, "preflop", "manual ready still starts when clock is Off");
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // Fewer than 2 eligible after timeout: keep waiting (no hand start).
  installFakeClock();
  const room = makeReadyRoom({ phase: "lobby" });
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
  const room = makeReadyRoom({ phase: "lobby" });
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
