#!/usr/bin/env node
/**
 * Waiting / lobby before any hand: no Review hand button, no face-up hole cards.
 * Matches main's pre-deal controls (Ready up as the primary row action).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");

assert.match(tableSrc, /function hasReviewableCompletedHand/);
assert.match(tableSrc, /function addReviewHandButton/);
assert.match(
  tableSrc,
  /hasReviewableCompletedHand\(\)|!hasReviewableCompletedHand/,
  "Review hand button must gate on a completed reviewable hand",
);
assert.match(
  tableSrc,
  /phase === "lobby" && handNumber <= 0/,
  "fresh lobby (handNumber 0) must clear / reject stale Review",
);
assert.match(
  bootSrc,
  /lastHandReplay = null/,
  "leaving a table clears lastHandReplay so a new lobby stays clean",
);
assert.match(
  bootSrc,
  /heroHand\.innerHTML = ""/,
  "leaving a table clears stale hole-card DOM",
);

// Hero cards: lobby / gameover never paint faces (and wipe leftover DOM).
assert.match(
  tableSrc,
  /room\.phase !== "lobby" && room\.phase !== "gameover" && Boolean\(hero\?\.cards\?\.length\)/,
);
assert.match(
  tableSrc,
  /if \(!showHeroCards\)[\s\S]*heroHand\.innerHTML = ""/,
  "pre-deal must clear #heroHand even when the signature was already empty",
);

// Ready-up remains the primary between-hands control; Review is additive only.
assert.match(tableSrc, /Ready up/);
assert.match(tableSrc, /addReviewHandButton\(\)/);
assert.match(bootSrc, /hasReviewableCompletedHand\(\)/);

console.log("Lobby pre-deal Review/hole-card checks passed.");
