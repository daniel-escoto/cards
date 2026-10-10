const assert = require("node:assert/strict");
const engine = require("../shared/engine");
const { createPracticeSession, createPracticeSessionFromSnapshot } = require("../public/practice");
const { restoreRoom, serializeRoom, serializeRoomForStorage } = require("../server");

// Board where 7-2 offsuit makes two pair (7s and 2s) and beats K-Q.
const COMMUNITY = ["7h", "2s", "9d", "Jc", "4h"];

function makePlayer(id, hand, { stack = 400, invested = 100, folded = false } = {}) {
  return {
    id,
    name: id,
    hand,
    stack,
    bet: 0,
    invested,
    folded,
    allIn: false,
    showCards: false,
    isBot: false,
    sittingOut: false,
    preflopShoveStreak: 0,
  };
}

function makeRoom(players, { sevenDeuce = true, moneyMode = false } = {}) {
  return {
    showdownTimer: null,
    turn: null,
    community: COMMUNITY,
    deadPot: 0,
    dealer: 0,
    phase: "river",
    status: "playing",
    handNumber: 1,
    winners: [],
    message: "",
    actionLog: [],
    lastAggressorId: null,
    moneyMode,
    moneyUnitCents: moneyMode ? 1 : null,
    houseRules: { sevenDeuce },
    players,
  };
}

const stackOf = (room, id) => room.players.find((p) => p.id === id).stack;

assert.equal(engine.isSevenDeuceOffsuit(["7c", "2d"]), true);
assert.equal(engine.isSevenDeuceOffsuit(["2h", "7s"]), true);
assert.equal(engine.isSevenDeuceOffsuit(["7c", "2c"]), false, "suited 7-2 does not count");
assert.equal(engine.isSevenDeuceOffsuit(["7c", "3d"]), false);

// Showdown win with 7-2 offsuit collects 100 chips from everyone else dealt in.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"]),
    makePlayer("villain", ["Kd", "Qs"]),
    makePlayer("folder", ["Ah", "3c"], { folded: true }),
    makePlayer("sittingOut", [], { invested: 0 }),
  ]);
  engine.settleShowdown(room);
  // hero wins the 300 pot, plus 100 from villain and folder; sittingOut was not dealt in.
  assert.equal(stackOf(room, "hero"), 400 + 300 + 200);
  assert.equal(stackOf(room, "villain"), 300);
  assert.equal(stackOf(room, "folder"), 300);
  assert.equal(stackOf(room, "sittingOut"), 400);
  assert.deepEqual(room.bounties, [{ playerId: "hero", name: "hero", amount: 200 }]);
  assert.equal(room.players[0].showCards, true);
}

// Short stacks pay only what they have — never negative.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"]),
    makePlayer("villain", ["Kd", "Qs"], { stack: 0 }),
    makePlayer("shorty", ["Ah", "3c"], { stack: 40, folded: true }),
  ]);
  engine.settleShowdown(room);
  assert.equal(stackOf(room, "villain"), 0);
  assert.equal(stackOf(room, "shorty"), 0);
  assert.equal(stackOf(room, "hero"), 400 + 300 + 40);
}

// Winning uncontested (everyone folds to a 7-2 bluff) also pays.
{
  const room = makeRoom([
    makePlayer("hero", ["2h", "7s"]),
    makePlayer("villain", ["Kd", "Qs"], { folded: true }),
  ]);
  engine.awardUncontested(room, room.players[0]);
  assert.equal(stackOf(room, "hero"), 400 + 200 + 100);
  assert.equal(stackOf(room, "villain"), 300);
}

// Rule off: no bounty.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"]),
    makePlayer("villain", ["Kd", "Qs"]),
  ], { sevenDeuce: false });
  engine.settleShowdown(room);
  assert.equal(stackOf(room, "hero"), 600);
  assert.equal(stackOf(room, "villain"), 400);
  assert.deepEqual(room.bounties, []);
}

// Losing with 7-2 pays nothing.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"]),
    makePlayer("villain", ["7d", "9s"]),
  ]);
  engine.settleShowdown(room);
  assert.equal(stackOf(room, "hero"), 400);
  assert.equal(stackOf(room, "villain"), 600);
  assert.deepEqual(room.bounties, []);
}

// Money mode: chips are cents, so the bounty is exactly $1.00.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"], { stack: 2000, invested: 500 }),
    makePlayer("villain", ["Kd", "Qs"], { stack: 2000, invested: 500 }),
  ], { moneyMode: true });
  engine.settleShowdown(room);
  assert.equal(stackOf(room, "villain"), 1900);
  assert.equal(stackOf(room, "hero"), 2000 + 1000 + 100);
}

// Practice rooms carry the setting from options.
{
  const room = engine.createPracticeRoom({ botCount: 1, houseRules: { sevenDeuce: true } });
  assert.equal(room.houseRules.sevenDeuce, true);
  assert.equal(engine.serializeRoom(room, room.hostId).houseRules.sevenDeuce, true);
}

// Rule defaults off and only reads a truthy sevenDeuce flag.
{
  assert.deepEqual(engine.cleanHouseRules(undefined), { sevenDeuce: false });
  assert.deepEqual(engine.cleanHouseRules({ sevenDeuce: 1, junk: true }), { sevenDeuce: true });
  assert.equal(engine.createPracticeRoom({ botCount: 1 }).houseRules.sevenDeuce, false);
}

