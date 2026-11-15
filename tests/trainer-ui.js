#!/usr/bin/env node
/**
 * Preflop Trainer — table-layout puzzle markup + shared game classes.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const trainer = fs.readFileSync(path.join(__dirname, "../public/trainer.ts"), "utf8");

assert.doesNotMatch(html, /id="practiceBtn"/);
assert.match(html, /id="trainerBtn"/);
assert.match(html, /id="trainerView"/);
assert.match(html, /id="trainerHeroHand"/);
assert.match(html, /id="trainerPlayers"/);
assert.match(html, /id="trainerActions"/);
assert.match(html, /id="trainerTurnInfo"/);
assert.match(html, /id="trainerCoach"/);
assert.match(html, /id="trainerCoach"[\s\S]*?class="coach-hint/);
assert.match(html, /id="trainerChart"/);
assert.match(html, /id="trainerAccuracy"/);
assert.match(html, /id="trainerMenuModal"/);
assert.match(html, /id="trainerChartModal"/);
assert.match(html, /id="trainerSeatPopover"/);
assert.match(html, /class="table-view trainer-view/);
assert.match(html, /id="trainerActions" class="game-buttons"/);
assert.match(html, /shared\/rfi-ranges\.js/);
assert.match(html, /shared\/vs-open-ranges\.js/);
assert.match(html, /id="trainerDrillRfi"/);
assert.match(html, /id="trainerDrillFacing"/);
assert.match(html, /id="trainerDrillMix"/);
assert.match(html, /id="trainerBetControls"/);
assert.match(html, /id="trainerBetPresets" class="bet-presets"/);
assert.match(html, /trainer\.js/);

// Trainer lives inside the join card (same group) but stays type=button (no submit).
assert.match(
  html,
  /id="joinForm"[\s\S]*id="trainerBtn"[^>]*type="button"[\s\S]*?<\/form>/,
);

assert.match(css, /\.trainer-chart-cell/);
assert.match(css, /trainer-open-root/);
assert.match(css, /safe-area-inset-bottom/);

assert.match(trainer, /keydown/);
assert.match(trainer, /streak/);
assert.match(trainer, /TABLE_SEATS/);
assert.match(trainer, /Folded to you/);
assert.match(trainer, /POSITION_FULL_NAME/);
assert.match(trainer, /Under the gun/);
assert.match(trainer, /explainFacingDecision/);
assert.match(trainer, /facingActionLine/);
assert.match(trainer, /You're in the/);
assert.match(trainer, /is-facing/);
assert.match(trainer, /legalRaiseTo/);
assert.match(trainer, /trainer-why/);
assert.match(trainer, /trainer-borderline-note/);
assert.match(trainer, /blind-chip/);
assert.match(trainer, /table-player-row/);
assert.match(trainer, /trainerFoldBtn/);
assert.match(trainer, /trainerConfirmBtn/);
assert.match(trainer, /trainerRetryBtn/);
assert.match(trainer, /trainerChartBtn/);
assert.match(trainer, /text-action-link/);
assert.match(trainer, /DRILL_KEY/);
assert.match(trainer, /setButtonLabel/);
assert.match(trainer, /class="danger"/);
assert.match(trainer, /merge-check-bet/);
assert.match(trainer, /nudgeRaiseTo/);
assert.match(trainer, /initialRaiseTo/);
assert.doesNotMatch(trainer, /onPractice/);
assert.doesNotMatch(trainer, /\bany\b/);
// Hint removed entirely (no button, coach step, or keyboard path).
assert.doesNotMatch(trainer, /trainerHintBtn/);
assert.doesNotMatch(trainer, /function onHint/);
assert.doesNotMatch(trainer, /renderHintCoach/);
assert.doesNotMatch(trainer, /Hint again/);
assert.doesNotMatch(html, /trainerHint/);
// Max 2 primary buttons: facing Fold|Call/Raise; answered Next|Chart (Retry is a text link).
assert.match(css, /\.trainer-view \.game-buttons\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/s);
assert.match(
  trainer,
  /trainerNextBtn[\s\S]*trainerChartBtn[\s\S]*class="secondary"/,
  "answered row is Next hand (primary) + Chart (secondary)",
);
assert.doesNotMatch(
  trainer,
  /action-links">\$\{textActionLink\("trainerChartBtn"/,
  "Chart must be a real button, not an underlined link",
);
assert.doesNotMatch(trainer, /trainerRetryPlaceholder/);
assert.doesNotMatch(css, /Facing: Hint \| Fold \| Call \| Raise/);
assert.match(css, /button\.text-action-link/);
// Fold (danger) and Call/Raise share the same translucent kbd badge as the live table.
assert.match(
  css,
  /\.game-buttons > button\.has-shortcut:not\(\.secondary\):not\(\.ghost\):not\(\.danger-outline\) > kbd/,
);
assert.doesNotMatch(
  css,
  /\.game-buttons > button\.has-shortcut:not\(\.secondary\):not\(\.danger\):not\(\.ghost\) > kbd/,
  "danger/Fold must use the same light badge as Call/Raise",
);
// Live-table raise button is not forced visible on facing (Call/Raise merge hides it).
assert.doesNotMatch(css, /\.trainer-view\.is-facing #trainerRaiseActionBtn/);

assert.match(css, /--trainer-chart-raise-bg/);
assert.match(css, /--trainer-chart-call-bg/);
assert.match(css, /--trainer-chart-fold-bg/);
assert.match(css, /\.trainer-why/);
assert.match(css, /\.trainer-borderline-note/);
assert.match(css, /\.coach-hint/);
// Trainer menu reuses Settings sheet pieces (not bespoke mode-option segments).
assert.match(html, /id="trainerMenuModal"[\s\S]*class="modal-panel menu-panel"/);
assert.match(html, /id="trainerCloseMenuBtn"[\s\S]*class="ghost icon-btn"/);
assert.match(html, /id="trainerDrillRfi"[\s\S]*class="appearance-choice/);
assert.match(html, /id="trainerSize6"[\s\S]*class="appearance-choice/);
assert.match(html, /menu-subsection-title">Drill/);
assert.match(html, /menu-subsection-title">Table/);
assert.match(html, /menu-subsection-title">Stats/);
assert.match(html, /id="trainerResetBtn"[\s\S]*class="secondary menu-row-btn"/);
assert.match(html, /id="trainerLeaveBtn"[\s\S]*class="secondary leave-game-btn menu-row-btn"/);
assert.match(html, /appearance-choices shot-clock-choices/);
assert.doesNotMatch(html, /class="trainer-drill"/);
assert.doesNotMatch(html, /class="trainer-size"/);
assert.doesNotMatch(html, /trainerDrillRfi" class="mode-option/);
assert.match(trainer, /trainer-stats-top/);
assert.match(trainer, /menu-player-row static/);
assert.doesNotMatch(trainer, /parts\.join\(" · "\)/);
assert.doesNotMatch(css, /\.trainer-drill \.mode-option/);
assert.doesNotMatch(css, /\.trainer-size \.mode-option/);
// Trainer reuses Practice .felt / .community / .players / .control-panel — no desktop overrides.
assert.match(
  css,
  /Trainer uses the same \.felt \/ \.community \/ \.players \/ \.control-panel layout as Practice/,
);
assert.doesNotMatch(css, /\.trainer-view \.felt\s*\{/);
// Mobile: seats stay clipped to the felt grid cell (auto-scroll) — never overlap the panel.
assert.match(css, /\.trainer-view \.players\s*\{[^}]*overflow-y:\s*auto/s);
assert.match(css, /\.trainer-view \.control-panel\s*\{[^}]*z-index:\s*5/s);
assert.doesNotMatch(css, /\.trainer-view \.players\s*\{[^}]*overflow-y:\s*visible/s);
assert.doesNotMatch(css, /\.trainer-view \.community\s*\{/);
// Welcome stays 720px; Trainer must not inherit that narrow app width.
assert.doesNotMatch(css, /body:has\(#trainerView:not\(\.hidden\)\)\s*\.app/);
assert.match(html, /id="trainerCommunity" class="community"/);
assert.match(html, /id="trainerControlPanel" class="control-panel/);
assert.match(html, /id="trainerPlayers" class="players"/);
// Community slot matches Practice preflop: five face-down .card.back, no Preflop pill.
assert.match(
  html,
  /id="trainerCommunity" class="community"[^>]*>\s*(?:<div class="card back"><span><\/span><span><\/span><\/div>\s*){5}<\/div>/,
);
assert.doesNotMatch(html, /trainer-board-label/);
assert.doesNotMatch(css, /\.trainer-board-label/);
assert.match(trainer, /facedownBoardHtml/);
assert.doesNotMatch(trainer, /trainer-board/);

console.log("Trainer UI markup checks passed.");
