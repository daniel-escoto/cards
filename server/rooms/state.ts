import api = require("../api");
import "../config";
import "../runtime";
import { createFileStateStore } from "../../state-store";
import type {
  HandoffMeta,
  PersistedState,
  Player,
  Room,
  Spectator,
  StoredPlayer,
  StoredRoom,
} from "../../shared/types";

function clearTimer(timer: ReturnType<typeof setTimeout> | null | undefined): void {
  if (timer != null) clearTimeout(timer);
}


async function claimRoomForLiveActivity(roomId: string) {
  const id = String(roomId || "").toUpperCase();
  if (!id) return null;
  if (api.liveRoomIds.has(id)) return api.rooms.get(id) || null;

  if (api.usingRedis() && !api.handoffComplete) {
    try {
      const payload = await api.getStateStore().load();
      const raw = (payload?.rooms || []).find((room) => String(room.id).toUpperCase() === id);
      if (raw) {
        const existing = api.rooms.get(id);
        if (existing) clearRoomRuntime(existing);
        const room = restoreRoom(raw);
        if (room) {
          // Only pad by a real handoff flush gap — never by idle time since last save.
          extendDeadlinesAfterRestore(
            room,
            handoffPadMs(api.lastHandoffMeta, api.shotClockTime.now()),
          );
          api.rooms.set(room.id, room);
        }
      }
    } catch (error) {
      console.error("Failed to refresh room before live claim:", error);
    }
  }

  const room = api.rooms.get(id);
  if (!room) return null;
  api.markRoomLive(id);
  activateRoom(room, { scheduleSaveAfter: false });
  return room;
}

function tryStartReadyHand(room: Room) {
  if (api.holdNewHands) return false;
  return api.maybeStartReadyHand(room);
}

function anyHandInProgress() {
  for (const room of api.rooms.values()) {
    if (api.isHandInProgress(room)) return true;
  }
  return false;
}

function waitForHandsToFinish(maxMs: number, { now = () => Date.now(), sleep }: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
  const sleepFn = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + Math.max(0, maxMs);
  return (async () => {
    while (anyHandInProgress() && now() < deadline) {
      await sleepFn(50);
    }
    return !anyHandInProgress();
  })();
}

function newReconnectCredentials() {
  const token = api.crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: api.crypto.createHash("sha256").update(token).digest("hex") };
}

function reconnectTokenMatches(player: Pick<Player, "reconnectTokenHash"> | null | undefined, token: string | undefined) {
  if (!player?.reconnectTokenHash || !token) return false;
  const actual = api.crypto.createHash("sha256").update(String(token)).digest();
  const expected = Buffer.from(player.reconnectTokenHash, "hex");
  return expected.length === actual.length && api.crypto.timingSafeEqual(expected, actual);
}

function serializePlayerForStorage(player: Player): StoredPlayer {
  return {
    id: player.id,
    reconnectTokenHash: player.reconnectTokenHash || null,
    name: player.name,
    color: player.color || null,
    stack: player.stack,
    hand: player.hand,
    folded: player.folded,
    allIn: player.allIn,
    bet: player.bet,
    invested: player.invested,
    showCards: Boolean(player.showCards),
    ready: Boolean(player.ready),
    sittingOut: Boolean(player.sittingOut),
    disconnectExpiresAt: player.disconnectExpiresAt || null,
    connected: false,
    isBot: player.isBot,
    replacedPlayerId: player.replacedPlayerId || null,
    replacedPlayerName: player.replacedPlayerName || null,
    replacedPlayerColor: player.replacedPlayerColor || null,
    replacedReconnectTokenHash: player.replacedReconnectTokenHash || null,
    buyInsCents: Math.max(0, Math.floor(Number(player.buyInsCents) || 0)),
    cashOutCents: Math.max(0, Math.floor(Number(player.cashOutCents) || 0)),
    preflopShoveStreak: Math.max(0, Math.floor(Number(player.preflopShoveStreak) || 0)),
    botProfile: player.isBot ? player.botProfile || null : null,
  } as StoredPlayer;
}

function serializeRoomForStorage(room: Room): StoredRoom {
  return {
    id: room.id,
    hostId: room.hostId,
    tableSize: room.tableSize || 0,
    status: room.status,
    phase: room.phase,
    deck: room.deck,
    community: room.community,
    dealer: room.dealer,
    smallBlindPlayerId: room.smallBlindPlayerId || null,
    bigBlindPlayerId: room.bigBlindPlayerId || null,
    turn: room.turn,
    currentBet: room.currentBet,
    minRaise: room.minRaise,
    deadPot: room.deadPot || 0,
    acted: [...(room.acted || [])],
    raiseEligible: [...(room.raiseEligible || [])],
    message: room.message,
    winners: room.winners,
    actionLog: room.actionLog,
    riverAggressor: room.riverAggressor || null,
    allInCardsExposed: Boolean(room.allInCardsExposed),
    handNumber: room.handNumber,
    moneyMode: Boolean(room.moneyMode),
    moneyUnitCents: room.moneyUnitCents === 1 ? 1 : null,
    buyInCents: api.cleanMoneyCents(room.buyInCents, api.DEFAULT_BUY_IN_CENTS),
    baseSmallBlind: room.baseSmallBlind || api.DEFAULT_SMALL_BLIND,
    baseBigBlind: room.baseBigBlind || api.DEFAULT_BIG_BLIND,
    turnTimeLimitMs: api.normalizeShotClockMs(room.turnTimeLimitMs, api.SHOT_CLOCK_DEFAULT_MS),
    turnEndsAt: room.turnEndsAt || null,
    turnTimerPlayerId: room.turnTimerPlayerId || null,
    readyTimeLimitMs: api.normalizeReadyTimerMs(room.readyTimeLimitMs, api.READY_TIMER_DEFAULT_MS),
    readyEndsAt: room.readyEndsAt || null,
    autoTimerDefaults: Boolean(room.autoTimerDefaults),
    shotClockSetByHost: Boolean(room.shotClockSetByHost),
    readyTimerSetByHost: Boolean(room.readyTimerSetByHost),
    settlements: Array.isArray(room.settlements) ? room.settlements : [],
    moneyLedger: Array.isArray(room.moneyLedger) ? room.moneyLedger : [],
    dormantSince: room.dormantSince || null,
    ...(room.rabbitHuntEnabled === false ? { rabbitHuntEnabled: false } : {}),
    ...(room.rabbitCards?.length ? { rabbitCards: room.rabbitCards.slice(0, 5) } : {}),
    players: room.players.map(serializePlayerForStorage),
  } as StoredRoom;
}

function buildRoomsPayload(roomList: Room[], options: { shutdownFlush?: boolean } = {}): PersistedState {
  const savedAt = new Date().toISOString();
  const payload: PersistedState = {
    version: 1,
    savedAt,
    buildId: api.BUILD_ID,
    rooms: roomList.map(serializeRoomForStorage),
  };
  if (options.shutdownFlush) {
    // Marks a SIGTERM final flush so restore pad uses the real handoff gap.
    payload.shutdownFlushedAt = savedAt;
  }
  return payload;
}

