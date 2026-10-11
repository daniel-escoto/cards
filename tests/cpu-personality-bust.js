// CPU think time, bust/rebuy, preflop tightness and per-room CPU personalities.
const assert = require("node:assert/strict");
const engine = require("../dist/shared/engine.node");
const { createPracticeSession } = require("../dist/public/practice");

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const profileByShort = (short) => engine.BOT_PROFILES.find((profile) => profile.short === short);

function practiceRoom(botCount = 3) {
  return engine.createPracticeRoom({
    name: "Hero",
    playerId: "hero",
    tableSize: botCount + 1,
    botCount,
    startingStack: 1000,
    smallBlind: 10,
    bigBlind: 20,
  });
}

function bustHero(room) {
  // Between hands, hero has no chips, CPUs split the rest.
  const hero = room.players.find((player) => player.id === "hero");
  hero.stack = 0;
  hero.ready = false;
  room.status = "complete";
  room.phase = "complete";
  room.handNumber = 7;
  for (const bot of room.players.filter((player) => player.isBot)) bot.stack = 1333;
  return hero;
}

// 1. Think time: ranges by decision, tempo by personality, fast runouts.
{
  const room = practiceRoom(3);
  engine.setRandomInt(() => 0);
  room.phase = "flop";
  room.status = "playing";
  room.community = ["Ah", "Kd", "2c"];
  room.currentBet = 0;
  room.handNumber = 1;
  const bot = room.players.find((player) => player.isBot);
  bot.bet = 0;
  bot.stack = 1000;
  for (const player of room.players) player.invested = 10;
  const random = seeded(42);
  const sample = (short, action, n = 300) => {
    bot.botProfile = profileByShort(short).tag;
    const values = [];
    for (let i = 0; i < n; i += 1)
      values.push(engine.computerThinkDelayMs(room, bot, action, random));
    return { min: Math.min(...values), max: Math.max(...values), values };
  };
  const [checkMin, checkMax] = engine.CPU_THINK_MS.check;
  const balancedCheck = sample("Balanced", { type: "check" });
  assert.ok(balancedCheck.min >= checkMin && balancedCheck.max <= checkMax, "check 0.5-0.9s");
  const [actMin, actMax] = engine.CPU_THINK_MS.act;
  const balancedBet = sample("Balanced", { type: "raise", raiseTo: 20 });
  assert.ok(
    balancedBet.min >= actMin && balancedBet.max <= actMax,
    "small-pot bet 1-2.5s, no tank",
  );
  const quick = profileByShort("Quick");
  assert.ok(quick.tempo < 1, "Tight and quick has a faster tempo");
  const quickCheck = sample("Quick", { type: "check" });
  assert.ok(quickCheck.max <= Math.ceil(checkMax * quick.tempo), "Quick checks faster");
  assert.ok(quickCheck.max < balancedCheck.min + 200);

  // Big pot: sometimes tanks (3-4s × tempo), otherwise the normal call range.
  room.currentBet = 300;
  for (const player of room.players) player.invested = 200;
  const bigCall = sample("Balanced", { type: "call" }, 400);
  const [tankMin, tankMax] = engine.CPU_THINK_MS.tank;
  const tanks = bigCall.values.filter((value) => value >= tankMin);
  assert.ok(tanks.length > 40 && tanks.length < 200, `tank sometimes (${tanks.length}/400)`);
  assert.ok(bigCall.max <= tankMax);
  assert.ok(bigCall.values.every((value) => value >= actMin));

  // Lone human folded: runout pace regardless of decision.
  room.players.find((player) => player.id === "hero").folded = true;
  const runout = sample("Grinder", { type: "call" });
  const [runMin, runMax] = engine.CPU_THINK_MS.runout;
  assert.ok(runout.min >= runMin && runout.max <= runMax, "fast runout once the human folds");
}

// 2. Personalities: assigned at add time, distinct, persisted tag, legacy fallback.
{
  let next = 0;
  engine.setRandomInt((max) => next++ % max);
  const room = practiceRoom(5);
  const bots = room.players.filter((player) => player.isBot);
  const tags = bots.map((bot) => bot.botProfile);
  assert.ok(tags.every((tag) => engine.BOT_PROFILES.some((profile) => profile.tag === tag)));
  assert.equal(new Set(tags).size, bots.length, "no duplicate styles at a 6-max table");
  for (const bot of bots) {
    const view = engine.botStyleView(bot);
    const profile = engine.computerProfile(bot);
    assert.equal(view.botProfile, bot.botProfile);
    assert.equal(view.botStyle, profile.style);
    assert.equal(view.botStyleShort, profile.short);
  }
  assert.deepEqual(engine.botStyleView(room.players[0]), {
    botProfile: null,
    botStyle: null,
    botStyleShort: null,
  });
  const client = engine.serializeRoom(room, "hero");
  assert.ok(
    client.players.filter((player) => player.isBot).every((player) => player.botStyleShort),
  );
  assert.equal(client.players.find((player) => player.id === "hero").botStyleShort, null);

  // Random start: a different random draw gives a different first style.
  engine.setRandomInt(() => 3);
  const other = practiceRoom(1);
  assert.equal(other.players[1].botProfile, engine.BOT_PROFILES[3].tag);

  // Legacy seat (no tag / unknown tag) keeps the old seat-number personality.
  const legacy = { id: "bot:ABCD:3", isBot: true };
  assert.equal(engine.computerProfile(legacy), engine.BOT_PROFILES[2]);
  assert.equal(engine.computerProfile({ ...legacy, botProfile: "nope" }), engine.BOT_PROFILES[2]);
  assert.equal(engine.botStyleView(legacy).botStyleShort, engine.BOT_PROFILES[2].short);
}

