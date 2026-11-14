/**
 * Hand Review keyboard shortcuts: Review hand (V), step ←/→, Home/End, T/A, Esc.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const Keybinds = require("../dist/public/app-keybinds.js");
assert.equal(Keybinds.DEFAULT_KEYBINDS.reviewHand, "v");
assert.equal(Keybinds.DEFAULT_KEYBINDS.raise, "r");
assert.notEqual(
  Keybinds.DEFAULT_KEYBINDS.reviewHand,
  Keybinds.DEFAULT_KEYBINDS.raise,
  "Review hand must not steal raise (R)",
);

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
assert.match(tableSrc, /Review hand/);
assert.match(tableSrc, /keybinds\.reviewHand/);
assert.match(tableSrc, /Try again[\s\S]*?<kbd[^>]*>T<\/kbd>/);
assert.match(tableSrc, /Show answer[\s\S]*?<kbd[^>]*>A<\/kbd>/);
assert.match(
  tableSrc,
  /className = "secondary hand-review-show-answer has-shortcut"/,
  "Show answer is a clean secondary button (not an underlined ghost)",
);

const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
assert.match(
  css,
  /button\.has-shortcut,\s*\n\.raise-action\.has-shortcut\s*\{[^}]*gap:\s*var\(--space-8\)/s,
  "every has-shortcut control shares the Ready/Review 8px badge gap",
);
assert.match(
  css,
  /\.hand-review-retry-bar > \.hand-review-show-answer\s*\{[^}]*text-decoration:\s*none/s,
  "Show answer must not underline through the A badge",
);
assert.doesNotMatch(
  css,
  /\.hand-review-retry-bar > \.hand-review-show-answer\s*\{[^}]*text-decoration:\s*underline/s,
);

const eventsSrc = fs.readFileSync(path.join(__dirname, "../public/app-events.ts"), "utf8");
assert.match(eventsSrc, /reviewHand/);
assert.match(eventsSrc, /ArrowLeft/);
assert.match(eventsSrc, /ArrowRight/);
assert.match(eventsSrc, /Home/);
assert.match(eventsSrc, /End/);
assert.match(eventsSrc, /hand-review-try-again/);
assert.match(eventsSrc, /hand-review-show-answer/);
assert.match(eventsSrc, /hand-review-continue/);
assert.match(eventsSrc, /event\.key === "Enter"/);
assert.match(eventsSrc, /hideHandReview/);

// Exercise the keydown listener with Hand Review stubs.
const source = fs.readFileSync(require.resolve("../dist/public/app-events.js"), "utf8");
const listener = source.slice(source.indexOf('document.addEventListener("keydown",'));
let handler;
const calls = [];
const context = {
  document: {
    addEventListener: (_name, callback) => {
      handler = callback;
    },
    querySelector: (sel) => {
      if (sel.includes("try-again")) {
        return {
          disabled: false,
          click: () => calls.push("try"),
        };
      }
      if (sel.includes("show-answer")) {
        return {
          disabled: false,
          click: () => calls.push("show"),
        };
      }
      return null;
    },
  },
  gameMenuModal: { classList: { contains: () => true } },
  handReviewActive: true,
  handReviewRetryItem: null,
  lastHandReplay: { steps: [{}, {}, {}] },
  hideHandReview: () => calls.push("hide"),
  handReviewStepBy: (delta) => calls.push(`step:${delta}`),
  handReviewJumpToStart: () => calls.push("jump:start"),
  handReviewJumpToEnd: () => calls.push("jump:end"),
  paintHandReviewStep: (index) => calls.push(`paint:${index}`),
  state: null,
  betControls: { classList: { contains: () => true } },
  mergePassiveConfirm: false,
  raiseState: { value: 0 },
  changeRaise: () => {},
  atPassiveDetent: () => true,
  emitWithAck: () => {},
  matchesKeybind: () => false,
  raiseActionBtn: { click: () => {} },
};
vm.runInNewContext(listener, context);

function press(key, options = {}) {
  let prevented = false;
  handler({
    key,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { matches: () => false, closest: () => null },
    preventDefault: () => {
      prevented = true;
    },
    ...options,
  });
  return prevented;
}

calls.length = 0;
press("Escape");
assert.deepEqual(calls, ["hide"]);

calls.length = 0;
assert.equal(press("ArrowLeft"), true);
assert.deepEqual(calls, ["step:-1"]);
assert.equal(press("ArrowRight"), true);
assert.deepEqual(calls, ["step:-1", "step:1"]);

calls.length = 0;
press("Home");
press("End");
assert.deepEqual(calls, ["jump:start", "jump:end"]);

calls.length = 0;
press("t");
press("a");
assert.deepEqual(calls, ["try", "show"]);

// Typing in an input must not step review.
calls.length = 0;
press("ArrowRight", { target: { matches: (sel) => sel.includes("input"), closest: () => null } });
assert.equal(calls.length, 0);

console.log("Hand review key checks passed.");