async function saveRoomsNow(options: { shutdownFlush?: boolean; all?: boolean } = {}): Promise<PersistedState> {
  if (api.saveTimer) {
    clearTimer(api.saveTimer);
    api.saveTimer = null;
  }
  const store = api.getStateStore();
  const writeAll =
    options.all === true || api.handoffComplete || !api.usingRedis() || api.shuttingDown;
  const shutdownFlush =
    options.shutdownFlush === true || (options.all === true && api.shuttingDown);
  let payload: PersistedState;
  if (writeAll) {
    payload = buildRoomsPayload([...api.rooms.values()], { shutdownFlush });
  } else {
    const existing = (await store.load()) || { version: 1 as const, savedAt: "", buildId: "", rooms: [] };
    const byId = new Map<string, StoredRoom>(
      (Array.isArray(existing.rooms) ? existing.rooms : [])
        .filter((room): room is StoredRoom => Boolean(room && room.id))
        .map((room) => [String(room.id).toUpperCase(), room]),
    );
    for (const roomId of api.liveRoomIds) {
      const room = api.rooms.get(roomId);
      if (room) byId.set(roomId, serializeRoomForStorage(room));
      else byId.delete(roomId);
    }
    payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      buildId: api.BUILD_ID,
      rooms: [...byId.values()],
    };
  }
  await store.save(payload);
  return payload;
}

function scheduleSave() {
  if (api.suppressPersistence) return;
  if (api.usingRedis() && !api.handoffComplete && api.liveRoomIds.size === 0) return;
  clearTimer(api.saveTimer);
  api.saveTimer = setTimeout(() => {
    saveRoomsNow().catch((error) => {
      console.error("Failed to save game state:", error);
    });
  }, api.SAVE_DEBOUNCE_MS);
}

function pauseRoomTimers(room: Room) {
  if (!room) return;
  api.shotClockTime.clearTimeout(room.turnTimer);
  room.turnTimer = null;
  api.shotClockTime.clearTimeout(room.readyTimer);
  room.readyTimer = null;
  api.clearComputerTurn(room);
  room.botTimer = null;
  clearTimer(room.showdownTimer);
  room.showdownTimer = null;
  clearTimer(room.dormantTimer);
  room.dormantTimer = null;
  for (const player of room.players || []) {
    clearTimer(player.disconnectTimer);
    player.disconnectTimer = null;
  }
  for (const spectator of room.spectators || []) {
    clearTimer(spectator.disconnectTimer);
    spectator.disconnectTimer = null;
  }
}

function pauseAllRoomTimers() {
  for (const room of api.rooms.values()) pauseRoomTimers(room);
}

function extendDeadlinesAfterRestore(room: Room, downtimeMs: number) {
  const pad = Math.max(0, Math.floor(Number(downtimeMs) || 0));
  if (!room || !pad) return;
  if (room.turnEndsAt) room.turnEndsAt += pad;
  if (room.readyEndsAt) room.readyEndsAt += pad;
  for (const player of room.players || []) {
    if (player.disconnectExpiresAt) player.disconnectExpiresAt += pad;
  }
  for (const spectator of room.spectators || []) {
    if (spectator.disconnectExpiresAt) spectator.disconnectExpiresAt += pad;
  }
}

function downtimeMsFromSavedAt(savedAt: string | undefined, now = Date.now()) {
  if (!savedAt) return 0;
  const savedMs = Date.parse(savedAt);
  if (!Number.isFinite(savedMs)) return 0;
  return Math.max(0, now - savedMs);
}

function handoffPadMs(handoffMeta: HandoffMeta | null | undefined, now = Date.now()) {
  if (!handoffMeta || typeof handoffMeta !== "object") return 0;
  const stamp = handoffMeta.flushedAt || handoffMeta.shutdownFlushedAt || handoffMeta.at;
  return downtimeMsFromSavedAt(stamp, now);
}

function restoreDowntimeMs(payload: PersistedState | null | undefined, options: { downtimeMs?: number; handoffMeta?: HandoffMeta | null } = {}, now = api.shotClockTime.now()) {
  if (options.downtimeMs != null) return Math.max(0, Math.floor(Number(options.downtimeMs) || 0));
  if (options.handoffMeta) return handoffPadMs(options.handoffMeta, now);
  if (api.usingRedis()) return 0;
  return downtimeMsFromSavedAt(payload?.savedAt || payload?.shutdownFlushedAt, now);
}

function clearRoomDormancy(room: Room | null | undefined) {
  clearTimer(room?.dormantTimer);
  if (!room) return;
  room.dormantTimer = null;
  room.dormantSince = null;
}

function isSettledMoneyRoom(room: Room) {
  return Boolean(room?.moneyMode && room.phase === "gameover" && !(room.players || []).length);
}

function roomCleanupTtlMs(room: Room) {
  return isSettledMoneyRoom(room) ? api.SETTLED_MONEY_ROOM_TTL_MS : api.DORMANT_ROOM_TTL_MS;
}

function scheduleDormantRoomCleanup(room: Room) {
  clearTimer(room?.dormantTimer);
  if (!room || room.players.some((player) => !player.isBot)) {
    clearRoomDormancy(room);
    return;
  }
  if (!room.dormantSince) room.dormantSince = Date.now();
  const remaining = Math.max(0, roomCleanupTtlMs(room) - (Date.now() - room.dormantSince));
  room.dormantTimer = setTimeout(() => {
    const current = api.rooms.get(room.id);
    if (!current || current.players.some((player) => !player.isBot)) return;
    api.clearComputerTurn(current);
    clearTimer(current.showdownTimer);
    api.clearTurnTimer(current);
    api.clearReadyTimer(current);
    clearSpectators(current);
    clearTimer(current.dormantTimer);
    api.rooms.delete(current.id);
    scheduleSave();
  }, remaining);
  scheduleSave();
}

function preserveSettledMoneyRoom(room: Room) {
  if (!room?.moneyMode) return;
  api.clearComputerTurn(room);
  clearTimer(room.showdownTimer);
  api.clearTurnTimer(room);
  api.clearReadyTimer(room);
  clearSpectators(room);
  room.botTimer = null;
  room.showdownTimer = null;
  room.hostId = null;
  room.deck = [];
  room.community = [];
  room.turn = null;
  room.currentBet = 0;
  room.minRaise = api.currentBlinds(room).bigBlind;
  room.deadPot = 0;
  room.acted = new Set();
  room.raiseEligible = new Set();
  room.winners = [];
  room.actionLog = [];
  room.players = [];
  room.spectators = [];
  room.status = "complete";
  room.phase = "gameover";
  room.settlements = api.optimizeSettlements(room.moneyLedger || []);
  room.message = "Money game ended. Reopen this room code to view settle-up.";
  clearRoomDormancy(room);
  scheduleDormantRoomCleanup(room);
}

function restorePlayer(raw: StoredPlayer | Record<string, unknown>): Player {
  const data = raw as StoredPlayer;
  return {
    id: String(data.id),
    reconnectTokenHash: data.reconnectTokenHash || null,
    socketIds: new Set(),
    name: api.cleanName(data.name),
    color: api.cleanPlayerColor(data.color),
    stack: Math.max(0, Math.floor(Number(data.stack) || 0)),
    hand: Array.isArray(data.hand) ? data.hand : [],
    folded: Boolean(data.folded),
    allIn: Boolean(data.allIn),
    bet: Math.max(0, Math.floor(Number(data.bet) || 0)),
    invested: Math.max(0, Math.floor(Number(data.invested) || 0)),
    showCards: Boolean(data.showCards),
    ready: Boolean(data.ready),
    sittingOut: Boolean(data.sittingOut),
    disconnectExpiresAt: null,
    connected: Boolean(data.isBot),
    isBot: Boolean(data.isBot),
    replacedPlayerId: data.replacedPlayerId || null,
    replacedPlayerName: data.replacedPlayerName || null,
    replacedPlayerColor: api.cleanPlayerColor(data.replacedPlayerColor),
    replacedReconnectTokenHash: data.replacedReconnectTokenHash || null,
    buyInsCents: Math.max(0, Math.floor(Number(data.buyInsCents) || 0)),
    cashOutCents: Math.max(0, Math.floor(Number(data.cashOutCents) || 0)),
    preflopShoveStreak: Math.max(0, Math.floor(Number(data.preflopShoveStreak) || 0)),
    // Legacy rooms have no tag → computerProfile falls back to the seat-number style.
    botProfile: data.isBot && typeof data.botProfile === "string" ? data.botProfile : null,
    disconnectTimer: null,
  };
}

