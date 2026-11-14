#!/usr/bin/env node
/**
 * Facing short all-ins / every villain all-in:
 * - UI must not offer an illegal Raise (Call is the main button)
 * - Rejected actions must surface a toast/error (never silent)
 * - Hand Review grades Call as Best/Fine when raising isn't meaningful
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HandReview = require("../dist/shared/hand-review.node");

const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");

assert.match(tableSrc, /function heroCanRaiseMeaningfully/);
assert.match(tableSrc, /heroCanRaiseMeaningfully\(state,\s*hero\)/);
assert.match(
  tableSrc,
  /liveVillains\.every\(\(player\) => player\.allIn \|\| player\.stack <= 0\)/,
  "raise UI must disable when every live opponent is all-in",
);
assert.match(
  tableSrc,
  /!\(room\.canRaise \|\| room\.canShove\)/,
  "raise UI must respect raise-not-reopened",
);
assert.match(
  tableSrc,
  /mergePassiveConfirm = canRaiseUi/,
  "Call/Raise merge only when raise is meaningful",
);
assert.match(tableSrc, /function reportActionFailure/);
assert.match(
  tableSrc,
  /reportActionFailure\(response\?\.error/,
  "rejected actions must not be swallowed",
);
assert.match(tableSrc, /showToast\(text\)/);

// Inline showdown cards — no appended shown-hand-card feed blocks.
assert.match(bootSrc, /function seatShownHandMarkup/);
assert.match(bootSrc, /seatShownHandMarkup\(player\)/);
assert.doesNotMatch(bootSrc, /renderShownHandCard/);
assert.doesNotMatch(bootSrc, /shownHands/);

// Short all-in call: opponents all-in (0 stack) → Call is Best, never recommend Raise.
{
  const item = HandReview.gradeHandDecision({
    id: "short-ai",
    street: "flop",
    boardCodes: ["Kh", "7d", "2c"],
    heroCodes: ["As", "Qd"],
    pot: 100,
    toCall: 20,
    currentBet: 20,
    heroStack: 930,
    opponentStacks: [0, 0],
    taken: "call",
    equity: 0.55,
    canRaise: true, // stale flag — stacks say nobody can respond
    minRaiseTo: 40,
    maxRaiseTo: 950,
  });
  assert.equal(item.recommended, "call", "facing all-ins must recommend Call, not Raise");
  assert.equal(item.verdict, "best");
  assert.notEqual(item.recommended, "raise");
}

// Raise not reopened (canRaise false) with chips behind — still Call.
{
  const item = HandReview.gradeHandDecision({
    id: "no-reopen",
    street: "turn",
    boardCodes: ["Kh", "7d", "2c", "9s"],
    heroCodes: ["As", "Qd"],
    pot: 140,
    toCall: 20,
    currentBet: 40,
    heroStack: 910,
    opponentStacks: [0],
    taken: "call",
    equity: 0.5,
    canRaise: false,
    minRaiseTo: 80,
    maxRaiseTo: 950,
  });
  assert.equal(item.recommended, "call");
  assert.ok(item.verdict === "best" || item.verdict === "fine");
}

// Bot / street frames are not graded — only hero_decision steps enter the summary.
{
  const replay = HandReview.buildHandReplay({
    handNumber: 1,
    steps: [
      {
        id: "s1",
        label: "MightyCobra all-in 20",
        actorId: "bot1",
        kind: "action",
        table: {
          street: "flop",
          pot: 100,
          toCall: 20,
          currentBet: 20,
          minRaiseTo: 40,
          boardCodes: ["Kh", "7d", "2c"],
          seats: [],
          actingSeatId: "hero",
          winners: [],
        },
      },
      {
        id: "s2",
        label: "You call",
        actorId: "hero",
        kind: "hero_decision",
        table: {
          street: "flop",
          pot: 100,
          toCall: 20,
          currentBet: 20,
          minRaiseTo: 40,
          boardCodes: ["Kh", "7d", "2c"],
          seats: [],
          actingSeatId: "hero",
          winners: [],
        },
        heroDecision: {
          id: "s2",
          street: "flop",
          boardCodes: ["Kh", "7d", "2c"],
          heroCodes: ["As", "Qd"],
          pot: 100,
          toCall: 20,
          currentBet: 20,
          heroStack: 930,
          opponentStacks: [0],
          taken: "call",
          equity: 0.55,
          canRaise: false,
          minRaiseTo: 40,
          maxRaiseTo: 950,
        },
      },
      {
        id: "s3",
        label: "River",
        actorId: null,
        kind: "street",
        table: {
          street: "river",
          pot: 140,
          toCall: 0,
          currentBet: 0,
          minRaiseTo: 20,
          boardCodes: ["Kh", "7d", "2c", "9s", "3h"],
          seats: [],
          actingSeatId: null,
          winners: [],
        },
      },
    ],
  });
  assert.equal(replay.items.length, 1, "only hero decisions are graded");
  assert.match(replay.summary, /^1 decision/);
  assert.doesNotMatch(replay.summary, /3 decision/);
}

console.log("Facing all-in Call / rejected-action / grading checks passed.");
