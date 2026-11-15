/**
 * Tournament buy-in ledger + elimination → settle-up (integration).
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
  const statePath = path.join(os.tmpdir(), `cards-tournament-settle-${process.pid}.json`);
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
    tournamentPayoutSplits,
    emitRoom,
  } = require("../dist/server");

  markStateRestored(true);
  await new Promise((resolve) => server.listen(0, resolve));
  markServerListening(true);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  async function player(name) {
    const socket = io(url, { transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    const p = { socket, name, deviceId: `settle-${name}-${Date.now()}`, state: null };
    socket.on("room:update", (state) => {
      p.state = state;
    });
    await wait(() => socket.connected);
    return p;
  }

  try {
    const host = await player("host");
    const a = await player("alice");
    const b = await player("bob");

    const created = await ok(host, "room:create", {
      name: host.name,
      deviceId: host.deviceId,
      tournamentMode: true,
      buyInCents: 2000,
      tournamentLevelDurationMs: 600_000,
    });
    await wait(() => host.state?.id === created.roomId);
    assert.equal(host.state.tournamentMode, true);
    assert.equal(host.state.buyInCents, 2000);
    assert.equal(host.state.ledger.length, 1);
    assert.equal(host.state.ledger[0].buyInsCents, 2000);
    assert.equal(host.state.players[0].stack, engine.STARTING_STACK);

    for (const guest of [a, b]) {
      const preview = await send(guest, "room:join", {
        name: guest.name,
        deviceId: guest.deviceId,
        roomId: created.roomId,
      });
      assert.equal(preview.ok, false);
      assert.equal(preview.moneyTerms.tournamentMode, true);
      assert.equal(preview.moneyTerms.buyInCents, 2000);
      await ok(guest, "room:join", {
        name: guest.name,
        deviceId: guest.deviceId,
        roomId: created.roomId,
        acceptedMoneyTerms: preview.moneyTerms,
      });
    }
    await wait(() => host.state.players.length === 3);
    assert.equal(host.state.ledger.length, 3);

    // Force a heads-up finish: bust two seats and settle.
    const room = rooms.get(created.roomId);
    room.handNumber = 2;
    room.phase = "complete";
    room.players[1].stack = 0;
    room.players[1].invested = 40;
    room.players[2].stack = 0;
    room.players[2].invested = 20;
    room.players[0].stack = 3000;
    engine.recordTournamentEliminations(room);
    assert.equal(room.phase, "gameover");
    assert.equal(room.players[0].finishPlace, 1);
    emitRoom(room);
    await wait(() => host.state.phase === "gameover" && (host.state.settlements || []).length >= 0);

    assert.equal(host.state.ledger.length, 3);
    const splits = tournamentPayoutSplits(3);
    assert.deepEqual(splits, [1]);
    const winner = host.state.ledger.find((entry) => entry.playerId === room.players[0].id);
    assert.equal(winner.cashOutCents, 6000, "winner takes full $60 pool");
    const paidOut = host.state.ledger.reduce((sum, entry) => sum + entry.cashOutCents, 0);
    assert.equal(paidOut, 6000);

    // Cash room regression: create still ignores tournament.
    const cashHost = await player("cash");
    const cash = await ok(cashHost, "room:create", {
      name: cashHost.name,
      deviceId: cashHost.deviceId,
      moneyMode: true,
      buyInCents: 2500,
      smallBlindCents: 10,
      bigBlindCents: 20,
    });
    await wait(() => cashHost.state?.id === cash.roomId);
    assert.equal(cashHost.state.tournamentMode, false);
    assert.equal(cashHost.state.moneyMode, true);

    // Host endGame path also settles.
    const early = await player("early");
    const g1 = await player("g1");
    const earlyRoom = await ok(early, "room:create", {
      name: early.name,
      deviceId: early.deviceId,
      tournamentMode: true,
      buyInCents: 1000,
    });
    const g1Preview = await send(g1, "room:join", {
      name: g1.name,
      deviceId: g1.deviceId,
      roomId: earlyRoom.roomId,
    });
    await ok(g1, "room:join", {
      name: g1.name,
      deviceId: g1.deviceId,
      roomId: earlyRoom.roomId,
      acceptedMoneyTerms: g1Preview.moneyTerms,
    });
    await wait(() => early.state?.players?.length === 2);
    await ok(early, "game:end", {});
    await wait(() => early.state?.phase === "gameover");
    assert.ok(early.state.ledger.every((entry) => entry.cashOutCents >= 0));
    const earlyPool = early.state.ledger.reduce((sum, e) => sum + e.buyInsCents, 0);
    const earlyPaid = early.state.ledger.reduce((sum, e) => sum + e.cashOutCents, 0);
    assert.equal(earlyPaid, earlyPool);

    console.log("Tournament settle integration test passed");
  } finally {
    for (const socket of sockets) socket.close();
    await new Promise((resolve) => {
      serverIo.close(() => {
        server.close(() => resolve());
      });
    });
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