function markRestoredHumanAsBot(room: Room, player: Player) {
  const oldId = player.id;
  const oldName = player.name;
  const botNumber = api.nextBotNumber(room);
  player.id = `bot:${room.id}:${botNumber}`;
  player.name = api.computerName(player);
  player.isBot = true;
  api.assignComputerProfile(room, player);
  player.connected = true;
  player.replacedPlayerId = oldId;
  player.replacedPlayerName = oldName;
  player.replacedPlayerColor = player.color || null;
  player.replacedReconnectTokenHash = player.reconnectTokenHash || null;
  player.reconnectTokenHash = null;
  player.color = null;
  if (room.turn === oldId) room.turn = player.id;
  replaceActedId(room, oldId, player.id);
  replaceRaiseEligibleId(room, oldId, player.id);
}

function restoreRoom(raw: StoredRoom | Record<string, unknown>): Room | null {
  const data = raw as StoredRoom;
  const room: Room = {
    id: String(data.id || api.makeId()).toUpperCase(),
    hostId: data.hostId || null,
    tableSize: api.cleanTableSize(data.tableSize),
    status: data.status || "lobby",
    phase: data.phase || "lobby",
    deck: Array.isArray(data.deck) ? data.deck : [],
    community: Array.isArray(data.community) ? data.community : [],
    dealer: Math.max(0, Math.floor(Number(data.dealer) || 0)),
    smallBlindPlayerId: data.smallBlindPlayerId || null,
    bigBlindPlayerId: data.bigBlindPlayerId || null,
    turn: data.turn || null,
    currentBet: Math.max(0, Math.floor(Number(data.currentBet) || 0)),
    minRaise: Math.max(1, Math.floor(Number(data.minRaise) || api.DEFAULT_BIG_BLIND)),
    deadPot: Math.max(0, Math.floor(Number(data.deadPot) || 0)),
    acted: new Set(Array.isArray(data.acted) ? data.acted : []),
    raiseEligible: new Set(Array.isArray(data.raiseEligible) ? data.raiseEligible : []),
    message: data.message || "Room restored after update.",
    winners: Array.isArray(data.winners) ? data.winners : [],
    actionLog: Array.isArray(data.actionLog) ? data.actionLog : [],
    riverAggressor: data.riverAggressor || null,
    allInCardsExposed: Boolean(data.allInCardsExposed),
    handNumber: Math.max(0, Math.floor(Number(data.handNumber) || 0)),
    moneyMode: Boolean(data.moneyMode),
    moneyUnitCents: data.moneyUnitCents === 1 ? 1 : null,
    buyInCents: api.cleanMoneyCents(data.buyInCents, api.DEFAULT_BUY_IN_CENTS),
    baseSmallBlind: Math.max(1, Math.floor(Number(data.baseSmallBlind) || api.DEFAULT_SMALL_BLIND)),
    baseBigBlind: Math.max(2, Math.floor(Number(data.baseBigBlind) || api.DEFAULT_BIG_BLIND)),
    turnTimeLimitMs: api.normalizeShotClockMs(data.turnTimeLimitMs, api.SHOT_CLOCK_DEFAULT_MS),
    readyTimeLimitMs: api.normalizeReadyTimerMs(data.readyTimeLimitMs, api.READY_TIMER_DEFAULT_MS),
    autoTimerDefaults: Boolean(data.autoTimerDefaults),
    shotClockSetByHost: Boolean(data.shotClockSetByHost),
    readyTimerSetByHost: Boolean(data.readyTimerSetByHost),
    settlements: Array.isArray(data.settlements) ? data.settlements : [],
    moneyLedger: Array.isArray(data.moneyLedger)
      ? data.moneyLedger.map((entry) => ({
          playerId: String(entry.playerId),
          name: api.cleanName(entry.name),
          buyInsCents: Math.max(0, Math.floor(Number(entry.buyInsCents) || 0)),
          cashOutCents: Math.max(0, Math.floor(Number(entry.cashOutCents) || 0)),
        }))
      : [],
    players: Array.isArray(data.players) ? data.players.map(restorePlayer) : [],
    // Spectators are never persisted; reconnecting watchers rejoin via room:watch.
    spectators: [],
    botTimer: null,
    showdownTimer: null,
    turnTimer: null,
    readyTimer: null,
    // Absolute deadlines persist across process restart; timeout handles are re-armed below.
    turnEndsAt: Number(data.turnEndsAt) || null,
    turnTimerPlayerId: data.turnTimerPlayerId ? String(data.turnTimerPlayerId) : null,
    readyEndsAt: Number(data.readyEndsAt) || null,
    dormantSince: Number(data.dormantSince) || null,
    dormantTimer: null,
    // Legacy rooms have neither field: setting on, nothing revealed.
    ...(data.rabbitHuntEnabled === false ? { rabbitHuntEnabled: false } : {}),
    rabbitCards: Array.isArray(data.rabbitCards)
      ? data.rabbitCards.filter((card) => typeof card === "string").slice(0, 5)
      : null,
  };

  for (const player of room.players) {
    if (player.isBot) player.name = api.computerName(player);
    if (room.moneyMode) api.syncPlayerToMoneyLedger(room, player);
  }

  dedupePlayersById(room);
  assignMissingPlayerColors(room);

  if (room.tableSize && !room.moneyMode) {
    for (const player of room.players) {
      if (!player.isBot) markRestoredHumanAsBot(room, player);
    }
    api.addComputerPlayers(room, room.tableSize);
    if (!room.players.some((player) => player.id === room.hostId && !player.isBot))
      chooseNextHost(room);
  }

  if (!room.players.length) {
    if (room.moneyMode && ((room.moneyLedger?.length ?? 0) > 0 || room.phase === "gameover")) {
      room.status = "complete";
      room.phase = "gameover";
      room.hostId = null;
      room.settlements =
        Array.isArray(data.settlements) && data.settlements.length
          ? room.settlements
          : api.optimizeSettlements(room.moneyLedger || []);
      return room;
    }
    return null;
  }
  if (!Array.isArray(data.raiseEligible) && api.isHandInProgress(room)) {
    room.raiseEligible = new Set(
      api
        .canActPlayers(room)
        .filter((player) => !room.acted.has(player.id))
        .map((player) => player.id),
    );
  }
  if (room.dealer >= room.players.length) room.dealer = 0;
  return room;
}

function dedupePlayersById(room: Room) {
  const lastIndexById = new Map();
  for (let index = 0; index < room.players.length; index += 1) {
    lastIndexById.set(room.players[index].id, index);
  }
  if (lastIndexById.size === room.players.length) return false;

  const dealerId = room.players[room.dealer]?.id || null;
  room.players = room.players.filter((player, index) => lastIndexById.get(player.id) === index);
  if (dealerId) room.dealer = room.players.findIndex((player) => player.id === dealerId);
  if (room.dealer < 0 || room.dealer >= room.players.length) room.dealer = 0;
  return true;
}

