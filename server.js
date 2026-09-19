const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const engine = require("./shared/engine");
const { customAlphabet } = require("nanoid");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const makeId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

const PORT = process.env.PORT || 3000;
const DEFAULT_BUY_IN_CENTS = 2000;
const {
  STARTING_STACK,
  BLIND_LEVELS,
  DEFAULT_BIG_BLIND,
  DEFAULT_SMALL_BLIND,
  MAX_PLAYERS,
  BOT_PROFILES,
  PLAYER_COLORS,
  setRandomInt,
  blindLevelForHand,
  currentBlinds,
  makeDeck,
  publicCard,
  cleanName,
  cleanComputerPlayers,
  cleanTableSize,
  cleanPlayerColor,
  defaultPlayerColor,
  makePlayer,
  computerProfile,
  computerName,
  addComputerPlayers,
  nextBotNumber,
  activePlayers,
  livePlayers,
  canActPlayers,
  nextIndex,
  playerIndex,
  postBlind,
  logAction,
  resetHandState,
  isHandInProgress,
  canAdministerGame,
  canReadyForHand,
  resetReadiness,
  maybeStartReadyHand,
  playersWithChips,
  maybeEndGame,
  startHand,
  startNextHand,
  dealStreet,
  bettingComplete,
  maybeAdvance,
  advanceTurn,
  collectPot,
  revealComputerHands,
  awardUncontested,
  buildSidePots,
  combineWinnerSummaries,
  settleShowdown,
  applyPlayerAction,
  showPlayerCards,
  cardRankValue,
  estimateComputerConfidence,
  chooseComputerRaiseTo,
  preflopBlindCallChance,
  preflopBlindRaiseChance,
  preflopHandScore,
  preflopShoveRange,
  estimatePreflopEquityAgainstRange,
  estimatePostflopEquity,
  estimateComputerEquity,
  currentPreflopAllInAggressor,
  assessPreflopAllInCall,
  chooseComputerAction,
  isSoloHumanFolded,
} = engine;

setRandomInt((maxExclusive) => crypto.randomInt(maxExclusive));
const DISCONNECT_GRACE_MS = Math.max(0, Number(process.env.DISCONNECT_GRACE_MS) || 30000);
const BACKGROUND_DISCONNECT_GRACE_MS = Math.max(
  DISCONNECT_GRACE_MS,
  Number(process.env.BACKGROUND_DISCONNECT_GRACE_MS) || 5 * 60 * 1000,
);
const BACKGROUND_PRESENCE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, ".data");
const STATE_FILE = process.env.GAME_STATE_FILE || path.join(DEFAULT_DATA_DIR, "rooms.json");
const SAVE_DEBOUNCE_MS = 150;
const SHOWDOWN_DELAY_MS = 1600;
const CPU_ACTION_DELAY_MS = 250;
const DORMANT_ROOM_TTL_MS = Math.max(60000, Number(process.env.DORMANT_ROOM_TTL_MS) || 60 * 60 * 1000);
/** Empty settled money rooms keep their ledger this long so players can reopen settle-up by room code. */
const SETTLED_MONEY_ROOM_TTL_MS = Math.max(
  DORMANT_ROOM_TTL_MS,
  Number(process.env.SETTLED_MONEY_ROOM_TTL_MS) || 48 * 60 * 60 * 1000,
);

app.use(express.static("public"));
app.use("/shared", express.static(path.join(__dirname, "shared")));

app.get("/qr.svg", async (req, res) => {
  const text = String(req.query.text || "").slice(0, 512);
  if (!text) return res.status(400).type("text/plain").send("Missing text");
  try {
    const svg = await QRCode.toString(text, {
      type: "svg",
      margin: 1,
      color: {
        dark: "#0f1619",
        light: "#f7f1e6",
      },
    });
    res.type("image/svg+xml").send(svg);
  } catch (error) {
    res.status(500).type("text/plain").send("Could not generate QR code");
  }
});

const rooms = new Map();
const socketRoom = new Map();
const socketPlayer = new Map();
let saveTimer = null;




function newReconnectCredentials() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: crypto.createHash("sha256").update(token).digest("hex") };
}

function reconnectTokenMatches(player, token) {
  if (!player?.reconnectTokenHash || !token) return false;
  const actual = crypto.createHash("sha256").update(String(token)).digest();
  const expected = Buffer.from(player.reconnectTokenHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}



function serializePlayerForStorage(player) {
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
  };
}

function serializeRoomForStorage(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    tableSize: room.tableSize || 0,
    status: room.status,
    phase: room.phase,
    deck: room.deck,
    community: room.community,
    dealer: room.dealer,
    turn: room.turn,
    currentBet: room.currentBet,
    minRaise: room.minRaise,
    deadPot: room.deadPot || 0,
    acted: [...(room.acted || [])],
    raiseEligible: [...(room.raiseEligible || [])],
    message: room.message,
    winners: room.winners,
    actionLog: room.actionLog,
    handNumber: room.handNumber,
    moneyMode: Boolean(room.moneyMode),
    moneyUnitCents: room.moneyUnitCents === 1 ? 1 : null,
    buyInCents: cleanMoneyCents(room.buyInCents, DEFAULT_BUY_IN_CENTS),
    baseSmallBlind: room.baseSmallBlind || DEFAULT_SMALL_BLIND,
    baseBigBlind: room.baseBigBlind || DEFAULT_BIG_BLIND,
    settlements: Array.isArray(room.settlements) ? room.settlements : [],
    moneyLedger: Array.isArray(room.moneyLedger) ? room.moneyLedger : [],
    dormantSince: room.dormantSince || null,
    players: room.players.map(serializePlayerForStorage),
  };
}

function saveRoomsNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    rooms: [...rooms.values()].map(serializeRoomForStorage),
  };
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      saveRoomsNow();
    } catch (error) {
      console.error("Failed to save game state:", error);
    }
  }, SAVE_DEBOUNCE_MS);
}

function clearRoomDormancy(room) {
  clearTimeout(room?.dormantTimer);
  if (!room) return;
  room.dormantTimer = null;
  room.dormantSince = null;
}

function isSettledMoneyRoom(room) {
  return Boolean(room?.moneyMode && room.phase === "gameover" && !(room.players || []).length);
}

function roomCleanupTtlMs(room) {
  return isSettledMoneyRoom(room) ? SETTLED_MONEY_ROOM_TTL_MS : DORMANT_ROOM_TTL_MS;
}

