#!/usr/bin/env node
/**
 * Seat rows: the SB/BB chip gets a fixed slot on every row (even when empty), so the "you" / CPU
 * tag right-aligns to one edge; the stack has a shared min width so status/stack columns line up.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const boot = fs.readFileSync(path.join(root, "public/app-boot.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

assert.match(
  boot,
  /'<span class="seat-you-mark">you<\/span>' : ""\}<span class="seat-chip-slot">\$\{blindChipMarkup\(player\)\}<\/span>/,
  "chip slot always rendered after the tag, wrapping the (possibly empty) blind chip",
);
// Seat list shows no CPU personality label next to bot names.
assert.doesNotMatch(boot, /botStyleTagMarkup|bot-style-tag/, "no bot personality label in seat rows");
assert.doesNotMatch(css, /\.bot-style-tag/);
const block = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[2] : "";
};
assert.match(block(".seat-chip-slot"), /flex:\s*0 0 var\(--seat-chip-size, 18px\)/);
assert.match(block(".player-stack"), /min-width:\s*5ch/);
assert.doesNotMatch(css, /\.player-stack\s*\{[^}]*min-width:\s*max-content/, "stack width must not vary per row");
// Shot-clock bar sits inside the row's rounded corners (inset >= corner radius), as a pill.
const px = (re, text) => Number(re.exec(text)[1]);
const bar = block(".turn-clock-bar");
assert.match(bar, /border-radius:\s*999px/);
assert.ok(px(/left:\s*(\d+)px/, bar) >= px(/border-radius:\s*(\d+)px/, block(".table-player-row")), "bar clears the row corner");
const mobileBar = /\n {2}\.turn-clock-bar \{([^}]*)\}/.exec(css)[1];
const mobileRow = /\n {2}\.table-player-row \{([^}]*)\}/.exec(css)[1];
assert.ok(px(/left:\s*(\d+)px/, mobileBar) >= px(/border-radius:\s*(\d+)px/, mobileRow), "mobile bar clears the row corner");
console.log("Seat row alignment checks passed.");
