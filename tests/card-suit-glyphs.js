#!/usr/bin/env node
/**
 * Card faces must never render a bare suit letter (s/h/d/c) — always ♠♥♦♣.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Format = require("../dist/public/app-format.js");

const glyphs = new Set(["♠", "♥", "♦", "♣"]);
const letters = ["s", "h", "d", "c", "S", "H", "D", "C"];

for (const letter of letters) {
  const glyph = Format.normalizeSuitGlyph(letter);
  assert.ok(glyphs.has(glyph), `${letter} → glyph`);
}

assert.equal(Format.normalizeSuitGlyph("♥"), "♥");
assert.equal(Format.normalizeSuitGlyph("", "As"), "♠");
assert.equal(Format.normalizeSuitGlyph("x", "Qd"), "♦");

// Letter-suit PublicCard still paints a glyph in the face markup.
const fromLetter = Format.cardTemplate({
  code: "Kh",
  rank: "K",
  suit: "h",
  color: "red",
});
assert.match(fromLetter, /♥/);
assert.doesNotMatch(fromLetter, /class="card-corner-suit suit">h</);
assert.doesNotMatch(fromLetter, />h<\/span>\s*<\/span>\s*<\/div>/);

const fromGlyph = Format.cardTemplate({
  code: "As",
  rank: "A",
  suit: "♠",
  color: "black",
});
assert.match(fromGlyph, /♠/);

// Backs stay backs.
assert.match(Format.cardTemplate(null), /card back/);

// Source guards: shared format + trainer fallback must go through normalize / glyphs.
const formatSrc = fs.readFileSync(path.join(__dirname, "../public/app-format.ts"), "utf8");
assert.match(formatSrc, /normalizeSuitGlyph/);
assert.match(formatSrc, /normalizePublicCard/);
const trainerSrc = fs.readFileSync(path.join(__dirname, "../public/trainer.ts"), "utf8");
assert.match(trainerSrc, /cardTemplate/);
const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
assert.match(bootSrc, /seatShownHandMarkup/);
assert.match(bootSrc, /cardTemplate\(card\)/);

// No face render path may paint a bare suit letter for any letter-suit card.
for (const suit of letters) {
  const html = Format.cardTemplate({
    code: `A${suit.toLowerCase()}`,
    rank: "A",
    suit,
    color: suit.toLowerCase() === "h" || suit.toLowerCase() === "d" ? "red" : "black",
  });
  assert.doesNotMatch(
    html,
    new RegExp(`class="card-corner-suit suit">${suit}</`),
    `bare suit letter ${suit} must not appear in card face`,
  );
  assert.ok(
    [...glyphs].some((g) => html.includes(g)),
    `card face for suit ${suit} must include a glyph`,
  );
}

console.log("Card suit glyph checks passed.");
