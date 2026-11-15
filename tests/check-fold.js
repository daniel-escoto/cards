#!/usr/bin/env node
/**
 * Check/Fold pre-action: arm → auto-check when free, auto-fold when facing a bet,
 * disarm when toCall rises, disarm at hand end.
 */
const assert = require("node:assert/strict");
const {
  LABEL,
  createSession,
  disarm,
  arm,
  toggle,
  shouldOffer,
  sync,
  resolveArmedAction,
} = require("../dist/public/check-fold.js");

assert.equal(LABEL, "Check/Fold");

const hero = { folded: false, allIn: false, cards: [{ code: "As" }, { code: "Kd" }] };

// --- resolveArmedAction ---
assert.equal(resolveArmedAction(0), "check");
assert.equal(resolveArmedAction(null), "check");
assert.equal(resolveArmedAction(20), "fold");
assert.equal(resolveArmedAction(1), "fold");

// --- shouldOffer ---
assert.equal(
  shouldOffer({ isYourTurn: false, phase: "flop", hero }),
  true,
  "off-turn live hero",
);
assert.equal(shouldOffer({ isYourTurn: true, phase: "flop", hero }), false, "not on your turn");
assert.equal(
  shouldOffer({ isYourTurn: false, phase: "lobby", hero }),
  false,
  "not between hands",
);
assert.equal(
  shouldOffer({ isYourTurn: false, phase: "flop", hero: { ...hero, folded: true } }),
  false,
);
assert.equal(
  shouldOffer({ isYourTurn: false, phase: "flop", hero: { ...hero, allIn: true } }),
  false,
);

// --- arm / toggle ---
{
  const session = createSession();
  assert.equal(session.armed, false);
  assert.equal(toggle(session, 0, 3), true);
  assert.equal(session.armed, true);
  assert.equal(session.armedToCall, 0);
  assert.equal(session.handNumber, 3);
  assert.equal(toggle(session, 0, 3), false, "second tap disarms");
  assert.equal(session.armed, false);
}

// --- armed → check when free ---
{
  const session = createSession();
  arm(session, 0, 1);
  const action = sync(session, {
    isYourTurn: true,
    phase: "flop",
    toCall: 0,
    handNumber: 1,
    hero,
  });
  assert.deepEqual(action, { type: "check" });
  assert.equal(session.armed, false, "disarmed after auto-check");
}

// --- armed → fold when facing a bet ---
{
  const session = createSession();
  arm(session, 20, 2);
  const action = sync(session, {
    isYourTurn: true,
    phase: "preflop",
    toCall: 20,
    handNumber: 2,
    hero,
  });
  assert.deepEqual(action, { type: "fold" });
  assert.equal(session.armed, false, "disarmed after auto-fold");
}

// --- disarm when toCall increases (raise before hero acts) ---
{
  const session = createSession();
  arm(session, 20, 4);
  const action = sync(session, {
    isYourTurn: false,
    phase: "preflop",
    toCall: 60,
    handNumber: 4,
    hero,
  });
  assert.equal(action, null);
  assert.equal(session.armed, false, "disarmed on raise");
}

// --- toCall staying the same keeps arm ---
{
  const session = createSession();
  arm(session, 40, 5);
  const action = sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 40,
    handNumber: 5,
    hero,
  });
  assert.equal(action, null);
  assert.equal(session.armed, true);
  assert.equal(session.armedToCall, 40);
}

// --- arm at 0, bet before turn → disarm (not auto-fold) ---
{
  const session = createSession();
  arm(session, 0, 6);
  const action = sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 40,
    handNumber: 6,
    hero,
  });
  assert.equal(action, null);
  assert.equal(session.armed, false, "bet while armed at free check disarms");
}

// --- disarm at hand end ---
{
  const session = createSession();
  arm(session, 20, 7);
  const action = sync(session, {
    isYourTurn: false,
    phase: "complete",
    toCall: 0,
    handNumber: 7,
    hero,
  });
  assert.equal(action, null);
  assert.equal(session.armed, false, "disarmed at hand end");
}

{
  const session = createSession();
  arm(session, 0, 8);
  sync(session, {
    isYourTurn: false,
    phase: "lobby",
    toCall: 0,
    handNumber: 8,
    hero,
  });
  assert.equal(session.armed, false, "disarmed in lobby");
}

// --- disarm on new hand number ---
{
  const session = createSession();
  arm(session, 20, 9);
  sync(session, {
    isYourTurn: false,
    phase: "preflop",
    toCall: 20,
    handNumber: 10,
    hero,
  });
  assert.equal(session.armed, false, "disarmed when hand number advances");
}

// --- disarm when hero folds / all-in ---
{
  const session = createSession();
  arm(session, 20, 11);
  sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 20,
    handNumber: 11,
    hero: { ...hero, folded: true },
  });
  assert.equal(session.armed, false);
}

{
  const session = createSession();
  arm(session, 0, 12);
  disarm(session);
  assert.equal(session.armed, false);
  assert.equal(session.handNumber, null);
}

console.log("Check/Fold pre-action tests passed.");
