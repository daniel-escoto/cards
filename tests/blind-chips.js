const assert = require("node:assert/strict");
const engine = require("../dist/shared/engine.node");
const { createPracticeSessionFromSnapshot } = require("../dist/public/practice");
const { restoreRoom, serializeRoom, serializeRoomForStorage } = require("../dist/server");

engine.setRandomInt(() => 0);

function blindFlags(view) {
  return Object.fromEntries(
    view.players.map((player) => [player.id, [player.isSmallBlind, player.isBigBlind]]),
  );
}

function postedBlinds(room) {
  return {
    small: room.players.find((player) => player.bet === engine.currentBlinds(room).smallBlind)?.id,
    big: room.players.find((player) => player.bet === engine.currentBlinds(room).bigBlind)?.id,
  };
}

// Multi-way: the players who post the blinds are the ones flagged SB and BB.
{
  const room = engine.createPracticeRoom({ botCount: 3 });
  assert.equal(room.smallBlindPlayerId, undefined);
  assert.ok(
    engine.serializeRoom(room, room.hostId).players.every((p) => !p.isSmallBlind && !p.isBigBlind),
    "no blind chips before the first hand",
  );

  engine.startHand(room);
  const posted = postedBlinds(room);
  assert.equal(room.smallBlindPlayerId, posted.small);
  assert.equal(room.bigBlindPlayerId, posted.big);
  assert.notEqual(room.smallBlindPlayerId, room.bigBlindPlayerId);

  const flags = blindFlags(engine.serializeRoom(room, room.hostId));
  assert.deepEqual(flags[posted.small], [true, false]);
  assert.deepEqual(flags[posted.big], [false, true]);
  assert.equal(Object.values(flags).filter(([sb, bb]) => sb || bb).length, 2, "exactly two chips");
  const dealerId = room.players[room.dealer].id;
  assert.notEqual(dealerId, room.bigBlindPlayerId, "with 3+ players the dealer is never the BB");
  assert.notEqual(dealerId, room.smallBlindPlayerId, "with 3+ players the dealer is not the SB");

  // Chips move with the button on the next hand.
  const firstBig = room.bigBlindPlayerId;
  room.phase = "complete";
  engine.startNextHand(room);
  assert.equal(room.smallBlindPlayerId, firstBig, "last hand's big blind becomes the small blind");
  assert.equal(room.bigBlindPlayerId, postedBlinds(room).big);
}

// Heads-up: the dealer posts the small blind.
{
  const room = engine.createPracticeRoom({ botCount: 1 });
  engine.startHand(room);
  assert.equal(room.smallBlindPlayerId, room.players[room.dealer].id);
  assert.notEqual(room.bigBlindPlayerId, room.smallBlindPlayerId);
}

// Busted and sitting-out players are skipped.
{
  const room = engine.createPracticeRoom({ botCount: 3 });
  room.dealer = 0;
  room.handNumber = 1;
  room.players[1].stack = 0;
  room.players[2].sittingOut = true;
  engine.startHand(room);
  assert.notEqual(room.smallBlindPlayerId, room.players[1].id);
  assert.notEqual(room.smallBlindPlayerId, room.players[2].id);
  assert.notEqual(room.bigBlindPlayerId, room.players[1].id);
  assert.notEqual(room.bigBlindPlayerId, room.players[2].id);
}

// Restarting or ending the practice game clears the chips.
{
  const room = engine.createPracticeRoom({ botCount: 2 });
  engine.startHand(room);
  engine.restartPracticeRoom(room);
  assert.equal(room.smallBlindPlayerId, null);
  assert.equal(room.bigBlindPlayerId, null);

  engine.startHand(room);
  engine.endPracticeGame(room);
  assert.equal(room.smallBlindPlayerId, null);
  assert.equal(room.bigBlindPlayerId, null);
}

// Offline handoff keeps the blind seats from the online snapshot.
{
  const online = engine.createPracticeRoom({ botCount: 2 });
  engine.startHand(online);
  const snapshot = engine.serializeRoom(online, online.hostId);
  const session = createPracticeSessionFromSnapshot(snapshot);
  const room = session.getRoom();
  assert.equal(room.smallBlindPlayerId, online.smallBlindPlayerId);
  assert.equal(room.bigBlindPlayerId, online.bigBlindPlayerId);
  session.dispose();
}

// Server: blind seats survive a save/restore and are sent to clients.
{
  const room = restoreRoom({
    id: "BLINDS",
    hostId: "alice",
    status: "playing",
    phase: "preflop",
    smallBlindPlayerId: "alice",
    bigBlindPlayerId: "bob",
    players: [
      { id: "alice", name: "Alice", stack: 990, bet: 10, invested: 10 },
      { id: "bob", name: "Bob", stack: 980, bet: 20, invested: 20 },
      { id: "cara", name: "Cara", stack: 1000 },
    ],
  });
  const stored = serializeRoomForStorage(room);
  assert.equal(stored.smallBlindPlayerId, "alice");
  assert.equal(stored.bigBlindPlayerId, "bob");

  const flags = blindFlags(serializeRoom(restoreRoom(stored), "cara"));
  assert.deepEqual(flags, { alice: [true, false], bob: [false, true], cara: [false, false] });

  const legacy = restoreRoom({
    ...stored,
    smallBlindPlayerId: undefined,
    bigBlindPlayerId: undefined,
  });
  assert.ok(
    serializeRoom(legacy, "cara").players.every((p) => !p.isSmallBlind && !p.isBigBlind),
    "older saves show no chips",
  );
}

console.log("Blind chip checks passed.");
process.exit(0);