// Bounty size: 100 chips in chip games, exactly $1.00 in money games.
{
  assert.equal(engine.sevenDeuceBountyChips({ moneyMode: false }), 100);
  assert.equal(engine.sevenDeuceBountyChips({ moneyMode: true, moneyUnitCents: 1 }), 100);
}

// Split pot where two players both hold 7-2 offsuit: each collects from everyone else dealt in.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"]),
    makePlayer("twin", ["7s", "2c"]),
    makePlayer("villain", ["Kd", "Qs"]),
  ]);
  engine.settleShowdown(room);
  // Pot of 300 split 150/150. hero pays twin 100, twin pays hero 100, villain pays both.
  assert.equal(stackOf(room, "villain"), 200);
  assert.equal(stackOf(room, "hero"), 400 + 150 + 100 + 100 - 100);
  assert.equal(stackOf(room, "twin"), 400 + 150 + 100 + 100 - 100);
  assert.equal(room.bounties.length, 2);
}

// The bounty is only collected once per winner, even when they win several side pots.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"], { invested: 200 }),
    makePlayer("short", ["Kd", "Qs"], { invested: 50, stack: 0 }),
    makePlayer("villain", ["Ah", "3c"], { invested: 200 }),
  ]);
  engine.settleShowdown(room);
  assert.equal(room.bounties.length, 1);
  assert.equal(room.bounties[0].amount, 100, "busted player pays nothing; villain pays 100");
  assert.equal(stackOf(room, "hero"), 400 + 450 + 100);
  assert.equal(stackOf(room, "short"), 0);
}

// Bounty is announced in the message and action log, and serialized with cents.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"]),
    makePlayer("villain", ["Kd", "Qs"]),
  ]);
  engine.settleShowdown(room);
  assert.match(room.message, /hero collects 100 7-2 bounty/);
  assert.ok(room.actionLog.some((entry) => /7-2 bounty/.test(entry.text || entry.action || "")));
  room.hostId = "hero";
  const view = engine.serializeRoom(room, "villain");
  assert.equal(view.bounties[0].amount, 100);
  assert.equal(typeof view.bounties[0].amountCents, "number");
  assert.equal(view.canChangeHouseRules, false, "only the host can change house rules");
}

// Bounties clear when the next hand starts.
{
  const room = makeRoom([
    makePlayer("hero", ["7c", "2d"]),
    makePlayer("villain", ["Kd", "Qs"]),
  ]);
  engine.settleShowdown(room);
  assert.equal(room.bounties.length, 1);
  engine.resetHandState(room);
  assert.deepEqual(room.bounties, []);
}

// Practice session: host can toggle between hands, not mid-hand.
{
  const updates = [];
  const session = createPracticeSession({ botCount: 1, onUpdate: (snap) => updates.push(snap) });
  const room = session.getRoom();
  assert.equal(session.handle("game:setHouseRules", { sevenDeuce: true }).ok, true);
  assert.equal(room.houseRules.sevenDeuce, true);
  assert.equal(updates.at(-1).houseRules.sevenDeuce, true);
  assert.equal(updates.at(-1).canChangeHouseRules, true);

  room.phase = "flop";
  const midHand = session.handle("game:setHouseRules", { sevenDeuce: false });
  assert.equal(midHand.ok, false);
  assert.equal(room.houseRules.sevenDeuce, true);
  session.dispose();
}

// Offline handoff keeps the online room's house rules.
{
  const online = engine.createPracticeRoom({ botCount: 1, houseRules: { sevenDeuce: true } });
  const snapshot = engine.serializeRoom(online, online.hostId);
  const session = createPracticeSessionFromSnapshot(snapshot);
  assert.equal(session.getRoom().houseRules.sevenDeuce, true);
  session.dispose();
}

// Server: house rules survive a save/restore and are sent to clients.
{
  const room = restoreRoom({
    id: "RULES1",
    hostId: "alice",
    status: "lobby",
    phase: "lobby",
    houseRules: { sevenDeuce: true },
    bounties: [{ playerId: "alice", name: "Alice", amount: 100 }],
    players: [{ id: "alice", name: "Alice", stack: 1000 }, { id: "bob", name: "Bob", stack: 1000 }],
  });
  assert.equal(room.houseRules.sevenDeuce, true);
  const stored = serializeRoomForStorage(room);
  assert.deepEqual(stored.houseRules, { sevenDeuce: true });
  assert.equal(stored.bounties.length, 1);
  assert.equal(restoreRoom(stored).houseRules.sevenDeuce, true);

  const hostView = serializeRoom(room, "alice");
  assert.equal(hostView.houseRules.sevenDeuce, true);
  assert.equal(hostView.canChangeHouseRules, true);
  assert.equal(hostView.sevenDeuceBounty, 100);
  assert.equal(serializeRoom(room, "bob").canChangeHouseRules, false);

  assert.equal(restoreRoom({ ...stored, houseRules: undefined }).houseRules.sevenDeuce, false, "older saves default off");
}

console.log("seven-deuce tests passed");
process.exit(0);
