const assert = require("assert");
const {
  assessPreflopAllInCall,
  chooseComputerAction,
  chooseComputerRaiseTo,
  estimateComputerConfidence,
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
const balancedRegular = { id: "bot:ROOM:3" };
const pressurePlayer = { id: "bot:ROOM:4" };

const loosePremiumChance = preflopBlindRaiseChance(looseCannon, 0.84);
const looseWeakChance = preflopBlindRaiseChance(looseCannon, 0.24);
const patientPremiumChance = preflopBlindRaiseChance(patientGrinder, 0.84);
const pressurePremiumChance = preflopBlindRaiseChance(pressurePlayer, 0.84);
const balancedMidPairChance = preflopBlindRaiseChance(balancedRegular, 0.54);
const balancedBroadwayChance = preflopBlindRaiseChance(balancedRegular, 0.6);

assert(loosePremiumChance >= 0.7, "premium hands should raise the blind at a high frequency");
assert(looseWeakChance > 0 && looseWeakChance < 0.12, "weak hands should bluff occasionally, not constantly");
assert(loosePremiumChance > patientPremiumChance, "loose bots should raise more than patient bots");
assert(pressurePremiumChance > patientPremiumChance, "pressure bots should raise more than patient bots");
assert(pressurePremiumChance <= 0.9, "preflop raising should still respect an aggression cap");
assert(balancedMidPairChance >= 0.35, "medium pocket pairs should raise blinds often enough");
assert(balancedBroadwayChance >= 0.4, "suited broadway hands should raise blinds at a solid rate");

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

function facingBlindRoom(botNumber, hand) {
  const bot = {
    id: `bot:TEST:${botNumber}`,
    hand,
    bet: 10,
    stack: 990,
    invested: 10,
    folded: false,
    allIn: false,
  };
  const villain = {
    id: "human",
    hand: [],
    bet: 20,
    stack: 980,
    invested: 20,
    folded: false,
    allIn: false,
  };
  return {
    bot,
    room: {
      phase: "preflop",
      community: [],
      currentBet: 20,
      minRaise: 20,
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

function facingOpenRoom(botNumber, hand) {
  const bot = {
    id: `bot:TEST:${botNumber}`,
    hand,
    bet: 20,
    stack: 980,
    invested: 20,
    folded: false,
    allIn: false,
  };
  const villain = {
    id: "human",
    hand: [],
    bet: 60,
    stack: 940,
    invested: 60,
    folded: false,
    allIn: false,
  };
  return {
    bot,
    room: {
      phase: "preflop",
      community: [],
      currentBet: 60,
      minRaise: 40,
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

function checkedToRoom(botNumber, hand, community = []) {
  const bot = {
    id: `bot:TEST:${botNumber}`,
    hand,
    bet: 0,
    stack: 940,
    invested: 0,
    folded: false,
    allIn: false,
  };
  const villain = {
    id: "human",
    hand: [],
    bet: 0,
    stack: 940,
    invested: 0,
    folded: false,
    allIn: false,
  };
  return {
    bot,
    room: {
      phase: community.length ? "flop" : "preflop",
      community,
      currentBet: 0,
      minRaise: 20,
      deadPot: community.length ? 120 : 30,
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

function actionRate(build, hand, trials = 220) {
  const counts = { raise: 0, call: 0, check: 0, fold: 0, sizes: [] };
  for (let i = 0; i < trials; i += 1) {
    const { room, bot } = build(hand);
    const action = chooseComputerAction(room, bot);
    counts[action.type] += 1;
    if (action.type === "raise") counts.sizes.push(action.raiseTo);
  }
  return {
    raise: counts.raise / trials,
    call: counts.call / trials,
    check: counts.check / trials,
    fold: counts.fold / trials,
    avgRaiseTo: counts.sizes.length
      ? counts.sizes.reduce((sum, value) => sum + value, 0) / counts.sizes.length
      : 0,
  };
}

const midPairConfidence = estimateComputerConfidence(
  facingBlindRoom(3, ["9s", "9h"]).room,
  facingBlindRoom(3, ["9s", "9h"]).bot,
);
assert(midPairConfidence >= 0.5, "medium pocket pairs should clear the value-raise confidence floor");

const blindAces = actionRate((hand) => facingBlindRoom(3, hand), ["As", "Ah"], 240);
const blindNines = actionRate((hand) => facingBlindRoom(3, hand), ["9s", "9h"], 240);
const blindJunk = actionRate((hand) => facingBlindRoom(3, hand), ["7s", "2h"], 240);
assert(blindAces.raise >= 0.65, `aces should usually raise blinds (got ${(blindAces.raise * 100).toFixed(1)}%)`);
assert(blindNines.raise >= 0.3, `nines should raise blinds often enough (got ${(blindNines.raise * 100).toFixed(1)}%)`);
assert(blindJunk.raise < 0.12, `junk should rarely raise blinds (got ${(blindJunk.raise * 100).toFixed(1)}%)`);
assert(blindAces.avgRaiseTo >= 50, `aces opens should average above a min-raise (got ${blindAces.avgRaiseTo.toFixed(1)})`);

const threeBetAces = actionRate((hand) => facingOpenRoom(3, hand), ["As", "Ah"], 160);
const threeBetKings = actionRate((hand) => facingOpenRoom(4, hand), ["Ks", "Kh"], 160);
assert(threeBetAces.raise >= 0.45, `aces should 3-bet opens frequently (got ${(threeBetAces.raise * 100).toFixed(1)}%)`);
assert(threeBetKings.raise >= 0.4, `pressure kings should 3-bet opens frequently (got ${(threeBetKings.raise * 100).toFixed(1)}%)`);

const checkedAces = actionRate((hand) => checkedToRoom(3, hand), ["As", "Ah"], 160);
assert(checkedAces.raise >= 0.5, `aces should bet often when checked to (got ${(checkedAces.raise * 100).toFixed(1)}%)`);

const sizingRoom = facingBlindRoom(3, ["As", "Ah"]).room;
const sizingBot = facingBlindRoom(3, ["As", "Ah"]).bot;
const openSizes = Array.from({ length: 80 }, () => chooseComputerRaiseTo(sizingRoom, sizingBot, 40, 0.84));
const aboveMin = openSizes.filter((size) => size > 40).length / openSizes.length;
assert(aboveMin >= 0.55, `preflop opens should usually size above the min-raise (got ${(aboveMin * 100).toFixed(1)}%)`);

console.log("Bot aggression test passed");
