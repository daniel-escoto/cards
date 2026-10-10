const assert = require("node:assert/strict");
const engine = require("../shared/engine");
const {
  serializeRoom: serializeRoomServer,
} = require("../server");

engine.setRandomInt(() => 0);

function basePlayer(id, overrides = {}) {
  return {
    id,
    name: id.toUpperCase(),
    stack: 0,
    hand: [],
    folded: false,
    allIn: true,
    bet: 0,
    invested: 0,
    showCards: false,
    isBot: false,
    sittingOut: false,
    connected: true,
    ready: false,
    ...overrides,
  };
}

function showdownRoom(players, overrides = {}) {
  return {
    id: "TEST",
    hostId: players[0].id,
    phase: "showdown",
    status: "playing",
    dealer: 0,
    turn: null,
    currentBet: 0,
    minRaise: 20,
    deadPot: 0,
    community: ["2c", "3d", "4h", "9s", "Td"],
    deck: [],
    acted: new Set(),
    raiseEligible: new Set(),
    winners: [],
    actionLog: [],
    handNumber: 1,
    moneyMode: false,
    chipValueCents: 1,
    riverAggressor: null,
    allInCardsExposed: false,
    showdownTimer: null,
    botTimer: null,
    message: "",
    players,
    ...overrides,
  };
}

// 1) River aggressor shows first, then clockwise.
{
  const players = [
    basePlayer("btn", { hand: ["Ah", "Kh"], invested: 100 }), // dealer
    basePlayer("sb", { hand: ["Qh", "Jh"], invested: 100 }),
    basePlayer("bb", { hand: ["Th", "9h"], invested: 100 }),
    basePlayer("co", { hand: ["2s", "2h"], invested: 100 }),
  ];
  const room = showdownRoom(players, { dealer: 0, riverAggressor: "bb" });
  assert.deepEqual(
    engine.showdownOrder(room).map((player) => player.id),
    ["bb", "co", "btn", "sb"],
    "river aggressor first, then clockwise",
  );
}

// 2) No river bet/raise → first active left of button, then clockwise.
{
  const players = [
    basePlayer("btn", { hand: ["Ah", "Kh"], invested: 50 }),
    basePlayer("sb", { folded: true, hand: ["7c", "7d"], invested: 10, allIn: false }),
    basePlayer("bb", { hand: ["Qc", "Jd"], invested: 50 }),
    basePlayer("utg", { hand: ["2c", "2d"], invested: 50 }),
  ];
  const room = showdownRoom(players, { dealer: 0, riverAggressor: null });
  assert.deepEqual(
    engine.showdownOrder(room).map((player) => player.id),
    ["bb", "utg", "btn"],
    "left of button (skip folded SB) first when no river aggression",
  );
}

// 3) Losers that cannot win any remaining pot are mucked and not serialized.
{
  // Board Td 9s 4h 3d 2c — A high beats K high beats Q high.
  // No river aggressor → first active left of button (B) must show first.
  const players = [
    basePlayer("a", { hand: ["Ah", "8c"], invested: 100 }), // dealer / button
    basePlayer("b", { hand: ["Kh", "7c"], invested: 100 }), // shows first; loses but already shown
    basePlayer("c", { hand: ["Qh", "6c"], invested: 100 }), // cannot win after B shown → muck
  ];
  const room = showdownRoom(players, {
    dealer: 0,
    community: ["Td", "9s", "4h", "3d", "2c"],
  });
  assert.deepEqual(engine.showdownOrder(room).map((player) => player.id), ["b", "c", "a"]);
  engine.settleShowdown(room);
  assert.equal(players[1].showCards, true, "first-to-show must reveal even if behind");
  assert.equal(players[2].showCards, false, "hand that cannot win/tie is auto-mucked");
  assert.equal(players[0].showCards, true, "hand that can still beat shown cards must show");
  assert.equal(room.winners[0].playerId, "a");

  const forB = engine.serializeRoom(room, "b");
  const aCards = forB.players.find((player) => player.id === "a").cards;
  const cCards = forB.players.find((player) => player.id === "c").cards;
  assert.ok(aCards.every((card) => card && card.code), "winner cards visible to others");
  assert.ok(cCards.every((card) => card === null), "mucked hole cards never serialized");
}

