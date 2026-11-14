#!/usr/bin/env node
/**
 * Seat rows: no "you" tag (the hero row is highlighted); D then SB/BB chips sit right after the
 * name, and the name truncates first so the chips are never pushed out; the stack has a shared
 * min width so status/stack columns line up.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const boot = fs.readFileSync(path.join(root, "public/app-boot.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

assert.match(
  boot,
  /<span class="seat-name-text">\$\{escapeHtml\(player\.name\)\}<\/span>\$\{seatChipMarkup\(player\)\}<\/span>/,
  "seat chips rendered right after the name",
);
assert.match(
  boot,
  /chips = \[dealerChipMarkup\(player\), blindChipMarkup\(player\)\]\.filter\(Boolean\)/,
  "dealer chip precedes SB/BB on the same row",
);
assert.match(
  boot,
  /class="blind-chip dealer"[^>]*>D<\/span>/,
  "dealer chip reuses blind-chip styling with a D label",
);
assert.doesNotMatch(boot, /seat-you-mark/, "no 'you' tag in seat rows");
assert.doesNotMatch(css, /\.seat-you-mark/);
// Seat list shows no CPU personality label next to bot names.
assert.doesNotMatch(boot, /botStyleTagMarkup|bot-style-tag/, "no bot personality label in seat rows");
assert.doesNotMatch(css, /\.bot-style-tag/);
const block = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[2] : "";
};
assert.match(block(".seat-chip-slot"), /flex:\s*0 0 var\(--seat-chip-size, 18px\)/, "chip never shrinks");
assert.match(block(".seat-name-text"), /flex:\s*0 1 auto/, "name hugs its text, shrinks (truncates) first");
assert.match(block(".seat-name-text"), /text-overflow:\s*ellipsis/);
assert.match(block(".player-stack"), /min-width:\s*5ch/);
assert.doesNotMatch(css, /\.player-stack\s*\{[^}]*min-width:\s*max-content/, "stack width must not vary per row");
const dealerChip = block(".blind-chip.dealer");
assert.match(dealerChip, /--chip-color:\s*#f5f5f4/, "dealer chip is a white button");
assert.match(dealerChip, /color:\s*#1f2937/, "dealer D is dark on white");
assert.match(block(".blind-chip"), /--chip-color:\s*var\(--accent\)/, "SB keeps accent blue");
assert.match(block(".blind-chip.big"), /--chip-color:\s*#e07a4a/, "BB stays orange");
// Shot-clock bar sits inside the row's rounded corners (inset >= corner radius), as a pill.
const px = (re, text) => Number(re.exec(text)[1]);
const bar = block(".turn-clock-bar");
assert.match(bar, /border-radius:\s*999px/);
assert.ok(px(/left:\s*(\d+)px/, bar) >= px(/border-radius:\s*(\d+)px/, block(".table-player-row")), "bar clears the row corner");
const mobileBar = /\n {2}\.turn-clock-bar \{([^}]*)\}/.exec(css)[1];
const mobileRow = /\n {2}\.table-player-row \{([^}]*)\}/.exec(css)[1];
assert.ok(px(/left:\s*(\d+)px/, mobileBar) >= px(/border-radius:\s*(\d+)px/, mobileRow), "mobile bar clears the row corner");
console.log("Seat row alignment checks passed.");
