const assert = require("node:assert/strict");
const {
  NEXT_HAND_DELAY_MS,
  canAutoStartHand,
  seatedForNextHand,
} = require("../server");

assert.ok(NEXT_HAND_DELAY_MS >= 1000);
assert.ok(NEXT_HAND_DELAY_MS <= 10000);

function room(overrides = {}) {
  return {
    phase: "complete",
    players: [
      { id: "a", isBot: false, stack: 500, sittingOut: false, connected: true, ready: false },
      { id: "b", isBot: false, stack: 500, sittingOut: false, connected: true, ready: false },
      { id: "bot", isBot: true, stack: 500, sittingOut: false, connected: true, ready: true },
    ],
    ...overrides,
  };
}

assert.equal(canAutoStartHand(room()), true);
assert.equal(canAutoStartHand(room({ phase: "lobby" })), true);
assert.equal(canAutoStartHand(room({ phase: "flop" })), false);

// Sitting out / busted / cashed out do not block or count toward the table.
const withSitOut = room({
  players: [
    { id: "a", isBot: false, stack: 500, sittingOut: false, connected: true },
    { id: "b", isBot: false, stack: 500, sittingOut: true, connected: true },
    { id: "c", isBot: false, stack: 0, sittingOut: false, connected: true },
    { id: "bot", isBot: true, stack: 500, sittingOut: false, connected: true },
  ],
});
assert.deepEqual(seatedForNextHand(withSitOut).map((p) => p.id), ["a", "bot"]);
assert.equal(canAutoStartHand(withSitOut), true);

// One active human cannot start even with ready bots alone? Need 2 seated - a + bot = 2, has connected human.
assert.equal(canAutoStartHand(withSitOut), true);

const alone = room({
  players: [
    { id: "a", isBot: false, stack: 500, sittingOut: false, connected: true },
    { id: "b", isBot: false, stack: 500, sittingOut: true, connected: true },
    { id: "c", isBot: false, stack: 0, sittingOut: false, connected: true },
  ],
});
assert.equal(canAutoStartHand(alone), false);

const disconnected = room({
  players: [
    { id: "a", isBot: false, stack: 500, sittingOut: false, connected: false },
    { id: "b", isBot: false, stack: 500, sittingOut: false, connected: false },
    { id: "bot", isBot: true, stack: 500, sittingOut: false, connected: true },
  ],
});
assert.equal(canAutoStartHand(disconnected), false);

console.log("Next-hand auto-start checks passed.");