// 4) All-in before river: hole cards exposed immediately, then board runs out.
{
  const room = engine.createPracticeRoom({
    name: "Hero",
    playerId: "hero",
    botCount: 1,
    startingStack: 40,
    smallBlind: 10,
    bigBlind: 20,
    tableSize: 2,
  });
  room.players[0].ready = true;
  assert.equal(engine.maybeStartReadyHand(room), true);
  assert.equal(room.phase, "preflop");

  // Heads-up: both blinds posted; stacks are tiny. Shove / call to get all-in.
  while (room.phase === "preflop" && room.turn) {
    const actor = room.players.find((player) => player.id === room.turn);
    const maxBet = actor.bet + actor.stack;
    if (room.currentBet > actor.bet) {
      engine.applyPlayerAction(room, actor.id, { type: "call" });
    } else {
      engine.applyPlayerAction(room, actor.id, { type: "raise", raiseTo: maxBet });
    }
  }

  assert.equal(room.allInCardsExposed, true, "all-in runout exposes holes");
  assert.ok(
    room.players.every((player) => !player.folded && player.showCards),
    "both live players face-up during runout",
  );
  assert.ok(
    room.community.length === 5 || room.phase === "showdown" || room.phase === "complete",
    "board runs out after all-in expose",
  );

  if (room.phase === "showdown") engine.settleShowdown(room);
  const snap = engine.serializeRoom(room, "hero");
  const villain = snap.players.find((player) => player.id !== "hero");
  assert.ok(villain.showCards, "opponent remains revealed after all-in showdown");
  assert.ok(villain.cards.every((card) => card && card.code), "opponent holes present post all-in reveal");
}

// 5) Fold-win: winner does not show (optional Show hand still available).
{
  const winner = basePlayer("hero", {
    hand: ["As", "Kd"],
    stack: 900,
    invested: 100,
    allIn: false,
    folded: false,
  });
  const folder = basePlayer("villain", {
    hand: ["2c", "2d"],
    stack: 200,
    invested: 100,
    folded: true,
    allIn: false,
    isBot: true,
  });
  const room = showdownRoom([winner, folder], {
    phase: "river",
    deadPot: 0,
    community: ["Ah", "7c", "2h", "9s", "Td"],
  });
  engine.awardUncontested(room, winner);
  assert.equal(room.phase, "complete");
  assert.equal(winner.showCards, false, "fold-win does not auto-show");
  assert.equal(folder.showCards, false, "folded bots are not force-shown");
  const snap = engine.serializeRoom(room, "villain");
  const heroCards = snap.players.find((player) => player.id === "hero").cards;
  assert.ok(heroCards.every((card) => card === null), "fold-win holes stay private to others");
  const heroSnap = engine.serializeRoom(room, "hero");
  assert.equal(heroSnap.canShowHand, true, "winner may optionally show");
  assert.equal(engine.showPlayerCards(room, "hero").ok, true);
  assert.equal(winner.showCards, true);
}

// 6) Split pot: both show, odd chip to first left of button.
{
  const players = [
    basePlayer("btn", { hand: ["Ah", "2c"], invested: 101, stack: 0 }),
    basePlayer("sb", { hand: ["Ad", "3c"], invested: 101, stack: 0 }),
  ];
  // Board pairs aces with identical kickers via community — both play A-high same board.
  // Use identical nut hands on a paired board for a true chop.
  players[0].hand = ["Kh", "Qc"];
  players[1].hand = ["Kd", "Qs"];
  const room = showdownRoom(players, {
    dealer: 0,
    community: ["As", "Ah", "2d", "3h", "4c"],
    riverAggressor: null,
  });
  engine.settleShowdown(room);
  assert.equal(players[0].showCards, true);
  assert.equal(players[1].showCards, true);
  assert.equal(room.winners.length, 2);
  const total = room.winners.reduce((sum, winner) => sum + winner.amount, 0);
  assert.equal(total, 202);
  // Odd chip (1) goes to first winner left of dealer → SB.
  const sbWin = room.winners.find((winner) => winner.playerId === "sb");
  const btnWin = room.winners.find((winner) => winner.playerId === "btn");
  assert.equal(sbWin.amount, 101);
  assert.equal(btnWin.amount, 101);
}

// Odd chip on uneven split amount.
{
  const players = [
    basePlayer("btn", { hand: ["Kh", "Qc"], invested: 50, stack: 0 }),
    basePlayer("sb", { hand: ["Kd", "Qs"], invested: 50, stack: 0 }),
  ];
  const room = showdownRoom(players, {
    dealer: 0,
    community: ["As", "Ah", "2d", "3h", "4c"],
    deadPot: 1,
  });
  engine.settleShowdown(room);
  const total = room.winners.reduce((sum, winner) => sum + winner.amount, 0);
  assert.equal(total, 101);
  const sbWin = room.winners.find((winner) => winner.playerId === "sb");
  const btnWin = room.winners.find((winner) => winner.playerId === "btn");
  assert.equal(sbWin.amount + btnWin.amount, 101);
  assert.equal(sbWin.amount, 51, "odd chip to left of button");
  assert.equal(btnWin.amount, 50);
}

