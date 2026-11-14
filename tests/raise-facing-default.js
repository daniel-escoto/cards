#!/usr/bin/env node
/**
 * Facing a bet: RAISE TO must open on the min legal raise (never display 0).
 * Regression for the flop check → face-raise spot where the box showed 0 / Call only.
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

// Daniel's flop spot: currentBet 60, minRaiseTo 120 (raise by 60), BB step 20, stack deep.
const spot = {
  facingBet: true,
  mergePassiveConfirm: true,
  currentBet: 60,
  minRaiseTo: 120,
  maxRaiseTo: 1010,
  preferredRaiseTo: 120,
};

const opened = initialRaiseTo(spot);
assert.equal(opened, 120, "facing a bet opens on min legal raise");
assert.notEqual(opened, 60, "must not open on the Call detent");
assert.equal(
  displayRaiseAmount({ facingBet: true, atDetent: false, value: opened }),
  120,
);
assert.equal(
  displayRaiseAmount({ facingBet: true, atDetent: true, value: 60 }),
  60,
  "Call detent still shows a real chip amount, never 0",
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
assert.equal(nudgeRaiseTo(120, 1, bounds), 140, "+ steps up from min raise");
assert.equal(nudgeRaiseTo(120, -1, bounds), 60, "- returns to Call detent");
assert.ok(isCallDetent(60, 60));
assert.equal(nudgeRaiseTo(60, 1, bounds), 120, "+ from Call returns to min raise");
assert.equal(legalRaiseTo(125, bounds), 120, "illegal 125 snaps to 120");

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

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
assert.match(tableSrc, /initialRaiseTo/);
assert.match(tableSrc, /displayRaiseAmount/);
assert.match(tableSrc, /coach-hint-use/);
assert.match(tableSrc, /setRaiseState\(\{\s*value: suggestion\.raiseTo/);
assert.doesNotMatch(
  tableSrc,
  /atPassiveDetent\(\)\s*\?\s*0\s*:\s*raiseState\.value/,
  "must not force RAISE TO display to 0 at Call detent",
);

console.log("Facing-bet raise default checks passed.");
