const assert = require("node:assert/strict");
const engine = require("../shared/engine");
const {
  SHOT_CLOCK_DEFAULT_MS,
  SHOT_CLOCK_OPTIONS_MS,
  autoTurnAction,
  clearTurnTimer,
  emitRoom,
  normalizeShotClockMs,
  resetShotClockTime,
  rooms,
  scheduleHumanTurnTimer,
  setRoomShotClock,
  setShotClockTime,
  serializeRoom,
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
  clearTurnTimer(room);
  rooms.delete(room.id);
}

function makeHandRoom({
  id = "CLOCK1",
  currentBet = 0,
  heroBet = 0,
  phase = "flop",
  turnTimeLimitMs = SHOT_CLOCK_DEFAULT_MS,
} = {}) {
  const room = {
    id,
    hostId: "hero",
    tableSize: 0,
    status: "playing",
    phase,
    deck: [],
    community: phase === "flop" ? ["Ah", "Kd", "7c"] : [],
    dealer: 1,
    turn: "hero",
    currentBet,
    minRaise: 20,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(["hero", "villain"]),
    message: "Shot clock test hand.",
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
    turnTimer: null,
    turnEndsAt: null,
    turnTimerPlayerId: null,
    botTimer: null,
    showdownTimer: null,
    dormantTimer: null,
    dormantSince: null,
    players: [
      {
        id: "hero",
        name: "Hero",
        color: "#4ade80",
        stack: 980,
        hand: ["As", "Qs"],
        folded: false,
        allIn: false,
        bet: heroBet,
        invested: heroBet,
        showCards: false,
        ready: false,
        connected: true,
        isBot: false,
        sittingOut: false,
        socketIds: new Set(),
        buyInsCents: 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
        disconnectExpiresAt: null,
        disconnectTimer: null,
      },
      {
        id: "villain",
        name: "Villain",
        color: "#60a5fa",
        stack: 980,
        hand: ["2c", "2d"],
        folded: false,
        allIn: false,
        bet: currentBet,
        invested: currentBet,
        showCards: false,
        ready: false,
        connected: true,
        isBot: false,
        sittingOut: false,
        socketIds: new Set(),
        buyInsCents: 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
        disconnectExpiresAt: null,
        disconnectTimer: null,
      },
    ],
  };
  rooms.set(room.id, room);
  return room;
}

assert.deepEqual(SHOT_CLOCK_OPTIONS_MS, [0, 15000, 30000, 60000]);
assert.equal(SHOT_CLOCK_DEFAULT_MS, 30000);
assert.equal(normalizeShotClockMs(15000), 15000);
assert.equal(normalizeShotClockMs(0), 0);
assert.equal(normalizeShotClockMs(12345), SHOT_CLOCK_DEFAULT_MS);

assert.deepEqual(autoTurnAction({ currentBet: 0 }, { bet: 0 }), { type: "check" });
assert.deepEqual(autoTurnAction({ currentBet: 40 }, { bet: 40 }), { type: "check" });
assert.deepEqual(autoTurnAction({ currentBet: 40 }, { bet: 20 }), { type: "fold" });

{
  installFakeClock();
  const room = makeHandRoom({ id: "CHK001", currentBet: 0, heroBet: 0 });
  scheduleHumanTurnTimer(room);
  assert.equal(room.turnEndsAt, fakeNow + 30000);
  assert.ok(room.turnTimer);
  const view = serializeRoom(room, "hero");
  assert.equal(view.turnEndsAt, room.turnEndsAt);
  assert.equal(view.turnTimeLimitMs, 30000);

  advance(30000);
  const hero = room.players.find((player) => player.id === "hero");
  assert.equal(hero.folded, false);
  assert.notEqual(room.turn, "hero");
  assert.match(room.message, /checks/i);
  cleanupRoom(room);
  resetShotClockTime();
}

{
  installFakeClock();
  const room = makeHandRoom({ id: "FLD001", currentBet: 40, heroBet: 0 });
  scheduleHumanTurnTimer(room);
  advance(30000);
  const hero = room.players.find((player) => player.id === "hero");
  assert.equal(hero.folded, true);
  assert.match(room.message, /folds|wins/i);
  cleanupRoom(room);
  resetShotClockTime();
}

{
  installFakeClock();
  const room = makeHandRoom({ id: "RST001", currentBet: 0, heroBet: 0 });
  scheduleHumanTurnTimer(room);
  const firstDeadline = room.turnEndsAt;
  advance(5000);
  const result = engine.applyPlayerAction(room, "hero", { type: "check" });
  assert.equal(result.ok, true);
  emitRoom(room);
  assert.equal(room.turn, "villain");
  assert.ok(room.turnEndsAt > firstDeadline);
  assert.equal(room.turnEndsAt, fakeNow + 30000);
  assert.equal(room.turnTimerPlayerId, "villain");
  cleanupRoom(room);
  resetShotClockTime();
}

{
  installFakeClock();
  const room = makeHandRoom({ id: "OFF001", turnTimeLimitMs: 30000 });
  const off = setRoomShotClock(room, 0);
  assert.equal(off.ok, true);
  assert.equal(room.turnTimeLimitMs, 0);
  scheduleHumanTurnTimer(room);
  assert.equal(room.turnEndsAt, null);
  assert.equal(room.turnTimer, null);
  const view = serializeRoom(room, "hero");
  assert.equal(view.turnEndsAt, null);
  assert.equal(view.turnTimeLimitMs, 0);
  advance(60000);
  assert.equal(room.players[0].folded, false);
  assert.equal(room.turn, "hero");
  cleanupRoom(room);
  resetShotClockTime();
}

{
  // Bots never arm the human shot clock.
  installFakeClock();
  const room = makeHandRoom({ id: "BOT001" });
  room.players[0].isBot = true;
  room.turn = "hero";
  scheduleHumanTurnTimer(room);
  assert.equal(room.turnEndsAt, null);
  cleanupRoom(room);
  resetShotClockTime();
}

console.log("Turn shot-clock checks passed.");
