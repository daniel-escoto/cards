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

assert.doesNotMatch(html, /id="practiceBtn"/);
assert.match(html, /id="trainerBtn"/);
assert.match(html, /id="trainerView"/);
assert.match(html, /id="trainerHeroHand"/);
assert.match(html, /id="trainerPlayers"/);
assert.match(html, /id="trainerActions"/);
assert.match(html, /id="trainerTurnInfo"/);
assert.match(html, /id="trainerCoach"/);
assert.match(html, /id="trainerCoach"[\s\S]*?class="coach-hint/);
assert.match(html, /id="trainerChart"/);
assert.match(html, /id="trainerAccuracy"/);
assert.match(html, /id="trainerMenuModal"/);
assert.match(html, /id="trainerChartModal"/);
assert.match(html, /id="trainerSeatPopover"/);
assert.match(html, /class="table-view trainer-view/);
assert.match(html, /id="trainerActions" class="game-buttons"/);
assert.match(html, /shared\/rfi-ranges\.js/);
assert.match(html, /trainer\.js/);

// Trainer sits outside the join form (avoid submit side-effects). Offline vs-bots
// remains available via Host table (chip mode → startOfflineHost).
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
assert.match(trainer, /POSITION_FULL_NAME/);
assert.match(trainer, /Under the gun/);
assert.match(trainer, /trainerHintBtn/);
assert.match(trainer, /rfiTeachingHint/);
assert.match(trainer, /trainer-why/);
assert.match(trainer, /hinted/);
assert.match(trainer, /blind-chip/);
assert.match(trainer, /table-player-row/);
assert.match(trainer, /trainerFoldBtn/);
assert.doesNotMatch(trainer, /onPractice/);

assert.match(css, /--trainer-chart-raise-bg/);
assert.match(css, /--trainer-chart-fold-bg/);
assert.match(css, /\.trainer-why/);
assert.match(css, /\.trainer-view \.felt/);
assert.match(css, /\.coach-hint/);

console.log("Trainer UI markup checks passed.");