function assignMissingPlayerColors(room: Room) {
  for (const player of room.players) {
    if (player.isBot) {
      player.color = null;
    } else if (!player.color) {
      player.color = api.defaultPlayerColor(room);
    }
  }
}

function activateRoom(room: Room, { scheduleSaveAfter = true }: { scheduleSaveAfter?: boolean } = {}) {
  if (!room) return;
  scheduleDormantRoomCleanup(room);
  if (room.phase === "showdown") scheduleShowdown(room);
  api.scheduleHumanTurnTimer(room);
  api.scheduleReadyTimer(room);
  api.scheduleComputerTurn(room);
  if (scheduleSaveAfter) scheduleSave();
}

function clearRoomRuntime(room: Room) {
  if (!room) return;
  pauseRoomTimers(room);
  api.clearComputerTurn(room);
  clearTimer(room.showdownTimer);
  api.clearTurnTimer(room);
  api.clearReadyTimer(room);
  clearTimer(room.dormantTimer);
  room.dormantTimer = null;
}

function applyRoomsPayload(payload: PersistedState | null | undefined, options: { downtimeMs?: number; handoffMeta?: HandoffMeta | null; replaceNonLive?: boolean; activate?: boolean; markLive?: boolean } = {}) {
  if (!payload || !Array.isArray(payload.rooms)) return { restored: 0, downtimeMs: 0 };
  const replaceNonLive = options.replaceNonLive === true;
  const activate = options.activate !== false;
  const markLive = options.markLive === true;
  const downtimeMs = restoreDowntimeMs(payload, options);
  const incomingIds = new Set();

  for (const rawRoom of payload.rooms) {
    const id = String(rawRoom?.id || "").toUpperCase();
    if (!id) continue;
    incomingIds.add(id);
    if (replaceNonLive && api.liveRoomIds.has(id)) continue;

    if (replaceNonLive) {
      const existing = api.rooms.get(id);
      if (existing) clearRoomRuntime(existing);
    } else if (api.rooms.has(id)) {
      continue;
    }

    const room = restoreRoom(rawRoom);
    if (!room) continue;
    extendDeadlinesAfterRestore(room, downtimeMs);
    api.rooms.set(room.id, room);
    if (markLive) api.liveRoomIds.add(room.id);
    if (activate) activateRoom(room, { scheduleSaveAfter: false });
  }

  if (replaceNonLive) {
    for (const id of [...api.rooms.keys()]) {
      if (api.liveRoomIds.has(id)) continue;
      if (incomingIds.has(id)) continue;
      const existing = api.rooms.get(id);
      if (existing) clearRoomRuntime(existing);
      api.rooms.delete(id);
    }
  }

  return { restored: api.rooms.size, downtimeMs };
}

async function loadFilePayloadForMigration() {
  const fileStore = createFileStateStore(api.STATE_FILE);
  return fileStore.load();
}

async function loadRooms(options: { activate?: boolean; markLive?: boolean } = {}) {
  const store = api.getStateStore();
  let payload;
  let migratedFromFile = false;
  try {
    payload = await store.load();
    if (
      (!payload || !Array.isArray(payload.rooms) || payload.rooms.length === 0) &&
      api.usingRedis()
    ) {
      const filePayload = await loadFilePayloadForMigration();
      if (filePayload && Array.isArray(filePayload.rooms) && filePayload.rooms.length > 0) {
        payload = filePayload;
        await store.save(payload);
        migratedFromFile = true;
        console.log(
          `Migrated ${filePayload.rooms.length} room(s) from ${api.STATE_FILE} into Redis`,
        );
      }
    }
  } catch (error) {
    console.error("Failed to load game state:", error);
    return { ok: false, error };
  }

  // Redis boot: keep api.rooms passive until handoff/live activity so we don't fight the old replica.
  const activate = options.activate ?? (!api.usingRedis() || api.handoffComplete);
  const markLive = options.markLive ?? !api.usingRedis();
  const { restored, downtimeMs } = applyRoomsPayload(payload, { activate, markLive });
  if (restored > 0) {
    const source = api.usingRedis()
      ? migratedFromFile
        ? "Redis (migrated from file)"
        : "Redis"
      : api.STATE_FILE;
    console.log(
      `Restored ${restored} room(s) from ${source}${downtimeMs ? ` (+${downtimeMs}ms timer pad)` : ""}`,
    );
  }
  return { ok: true, restored, downtimeMs, migratedFromFile };
}

async function refreshNonLiveRoomsFromStore(options: { downtimeMs?: number; handoffMeta?: HandoffMeta | null } = {}) {
  if (!api.usingRedis()) return { ok: true, refreshed: 0 };
  try {
    const payload = await api.getStateStore().load();
    const before = api.rooms.size;
    applyRoomsPayload(payload, {
      replaceNonLive: true,
      activate: true,
      markLive: false,
      downtimeMs: options.downtimeMs,
      handoffMeta: options.handoffMeta,
    });
    return { ok: true, refreshed: api.rooms.size, before };
  } catch (error) {
    console.error("Failed to refresh rooms after handoff:", error);
    return { ok: false, error };
  }
}

function makeRoom(hostId: string, hostName: string, socketId: string, tableSize = 0, options: Record<string, unknown> = {}): Room {
  let id = api.makeId();
  while (api.rooms.has(id)) id = api.makeId();
  const moneyMode = Boolean(options.moneyMode);
  const buyInCents = api.cleanMoneyCents(options.buyInCents, api.DEFAULT_BUY_IN_CENTS);
  const baseSmallBlind = cleanBlind(options.smallBlind, api.DEFAULT_SMALL_BLIND);
  const baseBigBlind = cleanBlind(options.bigBlind, api.DEFAULT_BIG_BLIND);
  const room: Room = {
    id,
    hostId,
    tableSize: moneyMode ? 0 : api.cleanTableSize(tableSize),
    status: "lobby",
    phase: "lobby",
    deck: [],
    community: [],
    dealer: 0,
    smallBlindPlayerId: null,
    bigBlindPlayerId: null,
    turn: null,
    currentBet: 0,
    minRaise: baseBigBlind,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(),
    message: "Invite friends with this room link.",
    winners: [],
    actionLog: [],
    riverAggressor: null,
    allInCardsExposed: false,
    handNumber: 0,
    moneyMode,
    moneyUnitCents: moneyMode ? 1 : null,
    buyInCents,
    baseSmallBlind,
    baseBigBlind,
    turnTimeLimitMs: api.SHOT_CLOCK_DEFAULT_MS,
    readyTimeLimitMs: api.READY_TIMER_DEFAULT_MS,
    autoTimerDefaults: true,
    shotClockSetByHost: false,
    readyTimerSetByHost: false,
    settlements: [],
    moneyLedger: [],
    dormantSince: null,
    dormantTimer: null,
    turnTimer: null,
    turnEndsAt: null,
    turnTimerPlayerId: null,
    readyTimer: null,
    readyEndsAt: null,
    // Spectators are in-memory only — never written to api.rooms.json.
    spectators: [],
    players: [
      {
        id: hostId,
        reconnectTokenHash: (options.reconnectTokenHash as string | null | undefined) || null,
        socketIds: new Set([socketId]),
        name: hostName,
        color: api.PLAYER_COLORS[0],
        stack: moneyMode ? buyInCents : api.STARTING_STACK,
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
        replacedPlayerId: null,
        replacedPlayerName: null,
        replacedPlayerColor: null,
        replacedReconnectTokenHash: null,
        buyInsCents: moneyMode ? buyInCents : 0,
        cashOutCents: 0,
        preflopShoveStreak: 0,
        disconnectExpiresAt: null,
        disconnectTimer: null,
      },
    ],
  };
  api.rooms.set(id, room);
  if (moneyMode) api.syncPlayerToMoneyLedger(room, room.players[0]);
  return room;
}

