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
assert.match(trainer, /trainerHintBtn/);
assert.match(trainer, /rfiTeachingHint/);
assert.match(trainer, /facingTeachingHint/);
assert.match(trainer, /explainFacingDecision/);
assert.match(trainer, /facingActionLine/);
assert.match(trainer, /You're in the/);
assert.match(trainer, /is-facing/);
assert.match(trainer, /legalRaiseTo/);
assert.match(trainer, /trainer-why/);
assert.match(trainer, /trainer-borderline-note/);
assert.match(trainer, /hinted/);
assert.match(trainer, /blind-chip/);
assert.match(trainer, /table-player-row/);
assert.match(trainer, /trainerFoldBtn/);
assert.match(trainer, /trainerCallBtn/);
assert.match(trainer, /trainerRetryBtn/);
assert.match(trainer, /text-action-link/);
assert.match(trainer, /action-links/);
assert.match(trainer, /DRILL_KEY/);
assert.doesNotMatch(trainer, /onPractice/);
assert.doesNotMatch(trainer, /\bany\b/);
// Max 2 primary buttons: facing Fold|Call (Raise in bet-controls); Hint/Chart are links.
assert.match(css, /\.trainer-view \.game-buttons\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/s);
assert.doesNotMatch(css, /Facing: Hint \| Fold \| Call \| Raise/);
assert.match(css, /button\.text-action-link/);

assert.match(css, /--trainer-chart-raise-bg/);
assert.match(css, /--trainer-chart-call-bg/);
assert.match(css, /--trainer-chart-fold-bg/);
assert.match(css, /\.trainer-why/);
assert.match(css, /\.trainer-borderline-note/);
assert.match(css, /\.coach-hint/);
assert.match(css, /\.trainer-drill/);
// Trainer reuses Practice .felt / .community / .players / .control-panel — no desktop overrides.
assert.match(
  css,
  /Trainer uses the same \.felt \/ \.community \/ \.players \/ \.control-panel layout as Practice/,
);
assert.doesNotMatch(css, /\.trainer-view \.felt\s*\{/);
// Mobile may loosen .players overflow so the full roster fits (no tiny inner scrollbar).
assert.match(css, /\.trainer-view \.players\s*\{[^}]*overflow-y:\s*visible/s);
assert.doesNotMatch(css, /\.trainer-view \.community\s*\{/);
assert.doesNotMatch(css, /\.trainer-view \.control-panel\s*\{/);
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
