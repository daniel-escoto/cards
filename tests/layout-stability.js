/**
 * Static guards for layout stability: reserved slots, shadow rings (not border growth),
 * timeline label decoupled from dots, fixed verdict/retry heights.
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
assert.match(css, /\.hand-review-retry-bar\s*\{[^}]*min-height:\s*40px/s);
assert.match(css, /body\.hand-review-open \.hand-review-verdict\.is-idle/);

// Close control is a real icon button (not a naked native square).
assert.match(html, /hand-review-close[^>]*icon-btn|icon-btn[^>]*hand-review-close/);
assert.match(css, /\.hand-review-close\.icon-btn/);

// Between-hands action row shares width evenly (Ready / Review [/ Show hand]).
assert.match(css, /\.control-panel\.is-result > \.game-buttons > button[\s\S]*?flex:\s*1 1 0/);

// Spoiler Mistake path keeps Try again / Show answer without leaking the answer up front.
assert.match(tableSrc, /kind: "spoiler"/);
assert.match(tableSrc, /There was a better play here|formatMistakeNudge/);

// Timeline: hero-decision + result dots only (long hands must not overflow).
assert.match(tableSrc, /handReviewLandableIndexes|is-result/);
assert.match(css, /\.hand-review-timeline\s*\{[^}]*overflow-x:\s*auto/s);

// Showdown holes: main-style appended feed cards (not an inline seat-row slot).
assert.doesNotMatch(css, /\.seat-shown-hand\s*\{/);
assert.doesNotMatch(css, /grid-template-columns:[^;]*64px/);
const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
assert.match(bootSrc, /shown-hand-card/);
assert.match(bootSrc, /seatHoleCardsMayReveal/);

// Welcome: centered idle; keyboard-open only via body class (not focus-within jump).
assert.match(css, /\.welcome\s*\{[^}]*align-content:\s*safe center/s);
assert.doesNotMatch(css, /#joinForm:focus-within/);
assert.match(css, /body\.keyboard-open \.welcome/);
assert.match(html, /id="trainerBtn"[\s\S]*?<\/form>/);

// Trainer mobile (375×667 and SE): seat list must not paint over the feedback/control panel.
// Felt is community | players | panel; players scroll inside their row; panel is opaque + above.
assert.match(
  css,
  /@media \(max-width: 779px\)[\s\S]*?\.trainer-view \.players\s*\{[^}]*overflow-y:\s*auto[^}]*max-height:\s*100%/s,
);
assert.match(
  css,
  /@media \(max-width: 779px\)[\s\S]*?\.trainer-view \.control-panel\s*\{[^}]*z-index:\s*5[^}]*background:\s*var\(--panel\)/s,
);
assert.doesNotMatch(
  css,
  /\.trainer-view \.players\s*\{[^}]*overflow-y:\s*visible/s,
  "visible overflow lets seat rows cover the Mistake panel on 375/SE",
);

// Off-turn action panel: keep raise shell (ignoreRaiseOpen) so height matches your-turn.
assert.match(tableSrc, /ignoreRaiseOpen:\s*disabled/);
assert.match(tableSrc, /ignoreRaiseOpen\?:/);
// No native title tooltip on hero cards (overlaps ½ pot on short panels).
assert.match(bootSrc, /heroHand\.removeAttribute\("title"\)/);
assert.doesNotMatch(bootSrc, /heroHand\.title\s*=/);
// Hand Review retry reveals live controls without leaving the review shell.
assert.match(css, /body\.hand-review-open\.hand-review-retrying[\s\S]*?\.game-buttons/);
assert.match(tableSrc, /hand-review-retrying/);
// Retry must keep #turnInfo hidden — showing it stacked "Call N" on HAND REVIEW.
assert.match(
  css,
  /body\.hand-review-open\.hand-review-retrying \.control-panel > \.turn-info\s*\{[^}]*display:\s*none\s*!important/s,
);
assert.doesNotMatch(
  css,
  /body\.hand-review-open\.hand-review-retrying \.control-panel > \.turn-info\s*\{[^}]*display:\s*block\s*!important/s,
);

console.log("Layout stability static checks passed.");