// 3. Preflop tightness: entry rate in an unopened pot per style stays well below the
//    old 60-70% (whole-table VPIP, which also counts facing raises, lands ~20-40%; see
//    the PR botsim). Trash folds; aggressive styles open-raise instead of limping.
{
  engine.setRandomInt(() => 0);
  const realRandom = Math.random;
  Math.random = seeded(7);
  try {
    const deck = engine.makeDeck();
    for (const profile of engine.BOT_PROFILES) {
      let played = 0;
      let raised = 0;
      const trials = 2500;
      for (let i = 0; i < trials; i += 1) {
        const room = practiceRoom(5);
        const bot = room.players[1];
        bot.botProfile = profile.tag;
        room.status = "playing";
        room.phase = "preflop";
        room.handNumber = 1;
        room.currentBet = 20;
        room.minRaise = 20;
        room.raiseEligible = new Set(room.players.map((player) => player.id));
        const a = Math.floor(Math.random() * 52);
        let b = Math.floor(Math.random() * 51);
        if (b >= a) b += 1;
        bot.hand = [deck[a], deck[b]];
        // Six dealt in (a 6-max hand); other seats' cards don't affect this decision.
        for (const other of room.players) if (other !== bot) other.hand = ["2c", "3d"];
        bot.bet = 0;
        const action = engine.chooseComputerAction(room, bot);
        if (action.type !== "fold") played += 1;
        if (action.type === "raise") raised += 1;
      }
      const vpip = played / trials;
      assert.ok(
        vpip >= 0.12 && vpip <= 0.55,
        `${profile.style} unopened entry ${(vpip * 100).toFixed(1)}%`,
      );
      if (profile.aggression >= 1.3) assert.ok(raised / played > 0.4, `${profile.style} opens`);
    }
    const room = practiceRoom(2);
    const bot = room.players[1];
    bot.botProfile = profileByShort("Loose").tag;
    room.phase = "preflop";
    bot.hand = ["7h", "2c"];
    assert.equal(engine.preflopBlindCallChance(room, bot, 20), 0, "72o has no floor to limp");
    bot.hand = ["Ah", "Ad"];
    assert.ok(engine.preflopBlindCallChance(room, bot, 20) > 0.9);
  } finally {
    Math.random = realRandom;
  }
}

// 4. Bust: detected only when every human is out and 2+ CPUs have chips.
{
  engine.setRandomInt(() => 0);
  const room = practiceRoom(3);
  assert.equal(engine.humansBustedOut(room), false);
  const hero = bustHero(room);
  assert.equal(engine.humansBustedOut(room), true);
  const view = engine.serializeRoom(room, "hero");
  assert.equal(view.bustedOut, true);
  assert.equal(view.canRebuy, true);
  assert.equal(view.phase, "complete", "stays on the table, not the game-over screen");
  // Only one CPU left with chips → the normal game-over path instead.
  const lone = practiceRoom(2);
  bustHero(lone);
  lone.players[2].stack = 0;
  assert.equal(engine.humansBustedOut(lone), false);
  // Money mode never offers a free rebuy.
  room.moneyMode = true;
  assert.equal(engine.humansBustedOut(room), false);
  room.moneyMode = false;
  // Rebuy validation.
  assert.equal(engine.rebuyBustedPlayer(room, room.players[1].id).ok, false);
  hero.stack = 5;
  assert.equal(engine.rebuyBustedPlayer(room, "hero").ok, false);
  hero.stack = 0;
}

// 5. Practice session: rebuy deals the next hand (no freeze); restart resets.
{
  engine.setRandomInt(() => 0);
  const room = practiceRoom(3);
  bustHero(room);
  const updates = [];
  const session = createPracticeSession({
    room,
    viewerId: "hero",
    cpuDelayMs: 0,
    onUpdate: (state) => updates.push(state),
  });
  session.publish();
  assert.equal(updates.at(-1).canRebuy, true);
  const result = session.handle("game:rebuy", {});
  assert.equal(result.ok, true, result.error);
  const after = updates.at(-1);
  assert.equal(after.players.find((player) => player.id === "hero").stack > 0, true);
  assert.equal(after.canRebuy, false);
  assert.ok(["preflop", "flop", "turn", "river", "showdown"].includes(after.phase), after.phase);
  assert.equal(room.handNumber, 8, "next hand dealt right after the rebuy");
  assert.equal(session.handle("game:rebuy", {}).ok, false, "no double rebuy");
  session.dispose();

  const room2 = practiceRoom(3);
  bustHero(room2);
  const states = [];
  const session2 = createPracticeSession({
    room: room2,
    viewerId: "hero",
    cpuDelayMs: 0,
    onUpdate: (state) => states.push(state),
  });
  assert.equal(session2.handle("game:restart", {}).ok, true);
  assert.equal(states.at(-1).canRebuy, false);
  assert.ok(room2.players.every((player) => player.stack === 1000));
  assert.equal(room2.phase, "lobby");
  session2.dispose();
}

