#!/usr/bin/env node
/**
 * Seat list auto-scroll: keep the acting / winner row visible inside `#players`.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const tableSrc = fs.readFileSync(path.join(root, "public/app-table.ts"), "utf8");
const bootSrc = fs.readFileSync(path.join(root, "public/app-boot.ts"), "utf8");
const fixtures = fs.readFileSync(path.join(root, "tests/visual/fixtures.ts"), "utf8");
const layoutSpec = fs.readFileSync(
  path.join(root, "tests/visual/layout-stability.spec.ts"),
  "utf8",
);

assert.match(tableSrc, /function syncPlayersListAutoScroll/);
assert.match(tableSrc, /function scrollPlayersListChildIntoView/);
assert.match(tableSrc, /function bindPlayersListScrollGuard/);
assert.match(tableSrc, /PLAYERS_LIST_MANUAL_SCROLL_PAUSE_MS\s*=\s*4000/);
assert.match(tableSrc, /prefers-reduced-motion:\s*reduce/);
assert.match(tableSrc, /playersListManualScrollPaused/);
assert.match(tableSrc, /playersListOverflows/);
assert.match(tableSrc, /showdown-winner|shown-hand-card/);
assert.match(tableSrc, /hand:\$\{hand\}:top/);
assert.match(tableSrc, /syncPlayersListAutoScroll\(\)/);
const autoScrollFn =
  /function scrollPlayersListChildIntoView\([\s\S]*?\n\}/.exec(tableSrc)?.[0] || "";
assert.match(autoScrollFn, /players\.scrollTo|players\.scrollTop/);
assert.doesNotMatch(
  autoScrollFn,
  /scrollIntoView\(/,
  "players auto-scroll must use container scrollTop/scrollTo — not scrollIntoView",
);
assert.doesNotMatch(
  /function syncPlayersListAutoScroll[\s\S]*?\nfunction /.exec(tableSrc)?.[0] || "",
  /window\.scrollTo|document\.documentElement\.scrollTop/,
);

assert.match(bootSrc, /data-player-id="\$\{escapeHtml\(player\.id\)\}"/);

assert.match(fixtures, /function forceCrowdedInHand/);
assert.match(layoutSpec, /players list auto-scroll/);
assert.match(layoutSpec, /acting row must sit inside #players viewport/);

console.log("players-list-auto-scroll ok");
