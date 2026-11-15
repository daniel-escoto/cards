#!/usr/bin/env node
/**
 * Check/Fold pre-action: arm → auto-check when free, auto-fold when facing a bet,
 * disarm when toCall rises, disarm at hand end. Covers the Daniel audit cases.
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
} = require("../dist/public/check-fold.js");

assert.equal(LABEL, "Check/Fold");

const hero = { folded: false, allIn: false, sittingOut: false, cards: [{ code: "As" }, { code: "Kd" }] };
const results = [];

function caseResult(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  assert.ok(ok, `case ${id}: ${title} — ${detail}`);
}

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

// ============================================================================
// (1) Limp/call that does not change hero's toCall must NOT disarm
// ============================================================================
{
  const session = createSession();
  arm(session, 20, 1);
  const action = sync(session, {
    isYourTurn: false,
    phase: "preflop",
    toCall: 20,
    handNumber: 1,
    hero,
  });
  caseResult(
    1,
    "limp/call at same toCall keeps arm",
    action === null && session.armed === true && session.armedToCall === 20,
    `armed=${session.armed} action=${JSON.stringify(action)}`,
  );
}

// ============================================================================
// (2) New street: stay armed across streets unless toCall rises
// ============================================================================
{
  const session = createSession();
  arm(session, 0, 2);
  // Flop → turn: bets reset to 0 (not a rise).
  let action = sync(session, {
    isYourTurn: false,
    phase: "turn",
    toCall: 0,
    handNumber: 2,
    hero,
  });
  const stayed = action === null && session.armed === true;
  // Free check on the new street.
  action = sync(session, {
    isYourTurn: true,
    phase: "turn",
    toCall: 0,
    handNumber: 2,
    hero,
  });
  const checked = action && action.type === "check" && session.armed === false;
  caseResult(
    2,
    "stay armed across streets; check when free",
    stayed && checked,
    "documented: armedToCall holds; toCall=0 after street change is not a rise",
  );
}
{
  // Street change then a bet → disarm (toCall rose above armedToCall).
  const session = createSession();
  arm(session, 0, 2);
  sync(session, { isYourTurn: false, phase: "turn", toCall: 0, handNumber: 2, hero });
  const action = sync(session, {
    isYourTurn: false,
    phase: "turn",
    toCall: 40,
    handNumber: 2,
    hero,
  });
  assert.equal(action, null);
  assert.equal(session.armed, false, "bet on new street disarms when armed at free");
}

// ============================================================================
// (3) folded / all-in / sitting out / spectating: no offer, never fire
// ============================================================================
{
  const blocked = [
    ["folded", { ...hero, folded: true }],
    ["all-in", { ...hero, allIn: true }],
    ["sitting out", { ...hero, sittingOut: true }],
    ["no cards (spectate/undealt)", { ...hero, cards: [] }],
    ["null hero (spectator)", null],
  ];
  let ok = true;
  const details = [];
  for (const [label, h] of blocked) {
    const offer = shouldOffer({ isYourTurn: false, phase: "flop", hero: h });
    const session = createSession();
    arm(session, 0, 3);
    const action = sync(session, {
      isYourTurn: true,
      phase: "flop",
      toCall: 0,
      handNumber: 3,
      hero: h,
    });
    const pass = offer === false && action === null && session.armed === false;
    if (!pass) ok = false;
    details.push(`${label}: offer=${offer} action=${JSON.stringify(action)} armed=${session.armed}`);
  }
  caseResult(3, "out-of-hand states disable offer and never fire", ok, details.join("; "));
}

// ============================================================================
// (4) Arming as turn arrives: sync fires at most once (no double-send)
// ============================================================================
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
    first && first.type === "check" && second === null && session.armed === false,
    `first=${JSON.stringify(first)} second=${JSON.stringify(second)}`,
  );
}

// ============================================================================
// (5) Reconnect/refresh: session is in-memory; fresh session never fires stale arm
// ============================================================================
{
  // Simulate "refresh": old armed session discarded; new createSession() is cold.
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
  const notPersisted = !/localStorage.*checkFold|checkFold.*localStorage/i.test(bootSrc);
  caseResult(
    5,
    "refresh starts unarmed (no stale fire)",
    action === null && fresh.armed === false && notPersisted,
    "checkFoldSession is in-memory only; createSession() is cold",
  );
}

// ============================================================================
// (6) Shot clock / auto-action timeout interplay
// ============================================================================
{
  // Client shot clock only plays cues — consumeDeadlineTimeout → playTimerTimeoutIfEligible,
  // never emitWithAck("game:action"). Check/Fold is the sole client pre-action; a server
  // timeout updates the room and sync disarms.
  const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
  const timeoutBlock = bootSrc.match(
    /consumeDeadlineTimeout[\s\S]{0,240}?playTimerTimeoutIfEligible/,
  );
  const timeoutEmitsAction = timeoutBlock
    ? /emitWithAck\(\s*["']game:action["']/.test(timeoutBlock[0])
    : true;
  const session = createSession();
  arm(session, 20, 6);
  // Server timed the hero out → folded; sync must disarm without emitting.
  const action = sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 20,
    handNumber: 6,
    hero: { ...hero, folded: true },
  });
  caseResult(
    6,
    "shot-clock timeout does not double-act; sync disarms",
    Boolean(timeoutBlock) && !timeoutEmitsAction && action === null && session.armed === false,
    "client timer is cue-only; folded state clears the arm",
  );
}

// ============================================================================
// (7) Practice/offline + mid-hand handoff share the same CheckFold module + applyRoom path
// ============================================================================
{
  const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
  const sharedSession = /Off-turn Check\/Fold pre-action; shared by live table \+ offline Practice/.test(
    bootSrc,
  );
  const syncInApply =
    /CheckFold\.sync\(checkFoldSession/.test(bootSrc) &&
    /handoffOnlineToOffline/.test(bootSrc) &&
    /practiceSession\.publish\(\)/.test(bootSrc);
  // Handoff keeps the in-memory session (same hand) — arm survives into offline publish.
  const session = createSession();
  arm(session, 0, 7);
  const afterHandoffPublish = sync(session, {
    isYourTurn: false,
    phase: "flop",
    toCall: 0,
    handNumber: 7,
    hero,
  });
  caseResult(
    7,
    "Practice/offline uses same sync; handoff keeps arm in-hand",
    sharedSession && syncInApply && afterHandoffPublish === null && session.armed === true,
    "single checkFoldSession; handoff publish re-enters applyRoom → sync",
  );
}

// ============================================================================
// (8) Keyboard F toggles only when allowed; on-turn Fold still emits fold
// (covered in detail by tests/keyboard.js — assert wiring here)
// ============================================================================
{
  const eventsSrc = fs.readFileSync(path.join(__dirname, "../public/app-events.ts"), "utf8");
  const offTurnGate =
    /!state\.isYourTurn/.test(eventsSrc) &&
    /matchesKeybind\(event, "fold"\)/.test(eventsSrc) &&
    /CheckFold\.shouldOffer/.test(eventsSrc) &&
    /toggleCheckFoldArmed/.test(eventsSrc);
  const onTurnFold =
    /if \(!state\.isYourTurn\) return/.test(eventsSrc) &&
    /emitWithAck\("game:action", \{ type: "fold" \}\)/.test(eventsSrc);
  caseResult(
    8,
    "F toggles off-turn only when shouldOffer; on-turn Fold emits",
    offTurnGate && onTurnFold,
    "see tests/keyboard.js for runtime press coverage",
  );
}

// ============================================================================
// (9) State resets on new hand even if hero wasn't dealt in
// ============================================================================
{
  const session = createSession();
  arm(session, 0, 9);
  const action = sync(session, {
    isYourTurn: false,
    phase: "preflop",
    toCall: 0,
    handNumber: 10,
    hero: { ...hero, cards: [] },
  });
  caseResult(
    9,
    "new handNumber disarms even when undealt",
    action === null && session.armed === false,
    "hand number advance clears arm before offer checks",
  );
}

// ============================================================================
// (10) BB preflop, limps around → check (not fold)
// ============================================================================
{
  const session = createSession();
  // BB facing limps: toCall stays 0 while others complete.
  arm(session, 0, 10);
  sync(session, {
    isYourTurn: false,
    phase: "preflop",
    toCall: 0,
    handNumber: 10,
    hero,
  });
  assert.equal(session.armed, true, "limps at toCall=0 keep arm");
  const action = sync(session, {
    isYourTurn: true,
    phase: "preflop",
    toCall: 0,
    handNumber: 10,
    hero,
  });
  caseResult(
    10,
    "BB vs limps auto-checks",
    action && action.type === "check" && session.armed === false,
    `action=${JSON.stringify(action)}`,
  );
}

// --- existing core paths kept ---
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
}
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
{
  const session = createSession();
  arm(session, 20, 7);
  sync(session, {
    isYourTurn: false,
    phase: "complete",
    toCall: 0,
    handNumber: 7,
    hero,
  });
  assert.equal(session.armed, false, "disarmed at hand end");
}

console.log("Check/Fold pre-action tests passed.");
for (const r of results) {
  console.log(`  case ${r.id}: ${r.title} — OK (${r.detail})`);
}