// 6. Server: socket rebuy/restart, storage round-trip, legacy restore.
(async () => {
  process.env.CPU_ACTION_DELAY_MS = process.env.CPU_ACTION_DELAY_MS || "20";
  engine.setRandomInt((max) => Math.floor(Math.random() * max));
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
  const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
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
      rooms.delete(room.id);
    }
    if (server.listening) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      });
    }
  }

  // Storage: tag round-trips; legacy rooms without it restore to seat-derived styles.
  {
    const room = {
      id: "PERS",
      hostId: "h",
      phase: "lobby",
      status: "lobby",
      players: [
        { id: "h", name: "Host", isBot: false, stack: 1000 },
        { id: "bot:PERS:1", name: "CPU 1", isBot: true, stack: 1000, botProfile: "cpu_52b1" },
        { id: "bot:PERS:2", name: "CPU 2", isBot: true, stack: 1000 },
      ],
    };
    const stored = serializeRoomForStorage(restoreRoom(room));
    const restored = restoreRoom(stored);
    for (const player of restored.players) clearTimeout(player.disconnectTimer);
    assert.equal(restored.players[1].botProfile, "cpu_52b1");
    assert.equal(restored.players[2].botProfile ?? null, null, "legacy seat stays untagged");
    assert.equal(engine.computerProfile(restored.players[2]), engine.BOT_PROFILES[1]);
    assert.equal(restored.players[0].botProfile ?? null, null);
  }

  await new Promise((resolve, reject) => {
    server.listen(0, (error) => (error ? reject(error) : resolve()));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const socket = io(url, { transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  const host = { state: null };
  socket.on("room:update", (state) => {
    host.state = state;
  });
  const send = (event, payload = {}) =>
    new Promise((resolve, reject) => {
      socket
        .timeout(4000)
        .emit(event, payload, (error, result) => (error ? reject(error) : resolve(result)));
    });
  try {
    await wait(() => socket.connected, "connect");
    const identity = { name: "Hero", deviceId: `bust-${Date.now()}` };
    const created = await send("room:create", { ...identity, smallBlind: 10, bigBlind: 20 });
    assert.equal(created.ok, true, created.error);
    for (let i = 0; i < 3; i += 1) assert.equal((await send("room:addBot", {})).ok, true);
    await wait(() => host.state?.players.length === 4, "CPUs seated");
    const styles = host.state.players.filter((player) => player.isBot).map((p) => p.botStyleShort);
    assert.ok(styles.every(Boolean), "client sees each CPU style");
    assert.equal(new Set(styles).size, 3, "distinct styles");

    // Force the bust state between hands (hero 0 chips, CPUs hold the rest).
    const room = rooms.get(created.roomId);
    const heroSeat = room.players.find((player) => !player.isBot);
    const bust = () => {
      room.phase = "complete";
      room.status = "complete";
      room.handNumber = Math.max(room.handNumber, 7);
      heroSeat.stack = 0;
      heroSeat.ready = false;
      for (const bot of room.players.filter((player) => player.isBot)) bot.stack = 1333;
    };
    bust();
    await send("player:setName", { name: "Hero" });
    await wait(() => host.state?.canRebuy === true, "bust flag reaches the client");
    assert.equal(host.state.bustedOut, true);
    const restart = await send("game:restart", {});
    assert.equal(restart.ok, true, restart.error);
    await wait(
      () => host.state?.phase === "lobby" && host.state.players.every((p) => p.stack > 0),
      "restart resets stacks",
    );
    assert.equal(host.state.canRebuy, false);

    bust();
    await send("player:setName", { name: "Hero" });
    await wait(() => host.state?.canRebuy === true, "bust flag again");
    const handBefore = room.handNumber;
    const rebuy = await send("game:rebuy", {});
    assert.equal(rebuy.ok, true, rebuy.error);
    await wait(() => room.handNumber === handBefore + 1, "next hand dealt after rebuy");
    assert.equal(host.state.canRebuy, false);
    // CPUs keep acting (no freeze): the hand advances past the first decision.
    const logBefore = room.actionLog.length;
    await wait(
      () =>
        room.actionLog.length > logBefore || room.turn === heroSeat.id || room.phase !== "preflop",
      "CPU acts after rebuy",
    );
    console.log("CPU think time, personality, preflop and bust/rebuy checks passed.");
  } finally {
    await shutdown();
  }
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
