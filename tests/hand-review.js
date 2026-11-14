/**
 * Hand review grading + chess.com-style replay step builder.
 * Cases: Ah8h flop raise spot + 44 SB implied-odds spot.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const HandReview = require("../dist/shared/hand-review.node");

function seat(id, overrides = {}) {
  return {
    id,
    name: id,
    isHero: false,
    isBot: true,
    stack: 1000,
    bet: 0,
    folded: false,
    allIn: false,
    dealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    isTurn: false,
    holeCodes: null,
    lastAction: null,
    ...overrides,
  };
}

function table(overrides = {}) {
  return {
    street: "preflop",
    pot: 30,
    toCall: 0,
    currentBet: 0,
    minRaiseTo: 40,
    boardCodes: [],
    seats: [
      seat("hero", { isHero: true, isBot: false, holeCodes: ["Ah", "8h"] }),
      seat("bot"),
    ],
    actingSeatId: "hero",
    winners: [],
    ...overrides,
  };
}

{
  // A♥8♥ flop: facing 60 into 130 (62% equity vs ~32% pot odds) → Raise is Best.
  const raiseSpot = HandReview.gradeHandDecision({
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
  });
  assert.equal(raiseSpot.recommended, "raise");
  assert.equal(raiseSpot.verdict, "best");
  assert.equal(raiseSpot.badge, "Best");
  assert.match(raiseSpot.reason, /Well ahead of the price/);

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
  assert.equal(callMistake.recommended, "raise");
}

{
  // 4♣4♠ SB facing raise to 50, pot 80, 40 to call, 950 deep → Call/Borderline.
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
  assert.equal(deepCall.recommended, "call");
  assert.ok(deepCall.verdict === "fine" || deepCall.verdict === "best");
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
}

{
  // buildHandReplay: step order, verdict placement on hero dots, retry grading.
  const recording = {
    handNumber: 3,
    heroId: "hero",
    heroCodes: ["Ah", "8h"],
    steps: [
      {
        id: "s1",
        label: "Bot raises to 60",
        actorId: "bot",
        kind: "action",
        table: table({
          street: "flop",
          pot: 130,
          toCall: 60,
          currentBet: 60,
          boardCodes: ["8s", "4d", "3s"],
          seats: [
            seat("hero", {
              isHero: true,
              isBot: false,
              stack: 940,
              holeCodes: ["Ah", "8h"],
              isTurn: true,
            }),
            seat("bot", { stack: 880, bet: 60, lastAction: "Raises to 60" }),
          ],
        }),
      },
      {
        id: "s2",
        label: "You call",
        actorId: "hero",
        kind: "hero_decision",
        table: table({
          street: "flop",
          pot: 130,
          toCall: 60,
          currentBet: 60,
          boardCodes: ["8s", "4d", "3s"],
        }),
        heroDecision: {
          id: "s2",
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
      },
      {
        id: "s3",
        label: "You call",
        actorId: "hero",
        kind: "hero_decision",
        table: table({
          street: "preflop",
          pot: 80,
          toCall: 40,
          currentBet: 50,
          boardCodes: [],
          seats: [
            seat("hero", {
              isHero: true,
              isBot: false,
              stack: 950,
              holeCodes: ["4c", "4s"],
              isSmallBlind: true,
              isTurn: true,
            }),
            seat("bot", { stack: 950, bet: 50 }),
          ],
        }),
        heroDecision: {
          id: "s3",
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
      },
      {
        id: "s4",
        label: "Hero wins",
        actorId: "hero",
        kind: "result",
        table: table({
          street: "complete",
          pot: 0,
          winners: [{ playerId: "hero", name: "hero", amount: 190 }],
        }),
      },
    ],
  };

  const replay = HandReview.buildHandReplay(recording);
  assert.equal(replay.steps.length, 4);
  assert.equal(replay.steps[0].isHeroDecision, false);
  assert.equal(replay.steps[1].isHeroDecision, true);
  assert.equal(replay.steps[1].decision.verdict, "mistake");
  assert.equal(replay.steps[2].isHeroDecision, true);
  assert.ok(
    replay.steps[2].decision.verdict === "fine" || replay.steps[2].decision.verdict === "best",
  );
  assert.equal(replay.mistake, 1);
  assert.match(replay.summary, /Mistake/);
  assert.match(HandReview.formatVerdictLine(replay.steps[1].decision), /Mistake/);

  const retryOk = HandReview.gradeRetry(replay.steps[1].decision, "raise");
  assert.equal(retryOk.correct, true);
  assert.match(retryOk.line, /Now Best/);

  const retryBad = HandReview.gradeRetry(replay.steps[1].decision, "fold");
  assert.equal(retryBad.correct, false);
  assert.match(retryBad.line, /Still off/);
}

{
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.match(html, /id="handReviewBtn"/);
  assert.match(html, /id="handReviewChrome"/);
  assert.match(html, /id="handReviewTimeline"/);
  assert.match(html, /shared\/hand-review\.js/);
  assert.doesNotMatch(html, /id="handReviewModal"/);
  assert.doesNotMatch(html, /id="coachBtn"/);

  const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
  assert.match(css, /\.hand-review-chrome/);
  assert.match(css, /\.hand-review-timeline/);
  assert.match(css, /\.hand-review-dot/);

  const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
  assert.match(tableSrc, /buildHandReplay/);
  assert.match(tableSrc, /paintHandReviewStep/);
  assert.match(tableSrc, /captureHandReviewDecision/);
  assert.match(tableSrc, /Try again/);
  assert.doesNotMatch(tableSrc, /renderHandReviewSheet/);
  assert.doesNotMatch(tableSrc, /renderCoachHint/);
}

console.log("Hand review checks passed.");
