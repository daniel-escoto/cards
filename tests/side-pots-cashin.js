const assert = require("node:assert/strict");
const { buildSidePots, publicSidePots, cashInPlayer, playerCanCashIn } = require("../server");

// Mid-hand: short all-in already matched → main + side on the wire.
{
  const room = {
    deadPot: 0,
    chipValueCents: 1,
    phase: "turn",
    players: [
      { id: "a", invested: 50, folded: false },
      { id: "b", invested: 150, folded: false },
      { id: "c", invested: 150, folded: false },
    ],
  };
  const pots = publicSidePots(room);
  assert.equal(pots.length, 2);
  assert.equal(pots[0].label, "Main pot");
  assert.equal(pots[0].amount, 150);
  assert.equal(pots[1].label, "Side pot");
  assert.equal(pots[1].amount, 200);
  // Alias used by clients that look for `pots`.
  assert.deepEqual(
    pots.map((pot) => `${pot.label} ${pot.amount}`).join(" · "),
    "Main pot 150 · Side pot 200",
  );
}

// Live side pots: short all-in creates main + side.
{
  const room = {
    deadPot: 0,
    chipValueCents: 1,
    players: [
      { id: "a", invested: 100, folded: false },
      { id: "b", invested: 100, folded: false },
      { id: "c", invested: 40, folded: false },
    ],
  };
  const pots = publicSidePots(room);
  assert.equal(pots.length, 2);
  assert.equal(pots[0].label, "Main pot");
  assert.equal(pots[0].amount, 120);
  assert.equal(pots[1].label, "Side pot");
  assert.equal(pots[1].amount, 120);
  assert.deepEqual(pots[1].contenderIds, ["a", "b"]);
}

// Single pot stays unlabeled on the wire as one entry (UI hides until 2+).
{
  const room = {
    deadPot: 0,
    chipValueCents: 1,
    players: [
      { id: "a", invested: 50, folded: false },
      { id: "b", invested: 50, folded: false },
    ],
  };
  assert.equal(publicSidePots(room).length, 1);
  assert.equal(buildSidePots(room).length, 1);
}

function moneyRoom(phase, player) {
  return {
    moneyMode: true,
    buyInCents: 2000,
    chipValueCents: 1,
    phase,
    players: [player],
    moneyLedger: [],
    settlements: [],
  };
}

// Mid-hand buy-back for a busted seat → waiting for next hand.
{
  const player = {
    id: "p1",
    name: "Pat",
    isBot: false,
    stack: 0,
    hand: [],
    folded: false, // busted seats often aren't marked folded
    bet: 0,
    buyInsCents: 2000,
    allIn: true,
  };
  const room = moneyRoom("flop", player);
  assert.equal(playerCanCashIn(room, player), true);
  const result = cashInPlayer(room, "p1", 2000);
  assert.equal(result.ok, true);
  assert.ok(player.stack > 0);
  assert.equal(player.folded, true);
  assert.deepEqual(player.hand, []);
  assert.match(room.message, /next hand/i);
}

// All-in with cards still in the pot cannot top up.
{
  const player = {
    id: "p1",
    name: "Pat",
    isBot: false,
    stack: 0,
    hand: ["As", "Kd"],
    folded: false,
    bet: 80,
    buyInsCents: 2000,
    allIn: true,
  };
  const room = moneyRoom("flop", player);
  assert.equal(playerCanCashIn(room, player), false);
  const result = cashInPlayer(room, "p1", 2000);
  assert.equal(result.ok, false);
  assert.match(result.error, /current hand/i);
}

// Active player cannot top up the current pot.
{
  const player = {
    id: "p1",
    name: "Pat",
    isBot: false,
    stack: 400,
    hand: ["As", "Kd"],
    folded: false,
    bet: 20,
    buyInsCents: 2000,
    allIn: false,
  };
  const room = moneyRoom("turn", player);
  assert.equal(playerCanCashIn(room, player), false);
  const result = cashInPlayer(room, "p1", 2000);
  assert.equal(result.ok, false);
  assert.match(result.error, /current hand/i);
  assert.equal(player.stack, 400);
}

// Folded mid-hand may buy chips for the next deal.
{
  const player = {
    id: "p1",
    name: "Pat",
    isBot: false,
    stack: 120,
    hand: ["7c", "2d"],
    folded: true,
    bet: 0,
    buyInsCents: 2000,
    allIn: false,
  };
  const room = moneyRoom("river", player);
  assert.equal(playerCanCashIn(room, player), true);
  const before = player.stack;
  const result = cashInPlayer(room, "p1", 2000);
  assert.equal(result.ok, true);
  assert.ok(player.stack > before);
  assert.equal(player.folded, true);
  assert.deepEqual(player.hand, []);
}

// Between hands still works.
{
  const player = {
    id: "p1",
    name: "Pat",
    isBot: false,
    stack: 100,
    hand: [],
    folded: false,
    bet: 0,
    buyInsCents: 2000,
    allIn: false,
  };
  const room = moneyRoom("complete", player);
  const before = player.stack;
  const result = cashInPlayer(room, "p1", 2000);
  assert.equal(result.ok, true);
  assert.ok(player.stack > before);
}

console.log("Side pot and mid-hand cash-in checks passed.");
