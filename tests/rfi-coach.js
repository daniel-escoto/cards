#!/usr/bin/env node
/**
 * Deterministic Preflop Trainer coach reasons (chess.com-style).
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

const bigPair = Rfi.explainRfiDecision(6, "UTG", "AA", "raise");
assert.ok(bigPair);
assert.equal(bigPair.verdict, "correct");
assert.equal(bigPair.badge, "Best");
assert.match(bigPair.reason, /pair|open/i);
assert.ok(bigPair.reason.split(/\s+/).length <= 12);

const ktoFold = Rfi.explainRfiDecision(6, "UTG", "KTo", "fold");
assert.ok(ktoFold);
assert.equal(ktoFold.verdict, "correct");
assert.equal(ktoFold.category, "offsuit_broadway");
assert.equal(ktoFold.band, "early");
assert.ok(!/^Fold\b/i.test(ktoFold.reason), "no redundant Fold — prefix");
assert.ok(ktoFold.reason.split(/\s+/).length <= 12);

const ktoMistake = Rfi.explainRfiDecision(6, "UTG", "KTo", "raise");
assert.ok(ktoMistake);
assert.equal(ktoMistake.verdict, "mistake");
assert.equal(ktoMistake.badge, null);
assert.match(ktoMistake.reason, /KTo|weak|early|Borderline/i);

const btnAce = Rfi.explainRfiDecision(6, "BTN", "A4s", "raise");
assert.ok(btnAce);
assert.equal(btnAce.verdict, "correct");
assert.equal(btnAce.category, "suited_ace");
assert.match(btnAce.reason, /ace|open|late|Borderline/i);

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
}

console.log("RFI coach reason checks passed.");
