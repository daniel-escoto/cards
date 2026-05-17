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

async function expectReject(socket, event, payload = {}, message = event) {
  try {
    await emit(socket, event, payload);
  } catch {
    return;
  }
  throw new Error(`Expected ${message} to be rejected`);
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
  const qrResponse = await fetch(`${URL}/qr.svg?text=${encodeURIComponent(`${URL}/?room=${created.roomId}`)}`);
  if (!qrResponse.ok || !(await qrResponse.text()).includes("<svg")) {
    throw new Error("Expected QR endpoint to return SVG");
  }
  await emit(bob.socket, "room:join", { roomId: created.roomId, name: bob.name, deviceId: bob.deviceId });
  await emit(carmen.socket, "room:join", { roomId: created.roomId, name: carmen.name, deviceId: carmen.deviceId });
  await waitFor(() => players.every((player) => player.state?.players.length === 3), "all players in room");
  if (alice.state.players.find((player) => player.name === "Alice")?.isHost !== true) {
    throw new Error("Expected host to be marked");
  }
  if (new Set(alice.state.players.map((player) => player.color).filter(Boolean)).size !== 3) {
    throw new Error("Expected real players to receive distinct colors");
  }
  const nextColor = alice.state.playerColors.find((color) => color !== bob.state.players.find((player) => player.isYou)?.color);
  await emit(bob.socket, "player:setColor", { color: nextColor });
  await waitFor(() => alice.state?.players.find((player) => player.name === "Bob")?.color === nextColor, "player color update");
  await emit(bob.socket, "player:setName", { name: "Bobby Tables" });
  await waitFor(() => alice.state?.players.find((player) => player.name === "Bobby Tables"), "player name update");
  await emit(bob.socket, "player:setName", { name: "Bob" });
  await waitFor(() => alice.state?.players.find((player) => player.name === "Bob"), "player name restore");

  const aliceAgain = connectPlayer("Alice");
  await waitFor(() => aliceAgain.socket.connected, "host duplicate connection");
  await emit(aliceAgain.socket, "room:join", { roomId: created.roomId, name: aliceAgain.name, deviceId: alice.deviceId });
  await waitFor(() => alice.state?.players.length === 3 && aliceAgain.state?.players.length === 3, "duplicate host updates");

  const bobAgain = connectPlayer("Bob");
  await waitFor(() => bobAgain.socket.connected, "rejoin connection");
  await emit(bobAgain.socket, "room:join", { roomId: created.roomId, name: bobAgain.name, deviceId: bob.deviceId });
  await waitFor(() => bobAgain.state?.players.length === 3, "idempotent rejoin");
  if (bobAgain.state.players.filter((player) => player.name === "Bob").length !== 1) {
    throw new Error("Rejoin created a duplicate player");
  }
  const bobId = alice.state.players.find((player) => player.name === "Bob")?.id;
  const aliceId = alice.state.players.find((player) => player.name === "Alice")?.id;
  await emit(alice.socket, "room:makeHost", { playerId: bobId });
  await waitFor(() => bobAgain.state?.players.find((player) => player.name === "Bob")?.isHost, "host transfer to Bob");
  await emit(bobAgain.socket, "room:makeHost", { playerId: aliceId });
  await waitFor(() => alice.state?.players.find((player) => player.name === "Alice")?.isHost, "host transfer back to Alice");
  bob.socket.disconnect();
  players[1] = bobAgain;

  await emit(alice.socket, "game:start");
  await waitFor(() => alice.state?.phase === "preflop", "hand start");
  if (!alice.state.canRestartGame || !alice.state.canEndGame) {
    throw new Error("Expected host to see restart and end game controls");
  }
  if (bobAgain.state.canRestartGame || bobAgain.state.canEndGame) {
    throw new Error("Expected non-host to hide restart and end game controls");
  }
  await expectReject(bobAgain.socket, "game:restart", {}, "non-host restart");
  await expectReject(bobAgain.socket, "game:end", {}, "non-host end game");
  const bobViewOfAlice = bobAgain.state.players.find((player) => player.name === "Alice");
  if (bobViewOfAlice?.cards.some((card) => card?.code)) {
    throw new Error("Expected table cards to stay hidden from opponents");
  }
  if (!bobViewOfAlice?.menuCards.every((card) => card?.code)) {
    throw new Error("Expected menu cards to show for every player");
  }
  if (!alice.state.actionLog?.some((entry) => entry.text.includes("small blind"))) {
    throw new Error("Expected action log to include blind posts");
  }
  carmen.socket.disconnect();
  const carmenAgain = connectPlayer("Carmen");
  await waitFor(() => carmenAgain.socket.connected, "in-progress rejoin connection");
  await emit(carmenAgain.socket, "room:join", { roomId: created.roomId, name: carmenAgain.name, deviceId: carmen.deviceId });
  await waitFor(() => carmenAgain.state?.phase === "preflop" && carmenAgain.state?.players.length === 3, "in-progress existing player rejoin");
  players[2] = carmenAgain;
  aliceAgain.socket.disconnect();
  await emit(alice.socket, "game:end");
  await waitFor(() => alice.state?.phase === "lobby", "game end");
  if (alice.state.players.reduce((sum, player) => sum + player.stack, 0) !== 3000) {
    throw new Error("Chip totals did not balance after ending the game");
  }
  if (alice.state.pot !== 0 || alice.state.players.some((player) => player.cards.length > 0)) {
    throw new Error("Expected ended game to clear the active hand");
  }

  await emit(alice.socket, "game:restart");
  await waitFor(() => alice.state?.phase === "lobby" && alice.state?.handNumber === 0, "game restart");
  if (alice.state.players.some((player) => player.stack !== 1000 || player.cards.length > 0)) {
    throw new Error("Expected restart to reset stacks and clear cards");
  }

  await emit(alice.socket, "game:start");
  await waitFor(() => alice.state?.phase === "preflop", "second hand start");
  let sawBettingAction = false;

  for (let i = 0; i < 80 && alice.state.phase !== "complete"; i += 1) {
    const current = players.find((player) => player.state?.isYourTurn);
    if (!current) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      continue;
    }
    const type = current.state.toCall > 0 ? "call" : "check";
    await emit(current.socket, "game:action", { type });
    sawBettingAction = sawBettingAction || Boolean(alice.state.actionLog?.some((entry) => (
      entry.text.includes("calls") || entry.text.includes("checks")
    )));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  if (alice.state.phase !== "complete") throw new Error(`Expected complete hand, got ${alice.state.phase}`);
  if (!sawBettingAction) throw new Error("Expected action log to include betting actions");
  if (!alice.state.winners.length) throw new Error("Expected at least one winner");
  const duplicateWinner = alice.state.winners.find((winner, index, list) => (
    list.findIndex((item) => item.playerId === winner.playerId && item.hand === winner.hand) !== index
  ));
  if (duplicateWinner) throw new Error("Expected same-player same-hand side pots to be combined");
  if (alice.state.players.reduce((sum, player) => sum + player.stack, 0) !== 3000) {
    throw new Error("Chip totals did not balance after showdown");
  }
  const hiddenOpponent = alice.state.players.find((player) => !player.isYou && !player.isBot);
  if (hiddenOpponent?.cards.some((card) => card?.code)) {
    throw new Error("Expected opponent cards to stay hidden after hand completion");
  }
  await emit(alice.socket, "game:showCards");
  await waitFor(() => alice.state.players.find((player) => player.isYou)?.showCards, "show hand");
  if (!bobAgain.state.players.find((player) => player.name === "Alice")?.cards.every((card) => card?.code)) {
    throw new Error("Expected shown hand to be visible to other players");
  }

  const solo = connectPlayer("Solo");
  await waitFor(() => solo.socket.connected, "computer game connection");
  await emit(solo.socket, "room:create", {
    name: solo.name,
    deviceId: solo.deviceId,
    computerPlayers: 4,
  });
  await waitFor(() => solo.state?.players.length === 4, "computer players seated");
  if (solo.state.players.filter((player) => player.isBot).length !== 3) {
    throw new Error("Expected three computer players");
  }
  if (solo.state.players.some((player) => player.isBot && !player.connected)) {
    throw new Error("Expected CPU players to be connected");
  }
  await emit(solo.socket, "game:start");
  await waitFor(() => solo.state?.phase === "preflop", "computer game hand start");

  const dana = connectPlayer("Dana");
  await waitFor(() => dana.socket.connected, "drop-in connection");
  await emit(dana.socket, "room:join", { roomId: solo.state.id, name: dana.name, deviceId: dana.deviceId });
  await waitFor(() => dana.state?.phase === "preflop" && dana.state?.players.length === 4, "drop-in player seated");
  if (dana.state.players.filter((player) => player.isBot).length !== 2) {
    throw new Error("Expected joining player to take a CPU seat");
  }
  const danaSeatIndex = dana.state.players.findIndex((player) => player.name === "Dana");
  await emit(dana.socket, "room:leave");
  await waitFor(() => {
    const danaSeat = solo.state?.players.find((player) => player.name === "Dana");
    return danaSeat && !danaSeat.connected && danaSeat.disconnectExpiresAt;
  }, "leave grace timer");
  const danaReturn = connectPlayer("Dana");
  await waitFor(() => danaReturn.socket.connected, "reserved seat rejoin connection");
  await emit(danaReturn.socket, "room:join", { roomId: solo.state.id, name: danaReturn.name, deviceId: dana.deviceId });
  await waitFor(() => danaReturn.state?.players[danaSeatIndex]?.name === "Dana" && danaReturn.state.players[danaSeatIndex].connected, "same seat rejoin");
  if (danaReturn.state.players.filter((player) => player.isBot).length !== 2) {
    throw new Error("Expected rejoin before grace to keep the reserved seat");
  }
  danaReturn.socket.disconnect();
  await waitFor(() => solo.state?.players.filter((player) => player.isBot).length === 3, "drop-out CPU replacement", 35000);
  const danaLate = connectPlayer("Dana");
  await waitFor(() => danaLate.socket.connected, "late reserved seat rejoin connection");
  await emit(danaLate.socket, "room:join", { roomId: solo.state.id, name: danaLate.name, deviceId: dana.deviceId });
  await waitFor(() => danaLate.state?.players[danaSeatIndex]?.name === "Dana" && danaLate.state.players[danaSeatIndex].connected, "same replacement seat rejoin");
  if (danaLate.state.players.filter((player) => player.isBot).length !== 2) {
    throw new Error("Expected late rejoin to reclaim the replacement CPU seat");
  }

  const computerTableHumans = [solo, danaLate];
  for (let i = 0; i < 240 && solo.state.phase !== "complete"; i += 1) {
    const current = computerTableHumans.find((player) => player.state?.isYourTurn);
    if (current) {
      await emit(current.socket, "game:action", { type: current.state.toCall > 0 ? "call" : "check" });
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  if (solo.state.phase !== "complete") throw new Error(`Expected computer hand to complete, got ${solo.state.phase}`);
  if (!solo.state.actionLog?.some((entry) => entry.text.includes("CPU"))) {
    throw new Error("Expected computer players to take actions");
  }
  if (solo.state.players.reduce((sum, player) => sum + player.stack, 0) !== 4000) {
    throw new Error("Computer game chip totals did not balance");
  }
  const hiddenCpu = solo.state.players.find((player) => player.isBot && player.cards.some((card) => !card?.code));
  if (hiddenCpu) {
    throw new Error("Expected CPU cards to show after hand completion");
  }

  players.forEach((player) => player.socket.disconnect());
  solo.socket.disconnect();
  dana.socket.disconnect();
  danaLate.socket.disconnect();
  console.log(`Smoke test passed for room ${created.roomId}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
