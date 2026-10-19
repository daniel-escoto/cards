#!/usr/bin/env node
/**
 * Face-down card back: self-contained inline SVG (no external assets), drawn in the card's own
 * 72:100 box and stretched to fit so it never changes card size, mirror-symmetric, and minimal
 * (classic red field, cream border, thin inset line, faint fine lattice; no ornaments).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const m = /\n\.card\.back \{([^}]*)\}/.exec(css);
assert.ok(m, ".card.back rule exists");
const rule = m[1];
const uri = /url\("data:image\/svg\+xml,([^"]+)"\)/.exec(rule);
assert.ok(uri, "card back is an inline SVG data URI");
assert.match(rule, /center \/ 100% 100% no-repeat/, "stretched to the card box, no tiling");
assert.doesNotMatch(
  rule,
  /\b(width|height|padding|border|margin|aspect-ratio)\s*:/,
  "no sizing changes",
);

const svg = decodeURIComponent(uri[1]);
assert.match(svg, /viewBox='0 0 72 100'/, "drawn at the card's 0.72 aspect");
assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, "no external references");
assert.doesNotMatch(uri[1], /#/, "every # is percent-encoded in the data URI");

// Mirror symmetry: the lattice cell centers land on the card center (36, 50).
const pattern = /<pattern id='l' width='(\d+)' height='(\d+)' x='(\d+)' y='(\d+)'/.exec(svg);
assert.ok(pattern, "lattice pattern present");
const [w, h, x, y] = pattern.slice(1).map(Number);
assert.equal((36 - x - w / 2) % w, 0, "lattice centered horizontally");
assert.equal((50 - y - h / 2) % h, 0, "lattice centered vertically");

// Minimal classic red back: red field + cream border, no ornaments.
assert.match(svg, /fill='#d6453f'/, "light classic red field");
assert.match(svg, /fill='#f7f1e6'/, "cream border");
assert.doesNotMatch(svg, /<(circle|ellipse|g)\b/, "no medallion, rosettes or dots");
assert.ok((svg.match(/<path\b/g) || []).length <= 1, "lattice is a single fine stroke path");
for (const sw of svg.matchAll(/stroke-width='([\d.]+)'/g)) {
  assert.ok(Number(sw[1]) <= 1, "only fine lines");
}

// One shared corner radius: every card type rounds from --card-radius (a % of its own width,
// vertical scaled by the 0.72 aspect), and no card rule pins a fixed px radius.
const cardRule = /\n\.card \{([^}]*)\}/.exec(css);
assert.ok(cardRule, ".card rule exists");
const radius = /--card-radius:\s*([\d.]+)%;/.exec(cardRule[1]);
assert.ok(radius, ".card defines --card-radius as a % of width");
assert.match(
  cardRule[1],
  /border-radius:\s*var\(--card-radius\)\s*\/\s*calc\(var\(--card-radius\)\s*\*\s*0\.72\);/,
  ".card rounds from the shared radius, circular at the 0.72 aspect",
);
for (const rule of css.matchAll(/\n([^{}\n]*\.card\b[^{}\n]*)\{([^}]*)\}/g)) {
  if (rule[1].trim() === ".card") continue;
  assert.doesNotMatch(
    rule[2],
    /border-radius\s*:/,
    `${rule[1].trim()} must use --card-radius, not its own border-radius`,
  );
}

// The back's inner corners are concentric with the card's outer corner (no mismatched inner corner).
const outer = (Number(radius[1]) / 100) * 72;
const rects = [
  ...svg.matchAll(/<rect x='([\d.]+)' y='([\d.]+)' width='[\d.]+' height='[\d.]+' rx='([\d.]+)'/g),
];
assert.ok(rects.length >= 2, "border and inset rects present");
for (const [, x, y, rx] of rects) {
  assert.equal(x, y, "insets are even on all sides");
  assert.ok(
    Math.abs(Number(rx) - (outer - Number(x))) < 0.01,
    `rect inset ${x} rounds concentrically (rx ${rx})`,
  );
}
console.log("Card back checks passed.");
