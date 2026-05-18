const assert = require("assert");
const { BLIND_LEVELS, blindLevelForHand } = require("../server");

const expected = [
  [1, 10, 20],
  [6, 10, 20],
  [7, 20, 40],
  [12, 20, 40],
  [13, 40, 80],
  [18, 40, 80],
  [19, 75, 150],
  [24, 75, 150],
  [25, 100, 200],
  [30, 100, 200],
  [31, 200, 400],
  [99, 200, 400],
];

for (const [handNumber, smallBlind, bigBlind] of expected) {
  assert.deepStrictEqual(
    blindLevelForHand(handNumber),
    BLIND_LEVELS.find((level) => level.smallBlind === smallBlind && level.bigBlind === bigBlind),
    `hand ${handNumber} should use ${smallBlind}/${bigBlind}`,
  );
}

assert.strictEqual(blindLevelForHand(0), BLIND_LEVELS[0], "lobby/default state should use opening blinds");
assert.strictEqual(blindLevelForHand("bad"), BLIND_LEVELS[0], "invalid hand numbers should use opening blinds");

console.log("Blind schedule test passed");
