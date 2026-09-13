const assert = require("node:assert/strict");

// Mirrors public/app.js playerIsOut / seatedPlayers without pulling in the browser bundle.
function playerIsOut(player, phase) {
  const betweenHands = ["lobby", "complete", "gameover"].includes(phase);
  return player.stack <= 0 && (betweenHands || player.invested <= 0);
}

function seatedPlayers(players, phase) {
  return players.filter((player) => !playerIsOut(player, phase));
}

const roster = [
  { id: "a", name: "Alice", stack: 500, invested: 0, folded: false },
  { id: "b", name: "Bob", stack: 400, invested: 0, folded: true },
  { id: "c", name: "CashedOut", stack: 0, invested: 0, folded: true },
  { id: "d", name: "Busted", stack: 0, invested: 0, folded: true },
  { id: "e", name: "AllIn", stack: 0, invested: 120, folded: false },
  { id: "f", name: "Waiting", stack: 300, invested: 0, folded: true },
];

// Between hands: cashed-out / busted seats disappear; folds and waiters stay.
{
  const visible = seatedPlayers(roster, "complete").map((player) => player.name);
  assert.deepEqual(visible, ["Alice", "Bob", "Waiting"]);
}

// Mid-hand: all-in with chips invested still shows; zero-stack with no investment does not.
{
  const visible = seatedPlayers(roster, "flop").map((player) => player.name);
  assert.deepEqual(visible, ["Alice", "Bob", "AllIn", "Waiting"]);
}

// Folded with chips still has a seat.
assert.equal(playerIsOut({ stack: 250, invested: 0, folded: true }, "flop"), false);

// Cashed out between hands is gone.
assert.equal(playerIsOut({ stack: 0, invested: 0, folded: true }, "lobby"), true);

console.log("Dropped-seat visibility checks passed.");
