// Bot games (one human + CPU players) default the shot clock and ready-up timer to Off;
// human rooms keep the normal defaults; the host can still turn timers on.
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const {
  READY_TIMER_DEFAULT_MS,
  SHOT_CLOCK_DEFAULT_MS,
  clearReadyTimer,
  clearTurnTimer,
  isBotGame,
  restoreRoom,
  rooms,
  serializeRoomForStorage,
  server,
  syncTimerDefaults,
} = require("../dist/server");

const sockets = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

async function wait(check, label = "condition") {
  for (let i = 0; i < 400; i += 1) {
    if (check()) return;
    await pause();
  }
  throw new Error(`Timed out waiting for ${label}`);
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
    clearTimeout(room.botTimer);
    clearTimeout(room.showdownTimer);
    clearTimeout(room.dormantTimer);
    clearTurnTimer(room);
    clearReadyTimer(room);
    for (const player of room.players || []) clearTimeout(player.disconnectTimer);
    rooms.delete(room.id);
  }
  if (server.listening) {
    await new Promise((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    });
  }
}

// Unit: bot-game classification.
{
  const human = (id) => ({ id, isBot: false });
  const bot = (id) => ({ id, isBot: true });
  assert.equal(isBotGame({ moneyMode: false, players: [human("a"), bot("b")] }), true);
  assert.equal(isBotGame({ moneyMode: false, players: [human("a"), bot("b"), bot("c")] }), true);
  assert.equal(isBotGame({ moneyMode: false, players: [human("a")] }), false);
  assert.equal(isBotGame({ moneyMode: false, players: [human("a"), human("b")] }), false);
  assert.equal(isBotGame({ moneyMode: false, players: [human("a"), human("b"), bot("c")] }), false);
}

// Unit: legacy/restored rooms without autoTimerDefaults are never touched (deploy-safe).
{
  const legacy = {
    id: "LEGACY",
    phase: "lobby",
    moneyMode: false,
    turnTimeLimitMs: SHOT_CLOCK_DEFAULT_MS,
    readyTimeLimitMs: READY_TIMER_DEFAULT_MS,
    players: [
      { id: "a", isBot: false },
      { id: "b", isBot: true },
    ],
  };
  syncTimerDefaults(legacy);
  assert.equal(legacy.turnTimeLimitMs, SHOT_CLOCK_DEFAULT_MS);
  assert.equal(legacy.readyTimeLimitMs, READY_TIMER_DEFAULT_MS);
}

