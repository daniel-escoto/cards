// Rabbit hunt (#33, tap the face-down board after a fold-win): correct cards with burns, display only,
// no hole-card / deck leaks, host setting, cleared on the next hand, storage-safe.
const assert = require("node:assert/strict");
const engine = require("../dist/shared/engine.node");
const { createPracticeSession } = require("../dist/public/practice");

function table(seats) {
  const room = engine.createPracticeRoom({
    name: "Hero",
    playerId: "hero",
    tableSize: seats,
    botCount: seats - 1,
    startingStack: 1000,
    smallBlind: 10,
    bigBlind: 20,
  });
  for (const player of room.players) player.ready = true;
  assert.equal(engine.maybeStartReadyHand(room), true);
  return room;
}

function act(room, type) {
  const result = engine.applyPlayerAction(room, room.turn, { type });
  assert.equal(result.ok, true, result.error);
}

/** Check/call until `phase` is reached (or the board would be dealt to the river). */
function playPassiveTo(room, phase) {
  for (let guard = 0; guard < 100 && room.phase !== phase; guard += 1) {
    if (!engine.isHandInProgress(room) || room.phase === "showdown") return;
    const actor = room.players.find((player) => player.id === room.turn);
    act(room, room.currentBet > actor.bet ? "call" : "check");
  }
}

function foldOut(room) {
  for (let guard = 0; guard < 20 && engine.isHandInProgress(room); guard += 1) act(room, "fold");
}

const stateOf = (room) =>
  JSON.stringify({
    stacks: room.players.map((player) => [player.id, player.stack, player.invested]),
    winners: room.winners,
    log: room.actionLog,
    phase: room.phase,
    community: room.community,
    deck: room.deck,
  });

// 1. Revealed cards == what the deal would have produced (burns included), for folds
//    on preflop / flop / turn, across many random decks.
for (const [phase, seats] of [
  ["preflop", 2],
  ["preflop", 4],
  ["flop", 3],
  ["turn", 2],
  ["turn", 5],
]) {
  for (let trial = 0; trial < 40; trial += 1) {
    const room = table(seats);
    playPassiveTo(room, phase);
    assert.equal(room.phase, phase);
    const shadow = structuredClone(room);
    const boardBefore = room.community.slice();

    foldOut(room);
    assert.equal(room.phase, "complete");
    assert.deepEqual(room.community, boardBefore, "fold-win deals nothing");
    assert.equal(engine.canRabbitHunt(room), true);
    const before = stateOf(room);
    assert.equal(engine.revealRabbitHunt(room, room.players[0].id).ok, true);
    assert.equal(stateOf(room), before, "no chip/log/deck change");
    assert.equal(engine.canRabbitHunt(room), false, "once per hand");

    // Same deck, hand played on with checks: the real deal (dealStreet burns) to the river.
    playPassiveTo(shadow, "river");
    assert.equal(shadow.community.length, 5);
    assert.deepEqual(
      [...boardBefore, ...room.rabbitCards],
      shadow.community,
      `${phase}/${seats}-handed runout matches the deal`,
    );
    const client = engine.serializeRoom(room, room.players[0].id);
    assert.deepEqual(
      client.rabbitCards.map((card) => card.code),
      shadow.community.slice(boardBefore.length),
    );
  }
}

// Explicit burn layout on a fixed deck (deck pops from the end).
{
  const deck = [];
  for (let index = 0; index < 20; index += 1) deck.push(`c${index}`);
  // Top of deck = last element: c19 burn, c18 c17 c16 flop, c15 burn, c14 turn, c13 burn, c12 river.
  assert.deepEqual(engine.rabbitHuntRunout({ deck, community: [] }), [
    "c18",
    "c17",
    "c16",
    "c14",
    "c12",
  ]);
  assert.deepEqual(engine.rabbitHuntRunout({ deck, community: ["a", "b", "c"] }), ["c18", "c16"]);
  assert.deepEqual(engine.rabbitHuntRunout({ deck, community: ["a", "b", "c", "d"] }), ["c18"]);
  assert.equal(engine.rabbitHuntRunout({ deck, community: ["a", "b", "c", "d", "e"] }), null);
  assert.equal(engine.rabbitHuntRunout({ deck: [], community: [] }), null);
  assert.deepEqual(deck.length, 20, "runout never mutates the deck");
}

