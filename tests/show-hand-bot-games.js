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

// Ready + Review share the hand-complete row evenly when Show hand is gone.
assert.match(css, /\.control-panel\.is-result > \.game-buttons > button[\s\S]*?flex:\s*1 1 0/);

console.log("Show-hand bot-game checks passed.");
