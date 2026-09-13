const assert = require("node:assert/strict");
const { legalRaiseTo, potPresetRaiseTo } = require("../public/raise-sizing.js");

/**
 * Mirrors public/app.js renderBetPresets selection rules:
 * - include ½ pot / Pot only when a full raise is possible and value < all-in
 * - always keep All in (never unique-filter it away)
 */
function betPresetLabels({ pot, currentBet, bigBlind, minRaiseTo, maxRaiseTo, canFullRaise }) {
  const bounds = { minRaiseTo, maxRaiseTo, step: bigBlind };
  const options = [];
  if (canFullRaise) {
    for (const preset of [
      { label: "½ pot", fraction: 0.5 },
      { label: "Pot", fraction: 1 },
    ]) {
      const value = legalRaiseTo(
        potPresetRaiseTo({ pot, currentBet, bigBlind, fraction: preset.fraction }),
        bounds,
      );
      if (value < maxRaiseTo) options.push(preset.label);
    }
  }
  options.push("All in");
  return options;
}

// Short stack: cannot meet min-raise → All in only (canRaise would be false).
{
  const labels = betPresetLabels({
    pot: 200,
    currentBet: 40,
    bigBlind: 20,
    minRaiseTo: 80,
    maxRaiseTo: 60,
    canFullRaise: false,
  });
  assert.deepEqual(labels, ["All in"]);
}

// Deep stack where ½ pot / Pot clamp to all-in → All in must still appear alone
// (or alongside any preset that stays strictly below max).
{
  const maxRaiseTo = 100;
  const labels = betPresetLabels({
    pot: 5000,
    currentBet: 40,
    bigBlind: 20,
    minRaiseTo: 80,
    maxRaiseTo,
    canFullRaise: true,
  });
  assert.ok(labels.includes("All in"));
  assert.equal(labels.filter((label) => label === "All in").length, 1);
  // Presets that collapse to max must not displace All in.
  for (const label of labels) {
    if (label === "All in") continue;
    const value = legalRaiseTo(
      potPresetRaiseTo({
        pot: 5000,
        currentBet: 40,
        bigBlind: 20,
        fraction: label === "½ pot" ? 0.5 : 1,
      }),
      { minRaiseTo: 80, maxRaiseTo, step: 20 },
    );
    assert.ok(value < maxRaiseTo, `${label} should be below all-in if listed`);
  }
}

// Normal open: ½ pot, Pot, and All in can all show with distinct amounts.
{
  const labels = betPresetLabels({
    pot: 60,
    currentBet: 0,
    bigBlind: 20,
    minRaiseTo: 20,
    maxRaiseTo: 1000,
    canFullRaise: true,
  });
  assert.deepEqual(labels, ["½ pot", "Pot", "All in"]);
}

console.log("All-in preset visibility checks passed.");
