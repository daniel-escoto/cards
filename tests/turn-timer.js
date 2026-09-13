const assert = require("node:assert/strict");
const { TURN_ACTION_DELAY_MS, autoTurnAction } = require("../server");

assert.ok(TURN_ACTION_DELAY_MS >= 12000);
assert.ok(TURN_ACTION_DELAY_MS <= 20000);

assert.deepEqual(
  autoTurnAction({ currentBet: 0 }, { bet: 0 }),
  { type: "check" },
  "free check when no bet to call",
);
assert.deepEqual(
  autoTurnAction({ currentBet: 40 }, { bet: 40 }),
  { type: "check" },
  "free check when already matched",
);
assert.deepEqual(
  autoTurnAction({ currentBet: 40 }, { bet: 20 }),
  { type: "fold" },
  "auto-fold when facing a bet",
);

console.log("Turn action timer checks passed.");
