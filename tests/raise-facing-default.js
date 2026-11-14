#!/usr/bin/env node
/**
 * Facing a bet with merged Call/Raise: default is the Call detent.
 * First nudge / + steps to the min legal raise (snapped by legalRaiseTo).
 * Free check still opens on the Check detent.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initialRaiseTo,
  displayRaiseAmount,
  nudgeRaiseTo,
  legalRaiseTo,
  isCallDetent,
} = require("../dist/public/raise-sizing.js");

// Daniel's flop spot: facing 60, minRaiseTo 120 (raise by 60), BB step 20.
const spot = {
  facingBet: true,
  mergePassiveConfirm: true,
  currentBet: 60,
  minRaiseTo: 120,
  maxRaiseTo: 1010,
  preferredRaiseTo: 120,
};

const opened = initialRaiseTo(spot);
assert.equal(opened, 60, "facing a bet defaults to the Call detent");
assert.notEqual(opened, 120, "must not open already raising");
assert.ok(isCallDetent(opened, 60));
assert.equal(
  displayRaiseAmount({ facingBet: true, atDetent: true, value: opened }),
  60,
  "Call detent shows the call amount, never 0",
);
assert.equal(
  displayRaiseAmount({ facingBet: false, atDetent: true, value: 0 }),
  0,
  "Check detent may still show 0",
);

const bounds = {
  minRaiseTo: 120,
  maxRaiseTo: 1010,
  step: 20,
  currentBet: 60,
  mergeCallRaise: true,
};
assert.equal(nudgeRaiseTo(60, 1, bounds), 120, "first + from Call is min legal raise");
assert.equal(nudgeRaiseTo(120, 1, bounds), 140, "+ steps up from min raise");
assert.equal(nudgeRaiseTo(120, -1, bounds), 60, "- returns to Call detent");
assert.equal(nudgeRaiseTo(140, -1, bounds), 120, "- from above min steps toward Call");
assert.equal(
  nudgeRaiseTo(20, -1, {
    minRaiseTo: 20,
    maxRaiseTo: 1000,
    step: 20,
    currentBet: 0,
    mergeCheckBet: true,
  }),
  0,
  "- from min bet returns to Check detent (0)",
);
assert.equal(legalRaiseTo(125, bounds), 120, "illegal 125 snaps to 120");

// Facing a raise to 400 → Call 400; first nudge → 800 (min legal).
assert.equal(
  initialRaiseTo({
    facingBet: true,
    mergePassiveConfirm: true,
    currentBet: 400,
    minRaiseTo: 800,
    maxRaiseTo: 2000,
    preferredRaiseTo: 800,
  }),
  400,
);
assert.equal(
  nudgeRaiseTo(400, 1, {
    minRaiseTo: 800,
    maxRaiseTo: 2000,
    step: 20,
    currentBet: 400,
    mergeCallRaise: true,
  }),
  800,
);

// Free check still opens on Check detent.
assert.equal(
  initialRaiseTo({
    facingBet: false,
    mergePassiveConfirm: true,
    currentBet: 0,
    minRaiseTo: 20,
    maxRaiseTo: 1000,
    preferredRaiseTo: 40,
  }),
  0,
);
assert.equal(
  nudgeRaiseTo(0, 1, {
    minRaiseTo: 20,
    maxRaiseTo: 1000,
    step: 20,
    currentBet: 0,
    mergeCheckBet: true,
  }),
  20,
  "first + from Check is min bet",
);

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
assert.match(tableSrc, /initialRaiseTo/);
assert.match(tableSrc, /displayRaiseAmount/);
assert.doesNotMatch(tableSrc, /coach-hint-use/);
assert.doesNotMatch(
  tableSrc,
  /atPassiveDetent\(\)\s*\?\s*0\s*:\s*raiseState\.value/,
  "must not force RAISE TO display to 0 at Call detent",
);
// UI wiring: minus is disabled only at the passive detent, never stuck at min raise.
assert.match(
  tableSrc,
  /mergePassiveConfirm \? atPassiveDetent\(\) : raiseState\.value <= raiseState\.min/,
  "raiseMinus must unlock once above the Call/Check detent",
);

console.log("Facing-bet raise default checks passed.");
