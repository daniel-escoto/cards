#!/usr/bin/env node
/**
 * Shared RFI range lookup + grading for the Preflop Trainer.
 */
const assert = require("node:assert/strict");
const Rfi = require("../dist/shared/rfi-ranges.node");

assert.equal(Rfi.handKeyFromCodes("As", "Kh"), "AKo");
assert.equal(Rfi.handKeyFromCodes("Kh", "As"), "AKo");
assert.equal(Rfi.handKeyFromCodes("As", "Ah"), "AA");
assert.equal(Rfi.handKeyFromCodes("9s", "8s"), "98s");
assert.equal(Rfi.handKeyFromCodes("8s", "9d"), "98o");

assert.deepEqual([...Rfi.POSITIONS_6MAX], ["UTG", "HJ", "CO", "BTN", "SB"]);
assert.ok(Rfi.POSITIONS_9MAX.includes("UTG+1"));
assert.ok(Rfi.POSITIONS_9MAX.includes("LJ"));

// UTG raises premium pairs / suited broadway; folds junk.
assert.equal(Rfi.standardRfiAction(6, "UTG", "AA"), "raise");
assert.equal(Rfi.standardRfiAction(6, "UTG", "AKs"), "raise");
assert.equal(Rfi.standardRfiAction(6, "UTG", "72o"), "fold");
assert.equal(Rfi.standardRfiAction(6, "BTN", "22"), "raise");
assert.equal(Rfi.standardRfiAction(6, "BTN", "72o"), "fold");

// 9-max early seat is tighter than 6-max UTG for mid pairs.
assert.equal(Rfi.standardRfiAction(9, "UTG", "77"), "fold");
assert.equal(Rfi.standardRfiAction(9, "UTG", "88"), "raise");
assert.equal(Rfi.standardRfiAction(6, "UTG", "77"), "raise");

const graded = Rfi.gradeRfiAction(6, "CO", "A2s", "raise");
assert.ok(graded);
assert.equal(graded.standard, "raise");
assert.equal(graded.correct, true);
assert.equal(Rfi.gradeRfiAction(6, "CO", "A2s", "fold").correct, false);

const chart = Rfi.rfiChart(6, "UTG");
assert.ok(chart);
assert.equal(chart.length, 169);
const aa = chart.find((cell) => cell.key === "AA");
const junk = chart.find((cell) => cell.key === "72o");
assert.equal(aa.action, "raise");
assert.equal(junk.action, "fold");

let seed = 11;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const spot = Rfi.dealRandomRfiSpot(6, random);
assert.ok(["UTG", "HJ", "CO", "BTN", "SB"].includes(spot.position));
assert.equal(spot.cards.length, 2);
assert.ok(spot.handKey);
assert.ok(["raise", "fold"].includes(spot.standard));

// expandRangeTokens helpers
assert.ok(Rfi.expandRangeTokens(["77+"]).includes("AA"));
assert.ok(Rfi.expandRangeTokens(["77+"]).includes("77"));
assert.ok(!Rfi.expandRangeTokens(["77+"]).includes("66"));
assert.ok(Rfi.expandRangeTokens(["ATs+"]).includes("AKs"));
assert.ok(Rfi.expandRangeTokens(["ATs+"]).includes("ATs"));
assert.ok(!Rfi.expandRangeTokens(["ATs+"]).includes("A9s"));

console.log("RFI range checks passed.");
