const assert = require("node:assert/strict");
const { legalRaiseTo, potPresetRaiseTo } = require("../public/raise-sizing.js");

function serverAccepts(raiseTo, { currentBet, minRaise, playerBet, playerStack }) {
  const target = Math.floor(Number(raiseTo));
  const maxBet = playerBet + playerStack;
  if (!Number.isFinite(target)) return false;
  if (target > maxBet) return false;
  const isAllInShortRaise = target === maxBet && target > currentBet;
  if (target < currentBet + minRaise && !isAllInShortRaise) return false;
  return target > currentBet;
}

// Raw half-pot can sit below minRaiseTo (the bug Daniel hit).
{
  const raw = potPresetRaiseTo({ pot: 50, currentBet: 40, bigBlind: 20, fraction: 0.5 });
  assert.equal(raw, 65);
  const legal = legalRaiseTo(raw, { minRaiseTo: 80, maxRaiseTo: 1000, step: 20 });
  assert.equal(legal, 80);
  assert.equal(
    serverAccepts(legal, { currentBet: 40, minRaise: 40, playerBet: 0, playerStack: 1000 }),
    true,
  );
}

// Snap off-increment pot sizes onto min + k*step.
{
  const raw = potPresetRaiseTo({ pot: 100, currentBet: 40, bigBlind: 20, fraction: 0.5 });
  assert.equal(raw, 90);
  const legal = legalRaiseTo(raw, { minRaiseTo: 80, maxRaiseTo: 1000, step: 20 });
  assert.equal(legal, 100);
  assert.equal(
    serverAccepts(legal, { currentBet: 40, minRaise: 40, playerBet: 0, playerStack: 1000 }),
    true,
  );
}

{
  const raw = potPresetRaiseTo({ pot: 140, currentBet: 100, bigBlind: 20, fraction: 0.5 });
  assert.equal(raw, 170);
  const legal = legalRaiseTo(raw, { minRaiseTo: 180, maxRaiseTo: 2000, step: 20 });
  assert.equal(legal, 180);
  assert.equal(
    serverAccepts(legal, { currentBet: 100, minRaise: 80, playerBet: 0, playerStack: 2000 }),
    true,
  );
}

// Full pot open stays pot-sized and legal.
{
  const raw = potPresetRaiseTo({ pot: 60, currentBet: 0, bigBlind: 20, fraction: 1 });
  assert.equal(raw, 60);
  const legal = legalRaiseTo(raw, { minRaiseTo: 20, maxRaiseTo: 1000, step: 20 });
  assert.equal(legal, 60);
  assert.equal(
    serverAccepts(legal, { currentBet: 0, minRaise: 20, playerBet: 0, playerStack: 1000 }),
    true,
  );
}

// Stack too short for min raise → all-in only.
{
  const legal = legalRaiseTo(500, { minRaiseTo: 200, maxRaiseTo: 150, step: 20 });
  assert.equal(legal, 150);
  assert.equal(
    serverAccepts(legal, { currentBet: 100, minRaise: 100, playerBet: 0, playerStack: 150 }),
    true,
  );
}

// Preset above max clamps to all-in.
{
  const raw = potPresetRaiseTo({ pot: 5000, currentBet: 100, bigBlind: 20, fraction: 1 });
  const legal = legalRaiseTo(raw, { minRaiseTo: 200, maxRaiseTo: 350, step: 20 });
  assert.equal(legal, 350);
  assert.equal(
    serverAccepts(legal, { currentBet: 100, minRaise: 100, playerBet: 50, playerStack: 300 }),
    true,
  );
}

console.log("Raise preset legality checks passed.");
