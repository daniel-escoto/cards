#!/usr/bin/env node
/**
 * Money-mode zero-stack seat: primary Buy in · $X in the action panel (money:cashIn).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");

assert.match(tableSrc, /function shouldOfferMoneyBuyIn/);
assert.match(tableSrc, /function renderMoneyBuyInCta/);
assert.match(tableSrc, /shouldOfferMoneyBuyIn\(room, hero\)/);
assert.match(tableSrc, /Buy in · \$\{amount\}/);
assert.match(tableSrc, /emitWithAck\("money:cashIn"/);
assert.match(
  tableSrc,
  /renderMoneyBuyInCta\(room\)[\s\S]{0,40}?return/,
  "buy-in CTA owns the action row when offered",
);

console.log("Money buy-in CTA checks passed.");
