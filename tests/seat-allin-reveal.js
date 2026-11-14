#!/usr/bin/env node
/**
 * Seat-row hole cards must stay hidden while betting is still open — even if
 * showCards is sticky. Reveal only on all-in runout or showdown/complete.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
assert.match(bootSrc, /function seatHoleCardsMayReveal/);
assert.match(bootSrc, /allInCardsExposed/);
assert.match(bootSrc, /seatHoleCardsMayReveal\(\)/);
assert.match(
  bootSrc,
  /seatHoleCardsMayReveal\(\)[\s\S]*player\.showCards/,
  "seatShownHandMarkup must gate on seatHoleCardsMayReveal",
);

console.log("Seat all-in reveal checks passed.");
