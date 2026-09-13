const assert = require("node:assert/strict");
const {
  callDetentValue,
  isCallDetent,
  clampRaiseTo,
  nudgeRaiseTo,
  legalRaiseTo,
  usesPassiveDetent,
} = require("../public/raise-sizing.js");

// Facing a 40 bet; min raise-to is 80 (raise by 40).
const facingBet = {
  minRaiseTo: 80,
  maxRaiseTo: 1000,
  step: 20,
  currentBet: 40,
  mergeCallRaise: true,
};

const jamOnly = {
  minRaiseTo: 80,
  maxRaiseTo: 50,
  step: 20,
  currentBet: 40,
  mergeCallRaise: true,
};

assert.equal(callDetentValue(40), 40);
assert.equal(isCallDetent(40, 40), true);
assert.equal(isCallDetent(39, 40), true);
assert.equal(isCallDetent(80, 40), false);
assert.equal(usesPassiveDetent({ mergeCallRaise: true }), true);
assert.equal(usesPassiveDetent({ mergeCheckBet: false, mergeCallRaise: false }), false);

// Default / fat-finger: anything below a real min raise stays on Call.
assert.equal(clampRaiseTo(40, facingBet), 40);
assert.equal(clampRaiseTo(41, facingBet), 40, "sub-min fat-finger must stay on Call");
assert.equal(clampRaiseTo(79, facingBet), 40);
assert.equal(clampRaiseTo(80, facingBet), 80);
assert.equal(clampRaiseTo(100, facingBet), 100);
assert.equal(clampRaiseTo(1000, facingBet), 1000);

// Without merge, no detent — same as legalRaiseTo.
assert.equal(
  clampRaiseTo(40, { ...facingBet, mergeCallRaise: false }),
  legalRaiseTo(40, facingBet),
);

// First step off Call is a real min raise (or short all-in).
assert.equal(nudgeRaiseTo(40, 1, facingBet), 80);
assert.equal(nudgeRaiseTo(40, 1, jamOnly), 50);

// First step down from min raise returns to Call — not min - 1 chip.
assert.equal(nudgeRaiseTo(80, -1, facingBet), 40);
assert.equal(nudgeRaiseTo(50, -1, jamOnly), 40);

// Further nudges still walk the normal step ladder.
assert.equal(nudgeRaiseTo(80, 1, facingBet), 100);
assert.equal(nudgeRaiseTo(100, -1, facingBet), 80);

// mergeCheckBet and mergeCallRaise share the same hard-detent math.
assert.equal(
  clampRaiseTo(50, { ...facingBet, mergeCallRaise: false, mergeCheckBet: true }),
  40,
);
assert.equal(
  nudgeRaiseTo(40, 1, { ...facingBet, mergeCallRaise: false, mergeCheckBet: true }),
  80,
);

console.log("Call/Raise merge detent checks passed.");
