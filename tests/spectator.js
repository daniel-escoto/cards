// Short disconnect grace so leave/disconnect cleanup is deterministic and cannot hang CI.
// Must be set before requiring server.js (it reads these at module load).
process.env.DISCONNECT_GRACE_MS = "50";
process.env.BACKGROUND_DISCONNECT_GRACE_MS = "50";

const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const engine = require("../shared/engine");
const {
  applyReadyTimeout,
  clearReadyTimer,
  clearSpectators,
  clearTurnTimer,
  rooms,
  serializeRoom,
  serializeRoomForStorage,
  server,
} = require("../server");

engine.setRandomInt(() => 0);

const sockets = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

async function wait(check, label = "condition") {
  for (let i = 0; i < 400; i += 1) {
    if (check()) return;
    await pause();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function holeCodes(cards) {
  return (cards || []).filter(Boolean).map((card) => card.code || `${card.rank}${card.suit}`);
}

function clearRoomTimers(room) {
  if (!room) return;
  clearTimeout(room.botTimer);
  clearTimeout(room.showdownTimer);
  clearTimeout(room.dormantTimer);
  clearTurnTimer(room);
  clearReadyTimer(room);
  for (const player of room.players || []) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
  for (const spectator of room.spectators || []) {
    clearTimeout(spectator.disconnectTimer);
    spectator.disconnectTimer = null;
  }
  clearSpectators(room);
}

async function shutdown() {
  for (const socket of sockets.splice(0)) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {
      // ignore
    }
  }
  for (const room of [...rooms.values()]) {
    clearRoomTimers(room);
    rooms.delete(room.id);
  }
  if (server.listening) {
    await new Promise((resolve) => {
      server.close(() => resolve());
      // Force-close lingering keep-alives so CI cannot stall on open sockets.
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    });
  }
}

// Unit: spectator viewer never receives hole cards before a legitimate reveal.
{
  const room = {
    id: "SPEC01",
    hostId: "alice",
    phase: "flop",
    status: "playing",
    dealer: 0,
    turn: "alice",
    currentBet: 20,
    minRaise: 20,
    deadPot: 0,
    community: ["2c", "3d", "4h"],
    deck: [],
    acted: new Set(["alice"]),
    raiseEligible: new Set(["alice", "bob"]),
    winners: [],
    actionLog: [],
    handNumber: 1,
    moneyMode: false,
    buyInCents: 0,
    baseSmallBlind: 10,
    baseBigBlind: 20,
    settlements: [],
    moneyLedger: [],
    turnTimeLimitMs: 0,
    turnEndsAt: null,
    readyEndsAt: null,
    spectators: [{ id: "watcher", name: "Watcher", socketIds: new Set(), connected: true }],
    players: [
      {
        id: "alice",
        name: "Alice",
        stack: 980,
        hand: ["As", "Kd"],
        folded: false,
        allIn: false,
        bet: 20,
        invested: 20,
        showCards: false,
        isBot: false,
        sittingOut: false,
        connected: true,
        ready: false,
        color: null,
      },
      {
        id: "bob",
        name: "Bob",
        stack: 980,
        hand: ["Qh", "Qd"],
        folded: false,
        allIn: false,
        bet: 20,
        invested: 20,
        showCards: false,
        isBot: false,
        sittingOut: false,
        connected: true,
        ready: false,
        color: null,
      },
    ],
  };

  const view = serializeRoom(room, "watcher");
  assert.equal(view.isSpectator, true);
  assert.equal(view.canReady, false);
  assert.equal(view.isYourTurn, false);
  assert.equal(view.canShowHand, false);
  assert.equal(view.watchingCount, 1);
  for (const player of view.players) {
    assert.ok(player.cards.every((card) => card === null), `spectator must not see ${player.id} holes pre-reveal`);
  }

  room.players[0].showCards = true;
  const revealed = serializeRoom(room, "watcher");
  assert.ok(revealed.players[0].cards.every((card) => card && card.code), "spectator sees legitimate reveals");
  assert.ok(revealed.players[1].cards.every((card) => card === null), "unrevealed holes stay hidden");

  const stored = serializeRoomForStorage(room);
  assert.equal("spectators" in stored, false, "spectators must not persist in rooms.json");
}

// Unit: ready-timer sit-out ignores spectators.
{
  const readyRoomId = "RDYSPC";
  const readyRoom = {
    id: readyRoomId,
    hostId: "alice",
    tableSize: 0,
    status: "complete",
    phase: "complete",
    deck: engine.makeDeck(),
    community: [],
    dealer: 0,
    turn: null,
    currentBet: 0,
    minRaise: 20,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(),
    message: "ready",
    winners: [],
    actionLog: [],
    handNumber: 1,
    moneyMode: false,
    buyInCents: 0,
    baseSmallBlind: 10,
    baseBigBlind: 20,
    settlements: [],
    moneyLedger: [],
    turnTimeLimitMs: 30000,
    turnTimer: null,
    turnEndsAt: null,
    turnTimerPlayerId: null,
    readyTimer: null,
    readyEndsAt: null,
    botTimer: null,
    showdownTimer: null,
    dormantTimer: null,
    dormantSince: null,
    spectators: [{
      id: "ghost",
      name: "Ghost",
      socketIds: new Set(),
      connected: true,
    }],
    players: [
      {
        id: "alice",
        name: "Alice",
        stack: 1000,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        showCards: false,
        ready: true,
        sittingOut: false,
        connected: true,
        isBot: false,
        color: null,
        socketIds: new Set(),
      },
      {
        id: "bob",
        name: "Bob",
        stack: 1000,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        showCards: false,
        ready: false,
        sittingOut: false,
        connected: true,
        isBot: false,
        color: null,
        socketIds: new Set(),
      },
    ],
  };
  rooms.set(readyRoomId, readyRoom);
  applyReadyTimeout(readyRoom);
  assert.equal(readyRoom.players.find((player) => player.id === "bob").sittingOut, true);
  assert.ok(readyRoom.spectators[0]);
  assert.equal(readyRoom.spectators[0].sittingOut, undefined);
  clearRoomTimers(readyRoom);
  rooms.delete(readyRoomId);
}

(async () => {
  if (server.listening) {
    console.log("Spectator mode unit checks passed (socket suite skipped: server already listening)");
    return;
  }

  await new Promise((resolve, reject) => {
    server.listen(0, (error) => (error ? reject(error) : resolve()));
  });
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  function connect(name) {
    const socket = io(url, { transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    const player = {
      socket,
      name,
      deviceId: `spec-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      state: null,
    };
    socket.on("room:update", (state) => { player.state = state; });
    return player;
  }

  function send(player, event, payload = {}) {
    return new Promise((resolve, reject) => {
      player.socket.timeout(4000).emit(event, payload, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  async function ok(player, event, payload) {
    const result = await send(player, event, payload);
    assert.equal(result.ok, true, result.error || `${event} failed`);
    return result;
  }

  function identity(player) {
    return { name: player.name, deviceId: player.deviceId };
  }

  try {
    const host = connect("Host");
    const guest = connect("Guest");
    const watcher = connect("Watcher");
    await wait(() => host.socket.connected && guest.socket.connected && watcher.socket.connected, "connections");

    const created = await ok(host, "room:create", {
      ...identity(host),
      smallBlind: 10,
      bigBlind: 20,
    });
    await ok(guest, "room:join", { ...identity(guest), roomId: created.roomId });
    await wait(() => host.state?.players.length === 2, "two seated players");

    const watched = await ok(watcher, "room:watch", { ...identity(watcher), roomId: created.roomId });
    assert.equal(watched.spectator, true);
    await wait(() => watcher.state?.isSpectator === true, "spectator payload");
    assert.equal(watcher.state.players.length, 2, "spectators do not count as seats");
    assert.equal(watcher.state.watchingCount, 1);
    assert.equal(watcher.state.canReady, false);
    assert.equal(watcher.state.canTakeSeat, true);
    await wait(() => host.state?.watchingCount === 1, "host sees watching count");

    // Full table auto-offers Watch.
    const fillers = [];
    while (host.state.players.length < engine.MAX_PLAYERS) {
      const filler = connect(`F${fillers.length}`);
      fillers.push(filler);
      await wait(() => filler.socket.connected, "filler connect");
      await ok(filler, "room:join", { ...identity(filler), roomId: created.roomId });
      await wait(() => host.state.players.length === 2 + fillers.length, "filler seated");
    }
    const overflow = connect("Overflow");
    await wait(() => overflow.socket.connected, "overflow connect");
    const full = await send(overflow, "room:join", { ...identity(overflow), roomId: created.roomId });
    assert.equal(full.ok, false);
    assert.equal(full.canWatch, true);
    assert.match(full.error || "", /full/i);

    // Dedicated hand room: no hole-card leak, can't act, take-a-seat, reconnect.
    const handHost = connect("HandHost");
    const handGuest = connect("HandGuest");
    const handWatcher = connect("HandWatch");
    await wait(() => handHost.socket.connected && handGuest.socket.connected && handWatcher.socket.connected, "hand connections");
    const handRoom = await ok(handHost, "room:create", { ...identity(handHost), smallBlind: 5, bigBlind: 10 });
    await ok(handGuest, "room:join", { ...identity(handGuest), roomId: handRoom.roomId });
    const handWatchAck = await ok(handWatcher, "room:watch", { ...identity(handWatcher), roomId: handRoom.roomId });
    await wait(() => handWatcher.state?.isSpectator, "hand watcher joined");
    await ok(handHost, "game:ready", { ready: true });
    await ok(handGuest, "game:ready", { ready: true });
    await wait(() => handWatcher.state?.phase === "preflop", "hand dealt");
    for (const player of handWatcher.state.players) {
      assert.equal(holeCodes(player.cards).length, 0, `pre-reveal spectator leak for ${player.id}`);
    }
    assert.equal(handWatcher.state.canReady, false);
    assert.equal((await send(handWatcher, "game:ready", { ready: true })).ok, false, "spectator cannot ready");
    assert.equal((await send(handWatcher, "game:action", { type: "fold" })).ok, false, "spectator cannot act");
    assert.equal((await send(handWatcher, "game:sitOut", {})).ok, false, "spectator cannot sit out");
    assert.equal((await send(handWatcher, "game:setBlinds", { smallBlind: 1, bigBlind: 2 })).ok, false, "spectator cannot change settings");

    const actorId = handWatcher.state.turn;
    const actor = [handHost, handGuest].find((player) => player.deviceId === actorId);
    await ok(actor, "game:action", { type: "fold" });
    await wait(() => handWatcher.state?.phase === "complete", "hand complete");

    // Explicit leave + short DISCONNECT_GRACE_MS: wait until the seat is actually gone.
    await ok(handGuest, "room:leave");
    await wait(
      () => handWatcher.state?.players.length === 1 && handWatcher.state?.canTakeSeat === true,
      "seat free",
    );
    assert.equal(handWatcher.state.players.length, 1);
    assert.equal(handWatcher.state.canTakeSeat, true);

    await ok(handWatcher, "room:takeSeat", {
      ...identity(handWatcher),
      reconnectToken: handWatchAck.reconnectToken,
    });
    await wait(() => handWatcher.state && !handWatcher.state.isSpectator, "took a seat");
    assert.ok(handWatcher.state.players.some((player) => player.isYou));
    assert.equal(handWatcher.state.watchingCount, 0);

    const reconnectHost = connect("ReHost");
    const reconnectWatch = connect("ReWatch");
    await wait(() => reconnectHost.socket.connected && reconnectWatch.socket.connected, "reconnect connections");
    const reRoom = await ok(reconnectHost, "room:create", { ...identity(reconnectHost) });
    const firstWatch = await ok(reconnectWatch, "room:watch", { ...identity(reconnectWatch), roomId: reRoom.roomId });
    await wait(() => reconnectWatch.state?.isSpectator, "initial watch");
    assert.equal(reconnectWatch.state.watchingCount, 1);
    const watcherDeviceId = reconnectWatch.deviceId;
    reconnectWatch.socket.disconnect();

    const reconnectWatch2 = connect("ReWatch2");
    reconnectWatch2.deviceId = watcherDeviceId;
    await wait(() => reconnectWatch2.socket.connected, "watcher reconnect socket");
    await ok(reconnectWatch2, "room:watch", {
      name: reconnectWatch2.name,
      deviceId: watcherDeviceId,
      roomId: reRoom.roomId,
      reconnectToken: firstWatch.reconnectToken,
    });
    await wait(() => reconnectWatch2.state?.isSpectator === true, "spectator reconnected");
    assert.equal(reconnectWatch2.state.watchingCount, 1);
    assert.equal(reconnectWatch2.state.players.some((player) => player.isYou), false);

    console.log("Spectator mode tests passed");
  } finally {
    await shutdown();
  }
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  try {
    await shutdown();
  } catch (shutdownError) {
    console.error(shutdownError);
  }
});