function scheduleDormantRoomCleanup(room) {
  clearTimeout(room?.dormantTimer);
  if (!room || room.players.some((player) => !player.isBot)) {
    clearRoomDormancy(room);
    return;
  }
  if (!room.dormantSince) room.dormantSince = Date.now();
  const remaining = Math.max(0, roomCleanupTtlMs(room) - (Date.now() - room.dormantSince));
  room.dormantTimer = setTimeout(() => {
    const current = rooms.get(room.id);
    if (!current || current.players.some((player) => !player.isBot)) return;
    clearTimeout(current.botTimer);
    clearTimeout(current.showdownTimer);
    clearTimeout(current.dormantTimer);
    rooms.delete(current.id);
    scheduleSave();
  }, remaining);
  scheduleSave();
}

/** Keep an emptied money room so anyone with the code can still read the ledger. */
function preserveSettledMoneyRoom(room) {
  if (!room?.moneyMode) return;
  clearTimeout(room.botTimer);
  clearTimeout(room.showdownTimer);
  room.botTimer = null;
  room.showdownTimer = null;
  room.hostId = null;
  room.deck = [];
  room.community = [];
  room.turn = null;
  room.currentBet = 0;
  room.minRaise = currentBlinds(room).bigBlind;
  room.deadPot = 0;
  room.acted = new Set();
  room.raiseEligible = new Set();
  room.winners = [];
  room.actionLog = [];
  room.players = [];
  room.status = "complete";
  room.phase = "gameover";
  room.settlements = optimizeSettlements(room.moneyLedger || []);
  room.message = "Money game ended. Reopen this room code to view settle-up.";
  clearRoomDormancy(room);
  scheduleDormantRoomCleanup(room);
}

function restorePlayer(raw) {
  return {
    id: String(raw.id),
    reconnectTokenHash: raw.reconnectTokenHash || null,
    socketIds: new Set(),
    name: cleanName(raw.name),
    color: cleanPlayerColor(raw.color),
    stack: Math.max(0, Math.floor(Number(raw.stack) || 0)),
    hand: Array.isArray(raw.hand) ? raw.hand : [],
    folded: Boolean(raw.folded),
    allIn: Boolean(raw.allIn),
    bet: Math.max(0, Math.floor(Number(raw.bet) || 0)),
    invested: Math.max(0, Math.floor(Number(raw.invested) || 0)),
    showCards: Boolean(raw.showCards),
    ready: Boolean(raw.ready),
    sittingOut: Boolean(raw.sittingOut),
    disconnectExpiresAt: null,
    connected: Boolean(raw.isBot),
    isBot: Boolean(raw.isBot),
    replacedPlayerId: raw.replacedPlayerId || null,
    replacedPlayerName: raw.replacedPlayerName || null,
    replacedPlayerColor: cleanPlayerColor(raw.replacedPlayerColor),
    replacedReconnectTokenHash: raw.replacedReconnectTokenHash || null,
    buyInsCents: Math.max(0, Math.floor(Number(raw.buyInsCents) || 0)),
    cashOutCents: Math.max(0, Math.floor(Number(raw.cashOutCents) || 0)),
    preflopShoveStreak: Math.max(0, Math.floor(Number(raw.preflopShoveStreak) || 0)),
    disconnectTimer: null,
  };
}