// 2. Not offered after a showdown, while a hand is running, or when switched off;
//    cleared on the next hand; idempotent.
{
  const shown = table(2);
  playPassiveTo(shown, "river");
  playPassiveTo(shown, "showdown");
  if (shown.phase === "showdown") engine.settleShowdown(shown);
  assert.equal(shown.community.length, 5);
  assert.equal(engine.canRabbitHunt(shown), false, "full board: nothing to show");

  const running = table(3);
  assert.equal(engine.canRabbitHunt(running), false);
  assert.equal(engine.revealRabbitHunt(running, "hero").ok, false);

  const room = table(3);
  foldOut(room);
  engine.setRabbitHunt(room, false);
  assert.equal(engine.canRabbitHunt(room), false, "setting off: no tappable face-down slots");
  assert.equal(engine.revealRabbitHunt(room, "hero").ok, false);
  assert.equal(engine.serializeRoom(room, "hero").canRabbitHunt, false);
  assert.equal(engine.serializeRoom(room, "hero").rabbitHuntEnabled, false);
  engine.setRabbitHunt(room, true);
  assert.equal(engine.revealRabbitHunt(room, "hero").ok, true);
  const first = room.rabbitCards.slice();
  assert.equal(engine.revealRabbitHunt(room, room.players[1].id).ok, true, "idempotent");
  assert.deepEqual(room.rabbitCards, first);
  engine.setRabbitHunt(room, false);
  assert.deepEqual(engine.serializeRoom(room, "hero").rabbitCards, [], "off hides revealed cards");
  engine.setRabbitHunt(room, true);
  assert.equal(engine.revealRabbitHunt(room, "nobody").ok, false, "only seated players");

  for (const player of room.players) player.ready = true;
  assert.equal(engine.maybeStartReadyHand(room), true);
  assert.equal(room.rabbitCards, null, "cleared when the next hand deals");
  assert.deepEqual(engine.serializeRoom(room, "hero").rabbitCards, []);
}

// 3. Offline practice: same flow through the session (hero folds heads-up preflop).
{
  engine.setRandomInt(() => 0); // dealer seat 0 = hero = heads-up SB, first to act
  const room = engine.createPracticeRoom({
    name: "Hero",
    playerId: "hero",
    tableSize: 2,
    botCount: 1,
    startingStack: 1000,
    smallBlind: 10,
    bigBlind: 20,
  });
  const updates = [];
  const session = createPracticeSession({
    room,
    viewerId: "hero",
    cpuDelayMs: 0,
    onUpdate: (state) => updates.push(state),
  });
  assert.equal(session.handle("game:ready", { ready: true }).ok, true);
  engine.setRandomInt((max) => Math.floor(Math.random() * max));
  assert.equal(room.turn, "hero");
  assert.equal(session.handle("game:action", { type: "fold" }).ok, true);
  assert.equal(room.phase, "complete");
  assert.equal(updates.at(-1).canRabbitHunt, true);
  const count = updates.length;
  assert.equal(session.handle("game:rabbitHunt", {}).ok, true);
  assert.equal(updates.at(-1).rabbitCards.length, 5);
  assert.equal(session.handle("game:rabbitHunt", {}).ok, true);
  assert.equal(updates.length, count + 1, "second tap does not republish");
  assert.equal(session.handle("game:setRabbitHunt", { enabled: false }).ok, true);
  assert.equal(updates.at(-1).rabbitCards.length, 0);
  session.dispose();
}

