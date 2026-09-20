const assert = require("node:assert/strict");
const engine = require("../shared/engine");
const {
  canHandoffToOffline,
  createPracticeSession,
  createPracticeSessionFromSnapshot,
} = require("../public/practice");

engine.setRandomInt((max) => 0);

function publicSnapshot(room, viewerId) {
  return engine.serializeRoom(room, viewerId);
}

{
  assert.equal(canHandoffToOffline(null), false);
  assert.equal(canHandoffToOffline({ offline: true, moneyMode: false, phase: "flop", players: [{ isBot: false, isYou: true }] }), false);
  assert.equal(canHandoffToOffline({ moneyMode: true, phase: "flop", players: [{ isBot: false, isYou: true }] }), false);
  assert.equal(canHandoffToOffline({ moneyMode: false, phase: "flop", players: [] }), false);
  assert.equal(canHandoffToOffline({
    moneyMode: false,
    phase: "flop",
    players: [
      { isBot: false, isYou: true },
      { isBot: false, isYou: false },
    ],
  }), false);
  assert.equal(canHandoffToOffline({
    moneyMode: false,
    phase: "flop",
    players: [
      { isBot: false, isYou: false },
      { isBot: true, isYou: false },
    ],
  }), false);
  assert.equal(canHandoffToOffline({
    moneyMode: false,
    phase: "preflop",
    players: [
      { isBot: false, isYou: true },
      { isBot: true, isYou: false },
    ],
  }), true);
  assert.equal(canHandoffToOffline({
    moneyMode: false,
    phase: "lobby",
    players: [{ isBot: false, isYou: true }],
  }), true);
}

{
  const room = engine.createPracticeRoom({
    name: "Daniel",
    playerId: "hero",
    botCount: 2,
    startingStack: 1000,
    smallBlind: 10,
    bigBlind: 20,
  });
  room.players[0].ready = true;
  assert.equal(engine.maybeStartReadyHand(room), true);
  assert.equal(room.phase, "preflop");

  // Drive to a known hero-to-act spot when possible.
  for (let guard = 0; guard < 12 && room.turn && room.turn !== "hero" && engine.isHandInProgress(room); guard += 1) {
    const actor = room.players.find((player) => player.id === room.turn);
    if (!actor?.isBot) break;
    engine.applyPlayerAction(room, actor.id, { type: actor.bet < room.currentBet ? "call" : "check" });
  }

  const before = publicSnapshot(room, "hero");
  assert.equal(canHandoffToOffline({ ...before, offline: false }), true);

  const hydrated = engine.hydratePracticeRoomFromSnapshot({ ...before, offline: false, id: "ABCD" });
  assert.equal(hydrated.offline, true);
  assert.equal(hydrated.moneyMode, false);
  assert.equal(hydrated.hostId, "hero");
  assert.equal(hydrated.phase, before.phase);
  assert.equal(hydrated.handNumber, before.handNumber);
  assert.equal(hydrated.currentBet, before.currentBet);
  assert.equal(hydrated.turn, before.turn);
  assert.equal(hydrated.community.length, before.community.length);
  assert.equal(hydrated.players.length, before.players.length);
  assert.equal(engine.collectPot(hydrated), before.pot);

  const hero = hydrated.players.find((player) => player.id === "hero");
  assert.deepEqual(hero.hand, before.players.find((player) => player.isYou).cards.map((card) => card.code));
  assert.ok(hydrated.players.every((player) => {
    const seat = before.players.find((item) => item.id === player.id);
    if (seat.waitingForNextHand || seat.sittingOut) return player.hand.length === 0;
    if (!engine.isHandInProgress(hydrated) && hydrated.phase !== "complete") return true;
    return player.hand.length === 2;
  }));

  // Bot hole cards were hidden online; hydration invents replacements so play can continue.
  const bot = hydrated.players.find((player) => player.isBot);
  assert.equal(bot.hand.length, 2);
  assert.ok(bot.hand.every((card) => typeof card === "string"));

  if (hydrated.turn === "hero" && ["preflop", "flop", "turn", "river"].includes(hydrated.phase)) {
    const toCall = Math.max(0, hydrated.currentBet - hero.bet);
    const result = engine.applyPlayerAction(
      hydrated,
      "hero",
      toCall > 0 ? { type: "call" } : { type: "check" },
    );
    assert.equal(result.ok, true);
  }
}

{
  const updates = [];
  const live = engine.createPracticeRoom({
    name: "Host",
    playerId: "hero",
    botCount: 1,
    startingStack: 500,
    smallBlind: 5,
    bigBlind: 10,
  });
  live.players[0].ready = true;
  engine.maybeStartReadyHand(live);
  const snap = { ...publicSnapshot(live, "hero"), offline: false, id: "ZZ99", moneyMode: false };
  const session = createPracticeSessionFromSnapshot(snap, {
    onUpdate: (next) => updates.push(next),
  });
  session.publish();
  assert.ok(updates.length >= 1);
  assert.equal(updates[0].offline, true);
  assert.equal(updates[0].id, "PRACTICE");
  assert.equal(updates[0].moneyMode, false);
  assert.equal(updates[0].phase, snap.phase);
  assert.equal(updates[0].pot, snap.pot);
  assert.equal(updates[0].players.find((player) => player.isYou).stack, snap.players.find((player) => player.isYou).stack);

  // Reconnect must not be implied — session stays the practice controller.
  assert.equal(session.snapshot().offline, true);
  session.dispose();
}

{
  // Between-hands complete snapshot restores stacks and stays ready-capable.
  const room = engine.createPracticeRoom({
    name: "Host",
    playerId: "hero",
    botCount: 1,
    startingStack: 800,
  });
  room.phase = "complete";
  room.status = "complete";
  room.handNumber = 3;
  room.players[0].stack = 920;
  room.players[1].stack = 680;
  room.players[0].hand = ["As", "Kd"];
  room.players[1].hand = ["2c", "2d"];
  room.players[1].showCards = true;
  room.community = ["Ah", "7c", "2h", "9s", "Td"];
  room.winners = [{ playerId: "hero", name: "Host", amount: 40, hand: "Pair of Aces" }];
  room.message = "Hand complete.";

  const snap = { ...publicSnapshot(room, "hero"), offline: false, id: "ROOM1" };
  const hydrated = engine.hydratePracticeRoomFromSnapshot(snap);
  assert.equal(hydrated.phase, "complete");
  assert.equal(hydrated.players[0].stack, 920);
  assert.equal(hydrated.players[1].stack, 680);
  assert.equal(engine.canReadyForHand(hydrated), true);

  const session = createPracticeSession({ room: hydrated, viewerId: "hero", onUpdate: () => {} });
  const ready = session.handle("game:ready", { ready: true });
  assert.equal(ready.ok, true);
  session.dispose();
}

{
  // Money and multi-human eligibility stays false even with rich snapshots.
  const moneySnap = {
    id: "CASH",
    moneyMode: true,
    offline: false,
    phase: "flop",
    players: [{ id: "a", isBot: false, isYou: true, cards: [] }],
  };
  assert.equal(canHandoffToOffline(moneySnap), false);
  assert.throws(() => engine.hydratePracticeRoomFromSnapshot(moneySnap));
}

console.log("Offline handoff eligibility + snapshot restore checks passed.");
