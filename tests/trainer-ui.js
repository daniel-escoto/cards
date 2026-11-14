#!/usr/bin/env node
/**
 * Preflop Trainer home entry + mobile-first shell markup.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const trainer = fs.readFileSync(path.join(__dirname, "../public/trainer.ts"), "utf8");

assert.match(html, /id="practiceBtn"/);
assert.match(html, /id="trainerBtn"/);
assert.match(html, /id="trainerView"/);
assert.match(html, /id="trainerRaiseBtn"/);
assert.match(html, /id="trainerFoldBtn"/);
assert.match(html, /id="trainerChart"/);
assert.match(html, /id="trainerTableDiagram"/);
assert.match(html, /id="trainerAccuracy"/);
assert.match(html, /trainer-stats-panel/);
assert.match(html, /shared\/rfi-ranges\.js/);
assert.match(html, /trainer\.js/);

// Practice / Trainer sit outside the join form (avoid submit side-effects).
assert.match(
  html,
  /<\/form>\s*<div class="welcome-secondary-actions"[\s\S]*?id="trainerBtn"/,
);

assert.match(css, /\.trainer-shell/);
assert.match(css, /\.trainer-topbar/);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /\.trainer-chart-cell/);
assert.match(css, /trainer-open-root/);

assert.match(trainer, /keydown/);
assert.match(trainer, /streak/);
assert.match(trainer, /DIAGRAM_SEATS/);
assert.match(trainer, /folded to you/);

console.log("Trainer UI markup checks passed.");