function markRestoredHumanAsBot(room, player) {
  const oldId = player.id;
  const oldName = player.name;
  const botNumber = nextBotNumber(room);
  player.id = `bot:${room.id}:${botNumber}`;
  player.name = computerName(player);
  player.isBot = true;
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

function restoreRoom(raw) {
  const room = {
    id: String(raw.id || makeId()).toUpperCase(),
    hostId: raw.hostId || null,
    tableSize: cleanTableSize(raw.tableSize),
    status: raw.status || "lobby",
    phase: raw.phase || "lobby",
    deck: Array.isArray(raw.deck) ? raw.deck : [],
    community: Array.isArray(raw.community) ? raw.community : [],
    dealer: Math.max(0, Math.floor(Number(raw.dealer) || 0)),
    turn: raw.turn || null,
    currentBet: Math.max(0, Math.floor(Number(raw.currentBet) || 0)),
    minRaise: Math.max(1, Math.floor(Number(raw.minRaise) || DEFAULT_BIG_BLIND)),
    deadPot: Math.max(0, Math.floor(Number(raw.deadPot) || 0)),
    acted: new Set(Array.isArray(raw.acted) ? raw.acted : []),
    raiseEligible: new Set(Array.isArray(raw.raiseEligible) ? raw.raiseEligible : []),
    message: raw.message || "Room restored after update.",
    winners: Array.isArray(raw.winners) ? raw.winners : [],
    actionLog: Array.isArray(raw.actionLog) ? raw.actionLog : [],
    handNumber: Math.max(0, Math.floor(Number(raw.handNumber) || 0)),
    moneyMode: Boolean(raw.moneyMode),
    moneyUnitCents: raw.moneyUnitCents === 1 ? 1 : null,
    buyInCents: cleanMoneyCents(raw.buyInCents, DEFAULT_BUY_IN_CENTS),
    baseSmallBlind: Math.max(1, Math.floor(Number(raw.baseSmallBlind) || DEFAULT_SMALL_BLIND)),
    baseBigBlind: Math.max(2, Math.floor(Number(raw.baseBigBlind) || DEFAULT_BIG_BLIND)),
    settlements: Array.isArray(raw.settlements) ? raw.settlements : [],
    moneyLedger: Array.isArray(raw.moneyLedger) ? raw.moneyLedger.map((entry) => ({
      playerId: String(entry.playerId),
      name: cleanName(entry.name),
      buyInsCents: Math.max(0, Math.floor(Number(entry.buyInsCents) || 0)),
      cashOutCents: Math.max(0, Math.floor(Number(entry.cashOutCents) || 0)),
    })) : [],
    players: Array.isArray(raw.players) ? raw.players.map(restorePlayer) : [],
    botTimer: null,
    showdownTimer: null,
    dormantSince: Number(raw.dormantSince) || null,
    dormantTimer: null,
  };

  for (const player of room.players) {
    if (player.isBot) player.name = computerName(player);
    if (room.moneyMode) syncPlayerToMoneyLedger(room, player);
  }

  dedupePlayersById(room);
  assignMissingPlayerColors(room);

  if (room.tableSize && !room.moneyMode) {
    for (const player of room.players) {
      if (!player.isBot) markRestoredHumanAsBot(room, player);
    }
    addComputerPlayers(room, room.tableSize);
    if (!room.players.some((player) => player.id === room.hostId && !player.isBot)) chooseNextHost(room);
  }

  if (!room.players.length) {
    if (room.moneyMode && (room.moneyLedger.length > 0 || room.phase === "gameover")) {
      room.status = "complete";
      room.phase = "gameover";
      room.hostId = null;
      room.settlements = Array.isArray(raw.settlements) && raw.settlements.length
        ? room.settlements
        : optimizeSettlements(room.moneyLedger);
      return room;
    }
    return null;
  }
  if (!Array.isArray(raw.raiseEligible) && isHandInProgress(room)) {
    room.raiseEligible = new Set(canActPlayers(room)
      .filter((player) => !room.acted.has(player.id))
      .map((player) => player.id));
  }
  if (room.dealer >= room.players.length) room.dealer = 0;
  return room;
}

function dedupePlayersById(room) {
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

function assignMissingPlayerColors(room) {
  for (const player of room.players) {
    if (player.isBot) {
      player.color = null;
    } else if (!player.color) {
      player.color = defaultPlayerColor(room);
    }
  }
}

function loadRooms() {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    const payload = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    const restoredRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    for (const rawRoom of restoredRooms) {
      const room = restoreRoom(rawRoom);
      if (room) {
        rooms.set(room.id, room);
        scheduleDormantRoomCleanup(room);
        if (room.phase === "showdown") beginShowdown(room);
      }
    }
    if (rooms.size > 0) console.log(`Restored ${rooms.size} room(s) from ${STATE_FILE}`);
  } catch (error) {
    console.error("Failed to restore game state:", error);
  }
}

function cleanMoneyCents(value, fallback = DEFAULT_BUY_IN_CENTS) {
  const cents = Math.round(Number(value) || 0);
  if (!Number.isFinite(cents) || cents <= 0) return fallback;
  return Math.max(100, Math.min(1000000, cents));
}

function chipValueCents(room) {
  if (room?.moneyMode && room.moneyUnitCents === 1) return 1;
  return cleanMoneyCents(room?.buyInCents, DEFAULT_BUY_IN_CENTS) / STARTING_STACK;
}

function centsToChips(room, cents) {
  return Math.max(1, Math.round(Math.max(0, Number(cents) || 0) / chipValueCents(room)));
}

function chipsToCents(room, chips) {
  return Math.round(Math.max(0, Math.floor(Number(chips) || 0)) * chipValueCents(room));
}

function makeRoom(hostId, hostName, socketId, tableSize = 0, options = {}) {
  let id = makeId();
  while (rooms.has(id)) id = makeId();
  const moneyMode = Boolean(options.moneyMode);
  const buyInCents = cleanMoneyCents(options.buyInCents, DEFAULT_BUY_IN_CENTS);
  const baseSmallBlind = cleanBlind(options.smallBlind, DEFAULT_SMALL_BLIND);
  const baseBigBlind = cleanBlind(options.bigBlind, DEFAULT_BIG_BLIND);
  const room = {
    id,
    hostId,
    tableSize: moneyMode ? 0 : cleanTableSize(tableSize),
    status: "lobby",
    phase: "lobby",
    deck: [],
    community: [],
    dealer: 0,
    turn: null,
    currentBet: 0,
    minRaise: baseBigBlind,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(),
    message: "Invite friends with this room link.",
    winners: [],
    actionLog: [],
    handNumber: 0,
    moneyMode,
    moneyUnitCents: moneyMode ? 1 : null,
    buyInCents,
    baseSmallBlind,
    baseBigBlind,
    settlements: [],
    moneyLedger: [],
    dormantSince: null,
    dormantTimer: null,
    players: [
      {
        id: hostId,
        reconnectTokenHash: options.reconnectTokenHash || null,
        socketIds: new Set([socketId]),
        name: hostName,
        color: PLAYER_COLORS[0],
        stack: moneyMode ? buyInCents : STARTING_STACK,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        showCards: false,
        ready: false,
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
  rooms.set(id, room);
  if (moneyMode) syncPlayerToMoneyLedger(room, room.players[0]);
  return room;
}

function getRoom(roomId) {
  return rooms.get(String(roomId || "").toUpperCase());
}


function cleanDeviceId(deviceId, fallback) {
  return String(deviceId || fallback || "").trim().slice(0, 80) || fallback;
}

function cleanBlind(value, fallback) {
  const blind = Math.floor(Number(value));
  return Number.isFinite(blind) && blind > 0 ? Math.min(100000, blind) : fallback;
}









function makeHumanPlayer(room, { id, socketId, name, reconnectTokenHash }) {
  const player = makePlayer({ id, socketId, name });
  player.reconnectTokenHash = reconnectTokenHash || null;
  player.color = defaultPlayerColor(room);
  if (room.moneyMode) {
    player.stack = centsToChips(room, room.buyInCents);
    addMoneyBuyIn(room, player, room.buyInCents);
    // Keep late arrivals out of every betting and payout calculation until the next deal.
    player.folded = isHandInProgress(room);
  }
  return player;
}


function attachSocketToPlayer(socket, room, player) {
  if (!player.socketIds) player.socketIds = new Set();
  clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  player.disconnectExpiresAt = null;
  player.backgroundedUntil = null;
  player.socketIds.add(socket.id);
  player.connected = true;
  if (!player.isBot) clearRoomDormancy(room);
  socketRoom.set(socket.id, room.id);
  socketPlayer.set(socket.id, player.id);
  socket.join(room.id);
}

function replaceActedId(room, oldId, newId) {
  if (!room.acted?.has(oldId)) return;
  room.acted.delete(oldId);
  room.acted.add(newId);
}

function replaceRaiseEligibleId(room, oldId, newId) {
  if (!room.raiseEligible?.has(oldId)) return;
  room.raiseEligible.delete(oldId);
  room.raiseEligible.add(newId);
}

function convertBotToHuman(socket, room, bot, playerId, name, reconnectTokenHash) {
  const oldId = bot.id;
  const hadHumanBefore = room.players.some((player) => !player.isBot);
  bot.id = playerId;
  bot.reconnectTokenHash = reconnectTokenHash || bot.replacedReconnectTokenHash || null;
  bot.name = cleanName(name);
  bot.color = bot.replacedPlayerColor || defaultPlayerColor(room);
  bot.isBot = false;
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

function convertHumanToBot(room, player) {
  const oldId = player.id;
  const oldName = player.name;
  const botNumber = nextBotNumber(room);
  player.id = `bot:${room.id}:${botNumber}`;
  player.name = computerName(player);
  player.replacedPlayerId = oldId;
  player.replacedPlayerName = oldName;
  player.replacedPlayerColor = player.color || null;
  player.replacedReconnectTokenHash = player.reconnectTokenHash || null;
  player.reconnectTokenHash = null;
  player.color = null;
  player.socketIds = new Set();
  player.connected = true;
  player.isBot = true;
  clearTimeout(player.disconnectTimer);
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


















function endGame(room) {
  if (room.moneyMode) {
    settleMoneyGame(room);
    resetHandState(room);
    room.status = "complete";
    room.phase = "gameover";
    room.turn = null;
    room.actionLog = [];
    room.message = "Money game ended. Settle up from the final screen.";
    return;
  }

  if (isHandInProgress(room)) {
    for (const player of room.players) {
      player.stack += player.invested;
    }
  }

  resetHandState(room);
  room.status = "lobby";
  room.phase = "lobby";
  room.turn = null;
  room.message = "Game ended by host.";
  room.actionLog = [];
}

function restartGame(room) {
  clearTimeout(room.botTimer);
  clearTimeout(room.showdownTimer);
  room.showdownTimer = null;
  if (room.moneyMode) room.moneyLedger = [];
  for (const player of room.players) {
    player.stack = STARTING_STACK;
    player.buyInsCents = room.moneyMode ? room.buyInCents : 0;
    player.cashOutCents = 0;
    player.hand = [];
    player.folded = false;
    player.allIn = false;
    player.bet = 0;
    player.invested = 0;
    player.showCards = false;
    player.ready = false;
    if (room.moneyMode) syncPlayerToMoneyLedger(room, player);
  }
  room.status = "lobby";
  room.phase = "lobby";
  room.deck = [];
  room.community = [];
  room.dealer = 0;
  room.turn = null;
  room.currentBet = 0;
  room.handNumber = 0;
  room.minRaise = currentBlinds(room).bigBlind;
  room.deadPot = 0;
  room.acted = new Set();
  room.raiseEligible = new Set();
  room.winners = [];
  room.settlements = [];
  room.actionLog = [];
  room.message = "Game restarted. Start a new hand when ready.";
}

function syncPlayerToMoneyLedger(room, player) {
  if (!room?.moneyMode || !player || player.isBot) return null;
  if (!Array.isArray(room.moneyLedger)) room.moneyLedger = [];
  let entry = room.moneyLedger.find((item) => item.playerId === player.id);
  if (!entry) {
    entry = { playerId: player.id, name: player.name, buyInsCents: 0, cashOutCents: 0 };
    room.moneyLedger.push(entry);
  }
  entry.name = player.name;
  entry.buyInsCents = Math.max(entry.buyInsCents, player.buyInsCents || 0);
  entry.cashOutCents = Math.max(entry.cashOutCents, player.cashOutCents || 0);
  return entry;
}

function addMoneyBuyIn(room, player, cents) {
  if (!room?.moneyMode || !player) return;
  const entry = syncPlayerToMoneyLedger(room, player);
  entry.buyInsCents += cents;
  player.buyInsCents = entry.buyInsCents;
  player.cashOutCents = entry.cashOutCents;
}

function optimizeSettlements(entries) {
  const debtors = entries
    .map((entry) => ({
      playerId: entry.playerId || entry.id,
      name: entry.name,
      amountCents: Math.max(0, entry.buyInsCents - entry.cashOutCents),
    }))
    .filter((item) => item.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);
  const creditors = entries
    .map((entry) => ({
      playerId: entry.playerId || entry.id,
      name: entry.name,
      amountCents: Math.max(0, entry.cashOutCents - entry.buyInsCents),
    }))
    .filter((item) => item.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);
  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.amountCents, creditor.amountCents);
    if (amountCents > 0) {
      settlements.push({
        fromPlayerId: debtor.playerId,
        fromName: debtor.name,
        toPlayerId: creditor.playerId,
        toName: creditor.name,
        amountCents,
      });
    }
    debtor.amountCents -= amountCents;
    creditor.amountCents -= amountCents;
    if (debtor.amountCents === 0) debtorIndex += 1;
    if (creditor.amountCents === 0) creditorIndex += 1;
  }
  return settlements;
}

function settleMoneyGame(room) {
  if (!room.moneyMode) return;
  const refundActiveInvestments = isHandInProgress(room);
  for (const player of room.players) {
    if (refundActiveInvestments && player.invested > 0) {
      player.stack += player.invested;
      player.invested = 0;
      player.bet = 0;
    }
    if (player.stack > 0) {
      player.cashOutCents += chipsToCents(room, player.stack);
      player.stack = 0;
    }
    syncPlayerToMoneyLedger(room, player);
  }
  room.settlements = optimizeSettlements(room.moneyLedger);
}

function cashInPlayer(room, playerId, amountCents) {
  const player = room?.players.find((item) => item.id === playerId);
  if (!room?.moneyMode) return { ok: false, error: "This room is not using money mode." };
  if (!player || player.isBot) return { ok: false, error: "Player not found." };
  const handLive = isHandInProgress(room);
  if (handLive) {
    // Still contesting this pot (including all-in with cards) — no mid-pot top-up.
    // Busted / folded / waiting seats may buy chips for the next hand now.
    const inCurrentPot = player.hand.length > 0 && !player.folded;
    if (inCurrentPot) {
      return { ok: false, error: "You can’t add chips while you’re in the current hand." };
    }
  }
  const cents = cleanMoneyCents(amountCents, room.buyInCents);
  player.buyInsCents += cents;
  player.stack += centsToChips(room, cents);
  player.allIn = false;
  if (handLive) {
    // Sit out the rest of this hand; chips are only live on the next deal.
    player.folded = true;
    player.hand = [];
    player.bet = 0;
  }
  resetReadiness(room);
  syncPlayerToMoneyLedger(room, player);
  room.settlements = [];
  room.message = handLive
    ? `${player.name} buys in for the next hand.`
    : `${player.name} cashed in.`;
  return { ok: true };
}

function playerCanCashIn(room, player) {
  if (!room?.moneyMode || !player || player.isBot) return false;
  if (!isHandInProgress(room)) return true;
  return !(player.hand.length > 0 && !player.folded);
}

function cashOutPlayer(room, playerId) {
  const player = room?.players.find((item) => item.id === playerId);
  if (!room?.moneyMode) return { ok: false, error: "This room is not using money mode." };
  if (!player || player.isBot) return { ok: false, error: "Player not found." };
  if (isHandInProgress(room)) return { ok: false, error: "Cash out between hands." };
  if (player.stack <= 0) return { ok: false, error: "You do not have chips to cash out." };
  player.cashOutCents += chipsToCents(room, player.stack);
  player.stack = 0;
  player.bet = 0;
  player.invested = 0;
  player.folded = true;
  player.allIn = true;
  resetReadiness(room);
  syncPlayerToMoneyLedger(room, player);
  room.settlements = optimizeSettlements(room.moneyLedger);
  room.message = `${player.name} cashed out.`;
  return { ok: true };
}














function setPlayerColor(room, playerId, color) {
  const player = room?.players.find((item) => item.id === playerId);
  const nextColor = cleanPlayerColor(color);
  if (!room || !player) return { ok: false, error: "Player not found." };
  if (player.isBot) return { ok: false, error: "CPU players cannot choose colors." };
  if (!nextColor) return { ok: false, error: "Unknown color." };
  player.color = nextColor;
  return { ok: true };
}

function setPlayerName(room, playerId, name) {
  const player = room?.players.find((item) => item.id === playerId);
  if (!room || !player) return { ok: false, error: "Player not found." };
  if (player.isBot) return { ok: false, error: "CPU players cannot change names." };
  player.name = cleanName(name);
  room.message = `${player.name} updated their name.`;
  return { ok: true };
}














function hasConnectedHuman(room) {
  return room.players.some((player) => !player.isBot && player.connected);
}


function scheduleComputerTurn(room) {
  clearTimeout(room.botTimer);
  if (!hasConnectedHuman(room)) return;
  const player = room.players.find((item) => item.id === room.turn);
  if (!player?.isBot || !isHandInProgress(room)) return;
  room.botTimer = setTimeout(() => {
    const currentRoom = rooms.get(room.id);
    const currentPlayer = currentRoom?.players.find((item) => item.id === currentRoom.turn);
    if (!currentRoom || !hasConnectedHuman(currentRoom) || !currentPlayer?.isBot || !isHandInProgress(currentRoom)) return;
    applyPlayerAction(currentRoom, currentPlayer.id, chooseComputerAction(currentRoom, currentPlayer));
    emitRoom(currentRoom);
  }, CPU_ACTION_DELAY_MS);
}

function serializeRoom(room, viewerId) {
  dedupePlayersById(room);
  const pot = collectPot(room);
  const viewer = room.players.find((player) => player.id === viewerId);
  const toCall = viewer && !viewer.folded && !viewer.allIn ? Math.max(0, room.currentBet - viewer.bet) : 0;
  const minRaiseTo = room.currentBet + room.minRaise;
  const { smallBlind, bigBlind } = currentBlinds(room);
  const viewerMaxBet = viewer ? viewer.bet + viewer.stack : 0;
  const raiseOpen = Boolean(viewer && room.raiseEligible?.has(viewer.id));

  return {
    id: room.id,
    hostId: room.hostId,
    status: room.status,
    phase: room.phase,
    tableSize: room.tableSize || room.players.length,
    message: room.message,
    pot,
    potCents: chipsToCents(room, pot),
    currentBet: room.currentBet,
    currentBetCents: chipsToCents(room, room.currentBet),
    minRaise: room.minRaise,
    minRaiseTo,
    minRaiseToCents: chipsToCents(room, minRaiseTo),
    smallBlind,
    bigBlind,
    smallBlindCents: chipsToCents(room, smallBlind),
    bigBlindCents: chipsToCents(room, bigBlind),
    playerColors: PLAYER_COLORS,
    handNumber: room.handNumber,
    moneyMode: Boolean(room.moneyMode),
    buyInCents: room.buyInCents,
    chipValueCents: chipValueCents(room),
    settlements: room.settlements || [],
    ledger: room.moneyMode ? (room.moneyLedger || []).map((entry) => ({
      ...entry,
      netCents: entry.cashOutCents - entry.buyInsCents,
      isYou: entry.playerId === viewerId,
      color: room.players.find((player) => player.id === entry.playerId)?.color || null,
    })) : [],
    turn: room.turn,
    isYourTurn: room.turn === viewerId,
    // Full min-raise is possible. Short all-in shoves still use raiseOpen via canShove.
    canRaise: raiseOpen && viewerMaxBet >= minRaiseTo,
    canShove: raiseOpen && viewerMaxBet > room.currentBet,
    canCashIn: playerCanCashIn(room, viewer),
    toCall,
    toCallCents: chipsToCents(room, toCall),
    canShowHand: room.phase === "complete" && Boolean(viewer?.hand?.length) && !viewer.showCards,
    canStart: false,
    canNextHand: false,
    canReady: Boolean(viewer && !viewer.isBot && viewer.stack > 0 && !viewer.sittingOut && canReadyForHand(room) && playersWithChips(room).filter((player) => !player.sittingOut).length >= 2),
    isReady: Boolean(viewer?.ready),
    canChangeBlinds: room.hostId === viewerId && canReadyForHand(room),
    canRestartGame: room.hostId === viewerId && !room.moneyMode && canAdministerGame(room),
    canEndGame: room.hostId === viewerId && canAdministerGame(room) && (room.moneyMode || room.phase !== "lobby"),
    canAddBot: room.hostId === viewerId && !room.moneyMode && room.handNumber === 0 && room.players.length < MAX_PLAYERS,
    community: room.community.map(publicCard),
    winners: room.winners.map((winner) => ({
      ...winner,
      amountCents: chipsToCents(room, winner.amount),
    })),
    actionLog: room.actionLog,
    players: room.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      color: player.color || null,
      stack: player.stack,
      stackCents: chipsToCents(room, player.stack),
      buyInsCents: player.buyInsCents || 0,
      cashOutCents: player.cashOutCents || 0,
      netCents: (player.cashOutCents || 0) + chipsToCents(room, player.stack) - (player.buyInsCents || 0),
      bet: player.bet,
      betCents: chipsToCents(room, player.bet),
      invested: player.invested,
      investedCents: chipsToCents(room, player.invested),
      sittingOut: Boolean(player.sittingOut),
      waitingForNextHand: isHandInProgress(room) && player.hand.length === 0 && player.folded && player.stack > 0,
      folded: player.folded,
      allIn: player.allIn,
      connected: player.connected,
      isBot: player.isBot,
      showCards: Boolean(player.showCards),
      ready: Boolean(player.ready || player.isBot),
      disconnectExpiresAt: player.disconnectExpiresAt || null,
      isHost: player.id === room.hostId,
      dealer: index === room.dealer,
      isTurn: room.turn === player.id,
      isYou: player.id === viewerId,
      canMakeHost: room.hostId === viewerId && player.id !== viewerId && !player.isBot && player.connected,
      canKick: room.hostId === viewerId && player.id !== viewerId && !isHandInProgress(room),
      cards: player.id === viewerId || player.showCards
        ? player.hand.map(publicCard)
        : player.hand.map(() => null),
    })),
  };
}


function scheduleShowdown(room) {
  if (room.phase !== "showdown" || room.showdownTimer) return;
  const revealDelay = isSoloHumanFolded(room) ? 30 : SHOWDOWN_DELAY_MS;
  room.showdownTimer = setTimeout(() => {
    const currentRoom = rooms.get(room.id);
    if (!currentRoom || currentRoom.phase !== "showdown") return;
    settleShowdown(currentRoom);
    emitRoom(currentRoom);
  }, revealDelay);
}

function emitRoom(room) {
  for (const player of room.players) {
    for (const socketId of player.socketIds || []) {
      io.to(socketId).emit("room:update", serializeRoom(room, player.id));
    }
  }
  scheduleSave();
  scheduleShowdown(room);
  scheduleComputerTurn(room);
}

function detachSocketFromRoom(socketId, roomId) {
  socketRoom.delete(socketId);
  socketPlayer.delete(socketId);
  io.sockets.sockets.get(socketId)?.leave(roomId);
}

function chooseNextHost(room) {
  const nextHost = room.players.find((player) => !player.isBot) || room.players[0];
  room.hostId = nextHost?.id || null;
}

function transferHost(room, currentHostId, nextHostId) {
  if (!room || room.hostId !== currentHostId) return { ok: false, error: "Only the host can make another player host." };
  if (currentHostId === nextHostId) return { ok: false, error: "You are already the host." };
  const nextHost = room.players.find((player) => player.id === nextHostId);
  if (!nextHost) return { ok: false, error: "Player not found." };
  if (nextHost.isBot) return { ok: false, error: "CPU players cannot be host." };
  if (!nextHost.connected) return { ok: false, error: "That player is away." };
  room.hostId = nextHost.id;
  room.message = `${nextHost.name} is now host.`;
  return { ok: true };
}

function removePlayerAfterDisconnect(room, player) {
  if (room.tableSize) {
    convertHumanToBot(room, player);
    emitRoom(room);
    return;
  }

  const index = playerIndex(room, player.id);
  if (index < 0 || player.connected) return;
  const wasTurn = room.turn === player.id;
  const isLastPlayer = room.players.length === 1;

  clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  player.disconnectExpiresAt = null;
  if (room.moneyMode) {
    // Last seat leaving mid-hand: refund the pot into stack before cash-out so ledger balances.
    if (isLastPlayer && isHandInProgress(room) && player.invested > 0) {
      player.stack += player.invested;
      player.invested = 0;
      player.bet = 0;
    }
    if (player.stack > 0) {
      player.cashOutCents += chipsToCents(room, player.stack);
      player.stack = 0;
    }
    syncPlayerToMoneyLedger(room, player);
    room.settlements = optimizeSettlements(room.moneyLedger);
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
    rooms.delete(room.id);
    scheduleSave();
    return;
  }
  if (index < room.dealer) room.dealer -= 1;
  if (room.dealer >= room.players.length) room.dealer = 0;
  if (room.hostId === player.id) chooseNextHost(room);
  room.message = `${player.name} was removed after disconnecting.`;
  if (isHandInProgress(room)) {
    if (wasTurn) {
      const fromIndex = (index - 1 + room.players.length) % room.players.length;
      const next = nextIndex(room, fromIndex, (item) => !item.folded && !item.allIn && item.stack > 0);
      room.turn = next >= 0 ? room.players[next].id : null;
    }
    maybeAdvance(room);
  } else {
    maybeStartReadyHand(room);
  }
  emitRoom(room);
}

function leaveCurrentRoom(socket, { removeAfterGrace = true, allowBackgroundGrace = true } = {}) {
  const roomId = socketRoom.get(socket.id);
  const playerId = socketPlayer.get(socket.id);
  if (!roomId) return;
  const room = rooms.get(roomId);
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
        const wasRecentlyBackgrounded = allowBackgroundGrace && player.backgroundedUntil > Date.now();
        const graceMs = wasRecentlyBackgrounded ? BACKGROUND_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_MS;
        player.backgroundedUntil = null;
        player.disconnectExpiresAt = Date.now() + graceMs;
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = setTimeout(() => {
          const latestRoom = rooms.get(room.id);
          const latestPlayer = latestRoom?.players.find((item) => item.id === player.id);
          if (latestRoom && latestPlayer && !latestPlayer.connected) {
            removePlayerAfterDisconnect(latestRoom, latestPlayer);
          }
        }, graceMs);
      }
    }
  }
  detachSocketFromRoom(socket.id, room.id);
  emitRoom(room);
}

