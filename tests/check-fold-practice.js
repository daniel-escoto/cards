#!/usr/bin/env node
/**
 * Check/Fold × offline Practice engine: armed stays through an opponent raise,
 * then folds on the hero's turn; stays armed across a street change; disarms
 * when the next hand deals.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPracticeSession } = require("../dist/public/practice");
const CheckFold = require("../dist/public/check-fold");
const engine = require("../dist/shared/engine.node.js");

function syncFromRoom(session, room) {
  const hero = room.players.find((player) => player.isYou && !player.isBot) || null;
  return CheckFold.sync(session, {
    isYourTurn: room.isYourTurn,
    phase: room.phase,
    toCall: room.toCall,
    handNumber: room.handNumber,
    hero,
  });
}

function finishHandQuickly(practice) {
  const room = practice.getRoom();
  let guard = 0;
  while (engine.isHandInProgress(room) && room.phase !== "complete" && guard++ < 40) {
    if (room.phase === "showdown") {
      engine.settleShowdown(room);
      break;
    }
    const actor = room.players.find((player) => player.id === room.turn);
    if (!actor) break;
    const toCall = Math.max(0, room.currentBet - actor.bet);
    if (actor.isBot) {
      engine.applyPlayerAction(room, actor.id, { type: "fold" });
    } else {
      engine.applyPlayerAction(room, actor.id, { type: toCall > 0 ? "fold" : "check" });
    }
  }
  practice.publish();
}

function reachHeroAsBigBlind(practice) {
  for (let hand = 0; hand < 8; hand += 1) {
    practice.handle("game:ready", { ready: true });
    const snap = practice.snapshot();
    const hero = snap.players.find((player) => player.isYou);
    if (hero?.isBigBlind && !snap.isYourTurn && snap.phase === "preflop") {
      return snap;
    }
    finishHandQuickly(practice);
  }
  throw new Error("Could not seat hero as BB off-turn");
}

// Guard: no leftover disarm-on-raise comparison in source or build.
{
  const src = fs.readFileSync(path.join(__dirname, "../public/check-fold.ts"), "utf8");
  const built = fs.readFileSync(path.join(__dirname, "../dist/public/check-fold.js"), "utf8");
  assert.doesNotMatch(src, /toCall\s*>\s*session\.armedToCall/);
  assert.doesNotMatch(built, /toCall\s*>\s*session\.armedToCall/);
  assert.match(src, /stay armed across raises/i);
}

// (1) armed → opponent raises → still armed → hero folds on their turn
{
  const practice = createPracticeSession({
    name: "Hero",
    botCount: 2,
    cpuDelayMs: 999999,
    onUpdate: () => {},
  });
  try {
    const room0 = reachHeroAsBigBlind(practice);
    const session = CheckFold.createSession();
    CheckFold.arm(session, room0.toCall, room0.handNumber);
    assert.equal(session.armed, true);

    const live = practice.getRoom();
    const raiser = live.players.find((player) => player.id === live.turn);
    assert.ok(raiser?.isBot, "first actor should be a bot");
    const minRaiseTo = live.currentBet + live.minRaise;
    const raised = engine.applyPlayerAction(live, raiser.id, { type: "raise", raiseTo: minRaiseTo });
    assert.equal(raised.ok, true, raised.error || "raise");
    practice.publish();

    let room = practice.snapshot();
    let action = syncFromRoom(session, room);
    assert.equal(action, null, "raise while off-turn must not fire yet");
    assert.equal(session.armed, true, "raise must keep Check/Fold armed");
    assert.ok(room.toCall > 0, "hero now faces a bet");

    let guard = 0;
    let turnAction = null;
    while (!room.isYourTurn && engine.isHandInProgress(practice.getRoom()) && guard++ < 12) {
      const current = practice.getRoom();
      const actor = current.players.find((player) => player.id === current.turn);
      if (!actor || actor.isYou) break;
      const toCall = Math.max(0, current.currentBet - actor.bet);
      engine.applyPlayerAction(current, actor.id, { type: toCall > 0 ? "fold" : "check" });
      practice.publish();
      room = practice.snapshot();
      // Sync once per update (same as applyRoomUpdate). Capture the on-turn fire here.
      action = syncFromRoom(session, room);
      assert.equal(session.armed, true, "arm holds while others act after the raise");
      if (room.isYourTurn) {
        turnAction = action;
        break;
      }
      assert.equal(action, null, "must not fire while still off-turn");
    }

    assert.equal(room.isYourTurn, true, "hero should be to act facing the raise");
    assert.ok(
      turnAction && turnAction.type === "fold",
      `expected fold on turn, got ${JSON.stringify(turnAction)}`,
    );
    assert.equal(session.armed, true, "stays armed after auto-fold");
    console.log("case 1: armed → raise → still armed → fold on turn — OK");
  } finally {
    practice.dispose();
  }
}

// (2) armed across a street change; disarmed when the next hand deals
{
  const practice = createPracticeSession({
    name: "Hero",
    botCount: 2,
    cpuDelayMs: 999999,
    onUpdate: () => {},
  });
  try {
    practice.handle("game:ready", { ready: true });
    let room = practice.snapshot();
    const session = CheckFold.createSession();
    CheckFold.arm(session, room.toCall, room.handNumber);

    // Drive to flop with everyone checking/calling as needed, keeping the arm.
    const live = practice.getRoom();
    let guard = 0;
    while (live.phase === "preflop" && guard++ < 20) {
      const actor = live.players.find((player) => player.id === live.turn);
      if (!actor) break;
      const toCall = Math.max(0, live.currentBet - actor.bet);
      if (actor.isYou) {
        room = practice.snapshot();
        const fired = syncFromRoom(session, room);
        if (fired) {
          engine.applyPlayerAction(live, actor.id, fired);
        } else {
          engine.applyPlayerAction(live, actor.id, { type: toCall > 0 ? "call" : "check" });
        }
      } else {
        engine.applyPlayerAction(live, actor.id, { type: toCall > 0 ? "call" : "check" });
      }
      practice.publish();
      room = practice.snapshot();
      syncFromRoom(session, room);
      assert.equal(session.armed, true, "arm holds through preflop action");
    }

    assert.ok(
      ["flop", "turn", "river", "showdown", "complete"].includes(room.phase),
      `expected postflop or later, got ${room.phase}`,
    );
    syncFromRoom(session, room);
    assert.equal(session.armed, true, "arm holds across street change");

    finishHandQuickly(practice);
    room = practice.snapshot();
    syncFromRoom(session, room);
    assert.equal(session.armed, true, "arm holds between hands");

    const priorHand = room.handNumber;
    practice.handle("game:ready", { ready: true });
    room = practice.snapshot();
    assert.ok(room.handNumber > priorHand, "new hand started");
    const fired = syncFromRoom(session, room);
    assert.equal(session.armed, false, "new deal disarms Check/Fold");
    assert.equal(fired, null, "disarmed session must not auto-act");
    console.log("case 2: armed across street; disarmed on new hand — OK");
  } finally {
    practice.dispose();
  }
}

console.log("Check/Fold Practice integration tests passed.");
