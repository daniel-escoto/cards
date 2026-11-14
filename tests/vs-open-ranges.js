/**
 * Shared vs-open (facing a preflop raise) ranges for Trainer phase 2.
 */
const assert = require("node:assert/strict");
const Vs = require("../dist/shared/vs-open-ranges.node");

assert.ok(Vs.facingHeroPositions(6).includes("BB"));
assert.ok(Vs.facingHeroPositions(6).includes("BTN"));
assert.ok(!Vs.facingHeroPositions(6).includes("UTG"));
assert.ok(Vs.facingOpenerPositions(6, "BB").includes("UTG"));
assert.ok(Vs.facingOpenerPositions(6, "BB").includes("SB"));
assert.deepEqual(Vs.facingOpenerPositions(6, "HJ"), ["UTG"]);
assert.deepEqual(Vs.facingOpenerPositions(6, "UTG"), []);

// BB vs UTG: premiums 3-bet, middling call, junk fold.
assert.equal(Vs.standardFacingAction(6, "BB", "UTG", "AA"), "raise");
assert.equal(Vs.standardFacingAction(6, "BB", "UTG", "AKs"), "raise");
assert.equal(Vs.standardFacingAction(6, "BB", "UTG", "ATs"), "call");
assert.equal(Vs.standardFacingAction(6, "BB", "UTG", "72o"), "fold");

// BTN vs CO: wider 3-bets and flats than vs UTG.
assert.equal(Vs.standardFacingAction(6, "BTN", "CO", "A5s"), "raise");
assert.equal(Vs.standardFacingAction(6, "BTN", "CO", "76s"), "call");
assert.equal(Vs.standardFacingAction(6, "BTN", "UTG", "76s"), "fold");

const graded = Vs.gradeFacingAction(6, "CO", "UTG", "AKo", "raise");
assert.ok(graded);
assert.equal(graded.standard, "raise");
assert.equal(graded.correct, true);
assert.equal(Vs.gradeFacingAction(6, "CO", "UTG", "AKo", "fold").correct, false);

const chart = Vs.facingChart(6, "BB", "BTN");
assert.ok(chart);
assert.equal(chart.length, 169);
const aa = chart.find((cell) => cell.key === "AA");
const junk = chart.find((cell) => cell.key === "72o");
assert.equal(aa.action, "raise");
assert.equal(junk.action, "fold");
assert.ok(chart.some((cell) => cell.action === "call"));

// 9-max maps early opens onto the 6-max UTG defense bucket.
assert.equal(Vs.standardFacingAction(9, "BB", "UTG", "AA"), "raise");
assert.equal(Vs.standardFacingAction(9, "BB", "MP", "72o"), "fold");
assert.ok(Vs.isValidFacingPair(9, "CO", "LJ"));
assert.ok(!Vs.isValidFacingPair(9, "UTG", "BTN"));

const explain = Vs.explainFacingDecision(6, "SB", "BTN", "72o", "call");
assert.ok(explain);
assert.equal(explain.verdict, "mistake");
assert.equal(explain.badge, "Mistake");
assert.match(explain.reason, /Fold —/i);
assert.match(explain.reason, /72 offsuit|too weak/i);
assert.doesNotMatch(explain.reason, /chart says|misses —/i);
assert.ok(explain.why.length >= 2);

const j7 = Vs.explainFacingDecision(6, "BB", "UTG", "J7s", "call");
assert.ok(j7);
assert.equal(j7.verdict, "mistake");
assert.match(j7.reason, /Fold —/i);
assert.match(j7.reason, /J7 suited|Jack-7 suited|too weak/i);
assert.match(j7.reason, /early-position/i);
assert.doesNotMatch(j7.reason, /chart says/i);

const best = Vs.explainFacingDecision(6, "BB", "UTG", "AA", "raise");
assert.ok(best);
assert.equal(best.badge, "Best");
assert.equal(best.verdict, "correct");

const hint = Vs.facingTeachingHint(6, "BTN", "CO", "AKo");
assert.ok(hint);
assert.equal(hint.standard, "raise");
assert.match(hint.concept, /Button|Cutoff|open/i);
assert.match(hint.reveal, /3-bet|Raise/i);

let seed = 17;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const spot = Vs.dealRandomFacingSpot(6, {
  random,
  smallBlind: 10,
  bigBlind: 20,
  startingStack: 1000,
});
assert.ok(Vs.facingHeroPositions(6).includes(spot.heroPosition));
assert.ok(Vs.facingOpenerPositions(6, spot.heroPosition).includes(spot.openerPosition));
assert.equal(spot.cards.length, 2);
assert.ok(spot.handKey);
assert.ok(["fold", "call", "raise"].includes(spot.standard));
assert.equal(spot.openTo, 60);
assert.ok(spot.toCall > 0);
assert.ok(spot.minRaiseTo > spot.openTo);
assert.ok(spot.preferredRaiseTo >= spot.minRaiseTo || spot.preferredRaiseTo > spot.openTo);
assert.ok(Array.isArray(spot.callers));

// Borderline notes exist near range edges.
const edge = Vs.facingBorderline(6, "BB", "UTG", "ATs");
assert.ok(edge === "inside" || edge === "outside" || edge === null);

console.log("Vs-open range checks passed.");
