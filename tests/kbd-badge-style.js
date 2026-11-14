#!/usr/bin/env node
/**
 * Key badges on colored buttons (Fold danger, Call/Raise primary) match main:
 * translucent dark fill, light border, white letter — game table and Trainer.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");

assert.match(
  css,
  /\.game-buttons > button\.has-shortcut:not\(\.secondary\):not\(\.ghost\) > kbd[\s\S]*?border-color:\s*var\(--color-raw-93\)[\s\S]*?color:\s*var\(--color-raw-90\)[\s\S]*?background:\s*var\(--color-raw-52\)/,
);
assert.doesNotMatch(
  css,
  /\.game-buttons > button\.has-shortcut:not\(\.secondary\):not\(\.danger\):not\(\.ghost\) > kbd/,
  "Fold/danger must not be excluded from the translucent badge",
);
assert.match(
  css,
  /\.game-buttons > button\.has-shortcut\.secondary > kbd[\s\S]*?color:\s*var\(--muted\)/,
  "secondary badges stay muted token style",
);

console.log("Kbd badge style checks passed.");
