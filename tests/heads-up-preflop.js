// Short-handed preflop: heads-up SB plays far wider than 6-max, the BB defends vs small
// opens, and 6-max ranges stay as they were. Seeded RNG, so results are deterministic.
const assert = require("node:assert/strict");
const engine = require("../dist/shared/engine.node");

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
// Built after the RNG is seeded below: makeDeck shuffles with the engine's randomInt,
// which defaults to crypto and made every run deal different cards.
let deck = [];
const style = (short) => engine.BOT_PROFILES.find((profile) => profile.short === short);
const STYLES = ["Loose", "Balanced", "Quick"];

function dealRandom(player) {
  const a = Math.floor(Math.random() * 52);
  let b = Math.floor(Math.random() * 51);
  if (b >= a) b += 1;
  player.hand = [deck[a], deck[b]];
}

/** Fresh hand with `seats` CPUs; dealer seat 0 (heads-up: dealer = SB, acts first). */
function table(seats, short) {
  const room = engine.createPracticeRoom({
    name: "Hero",
    playerId: "hero",
    tableSize: seats,
    botCount: seats - 1,
    startingStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
  });
  for (const player of room.players) {
    player.botProfile = style(short).tag;
    player.ready = true;
  }
  assert.equal(engine.maybeStartReadyHand(room), true);
  return room;
}

function rate(n, decide) {
  let hits = 0;
  for (let i = 0; i < n; i += 1) if (decide()) hits += 1;
  return hits / n;
}

const realRandom = Math.random;
Math.random = seeded(2026);
engine.setRandomInt(() => 0);
deck = engine.makeDeck();
try {
  const results = {};
  for (const short of STYLES) {
    // First to act preflop: heads-up SB vs 6-max under the gun.
    const playRate = (seats) =>
      rate(400, () => {
        const room = table(seats, short);
        const actor = room.players.find((player) => player.id === room.turn);
        dealRandom(actor);
        return engine.chooseComputerAction(room, actor).type !== "fold";
      });
    const huSb = playRate(2);
    const sixMax = playRate(6);

    // Heads-up BB facing a limp, a min-raise (2x) and a 2.5x open.
    const bbFold = (raiseTo, n) =>
      rate(n, () => {
        const room = table(2, short);
        const sb = room.players.find((player) => player.id === room.turn);
        const action = raiseTo ? { type: "raise", raiseTo } : { type: "call" };
        assert.equal(engine.applyPlayerAction(room, sb.id, action).ok, true);
        const bb = room.players.find((player) => player.id === room.turn);
        assert.equal(bb.id, room.bigBlindPlayerId);
        dealRandom(bb);
        return engine.chooseComputerAction(room, bb).type === "fold";
      });
    results[short] = {
      huSb,
      sixMax,
      vsLimp: bbFold(null, 200),
      vs2x: bbFold(40, 400),
      vs25x: bbFold(50, 300),
    };
  }

  for (const [short, r] of Object.entries(results)) {
    const pct = (value) => `${(value * 100).toFixed(1)}%`;
    const label = `${short}: SB plays ${pct(r.huSb)} (6-max ${pct(r.sixMax)}), BB folds vs limp ${pct(r.vsLimp)} / 2x ${pct(r.vs2x)} / 2.5x ${pct(r.vs25x)}`;
    // Reference heads-up: SB plays ~70-90%, BB folds ~15-30% vs 2x, ~25-40% vs 2.5x.
    assert.ok(r.huSb >= 0.62 && r.huSb <= 0.95, label);
    assert.ok(r.huSb >= r.sixMax + 0.2, `heads-up SB much wider than 6-max: ${label}`);
    assert.equal(r.vsLimp, 0, `BB never folds when it can check: ${label}`);
    assert.ok(r.vs2x >= 0.05 && r.vs2x <= 0.35, label);
    assert.ok(r.vs25x >= 0.08 && r.vs25x <= 0.45, label);
    assert.ok(r.vs25x >= r.vs2x - 0.05, `bigger open folds at least as often: ${label}`);
    // 6-max first-in entry stays in the #53 band.
    assert.ok(r.sixMax >= 0.12 && r.sixMax <= 0.55, label);
  }
  assert.ok(results.Loose.huSb > results.Quick.huSb, "styles keep their ordering heads-up");

  // 6-max is unchanged: with six dealt in, the limp chance is exactly the #53 formula.
  {
    const room = table(6, "Balanced");
    const actor = room.players.find((player) => player.id === room.turn);
    actor.hand = ["Qh", "7c"];
    const threshold = 0.57 - (style("Balanced").looseness - 0.68) * 0.13;
    const expected = Math.max(
      0,
      Math.min(0.97, 0.5 + (engine.preflopHandScore(actor.hand) - threshold) / 0.08),
    );
    assert.equal(engine.preflopBlindCallChance(room, actor, 20), expected);
    // Heads-up the same hand is a clear play.
    const hu = table(2, "Balanced");
    const sb = hu.players.find((player) => player.id === hu.turn);
    sb.hand = ["Qh", "7c"];
    assert.ok(engine.preflopBlindCallChance(hu, sb, 10) > expected);
  }
  console.log("Heads-up preflop checks passed.");
  for (const [short, r] of Object.entries(results)) {
    console.log(
      `  ${short}: SB play ${(r.huSb * 100).toFixed(0)}% (6-max ${(r.sixMax * 100).toFixed(0)}%), BB fold 2x ${(r.vs2x * 100).toFixed(0)}% 2.5x ${(r.vs25x * 100).toFixed(0)}%`,
    );
  }
} finally {
  Math.random = realRandom;
}