(async () => {
  if (server.listening) {
    console.log(
      "Bot-game timer unit checks passed (socket suite skipped: server already listening)",
    );
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
      deviceId: `bt-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      state: null,
    };
    socket.on("room:update", (state) => {
      player.state = state;
    });
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

  const identity = (player) => ({ name: player.name, deviceId: player.deviceId });
  const timers = (player) => [player.state?.turnTimeLimitMs, player.state?.readyTimeLimitMs];

  try {
    const host = connect("Host");
    const guest = connect("Guest");
    const host2 = connect("Host2");
    const guest2 = connect("Guest2");
    await wait(
      () => [host, guest, host2, guest2].every((player) => player.socket.connected),
      "connections",
    );

    // 1. Human room keeps the normal defaults (solo host, then a second human).
    const human = await ok(host, "room:create", {
      ...identity(host),
      smallBlind: 10,
      bigBlind: 20,
    });
    await wait(() => host.state?.id === human.roomId, "human room state");
    assert.deepEqual(timers(host), [SHOT_CLOCK_DEFAULT_MS, READY_TIMER_DEFAULT_MS]);
    await ok(guest, "room:join", { ...identity(guest), roomId: human.roomId });
    await wait(() => host.state?.players.length === 2, "guest seated");
    assert.deepEqual(timers(host), [SHOT_CLOCK_DEFAULT_MS, READY_TIMER_DEFAULT_MS]);
    // Adding a CPU to a room with two humans is still a human room.
    await ok(host, "room:addBot", {});
    await wait(() => host.state?.players.length === 3, "bot added to human room");
    assert.deepEqual(timers(host), [SHOT_CLOCK_DEFAULT_MS, READY_TIMER_DEFAULT_MS]);

    // 2. Bot game: solo host + Add CPU player → shot clock and ready timer Off.
    const bot = await ok(host2, "room:create", {
      ...identity(host2),
      smallBlind: 10,
      bigBlind: 20,
    });
    await wait(() => host2.state?.id === bot.roomId, "bot room state");
    await ok(host2, "room:addBot", {});
    await wait(() => host2.state?.players.length === 2, "bot added");
    assert.deepEqual(timers(host2), [0, 0], "bot game defaults timers Off");
    const botRoom = rooms.get(bot.roomId);
    assert.equal(botRoom.turnTimeLimitMs, 0);
    assert.equal(botRoom.readyTimeLimitMs, 0);

    // 3. Host can still turn timers on in a bot game, and the choice sticks.
    await ok(host2, "game:setShotClock", { seconds: 30 });
    await wait(() => host2.state?.turnTimeLimitMs === 30000, "shot clock on");
    await ok(host2, "game:setReadyTimer", { seconds: 20 });
    await wait(() => host2.state?.readyTimeLimitMs === 20000, "ready timer on");
    await ok(host2, "room:addBot", {});
    await wait(() => host2.state?.players.length === 3, "second bot added");
    assert.deepEqual(timers(host2), [30000, 20000], "host-set timers survive composition changes");

    // Flags persist across a deploy handoff (storage round-trip).
    const restored = restoreRoom(serializeRoomForStorage(botRoom));
    assert.equal(restored.shotClockSetByHost, true);
    assert.equal(restored.readyTimerSetByHost, true);
    assert.equal(restored.autoTimerDefaults, true);
    for (const player of restored.players || []) clearTimeout(player.disconnectTimer);

    // 4. Room created with CPU players up front is a bot game; once a friend takes a
    //    CPU seat it becomes a human room and unset timers return to the defaults.
    const seeded = await ok(host, "room:create", {
      ...identity(host),
      smallBlind: 10,
      bigBlind: 20,
      computerPlayers: 2,
    });
    await wait(() => host.state?.id === seeded.roomId, "seeded room state");
    assert.ok(
      host.state.players.some((player) => player.isBot),
      "seeded with CPU players",
    );
    assert.deepEqual(timers(host), [0, 0], "bot room created with CPUs defaults Off");
    await ok(guest2, "room:join", { ...identity(guest2), roomId: seeded.roomId });
    await wait(
      () => host.state?.players.filter((player) => !player.isBot).length === 2,
      "friend takes a CPU seat",
    );
    assert.deepEqual(timers(host), [SHOT_CLOCK_DEFAULT_MS, READY_TIMER_DEFAULT_MS]);
    // Ready-up timer in a bot room with a host-set shot clock only: unset timer stays auto.
    const seededRoom = rooms.get(seeded.roomId);
    seededRoom.shotClockSetByHost = true;
    seededRoom.turnTimeLimitMs = 60000;
    // Friend leaves again → back to host + CPU (a bot game).
    const hostSeat = seededRoom.players.find((player) => player.id === seededRoom.hostId);
    seededRoom.players = [
      hostSeat,
      { ...hostSeat, id: "bot:SEED:1", isBot: true, socketIds: new Set() },
    ];
    syncTimerDefaults(seededRoom);
    assert.equal(seededRoom.turnTimeLimitMs, 60000);
    assert.equal(seededRoom.readyTimeLimitMs, 0);

    console.log("Bot-game timer default checks passed.");
  } finally {
    await shutdown();
  }
})().catch(async (error) => {
  console.error(error);
  await shutdown();
  process.exit(1);
});