function getRoom(roomId: string): Room | undefined {
  return api.rooms.get(String(roomId || "").toUpperCase());
}

function cleanDeviceId(deviceId: unknown, fallback: string) {
  return (
    String(deviceId || fallback || "")
      .trim()
      .slice(0, 80) || fallback
  );
}

function cleanBlind(value: unknown, fallback: number) {
  const blind = Math.floor(Number(value));
  return Number.isFinite(blind) && blind > 0 ? Math.min(100000, blind) : fallback;
}

function makeHumanPlayer(room: Room, { id, socketId, name, reconnectTokenHash }: { id: string; socketId: string; name: string; reconnectTokenHash: string }) {
  const player = api.makePlayer({ id, socketId, name });
  player.reconnectTokenHash = reconnectTokenHash || null;
  player.color = api.defaultPlayerColor(room);
  if (room.moneyMode) {
    player.stack = api.centsToChips(room, room.buyInCents);
    api.addMoneyBuyIn(room, player, room.buyInCents);
    // Keep late arrivals out of every betting and payout calculation until the next deal.
    player.folded = api.isHandInProgress(room);
  }
  return player;
}

function attachSocketToPlayer(socket: { id: string; join: (roomId: string) => void }, room: Room, player: Player) {
  if (!player.socketIds) player.socketIds = new Set();
  clearTimer(player.disconnectTimer);
  player.disconnectTimer = null;
  player.disconnectExpiresAt = null;
  player.backgroundedUntil = null;
  player.socketIds.add(socket.id);
  player.connected = true;
  if (!player.isBot) clearRoomDormancy(room);
  api.socketRoom.set(socket.id, room.id);
  api.socketPlayer.set(socket.id, player.id);
  socket.join(room.id);
}

function ensureSpectators(room: Room) {
  if (!Array.isArray(room.spectators)) room.spectators = [];
  return room.spectators;
}

function findSpectator(room: Room, spectatorId: string) {
  return ensureSpectators(room).find((item) => item.id === spectatorId) || null;
}

function watchingCount(room: Room) {
  return ensureSpectators(room).filter((item) => item.connected).length;
}

function roomSeatCap(room: Room) {
  return room.tableSize || api.MAX_PLAYERS;
}

function roomIsFull(room: Room) {
  if (room.players.some((player) => player.isBot)) return false;
  return room.players.length >= roomSeatCap(room);
}

function canTakeSeatNow(room: Room) {
  if (!room || room.phase === "gameover") return false;
  if (roomIsFull(room)) return false;
  const botSeat = room.players.find((player) => player.isBot);
  if (botSeat) {
    if (api.isHandInProgress(room)) return false;
    return true;
  }
  if (!room.moneyMode && room.phase !== "lobby" && room.phase !== "complete") {
    return false;
  }
  return room.players.length < roomSeatCap(room);
}

function makeSpectator({ id, socketId, name, reconnectTokenHash }: { id: string; socketId: string; name: string; reconnectTokenHash: string }) {
  return {
    id,
    name: api.cleanName(name),
    reconnectTokenHash: reconnectTokenHash || null,
    socketIds: new Set(socketId ? [socketId] : []),
    connected: Boolean(socketId),
    disconnectExpiresAt: null,
    disconnectTimer: null,
    backgroundedUntil: null,
  };
}

function attachSocketToSpectator(socket: { id: string; join: (roomId: string) => void }, room: Room, spectator: Spectator) {
  if (!spectator.socketIds) spectator.socketIds = new Set();
  clearTimer(spectator.disconnectTimer);
  spectator.disconnectTimer = null;
  spectator.disconnectExpiresAt = null;
  spectator.backgroundedUntil = null;
  spectator.socketIds.add(socket.id);
  spectator.connected = true;
  api.socketRoom.set(socket.id, room.id);
  api.socketPlayer.set(socket.id, spectator.id);
  socket.join(room.id);
}

function removeSpectator(room: Room, spectator: Spectator) {
  if (!room || !spectator) return;
  clearTimer(spectator.disconnectTimer);
  spectator.disconnectTimer = null;
  const list = ensureSpectators(room);
  const index = list.findIndex((item) => item.id === spectator.id);
  if (index >= 0) list.splice(index, 1);
  for (const socketId of spectator.socketIds || []) {
    detachSocketFromRoom(socketId, room.id);
  }
  spectator.socketIds = new Set();
  spectator.connected = false;
}

function clearSpectators(room: Room) {
  if (!room) return;
  for (const spectator of [...ensureSpectators(room)]) {
    removeSpectator(room, spectator);
  }
}

function replaceActedId(room: Room, oldId: string, newId: string) {
  if (!room.acted?.has(oldId)) return;
  room.acted.delete(oldId);
  room.acted.add(newId);
}

function replaceRaiseEligibleId(room: Room, oldId: string, newId: string) {
  if (!room.raiseEligible?.has(oldId)) return;
  room.raiseEligible.delete(oldId);
  room.raiseEligible.add(newId);
}

function convertBotToHuman(socket: { id: string; join: (roomId: string) => void }, room: Room, bot: Player, playerId: string, name: string, reconnectTokenHash: string | null | undefined) {
  const oldId = bot.id;
  const hadHumanBefore = room.players.some((player) => !player.isBot);
  bot.id = playerId;
  bot.reconnectTokenHash = reconnectTokenHash || bot.replacedReconnectTokenHash || null;
  bot.name = api.cleanName(name);
  bot.color = bot.replacedPlayerColor || api.defaultPlayerColor(room);
  bot.isBot = false;
  bot.botProfile = null;
  bot.replacedPlayerId = null;
  bot.replacedPlayerName = null;
  bot.replacedPlayerColor = null;
  bot.replacedReconnectTokenHash = null;
  bot.connected = true;
  bot.socketIds = new Set();
  bot.disconnectTimer = null;
  if (room.turn === oldId) room.turn = playerId;
  if (room.hostId === oldId || !hadHumanBefore) room.hostId = playerId;
  replaceActedId(room, oldId, playerId);
  replaceRaiseEligibleId(room, oldId, playerId);
  attachSocketToPlayer(socket, room, bot);
  room.message = `${bot.name} took over a CPU seat.`;
  return bot;
}

function convertHumanToBot(room: Room, player: Player) {
  const oldId = player.id;
  const oldName = player.name;
  const botNumber = api.nextBotNumber(room);
  player.id = `bot:${room.id}:${botNumber}`;
  player.name = api.computerName(player);
  player.replacedPlayerId = oldId;
  player.replacedPlayerName = oldName;
  player.replacedPlayerColor = player.color || null;
  player.replacedReconnectTokenHash = player.reconnectTokenHash || null;
  player.reconnectTokenHash = null;
  player.color = null;
  player.socketIds = new Set();
  player.connected = true;
  player.isBot = true;
  api.assignComputerProfile(room, player);
  clearTimer(player.disconnectTimer);
  player.disconnectTimer = null;
  player.disconnectExpiresAt = null;
  if (room.turn === oldId) room.turn = player.id;
  replaceActedId(room, oldId, player.id);
  replaceRaiseEligibleId(room, oldId, player.id);
  if (room.hostId === oldId) chooseNextHost(room);
  room.message = `${player.name} took over ${oldName}'s seat.`;
  scheduleDormantRoomCleanup(room);
  return player;
}

