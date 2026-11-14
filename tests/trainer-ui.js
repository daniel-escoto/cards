#!/usr/bin/env node
/**
 * Preflop Trainer home entry + invite menu order + coach card markup hooks.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const sw = fs.readFileSync(path.join(__dirname, "../public/sw.ts"), "utf8");

assert.match(html, /id="practiceBtn"/);
assert.match(html, /id="trainerBtn"/);
assert.match(html, /id="trainerView"/);
assert.match(html, /id="trainerRaiseBtn"/);
assert.match(html, /id="trainerFoldBtn"/);
assert.match(html, /id="trainerChart"/);
assert.match(html, /shared\/rfi-ranges\.js/);
assert.match(html, /trainer\.js/);

// Invite sits below the player list, above Coach / Copy for AI / Settings.
assert.match(
  html,
  /id="menuPlayers"[\s\S]*?id="shareGameBtn"[\s\S]*?id="coachBtn"[\s\S]*?id="copyForAiBtn"[\s\S]*?id="openSettingsBtn"/,
);
assert.match(html, /id="menuInviteView"/);
assert.match(html, /id="closeInviteBtn"/);
assert.match(html, /id="inviteRoomCode"/);
// Inline expand panel must not sit in the main menu stack anymore.
assert.doesNotMatch(
  html,
  /id="shareGameBtn"[\s\S]*?id="sharePanel"[\s\S]*?id="menuPlayers"/,
);

assert.match(css, /\.coach-hint-headline/);
assert.match(css, /\.coach-hint-stats/);
assert.match(css, /\.trainer-chart-cell/);
assert.match(css, /\.welcome-secondary-actions/);

assert.match(sw, /trainer\.js/);
assert.match(sw, /rfi-ranges\.js/);
assert.match(sw, /isRoomCodePath/);
assert.match(sw, /\/trainer/);

const routes = fs.readFileSync(path.join(__dirname, "../server/http/routes.ts"), "utf8");
assert.match(routes, /\/:code/);
assert.match(routes, /\/trainer/);
assert.match(routes, /\[A-Za-z0-9\]\{6\}/);

console.log("Trainer / invite / coach UI markup checks passed.");
