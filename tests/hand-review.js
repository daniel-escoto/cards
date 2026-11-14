/**
 * Post-hand review grading — Ah8h flop raise spot + 44 SB implied-odds spot.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HandReview = require("../dist/shared/hand-review.node");

{
  // A♥8♥ flop: facing 60 into 130 (62% equity vs ~32% pot odds) → Raise is Best.
  const raiseSpot = HandReview.gradeHandDecision(
    {
      id: "1",
      street: "flop",
      boardCodes: ["8s", "4d", "3s"],
      heroCodes: ["Ah", "8h"],
      pot: 130,
      toCall: 60,
      currentBet: 60,
      heroStack: 940,
      opponentStacks: [880],
      taken: "raise",
      raiseTo: 120,
      equity: 0.62,
      canRaise: true,
      minRaiseTo: 120,
      maxRaiseTo: 1000,
    },
  );
  assert.equal(raiseSpot.recommended, "raise");
  assert.equal(raiseSpot.verdict, "best");
  assert.equal(raiseSpot.badge, "Best");
  assert.match(raiseSpot.reason, /Well ahead of the price/);
  assert.match(raiseSpot.reason, /62%/);
  assert.match(raiseSpot.reason, /32%/);

  const callMistake = HandReview.gradeHandDecision({
    id: "1b",
    street: "flop",
    boardCodes: ["8s", "4d", "3s"],
    heroCodes: ["Ah", "8h"],
    pot: 130,
    toCall: 60,
    currentBet: 60,
    heroStack: 940,
    opponentStacks: [880],
    taken: "call",
    equity: 0.62,
    canRaise: true,
    minRaiseTo: 120,
    maxRaiseTo: 1000,
  });
  assert.equal(callMistake.verdict, "mistake");
  assert.equal(callMistake.badge, "Mistake");
  assert.equal(callMistake.recommended, "raise");
}

{
  // 4♣4♠ SB facing raise to 50, pot 80, 40 to call, 950 deep → Call/Borderline, not hard Fold.
  const deepCall = HandReview.gradeHandDecision({
    id: "2",
    street: "preflop",
    boardCodes: [],
    heroCodes: ["4c", "4s"],
    pot: 80,
    toCall: 40,
    currentBet: 50,
    heroStack: 950,
    opponentStacks: [950],
    taken: "call",
    equity: 0.22,
    canRaise: true,
    minRaiseTo: 90,
    maxRaiseTo: 1000,
  });
  assert.ok(
    deepCall.recommended === "call",
    `expected call for deep 44, got ${deepCall.recommended}`,
  );
  assert.ok(
    deepCall.verdict === "fine" || deepCall.verdict === "best",
    `deep 44 call should be Fine/Best, got ${deepCall.verdict}`,
  );
  assert.match(deepCall.badge, /Fine|Borderline|Best/);
  assert.match(deepCall.reason, /small pairs|Calling is fine|set/i);

  const deepFold = HandReview.gradeHandDecision({
    id: "2b",
    street: "preflop",
    boardCodes: [],
    heroCodes: ["4c", "4s"],
    pot: 80,
    toCall: 40,
    currentBet: 50,
    heroStack: 950,
    opponentStacks: [950],
    taken: "fold",
    equity: 0.22,
    canRaise: true,
    minRaiseTo: 90,
    maxRaiseTo: 1000,
  });
  assert.equal(deepFold.verdict, "mistake");
  assert.equal(deepFold.recommended, "call");

  const shortFold = HandReview.gradeHandDecision({
    id: "2c",
    street: "preflop",
    boardCodes: [],
    heroCodes: ["4c", "4s"],
    pot: 80,
    toCall: 40,
    currentBet: 50,
    heroStack: 200,
    opponentStacks: [200],
    taken: "fold",
    equity: 0.22,
    canRaise: true,
    minRaiseTo: 90,
    maxRaiseTo: 250,
  });
  assert.equal(shortFold.recommended, "fold");
  assert.equal(shortFold.verdict, "best");
  assert.match(shortFold.reason, /Fold|short|33%|22%/i);
}

{
  const report = HandReview.buildHandReview([
    {
      id: "a",
      street: "flop",
      boardCodes: ["8s", "4d", "3s"],
      heroCodes: ["Ah", "8h"],
      pot: 130,
      toCall: 60,
      currentBet: 60,
      heroStack: 940,
      opponentStacks: [880],
      taken: "call",
      equity: 0.62,
      canRaise: true,
      minRaiseTo: 120,
      maxRaiseTo: 1000,
    },
    {
      id: "b",
      street: "preflop",
      boardCodes: [],
      heroCodes: ["4c", "4s"],
      pot: 80,
      toCall: 40,
      currentBet: 50,
      heroStack: 950,
      opponentStacks: [950],
      taken: "call",
      equity: 0.22,
      canRaise: true,
      minRaiseTo: 90,
      maxRaiseTo: 1000,
    },
  ]);
  assert.equal(report.items.length, 2);
  assert.equal(report.mistake, 1);
  assert.match(report.summary, /2 decisions/);
  assert.match(report.summary, /Mistake/);

  const retryOk = HandReview.gradeRetry(report.items[0], "raise");
  assert.equal(retryOk.correct, true);
  assert.match(retryOk.line, /Now Best/);

  const retryBad = HandReview.gradeRetry(report.items[0], "fold");
  assert.equal(retryBad.correct, false);
  assert.match(retryBad.line, /Still off/);
}

{
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.match(html, /id="handReviewBtn"/);
  assert.match(html, /id="handReviewModal"/);
  assert.match(html, /shared\/hand-review\.js/);
  assert.doesNotMatch(html, /id="coachBtn"/);
  assert.doesNotMatch(html, /id="coachHint"/);

  const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
  assert.match(css, /\.hand-review-item/);
  assert.match(css, /\.hand-review-badge/);

  const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
  assert.match(tableSrc, /captureHandReviewDecision/);
  assert.match(tableSrc, /openHandReview/);
  assert.doesNotMatch(tableSrc, /renderCoachHint/);
  assert.doesNotMatch(tableSrc, /coach-hint-use/);
}

console.log("Hand review checks passed.");
