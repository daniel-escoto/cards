/**
 * Tournament room create/serialize + timed level timer (integration).
 */
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const engine = require("../dist/shared/engine.node");

engine.setRandomInt(() => 0);

const sockets = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

async function wait(check) {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await pause();
  }
  throw new Error("Timed out waiting for state");
}

function send(p, event, payload = {}) {
  return new Promise((resolve, reject) => {
    p.socket
      .timeout(4000)
      .emit(event, payload, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

async function ok(p, event, payload) {
  const result = await send(p, event, payload);
  assert.equal(result.ok, true, result.error);
  return result;
}

(async () => {
  const statePath = path.join(os.tmpdir(), `cards-tournament-levels-${process.pid}.json`);
  try {
    fs.unlinkSync(statePath);
  } catch {
    // ignore
  }
  process.env.GAME_STATE_FILE = statePath;

  const {
    server,
    io: serverIo,
    markStateRestored,
    markServerListening,
    rooms,
    serializeRoomForStorage,
    restoreRoom,
    setShotClockTime,
    resetShotClockTime,
    clearTournamentLevelTimer,
    clearTurnTimer,
    clearReadyTimer,
    emitRoom,
    TOURNAMENT_LEVEL_DURATION_MS,
  } = require("../dist/server");

  markStateRestored(true);
  await new Promise((resolve) => server.listen(0, resolve));
  markServerListening(true);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  let fakeNow = 1_000_000;
  const pendingTimers = [];

  function installFakeClock() {
    fakeNow = 1_000_000;
    pendingTimers.length = 0;
    setShotClockTime({
      now: () => fakeNow,
      setTimeout(fn, ms) {
        const handle = { fn, at: fakeNow + Math.max(0, Number(ms) || 0), cleared: false };
        pendingTimers.push(handle);
        return handle;
      },
      clearTimeout(handle) {
        if (handle) handle.cleared = true;
      },
    });
  }

  function advance(ms) {
    fakeNow += ms;
    const due = pendingTimers.filter((timer) => !timer.cleared && timer.at <= fakeNow);
    for (const timer of due) {
      timer.cleared = true;
      timer.fn();
    }
  }

  async function player(name) {
    const socket = io(url, { transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    const p = { socket, name, deviceId: `tour-${name}-${Date.now()}`, state: null };
    socket.on("room:update", (state) => {
      p.state = state;
    });
    await wait(() => socket.connected);
    return p;
  }

  try {
    installFakeClock();

    const host = await player("host");
    const guest = await player("guest");

    const created = await ok(host, "room:create", {
      name: host.name,
      deviceId: host.deviceId,
      tournamentMode: true,
      tournamentLevelDurationMs: 5_000,
    });
    await wait(() => host.state?.id === created.roomId);
    assert.equal(host.state.tournamentMode, true);
    assert.equal(host.state.moneyMode, false);
    assert.equal(host.state.canAddBot, false);
    assert.equal(host.state.canChangeBlinds, false);
    assert.equal(host.state.tournamentLevelIndex, 0);
    assert.equal(host.state.smallBlind, 10);
    assert.equal(host.state.bigBlind, 20);
    assert.equal(host.state.players.length, 1, "no bots on create");
    assert.equal(host.state.tournamentLevelDurationMs, 5_000);

    // Cash create still works and stays free of tournament fields on the wire as false.
    const cashHost = await player("cash");
    const cash = await ok(cashHost, "room:create", {
      name: cashHost.name,
      deviceId: cashHost.deviceId,
      moneyMode: true,
      buyInCents: 2000,
      smallBlindCents: 10,
      bigBlindCents: 20,
    });
    await wait(() => cashHost.state?.id === cash.roomId);
    assert.equal(cashHost.state.moneyMode, true);
    assert.equal(cashHost.state.tournamentMode, false);
    assert.equal(cashHost.state.smallBlind, 10);
    assert.equal(cashHost.state.bigBlind, 20);

    await ok(guest, "room:join", {
      name: guest.name,
      deviceId: guest.deviceId,
      roomId: created.roomId,
    });
    await wait(() => host.state.players.length === 2);

    const addBot = await send(host, "room:addBot", {});
    assert.equal(addBot.ok, false, "bots blocked in tournaments");

    await ok(host, "game:ready", {});
    await ok(guest, "game:ready", {});
    await wait(() => host.state.phase === "preflop" && host.state.handNumber === 1);
    assert.equal(host.state.smallBlind, 10);
    assert.ok(host.state.tournamentLevelEndsAt, "level clock armed after hand 1");
    assert.equal(host.state.tournamentPendingAdvance, false);

    const room = rooms.get(created.roomId);
    assert.ok(room);
    assert.equal(room.tournamentMode, true);

    // Persist / restore keeps tournament fields.
    const stored = serializeRoomForStorage(room);
    assert.equal(stored.tournamentMode, true);
    assert.equal(stored.tournamentLevelDurationMs, 5_000);
    assert.ok(stored.tournamentLevelEndsAt);

    // Timer mid-hand → pending advance, blinds unchanged until next deal.
    advance(5_000);
    await wait(() => host.state.tournamentPendingAdvance === true);
    assert.equal(host.state.tournamentLevelIndex, 0);
    assert.equal(host.state.smallBlind, 10);
    assert.equal(host.state.bigBlind, 20);

    // Next deal applies the pending advance (engine path — same as ready-up startHand).
    room.phase = "complete";
    room.turn = null;
    for (const player of room.players) {
      player.ready = true;
      player.folded = false;
      player.allIn = false;
      player.bet = 0;
      player.invested = 0;
      player.hand = [];
      player.stack = engine.STARTING_STACK;
      player.sittingOut = false;
    }
    engine.startNextHand(room);
    emitRoom(room);
    await wait(
      () =>
        host.state.handNumber >= 2 &&
        host.state.tournamentLevelIndex === 1 &&
        host.state.smallBlind === 20,
    );
    assert.equal(host.state.bigBlind, 40);
    assert.equal(host.state.tournamentPendingAdvance, false);
    assert.ok(host.state.tournamentLevelEndsAt, "new level clock armed");

    // Restore round-trip.
    clearTurnTimer(room);
    clearReadyTimer(room);
    clearTournamentLevelTimer(room);
    const restored = restoreRoom(serializeRoomForStorage(room));
    assert.equal(restored.tournamentMode, true);
    assert.equal(restored.tournamentLevelIndex, room.tournamentLevelIndex);
    assert.equal(restored.tournamentLevelDurationMs, 5_000);
    rooms.delete(restored.id);

    assert.equal(TOURNAMENT_LEVEL_DURATION_MS, 10 * 60 * 1000);
    console.log("Tournament levels integration test passed");
  } finally {
    resetShotClockTime();
    for (const socket of sockets) socket.close();
    await new Promise((resolve) => {
      serverIo.close(() => {
        server.close(() => resolve());
      });
    });
    process.exit(0);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
