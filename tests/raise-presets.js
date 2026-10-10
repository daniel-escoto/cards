const assert = require("node:assert/strict");
const {
  legalRaiseTo,
  potPresetRaiseTo,
  clampRaiseTo,
} = require("../public/raise-sizing.js");

function serverAccepts(raiseTo, { currentBet, minRaise, playerBet, playerStack }) {
  const target = Math.floor(Number(raiseTo));
  const maxBet = playerBet + playerStack;
  if (!Number.isFinite(target)) return false;
  if (target > maxBet) return false;
  const isAllInShortRaise = target === maxBet && target > currentBet;
  if (target < currentBet + minRaise && !isAllInShortRaise) return false;
  return target > currentBet;
}

function legalPreset(args, bounds) {
  return legalRaiseTo(potPresetRaiseTo(args), bounds);
}

// --- Unopened pot (can check): ½ pot = 0.5 × current pot ---
{
  const raw = potPresetRaiseTo({
    pot: 100,
    currentBet: 0,
    bigBlind: 20,
    fraction: 0.5,
    toCall: 0,
  });
  assert.equal(raw, 50);
  assert.equal(
    legalRaiseTo(raw, { minRaiseTo: 20, maxRaiseTo: 1000, step: 20 }),
    60,
    "half-pot open snaps onto min + k*step",
  );
}

{
  const raw = potPresetRaiseTo({
    pot: 60,
    currentBet: 0,
    bigBlind: 20,
    fraction: 1,
    toCall: 0,
  });
  assert.equal(raw, 60, "full pot open stays pot-sized");
  assert.equal(
    legalRaiseTo(raw, { minRaiseTo: 20, maxRaiseTo: 1000, step: 20 }),
    60,
  );
  assert.equal(
    serverAccepts(60, { currentBet: 0, minRaise: 20, playerBet: 0, playerStack: 1000 }),
    true,
  );
}

// --- Facing a bet: raiseTo = currentBet + 0.5 × (pot + toCall) ---
// Pot 100, bet 40, hero has 0 in → toCall 40. Correct half-pot raise-to = 110.
// Old formula (currentBet + 0.5*pot) wrongly produced 90.
{
  const raw = potPresetRaiseTo({
    pot: 100,
    currentBet: 40,
    bigBlind: 20,
    fraction: 0.5,
    toCall: 40,
  });
  assert.equal(raw, 110);
  const legal = legalRaiseTo(raw, { minRaiseTo: 80, maxRaiseTo: 1000, step: 20 });
  assert.equal(legal, 120);
  assert.equal(
    serverAccepts(legal, { currentBet: 40, minRaise: 40, playerBet: 0, playerStack: 1000 }),
    true,
  );
}

// Full pot raise facing a bet: currentBet + 1×(pot + toCall).
{
  const raw = potPresetRaiseTo({
    pot: 100,
    currentBet: 40,
    bigBlind: 20,
    fraction: 1,
    toCall: 40,
  });
  assert.equal(raw, 180);
}

// Preflop with blinds: SB 10 + BB 20 = pot 30. UTG opens to 60 → pot 90.
// BB faces toCall 40. Half-pot raise-to = 60 + 0.5*(90+40) = 125.
{
  const raw = potPresetRaiseTo({
    pot: 90,
    currentBet: 60,
    bigBlind: 20,
    fraction: 0.5,
    toCall: 40,
  });
  assert.equal(raw, 125);
  const legal = legalRaiseTo(raw, { minRaiseTo: 100, maxRaiseTo: 2000, step: 20 });
  assert.equal(legal, 120);
}

// Multiway: limped pot then bet. Pot 80 (4×20), bet 40, hero toCall 40.
{
  const raw = potPresetRaiseTo({
    pot: 120,
    currentBet: 40,
    bigBlind: 20,
    fraction: 0.5,
    toCall: 40,
  });
  assert.equal(raw, 120, "multiway pot-after-call half pot");
}

