const assert = require("node:assert/strict");
const {
  checkDetentValue,
  isCheckDetent,
  clampRaiseTo,
  nudgeRaiseTo,
  legalRaiseTo,
} = require("../public/raise-sizing.js");

const postflop = {
  minRaiseTo: 20,
  maxRaiseTo: 1000,
  step: 20,
  currentBet: 0,
  mergeCheckBet: true,
};

const bbOption = {
  minRaiseTo: 40,
  maxRaiseTo: 1000,
  step: 20,
  currentBet: 20,
  mergeCheckBet: true,
};

const jamOnly = {
  minRaiseTo: 80,
  maxRaiseTo: 50,
  step: 20,
  currentBet: 0,
  mergeCheckBet: true,
};

assert.equal(checkDetentValue(0), 0);
assert.equal(checkDetentValue(20), 20);
assert.equal(isCheckDetent(0, 0), true);
assert.equal(isCheckDetent(20, 20), true);
assert.equal(isCheckDetent(19, 20), true);
assert.equal(isCheckDetent(40, 20), false);

// Default / fat-finger: anything below a real min bet stays on Check.
assert.equal(clampRaiseTo(0, postflop), 0);
assert.equal(clampRaiseTo(-5, postflop), 0);
assert.equal(clampRaiseTo(1, postflop), 0, "sub-min fat-finger must stay on Check");
assert.equal(clampRaiseTo(19, postflop), 0);
assert.equal(clampRaiseTo(20, postflop), 20);
assert.equal(clampRaiseTo(20, bbOption), 20);
assert.equal(clampRaiseTo(21, bbOption), 20, "below min raise stays on Check detent");
assert.equal(clampRaiseTo(40, bbOption), 40);

// Real bets still snap onto the legal ladder.
assert.equal(clampRaiseTo(60, postflop), 60);
assert.equal(clampRaiseTo(1000, postflop), 1000);

// Without merge, no detent — same as legalRaiseTo.
assert.equal(
  clampRaiseTo(0, { ...postflop, mergeCheckBet: false }),
  legalRaiseTo(0, postflop),
);

// First step off Check is a real min bet (or short all-in).
assert.equal(nudgeRaiseTo(0, 1, postflop), 20);
assert.equal(nudgeRaiseTo(20, 1, bbOption), 40);
assert.equal(nudgeRaiseTo(0, 1, jamOnly), 50);

// First step down from min bet returns to Check — not min - 1 chip.
assert.equal(nudgeRaiseTo(20, -1, postflop), 0);
assert.equal(nudgeRaiseTo(40, -1, bbOption), 20);
assert.equal(nudgeRaiseTo(50, -1, jamOnly), 0);

// Further nudges still walk the normal step ladder.
assert.equal(nudgeRaiseTo(20, 1, postflop), 40);
assert.equal(nudgeRaiseTo(40, -1, postflop), 20);

// Without merge flag, facing-bet nudges stay on the legal raise ladder.
const facingBetNoMerge = {
  minRaiseTo: 80,
  maxRaiseTo: 1000,
  step: 20,
  currentBet: 40,
  mergeCheckBet: false,
};
assert.equal(nudgeRaiseTo(80, -1, facingBetNoMerge), 80);
assert.equal(nudgeRaiseTo(80, 1, facingBetNoMerge), 100);

console.log("Check/Bet merge detent checks passed.");
