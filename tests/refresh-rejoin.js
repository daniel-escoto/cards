#!/usr/bin/env node
/**
 * Page refresh in an online room must silently rejoin via path code + credentials.
 * Root cause: autoJoinInitialRoom only gated on legacy ?room= (initialRoomParam),
 * so holdem.nyc/CODE refreshes left state=null and never rejoined.
 */
process.env.DISCONNECT_GRACE_MS = process.env.DISCONNECT_GRACE_MS || "50";
process.env.BACKGROUND_DISCONNECT_GRACE_MS = process.env.BACKGROUND_DISCONNECT_GRACE_MS || "50";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { io } = require("socket.io-client");

const eventsSrc = fs.readFileSync(path.join(__dirname, "../public/app-events.ts"), "utf8");
assert.match(
  eventsSrc,
  /function autoJoinInitialRoom\(\)[\s\S]*?!initialRoomId/,
  "auto-join must use initialRoomId (path + ?room=)",
);
assert.doesNotMatch(
  eventsSrc,
  /function autoJoinInitialRoom\(\)[\s\S]*?!initialRoomParam/,
  "auto-join must not gate only on legacy initialRoomParam",
);
assert.match(
  eventsSrc,
  /function autoJoinInitialRoom\(\)[\s\S]*?roomCredentials\(initialRoomId\)/,
  "refresh rejoin requires saved credentials",
);
assert.match(
  eventsSrc,
  /function autoJoinInitialRoom\(\)[\s\S]*?credentials\.spectator\)\s*watchRoom/,
  "spectator refresh uses room:watch",
);

const sockets = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

async function wait(check, label = "condition") {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await pause();
  }
  throw new Error(`Timed out waiting for ${label}`);
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
  assert.equal(result.ok, true, result.error || `${event} failed`);
  return result;
}

function identity(p) {
  return { name: p.name, deviceId: p.deviceId };
}

/** Simulate a hard refresh: new socket, same deviceId + reconnectToken, no prior state. */
async function refreshAs(p, roomId, { spectator = false } = {}) {
  p.socket.disconnect();
  const next = {
    name: p.name,
    deviceId: p.deviceId,
    reconnectToken: p.reconnectToken,
    state: null,
    socket: io(p.url, { transports: ["websocket"] }),
  };
  sockets.push(next.socket);
  next.socket.on("room:update", (room) => {
    next.state = room;
  });
  await wait(() => next.socket.connected, "refresh socket");
  const eventName = spectator ? "room:watch" : "room:join";
  const ack = await ok(next, eventName, {
    ...identity(next),
    roomId,
    reconnectToken: next.reconnectToken,
  });
  // Seat reclaim must not demand money-terms confirmation.
  assert.equal("moneyTerms" in ack, false, "refresh rejoin must not return moneyTerms");
  await wait(() => next.state?.id === roomId, "refresh room state");
  return next;
}

