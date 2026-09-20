const assert = require("node:assert/strict");
const engine = require("../shared/engine");
const { createPracticeSession } = require("../public/practice");

engine.setRandomInt((max) => 0);

{
  const deck = engine.makeDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52);
}

{
  const room = {
    deadPot: 0,
    players: [
      { id: "a", invested: 50, folded: false },
      { id: "b", invested: 150, folded: false },
      { id: "c", invested: 150, folded: false },
    ],
  };
  const pots = engine.buildSidePots(room);
  assert.equal(pots.length, 2);
  assert.equal(pots[0].amount, 150);
  assert.equal(pots[1].amount, 200);
}

{
  const room = engine.createPracticeRoom({
    name: "Tester",
    playerId: "hero",
    tableSize: 6,
    botCount: 5,
    startingStack: 500,
    smallBlind: 5,
    bigBlind: 10,
  });
  assert.equal(room.offline, true);
  assert.equal(room.players.length, 6);
  assert.equal(room.players.filter((player) => player.isBot).length, 5);
  assert.ok(room.players.every((player) => player.stack === 500));

  const hero = room.players[0];
  hero.ready = true;
  assert.equal(engine.maybeStartReadyHand(room), true);
  assert.equal(room.phase, "preflop");
  assert.ok(hero.hand.length === 2);

  const actor = room.players.find((player) => player.id === room.turn);
  assert.ok(actor);
  if (actor.id === hero.id) {
    const result = engine.applyPlayerAction(room, hero.id, { type: "fold" });
    assert.equal(result.ok, true);
  } else {
    const action = engine.chooseComputerAction(room, actor);
    assert.ok(["fold", "check", "call", "raise"].includes(action.type));
    const result = engine.applyPlayerAction(room, actor.id, action);
    assert.equal(result.ok, true);
  }
}

{
  const updates = [];
  const session = createPracticeSession({
    name: "Offline",
    playerId: "hero",
    tableSize: 6,
    botCount: 2,
    startingStack: 1000,
    onUpdate: (snap) => updates.push(snap),
  });
  session.publish();
  assert.ok(updates.length >= 1);
  assert.equal(updates[0].offline, true);
  assert.equal(updates[0].moneyMode, false);
  assert.equal(updates[0].canCashIn, false);

  const ready = session.handle("game:ready", {});
  assert.equal(ready.ok, true);
  assert.ok(updates.at(-1).phase === "preflop" || updates.at(-1).phase === "complete" || updates.at(-1).phase === "showdown" || updates.at(-1).isYourTurn !== undefined);

  const blocked = session.handle("money:cashIn", { amountCents: 2000 });
  assert.equal(blocked.ok, false);

  session.dispose();
}

{
  const solo = engine.createPracticeRoom({
    name: "Solo",
    playerId: "hero",
    botCount: 0,
  });
  assert.equal(solo.players.length, 1);
  assert.equal(solo.players.filter((player) => player.isBot).length, 0);
  assert.equal(solo.tableSize, engine.MAX_PLAYERS);
  assert.equal(engine.serializeRoom(solo, "hero").canAddBot, true);

  const session = createPracticeSession({
    name: "Solo",
    playerId: "hero",
    botCount: 0,
    onUpdate: () => {},
  });
  const added = session.handle("room:addBot", {});
  assert.equal(added.ok, true);
  assert.equal(session.snapshot().players.length, 2);
  session.dispose();
}

console.log("Shared engine + offline host smoke checks passed.");
