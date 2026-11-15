#!/usr/bin/env node
/**
 * Facing a bet with merged Call/Raise: value defaults to the Call detent (one-tap Call),
 * but the RAISE TO box shows a muted "Min N" placeholder — never the call-total.
 * First + / Up jumps to the min legal raise; stepping down returns to placeholder + Call.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initialRaiseTo,
  displayRaiseAmount,
  detentPlaceholderLabel,
  nudgeRaiseTo,
  legalRaiseTo,
  isCallDetent,
  isPassiveDetent,
} = require("../dist/public/raise-sizing.js");

// User spot: BB 20, villain raised to 60 → Call 40; min legal raise-to is 100.
const bbFacing = {
  facingBet: true,
  mergePassiveConfirm: true,
  currentBet: 60,
  minRaiseTo: 100,
  maxRaiseTo: 1000,
  preferredRaiseTo: 100,
};
const bbOpened = initialRaiseTo(bbFacing);
assert.equal(bbOpened, 60, "facing 60 defaults value to Call detent");
assert.ok(isCallDetent(bbOpened, 60));
assert.equal(
  displayRaiseAmount({ facingBet: true, atDetent: true, value: bbOpened }),
  null,
  "Call detent does not paint the call-total in the box",
);
assert.equal(detentPlaceholderLabel(100), "Min 100");
assert.equal(
  nudgeRaiseTo(60, 1, {
    minRaiseTo: 100,
    maxRaiseTo: 1000,
    step: 20,
    currentBet: 60,
    mergeCallRaise: true,
  }),
  100,
  "first + from Call is min legal raise 100",
);
assert.equal(
  displayRaiseAmount({ facingBet: true, atDetent: false, value: 100 }),
  100,
  "after + the box shows the raise-to amount",
);
assert.equal(
  isPassiveDetent(100, 60),
  false,
  "at 100 the main button leaves Call (Raise to 100)",
);
assert.equal(
  nudgeRaiseTo(100, -1, {
    minRaiseTo: 100,
    maxRaiseTo: 1000,
    step: 20,
    currentBet: 60,
    mergeCallRaise: true,
  }),
  60,
  "- returns to Call detent / placeholder",
);

// Broader facing spot (min raise by a full prior size).
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
  null,
  "Call detent → placeholder, not 60",
);
assert.equal(detentPlaceholderLabel(120), "Min 120");

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

// Free check still opens on Check detent — box shows Min N, not 0.
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
  displayRaiseAmount({ facingBet: false, atDetent: true, value: 0 }),
  null,
  "Check detent → placeholder, not 0",
);
assert.equal(detentPlaceholderLabel(20), "Min 20");
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
const trainerSrc = fs.readFileSync(path.join(__dirname, "../public/trainer.ts"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
assert.match(tableSrc, /initialRaiseTo/);
assert.match(tableSrc, /displayRaiseAmount/);
assert.match(tableSrc, /detentPlaceholderLabel/);
assert.match(tableSrc, /is-placeholder/);
assert.match(trainerSrc, /detentPlaceholderLabel/);
assert.match(trainerSrc, /is-placeholder/);
assert.match(css, /\.raise-display strong\.is-placeholder/);
assert.doesNotMatch(tableSrc, /coach-hint-use/);
assert.match(
  tableSrc,
  /mergePassiveConfirm \? atPassiveDetent\(\) : raiseState\.value <= raiseState\.min/,
  "raiseMinus must unlock once above the Call/Check detent",
);

console.log("Facing-bet raise default checks passed.");
