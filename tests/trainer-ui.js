#!/usr/bin/env node
/**
 * Preflop Trainer — table-layout puzzle markup + shared game classes.
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
assert.match(html, /id="trainerHeroHand"/);
assert.match(html, /id="trainerPlayers"/);
assert.match(html, /id="trainerActions"/);
assert.match(html, /id="trainerTurnInfo"/);
assert.match(html, /id="trainerChart"/);
assert.match(html, /id="trainerAccuracy"/);
assert.match(html, /id="trainerMenuModal"/);
assert.match(html, /id="trainerChartModal"/);
assert.match(html, /class="table-view trainer-view/);
assert.match(html, /id="trainerActions" class="game-buttons"/);
assert.match(html, /shared\/rfi-ranges\.js/);
assert.match(html, /trainer\.js/);

// Practice / Trainer sit outside the join form (avoid submit side-effects).
assert.match(
  html,
  /<\/form>\s*<div class="welcome-secondary-actions"[\s\S]*?id="trainerBtn"/,
);

assert.match(css, /\.trainer-chart-cell/);
assert.match(css, /trainer-open-root/);
assert.match(css, /safe-area-inset-bottom/);

assert.match(trainer, /keydown/);
assert.match(trainer, /streak/);
assert.match(trainer, /TABLE_SEATS/);
assert.match(trainer, /Folded to you/);
assert.match(trainer, /blind-chip/);
assert.match(trainer, /table-player-row/);
assert.match(trainer, /trainerFoldBtn/);

console.log("Trainer UI markup checks passed.");