function endGame(room: Room) {
  api.clearTurnTimer(room);
  api.clearReadyTimer(room);
  if (room.moneyMode) {
    api.settleMoneyGame(room);
    api.resetHandState(room);
    room.status = "complete";
    room.phase = "gameover";
    room.turn = null;
    room.actionLog = [];
    room.message = "Money game ended. Settle up from the final screen.";
    return;
  }

  if (api.isHandInProgress(room)) {
    for (const player of room.players) {
      player.stack += player.invested;
    }
  }

  api.resetHandState(room);
  room.status = "lobby";
  room.phase = "lobby";
  room.turn = null;
  room.message = "Game ended by host.";
  room.actionLog = [];
}

function restartGame(room: Room) {
  api.clearComputerTurn(room);
  clearTimer(room.showdownTimer);
  api.clearTurnTimer(room);
  api.clearReadyTimer(room);
  room.showdownTimer = null;
  if (room.moneyMode) room.moneyLedger = [];
  for (const player of room.players) {
    player.stack = api.STARTING_STACK;
    player.buyInsCents = room.moneyMode ? room.buyInCents : 0;
    player.cashOutCents = 0;
    player.hand = [];
    player.folded = false;
    player.allIn = false;
    player.bet = 0;
    player.invested = 0;
    player.showCards = false;
    player.ready = false;
    if (room.moneyMode) api.syncPlayerToMoneyLedger(room, player);
  }
  room.status = "lobby";
  room.phase = "lobby";
  room.deck = [];
  room.community = [];
  room.dealer = 0;
  room.smallBlindPlayerId = null;
  room.bigBlindPlayerId = null;
  room.turn = null;
  room.currentBet = 0;
  room.handNumber = 0;
  room.minRaise = api.currentBlinds(room).bigBlind;
  room.deadPot = 0;
  room.acted = new Set();
  room.raiseEligible = new Set();
  room.winners = [];
  room.settlements = [];
  room.actionLog = [];
  room.riverAggressor = null;
  room.allInCardsExposed = false;
  room.message = "Game restarted. Start a new hand when ready.";
}

function setPlayerColor(room: Room, playerId: string, color: string) {
  const player = room?.players.find((item) => item.id === playerId);
  const nextColor = api.cleanPlayerColor(color);
  if (!room || !player) return { ok: false, error: "Player not found." };
  if (player.isBot) return { ok: false, error: "CPU players cannot choose colors." };
  if (!nextColor) return { ok: false, error: "Unknown color." };
  player.color = nextColor;
  return { ok: true };
}

function setPlayerName(room: Room, playerId: string, name: string) {
  const player = room?.players.find((item) => item.id === playerId);
  if (!room || !player) return { ok: false, error: "Player not found." };
  if (player.isBot) return { ok: false, error: "CPU players cannot change names." };
  player.name = api.cleanName(name);
  room.message = `${player.name} updated their name.`;
  return { ok: true };
}

function hasConnectedHuman(room: Room) {
  return room.players.some((player) => !player.isBot && player.connected);
}

function serializeRoom(room: Room, viewerId: string) {
  dedupePlayersById(room);
  const pot = api.collectPot(room);
  const viewer = room.players.find((player) => player.id === viewerId);
  // Spectator viewers have no seat: reuse api.visibleHoleCards / sanitizeActionLog with a non-player id.
  const isSpectator = Boolean(!viewer && findSpectator(room, viewerId));
  const toCall =
    viewer && !viewer.folded && !viewer.allIn ? Math.max(0, room.currentBet - viewer.bet) : 0;
  const minRaiseTo = room.currentBet + room.minRaise;
  const { smallBlind, bigBlind } = api.currentBlinds(room);
  const viewerMaxBet = viewer ? viewer.bet + viewer.stack : 0;
  const raiseOpen = Boolean(viewer && room.raiseEligible?.has(viewer.id));

  return {
    id: room.id,
    hostId: room.hostId,
    status: room.status,
    phase: room.phase,
    buildId: api.BUILD_ID,
    updatingAfterHand: api.holdNewHands,
    tableSize: room.tableSize || room.players.length,
    message: room.message,
    pot,
    potCents: api.chipsToCents(room, pot),
    currentBet: room.currentBet,
    currentBetCents: api.chipsToCents(room, room.currentBet),
    minRaise: room.minRaise,
    minRaiseTo,
    minRaiseToCents: api.chipsToCents(room, minRaiseTo),
    smallBlind,
    bigBlind,
    smallBlindCents: api.chipsToCents(room, smallBlind),
    bigBlindCents: api.chipsToCents(room, bigBlind),
    playerColors: api.PLAYER_COLORS,
    handNumber: room.handNumber,
    moneyMode: Boolean(room.moneyMode),
    buyInCents: room.buyInCents,
    chipValueCents: api.chipValueCents(room),
    settlements: room.settlements || [],
    ledger: room.moneyMode
      ? (room.moneyLedger || []).map((entry) => ({
          ...entry,
          netCents: entry.cashOutCents - entry.buyInsCents,
          isYou: entry.playerId === viewerId,
          color: room.players.find((player) => player.id === entry.playerId)?.color || null,
        }))
      : [],
    turn: room.turn,
    isYourTurn: Boolean(viewer) && room.turn === viewerId,
    // Full min-raise is possible. Short all-in shoves still use raiseOpen via canShove.
    canRaise: raiseOpen && viewerMaxBet >= minRaiseTo,
    canShove: raiseOpen && viewerMaxBet > room.currentBet,
    canCashIn: api.playerCanCashIn(room, viewer),
    toCall,
    toCallCents: api.chipsToCents(room, toCall),
    canShowHand:
      Boolean(viewer) &&
      room.phase === "complete" &&
      Boolean(viewer?.hand?.length) &&
      !viewer?.showCards,
    canStart: false,
    canNextHand: false,
    canReady: Boolean(
      viewer &&
      !viewer.isBot &&
      viewer.stack > 0 &&
      !viewer.sittingOut &&
      api.canReadyForHand(room) &&
      api.playersWithChips(room).filter((player) => !player.sittingOut).length >= 2,
    ),
    isReady: Boolean(viewer?.ready),
    isSpectator,
    watchingCount: watchingCount(room),
    canTakeSeat: isSpectator && canTakeSeatNow(room),
    canChangeBlinds: Boolean(viewer) && room.hostId === viewerId && api.canReadyForHand(room),
    canChangeShotClock: Boolean(viewer) && room.hostId === viewerId,
    canChangeReadyTimer: Boolean(viewer) && room.hostId === viewerId,
    turnTimeLimitMs: api.normalizeShotClockMs(room.turnTimeLimitMs, api.SHOT_CLOCK_DEFAULT_MS),
    turnEndsAt: room.turnEndsAt || null,
    readyEndsAt: room.readyEndsAt || null,
    readyTimeLimitMs: api.normalizeReadyTimerMs(room.readyTimeLimitMs, api.READY_TIMER_DEFAULT_MS),
    serverNow: api.shotClockTime.now(),
    canRestartGame:
      Boolean(viewer) && room.hostId === viewerId && !room.moneyMode && api.canAdministerGame(room),
    canEndGame:
      Boolean(viewer) &&
      room.hostId === viewerId &&
      api.canAdministerGame(room) &&
      (room.moneyMode || room.phase !== "lobby"),
    canAddBot:
      Boolean(viewer) &&
      room.hostId === viewerId &&
      !room.moneyMode &&
      room.handNumber === 0 &&
      room.players.length < api.MAX_PLAYERS,
    bustedOut: api.humansBustedOut(room),
    canRebuy: Boolean(
      viewer && !viewer.isBot && viewer.stack <= 0 && api.humansBustedOut(room),
    ),
    rabbitHuntEnabled: api.rabbitHuntEnabled(room),
    canChangeRabbitHunt: Boolean(viewer) && room.hostId === viewerId,
    canRabbitHunt: Boolean(viewer) && api.canRabbitHunt(room),
    rabbitCards: api.visibleRabbitCards(room).map(api.publicCard),
    community: room.community.map(api.publicCard),
    winners: room.winners.map((winner) => ({
      ...winner,
      amountCents: api.chipsToCents(room, winner.amount),
    })),
    actionLog: api.sanitizeActionLogForClient(room.actionLog),
    allInCardsExposed: Boolean(room.allInCardsExposed),
    players: room.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      color: player.color || null,
      stack: player.stack,
      stackCents: api.chipsToCents(room, player.stack),
      buyInsCents: player.buyInsCents || 0,
      cashOutCents: player.cashOutCents || 0,
      netCents:
        (player.cashOutCents || 0) +
        api.chipsToCents(room, player.stack) -
        (player.buyInsCents || 0),
      bet: player.bet,
      betCents: api.chipsToCents(room, player.bet),
      invested: player.invested,
      investedCents: api.chipsToCents(room, player.invested),
      sittingOut: Boolean(player.sittingOut),
      waitingForNextHand:
        api.isHandInProgress(room) && player.hand.length === 0 && player.folded && player.stack > 0,
      folded: player.folded,
      allIn: player.allIn,
      connected: player.connected,
      isBot: player.isBot,
      ...api.botStyleView(player),
      showCards: Boolean(player.showCards),
      ready: Boolean(player.ready || player.isBot),
      disconnectExpiresAt: player.disconnectExpiresAt || null,
      isHost: player.id === room.hostId,
      dealer: index === room.dealer,
      isSmallBlind: Boolean(room.smallBlindPlayerId) && player.id === room.smallBlindPlayerId,
      isBigBlind: Boolean(room.bigBlindPlayerId) && player.id === room.bigBlindPlayerId,
      isTurn: room.turn === player.id,
      isYou: player.id === viewerId,
      canMakeHost:
        room.hostId === viewerId && player.id !== viewerId && !player.isBot && player.connected,
      canKick: room.hostId === viewerId && player.id !== viewerId && !api.isHandInProgress(room),
      cards: api.visibleHoleCards(player, viewerId),
    })),
  };
}

