#!/usr/bin/env node
/**
 * Implied-odds coach advice — deterministic pure-function coverage.
 * Spot from Daniel: 44 in the SB, call 40 into pot 80 (pot odds 33%), equity ~22%.
 */
const assert = require("node:assert/strict");
const Odds = require("../dist/shared/coach-odds.node");

assert.equal(Odds.classifySpeculativeHand(["4c", "4s"]), "small_pair");
assert.equal(Odds.classifySpeculativeHand(["9h", "9d"]), "small_pair");
assert.equal(Odds.classifySpeculativeHand(["Tc", "Ts"]), null, "TT+ are value pairs");
assert.equal(Odds.classifySpeculativeHand(["Ah", "2h"]), "suited_ace");
assert.equal(Odds.classifySpeculativeHand(["8c", "7c"]), "suited_connector");
assert.equal(Odds.classifySpeculativeHand(["9d", "7d"]), "suited_connector", "one-gapper");
assert.equal(Odds.classifySpeculativeHand(["7s", "2c"]), null);
assert.equal(Odds.speculativeDepthThreshold("small_pair"), 20);
assert.equal(Odds.speculativeDepthThreshold("suited_connector"), 15);

assert.equal(Odds.effectiveStackForCall(950, [950]), 950);
assert.equal(Odds.effectiveStackForCall(950, [200]), 200);

{
  // Exact 44 spot: deep → not a hard Fold.
  const advice = Odds.adviseFacingBet({
    equity: 0.22,
    potOdds: 40 / 120,
    toCall: 40,
    effectiveStack: 950,
    heroCodes: ["4c", "4s"],
    boardLength: 0,
  });
  assert.equal(advice.category, "small_pair");
  assert.ok(advice.stackToCallRatio >= 20, `depth ${advice.stackToCallRatio}`);
  assert.notEqual(advice.verdict, "fold", "deep 44 must not hard-fold");
  assert.equal(advice.action, "call");
  assert.ok(advice.verdict === "borderline" || advice.verdict === "call");
  assert.match(advice.reason, /22%|33%/);
  assert.match(advice.reason, /small pairs|set/i);
  assert.match(advice.reason, /deep|Borderline|Calling is fine/i);
}

{
  // Same 44 spot, short stacks → Fold.
  const advice = Odds.adviseFacingBet({
    equity: 0.22,
    potOdds: 40 / 120,
    toCall: 40,
    effectiveStack: 200,
    heroCodes: ["4c", "4s"],
    boardLength: 0,
  });
  assert.equal(advice.verdict, "fold");
  assert.equal(advice.action, "fold");
  assert.ok(advice.stackToCallRatio < 20);
  assert.match(advice.reason, /short/i);
  assert.match(advice.reason, /Fold/i);
}

{
  // Clear fold: offsuit junk, same price, deep stacks.
  const advice = Odds.adviseFacingBet({
    equity: 0.22,
    potOdds: 40 / 120,
    toCall: 40,
    effectiveStack: 950,
    heroCodes: ["7s", "2c"],
    boardLength: 0,
  });
  assert.equal(advice.category, null);
  assert.equal(advice.verdict, "fold");
  assert.match(advice.reason, /need to win 33%/i);
  assert.match(advice.reason, /win about 22%/i);
  assert.match(advice.reason, /Fold\./);
}

{
  // Clear call: equity covers pot odds.
  const advice = Odds.adviseFacingBet({
    equity: 0.4,
    potOdds: 40 / 120,
    toCall: 40,
    effectiveStack: 950,
    heroCodes: ["As", "Kd"],
    boardLength: 0,
  });
  assert.equal(advice.verdict, "call");
  assert.equal(advice.action, "call");
  assert.match(advice.reason, /Call\./);
}

{
  // Suited connector deep + short of odds → soft call / borderline.
  const advice = Odds.adviseFacingBet({
    equity: 0.24,
    potOdds: 0.33,
    toCall: 40,
    effectiveStack: 800,
    heroCodes: ["8h", "7h"],
    boardLength: 0,
  });
  assert.equal(advice.category, "suited_connector");
  assert.notEqual(advice.verdict, "fold");
  assert.match(advice.reason, /suited connectors/i);
}

{
  // Postflop: no implied-odds rescue (use real pot odds).
  const advice = Odds.adviseFacingBet({
    equity: 0.22,
    potOdds: 40 / 120,
    toCall: 40,
    effectiveStack: 950,
    heroCodes: ["4c", "4s"],
    boardLength: 3,
  });
  assert.equal(advice.verdict, "fold");
}

console.log("Coach implied-odds checks passed.");
