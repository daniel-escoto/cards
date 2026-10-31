// Six-handed all-CPU simulation: postflop folding and bluffing land in human-like
// bands per personality. Math.random and the engine's randomInt are both seeded, so
// the numbers are identical on every run (no flakes).
// BOT_STATS_ENGINE=<path to engine.node> BOT_STATS_REPORT=1 prints the table only.
const assert = require("node:assert/strict");
const path = require("node:path");
const enginePath = process.env.BOT_STATS_ENGINE || "../dist/shared/engine.node";
const engine = require(enginePath);
const Hand = require(path.join(path.dirname(require.resolve(enginePath)), "pokersolver")).Hand;

const HANDS = Number(process.env.BOT_STATS_HANDS) || 1400;
const lcg = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const realRandom = Math.random;
Math.random = lcg(20261031);
const intRandom = lcg(7);
engine.setRandomInt((max) => Math.floor(intRandom() * max));

const profiles = engine.BOT_PROFILES;
const blank = () => ({
  hands: 0,
  vpip: 0,
  sawFlop: 0,
  showdown: 0,
  facingBet: 0,
  foldVsBet: 0,
  bets: 0,
  bluffs: 0,
  cbetOpp: 0,
  cbet: 0,
  riverFacing: 0,
  heroCalls: 0,
});
const stats = Object.fromEntries(profiles.map((profile) => [profile.short, blank()]));
const all = blank();

/** True when the hole cards add nothing to the board (air, draw, or board pair). */
function isBluff(hand, community) {
  const own = Hand.solve([...hand, ...community]);
  if (own.rank <= 1) return true;
  if (community.length < 5) {
    const board = Hand.solve(community);
    return own.rank === board.rank && own.rank <= 2;
  }
  return Hand.winners([own, Hand.solve(community)]).length === 2;
}

try {
  let order = profiles.map((profile) => profile.short);
  for (let handIndex = 0; handIndex < HANDS; handIndex += 1) {
    if (handIndex % 50 === 0) order = [...order.slice(1), order[0]];
    const room = engine.createPracticeRoom({
      name: "Hero",
      playerId: "hero",
      tableSize: 6,
      botCount: 5,
      startingStack: 2000,
      smallBlind: 10,
      bigBlind: 20,
    });
    room.players.forEach((player, index) => {
      player.botProfile = profiles.find((profile) => profile.short === order[index]).tag;
      player.ready = true;
    });
    if (!engine.maybeStartReadyHand(room)) continue;
    const styleOf = (player) => engine.computerProfile(player).short;
    const seen = new Map(room.players.map((player) => [player.id, { vpip: false, flop: false }]));
    let preflopRaiser = null;
    let flopActed = new Set();
    for (let guard = 0; guard < 300; guard += 1) {
      if (!(room.turn && engine.isHandInProgress(room) && room.phase !== "showdown")) break;
      const player = room.players.find((item) => item.id === room.turn);
      const s = stats[styleOf(player)];
      const callAmount = Math.max(0, room.currentBet - player.bet);
      const action = engine.chooseComputerAction(room, player);
      const aggressive = action.type === "raise";
      if (room.phase === "preflop") {
        if (aggressive) preflopRaiser = player.id;
        if (aggressive || action.type === "call") seen.get(player.id).vpip = true;
      } else {
        seen.get(player.id).flop = true;
        if (callAmount > 0) {
          // Hero call: calling a river bet with nothing of our own (ace-high, board pair).
          const heroCall =
            room.phase === "river" &&
            action.type === "call" &&
            isBluff(player.hand, room.community);
          for (const bucket of [s, all]) {
            bucket.facingBet += 1;
            if (action.type === "fold") bucket.foldVsBet += 1;
            if (room.phase === "river") bucket.riverFacing += 1;
            if (heroCall) bucket.heroCalls += 1;
          }
        }
        if (aggressive) {
          const bluff = isBluff(player.hand, room.community);
          for (const bucket of [s, all]) {
            bucket.bets += 1;
            if (bluff) bucket.bluffs += 1;
          }
        }
        if (
          room.phase === "flop" &&
          player.id === preflopRaiser &&
          callAmount === 0 &&
          !flopActed.has(player.id) &&
          room.currentBet === 0
        ) {
          for (const bucket of [s, all]) {
            bucket.cbetOpp += 1;
            if (aggressive) bucket.cbet += 1;
          }
        }
        if (room.phase === "flop") flopActed.add(player.id);
      }
      const result = engine.applyPlayerAction(room, player.id, action);
      assert.equal(result.ok, true, `legal action ${JSON.stringify(action)}`);
    }
    const showdown = room.players.filter((player) => !player.folded).length > 1;
    for (const player of room.players) {
      const s = stats[styleOf(player)];
      const mark = seen.get(player.id);
      for (const bucket of [s, all]) {
        bucket.hands += 1;
        if (mark.vpip) bucket.vpip += 1;
        if (mark.flop) {
          bucket.sawFlop += 1;
          if (showdown && !player.folded) bucket.showdown += 1;
        }
      }
    }
    if (room.phase === "showdown") engine.settleShowdown(room);
    assert.equal(engine.isHandInProgress(room), false, "hand finished");
    const chips = room.players.reduce((sum, player) => sum + player.stack, 0);
    assert.equal(chips, 2000 * room.players.length, "chips are conserved");
  }
} finally {
  Math.random = realRandom;
}

