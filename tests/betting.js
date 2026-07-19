const assert = require("node:assert");
const { bettingComplete } = require("../server");

function player({ bet = 0, stack = 100, folded = false, allIn = false } = {}) {
  return { id: Math.random().toString(), bet, stack, folded, allIn };
}

const coveringPlayer = player({ bet: 40, stack: 500 });
const allInOpponent = player({ bet: 40, stack: 0, allIn: true });

assert.strictEqual(
  bettingComplete({ players: [coveringPlayer, allInOpponent], currentBet: 40, acted: new Set() }),
  true,
  "a lone matched player should not be asked to bet into an all-in opponent",
);

assert.strictEqual(
  bettingComplete({
    players: [player({ bet: 20 }), player({ bet: 40, stack: 0, allIn: true })],
    currentBet: 40,
    acted: new Set(),
  }),
  false,
  "a lone player must still respond when facing an all-in bet",
);

const first = player({ bet: 40 });
const second = player({ bet: 40 });
assert.strictEqual(
  bettingComplete({ players: [first, second], currentBet: 40, acted: new Set(), }),
  false,
  "betting should continue when multiple players can still act",
);

assert.strictEqual(
  bettingComplete({ players: [allInOpponent], currentBet: 40, acted: new Set() }),
  true,
  "a round with no actionable players should be complete",
);

console.log("Betting completion checks passed.");
