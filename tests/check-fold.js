#!/usr/bin/env node
/**
 * Check/Fold pre-action: stays armed across raises, streets, and hands until
 * the player turns it off. Auto-check when free, otherwise auto-fold.
 * Hard-clears on sit-out, bust, leave (showWelcome), or game end.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  LABEL,
  createSession,
  arm,
  toggle,
  shouldOffer,
  sync,
  resolveArmedAction,
  disarm,
} = require("../dist/public/check-fold.js");

assert.equal(LABEL, "Check/Fold");

const hero = {
  folded: false,
  allIn: false,
  sittingOut: false,
  stack: 1000,
  cards: [{ code: "As" }, { code: "Kd" }],
};
const results = [];

function caseResult(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  assert.ok(ok, `case ${id}: ${title} — ${detail}`);
}

assert.equal(resolveArmedAction(0), "check");
assert.equal(resolveArmedAction(20), "fold");

assert.equal(shouldOffer({ isYourTurn: false, phase: "flop", hero }), true);
assert.equal(shouldOffer({ isYourTurn: true, phase: "flop", hero }), false);
assert.equal(shouldOffer({ isYourTurn: false, phase: "lobby", hero }), false);

{
  const session = createSession();
  assert.equal(session.armed, false);
  assert.equal(session.readyToFire, true);
  assert.equal(toggle(session, 0, 3), true);
  assert.equal(session.armed, true);
  assert.equal(toggle(session, 0, 3), false);
  assert.equal(session.armed, false);
}

// (1) Raise that increases toCall keeps the arm — folds when turn arrives
{
  const session = createSession();
  arm(session, 0, 1);
  // Opponent raise while still off-turn: must NOT disarm (legacy bug).
  let action = sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 40,
    handNumber: 1,
    hero,
  });
  const stayed = action === null && session.armed === true;
  assert.equal(session.armed, true, "raise must not disarm Check/Fold");
  assert.equal(action, null, "raise off-turn must not auto-act yet");
  action = sync(session, {
    isYourTurn: true,
    phase: "flop",
    toCall: 40,
    handNumber: 1,
    hero,
  });
  caseResult(
    1,
    "raise keeps arm; auto-folds when facing a bet",
    stayed && action && action.type === "fold" && session.armed === true,
    `action=${JSON.stringify(action)} armed=${session.armed}`,
  );
}

// Source must not reintroduce disarm-on-raise.
{
  const src = fs.readFileSync(path.join(__dirname, "../public/check-fold.ts"), "utf8");
  assert.doesNotMatch(src, /toCall\s*>\s*session\.armedToCall/);
}

// (2) Stay armed across streets; check when free; stay armed after fire
{
  const session = createSession();
  arm(session, 0, 2);
  sync(session, { isYourTurn: false, phase: "turn", toCall: 0, handNumber: 2, hero });
  assert.equal(session.armed, true);
  const action = sync(session, {
    isYourTurn: true,
    phase: "turn",
    toCall: 0,
    handNumber: 2,
    hero,
  });
  caseResult(
    2,
    "stay armed across streets; check when free; remain armed",
    action && action.type === "check" && session.armed === true && session.readyToFire === false,
    `action=${JSON.stringify(action)}`,
  );
}

// (3) Sit-out / bust / gameover hard-clear; folded mid-hand keeps arm
{
  const session = createSession();
  arm(session, 0, 3);
  sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 0,
    handNumber: 3,
    hero: { ...hero, sittingOut: true },
  });
  assert.equal(session.armed, false, "sit-out clears");

  arm(session, 0, 3);
  sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 0,
    handNumber: 3,
    hero: { ...hero, stack: 0, allIn: false },
  });
  assert.equal(session.armed, false, "bust clears");

  arm(session, 0, 3);
  sync(session, {
    isYourTurn: false,
    phase: "gameover",
    toCall: 0,
    handNumber: 3,
    hero,
  });
  assert.equal(session.armed, false, "gameover clears");

  arm(session, 0, 3);
  const action = sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 0,
    handNumber: 3,
    hero: { ...hero, folded: true },
  });
  caseResult(
    3,
    "folded mid-hand keeps arm; sit-out/bust/gameover clear",
    action === null && session.armed === true,
    `armed=${session.armed}`,
  );
}

// (4) Turn-arrival fires at most once
{
  const session = createSession();
  arm(session, 0, 4);
  const first = sync(session, {
    isYourTurn: true,
    phase: "flop",
    toCall: 0,
    handNumber: 4,
    hero,
  });
  const second = sync(session, {
    isYourTurn: true,
    phase: "flop",
    toCall: 0,
    handNumber: 4,
    hero,
  });
  caseResult(
    4,
    "turn-arrival race fires at most once",
    first && first.type === "check" && second === null && session.armed === true,
    `first=${JSON.stringify(first)} second=${JSON.stringify(second)}`,
  );
}

// (5) Refresh: in-memory session only
{
  const stale = createSession();
  arm(stale, 20, 5);
  const fresh = createSession();
  const action = sync(fresh, {
    isYourTurn: true,
    phase: "flop",
    toCall: 20,
    handNumber: 5,
    hero,
  });
  const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
  caseResult(
    5,
    "refresh starts unarmed (no stale fire)",
    action === null &&
      fresh.armed === false &&
      !/localStorage.*checkFold|checkFold.*localStorage/i.test(bootSrc),
    "checkFoldSession is in-memory only",
  );
}

// (6) Leave path disarms via showWelcome
{
  const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
  caseResult(
    6,
    "leave/showWelcome disarms Check/Fold",
    /function showWelcome[\s\S]*?CheckFold\.disarm\(checkFoldSession\)/.test(bootSrc),
    "showWelcome clears the arm",
  );
}

// (7) Practice/offline shares sync path
{
  const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
  caseResult(
    7,
    "Practice/offline uses same sync",
    /CheckFold\.sync\(checkFoldSession/.test(bootSrc) && /handoffOnlineToOffline/.test(bootSrc),
    "single checkFoldSession",
  );
}

// (8) Keyboard wiring
{
  const eventsSrc = fs.readFileSync(path.join(__dirname, "../public/app-events.ts"), "utf8");
  caseResult(
    8,
    "F toggles off-turn only when shouldOffer; on-turn Fold emits",
    /CheckFold\.shouldOffer/.test(eventsSrc) &&
      /toggleCheckFoldArmed/.test(eventsSrc) &&
      /emitWithAck\("game:action", \{ type: "fold" \}\)/.test(eventsSrc),
    "see tests/keyboard.js",
  );
}

// (9) New hand keeps arm; fires on next turn
{
  const session = createSession();
  arm(session, 0, 9);
  sync(session, {
    isYourTurn: false,
    phase: "complete",
    toCall: 0,
    handNumber: 9,
    hero: { ...hero, cards: [] },
  });
  assert.equal(session.armed, true, "between hands keeps arm");
  sync(session, {
    isYourTurn: false,
    phase: "preflop",
    toCall: 0,
    handNumber: 10,
    hero,
  });
  const action = sync(session, {
    isYourTurn: true,
    phase: "preflop",
    toCall: 20,
    handNumber: 10,
    hero,
  });
  caseResult(
    9,
    "new hand keeps arm; folds when facing a bet",
    action && action.type === "fold" && session.armed === true,
    `action=${JSON.stringify(action)} hand=${session.handNumber}`,
  );
}

// (10) BB vs limps auto-checks and stays armed
{
  const session = createSession();
  arm(session, 0, 10);
  sync(session, {
    isYourTurn: false,
    phase: "preflop",
    toCall: 0,
    handNumber: 10,
    hero,
  });
  const action = sync(session, {
    isYourTurn: true,
    phase: "preflop",
    toCall: 0,
    handNumber: 10,
    hero,
  });
  caseResult(
    10,
    "BB vs limps auto-checks; stays armed",
    action && action.type === "check" && session.armed === true,
    `action=${JSON.stringify(action)}`,
  );
}

// Manual disarm still works
{
  const session = createSession();
  arm(session, 20, 11);
  disarm(session);
  assert.equal(session.armed, false);
}

console.log("Check/Fold pre-action tests passed.");
for (const r of results) {
  console.log(`  case ${r.id}: ${r.title} — OK (${r.detail})`);
}