(async () => {
  let url = process.env.SMOKE_URL || "";
  let closeServer = null;

  if (!url) {
    const statePath = path.join(os.tmpdir(), `cards-refresh-rejoin-${process.pid}.json`);
    try {
      fs.unlinkSync(statePath);
    } catch {
      /* ignore */
    }
    process.env.GAME_STATE_FILE = statePath;
    const { server, io: serverIo, markStateRestored, markServerListening } = require("../dist/server");
    markStateRestored(true);
    await new Promise((resolve) => server.listen(0, resolve));
    markServerListening(true);
    const { port } = server.address();
    url = `http://127.0.0.1:${port}`;
    closeServer = () =>
      new Promise((resolve) => {
        serverIo.close(() => {
          server.close(() => resolve());
        });
      });
  }

  async function player(name, deviceId = `dev-${name}`) {
    const p = {
      name,
      deviceId,
      url,
      reconnectToken: null,
      state: null,
      socket: io(url, { transports: ["websocket"] }),
    };
    sockets.push(p.socket);
    p.socket.on("room:update", (room) => {
      p.state = room;
    });
    await wait(() => p.socket.connected, `${name} connect`);
    return p;
  }

  try {
    // --- Money lobby (before start): refresh keeps seat, no terms re-prompt ---
    {
      const host = await player("money-host");
      const guest = await player("money-guest");
      const created = await ok(host, "room:create", {
        ...identity(host),
        moneyMode: true,
        buyInCents: 2500,
        smallBlindCents: 10,
        bigBlindCents: 25,
      });
      host.reconnectToken = created.reconnectToken;
      const roomId = created.roomId;
      const preview = await send(guest, "room:join", { ...identity(guest), roomId });
      assert.equal(preview.ok, false);
      assert.ok(preview.moneyTerms);
      const seated = await ok(guest, "room:join", {
        ...identity(guest),
        roomId,
        acceptedMoneyTerms: preview.moneyTerms,
      });
      guest.reconnectToken = seated.reconnectToken;
      await wait(() => guest.state?.players?.some((x) => x.isYou), "guest seated");
      assert.equal(guest.state.phase, "lobby");

      const refreshed = await refreshAs(guest, roomId);
      assert.ok(
        refreshed.state.players.some((x) => x.isYou && x.name === "money-guest"),
        "money lobby refresh restores seat",
      );
      assert.equal(refreshed.state.phase, "lobby");
      assert.equal(refreshed.state.moneyMode, true);
    }

    // --- Money mid-hand: same silent rejoin ---
    {
      const host = await player("mh-host");
      const guest = await player("mh-guest");
      const created = await ok(host, "room:create", {
        ...identity(host),
        moneyMode: true,
        buyInCents: 2500,
        smallBlindCents: 10,
        bigBlindCents: 25,
      });
      host.reconnectToken = created.reconnectToken;
      const roomId = created.roomId;
      const preview = await send(guest, "room:join", { ...identity(guest), roomId });
      const seated = await ok(guest, "room:join", {
        ...identity(guest),
        roomId,
        acceptedMoneyTerms: preview.moneyTerms,
      });
      guest.reconnectToken = seated.reconnectToken;
      await ok(host, "game:ready", { ready: true });
      await ok(guest, "game:ready", { ready: true });
      await wait(() => host.state?.phase === "preflop", "money hand dealt");

      const refreshed = await refreshAs(guest, roomId);
      assert.equal(refreshed.state.phase, "preflop");
      assert.ok(
        refreshed.state.players.some((x) => x.isYou),
        "money mid-hand refresh restores seat",
      );
    }

    // --- Chip lobby + mid-hand ---
    {
      const host = await player("chip-host");
      const guest = await player("chip-guest");
      const created = await ok(host, "room:create", {
        ...identity(host),
        moneyMode: false,
        smallBlind: 10,
        bigBlind: 20,
      });
      host.reconnectToken = created.reconnectToken;
      const roomId = created.roomId;
      const seated = await ok(guest, "room:join", { ...identity(guest), roomId });
      guest.reconnectToken = seated.reconnectToken;
      await wait(() => guest.state?.players?.length === 2, "chip lobby seated");

      let refreshed = await refreshAs(guest, roomId);
      assert.equal(refreshed.state.phase, "lobby");
      assert.ok(refreshed.state.players.some((x) => x.isYou), "chip lobby refresh");

      guest.socket = refreshed.socket;
      guest.state = refreshed.state;
      guest.reconnectToken = refreshed.reconnectToken || guest.reconnectToken;
      await ok(host, "game:ready", { ready: true });
      await ok(guest, "game:ready", { ready: true });
      await wait(() => host.state?.phase === "preflop", "chip hand dealt");

      refreshed = await refreshAs(guest, roomId);
      assert.equal(refreshed.state.phase, "preflop");
      assert.ok(refreshed.state.players.some((x) => x.isYou), "chip mid-hand refresh");
    }

    // --- Spectator refresh (watch credentials) ---
    {
      const host = await player("watch-host");
      const created = await ok(host, "room:create", {
        ...identity(host),
        moneyMode: false,
        smallBlind: 10,
        bigBlind: 20,
      });
      const roomId = created.roomId;
      const watcher = await player("watcher");
      const watched = await ok(watcher, "room:watch", { ...identity(watcher), roomId });
      watcher.reconnectToken = watched.reconnectToken;
      await wait(() => watcher.state?.isSpectator === true, "watching");

      const refreshed = await refreshAs(watcher, roomId, { spectator: true });
      assert.equal(refreshed.state.isSpectator, true, "spectator refresh stays watching");
    }

    console.log("Refresh rejoin checks passed.");
  } finally {
    for (const socket of sockets) {
      try {
        socket.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (closeServer) await closeServer();
  }
})()
  .then(() => {
    process.exit(process.exitCode || 0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
