const { io } = require("socket.io-client");

const URL = process.env.SMOKE_URL || "http://localhost:3000";

function connectPlayer(name) {
  const socket = io(URL, { transports: ["websocket"], forceNew: true });
  let state = null;
  socket.on("room:update", (next) => {
    state = next;
  });
  return { name, deviceId: `device-${name.toLowerCase()}`, socket, get state() { return state; } };
}

function emit(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (!response?.ok) reject(new Error(response?.error || `${event} failed`));
      else resolve(response);
    });
  });
}

function waitFor(predicate, label, timeout = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, 25);
  });
}

(async () => {
  const alice = connectPlayer("Alice");
  const bob = connectPlayer("Bob");
  const carmen = connectPlayer("Carmen");
  const players = [alice, bob, carmen];

  await waitFor(() => alice.socket.connected && bob.socket.connected && carmen.socket.connected, "connections");
  const created = await emit(alice.socket, "room:create", { name: alice.name, deviceId: alice.deviceId });
  await emit(bob.socket, "room:join", { roomId: created.roomId, name: bob.name, deviceId: bob.deviceId });
  await emit(carmen.socket, "room:join", { roomId: created.roomId, name: carmen.name, deviceId: carmen.deviceId });
  await waitFor(() => players.every((player) => player.state?.players.length === 3), "all players in room");

  const bobAgain = connectPlayer("Bob");
  await waitFor(() => bobAgain.socket.connected, "rejoin connection");
  await emit(bobAgain.socket, "room:join", { roomId: created.roomId, name: bobAgain.name, deviceId: bob.deviceId });
  await waitFor(() => bobAgain.state?.players.length === 3, "idempotent rejoin");
  if (bobAgain.state.players.filter((player) => player.name === "Bob").length !== 1) {
    throw new Error("Rejoin created a duplicate player");
  }
  bob.socket.disconnect();
  players[1] = bobAgain;

  await emit(alice.socket, "game:start");
  await waitFor(() => alice.state?.phase === "preflop", "hand start");

  for (let i = 0; i < 80 && alice.state.phase !== "complete"; i += 1) {
    const current = players.find((player) => player.state?.isYourTurn);
    if (!current) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      continue;
    }
    const type = current.state.toCall > 0 ? "call" : "check";
    await emit(current.socket, "game:action", { type });
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  if (alice.state.phase !== "complete") throw new Error(`Expected complete hand, got ${alice.state.phase}`);
  if (!alice.state.winners.length) throw new Error("Expected at least one winner");
  if (alice.state.players.reduce((sum, player) => sum + player.stack, 0) !== 3000) {
    throw new Error("Chip totals did not balance after showdown");
  }

  players.forEach((player) => player.socket.disconnect());
  console.log(`Smoke test passed for room ${created.roomId}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