function scheduleShowdown(room: Room) {
  if (room.phase !== "showdown" || room.showdownTimer) return;
  const revealDelay = api.isSoloHumanFolded(room) ? 30 : api.SHOWDOWN_DELAY_MS;
  room.showdownTimer = setTimeout(() => {
    const currentRoom = api.rooms.get(room.id);
    if (!currentRoom || currentRoom.phase !== "showdown") return;
    api.settleShowdown(currentRoom);
    emitRoom(currentRoom);
  }, revealDelay);
}

function emitRoom(room: Room) {
  // Bot game (one human + CPU players) → timers Off unless the host set them.
  api.syncTimerDefaults(room);
  // Arm absolute clocks before serialize so clients receive turnEndsAt / readyEndsAt.
  api.scheduleHumanTurnTimer(room);
  api.scheduleReadyTimer(room);
  for (const player of room.players) {
    for (const socketId of player.socketIds || []) {
      api.io.to(socketId).emit("room:update", serializeRoom(room, player.id));
    }
  }
  for (const spectator of ensureSpectators(room)) {
    for (const socketId of spectator.socketIds || []) {
      api.io.to(socketId).emit("room:update", serializeRoom(room, spectator.id));
    }
  }
  scheduleSave();
  scheduleShowdown(room);
  api.scheduleComputerTurn(room);
}

function detachSocketFromRoom(socketId: string, roomId: string) {
  api.socketRoom.delete(socketId);
  api.socketPlayer.delete(socketId);
  api.io.sockets.sockets.get(socketId)?.leave(roomId);
}

function chooseNextHost(room: Room) {
  const nextHost = room.players.find((player) => !player.isBot) || room.players[0];
  room.hostId = nextHost?.id || null;
}

function transferHost(room: Room | null | undefined, currentHostId: string | undefined, nextHostId: string) {
  if (!room || room.hostId !== currentHostId)
    return { ok: false, error: "Only the host can make another player host." };
  if (currentHostId === nextHostId) return { ok: false, error: "You are already the host." };
  const nextHost = room.players.find((player) => player.id === nextHostId);
  if (!nextHost) return { ok: false, error: "Player not found." };
  if (nextHost.isBot) return { ok: false, error: "CPU players cannot be host." };
  if (!nextHost.connected) return { ok: false, error: "That player is away." };
  room.hostId = nextHost.id;
  room.message = `${nextHost.name} is now host.`;
  return { ok: true };
}

function removePlayerAfterDisconnect(room: Room, player: Player) {
  if (room.tableSize) {
    convertHumanToBot(room, player);
    emitRoom(room);
    return;
  }

  const index = api.playerIndex(room, player.id);
  if (index < 0 || player.connected) return;
  const wasTurn = room.turn === player.id;
  const isLastPlayer = room.players.length === 1;

  clearTimer(player.disconnectTimer);
  player.disconnectTimer = null;
  player.disconnectExpiresAt = null;
  if (room.moneyMode) {
    // Last seat leaving mid-hand: refund the pot into stack before cash-out so ledger balances.
    if (isLastPlayer && api.isHandInProgress(room) && player.invested > 0) {
      player.stack += player.invested;
      player.invested = 0;
      player.bet = 0;
    }
    if (player.stack > 0) {
      player.cashOutCents = (player.cashOutCents || 0) + api.chipsToCents(room, player.stack);
      player.stack = 0;
    }
    api.syncPlayerToMoneyLedger(room, player);
    room.settlements = api.optimizeSettlements(room.moneyLedger || []);
  }
  if (!(room.moneyMode && isLastPlayer)) {
    room.deadPot += player.invested;
  }
  player.bet = 0;
  player.invested = 0;
  player.folded = true;
  room.players.splice(index, 1);
  if (room.players.length === 0) {
    if (room.moneyMode) {
      preserveSettledMoneyRoom(room);
      return;
    }
    api.clearTurnTimer(room);
    api.clearReadyTimer(room);
    clearSpectators(room);
    api.rooms.delete(room.id);
    scheduleSave();
    return;
  }
  if (index < room.dealer) room.dealer -= 1;
  if (room.dealer >= room.players.length) room.dealer = 0;
  if (room.hostId === player.id) chooseNextHost(room);
  room.message = `${player.name} was removed after disconnecting.`;
  if (api.isHandInProgress(room)) {
    if (wasTurn) {
      const fromIndex = (index - 1 + room.players.length) % room.players.length;
      const next = api.nextIndex(
        room,
        fromIndex,
        (item: Player) => !item.folded && !item.allIn && item.stack > 0,
      );
      room.turn = next >= 0 ? room.players[next].id : null;
    }
    api.maybeAdvance(room);
  } else {
    tryStartReadyHand(room);
  }
  emitRoom(room);
}

