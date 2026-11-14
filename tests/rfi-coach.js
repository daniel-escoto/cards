#!/usr/bin/env node
/**
 * Deterministic Preflop Trainer coach reasons + teaching hints / Why? copy.
 */
const assert = require("node:assert/strict");
const Rfi = require("../dist/shared/rfi-ranges.node");

assert.equal(Rfi.classifyRfiHand("AA"), "pair");
assert.equal(Rfi.classifyRfiHand("A2s"), "suited_ace");
assert.equal(Rfi.classifyRfiHand("KQs"), "suited_broadway");
assert.equal(Rfi.classifyRfiHand("KTo"), "offsuit_broadway");
assert.equal(Rfi.classifyRfiHand("98s"), "suited_connector");
assert.equal(Rfi.classifyRfiHand("72o"), "trash");

assert.equal(Rfi.rfiPositionBand(6, "UTG"), "early");
assert.equal(Rfi.rfiPositionBand(6, "HJ"), "middle");
assert.equal(Rfi.rfiPositionBand(6, "CO"), "late");
assert.equal(Rfi.rfiPositionBand(6, "BTN"), "late");
assert.equal(Rfi.rfiPositionBand(6, "SB"), "blinds");
assert.equal(Rfi.rfiPositionBand(9, "UTG+1"), "early");
assert.equal(Rfi.rfiPositionBand(9, "LJ"), "middle");

assert.equal(Rfi.rfiPlayersBehind(6, "CO"), 3);
assert.equal(Rfi.rfiPlayersBehind(6, "UTG"), 5);
assert.equal(Rfi.rfiPlayersBehind(6, "BTN"), 2);
assert.equal(Rfi.rfiPositionName("CO"), "Cutoff");
assert.equal(Rfi.rfiPositionName("UTG"), "Under the gun");
assert.match(Rfi.rfiCategoryLabel("suited_connector"), /suited connectors/i);

const bigPair = Rfi.explainRfiDecision(6, "UTG", "AA", "raise");
assert.ok(bigPair);
assert.equal(bigPair.verdict, "correct");
assert.equal(bigPair.badge, "Best");
assert.match(bigPair.reason, /pair|open/i);
assert.ok(bigPair.reason.split(/\s+/).length <= 12);
assert.ok(Array.isArray(bigPair.why));
assert.ok(bigPair.why.length >= 2 && bigPair.why.length <= 3);
assert.match(bigPair.why[0], /Under the gun/i);
assert.match(bigPair.why[0], /5 players left to act/i);
assert.match(bigPair.why[1], /pocket pair/i);
assert.match(bigPair.ruleOfThumb, /Early seats/i);
assert.equal(bigPair.playersBehind, 5);
assert.equal(bigPair.positionName, "Under the gun");

const ktoFold = Rfi.explainRfiDecision(6, "UTG", "KTo", "fold");
assert.ok(ktoFold);
assert.equal(ktoFold.verdict, "correct");
assert.equal(ktoFold.category, "offsuit_broadway");
assert.equal(ktoFold.band, "early");
assert.ok(!/^Fold\b/i.test(ktoFold.reason), "no redundant Fold — prefix");
assert.ok(ktoFold.reason.split(/\s+/).length <= 12);
assert.match(ktoFold.why.join(" "), /offsuit broadway/i);
assert.match(ktoFold.ruleOfThumb, /Early seats/i);

const ktoMistake = Rfi.explainRfiDecision(6, "UTG", "KTo", "raise");
assert.ok(ktoMistake);
assert.equal(ktoMistake.verdict, "mistake");
assert.equal(ktoMistake.badge, "Mistake");
assert.match(ktoMistake.reason, /KTo|weak|early|Borderline/i);

const btnAce = Rfi.explainRfiDecision(6, "BTN", "A4s", "raise");
assert.ok(btnAce);
assert.equal(btnAce.verdict, "correct");
assert.equal(btnAce.category, "suited_ace");
assert.match(btnAce.reason, /ace|open|late|Borderline/i);
assert.match(btnAce.why[0], /Button/i);

const trash = Rfi.explainRfiDecision(6, "UTG", "72o", "fold");
assert.ok(trash);
assert.equal(trash.category, "trash");
assert.equal(trash.verdict, "correct");

// Borderline helper returns inside/outside/null without throwing.
const edge = Rfi.rfiBorderline(6, "CO", "A2s");
assert.ok(edge === "inside" || edge === "outside" || edge === null);

const explainedEdge = Rfi.explainRfiDecision(6, "CO", "A2s", "raise");
assert.ok(explainedEdge);
if (explainedEdge.borderline) {
  assert.match(explainedEdge.reason, /Borderline/i);
  assert.equal(explainedEdge.badge, "Borderline");
}

// Two-step teaching hint: concept first (no Raise/Fold), then reveal.
const coHint = Rfi.rfiTeachingHint(6, "CO", "98s");
assert.ok(coHint);
assert.match(coHint.concept, /Cutoff/i);
assert.match(coHint.concept, /3 players left behind you/i);
assert.match(coHint.concept, /suited connectors/i);
assert.ok(!/\bRaise\b/i.test(coHint.concept), "concept must not give away Raise");
assert.ok(!/\bFold\b/i.test(coHint.concept), "concept must not give away Fold");
assert.match(coHint.reveal, /^(Raise|Fold) —/);
assert.ok(coHint.standard === "raise" || coHint.standard === "fold");

const utgHint = Rfi.rfiTeachingHint(6, "UTG", "KTo");
assert.ok(utgHint);
assert.match(utgHint.concept, /Under the gun/i);
assert.ok(!/\bRaise\b|\bFold\b/i.test(utgHint.concept));
assert.match(utgHint.reveal, /Fold —/);

console.log("RFI coach reason checks passed.");
