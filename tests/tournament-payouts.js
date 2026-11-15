/**
 * Tournament elimination places + payout splits (unit).
 */
const assert = require("node:assert/strict");
const engine = require("../dist/shared/engine.node");

engine.setRandomInt(() => 0);

const {
  tournamentPayoutSplits,
  tournamentCashOutForPlace,
  recordTournamentEliminations,
  assignRemainingTournamentPlaces,
  STARTING_STACK,
} = engine;

assert.deepEqual(tournamentPayoutSplits(2), [1]);
assert.deepEqual(tournamentPayoutSplits(4), [1]);
assert.deepEqual(tournamentPayoutSplits(5), [0.65, 0.35]);
assert.deepEqual(tournamentPayoutSplits(7), [0.65, 0.35]);
assert.deepEqual(tournamentPayoutSplits(8), [0.5, 0.3, 0.2]);
assert.deepEqual(tournamentPayoutSplits(9), [0.5, 0.3, 0.2]);

{
  const splits = tournamentPayoutSplits(9);
  const pool = 10000;
  const first = tournamentCashOutForPlace(1, pool, splits);
  const second = tournamentCashOutForPlace(2, pool, splits);
  const third = tournamentCashOutForPlace(3, pool, splits);
  assert.equal(first + second + third, pool, "full pool paid");
  assert.equal(tournamentCashOutForPlace(4, pool, splits), 0);
  assert.equal(tournamentCashOutForPlace(null, pool, splits), 0);
}

function seat(id, name, stack, extras = {}) {
  return {
    id,
    name,
    color: "#60a5fa",
    stack,
    hand: [],
    folded: false,
    allIn: false,
    bet: 0,
    invested: extras.invested || 0,
    showCards: false,
    ready: true,
    sittingOut: false,
    connected: true,
    isBot: false,
    finishPlace: null,
    ...extras,
  };
}

function makeRoom(players) {
  return {
    id: "PAY1",
    tournamentMode: true,
    moneyMode: false,
    phase: "complete",
    status: "playing",
    handNumber: 3,
    turn: null,
    message: "",
    players,
  };
}

{
  const room = makeRoom([
    seat("a", "Alice", 500),
    seat("d", "Dana", 400),
    seat("b", "Bob", 0, { invested: 40 }),
    seat("c", "Cara", 0, { invested: 80 }),
  ]);
  const ended = recordTournamentEliminations(room);
  assert.equal(ended, false, "two alive → tournament continues");
  assert.equal(room.players.find((p) => p.id === "c").finishPlace, 3, "more invested → better place");
  assert.equal(room.players.find((p) => p.id === "b").finishPlace, 4);
  assert.equal(room.players.find((p) => p.id === "a").finishPlace, null);
  assert.equal(room.players.find((p) => p.id === "d").finishPlace, null);
  assert.match(room.message, /eliminated/i);
}

{
  const room = makeRoom([
    seat("a", "Alice", 200),
    seat("b", "Bob", 0, { invested: 100 }),
  ]);
  const ended = recordTournamentEliminations(room);
  assert.equal(ended, true);
  assert.equal(room.phase, "gameover");
  assert.equal(room.players.find((p) => p.id === "b").finishPlace, 2);
  assert.equal(room.players.find((p) => p.id === "a").finishPlace, 1);
  assert.match(room.message, /wins the tournament/i);
}

{
  const room = makeRoom([
    seat("a", "Alice", 800),
    seat("b", "Bob", 150),
    seat("c", "Cara", 50),
  ]);
  room.players[1].finishPlace = 3;
  assignRemainingTournamentPlaces(room);
  assert.equal(room.players.find((p) => p.id === "a").finishPlace, 1);
  assert.equal(room.players.find((p) => p.id === "c").finishPlace, 2);
  assert.equal(room.players.find((p) => p.id === "b").finishPlace, 3);
}

{
  // Cash maybeEndGame still skips money rooms.
  const cash = makeRoom([seat("a", "Alice", STARTING_STACK), seat("b", "Bob", 0)]);
  cash.tournamentMode = false;
  cash.moneyMode = true;
  assert.equal(engine.maybeEndGame(cash), false);
  assert.equal(cash.phase, "complete");
}

console.log("Tournament payouts unit test passed");
