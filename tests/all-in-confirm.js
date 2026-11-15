#!/usr/bin/env node
/**
 * All in stages the raise box to max (like ½ pot / Pot); confirm reads "All in N"
 * and a second tap / Enter sends. No immediate emit from the All in preset.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
const trainerSrc = fs.readFileSync(path.join(__dirname, "../public/trainer.ts"), "utf8");

assert.match(
  tableSrc,
  /All in matches ½ pot \/ Pot: stage the amount|stage the amount; confirm button sends/,
);
assert.doesNotMatch(
  tableSrc,
  /option\.allIn && state\?\.isYourTurn[\s\S]{0,80}?emitWithAck\("game:action"/,
  "All in preset must not emit immediately",
);
assert.match(
  tableSrc,
  /raiseState\.value >= raiseState\.max[\s\S]{0,120}?All in \$\{formatted\}/,
  "confirm button reads All in N at max",
);

assert.doesNotMatch(
  trainerSrc,
  /if \(option\.allIn\) \{\s*answerFacing\("raise"\)/,
  "Trainer All in must not answer immediately",
);
assert.match(
  trainerSrc,
  /spot\.raiseTo >= spot\.maxRaiseTo[\s\S]{0,80}?All in \$\{spot\.raiseTo\}/,
  "Trainer confirm reads All in N at max",
);

console.log("All-in confirm checks passed.");
