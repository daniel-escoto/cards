#!/usr/bin/env node
/**
 * Two-column table (780px and up) must fit any window width: the felt's tracks have no
 * fixed pixel floors (360px + 400px floors pushed the board and action panel past the
 * felt's right edge in ~780–860px windows, worst in Safari), and every grid item may
 * shrink. The browser sweep lives in scripts/check-table-fit.mjs (widths 700–1440,
 * Wide table off and on); this guards the CSS that makes it pass.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");

/** Bodies of every `@media (min-width: 780px)` block. */
function mediaBlocks(query) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(`@media ${query} {`, from);
    if (start < 0) return blocks;
    let depth = 0;
    let index = css.indexOf("{", start);
    const open = index;
    for (; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}" && --depth === 0) break;
    }
    blocks.push(css.slice(open + 1, index));
    from = index;
  }
}
const twoColumn = mediaBlocks("(min-width: 780px)").join("\n");
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(twoColumn);
  return m ? m[2] : "";
};

const felt = rule(".felt");
const columns = /grid-template-columns:\s*([^;]+);/.exec(felt)?.[1] || "";
assert.ok(columns, "two-column felt sets its columns");
for (const [, floor] of columns.matchAll(/minmax\(\s*([^,]+),/g)) {
  assert.equal(floor.trim(), "0", `felt column floor must be 0, not ${floor} (${columns})`);
}
assert.doesNotMatch(columns, /\d+px/, `no fixed px tracks: ${columns}`);

for (const selector of [".community", ".control-panel", ".players"]) {
  assert.match(rule(selector), /min-width:\s*0/, `${selector} can shrink below its content width`);
}
assert.match(rule(".community"), /max-width:\s*100%/, "board never wider than its column");
assert.match(rule(".community .card"), /flex:\s*0 1 auto/, "board cards shrink together");
assert.match(rule(".community .card"), /min-width:\s*0/);

assert.ok(
  fs.existsSync(path.join(__dirname, "../scripts/check-table-fit.mjs")),
  "width sweep script exists",
);
console.log("Table fit checks passed.");
