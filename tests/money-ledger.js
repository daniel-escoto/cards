const assert = require("node:assert/strict");
const {
  DORMANT_ROOM_TTL_MS,
  SETTLED_MONEY_ROOM_TTL_MS,
  getRoom,
  isSettledMoneyRoom,
  optimizeSettlements,
  preserveSettledMoneyRoom,
  removePlayerAfterDisconnect,
  restoreRoom,
  rooms,
  scheduleDormantRoomCleanup,
  serializeRoom,
  serializeRoomForStorage,
} = require("../server");

function makeMoneyPlayer(overrides = {}) {
  return {
    id: overrides.id || "player-a",
    reconnectTokenHash: null,
    socketIds: new Set(),
    name: overrides.name || "Alice",
    color: "#60a5fa",
    stack: overrides.stack ?? 0,
    hand: [],
    folded: true,
    allIn: false,
    bet: overrides.bet ?? 0,
    invested: overrides.invested ?? 0,
    showCards: false,
    ready: false,
    connected: false,
    isBot: false,
    replacedPlayerId: null,
    replacedPlayerName: null,
    replacedPlayerColor: null,
    replacedReconnectTokenHash: null,
    buyInsCents: overrides.buyInsCents ?? 2000,
    cashOutCents: overrides.cashOutCents ?? 0,
    preflopShoveStreak: 0,
    disconnectExpiresAt: null,
    disconnectTimer: null,
  };
}

function makeMoneyRoom(overrides = {}) {
  const alice = makeMoneyPlayer({
    id: "alice",
    name: "Alice",
    stack: overrides.aliceStack ?? 500,
    buyInsCents: 2000,
    cashOutCents: overrides.aliceCashOut ?? 0,
    invested: overrides.aliceInvested ?? 0,
    bet: overrides.aliceInvested ?? 0,
  });
  const bob = makeMoneyPlayer({
    id: "bob",
    name: "Bob",
    stack: overrides.bobStack ?? 1500,
    buyInsCents: 2000,
    cashOutCents: overrides.bobCashOut ?? 0,
  });
  const players = overrides.players || [alice, bob];
  const room = {
    id: overrides.id || "MONEY1",
    hostId: players[0]?.id || null,
    tableSize: 0,
    status: overrides.status || "playing",
    phase: overrides.phase || "complete",
    deck: [],
    community: [],
    dealer: 0,
    turn: null,
    currentBet: 0,
    minRaise: 2,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(),
    message: "test",
    winners: [],
    actionLog: [],
    handNumber: 1,
    moneyMode: true,
    moneyUnitCents: 1,
    buyInCents: 2000,
    baseSmallBlind: 1,
    baseBigBlind: 2,
    settlements: [],
    moneyLedger: overrides.moneyLedger || players.filter((player) => !player.isBot).map((player) => ({
      playerId: player.id,
      name: player.name,
      buyInsCents: player.buyInsCents,
      cashOutCents: player.cashOutCents,
    })),
    players,
    botTimer: null,
    showdownTimer: null,
    dormantSince: null,
    dormantTimer: null,
  };
  rooms.set(room.id, room);
  return room;
}

function clearRooms() {
  for (const room of rooms.values()) {
    clearTimeout(room.dormantTimer);
    clearTimeout(room.botTimer);
    clearTimeout(room.showdownTimer);
  }
  rooms.clear();
}

clearRooms();

// Last human leave keeps the money ledger addressable by room id.
{
  const room = makeMoneyRoom({
    players: [makeMoneyPlayer({
      id: "alice",
      name: "Alice",
      stack: 800,
      buyInsCents: 2000,
      cashOutCents: 1200,
    })],
  });
  const [alice] = room.players;
  removePlayerAfterDisconnect(room, alice);

  const kept = getRoom("MONEY1");
  assert.ok(kept, "money room should remain after last leave");
  assert.equal(kept.phase, "gameover");
  assert.equal(kept.players.length, 0);
  assert.ok(isSettledMoneyRoom(kept));
  assert.equal(kept.moneyLedger.length, 1);
  assert.equal(kept.moneyLedger[0].cashOutCents, 2000);
  assert.ok(kept.dormantSince, "settled room should start TTL clock");
  assert.ok(SETTLED_MONEY_ROOM_TTL_MS >= 24 * 60 * 60 * 1000);
  assert.ok(SETTLED_MONEY_ROOM_TTL_MS >= DORMANT_ROOM_TTL_MS);
}

clearRooms();

