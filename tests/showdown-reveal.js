const assert = require("node:assert/strict");
const engine = require("../shared/engine");

// Community and hole cards that give a deterministic winner:
// "winner" holds As/Ah (pair of aces), "aggressor" holds 2d/7c (king-high).
const COMMUNITY = ["3s", "5h", "8d", "Jc", "Kh"];
const WINNER_HAND = ["As", "Ah"];
const LOSER_HAND = ["2d", "7c"];

function makePlayer(id, hand, { folded = false } = {}) {
  return {
    id,
    name: id,
    hand,
    stack: 400,
    bet: 0,
    invested: 100,
    folded,
    allIn: false,
    showCards: false,
    isBot: false,
    sittingOut: false,
    preflopShoveStreak: 0,
  };
}

function makeShowdownRoom({ lastAggressorId = null, aggressorFolded = false } = {}) {
  return {
    showdownTimer: null,
    turn: null,
    community: COMMUNITY,
    deadPot: 0,
    phase: "river",
    status: "playing",
    handNumber: 1,
    winners: [],
    message: "",
    actionLog: [],
    lastAggressorId,
    moneyMode: false,
    players: [
      makePlayer("winner", WINNER_HAND),
      makePlayer("aggressor", LOSER_HAND, { folded: aggressorFolded }),
    ],
  };
}

// Last aggressor (the loser) is forced to show their cards
{
  const room = makeShowdownRoom({ lastAggressorId: "aggressor" });
  engine.settleShowdown(room);
  const winner = room.players.find((p) => p.id === "winner");
  const aggressor = room.players.find((p) => p.id === "aggressor");
  assert.equal(winner.showCards, true, "winner must show cards");
  assert.equal(aggressor.showCards, true, "last aggressor must show even when they lose");
}

// No aggressor (checked around) — only the winner shows
{
  const room = makeShowdownRoom({ lastAggressorId: null });
  engine.settleShowdown(room);
  const winner = room.players.find((p) => p.id === "winner");
  const aggressor = room.players.find((p) => p.id === "aggressor");
  assert.equal(winner.showCards, true, "winner must show cards");
  assert.equal(aggressor.showCards, false, "loser should not show when they did not bet");
}

// Aggressor is the winner — they show (no double-reveal error)
{
  const room = makeShowdownRoom({ lastAggressorId: "winner" });
  engine.settleShowdown(room);
  const winner = room.players.find((p) => p.id === "winner");
  const aggressor = room.players.find((p) => p.id === "aggressor");
  assert.equal(winner.showCards, true, "winner/aggressor should show");
  assert.equal(aggressor.showCards, false, "loser should not show when they did not bet");
}

// Folded aggressor does not get shown (safety: lastAggressorId from earlier street)
{
  const room = makeShowdownRoom({ lastAggressorId: "aggressor", aggressorFolded: true });
  engine.settleShowdown(room);
  const aggressor = room.players.find((p) => p.id === "aggressor");
  assert.equal(aggressor.showCards, false, "folded player must not be forced to show");
}

// applyPlayerAction sets lastAggressorId on raise, updates it on re-raise
{
  const hero = makePlayer("hero", WINNER_HAND);
  const villain = makePlayer("villain", LOSER_HAND);
  const room = {
    showdownTimer: null,
    phase: "river",
    status: "playing",
    turn: "hero",
    currentBet: 0,
    minRaise: 20,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(["hero", "villain"]),
    lastAggressorId: null,
    community: COMMUNITY,
    deck: [],
    dealer: 0,
    message: "",
    actionLog: [],
    winners: [],
    moneyMode: false,
    handNumber: 1,
    baseSmallBlind: 5,
    baseBigBlind: 10,
    players: [hero, villain],
  };

  assert.equal(room.lastAggressorId, null, "starts null");

  const r1 = engine.applyPlayerAction(room, "hero", { type: "raise", raiseTo: 50 });
  assert.equal(r1.ok, true, "hero raise should succeed");
  assert.equal(room.lastAggressorId, "hero", "lastAggressorId set to hero after raise");

  room.turn = "villain";
  const r2 = engine.applyPlayerAction(room, "villain", { type: "raise", raiseTo: 100 });
  assert.equal(r2.ok, true, "villain re-raise should succeed");
  assert.equal(room.lastAggressorId, "villain", "lastAggressorId updates to villain after re-raise");
}

// applyPlayerAction does NOT change lastAggressorId on call or check
{
  const hero = makePlayer("hero", WINNER_HAND);
  const villain = makePlayer("villain", LOSER_HAND);
  hero.bet = 50;
  villain.bet = 100;
  villain.stack = 300;
  villain.invested = 200;
  const room = {
    showdownTimer: null,
    phase: "river",
    status: "playing",
    turn: "hero",
    currentBet: 100,
    minRaise: 50,
    deadPot: 0,
    acted: new Set(["villain"]),
    raiseEligible: new Set(["hero"]),
    lastAggressorId: "villain",
    community: COMMUNITY,
    deck: [],
    dealer: 0,
    message: "",
    actionLog: [],
    winners: [],
    moneyMode: false,
    handNumber: 1,
    baseSmallBlind: 5,
    baseBigBlind: 10,
    players: [hero, villain],
  };

  const r = engine.applyPlayerAction(room, "hero", { type: "call" });
  assert.equal(r.ok, true, "call should succeed");
  assert.equal(room.lastAggressorId, "villain", "lastAggressorId unchanged after a call");
}

// dealStreet resets lastAggressorId when advancing to a new street
{
  const hero = makePlayer("hero", WINNER_HAND);
  const villain = makePlayer("villain", LOSER_HAND);
  const deck = engine.makeDeck().filter(
    (c) => ![...WINNER_HAND, ...LOSER_HAND, ...["3s", "5h", "8d"]].includes(c),
  );
  const room = {
    showdownTimer: null,
    phase: "flop",
    status: "playing",
    turn: null,
    currentBet: 0,
    minRaise: 10,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(),
    lastAggressorId: "hero",
    community: ["3s", "5h", "8d"],
    deck,
    dealer: 0,
    message: "",
    actionLog: [],
    winners: [],
    moneyMode: false,
    handNumber: 1,
    baseSmallBlind: 5,
    baseBigBlind: 10,
    players: [hero, villain],
  };

  engine.dealStreet(room);
  assert.equal(room.lastAggressorId, null, "dealStreet resets lastAggressorId for the new street");
  assert.equal(room.phase, "turn", "phase advances to turn");
}

// resetHandState clears lastAggressorId
{
  const room = engine.createPracticeRoom({
    name: "Tester",
    playerId: "tester",
    botCount: 0,
    smallBlind: 5,
    bigBlind: 10,
  });
  room.lastAggressorId = "tester";
  engine.resetHandState(room);
  assert.equal(room.lastAggressorId, null, "resetHandState clears lastAggressorId");
}

console.log("Showdown aggressor reveal checks passed.");