// 4. Server: broadcast to the table and spectators once, no leaks, chips untouched,
//    timers untouched, storage round-trip and legacy rooms.
(async () => {
  const { io } = require("socket.io-client");
  const {
    clearReadyTimer,
    clearTurnTimer,
    restoreRoom,
    rooms,
    serializeRoomForStorage,
    server,
  } = require("../dist/server");
  const sockets = [];
  const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
  async function wait(check, label) {
    for (let i = 0; i < 400; i += 1) {
      if (check()) return;
      await pause();
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function shutdown() {
    for (const socket of sockets.splice(0)) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    for (const room of [...rooms.values()]) {
      clearTimeout(room.botTimer);
      clearTimeout(room.showdownTimer);
      clearTimeout(room.dormantTimer);
      clearTurnTimer(room);
      clearReadyTimer(room);
      for (const player of room.players || []) clearTimeout(player.disconnectTimer);
      for (const spectator of room.spectators || []) clearTimeout(spectator.disconnectTimer);
      rooms.delete(room.id);
    }
    if (server.listening) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      });
    }
  }

  // Storage: compact optional fields; legacy rooms default to on / nothing revealed.
  {
    const legacy = restoreRoom({
      id: "LEGACY",
      hostId: "h",
      phase: "complete",
      status: "complete",
      players: [{ id: "h", name: "Host", isBot: false, stack: 1000 }],
    });
    assert.equal(legacy.rabbitHuntEnabled, undefined);
    assert.equal(engine.rabbitHuntEnabled(legacy), true);
    assert.equal(legacy.rabbitCards, null);
    const stored = serializeRoomForStorage(legacy);
    assert.equal("rabbitCards" in stored, false);
    assert.equal("rabbitHuntEnabled" in stored, false);
    legacy.rabbitCards = ["Ah", "Kd", "2c", "7s", "9h"];
    legacy.rabbitHuntEnabled = false;
    const again = restoreRoom(JSON.parse(JSON.stringify(serializeRoomForStorage(legacy))));
    assert.deepEqual(again.rabbitCards, ["Ah", "Kd", "2c", "7s", "9h"]);
    assert.equal(again.rabbitHuntEnabled, false);
    for (const restored of [legacy, again])
      for (const player of restored.players) clearTimeout(player.disconnectTimer);
  }

  await new Promise((resolve, reject) => {
    server.listen(0, (error) => (error ? reject(error) : resolve()));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  function connect(name) {
    const socket = io(url, { transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    const client = { socket, name, deviceId: `rh-${name}-${Date.now()}`, state: null, log: [] };
    socket.on("room:update", (state) => {
      client.state = state;
      client.log.push(JSON.stringify(state));
    });
    return client;
  }
  const send = (client, event, payload = {}) =>
    new Promise((resolve, reject) => {
      client.socket
        .timeout(4000)
        .emit(event, payload, (error, result) => (error ? reject(error) : resolve(result)));
    });
  const identity = (client) => ({ name: client.name, deviceId: client.deviceId });
  const codesIn = (json) =>
    new Set([...json.matchAll(/"code":"([2-9TJQKA][shdc])"/g)].map((m) => m[1]));

  try {
    const host = connect("Host");
    const guest = connect("Guest");
    const watcher = connect("Watcher");
    await wait(() => [host, guest, watcher].every((c) => c.socket.connected), "connect");
    const created = await send(host, "room:create", {
      ...identity(host),
      smallBlind: 10,
      bigBlind: 20,
    });
    assert.equal(created.ok, true, created.error);
    assert.equal(
      (await send(guest, "room:join", { ...identity(guest), roomId: created.roomId })).ok,
      true,
    );
    assert.equal(
      (await send(watcher, "room:watch", { ...identity(watcher), roomId: created.roomId })).ok,
      true,
    );
    await wait(() => host.state?.players.length === 2 && watcher.state, "seated + watching");
    assert.equal(host.state.rabbitHuntEnabled, true, "default on");
    assert.equal(host.state.canChangeRabbitHunt, true);
    assert.equal(guest.state.canChangeRabbitHunt, false);

    const room = rooms.get(created.roomId);
    await send(host, "game:ready", { ready: true });
    await send(guest, "game:ready", { ready: true });
    await wait(() => room.phase === "preflop", "hand start");
    const folder = room.players.find((player) => player.id === room.turn);
    const winner = room.players.find((player) => player.id !== folder.id);
    const holes = Object.fromEntries(
      room.players.map((player) => [player.id, player.hand.slice()]),
    );
    const actor = folder.id === host.state.players.find((p) => p.isYou).id ? host : guest;
    assert.equal((await send(actor, "game:action", { type: "fold" })).ok, true);
    await wait(
      () =>
        room.phase === "complete" &&
        host.state?.canRabbitHunt &&
        guest.state?.canRabbitHunt &&
        watcher.state?.phase === "complete",
      "fold-win reaches every client (any seated player can reveal)",
    );
    assert.equal(watcher.state.canRabbitHunt, false, "spectators can't trigger it");
    const expected = engine.rabbitHuntRunout(room);
    const chipsBefore = stateOf(room);
    const readyEndsAt = room.readyEndsAt;

    for (const client of [host, guest, watcher]) {
      const seen = new Set(client.log.flatMap((json) => [...codesIn(json)]));
      for (const card of expected)
        assert.equal(seen.has(card), false, "runout not sent before reveal");
    }
    const counts = [host, guest, watcher].map((client) => client.log.length);
    assert.equal((await send(guest, "game:rabbitHunt", {})).ok, true);
    await wait(() => watcher.state?.rabbitCards?.length === 5, "spectator sees the runout");
    await wait(() => host.state?.rabbitCards?.length === 5, "table sees the runout");
    assert.deepEqual(
      host.state.rabbitCards.map((card) => card.code),
      expected,
    );
    assert.equal(host.state.canRabbitHunt, false);
    assert.equal(stateOf(room), chipsBefore, "chips, pot, winners, log, deck unchanged");
    assert.equal(room.readyEndsAt, readyEndsAt, "ready-up deadline untouched");
    assert.equal(room.turnEndsAt ?? null, null);
    await pause(150);
    const afterFirst = [host, guest, watcher].map((client) => client.log.length);
    assert.deepEqual(
      afterFirst,
      counts.map((count) => count + 1),
      "one broadcast per client",
    );
    assert.equal((await send(host, "game:rabbitHunt", {})).ok, true, "idempotent");
    await pause(150);
    assert.deepEqual(
      [host, guest, watcher].map((client) => client.log.length),
      afterFirst,
    );

    // No leaks: every card code a client ever received is its own hole card, the board,
    // or the revealed runout — never the folder's/winner's hidden cards or the deck.
    const board = new Set([...room.community, ...expected]);
    const allowed = {
      Host: new Set([...board, ...holes[room.hostId]]),
      Guest: new Set([...board, ...holes[room.players.find((p) => p.id !== room.hostId).id]]),
      Watcher: board,
    };
    for (const client of [host, guest, watcher]) {
      for (const json of client.log) {
        for (const code of codesIn(json)) {
          assert.ok(allowed[client.name].has(code), `${client.name} received ${code}`);
        }
        assert.equal(json.includes('"deck"'), false, "deck never serialized");
      }
    }
    assert.ok(winner.hand.length === 2 && folder.hand.length === 2);

    // Host turns it off: hidden for everyone; back on shows it again for this hand.
    assert.equal((await send(guest, "game:setRabbitHunt", { enabled: false })).ok, false);
    assert.equal((await send(host, "game:setRabbitHunt", { enabled: false })).ok, true);
    await wait(
      () => watcher.state?.rabbitCards?.length === 0 && guest.state?.rabbitHuntEnabled === false,
      "off hides it",
    );
    assert.equal((await send(host, "game:setRabbitHunt", { enabled: true })).ok, true);
    await wait(() => watcher.state?.rabbitCards?.length === 5, "on again");

    // Next hand clears it (and the reveal never blocked the deal).
    await send(host, "game:ready", { ready: true });
    await send(guest, "game:ready", { ready: true });
    await wait(() => room.phase === "preflop", "next hand");
    await wait(() => host.state?.rabbitCards?.length === 0, "cleared on next hand");
    assert.equal(room.rabbitCards, null);
    console.log("Rabbit hunt checks passed.");
  } finally {
    await shutdown();
  }
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
