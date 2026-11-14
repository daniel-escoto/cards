#!/usr/bin/env node
/**
 * Home/join: center idle card; keyboard via visualViewport + scrollIntoView only while typing.
 * Trainer lives inside the join card (same group).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
const eventsSrc = fs.readFileSync(path.join(__dirname, "../public/app-events.ts"), "utf8");

assert.match(css, /\.welcome\s*\{[^}]*place-items:\s*center/s);
assert.match(css, /\.welcome\s*\{[^}]*align-content:\s*safe center/s);
assert.match(css, /min-height:\s*calc\(var\(--viewport-height/);
assert.doesNotMatch(
  css,
  /#joinForm:focus-within/,
  "must not jump on mere focus — only body.keyboard-open",
);
assert.match(css, /body\.keyboard-open \.welcome/);
assert.match(css, /\.join-panel \.welcome-secondary-actions/);

assert.match(
  html,
  /id="joinForm"[\s\S]*id="trainerBtn"[\s\S]*<\/form>/,
  "Trainer must sit inside the join card",
);

assert.match(bootSrc, /visualViewport/);
assert.match(bootSrc, /keyboardLikely/);
assert.match(eventsSrc, /scrollIntoView/);
assert.match(eventsSrc, /keyboard-open/);

console.log("Welcome keyboard / Trainer-group layout checks passed.");
