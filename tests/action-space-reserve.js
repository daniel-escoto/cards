#!/usr/bin/env node
/**
 * Guards the end-of-hand jump: when a hand ends (showdown / fold-win → ready-up) or the hero
 * folds, the control panel must keep its in-hand height. Bet controls stay laid out with
 * visibility:hidden, an empty button row gets an invisible placeholder, and winner lines share
 * the bet slot instead of adding a row.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const tableSrc = fs.readFileSync(path.join(root, "public/app-table.ts"), "utf8");
const tableJs = fs.readFileSync(path.join(root, "dist/public/app-table.js"), "utf8");

// 1. Bet controls are never display:none'd by the renderer.
assert.doesNotMatch(tableSrc, /betControls\.classList\.(add|remove|toggle)\("hidden"/);
const dom = new JSDOM(html);
const { document } = dom.window;
const betControls = document.querySelector("#betControls");
assert.ok(!betControls.classList.contains("hidden"), "bet controls start laid out, not display:none");
assert.ok(betControls.classList.contains("is-reserved"), "bet controls start reserved");

// 2. CSS: reserved = visibility only; winners share the bet slot; fixed row tracks.
const block = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[2] : "";
};
assert.match(block(".bet-controls.is-reserved,\n.action-placeholder"), /visibility:\s*hidden/);
assert.match(block(".control-panel > .winner-list,\n.control-panel > .bet-controls"), /grid-row:\s*5/);
assert.match(block(".control-panel"), /grid-template-rows:\s*auto 0 auto auto auto/);

// 3. reserveActionSpace fills empty rows with invisible, unfocusable placeholders.
const grab = (fn) => {
  const start = tableJs.indexOf(`function ${fn}(`);
  assert.ok(start >= 0, `${fn} exists`);
  const end = tableJs.indexOf("\nfunction ", start + 10);
  return tableJs.slice(start, end === -1 ? undefined : end);
};
const context = {
  document,
  gameButtons: document.querySelector("#gameButtons"),
  betControls,
  betPresets: document.querySelector("#betPresets"),
};
vm.runInNewContext(
  ["setBetControlsReserved", "actionPlaceholder", "reserveActionSpace"].map(grab).join("\n") +
    "\nthis.reserve = setBetControlsReserved; this.fill = reserveActionSpace;",
  context,
);
context.reserve(true);
context.fill();
const placeholder = context.gameButtons.querySelector(".action-placeholder");
assert.ok(placeholder, "empty button row gets a placeholder (showdown / folded)");
assert.equal(placeholder.tabIndex, -1);
assert.equal(placeholder.getAttribute("aria-hidden"), "true");
assert.ok(context.betPresets.querySelector(".action-placeholder"), "empty presets keep their row");
assert.equal(betControls.getAttribute("aria-hidden"), "true");
assert.equal(betControls.inert, true);

context.gameButtons.innerHTML = "<button>Fold</button>";
context.betPresets.innerHTML = "<button>All in</button>";
context.reserve(false);
context.fill();
assert.equal(context.gameButtons.querySelector(".action-placeholder"), null, "no placeholder next to real buttons");
assert.equal(betControls.hasAttribute("aria-hidden"), false);
assert.equal(betControls.inert, false);

console.log("Action space reserve checks passed.");
