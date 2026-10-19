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
  /\$\{botStyleTagMarkup\(player\)\}<span class="seat-chip-slot">\$\{blindChipMarkup\(player\)\}<\/span>/,
  "chip slot always rendered after the tag, wrapping the (possibly empty) blind chip",
);
const block = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[2] : "";
};
assert.match(block(".seat-chip-slot"), /flex:\s*0 0 var\(--seat-chip-size, 18px\)/);
assert.match(block(".player-stack"), /min-width:\s*5ch/);
assert.doesNotMatch(css, /\.player-stack\s*\{[^}]*min-width:\s*max-content/, "stack width must not vary per row");
console.log("Seat row alignment checks passed.");
