/**
 * Static guards for layout stability: reserved slots, shadow rings (not border growth),
 * timeline label decoupled from dots, fixed verdict/retry heights.
 * Playwright bbox measurement lives in scripts/check-layout-stability.mjs (needs server).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");

// Hand Review: dots on their own row; label below (not a sibling that can shove them).
assert.match(css, /\.hand-review-timeline-wrap\s*\{[^}]*grid-template-rows:\s*auto auto/s);
assert.match(css, /\.hand-review-step-label\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
assert.match(css, /\.hand-review-step-label\s*\{[^}]*text-overflow:\s*ellipsis/s);

// Active ring via box-shadow with matching transparent idle footprint (no layout size change).
assert.match(
  css,
  /\.hand-review-dot\s*\{[^}]*box-shadow:\s*0 0 0 2px transparent,\s*0 0 0 4px transparent/s,
);
assert.match(css, /\.hand-review-dot\.is-active\s*\{[^}]*box-shadow:\s*0 0 0 2px/s);
assert.match(css, /\.hand-review-dot:focus-visible/);

// Verdict + retry slots keep height when idle / empty.
assert.match(css, /\.hand-review-verdict\s*\{[^}]*min-height:/s);
assert.match(css, /\.hand-review-retry-bar\s*\{[^}]*min-height:\s*44px/s);
assert.match(css, /body\.hand-review-open \.hand-review-verdict\.is-idle/);

// Close control is a real icon button (not a naked native square).
assert.match(html, /hand-review-close[^>]*icon-btn|icon-btn[^>]*hand-review-close/);
assert.match(css, /\.hand-review-close\.icon-btn/);

// Between-hands action row shares width evenly (Ready / Review [/ Show hand]).
assert.match(css, /\.control-panel\.is-result > \.game-buttons > button[\s\S]*?flex:\s*1 1 0/);

// Spoiler Mistake path keeps Try again / Show answer without leaking the answer up front.
assert.match(tableSrc, /kind: "spoiler"/);
assert.match(tableSrc, /There was a better play here|formatMistakeNudge/);

// Timeline: hero-decision dots only (long hands must not overflow).
assert.match(tableSrc, /only hero decision dots|heroIndexes/);
assert.match(css, /\.hand-review-timeline\s*\{[^}]*overflow-x:\s*auto/s);

// Seat hole cards: reserved grid column + inline markup (no appended feed cards).
assert.match(css, /\.seat-shown-hand\s*\{/);
assert.match(css, /grid-template-columns:[^;]*48px/s);

// Welcome: centered idle; keyboard-open only via body class (not focus-within jump).
assert.match(css, /\.welcome\s*\{[^}]*align-content:\s*safe center/s);
assert.doesNotMatch(css, /#joinForm:focus-within/);
assert.match(css, /body\.keyboard-open \.welcome/);
assert.match(html, /id="trainerBtn"[\s\S]*?<\/form>/);

console.log("Layout stability static checks passed.");
