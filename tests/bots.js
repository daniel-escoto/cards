const assert = require("assert");
const {
  assessPreflopAllInCall,
  estimatePostflopEquity,
  estimatePreflopEquityAgainstRange,
  preflopBlindRaiseChance,
  preflopShoveRange,
} = require("../server");

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

const looseCannon = { id: "bot:ROOM:1" };
const patientGrinder = { id: "bot:ROOM:2" };
const pressurePlayer = { id: "bot:ROOM:4" };

const loosePremiumChance = preflopBlindRaiseChance(looseCannon, 0.84);
const looseWeakChance = preflopBlindRaiseChance(looseCannon, 0.24);
const patientPremiumChance = preflopBlindRaiseChance(patientGrinder, 0.84);
const pressurePremiumChance = preflopBlindRaiseChance(pressurePlayer, 0.84);

assert(loosePremiumChance >= 0.5, "premium hands should raise the blind at a meaningful frequency");
assert(looseWeakChance > 0 && looseWeakChance < 0.1, "weak hands should bluff occasionally, not constantly");
assert(loosePremiumChance > patientPremiumChance, "loose bots should raise more than patient bots");
assert(pressurePremiumChance > patientPremiumChance, "pressure bots should raise more than patient bots");
assert(pressurePremiumChance <= 0.62, "preflop raising should respect the aggression cap");

const balancedProfile = { skill: 0.76 };
assert(
  preflopShoveRange(8, 1, balancedProfile) > preflopShoveRange(50, 1, balancedProfile),
  "short-stack shoves should be interpreted as wider ranges",
);
assert(
  preflopShoveRange(50, 4, balancedProfile) > preflopShoveRange(50, 1, balancedProfile) + 0.5,
  "repeated shoves should substantially widen the inferred range",
);

const acesEquity = estimatePreflopEquityAgainstRange(["As", "Ah"], 1, 240, seededRandom(7));
const weakEquity = estimatePreflopEquityAgainstRange(["7s", "2h"], 0.12, 240, seededRandom(9));
assert(acesEquity > 0.8, "aces should retain dominant equity against a wide range");
assert(weakEquity < 0.35, "a weak hand should fare poorly against a tight shove range");

const flushEquity = estimatePostflopEquity(["Ah", "Kh"], ["Qh", "7h", "2h"], 180, seededRandom(11));
assert(flushEquity > 0.9, "postflop equity should recognize a made nut flush");

function allInRoom(botHand, shoveStreak) {
  const bot = {
    id: "bot:TEST:3",
    hand: botHand,
    bet: 20,
    stack: 980,
    invested: 20,
    folded: false,
    allIn: false,
  };
  const aggressor = {
    id: "human",
    hand: [],
    bet: 1000,
    stack: 0,
    invested: 1000,
    folded: false,
    allIn: true,
    preflopShoveStreak: shoveStreak,
  };
  return {
    bot,
    aggressor,
    room: {
      phase: "preflop",
      community: [],
      currentBet: 1000,
      deadPot: 0,
      handNumber: 1,
      baseSmallBlind: 10,
      baseBigBlind: 20,
      moneyMode: false,
      players: [bot, aggressor],
    },
  };
}

const premiumSpot = allInRoom(["As", "Ah"], 1);
assert(
  assessPreflopAllInCall(premiumSpot.room, premiumSpot.bot, premiumSpot.aggressor, {
    iterations: 260,
    random: seededRandom(13),
  }).call,
  "a CPU should call a heads-up shove with aces",
);

const adaptiveSpot = allInRoom(["Ks", "8s"], 5);
assert(
  assessPreflopAllInCall(adaptiveSpot.room, adaptiveSpot.bot, adaptiveSpot.aggressor, {
    iterations: 320,
    random: seededRandom(15),
  }).call,
  "a CPU should widen its calls against persistent shove spam",
);

console.log("Bot aggression test passed");
