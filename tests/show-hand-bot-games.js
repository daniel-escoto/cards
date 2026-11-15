/**
 * Show hand is for multi-human tables only — hide vs bots / offline practice.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const eventsSrc = fs.readFileSync(path.join(__dirname, "../public/app-events.ts"), "utf8");

assert.match(tableSrc, /function showHandButtonAvailable/);
assert.match(tableSrc, /function isHeroVsBotsOnly/);
assert.match(tableSrc, /showHandButtonAvailable\(room\)/);
assert.match(tableSrc, /every other seated player is a bot|vs bots/i);
assert.match(eventsSrc, /showHandButtonAvailable/);

// Online Show hand uses the same secondary button slot as offline Review hand.
assert.match(
  tableSrc,
  /addButton\(\s*"Show hand",\s*"game:showCards",\s*"secondary"/,
  "Show hand must be a secondary bordered button, not a text link",
);
assert.doesNotMatch(
  tableSrc,
  /textActionLink\(\s*[`'"]Show hand/,
  "Show hand must not use text-action-link",
);
assert.match(tableSrc, /button\.className = "secondary"[\s\S]*Review hand/);

// Ready + Review/Show hand share the hand-complete row evenly.
assert.match(css, /\.control-panel\.is-result > \.game-buttons > button[\s\S]*?flex:\s*1 1 0/);

console.log("Show-hand bot-game checks passed.");
