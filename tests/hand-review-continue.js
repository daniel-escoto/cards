#!/usr/bin/env node
/**
 * Continue review must exit the retry-answer chrome (not no-op on same step index)
 * and advance to the next landable frame when one exists.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const tableSrc = fs.readFileSync(path.join(root, "public/app-table.ts"), "utf8");
const eventsSrc = fs.readFileSync(path.join(root, "public/app-events.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

// Source contracts: Continue must call continueHandReview (not same-index paint).
assert.match(tableSrc, /function continueHandReview/);
assert.match(
  tableSrc,
  /textActionLink\("Continue review", \(\) => continueHandReview\(\)\)/,
);
assert.doesNotMatch(
  tableSrc,
  /hand-review-continue[\s\S]{0,200}paintHandReviewStep\(handReviewStepIndex\)/,
  "Continue must not call paintHandReviewStep(sameIndex) without force — that early-returns",
);
assert.match(tableSrc, /paintHandReviewStep\(handReviewStepIndex, \{ force: true \}\)/);
assert.match(tableSrc, /Your retry: Correct/);
assert.match(tableSrc, /Your retry: Still off/);
assert.match(tableSrc, /appendHandReviewResultStep/);
assert.match(
  tableSrc,
  /Fold often completes in the same update — still append the result frame/,
);

// Enter activates Continue when the link is present.
assert.match(eventsSrc, /hand-review-continue/);
assert.match(eventsSrc, /event\.key === "Enter"/);

// Close lives in the hand-row (top-right with pot), sized like shared icon-btn.
assert.match(css, /\.hand-row \.hand-review-close\.icon-btn\s*\{[^}]*min-height:\s*42px/s);
assert.match(html, /hand-row[\s\S]*id="handReviewCloseBtn"/);
assert.match(tableSrc, /handReviewCloseBtn\.hidden = false/);
assert.match(tableSrc, /textActionLink\("Continue review"/);

// Built JS must exist (npm test runs build first).
const tableJs = fs.readFileSync(path.join(root, "dist/public/app-table.js"), "utf8");
const HandReview = require("../dist/shared/hand-review.node");

const grab = (fn) => {
  const start = tableJs.indexOf(`function ${fn}(`);
  assert.ok(start >= 0, `${fn} exists in app-table.js`);
  const end = tableJs.indexOf("\nfunction ", start + 10);
  return tableJs.slice(start, end === -1 ? undefined : end);
};

const decisionItem = HandReview.gradeHandDecision({
  id: "d1",
  street: "preflop",
  boardCodes: [],
  heroCodes: ["Ah", "Tc"],
  pot: 70,
  toCall: 40,
  currentBet: 40,
  heroStack: 960,
  opponentStacks: [960],
  taken: "fold",
  equity: 0.48,
  canRaise: true,
  minRaiseTo: 80,
  maxRaiseTo: 1000,
  raiseStep: 20,
});
assert.equal(decisionItem.verdict, "mistake");

const replay = {
  steps: [
    {
      id: "s1",
      index: 0,
      label: "You fold",
      actorId: "hero",
      kind: "hero_decision",
      isHeroDecision: true,
      decision: decisionItem,
      table: {
        street: "preflop",
        pot: 70,
        toCall: 40,
        currentBet: 40,
        minRaiseTo: 80,
        boardCodes: [],
        actingSeatId: "hero",
        winners: [],
        seats: [
          {
            id: "hero",
            name: "You",
            isHero: true,
            isBot: false,
            stack: 960,
            bet: 0,
            folded: false,
            allIn: false,
            dealer: false,
            isSmallBlind: false,
            isBigBlind: true,
            isTurn: true,
            holeCodes: ["Ah", "Tc"],
            lastAction: null,
          },
          {
            id: "bot",
            name: "CPU",
            isHero: false,
            isBot: true,
            stack: 960,
            bet: 40,
            folded: false,
            allIn: false,
            dealer: true,
            isSmallBlind: true,
            isBigBlind: false,
            isTurn: false,
            holeCodes: null,
            lastAction: "Raises to 40",
          },
        ],
      },
    },
    {
      id: "s2",
      index: 1,
      label: "CPU wins",
      actorId: "bot",
      kind: "result",
      isHeroDecision: false,
      decision: null,
      table: {
        street: "complete",
        pot: 70,
        toCall: 0,
        currentBet: 0,
        minRaiseTo: 40,
        boardCodes: [],
        actingSeatId: null,
        winners: [{ playerId: "bot", name: "CPU", amount: 70 }],
        seats: [
          {
            id: "hero",
            name: "You",
            isHero: true,
            isBot: false,
            stack: 960,
            bet: 0,
            folded: true,
            allIn: false,
            dealer: false,
            isSmallBlind: false,
            isBigBlind: true,
            isTurn: false,
            holeCodes: ["Ah", "Tc"],
            lastAction: "Folds",
          },
          {
            id: "bot",
            name: "CPU",
            isHero: false,
            isBot: true,
            stack: 1030,
            bet: 0,
            folded: false,
            allIn: false,
            dealer: true,
            isSmallBlind: true,
            isBigBlind: false,
            isTurn: false,
            holeCodes: null,
            lastAction: null,
          },
        ],
      },
    },
  ],
  items: [decisionItem],
  best: 0,
  fine: 0,
  mistake: 1,
  summary: HandReview.formatReviewSummary(1, 0, 0, 1),
};
assert.match(replay.summary, /1 mistake/);
assert.doesNotMatch(replay.summary, /Mistake/);

const dom = new JSDOM(html);
const { document } = dom.window;
document.body.classList.add("hand-review-open");

const paints = [];
const context = {
  document,
  console,
  HandReview,
  handReviewActive: true,
  handReviewSavedState: { id: "room", bigBlind: 20, players: [] },
  handReviewStepIndex: 0,
  handReviewRetryItem: null,
  handReviewRevealedSteps: new Set([0]),
  lastHandReplay: replay,
  state: null,
  handReviewVerdict: document.querySelector("#handReviewVerdict"),
  handReviewRetryBar: document.querySelector("#handReviewRetryBar"),
  handReviewStepLabel: document.querySelector("#handReviewStepLabel"),
  handReviewTimeline: document.querySelector("#handReviewTimeline"),
  handReviewStartBtn: document.querySelector("#handReviewStartBtn"),
  handReviewPrevBtn: document.querySelector("#handReviewPrevBtn"),
  handReviewNextBtn: document.querySelector("#handReviewNextBtn"),
  handReviewEndBtn: document.querySelector("#handReviewEndBtn"),
  gameButtons: document.querySelector("#gameButtons"),
  turnInfo: document.querySelector("#turnInfo"),
  betControls: document.querySelector("#betControls"),
  // Stubs used by paint / continue.
  syncHandReviewRetryingClass() {
    document.body.classList.toggle(
      "hand-review-retrying",
      Boolean(context.handReviewActive && context.handReviewRetryItem),
    );
  },
  roomFromReplayTable(table) {
    return { phase: table.street, pot: table.pot, players: [], community: [] };
  },
  render() {
    paints.push(`render:${context.handReviewStepIndex}`);
  },
  renderHandReviewChrome(step) {
    paints.push(`chrome:${step.id}:${step.kind}`);
    if (context.handReviewStepLabel) {
      const landable = context.handReviewLandableIndexes();
      const ordinal = landable.indexOf(context.handReviewStepIndex);
      context.handReviewStepLabel.textContent = `${ordinal + 1}/${landable.length} · ${step.label}`;
    }
    if (context.handReviewRetryBar) {
      context.handReviewRetryBar.replaceChildren();
      context.handReviewRetryBar.classList.add("is-idle");
    }
  },
  syncHandReviewNavButtons() {
    paints.push("nav");
  },
  setBetControlsReserved() {},
  reserveActionSpace() {},
  handReviewBadge(item) {
    return `✗ ${item.badge}`;
  },
  handReviewWhy(item) {
    return item.reason;
  },
  handReviewMistakeNudge() {
    return "There was a better play here.";
  },
};

// Inject the real helpers under test.
vm.runInNewContext(
  [
    grab("isHandReviewLandableStep"),
    grab("handReviewLandableIndexes"),
    grab("paintHandReviewStep"),
    grab("continueHandReview"),
    grab("paintHandReviewVerdict"),
    grab("textActionLink"),
    grab("submitHandReviewRetryAction"),
  ].join("\n") +
    `\nthis.isHandReviewLandableStep = isHandReviewLandableStep;` +
    `\nthis.handReviewLandableIndexes = handReviewLandableIndexes;` +
    `\nthis.paintHandReviewStep = paintHandReviewStep;` +
    `\nthis.continueHandReview = continueHandReview;` +
    `\nthis.paintHandReviewVerdict = paintHandReviewVerdict;` +
    `\nthis.textActionLink = textActionLink;` +
    `\nthis.submitHandReviewRetryAction = submitHandReviewRetryAction;`,
  context,
);

// Simulate retry-answered chrome on step 0 (submit the graded recommendation).
context.handReviewRetryItem = decisionItem;
const retryPayload =
  decisionItem.recommended === "raise" || decisionItem.recommended === "bet"
    ? { type: decisionItem.recommended, raiseTo: decisionItem.recommendedRaiseTo }
    : { type: decisionItem.recommended };
context.submitHandReviewRetryAction(retryPayload);
assert.equal(context.handReviewRetryItem, null, "retry clears after grade");
const cont = document.querySelector("#handReviewRetryBar .hand-review-continue");
assert.ok(cont, "Continue review link present after answer");
assert.match(context.handReviewVerdict.textContent, /Your retry: Correct/);
assert.doesNotMatch(
  context.handReviewVerdict.textContent,
  /^✓/,
  "retry label must not use a bare ✓ Correct that fights the header mistake count",
);

// Same-index paint without force is a no-op (the old Continue bug).
paints.length = 0;
context.paintHandReviewStep(0);
assert.deepEqual(paints, ["nav"], "same-index paint early-returns");

// Continue advances to the result step.
paints.length = 0;
cont.click();
assert.ok(
  paints.some((entry) => entry === "chrome:s2:result"),
  `Continue should paint the result step, got: ${paints.join(",")}`,
);
assert.equal(context.handReviewStepIndex, 1);
assert.match(context.handReviewStepLabel.textContent, /^2\/2/);
assert.ok(
  document.querySelector("#handReviewRetryBar.is-idle"),
  "retry bar collapses after Continue",
);

// At the last landable step, Continue force-repaints (still not a silent no-op).
paints.length = 0;
// Re-enter answered state on the result? Continue on last decision with only one landable:
context.handReviewStepIndex = 1;
context.continueHandReview();
assert.ok(
  paints.some((entry) => entry.startsWith("chrome:")),
  "Continue on last landable force-paints",
);

console.log("Hand review Continue checks passed.");
