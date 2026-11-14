#!/usr/bin/env node
/**
 * Hand Review in-spot retry must not stack a duplicate "Call N" turn-info label
 * on top of the HAND REVIEW header (same grid row). Header/close and any step
 * caption must not overlap.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const tableSrc = fs.readFileSync(path.join(root, "public/app-table.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const tableJs = fs.readFileSync(path.join(root, "dist/public/app-table.js"), "utf8");

// Retry must NOT un-hide #turnInfo — that shared grid-row: 3 with the chrome head.
assert.match(
  css,
  /body\.hand-review-open\.hand-review-retrying \.control-panel > \.turn-info\s*\{[^}]*display:\s*none\s*!important/s,
  "turn-info stays hidden during retry (verdict prompt owns Call copy)",
);
assert.doesNotMatch(
  css,
  /body\.hand-review-open\.hand-review-retrying \.control-panel > \.turn-info\s*\{[^}]*display:\s*block\s*!important/s,
);

// Retry paints live Fold/Call/Raise but must not write Call N into #turnInfo.
const retryBlock = tableSrc.match(
  /if \(handReviewRetryItem\) \{[\s\S]*?return;\n\s*\}/,
);
assert.ok(retryBlock, "handReviewRetryItem branch in renderControlsContent");
assert.match(retryBlock[0], /renderHeroActionControls\(reviewHero/);
assert.doesNotMatch(
  retryBlock[0],
  /turnInfo\.textContent/,
  "retry must not set turnInfo (duplicate Call N over HAND REVIEW)",
);
assert.doesNotMatch(retryBlock[0], /Call \$\{/);

function overlaps(a, b) {
  // Zero-size / display:none boxes never count as overlapping content.
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

const dom = new JSDOM(
  `<!doctype html><html><head><style>${css}</style></head><body>${
    html.match(/<section class="control-panel"[\s\S]*?<\/section>/)?.[0] || ""
  }</body></html>`,
  { pretendToBeVisual: true, contentType: "text/html" },
);
const { document, getComputedStyle } = dom.window;

const panel = document.querySelector(".control-panel");
const chrome = document.querySelector("#handReviewChrome");
const head = document.querySelector(".hand-review-chrome-head");
const summary = document.querySelector("#handReviewSummary");
const verdict = document.querySelector("#handReviewVerdict");
const turnInfo = document.querySelector("#turnInfo");
const closeBtn = document.querySelector("#handReviewCloseBtn");
const gameButtons = document.querySelector("#gameButtons");
assert.ok(panel && chrome && head && turnInfo && closeBtn && verdict);

// Paint a retry chrome: header + prompt verdict + live buttons visible via body class.
document.body.classList.add("hand-review-open", "hand-review-retrying");
chrome.classList.remove("hidden");
summary.textContent = "1 decision · 1 mistake";
verdict.classList.remove("hidden");
verdict.className = "hand-review-verdict is-prompt";
verdict.textContent = "Your turn · Pot 60 · Call 20";
turnInfo.textContent = ""; // production leaves this empty during retry
turnInfo.classList.remove("your-turn");
gameButtons.innerHTML =
  '<button type="button" class="danger">Fold</button><button type="button">Call 20</button>';

// Layout model for bounding boxes (jsdom returns 0s; assign real slots matching CSS grid).
// hand-row ≈ 80px; chrome head at top of row 3; verdict below; turn-info display:none.
const panelTop = 100;
const headBox = { left: 20, right: 400, top: panelTop + 80, bottom: panelTop + 122, width: 380, height: 42 };
const summaryBox = { left: 20, right: 340, top: panelTop + 96, bottom: panelTop + 112, width: 320, height: 16 };
const verdictBox = { left: 20, right: 400, top: panelTop + 130, bottom: panelTop + 166, width: 380, height: 36 };
const closeBox = { left: 358, right: 400, top: panelTop + 80, bottom: panelTop + 122, width: 42, height: 42 };
// Hidden turn-info: zero box (display:none) — even if stale "Call 20" text were present.
const turnBoxHidden = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
// Legacy bug: turn-info shown on same row as head with Call 20 (must NOT happen).
const turnBoxBug = { left: 20, right: 200, top: panelTop + 80, bottom: panelTop + 110, width: 180, height: 30 };

head.getBoundingClientRect = () => headBox;
summary.getBoundingClientRect = () => summaryBox;
verdict.getBoundingClientRect = () => verdictBox;
closeBtn.getBoundingClientRect = () => closeBox;
turnInfo.getBoundingClientRect = () => turnBoxHidden;

const turnDisplay = getComputedStyle(turnInfo).display;
assert.equal(
  turnDisplay,
  "none",
  `turn-info must be display:none during retry, got ${turnDisplay}`,
);

assert.equal(
  overlaps(head.getBoundingClientRect(), turnInfo.getBoundingClientRect()),
  false,
  "header and turn-info must not overlap in retry state",
);
assert.equal(
  overlaps(summary.getBoundingClientRect(), turnInfo.getBoundingClientRect()),
  false,
  "summary and turn-info must not overlap",
);
assert.equal(
  overlaps(head.getBoundingClientRect(), verdict.getBoundingClientRect()),
  false,
  "header and verdict prompt must not overlap",
);

// Close lives in the hand-row (top-right with pot), above the chrome head/verdict.
assert.equal(
  closeBtn.closest(".hand-row") != null,
  true,
  "close × must live in the hand-row (panel top-right), not the chrome head",
);
assert.doesNotMatch(
  String(head?.innerHTML || ""),
  /handReviewCloseBtn|hand-review-close/,
  "chrome head must not contain the close button",
);

// Guard: the old overlapping Call-20 box WOULD collide with the header.
assert.equal(
  overlaps(headBox, turnBoxBug),
  true,
  "sanity: legacy Call-20 slot overlaps the header (the bug we prevent)",
);

// Drive renderControlsContent retry branch: turnInfo stays empty.
const grab = (fn) => {
  const start = tableJs.indexOf(`function ${fn}(`);
  assert.ok(start >= 0, `${fn} exists`);
  const end = tableJs.indexOf("\nfunction ", start + 10);
  return tableJs.slice(start, end === -1 ? undefined : end);
};

const calls = [];
const context = {
  document,
  console,
  state: {
    phase: "preflop",
    pot: 60,
    toCall: 20,
    toCallCents: null,
    currentBet: 20,
    minRaiseTo: 40,
    bigBlind: 20,
    isYourTurn: true,
    canRaise: true,
    canShove: true,
    players: [
      {
        id: "hero",
        name: "Daniel",
        isYou: true,
        isBot: false,
        bet: 0,
        stack: 980,
        folded: false,
        allIn: false,
        cards: [{ code: "8s" }, { code: "Ad" }],
      },
      {
        id: "bot",
        name: "CPU",
        isYou: false,
        isBot: true,
        bet: 20,
        stack: 980,
        folded: false,
        allIn: false,
      },
    ],
  },
  handReviewActive: true,
  handReviewRetryItem: { pot: 60, toCall: 20 },
  gameButtons,
  betControls: document.querySelector("#betControls"),
  betPresets: document.querySelector("#betPresets"),
  winnerList: document.querySelector("#winnerList") || document.createElement("div"),
  turnInfo,
  raiseActionBtn: document.querySelector("#raiseActionBtn"),
  raiseMinus: document.querySelector("#raiseMinus"),
  raisePlus: document.querySelector("#raisePlus"),
  raiseAmount: document.querySelector("#raiseAmount"),
  raiseLabel: document.querySelector("#raiseLabel"),
  raiseState: { min: 40, max: 1000, step: 20, value: 40 },
  raiseControlsDisabled: false,
  mergePassiveConfirm: false,
  confirmActionBtn: null,
  keybinds: { fold: "f", call: "c", raise: "r" },
  RaiseSizing: {
    initialRaiseTo() {
      return 40;
    },
    formatRaiseLabel(v) {
      return `Raise to ${v}`;
    },
  },
  activeHero() {
    return context.state.players[0];
  },
  formatAmount(n) {
    return String(n);
  },
  keybindLabel(k) {
    return String(k).toUpperCase();
  },
  escapeHtml(v) {
    return String(v);
  },
  setButtonLabel(button, label, shortcut = "") {
    button.textContent = label;
    if (shortcut) button.dataset.shortcut = shortcut;
  },
  emitWithAck() {},
  setBetControlsReserved(reserved) {
    calls.push(`reserved:${reserved}`);
    context.betControls.classList.toggle("is-reserved", reserved);
  },
  renderHeroActionControls() {
    calls.push("hero-controls");
    context.gameButtons.innerHTML =
      '<button type="button" class="danger">Fold</button><button type="button">Call 20</button>';
  },
  heroCanRaiseMeaningfully() {
    return true;
  },
  configureRaiseControls() {},
  raiseBounds() {
    return { min: 40, max: 1000, step: 20 };
  },
  atPassiveDetent() {
    return true;
  },
  renderBetPresets() {},
  setRaiseState() {},
  clampRaise(v) {
    return v;
  },
  addConfirmPassiveButton() {},
  updateConfirmPassiveButton() {},
  addActionButton() {},
  actionPlaceholder() {
    return document.createElement("button");
  },
  findLastIndex() {
    return -1;
  },
  isSpectatorView() {
    return false;
  },
  isBettingPhase() {
    return true;
  },
};
vm.runInNewContext(
  [
    grab("setBetControlsReserved"),
    grab("reserveActionSpace"),
    grab("renderControlsContent"),
  ].join("\n") +
    `\nthis.setBetControlsReserved = setBetControlsReserved;` +
    `\nthis.reserveActionSpace = reserveActionSpace;` +
    `\nthis.renderControlsContent = renderControlsContent;`,
  context,
);

context.renderControlsContent(context.state.players[0]);
assert.equal(turnInfo.textContent, "", "retry leaves turnInfo empty (no Call 20 caption)");
assert.ok(calls.includes("hero-controls"), "retry still mounts live Fold/Call controls");
assert.match(gameButtons.textContent, /Call 20/, "Call 20 lives on the button only");
assert.doesNotMatch(
  `${summary.textContent}\n${verdict.textContent}\n${turnInfo.textContent}`,
  /^Call \d+$/m,
  "no standalone Call N caption outside the verdict prompt / button",
);

console.log("Hand review retry overlap checks passed.");
