#!/usr/bin/env node
/**
 * Hand Review navigation: land only on hero decisions + result; no-op at ends
 * (no re-render / card re-animation); edge buttons disabled; retry uses live controls.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
const eventsSrc = fs.readFileSync(path.join(__dirname, "../public/app-events.ts"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");

assert.match(tableSrc, /function handReviewLandableIndexes/);
assert.match(tableSrc, /step\.isHeroDecision \|\| step\.kind === "result"/);
assert.match(tableSrc, /function handReviewJumpToStart/);
assert.match(tableSrc, /function handReviewJumpToEnd/);
assert.match(tableSrc, /function syncHandReviewNavButtons/);
assert.match(tableSrc, /aria-disabled/);

// Stepping past an end (e.g. Next on the last landable step) is a hard no-op —
// return before paintHandReviewStep so card DOM / animations are untouched.
const stepBy = tableSrc.match(
  /function handReviewStepBy\([\s\S]*?\nfunction /,
);
assert.ok(stepBy, "handReviewStepBy present");
assert.match(
  stepBy[0],
  /if \(nextPos < 0 \|\| nextPos >= landable\.length\) return/,
  "Next at last step / Prev at first must return before paintHandReviewStep",
);
assert.match(
  stepBy[0],
  /At an end: no-op/,
  "end-step no-op must not re-paint or re-animate cards",
);
assert.ok(
  stepBy[0].indexOf("nextPos < 0 || nextPos >= landable.length") <
    stepBy[0].indexOf("paintHandReviewStep(landable[nextPos]!)"),
  "end guard precedes any paintHandReviewStep call in handReviewStepBy",
);

// Same-index paint is a no-op (no bust cache / no card re-animation).
// Unchanged hole/board cards keep lastHero/Community signatures between steps.
const paintFn = tableSrc.match(/function paintHandReviewStep\([\s\S]*?\nfunction /);
assert.ok(paintFn, "paintHandReviewStep present");
assert.match(
  paintFn[0],
  /next === handReviewStepIndex/,
  "same-step paint must early-return (no card re-animation)",
);
assert.match(
  paintFn[0],
  /Keep lastHero\/Community signatures so unchanged cards stay still/,
);
assert.doesNotMatch(
  paintFn[0],
  /bustCardRenderCache/,
  "step paints must not bust card signatures (only newly dealt cards animate)",
);

// Timeline dots = landable frames only (decisions + result).
assert.match(tableSrc, /is-result/);
assert.match(tableSrc, /handReviewLandableIndexes\(\)/);
assert.match(
  tableSrc,
  /bot\/street frames are never landed on/,
  "←/→ must not walk bot/street frames",
);

// Retry uses live Fold + Call/Raise — never a bespoke 3-button row.
assert.match(tableSrc, /function submitHandReviewRetryAction/);
assert.match(tableSrc, /renderHeroActionControls\(reviewHero/);
assert.doesNotMatch(tableSrc, /hand-review-retry-actions/);
assert.doesNotMatch(
  tableSrc,
  /choices:\s*Array<"fold" \| "check" \| "call" \| "raise">/,
);
assert.match(
  eventsSrc,
  /handReviewRetryItem[\s\S]*matchesKeybind\(event, "fold"\)/,
  "retry mode must reuse live Fold/Call/Raise keybinds",
);

// Nav click handlers respect disabled + jump helpers.
assert.match(eventsSrc, /handReviewJumpToStart/);
assert.match(eventsSrc, /handReviewJumpToEnd/);
assert.match(eventsSrc, /handReviewStartBtn\?\.disabled/);
assert.match(eventsSrc, /handReviewNextBtn\?\.disabled/);

// Disabled nav styling: greyed, no focus ring, fixed size.
assert.match(css, /\.control-panel \.hand-review-nav > button:disabled/);
assert.match(css, /pointer-events:\s*none/);
assert.match(
  css,
  /\.control-panel \.hand-review-nav > button:disabled:focus-visible[\s\S]*?outline:\s*none/,
);

// Review removed from hamburger menu — post-hand button + V only.
assert.doesNotMatch(html, /id="handReviewBtn"/);
assert.match(tableSrc, /Review hand/);
assert.match(eventsSrc, /hasReviewableCompletedHand\(state\)/);

console.log("Hand review nav checks passed.");