// 7) Multi-way side pots: eligibility + muck of players who only lose their pots.
{
  // A invested 50 (all-in), B/C invested 150. Main 150 among A/B/C, side 200 among B/C.
  // Board: 2c 3d 4h 5s 9c
  // A: 6h 7h → straight 3-7? 2-3-4-5-6 yes straight
  // Actually give A the nut straight for main, B wins side with higher straight, C loses both.
  const players = [
    basePlayer("a", { hand: ["6h", "7d"], invested: 50, stack: 0 }), // dealer
    basePlayer("b", { hand: ["8h", "9d"], invested: 150, stack: 0 }),
    basePlayer("c", { hand: ["Ac", "Kc"], invested: 150, stack: 0 }),
  ];
  const room = showdownRoom(players, {
    dealer: 0,
    community: ["2c", "3d", "4h", "5s", "Td"],
    riverAggressor: "b",
  });
  const pots = engine.buildSidePots(room);
  assert.equal(pots.length, 2);
  assert.deepEqual(pots[0].contenderIds, ["a", "b", "c"]);
  assert.deepEqual(pots[1].contenderIds, ["b", "c"]);

  engine.settleShowdown(room);
  // A has 6-high straight (2-3-4-5-6), B has 5-high? B has 8h9d — best is 5-high straight 2-3-4-5 + Td? 
  // A: 2,3,4,5,6 straight
  // B: 2,3,4,5,8 / 9 — Ace high? no straight. Pair? no. So A wins main.
  // B vs C for side: B 9-high, C AK — C has Ace high and wins side.
  assert.ok(room.winners.some((winner) => winner.playerId === "a"), "short stack can win main");
  assert.ok(players[0].showCards, "main pot winner shows");

  // Re-run with clearer hands: A wins main, B wins side, C mucks.
  const players2 = [
    basePlayer("a", { hand: ["6h", "7d"], invested: 50, stack: 0 }),
    basePlayer("b", { hand: ["Ah", "Ad"], invested: 150, stack: 0 }),
    basePlayer("c", { hand: ["Kh", "Kd"], invested: 150, stack: 0 }),
  ];
  const room2 = showdownRoom(players2, {
    dealer: 0,
    community: ["2c", "3d", "4h", "5s", "9c"],
    riverAggressor: "b",
  });
  engine.settleShowdown(room2);
  const aWin = room2.winners.filter((winner) => winner.playerId === "a");
  const bWin = room2.winners.filter((winner) => winner.playerId === "b");
  const cWin = room2.winners.filter((winner) => winner.playerId === "c");
  assert.ok(aWin.length, "A wins main with straight");
  assert.ok(bWin.length, "B wins side with aces");
  assert.equal(cWin.length, 0, "C wins nothing");
  assert.equal(players2[0].showCards, true);
  assert.equal(players2[1].showCards, true);
  // C is beaten for every pot they're in once better hands shown → muck
  assert.equal(players2[2].showCards, false, "side-pot loser mucked");

  const forA = engine.serializeRoom(room2, "a");
  const cCards = forA.players.find((player) => player.id === "c").cards;
  assert.ok(cCards.every((card) => card === null), "mucked side-pot loser not in payload");
}

// 8) Per-socket payload: no opponent hole cards pre-reveal (engine + server serializers).
{
  const players = [
    basePlayer("alice", {
      hand: ["As", "Kd"],
      stack: 800,
      invested: 40,
      allIn: false,
      bet: 40,
    }),
    basePlayer("bob", {
      hand: ["Qh", "Qd"],
      stack: 760,
      invested: 40,
      allIn: false,
      bet: 40,
    }),
  ];
  const room = showdownRoom(players, {
    phase: "river",
    community: ["2c", "3d", "4h", "9s"],
    currentBet: 40,
    allInCardsExposed: false,
  });
  for (const serializer of [engine.serializeRoom, serializeRoomServer]) {
    const forAlice = serializer(room, "alice");
    const bob = forAlice.players.find((player) => player.id === "bob");
    const alice = forAlice.players.find((player) => player.id === "alice");
    assert.equal(bob.showCards, false);
    assert.ok(bob.cards.every((card) => card === null), `${serializer.name || "serializer"} hides bob`);
    assert.ok(alice.cards.every((card) => card && card.code), "viewer sees own holes");
  }
}

// Action log must not leak hole card codes on voluntary show.
{
  const player = basePlayer("hero", {
    hand: ["As", "Kd"],
    stack: 500,
    invested: 0,
    allIn: false,
  });
  const room = showdownRoom([player], { phase: "complete", community: [] });
  assert.equal(engine.showPlayerCards(room, "hero").ok, true);
  const rawShow = room.actionLog.find((entry) => /show/i.test(entry.action || entry.text || ""));
  assert.ok(rawShow);
  assert.equal(rawShow.action, "Shows hand");
  assert.equal(rawShow.action.includes("As"), false);

  // Defense in depth: stale leaked logs are scrubbed on serialize.
  room.actionLog.push({
    id: "1-99",
    phase: "complete",
    text: "Hero shows As Kd.",
    action: "Shows As Kd",
    playerId: "hero",
  });
  const snap = engine.serializeRoom(room, "hero");
  const leaked = snap.actionLog.find((entry) => entry.id === "1-99");
  assert.equal(leaked.action, "Shows hand");
  assert.equal(/[2-9TJQKA][shdc]/i.test(leaked.text), false);
}

console.log("Showdown reveal checks passed.");
