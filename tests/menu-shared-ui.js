#!/usr/bin/env node
/**
 * Trainer + Hand Review menus must reuse the game menu / settings sheet pieces
 * (modal-head, icon-btn, host-block, appearance-choices, menu-row-btn, leave-game-btn).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const trainer = fs.readFileSync(path.join(__dirname, "../public/trainer.ts"), "utf8");

const trainerMenu = html.match(
  /id="trainerMenuModal"[\s\S]*?id="trainerChartModal"/,
);
assert.ok(trainerMenu, "trainer menu block");
const block = trainerMenu[0];

assert.match(block, /class="modal-panel menu-panel"/);
assert.match(block, /class="modal-head"/);
assert.match(block, /class="ghost icon-btn"/);
assert.match(block, /class="menu-stack"/);
assert.match(block, /class="host-block"/);
assert.match(block, /class="menu-subsection-title"/);
assert.match(block, /appearance-choices shot-clock-choices/);
assert.match(block, /class="appearance-choice/);
assert.match(block, /secondary menu-row-btn/);
assert.match(block, /leave-game-btn menu-row-btn/);
assert.doesNotMatch(block, /mode-option/);
assert.doesNotMatch(block, /trainer-drill|trainer-size/);

assert.match(trainer, /trainer-stats-top/);
assert.match(trainer, /menu-player-row static/);
assert.doesNotMatch(trainer, /join\(" · "\)/);

assert.match(html, /hand-review-chrome-head[\s\S]*class="ghost icon-btn hand-review-close"/);
assert.match(html, /class="modal-head hand-review-chrome-head"/);
assert.doesNotMatch(css, /\.hand-review-retry-actions/);
assert.doesNotMatch(css, /\.control-panel \.hand-review-close\.icon-btn[\s\S]{0,80}width:\s*44px/);
assert.doesNotMatch(css, /\.trainer-drill \.mode-option/);

// Dark-mode appearance-choice: opaque panel-2 + readable text (not muted-on-transparent).
const choiceBlock = css.match(
  /(?:^|\n)\.appearance-choice\s*\{[^}]+background:\s*var\(--panel-2\)[^}]*\}/,
);
assert.ok(choiceBlock, "base appearance-choice rule with opaque panel-2");
assert.doesNotMatch(
  choiceBlock[0],
  /color:\s*var\(--muted\)\s*;/,
  "unselected choice labels must not use washed-out --muted alone",
);
assert.doesNotMatch(
  css,
  /\.appearance-choice\s*\{[^}]*color-mix\(in srgb, var\(--panel\) 72%, transparent\)/,
  "choice tiles must not use translucent panel-over-felt wash",
);

console.log("Shared menu UI checks passed.");
