const assert = require("assert");
const { preflopBlindRaiseChance } = require("../server");

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

console.log("Bot aggression test passed");
