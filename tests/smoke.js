const { io } = require("socket.io-client");

const URL = process.env.SMOKE_URL || "http://localhost:3000";

function connectPlayer(name) {
  const socket = io(URL, { transports: ["websocket"], forceNew: true });
  let state = null;
  let kicked = false;
  socket.on("room:update", (next) => {
    state = next;
  });
  socket.on("room:kicked", () => {
    kicked = true;
  });
  return {
    name,
    deviceId: `device-${name.toLowerCase()}`,
    socket,
    get state() { return state; },
    get kicked() { return kicked; },
  };
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

  const opsHost = connectPlayer("OpsHost");
  const opsNextHost = connectPlayer("OpsNextHost");
  const opsKicked = connectPlayer("OpsKicked");
  await waitFor(
    () => opsHost.socket.connected && opsNextHost.socket.connected && opsKicked.socket.connected,
    "host ops connections",
  );
  const opsRoom = await emit(opsHost.socket, "room:create", { name: opsHost.name, deviceId: opsHost.deviceId });
  await emit(opsNextHost.socket, "room:join", {
    roomId: opsRoom.roomId,
    name: opsNextHost.name,
    deviceId: opsNextHost.deviceId,
  });
  await emit(opsKicked.socket, "room:join", {
    roomId: opsRoom.roomId,
    name: opsKicked.name,
    deviceId: opsKicked.deviceId,
  });
  await waitFor(() => opsHost.state?.players.length === 3, "host ops table seated");
  const nextHostId = opsHost.state.players.find((player) => player.name === "OpsNextHost")?.id;
  const kickedId = opsHost.state.players.find((player) => player.name === "OpsKicked")?.id;
  const hostViewOfNext = opsHost.state.players.find((player) => player.id === nextHostId);
  const hostViewOfKicked = opsHost.state.players.find((player) => player.id === kickedId);
  if (!hostViewOfNext?.canMakeHost || !hostViewOfNext?.canKick || !hostViewOfKicked?.canKick) {
    throw new Error("Expected host to be able to transfer host and kick players from the menu");
  }
  if (opsNextHost.state.players.some((player) => player.canMakeHost || player.canKick)) {
    throw new Error("Expected non-host to lack host management controls");
  }
  if (!opsHost.state.canAddBot || opsNextHost.state.canAddBot) {
    throw new Error("Expected only the host to be able to add CPU players between hands");
  }
  await emit(opsHost.socket, "room:addBot");
  await waitFor(() => opsHost.state?.players.length === 4, "host adds CPU player");
  const addedBot = opsHost.state.players.find((player) => player.isBot);
  if (!addedBot?.canKick) throw new Error("Expected host to be able to kick CPU players");
  await emit(opsHost.socket, "room:kick", { playerId: addedBot.id });
  await waitFor(() => opsHost.state?.players.length === 3 && !opsHost.state.players.some((player) => player.isBot), "host kicks CPU player");
  await emit(opsHost.socket, "room:makeHost", { playerId: nextHostId });
  await waitFor(() => opsNextHost.state?.players.find((player) => player.name === "OpsNextHost")?.isHost, "host ops transfer");
  await emit(opsNextHost.socket, "room:kick", { playerId: kickedId });
  await waitFor(
    () => opsKicked.kicked && opsHost.state?.players.length === 2 && !opsHost.state.players.some((player) => player.name === "OpsKicked"),
    "host ops kick",
  );
  opsHost.socket.disconnect();
  opsNextHost.socket.disconnect();
  opsKicked.socket.disconnect();

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
  if ("menuCards" in bobViewOfAlice) {
    throw new Error("Expected menu cards to be omitted");
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
  const completedHandNumber = alice.state.handNumber;
  await emit(alice.socket, "game:next");
  await waitFor(() => alice.state?.phase === "preflop" && alice.state?.handNumber === completedHandNumber + 1, "next hand start");
  if (alice.state.actionLog.some((entry) => !entry.id.startsWith(`${alice.state.handNumber}-`))) {
    throw new Error("Expected next hand to reset previous hand history");
  }
  if (!alice.state.actionLog.some((entry) => entry.id.startsWith(`${alice.state.handNumber}-`) && entry.text.includes("blind"))) {
    throw new Error("Expected new hand history to include blind posts");
  }

  const idle = connectPlayer("Idle");
  await waitFor(() => idle.socket.connected, "idle computer game connection");
  await emit(idle.socket, "room:create", {
    name: idle.name,
    deviceId: idle.deviceId,
    computerPlayers: 4,
  });
  await waitFor(() => idle.state?.players.length === 4, "idle computer players seated");
  await emit(idle.socket, "game:start");
  await waitFor(() => {
    const current = idle.state?.players.find((player) => player.id === idle.state?.turn);
    return idle.state?.phase === "preflop" && current?.isBot;
  }, "idle game CPU turn");
  const idleSignature = `${idle.state.phase}:${idle.state.turn}:${idle.state.actionLog.length}:${idle.state.pot}`;
  idle.socket.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 900));
  const idleReturn = connectPlayer("Idle");
  await waitFor(() => idleReturn.socket.connected, "idle game rejoin connection");
  await emit(idleReturn.socket, "room:join", { roomId: idle.state.id, name: idleReturn.name, deviceId: idle.deviceId });
  await waitFor(() => idleReturn.state?.phase === "preflop", "idle game rejoin");
  const idleReturnSignature = `${idleReturn.state.phase}:${idleReturn.state.turn}:${idleReturn.state.actionLog.length}:${idleReturn.state.pot}`;
  if (idleReturnSignature !== idleSignature) {
    throw new Error("Expected computer game to pause while no humans are connected");
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
  if (!solo.state.players.filter((player) => player.isBot).every((player) => /^[A-Z][a-z]+[A-Z][a-z]+$/.test(player.name))) {
    throw new Error("Expected procedural gamer tags for CPU players");
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
  if (!solo.state.actionLog?.some((entry) => String(entry.playerId).startsWith("bot:"))) {
    throw new Error("Expected computer players to take actions");
  }
  if (solo.state.players.reduce((sum, player) => sum + player.stack, 0) !== 4000) {
    throw new Error("Computer game chip totals did not balance");
  }
  const hiddenCpu = solo.state.players.find((player) => player.isBot && player.cards.some((card) => !card?.code));
  if (hiddenCpu) {
    throw new Error("Expected CPU cards to show after hand completion");
  }

  const finalA = connectPlayer("FinalA");
  const finalB = connectPlayer("FinalB");
  await waitFor(() => finalA.socket.connected && finalB.socket.connected, "final table connections");
  const finalRoom = await emit(finalA.socket, "room:create", { name: finalA.name, deviceId: finalA.deviceId });
  await emit(finalB.socket, "room:join", { roomId: finalRoom.roomId, name: finalB.name, deviceId: finalB.deviceId });
  await waitFor(() => finalA.state?.players.length === 2 && finalB.state?.players.length === 2, "final table seated");

  for (let hand = 0; hand < 10 && finalA.state.phase !== "gameover"; hand += 1) {
    await emit(finalA.socket, finalA.state.phase === "complete" ? "game:next" : "game:start");
    await waitFor(() => ["preflop", "gameover"].includes(finalA.state?.phase), "final hand start");

    for (let i = 0; i < 20 && !["complete", "gameover"].includes(finalA.state.phase); i += 1) {
      const current = [finalA, finalB].find((player) => player.state?.isYourTurn);
      if (!current) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }
      const hero = current.state.players.find((player) => player.isYou);
      const maxRaise = hero.bet + hero.stack;
      if (maxRaise > current.state.currentBet) {
        await emit(current.socket, "game:action", { type: "raise", raiseTo: maxRaise });
      } else {
        await emit(current.socket, "game:action", { type: current.state.toCall > 0 ? "call" : "check" });
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (finalA.state.phase === "showdown") {
      await waitFor(() => ["complete", "gameover"].includes(finalA.state?.phase), "showdown reveal", 4000);
    }
  }

  await waitFor(() => finalA.state?.phase === "gameover", "natural game over");
  const finalStacks = finalA.state.players.map((player) => player.stack).sort((a, b) => b - a);
  if (finalStacks[0] !== 2000 || finalStacks[1] !== 0) {
    throw new Error("Expected heads-up all-in game to leave one winner with all chips");
  }
  if (finalA.state.canNextHand || finalA.state.canStart) {
    throw new Error("Expected game over to block further hands");
  }

  players.forEach((player) => player.socket.disconnect());
  idleReturn.socket.disconnect();
  solo.socket.disconnect();
  dana.socket.disconnect();
  danaLate.socket.disconnect();
  finalA.socket.disconnect();
  finalB.socket.disconnect();
  console.log(`Smoke test passed for room ${created.roomId}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
