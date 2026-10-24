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
assert.match(block(".control-panel"), /grid-template-rows:\s*auto 0 minmax\(calc\(15px \* 1\.35\), auto\) auto auto/);

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
  winnerList: document.querySelector("#winnerList"),
  state: { phase: "flop" },
};
const panel = document.querySelector(".control-panel");
vm.runInNewContext(
  ["setBetControlsReserved", "actionPlaceholder", "reserveActionSpace", "winnerHowText"]
    .map(grab)
    .join("\n") +
    "\nthis.reserve = setBetControlsReserved; this.fill = reserveActionSpace; this.how = winnerHowText;",
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

assert.ok(!panel.classList.contains("is-result") && !panel.classList.contains("is-idle"), "in-hand: default layout");

// 4. Hand end fills the reserved slot: result block when there are winners, centered status otherwise.
context.gameButtons.innerHTML = "";
context.reserve(true);
context.fill();
assert.ok(panel.classList.contains("is-idle"), "showdown / folded: status centered in the space");
assert.ok(!panel.classList.contains("is-result"));

context.winnerList.innerHTML = '<div class="result-line">x</div>';
context.gameButtons.innerHTML = "<button>Ready up</button>";
context.fill();
assert.ok(panel.classList.contains("is-result"), "ready-up with winners: result block layout");
assert.ok(!panel.classList.contains("is-idle"));
assert.match(block(".control-panel.is-result > .winner-list,\n.control-panel.is-result > .bet-controls"), /grid-row:\s*3/);
assert.match(block(".control-panel.is-idle > .turn-info"), /grid-row:\s*3 \/ 6/);

// 5. Pre-game (lobby / waiting for players, incl. the first ready-up): no hand to stay stable
// against, so the panel drops the reserved bet row and fits its content.
context.winnerList.innerHTML = "";
for (const phase of ["lobby", "complete"]) {
  context.state = { phase };
  context.gameButtons.innerHTML = "<button>+ Add bot</button>";
  context.reserve(true);
  context.fill();
  assert.ok(panel.classList.contains("is-compact"), `${phase} without a result: compact panel`);
  assert.ok(!panel.classList.contains("is-idle") && !panel.classList.contains("is-result"));
}
context.gameButtons.innerHTML = "";
context.fill();
assert.ok(panel.classList.contains("is-compact"), "lobby with no buttons: still compact");
assert.ok(!panel.classList.contains("is-idle"), "lobby: no centered idle reserve");
// Mid-hand waiting states (folded / showdown) keep the reserve so nothing jumps.
for (const phase of ["preflop", "flop", "river", "showdown"]) {
  context.state = { phase };
  context.fill();
  assert.ok(!panel.classList.contains("is-compact"), `${phase}: keeps reserved space`);
  assert.ok(panel.classList.contains("is-idle"), `${phase}: status centered in the reserve`);
}
// After a hand, ready-up with a result keeps the full height (result block).
context.state = { phase: "complete" };
context.winnerList.innerHTML = '<div class="result-line">x</div>';
context.gameButtons.innerHTML = "<button>Ready up</button>";
context.fill();
assert.ok(panel.classList.contains("is-result") && !panel.classList.contains("is-compact"));
const compactBlock = block(
  ".control-panel.is-compact > .bet-controls,\n.control-panel.is-compact > .winner-list,\n.control-panel.is-compact .action-placeholder",
);
assert.match(compactBlock, /display:\s*none/, "compact hides the reserved bet row and placeholders");
assert.match(block(".control-panel.is-compact"), /grid-template-rows:\s*auto 0 minmax\(calc\(15px \* 1\.35\), auto\) auto;/);

// 6. Result copy: no "with Everyone else folded".
assert.equal(context.how("Everyone else folded"), "Everyone folded");
assert.equal(context.how("Everyone folded"), "Everyone folded");
assert.equal(context.how("Full House, 4's over 5's"), "Full House, 4's over 5's");
assert.equal(context.how(""), "");
assert.doesNotMatch(tableSrc, /\} with \$\{escapeHtml\(winner\.hand\)\}/);

console.log("Action space reserve checks passed.");
