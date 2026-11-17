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

// Verdict keeps a reserved slot; idle retry bar collapses (slack + bottom-pinned nav).
assert.match(css, /\.hand-review-verdict\s*\{[^}]*min-height:/s);
assert.match(css, /\.hand-review-retry-bar:not\(\.hidden\):not\(\.is-idle\):has\(>\s*\.hand-review-try-again\)\s*\{[^}]*min-height:\s*var\(--cp-action-btn-h\)/s);
assert.match(css, /body\.hand-review-open \.hand-review-verdict\.is-idle/);
assert.match(css, /body\.hand-review-open \.hand-review-retry-bar\.is-idle\s*\{[^}]*display:\s*none/s);

// Close control is a real icon button in the hand-row (top-right with pot).
assert.match(html, /hand-row[\s\S]*hand-review-close[^>]*icon-btn|hand-row[\s\S]*icon-btn[^>]*hand-review-close/);
assert.match(css, /\.hand-row \.hand-review-close\.icon-btn/);
/* Verdict no longer reserves a 4-line box — chrome is absolute in the live
   prompt+controls tracks, so panel height stays on those tracks (min-height:0). */
assert.match(css, /\.hand-review-verdict\s*\{[^}]*min-height:\s*0/s);
assert.match(
  css,
  /body\.hand-review-open:not\(\.hand-review-retrying\) \.hand-review-bottom\s*\{[^}]*position:\s*static/s,
  "non-retry bottom stack stays in-flow inside absolute chrome (no absolute gap)",
);
assert.match(
  css,
  /body\.hand-review-open:not\(\.hand-review-retrying\) \.control-panel > \.game-buttons[\s\S]*?visibility:\s*hidden/s,
  "non-retry review must reserve button row (visibility, not display:none)",
);
assert.match(
  css,
  /body\.hand-review-open\.hand-review-retrying \.hand-review-bottom\s*\{[^}]*display:\s*none\s*!important/s,
);

// Between-hands action row shares width evenly (Ready / Review or Show hand).
assert.match(css, /\.control-panel\.is-result > \.game-buttons > button[\s\S]*?flex:\s*1 1 0/);

// Spoiler Mistake path keeps Try again / Show answer without leaking the answer up front.
assert.match(tableSrc, /kind: "spoiler"/);
assert.match(tableSrc, /There was a better play here|formatMistakeNudge/);

// Timeline: hero-decision + result dots only (long hands must not overflow).
assert.match(tableSrc, /handReviewLandableIndexes|is-result/);
assert.match(css, /\.hand-review-timeline\s*\{[^}]*overflow-x:\s*auto/s);

// Showdown holes: appended feed rows (not an inline seat-row slot); sm cards, row grows.
assert.doesNotMatch(css, /\.seat-shown-hand\s*\{/);
assert.doesNotMatch(css, /grid-template-columns:[^;]*64px/);
assert.doesNotMatch(
  css,
  /\.table-player-row\.shown-hand-card\s*\{[^}]*max-height:/s,
  "revealed-hand row must grow with cards (no locked max-height)",
);
assert.doesNotMatch(
  css,
  /\.shown-hand \.card\s*\{[^}]*width:\s*1[67]px/s,
  "revealed hole cards must not use the tiny compact size from #99",
);
assert.match(
  css,
  /\.shown-hand \.card\s*\{[^}]*width:\s*var\(--card-sm-w\)/s,
  "revealed hole cards use the shared sm card size token",
);
assert.match(
  css,
  /\.table-player-row\.shown-hand-card\s*\{[^}]*align-items:\s*center/s,
  "revealed-hand row vertically centers name and stack",
);
assert.match(
  css,
  /\.table-player-row\s*\{[^}]*flex-shrink:\s*0/s,
  "seat rows must not flex-shrink inside the constrained .players list",
);
assert.match(
  css,
  /\.table-player-row\.shown-hand-card\s*\{[^}]*min-height:\s*auto/s,
  "reveal rows restore content-based min-height so sm cards are not clipped",
);
assert.match(
  css,
  /\.table-player-row\.shown-hand-card\s*\{[^}]*flex-shrink:\s*0/s,
  "reveal rows must not shrink below card height when the seat list is crowded",
);
const tokensCss = fs.readFileSync(path.join(__dirname, "../public/tokens.css"), "utf8");
assert.match(tokensCss, /--card-sm-w:\s*34px/, "sm card width lives in tokens");
const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
assert.match(bootSrc, /shown-hand-card/);
assert.match(bootSrc, /seatHoleCardsMayReveal/);
assert.match(bootSrc, /data-player-id=/);

// Seat list auto-scroll: keep acting/winner rows visible inside `#players` only.
assert.match(tableSrc, /function syncPlayersListAutoScroll/);
assert.match(tableSrc, /function scrollPlayersListChildIntoView/);
assert.match(tableSrc, /PLAYERS_LIST_MANUAL_SCROLL_PAUSE_MS\s*=\s*4000/);
assert.match(tableSrc, /prefers-reduced-motion:\s*reduce/);
assert.match(tableSrc, /bindPlayersListScrollGuard/);
const playersAutoScrollFn =
  /function scrollPlayersListChildIntoView\([\s\S]*?\n\}/.exec(tableSrc)?.[0] || "";
assert.match(playersAutoScrollFn, /players\.scrollTo|players\.scrollTop/);
assert.doesNotMatch(
  playersAutoScrollFn,
  /scrollIntoView\(/,
  "auto-scroll must use container scrollTop, not element.scrollIntoView (page jump risk)",
);

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
// Check/Fold pre-action: same Fold slot off-turn (enabled toggle).
// Unarmed = danger-outline; armed = solid danger (+ selected).
assert.match(tableSrc, /addCheckFoldToggleButton/);
assert.match(tableSrc, /aria-pressed/);
assert.match(css, /\.game-buttons > button\.danger-outline/);
assert.match(css, /\.game-buttons > button\.danger\.selected/);
assert.doesNotMatch(
  css,
  /\.game-buttons > button\.danger\.secondary/,
  "unarmed Check/Fold must not reuse leave-game pink secondary+danger recipe",
);
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