// Mid-hand last leave refunds invested chips into the cash-out.
{
  const room = makeMoneyRoom({
    phase: "flop",
    status: "playing",
    players: [makeMoneyPlayer({
      id: "alice",
      name: "Alice",
      stack: 300,
      invested: 200,
      bet: 200,
      buyInsCents: 2000,
      cashOutCents: 0,
    })],
  });
  const [alice] = room.players;
  removePlayerAfterDisconnect(room, alice);
  const kept = getRoom("MONEY1");
  assert.equal(kept.moneyLedger[0].cashOutCents, 500);
  assert.equal(kept.deadPot, 0);
  assert.equal(kept.phase, "gameover");
}

clearRooms();

// Chip (non-money) rooms still delete when empty.
{
  const room = makeMoneyRoom({ id: "CHIPS1" });
  room.moneyMode = false;
  room.moneyLedger = [];
  room.players = [makeMoneyPlayer({ id: "solo", name: "Solo", stack: 1000, buyInsCents: 0 })];
  rooms.set(room.id, room);
  removePlayerAfterDisconnect(room, room.players[0]);
  assert.equal(getRoom("CHIPS1"), undefined);
}

clearRooms();

// Restoring saved empty money state keeps the ledger.
{
  const room = makeMoneyRoom({
    id: "SAVE01",
    phase: "gameover",
    status: "complete",
    players: [],
    moneyLedger: [
      { playerId: "alice", name: "Alice", buyInsCents: 2000, cashOutCents: 500 },
      { playerId: "bob", name: "Bob", buyInsCents: 2000, cashOutCents: 3500 },
    ],
  });
  room.settlements = optimizeSettlements(room.moneyLedger);
  const raw = serializeRoomForStorage(room);
  clearRooms();

  assert.equal(raw.players.length, 0);
  const restored = restoreRoom(raw);
  assert.ok(restored, "empty money room with ledger must restore");
  assert.equal(restored.phase, "gameover");
  assert.equal(restored.moneyLedger.length, 2);
  assert.equal(restored.settlements.length, 1);
  assert.equal(restored.settlements[0].fromName, "Alice");
  assert.equal(restored.settlements[0].toName, "Bob");
  assert.equal(restored.settlements[0].amountCents, 1500);

  const publicState = serializeRoom(restored, "viewer");
  assert.equal(publicState.ledger.length, 2);
  assert.equal(publicState.phase, "gameover");
}

// Empty non-money rooms still fail restore.
{
  const restored = restoreRoom({
    id: "EMPTY1",
    moneyMode: false,
    players: [],
    moneyLedger: [],
    settlements: [],
  });
  assert.equal(restored, null);
}

clearRooms();

(async () => {
  // Settled money rooms expire after TTL.
  {
    const room = makeMoneyRoom({
      id: "TTL001",
      phase: "gameover",
      status: "complete",
      players: [],
      moneyLedger: [
        { playerId: "alice", name: "Alice", buyInsCents: 1000, cashOutCents: 1000 },
      ],
    });
    preserveSettledMoneyRoom(room);
    assert.ok(getRoom("TTL001"));
    room.dormantSince = Date.now() - SETTLED_MONEY_ROOM_TTL_MS - 1000;
    scheduleDormantRoomCleanup(room);

    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(getRoom("TTL001"), undefined, "settled money room should expire after TTL");
  }

  clearRooms();

  // Anyone with the room code can reopen settle-up after the table empties.
  {
    const { io: clientIo } = require("socket.io-client");
    const { server } = require("../server");
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    const room = makeMoneyRoom({
      id: "JOIN01",
      phase: "complete",
      players: [makeMoneyPlayer({
        id: "alice",
        name: "Alice",
        stack: 1000,
        buyInsCents: 2000,
        cashOutCents: 1000,
      })],
    });
    removePlayerAfterDisconnect(room, room.players[0]);
    assert.ok(isSettledMoneyRoom(getRoom("JOIN01")));

    const socket = clientIo(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true });
    await new Promise((resolve, reject) => {
      socket.on("connect", resolve);
      socket.on("connect_error", reject);
    });

    const update = new Promise((resolve) => {
      socket.on("room:update", resolve);
    });
    const ack = await new Promise((resolve) => {
      socket.emit("room:join", {
        roomId: "JOIN01",
        name: "Viewer",
        deviceId: "viewer-device",
      }, resolve);
    });
    assert.equal(ack.ok, true);
    assert.equal(ack.settlementView, true);
    const state = await update;
    assert.equal(state.phase, "gameover");
    assert.equal(state.moneyMode, true);
    assert.equal(state.ledger.length, 1);
    assert.equal(state.ledger[0].name, "Alice");
    assert.equal(state.ledger[0].cashOutCents, 2000);

    socket.close();
    await new Promise((resolve) => server.close(resolve));
  }

  clearRooms();
  console.log("Money ledger persistence checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