function leaveCurrentRoom(socket: { id: string }, { removeAfterGrace = true, allowBackgroundGrace = true }: { removeAfterGrace?: boolean; allowBackgroundGrace?: boolean } = {}) {
  const roomId = api.socketRoom.get(socket.id);
  const playerId = api.socketPlayer.get(socket.id);
  if (!roomId) return;
  const room = api.rooms.get(roomId);
  if (!room) return;
  const player = room.players.find((item) => item.id === playerId);
  if (player?.socketIds) {
    player.socketIds.delete(socket.id);
    player.connected = player.socketIds.size > 0;
    if (!player.connected && !player.isBot) {
      if (!removeAfterGrace) {
        player.disconnectExpiresAt = null;
        if (room.tableSize) {
          convertHumanToBot(room, player);
        }
      } else {
        const wasRecentlyBackgrounded =
          allowBackgroundGrace && (player.backgroundedUntil ?? 0) > Date.now();
        const graceMs = wasRecentlyBackgrounded
          ? api.BACKGROUND_DISCONNECT_GRACE_MS
          : api.DISCONNECT_GRACE_MS;
        player.backgroundedUntil = null;
        player.disconnectExpiresAt = Date.now() + graceMs;
        clearTimer(player.disconnectTimer);
        player.disconnectTimer = setTimeout(() => {
          const latestRoom = api.rooms.get(room.id);
          const latestPlayer = latestRoom?.players.find((item) => item.id === player.id);
          if (latestRoom && latestPlayer && !latestPlayer.connected) {
            removePlayerAfterDisconnect(latestRoom, latestPlayer);
          }
        }, graceMs);
      }
    }
    detachSocketFromRoom(socket.id, room.id);
    emitRoom(room);
    return;
  }

  const spectator = playerId ? findSpectator(room, playerId) : null;
  if (spectator?.socketIds) {
    spectator.socketIds.delete(socket.id);
    spectator.connected = spectator.socketIds.size > 0;
    if (!spectator.connected) {
      if (!removeAfterGrace) {
        removeSpectator(room, spectator);
      } else {
        const wasRecentlyBackgrounded =
          allowBackgroundGrace && (spectator.backgroundedUntil ?? 0) > Date.now();
        const graceMs = wasRecentlyBackgrounded
          ? api.BACKGROUND_DISCONNECT_GRACE_MS
          : api.DISCONNECT_GRACE_MS;
        spectator.backgroundedUntil = null;
        spectator.disconnectExpiresAt = Date.now() + graceMs;
        clearTimer(spectator.disconnectTimer);
        spectator.disconnectTimer = setTimeout(() => {
          const latestRoom = api.rooms.get(room.id);
          const latestSpectator = latestRoom ? findSpectator(latestRoom, spectator.id) : null;
          if (latestRoom && latestSpectator && !latestSpectator.connected) {
            removeSpectator(latestRoom, latestSpectator);
            emitRoom(latestRoom);
          }
        }, graceMs);
      }
    }
  }
  detachSocketFromRoom(socket.id, room.id);
  emitRoom(room);
}

function kickPlayerFromRoom(room: Room, playerId: string) {
  const index = api.playerIndex(room, playerId);
  if (index < 0) return null;
  const [removed] = room.players.splice(index, 1);
  if (room.moneyMode) {
    removed.cashOutCents = (removed.cashOutCents || 0) + api.chipsToCents(room, removed.stack);
    removed.stack = 0;
    api.syncPlayerToMoneyLedger(room, removed);
    room.settlements = api.optimizeSettlements(room.moneyLedger || []);
  }
  if (room.tableSize) room.tableSize = room.players.length >= 2 ? room.players.length : 0;
  clearTimer(removed.disconnectTimer);
  for (const socketId of removed.socketIds || []) {
    api.io.to(socketId).emit("room:kicked");
    detachSocketFromRoom(socketId, room.id);
  }
  if (index < room.dealer) room.dealer -= 1;
  if (room.dealer >= room.players.length) room.dealer = 0;
  room.message = `${removed.name} was kicked from the table.`;
  return removed;
}

Object.assign(api, {
  claimRoomForLiveActivity,
  tryStartReadyHand,
  anyHandInProgress,
  waitForHandsToFinish,
  newReconnectCredentials,
  reconnectTokenMatches,
  serializePlayerForStorage,
  serializeRoomForStorage,
  buildRoomsPayload,
  saveRoomsNow,
  scheduleSave,
  pauseRoomTimers,
  pauseAllRoomTimers,
  extendDeadlinesAfterRestore,
  downtimeMsFromSavedAt,
  handoffPadMs,
  restoreDowntimeMs,
  clearRoomDormancy,
  isSettledMoneyRoom,
  roomCleanupTtlMs,
  scheduleDormantRoomCleanup,
  preserveSettledMoneyRoom,
  restorePlayer,
  markRestoredHumanAsBot,
  restoreRoom,
  dedupePlayersById,
  assignMissingPlayerColors,
  activateRoom,
  clearRoomRuntime,
  applyRoomsPayload,
  loadFilePayloadForMigration,
  loadRooms,
  refreshNonLiveRoomsFromStore,
  makeRoom,
  getRoom,
  cleanDeviceId,
  cleanBlind,
  makeHumanPlayer,
  attachSocketToPlayer,
  ensureSpectators,
  findSpectator,
  watchingCount,
  roomSeatCap,
  roomIsFull,
  canTakeSeatNow,
  makeSpectator,
  attachSocketToSpectator,
  removeSpectator,
  clearSpectators,
  replaceActedId,
  replaceRaiseEligibleId,
  convertBotToHuman,
  convertHumanToBot,
  endGame,
  restartGame,
  setPlayerColor,
  setPlayerName,
  hasConnectedHuman,
  serializeRoom,
  scheduleShowdown,
  emitRoom,
  detachSocketFromRoom,
  chooseNextHost,
  transferHost,
  removePlayerAfterDisconnect,
  leaveCurrentRoom,
  kickPlayerFromRoom,
});

export = {
  claimRoomForLiveActivity,
  tryStartReadyHand,
  anyHandInProgress,
  waitForHandsToFinish,
  newReconnectCredentials,
  reconnectTokenMatches,
  serializePlayerForStorage,
  serializeRoomForStorage,
  buildRoomsPayload,
  saveRoomsNow,
  scheduleSave,
  pauseRoomTimers,
  pauseAllRoomTimers,
  extendDeadlinesAfterRestore,
  downtimeMsFromSavedAt,
  handoffPadMs,
  restoreDowntimeMs,
  clearRoomDormancy,
  isSettledMoneyRoom,
  roomCleanupTtlMs,
  scheduleDormantRoomCleanup,
  preserveSettledMoneyRoom,
  restorePlayer,
  markRestoredHumanAsBot,
  restoreRoom,
  dedupePlayersById,
  assignMissingPlayerColors,
  activateRoom,
  clearRoomRuntime,
  applyRoomsPayload,
  loadFilePayloadForMigration,
  loadRooms,
  refreshNonLiveRoomsFromStore,
  makeRoom,
  getRoom,
  cleanDeviceId,
  cleanBlind,
  makeHumanPlayer,
  attachSocketToPlayer,
  ensureSpectators,
  findSpectator,
  watchingCount,
  roomSeatCap,
  roomIsFull,
  canTakeSeatNow,
  makeSpectator,
  attachSocketToSpectator,
  removeSpectator,
  clearSpectators,
  replaceActedId,
  replaceRaiseEligibleId,
  convertBotToHuman,
  convertHumanToBot,
  endGame,
  restartGame,
  setPlayerColor,
  setPlayerName,
  hasConnectedHuman,
  serializeRoom,
  scheduleShowdown,
  emitRoom,
  detachSocketFromRoom,
  chooseNextHost,
  transferHost,
  removePlayerAfterDisconnect,
  leaveCurrentRoom,
  kickPlayerFromRoom,
};