// After a re-raise: pot 200, currentBet 100, toCall 100, minRaise 60 → minRaiseTo 160.
// Half-pot raw = 100 + 0.5*(200+100) = 250.
{
  const raw = potPresetRaiseTo({
    pot: 200,
    currentBet: 100,
    bigBlind: 20,
    fraction: 0.5,
    toCall: 100,
  });
  assert.equal(raw, 250);
  const legal = legalRaiseTo(raw, { minRaiseTo: 160, maxRaiseTo: 2000, step: 20 });
  assert.equal(legal, 260);
  assert.equal(
    serverAccepts(legal, { currentBet: 100, minRaise: 60, playerBet: 0, playerStack: 2000 }),
    true,
  );
}

// Raw half-pot can still sit below minRaiseTo — clamp up (the Sept / PR12 bug).
// Pot 50, facing 100, toCall 100 → raw 175 < minRaiseTo 200.
{
  const raw = potPresetRaiseTo({
    pot: 50,
    currentBet: 100,
    bigBlind: 20,
    fraction: 0.5,
    toCall: 100,
  });
  assert.equal(raw, 175);
  const legal = legalRaiseTo(raw, { minRaiseTo: 200, maxRaiseTo: 2000, step: 20 });
  assert.equal(legal, 200);
  assert.equal(
    serverAccepts(legal, { currentBet: 100, minRaise: 100, playerBet: 0, playerStack: 2000 }),
    true,
  );
}

// Short stack: preset above max clamps to all-in.
{
  const raw = potPresetRaiseTo({
    pot: 5000,
    currentBet: 100,
    bigBlind: 20,
    fraction: 1,
    toCall: 100,
  });
  const legal = legalRaiseTo(raw, { minRaiseTo: 200, maxRaiseTo: 350, step: 20 });
  assert.equal(legal, 350);
  assert.equal(
    serverAccepts(legal, { currentBet: 100, minRaise: 100, playerBet: 50, playerStack: 300 }),
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

// Money mode: chip units are integers (1 chip = 1¢ when moneyUnitCents === 1).
// Odd pot × fraction rounds to nearest chip, then snaps to the BB step ladder.
{
  const raw = potPresetRaiseTo({
    pot: 75,
    currentBet: 0,
    bigBlind: 10,
    fraction: 0.5,
    toCall: 0,
  });
  assert.equal(raw, 38);
  assert.equal(
    legalRaiseTo(raw, { minRaiseTo: 10, maxRaiseTo: 5000, step: 10 }),
    40,
  );
}

{
  const raw = potPresetRaiseTo({
    pot: 75,
    currentBet: 25,
    bigBlind: 10,
    fraction: 0.5,
    toCall: 25,
  });
  // 25 + round(0.5 * 100) = 25 + 50 = 75
  assert.equal(raw, 75);
}

// Omitted toCall defaults to 0 (unopened / check option).
{
  assert.equal(
    potPresetRaiseTo({ pot: 80, currentBet: 0, bigBlind: 20, fraction: 0.5 }),
    40,
  );
}

// Preset → clamp with Call/Raise merge must keep the sized raise (not snap to Call).
{
  const bounds = {
    minRaiseTo: 80,
    maxRaiseTo: 1000,
    step: 20,
    currentBet: 40,
    mergeCallRaise: true,
  };
  const preset = legalPreset(
    { pot: 100, currentBet: 40, bigBlind: 20, fraction: 0.5, toCall: 40 },
    bounds,
  );
  assert.equal(preset, 120);
  assert.equal(
    clampRaiseTo(preset, bounds),
    120,
    "confirm path must send the preset raise-to, not a stale Call detent",
  );
}

// Preset → clamp with Check/Bet merge keeps the bet amount.
{
  const bounds = {
    minRaiseTo: 20,
    maxRaiseTo: 1000,
    step: 20,
    currentBet: 0,
    mergeCheckBet: true,
  };
  const preset = legalPreset(
    { pot: 100, currentBet: 0, bigBlind: 20, fraction: 0.5, toCall: 0 },
    bounds,
  );
  assert.equal(preset, 60);
  assert.equal(clampRaiseTo(preset, bounds), 60);
}

console.log("Raise preset legality checks passed.");