const rate = (hits, total) => (total ? hits / total : 0);
const pct = (value) => `${(value * 100).toFixed(1)}%`.padStart(6);
const rows = {};
for (const [short, s] of [...Object.entries(stats), ["All", all]]) {
  rows[short] = {
    vpip: rate(s.vpip, s.hands),
    foldVsBet: rate(s.foldVsBet, s.facingBet),
    wtsd: rate(s.showdown, s.sawFlop),
    bluffShare: rate(s.bluffs, s.bets),
    cbet: rate(s.cbet, s.cbetOpp),
    heroCall: rate(s.heroCalls, s.riverFacing),
  };
  const r = rows[short];
  console.log(
    `  ${short.padEnd(8)} VPIP ${pct(r.vpip)}  fold-to-bet ${pct(r.foldVsBet)}  WTSD ${pct(r.wtsd)}  bluff ${pct(r.bluffShare)} of bets  c-bet ${pct(r.cbet)} (${s.cbetOpp})  hero calls ${pct(r.heroCall)} (${s.heroCalls}/${s.riverFacing})`,
  );
}
// Hero calls: river, ace-high facing a pot-size bet (the pot odds say fold). Tricky and
// Casual sometimes look the bettor up anyway; Grinder almost never does.
function riverBluffCatch(tag) {
  const bot = {
    id: "bot:TEST:1",
    botProfile: tag,
    hand: ["Ah", "9c"],
    bet: 0,
    stack: 900,
    invested: 100,
    folded: false,
    allIn: false,
  };
  const villain = {
    id: "human",
    hand: [],
    bet: 200,
    stack: 700,
    invested: 300,
    folded: false,
    allIn: false,
  };
  return {
    bot,
    room: {
      phase: "river",
      community: ["Kd", "7s", "4h", "2c", "Jd"],
      currentBet: 200,
      minRaise: 200,
      deadPot: 0,
      handNumber: 1,
      baseSmallBlind: 10,
      baseBigBlind: 20,
      moneyMode: false,
      raiseEligible: new Set([bot.id, villain.id]),
      actionLog: [],
      players: [bot, villain],
    },
  };
}
Math.random = lcg(99);
const callRate = {};
try {
  for (const profile of profiles) {
    let calls = 0;
    for (let i = 0; i < 300; i += 1) {
      const { room, bot } = riverBluffCatch(profile.tag);
      if (engine.chooseComputerAction(room, bot).type === "call") calls += 1;
    }
    callRate[profile.short] = calls / 300;
  }
} finally {
  Math.random = realRandom;
}
console.log(
  `  ace-high river bluff-catch call rate: ${Object.entries(callRate)
    .map(([k, v]) => `${k} ${pct(v).trim()}`)
    .join(", ")}`,
);
for (const caller of ["Casual", "Tricky"]) {
  assert.ok(callRate[caller] >= 0.08, `${caller} makes the occasional hero call`);
  assert.ok(callRate[caller] > callRate.Grinder + 0.05, `${caller} hero-calls more than Grinder`);
}
assert.ok(callRate.Grinder <= 0.06, "Grinder rarely hero-calls");

if (process.env.BOT_STATS_REPORT) process.exit(0);

const band = (value, low, high, label) =>
  assert.ok(
    value >= low && value <= high,
    `${label}: ${pct(value)} not in ${pct(low)}–${pct(high)}`,
  );
const others = (short) => Object.keys(stats).filter((name) => name !== short);
const r = rows;

// Table-wide targets.
band(r.All.foldVsBet, 0.35, 0.55, "fold to a postflop bet");
band(r.All.wtsd, 0.25, 0.35, "went to showdown (of hands that saw a flop)");
band(r.All.bluffShare, 0.2, 0.35, "bluffs as a share of postflop bets");
band(r.All.cbet, 0.55, 0.75, "flop c-bet as the preflop raiser");
band(r.All.vpip, 0.25, 0.33, "VPIP (preflop unchanged)");

// Personality offsets.
for (const name of others("Grinder")) {
  assert.ok(r.Grinder.foldVsBet > r[name].foldVsBet, `Grinder folds the most (vs ${name})`);
}
for (const name of others("Casual")) {
  assert.ok(r.Casual.foldVsBet < r[name].foldVsBet, `Casual is the stickiest (vs ${name})`);
  assert.ok(r.Casual.bluffShare < r[name].bluffShare, `Casual bluffs the least (vs ${name})`);
}
band(r.Casual.foldVsBet, 0.24, 0.36, "Casual fold to a bet");
band(r.Casual.bluffShare, 0, 0.05, "Casual bluff share");
for (const bluffer of ["Pressure", "Tricky"]) {
  for (const name of ["Grinder", "Balanced", "Casual", "Quick"]) {
    assert.ok(r[bluffer].bluffShare > r[name].bluffShare, `${bluffer} bluffs more than ${name}`);
  }
  band(r[bluffer].bluffShare, 0.22, 0.4, `${bluffer} bluff share`);
}

console.log("Bot postflop stat checks passed.");