function kickPlayerFromRoom(room, playerId) {
  const index = playerIndex(room, playerId);
  if (index < 0) return null;
  const [removed] = room.players.splice(index, 1);
  if (room.moneyMode) {
    removed.cashOutCents += chipsToCents(room, removed.stack);
    removed.stack = 0;
    syncPlayerToMoneyLedger(room, removed);
    room.settlements = optimizeSettlements(room.moneyLedger);
  }
  if (room.tableSize) room.tableSize = room.players.length >= 2 ? room.players.length : 0;
  clearTimeout(removed.disconnectTimer);
  for (const socketId of removed.socketIds || []) {
    io.to(socketId).emit("room:kicked");
    detachSocketFromRoom(socketId, room.id);
  }
  if (index < room.dealer) room.dealer -= 1;
  if (room.dealer >= room.players.length) room.dealer = 0;
  room.message = `${removed.name} was kicked from the table.`;
  return removed;
}

io.on("connection", (socket) => {
  socket.on("room:create", ({
    name, deviceId, computerPlayers, tableSize, moneyMode, buyInCents,
    smallBlind, bigBlind, smallBlindCents, bigBlindCents,
  }, ack) => {
    const playerId = cleanDeviceId(deviceId, socket.id);
    const cleanedBuyInCents = cleanMoneyCents(buyInCents, DEFAULT_BUY_IN_CENTS);
    let cleanSmall = cleanBlind(smallBlind, DEFAULT_SMALL_BLIND);
    let cleanBig = cleanBlind(bigBlind, DEFAULT_BIG_BLIND);
    if (moneyMode) {
      const requestedSmallCents = Math.round(Number(smallBlindCents));
      const requestedBigCents = Math.round(Number(bigBlindCents));
      if (!Number.isFinite(requestedSmallCents) || requestedSmallCents <= 0
        || !Number.isFinite(requestedBigCents) || requestedBigCents <= 0) {
        return ack?.({ ok: false, error: "Blinds must be at least $0.01." });
      }
      cleanSmall = requestedSmallCents;
      cleanBig = requestedBigCents;
    }
    if (cleanBig <= cleanSmall) return ack?.({ ok: false, error: "Big blind must be greater than small blind." });
    const credentials = newReconnectCredentials();
    const requestedSize = moneyMode ? 0 : cleanTableSize(tableSize) || cleanTableSize(computerPlayers);
    const room = makeRoom(playerId, cleanName(name), socket.id, requestedSize, {
      moneyMode,
      buyInCents: cleanedBuyInCents,
      smallBlind: cleanSmall,
      bigBlind: cleanBig,
      reconnectTokenHash: credentials.tokenHash,
    });
    if (!room.moneyMode) addComputerPlayers(room, requestedSize || computerPlayers);
    attachSocketToPlayer(socket, room, room.players[0]);
    ack?.({ ok: true, roomId: room.id, playerId, reconnectToken: credentials.token });
    emitRoom(room);
  });

  socket.on("room:join", ({ roomId, name, deviceId, reconnectToken, acceptedMoneyTerms }, ack) => {
    const room = getRoom(roomId);
    if (!room) return ack?.({ ok: false, error: "Room not found." });
    const playerId = cleanDeviceId(deviceId, socket.id);
    const existing = room.players.find((player) => player.id === playerId);
    if (existing) {
      if (existing.isBot) return ack?.({ ok: false, error: "That seat is not available." });
      if (!reconnectTokenMatches(existing, reconnectToken)) {
        return ack?.({ ok: false, error: "This seat belongs to another session." });
      }
      existing.name = cleanName(name);
      attachSocketToPlayer(socket, room, existing);
      ack?.({ ok: true, roomId: room.id });
      emitRoom(room);
      return;
    }
    // Finished money sessions stay addressable by code so anyone can reopen settle-up.
    if (room.moneyMode && room.phase === "gameover") {
      ack?.({ ok: true, roomId: room.id, settlementView: true });
      socket.emit("room:update", serializeRoom(room, playerId));
      return;
    }
    const reservedBotSeat = room.players.find((player) => player.isBot && player.replacedPlayerId === playerId);
    if (reservedBotSeat) {
      const reservedIdentity = { reconnectTokenHash: reservedBotSeat.replacedReconnectTokenHash };
      if (!reconnectTokenMatches(reservedIdentity, reconnectToken)) {
        return ack?.({ ok: false, error: "This reserved seat belongs to another session." });
      }
      convertBotToHuman(socket, room, reservedBotSeat, playerId, name, reservedBotSeat.replacedReconnectTokenHash);
      ack?.({ ok: true, roomId: room.id });
      emitRoom(room);
      return;
    }
    const botSeat = room.players.find((player) => player.isBot);
    if (botSeat) {
      if (isHandInProgress(room)) return ack?.({ ok: false, error: "This hand is in progress. Join after it ends." });
      const credentials = newReconnectCredentials();
      resetReadiness(room);
      convertBotToHuman(socket, room, botSeat, playerId, name, credentials.tokenHash);
      ack?.({ ok: true, roomId: room.id, playerId, reconnectToken: credentials.token });
      emitRoom(room);
      return;
    }
    const effectiveMax = room.tableSize || MAX_PLAYERS;
    if (room.players.length >= effectiveMax) return ack?.({ ok: false, error: "Room is full." });
    if (room.phase === "gameover") return ack?.({ ok: false, error: "This session has ended." });
    if (!room.moneyMode && room.phase !== "lobby" && room.phase !== "complete") {
      return ack?.({ ok: false, error: "This hand is in progress. Join after it ends." });
    }
    if (room.moneyMode) {
      const blinds = currentBlinds(room);
      const moneyTerms = {
        roomId: room.id,
        buyInCents: room.buyInCents,
        smallBlindCents: chipsToCents(room, blinds.smallBlind),
        bigBlindCents: chipsToCents(room, blinds.bigBlind),
      };
      if (!acceptedMoneyTerms || Object.keys(moneyTerms).some((key) => acceptedMoneyTerms[key] !== moneyTerms[key])) {
        return ack?.({ ok: false, moneyTerms, error: "Review the buy-in and blinds before joining." });
      }
    }
    const credentials = newReconnectCredentials();
    resetReadiness(room);
    room.players.push(makeHumanPlayer(room, { id: playerId, socketId: socket.id, name: cleanName(name), reconnectTokenHash: credentials.tokenHash }));
    attachSocketToPlayer(socket, room, room.players[room.players.length - 1]);
    if (room.tableSize) addComputerPlayers(room, room.tableSize);
    ack?.({ ok: true, roomId: room.id, playerId, reconnectToken: credentials.token });
    emitRoom(room);
  });

  socket.on("room:kick", ({ playerId }, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const hostId = socketPlayer.get(socket.id);
    if (!room || room.hostId !== hostId) return ack?.({ ok: false, error: "Only the host can kick players." });
    if (isHandInProgress(room)) return ack?.({ ok: false, error: "Players can only be kicked between hands." });
    if (playerId === hostId) return ack?.({ ok: false, error: "Host cannot kick themselves." });
    const removed = kickPlayerFromRoom(room, playerId);
    if (!removed) return ack?.({ ok: false, error: "Player not found." });
    ack?.({ ok: true });
    if (room.players.length === 0) {
      if (room.moneyMode) {
        preserveSettledMoneyRoom(room);
        return;
      }
      rooms.delete(room.id);
      scheduleSave();
      return;
    }
    emitRoom(room);
  });

  socket.on("room:addBot", (_, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const hostId = socketPlayer.get(socket.id);
    if (!room || room.hostId !== hostId) return ack?.({ ok: false, error: "Only the host can add CPU players." });
    if (room.moneyMode) return ack?.({ ok: false, error: "CPU players are unavailable in money mode." });
    if (room.handNumber > 0) return ack?.({ ok: false, error: "CPU players can only be added before the game begins." });
    if (room.players.length >= MAX_PLAYERS) return ack?.({ ok: false, error: "The table is full." });
    addComputerPlayers(room, room.players.length + 1);
    ack?.({ ok: true });
    emitRoom(room);
  });

  socket.on("room:makeHost", ({ playerId }, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const hostId = socketPlayer.get(socket.id);
    const result = transferHost(room, hostId, playerId);
    if (!result.ok) return ack?.(result);
    ack?.(result);
    emitRoom(room);
  });

  socket.on("game:start", (_, ack) => {
    ack?.({ ok: false, error: "Players must ready up before the hand starts." });
  });

  socket.on("game:next", (_, ack) => {
    ack?.({ ok: false, error: "Players must ready up before the next hand." });
  });

  socket.on("game:sitOut", ({ sittingOut } = {}, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const player = room?.players.find((item) => item.id === socketPlayer.get(socket.id));
    if (!player || player.isBot || room.phase === "gameover") return ack?.({ ok: false, error: "Seat unavailable." });
    player.sittingOut = sittingOut === undefined ? !player.sittingOut : Boolean(sittingOut);
    player.ready = false;
    // Current cards, bets, and action remain intact; the next deal applies the break.
    room.message = player.sittingOut ? `${player.name} will sit out the next hand.` : `${player.name} is back for the next deal.`;
    maybeStartReadyHand(room);
    ack?.({ ok: true });
    emitRoom(room);
  });

  socket.on("game:ready", ({ ready } = {}, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    const player = room?.players.find((item) => item.id === playerId);
    if (!room || !player || player.isBot) return ack?.({ ok: false, error: "Player not found." });
    if (!canReadyForHand(room)) return ack?.({ ok: false, error: "You can ready up between hands." });
    if (player.sittingOut) return ack?.({ ok: false, error: "Return to the table before readying up." });
    if (player.stack <= 0) return ack?.({ ok: false, error: "Cash in before readying up." });
    player.ready = ready === undefined ? !player.ready : Boolean(ready);
    room.message = player.ready ? `${player.name} is ready.` : `${player.name} is not ready.`;
    maybeStartReadyHand(room);
    ack?.({ ok: true });
    emitRoom(room);
  });

  socket.on("game:setBlinds", ({ smallBlind, bigBlind, smallBlindCents, bigBlindCents } = {}, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    if (!room || room.hostId !== playerId) return ack?.({ ok: false, error: "Only the host can change blinds." });
    if (!canReadyForHand(room)) return ack?.({ ok: false, error: "Change blinds between hands." });

    let nextSmall;
    let nextBig;
    let nextBaseSmall;
    let nextBaseBig;
    if (room.moneyMode) {
      const chipCents = chipValueCents(room);
      const smallCents = Math.round(Number(smallBlindCents));
      const bigCents = Math.round(Number(bigBlindCents));
      if (!Number.isFinite(smallCents) || smallCents <= 0 || smallCents % chipCents !== 0
        || !Number.isFinite(bigCents) || bigCents <= 0 || bigCents % chipCents !== 0) {
        return ack?.({ ok: false, error: `Blinds must be exact multiples of $${(chipCents / 100).toFixed(2)}.` });
      }
      nextSmall = smallCents / chipCents;
      nextBig = bigCents / chipCents;
      nextBaseSmall = nextSmall;
      nextBaseBig = nextBig;
    } else {
      nextSmall = cleanBlind(smallBlind, 0);
      nextBig = cleanBlind(bigBlind, 0);
      const nextHand = room.phase === "complete" ? room.handNumber + 1 : 1;
      const level = blindLevelForHand(nextHand);
      nextBaseSmall = Math.max(1, Math.round(nextSmall * DEFAULT_SMALL_BLIND / level.smallBlind));
      nextBaseBig = Math.max(2, Math.round(nextBig * DEFAULT_BIG_BLIND / level.bigBlind));
    }
    if (nextBig <= nextSmall) return ack?.({ ok: false, error: "Big blind must be greater than small blind." });
    room.baseSmallBlind = nextBaseSmall;
    room.baseBigBlind = nextBaseBig;
    resetReadiness(room);
    room.minRaise = nextBig;
    room.message = `Blinds updated to ${room.moneyMode ? `$${(smallBlindCents / 100).toFixed(2)}/$${(bigBlindCents / 100).toFixed(2)}` : `${nextSmall}/${nextBig}`}.`;
    ack?.({ ok: true });
    emitRoom(room);
  });

  socket.on("game:end", (_, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    if (!room || room.hostId !== playerId) return ack?.({ ok: false, error: "Only the host can end the game." });
    if (!canAdministerGame(room)) return ack?.({ ok: false, error: "Finish the current hand before ending the game." });
    if (room.phase === "lobby" && !room.moneyMode) return ack?.({ ok: false, error: "No game is in progress." });
    endGame(room);
    ack?.({ ok: true });
    emitRoom(room);
  });

  socket.on("game:restart", (_, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    if (!room || room.hostId !== playerId) return ack?.({ ok: false, error: "Only the host can restart." });
    if (room.moneyMode) return ack?.({ ok: false, error: "End this money session before starting a new one." });
    if (!canAdministerGame(room)) return ack?.({ ok: false, error: "Finish the current hand before restarting." });
    restartGame(room);
    ack?.({ ok: true });
    emitRoom(room);
  });

  socket.on("money:cashIn", ({ amountCents }, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    const result = cashInPlayer(room, playerId, amountCents);
    if (!result.ok) return ack?.(result);
    ack?.(result);
    emitRoom(room);
  });

  socket.on("money:cashOut", (_, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    const result = cashOutPlayer(room, playerId);
    if (!result.ok) return ack?.(result);
    ack?.(result);
    emitRoom(room);
  });

  socket.on("game:showCards", (_, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    const result = showPlayerCards(room, playerId);
    if (!result.ok) return ack?.(result);
    ack?.(result);
    emitRoom(room);
  });

  socket.on("player:setColor", ({ color }, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    const result = setPlayerColor(room, playerId, color);
    if (!result.ok) return ack?.(result);
    ack?.(result);
    emitRoom(room);
  });

  socket.on("player:setName", ({ name }, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    const result = setPlayerName(room, playerId, name);
    if (!result.ok) return ack?.(result);
    ack?.(result);
    emitRoom(room);
  });

  socket.on("game:action", ({ type, raiseTo }, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    const result = applyPlayerAction(room, playerId, { type, raiseTo });
    if (!result.ok) return ack?.(result);
    ack?.(result);
    emitRoom(room);
  });

  socket.on("room:leave", (_, ack) => {
    leaveCurrentRoom(socket, { allowBackgroundGrace: false });
    ack?.({ ok: true });
  });

  socket.on("room:presence", ({ hidden } = {}) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    const player = room?.players.find((item) => item.id === playerId);
    if (!player || player.isBot) return;
    player.backgroundedUntil = hidden ? Date.now() + BACKGROUND_PRESENCE_TTL_MS : null;
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

if (require.main === module) {
  loadRooms();

  process.once("SIGINT", () => {
    saveRoomsNow();
    process.exit(0);
  });

  process.once("SIGTERM", () => {
    saveRoomsNow();
    process.exit(0);
  });

  server.listen(PORT, () => {
    console.log(`Texas Hold'em server listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  BLIND_LEVELS,
  SETTLED_MONEY_ROOM_TTL_MS,
  DORMANT_ROOM_TTL_MS,
  buildSidePots,
  cashInPlayer,
  playerCanCashIn,
  assessPreflopAllInCall,
  bettingComplete,
  blindLevelForHand,
  chooseComputerAction,
  chooseComputerRaiseTo,
  estimateComputerConfidence,
  estimatePostflopEquity,
  estimatePreflopEquityAgainstRange,
  getRoom,
  io,
  isSettledMoneyRoom,
  optimizeSettlements,
  preserveSettledMoneyRoom,
  preflopBlindRaiseChance,
  preflopShoveRange,
  removePlayerAfterDisconnect,
  restoreRoom,
  rooms,
  scheduleDormantRoomCleanup,
  serializeRoom,
  serializeRoomForStorage,
  server,
};
