#!/usr/bin/env node
/**
 * Trainer seat-row popover: markup contract + touch/click opens a fixed tip.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const trainerSrc = fs.readFileSync(path.join(root, "public/trainer.ts"), "utf8");

assert.match(html, /id="trainerSeatPopover"/);
assert.match(html, /class="trainer-seat-popover hidden"/);
assert.match(css, /\.trainer-seat-popover\s*\{[^}]*position:\s*fixed/s);
assert.match(css, /\.trainer-seat-row/);
assert.doesNotMatch(css, /trainer-seat-label\[data-tip/);
assert.match(trainerSrc, /openSeatPopover/);
assert.match(trainerSrc, /POSITION_BLURB/);
assert.match(trainerSrc, /first to act, play tight/);
assert.match(trainerSrc, /acts last, widest range/);
assert.match(trainerSrc, /pointerdown/);

// Runtime: bind trainer, tap a seat row, assert popover content.
const dom = new JSDOM(html, {
  url: "http://127.0.0.1/trainer",
  pretendToBeVisual: true,
  runScripts: "outside-only",
});
const { window } = dom;
const { document } = window;

// Minimal RfiRanges + format stubs so PreflopTrainer.bind can deal a spot.
window.RfiRanges = {
  RANK_ORDER: ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"],
  positionsForTable: (size) =>
    size === 9
      ? ["UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB"]
      : ["UTG", "HJ", "CO", "BTN", "SB"],
  dealRandomRfiSpot: () => ({
    tableSize: 6,
    position: "CO",
    cards: [
      { code: "As", rank: "A", suit: "♠", color: "black" },
      { code: "Kh", rank: "K", suit: "♥", color: "red" },
    ],
    handKey: "AKo",
    standard: "raise",
  }),
  gradeRfiAction: () => ({ correct: true, standard: "raise", handKey: "AKo" }),
  rfiChart: () => null,
  explainRfiDecision: () => ({
    verdict: "correct",
    badge: "Best",
    reason: "Open.",
    borderline: null,
    category: "offsuit_broadway",
    band: "late",
    positionName: "Cutoff",
    playersBehind: 3,
    categoryLabel: "offsuit broadway cards",
    why: ["You're in the Cutoff with 3 players left to act.", "AKo is offsuit broadway."],
    ruleOfThumb: "Late seats: steal more.",
  }),
  rfiTeachingHint: () => ({
    concept: "You're in the Cutoff with 3 players left behind you.",
    reveal: "Raise — open wide late.",
    standard: "raise",
  }),
  rfiPlayersBehind: () => 3,
  rfiPositionName: (seat) => seat,
};
window.HoldemFormat = {
  escapeHtml: (value) =>
    String(value).replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    ),
  cardTemplate: (card) => `<div class="card">${card.rank}${card.suit}</div>`,
};
window.startOfflineHost = undefined;
window.localStorage = {
  store: {},
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  removeItem(key) {
    delete this.store[key];
  },
};

const trainerJs = fs.readFileSync(path.join(root, "dist/public/trainer.js"), "utf8");
window.eval(trainerJs);
assert.ok(window.PreflopTrainer, "PreflopTrainer global");
const handle = window.PreflopTrainer.bind(document);
assert.ok(handle, "trainer bind succeeds");

const players = document.querySelector("#trainerPlayers");
const popover = document.querySelector("#trainerSeatPopover");
assert.ok(players);
assert.ok(popover);
assert.ok(popover.classList.contains("hidden"));

const utg = players.querySelector('.trainer-seat-row[data-seat="UTG"]');
assert.ok(utg, "UTG seat row rendered");
utg.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

assert.ok(!popover.classList.contains("hidden"), "popover opens on seat click");
assert.match(popover.textContent, /UTG/);
assert.match(popover.textContent, /Under the gun/);
assert.match(popover.textContent, /first to act, play tight/);
assert.ok(popover.style.left, "popover positioned with left");
assert.ok(popover.style.top, "popover positioned with top");

const btn = players.querySelector('.trainer-seat-row[data-seat="BTN"]');
assert.ok(btn);
btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
assert.match(popover.textContent, /Button/);
assert.match(popover.textContent, /widest range/);
assert.equal(players.querySelectorAll('.trainer-seat-row[aria-expanded="true"]').length, 1);

document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
assert.ok(popover.classList.contains("hidden"), "outside pointerdown dismisses");

handle.destroy();
console.log("Trainer seat popover checks passed.");
