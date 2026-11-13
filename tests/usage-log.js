const assert = require("node:assert/strict");
const {
  USAGE_LOG_PREFIX,
  formatUsageLine,
  setUsageLogWriter,
  resetUsageStats,
  noteRoomUsage,
  takeRoomUsage,
  seatedIds,
  logRoomCreated,
  logPlayerJoined,
  logPlayerLeft,
  logNewSeatedPlayers,
  logHandStarted,
  logRoomClosed,
} = require("../dist/server/usage-log");

const FORBIDDEN = /token|reconnect|ipAddress|srcIp|ledger|buyIn|cashOut|chat|messageId/i;

function parseLine(line) {
  assert.equal(line.startsWith(`${USAGE_LOG_PREFIX} `), true);
  return JSON.parse(line.slice(USAGE_LOG_PREFIX.length + 1));
}

{
  const line = formatUsageLine({
    event: "room_created",
    room: "PLNZ3C",
    host: "Daniel",
    moneyMode: false,
  });
  const parsed = parseLine(line);
  assert.equal(parsed.event, "room_created");
  assert.equal(parsed.room, "PLNZ3C");
  assert.equal(parsed.host, "Daniel");
  assert.equal(parsed.moneyMode, false);
  assert.equal(FORBIDDEN.test(line), false);
}

{
  const line = formatUsageLine({
    event: "player_left",
    room: "ABC123",
    name: "Ada Lovelace",
    kind: "human",
    spectator: false,
  });
  assert.equal(parseLine(line).name, "Ada Lovelace");
}

const lines = [];
setUsageLogWriter((line) => {
  lines.push(line);
});
resetUsageStats();

const room = {
  id: "PLNZ3C",
  handNumber: 0,
  moneyMode: false,
  players: [{ id: "host-1", name: "Daniel", isBot: false }],
};

logRoomCreated(room, "Daniel", false);
logPlayerJoined(room, room.players[0], 0);
const beforeBots = seatedIds(room);
room.players.push({ id: "bot:1", name: "CPU 1", isBot: true });
logNewSeatedPlayers(room, beforeBots);
room.handNumber = 1;
logHandStarted(room);
room.players.push({ id: "p2", name: "Sam", isBot: false });
logPlayerJoined(room, room.players[2], 2);
logPlayerLeft(room, "Sam", { kind: "human" });
room.players.splice(2, 1);
room.handNumber = 3;
logRoomClosed(room, "empty", 10_000 + noteRoomUsage(room).createdAt);

assert.equal(lines.length, 7);
assert.deepEqual(
  lines.map((line) => parseLine(line).event),
  [
    "room_created",
    "player_joined",
    "player_joined",
    "hand_started",
    "player_joined",
    "player_left",
    "room_closed",
  ],
);

const created = parseLine(lines[0]);
assert.equal(created.host, "Daniel");
assert.equal(created.moneyMode, false);

const botJoin = parseLine(lines[2]);
assert.equal(botJoin.kind, "bot");
assert.equal(botJoin.seat, 1);
assert.equal(botJoin.spectator, false);
assert.equal(botJoin.rejoin, false);

const hand = parseLine(lines[3]);
assert.equal(hand.hand, 1);
assert.equal(hand.humans, 1);
assert.equal(hand.bots, 1);

const closed = parseLine(lines[6]);
assert.equal(closed.reason, "empty");
assert.equal(closed.hands, 3);
assert.equal(closed.maxHumans, 2);
assert.equal(closed.durationMs, 10_000);
assert.equal(takeRoomUsage("PLNZ3C"), undefined);

for (const line of lines) {
  assert.equal(FORBIDDEN.test(line), false);
}

setUsageLogWriter(null);
resetUsageStats();

console.log("usage-log tests passed");
