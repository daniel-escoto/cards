const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { Hand } = require("pokersolver");
const { customAlphabet } = require("nanoid");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const makeId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

const PORT = process.env.PORT || 3000;
const STARTING_STACK = 1000;
const DEFAULT_BUY_IN_CENTS = 2000;
const BLIND_LEVELS = [
  { smallBlind: 10, bigBlind: 20, hands: 6 },
  { smallBlind: 20, bigBlind: 40, hands: 6 },
  { smallBlind: 40, bigBlind: 80, hands: 6 },
  { smallBlind: 75, bigBlind: 150, hands: 6 },
  { smallBlind: 100, bigBlind: 200, hands: 6 },
  { smallBlind: 200, bigBlind: 400, hands: Infinity },
];
const DEFAULT_BIG_BLIND = BLIND_LEVELS[0].bigBlind;
const DEFAULT_SMALL_BLIND = BLIND_LEVELS[0].smallBlind;
const MAX_PLAYERS = 8;
const BOT_PROFILES = [
  { tag: "cpu_7f3a", style: "Loose cannon", aggression: 1.28, looseness: 1.24, bluff: 0.13, skill: 0.58, minDelay: 420, maxDelay: 1250 },
  { tag: "cpu_b204", style: "Patient grinder", aggression: 0.72, looseness: 0.74, bluff: 0.025, skill: 0.82, minDelay: 700, maxDelay: 1700 },
  { tag: "cpu_19d8", style: "Balanced regular", aggression: 1.02, looseness: 1.0, bluff: 0.065, skill: 0.76, minDelay: 520, maxDelay: 1450 },
  { tag: "cpu_e621", style: "Pressure player", aggression: 1.48, looseness: 1.08, bluff: 0.1, skill: 0.68, minDelay: 300, maxDelay: 1050 },
  { tag: "cpu_04ac", style: "Casual caller", aggression: 0.64, looseness: 1.3, bluff: 0.02, skill: 0.48, minDelay: 800, maxDelay: 1900 },
  { tag: "cpu_c97e", style: "Sharp and tricky", aggression: 1.12, looseness: 0.94, bluff: 0.09, skill: 0.9, minDelay: 650, maxDelay: 1650 },
  { tag: "cpu_52b1", style: "Tight and quick", aggression: 0.84, looseness: 0.68, bluff: 0.035, skill: 0.7, minDelay: 260, maxDelay: 800 },
];
const DISCONNECT_GRACE_MS = Math.max(0, Number(process.env.DISCONNECT_GRACE_MS) || 30000);
const PLAYER_COLORS = ["#60a5fa", "#38bdf8", "#7ddc85", "#f472b6", "#a78bfa", "#fb7185", "#818cf8", "#2dd4bf"];
const DEFAULT_DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, ".data");
const STATE_FILE = process.env.GAME_STATE_FILE || path.join(DEFAULT_DATA_DIR, "rooms.json");
const SAVE_DEBOUNCE_MS = 150;
const SHOWDOWN_DELAY_MS = 1600;

app.use(express.static("public"));

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

const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const suits = ["s", "h", "d", "c"];

function blindLevelForHand(handNumber) {
  let remainingHands = Math.max(1, Math.floor(Number(handNumber) || 1));
  for (const level of BLIND_LEVELS) {
    if (remainingHands <= level.hands) return level;
    remainingHands -= level.hands;
  }
  return BLIND_LEVELS[BLIND_LEVELS.length - 1];
}

function currentBlinds(room) {
  const baseSmallBlind = Math.max(1, Math.floor(Number(room?.baseSmallBlind) || DEFAULT_SMALL_BLIND));
  const baseBigBlind = Math.max(baseSmallBlind + 1, Math.floor(Number(room?.baseBigBlind) || DEFAULT_BIG_BLIND));
  if (room?.moneyMode) return { smallBlind: baseSmallBlind, bigBlind: baseBigBlind };
  const level = blindLevelForHand(room?.handNumber || 1);
  return {
    smallBlind: Math.max(1, Math.round(baseSmallBlind * level.smallBlind / DEFAULT_SMALL_BLIND)),
    bigBlind: Math.max(2, Math.round(baseBigBlind * level.bigBlind / DEFAULT_BIG_BLIND)),
  };
}

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

function makeDeck() {
  const deck = [];
  for (const rank of ranks) for (const suit of suits) deck.push(`${rank}${suit}`);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function publicCard(card) {
  const rankNames = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
  const suitNames = { s: "♠", h: "♥", d: "♦", c: "♣" };
  return {
    code: card,
    rank: rankNames[card[0]] || card[0],
    suit: suitNames[card[1]],
    color: card[1] === "h" || card[1] === "d" ? "red" : "black",
  };
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
    disconnectExpiresAt: player.disconnectExpiresAt || null,
    connected: false,
    isBot: player.isBot,
    replacedPlayerId: player.replacedPlayerId || null,
    replacedPlayerName: player.replacedPlayerName || null,
    replacedPlayerColor: player.replacedPlayerColor || null,
    replacedReconnectTokenHash: player.replacedReconnectTokenHash || null,
    buyInsCents: Math.max(0, Math.floor(Number(player.buyInsCents) || 0)),
    cashOutCents: Math.max(0, Math.floor(Number(player.cashOutCents) || 0)),
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
    buyInCents: cleanMoneyCents(room.buyInCents, DEFAULT_BUY_IN_CENTS),
    baseSmallBlind: room.baseSmallBlind || DEFAULT_SMALL_BLIND,
    baseBigBlind: room.baseBigBlind || DEFAULT_BIG_BLIND,
    settlements: Array.isArray(room.settlements) ? room.settlements : [],
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
    disconnectExpiresAt: null,
    connected: Boolean(raw.isBot),
    isBot: Boolean(raw.isBot),
    replacedPlayerId: raw.replacedPlayerId || null,
    replacedPlayerName: raw.replacedPlayerName || null,
    replacedPlayerColor: cleanPlayerColor(raw.replacedPlayerColor),
    replacedReconnectTokenHash: raw.replacedReconnectTokenHash || null,
    buyInsCents: Math.max(0, Math.floor(Number(raw.buyInsCents) || 0)),
    cashOutCents: Math.max(0, Math.floor(Number(raw.cashOutCents) || 0)),
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
    buyInCents: cleanMoneyCents(raw.buyInCents, DEFAULT_BUY_IN_CENTS),
    baseSmallBlind: Math.max(1, Math.floor(Number(raw.baseSmallBlind) || DEFAULT_SMALL_BLIND)),
    baseBigBlind: Math.max(2, Math.floor(Number(raw.baseBigBlind) || DEFAULT_BIG_BLIND)),
    settlements: Array.isArray(raw.settlements) ? raw.settlements : [],
    players: Array.isArray(raw.players) ? raw.players.map(restorePlayer) : [],
    botTimer: null,
    showdownTimer: null,
  };

  for (const player of room.players) {
    if (player.isBot) player.name = computerName(player);
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

  if (!room.players.length) return null;
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
  return cleanMoneyCents(room?.buyInCents, DEFAULT_BUY_IN_CENTS) / STARTING_STACK;
}

function centsToChips(room, cents) {
  return Math.max(1, Math.round(cleanMoneyCents(cents, room.buyInCents) / chipValueCents(room)));
}

function chipsToCents(room, chips) {
  return Math.round(Math.max(0, Math.floor(Number(chips) || 0)) * chipValueCents(room));
}

function makeRoom(hostId, hostName, socketId, tableSize = 0, options = {}) {
  const id = makeId();
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
    buyInCents,
    baseSmallBlind,
    baseBigBlind,
    settlements: [],
    players: [
      {
        id: hostId,
        reconnectTokenHash: options.reconnectTokenHash || null,
        socketIds: new Set([socketId]),
        name: hostName,
        color: PLAYER_COLORS[0],
        stack: STARTING_STACK,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        showCards: false,
        connected: true,
        isBot: false,
        replacedPlayerId: null,
        replacedPlayerName: null,
        replacedPlayerColor: null,
        replacedReconnectTokenHash: null,
        buyInsCents: moneyMode ? buyInCents : 0,
        cashOutCents: 0,
        disconnectExpiresAt: null,
        disconnectTimer: null,
      },
    ],
  };
  rooms.set(id, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(String(roomId || "").toUpperCase());
}

function cleanName(name) {
  return String(name || "Player").trim().slice(0, 18) || "Player";
}

function cleanDeviceId(deviceId, fallback) {
  return String(deviceId || fallback || "").trim().slice(0, 80) || fallback;
}

function cleanBlind(value, fallback) {
  const blind = Math.floor(Number(value));
  return Number.isFinite(blind) && blind > 0 ? Math.min(100000, blind) : fallback;
}

function cleanComputerPlayers(count) {
  return Math.max(0, Math.min(MAX_PLAYERS, Math.floor(Number(count) || 0)));
}

function cleanTableSize(count) {
  const parsed = Math.floor(Number(count) || 0);
  if (!parsed) return 0;
  return Math.max(2, Math.min(MAX_PLAYERS, parsed));
}

function cleanPlayerColor(color) {
  const normalized = String(color || "").toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function defaultPlayerColor(room) {
  const used = new Set(room.players.map((player) => player.color).filter(Boolean));
  return PLAYER_COLORS.find((color) => !used.has(color)) || PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
}

function makePlayer({ id, name, socketId = null, isBot = false }) {
  return {
    id,
    reconnectTokenHash: null,
    socketIds: socketId ? new Set([socketId]) : new Set(),
    name,
    color: isBot ? null : PLAYER_COLORS[0],
    stack: STARTING_STACK,
    hand: [],
    folded: false,
    allIn: false,
    bet: 0,
    invested: 0,
    showCards: false,
    connected: true,
    isBot,
    replacedPlayerId: null,
    replacedPlayerName: null,
    replacedPlayerColor: null,
    replacedReconnectTokenHash: null,
    buyInsCents: 0,
    cashOutCents: 0,
    disconnectExpiresAt: null,
    disconnectTimer: null,
  };
}

function computerProfile(player) {
  const number = Number(/:(\d+)$/.exec(player?.id || "")?.[1]) || 1;
  return BOT_PROFILES[(number - 1) % BOT_PROFILES.length];
}

function computerName(player) {
  const seed = String(player?.id || "cpu");
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const value = hash >>> 0;
  const adjectives = [
    "Brave", "Chill", "Clever", "Cosmic", "Crimson", "Dusty", "Frosty", "Golden",
    "Happy", "Lucky", "Mighty", "Neon", "Quiet", "Rapid", "Sunny", "Velvet",
  ];
  const nouns = [
    "Badger", "Cobra", "Comet", "Falcon", "Fox", "Gecko", "Moth", "Otter",
    "Panda", "Raven", "Rook", "Shark", "Sloth", "Tiger", "Toast", "Wolf",
  ];
  const adjective = adjectives[value % adjectives.length];
  const noun = nouns[Math.floor(value / adjectives.length) % nouns.length];
  return `${adjective}${noun}`;
}

function addComputerPlayers(room, totalPlayers) {
  if (room.moneyMode) return;
  const target = cleanTableSize(totalPlayers) || cleanComputerPlayers(totalPlayers);
  if (target > 0) room.tableSize = target;
  const needed = Math.max(0, Math.min(MAX_PLAYERS, target) - room.players.length);
  for (let index = 0; index < needed; index += 1) {
    const botNumber = nextBotNumber(room);
    room.players.push(makePlayer({
      id: `bot:${room.id}:${botNumber}`,
      name: computerName({ id: `bot:${room.id}:${botNumber}` }),
      isBot: true,
    }));
  }
  if (needed > 0) room.message = `Computer table ready with ${room.players.length} players.`;
}

function makeHumanPlayer(room, { id, socketId, name, reconnectTokenHash }) {
  const player = makePlayer({ id, socketId, name });
  player.reconnectTokenHash = reconnectTokenHash || null;
  player.color = defaultPlayerColor(room);
  if (room.moneyMode) player.buyInsCents = room.buyInCents;
  return player;
}

function nextBotNumber(room) {
  const used = new Set(room.players
    .map((player) => /^bot:[^:]+:(\d+)$/.exec(player.id)?.[1])
    .filter(Boolean)
    .map(Number));
  for (let number = 1; number <= MAX_PLAYERS * 4; number += 1) {
    if (!used.has(number)) return number;
  }
  return Date.now();
}

function attachSocketToPlayer(socket, room, player) {
  if (!player.socketIds) player.socketIds = new Set();
  clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  player.disconnectExpiresAt = null;
  player.socketIds.add(socket.id);
  player.connected = true;
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
  return player;
}

function activePlayers(room) {
  return room.players.filter((player) => player.stack > 0 || player.invested > 0);
}

function livePlayers(room) {
  return room.players.filter((player) => !player.folded && (player.stack > 0 || player.invested > 0));
}

function canActPlayers(room) {
  return room.players.filter((player) => !player.folded && !player.allIn && player.stack > 0);
}

function nextIndex(room, fromIndex, predicate) {
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const index = (fromIndex + offset) % room.players.length;
    if (predicate(room.players[index], index)) return index;
  }
  return -1;
}

function playerIndex(room, playerId) {
  return room.players.findIndex((player) => player.id === playerId);
}

function postBlind(room, index, amount) {
  const player = room.players[index];
  const posted = Math.min(amount, player.stack);
  player.stack -= posted;
  player.bet += posted;
  player.invested += posted;
  if (player.stack === 0) player.allIn = true;
  return posted;
}

function logAction(room, text, metadata = {}) {
  room.actionLog.push({
    id: `${room.handNumber}-${room.actionLog.length + 1}`,
    phase: room.phase,
    text,
    ...metadata,
  });
  if (room.actionLog.length > 24) room.actionLog.shift();
}

function resetHandState(room) {
  clearTimeout(room.showdownTimer);
  room.showdownTimer = null;
  const { bigBlind } = currentBlinds(room);
  room.community = [];
  room.deck = makeDeck();
  room.currentBet = 0;
  room.minRaise = bigBlind;
  room.deadPot = 0;
  room.acted = new Set();
  room.raiseEligible = new Set();
  room.winners = [];
  room.actionLog = [];
  for (const player of room.players) {
    player.hand = [];
    player.folded = false;
    player.allIn = player.stack <= 0;
    player.bet = 0;
    player.invested = 0;
    player.showCards = false;
  }
}

function isHandInProgress(room) {
  return ["preflop", "flop", "turn", "river", "showdown"].includes(room.phase);
}

function canAdministerGame(room) {
  return ["lobby", "complete", "gameover"].includes(room?.phase);
}

function playersWithChips(room) {
  return room.players.filter((player) => player.stack > 0);
}

function maybeEndGame(room) {
  if (room.moneyMode) return false;
  const remaining = playersWithChips(room);
  if (remaining.length >= 2 || room.phase !== "complete") return false;
  room.status = "complete";
  room.phase = "gameover";
  room.turn = null;
  room.message = remaining.length === 1
    ? `${remaining[0].name} wins the game.`
    : "Game over.";
  return true;
}

function startHand(room) {
  const seated = playersWithChips(room);
  if (seated.length < 2) {
    maybeEndGame(room);
    if (room.phase !== "gameover") {
      room.status = "lobby";
      room.phase = "lobby";
      room.message = "At least two players with chips are needed.";
    }
    return;
  }

  resetHandState(room);
  room.status = "playing";
  room.phase = "preflop";
  room.handNumber += 1;
  if (room.handNumber === 1) room.dealer = crypto.randomInt(room.players.length);
  const { smallBlind, bigBlind } = currentBlinds(room);
  room.minRaise = bigBlind;

  if (room.players[room.dealer]?.stack <= 0) {
    room.dealer = nextIndex(room, room.dealer, (player) => player.stack > 0);
  }

  for (let round = 0; round < 2; round += 1) {
    for (let offset = 1; offset <= room.players.length; offset += 1) {
      const player = room.players[(room.dealer + offset) % room.players.length];
      if (player.stack > 0) player.hand.push(room.deck.pop());
    }
  }

  const headsUp = seated.length === 2;
  const smallBlindIndex = headsUp ? room.dealer : nextIndex(room, room.dealer, (p) => p.stack > 0);
  const bigBlindIndex = nextIndex(room, smallBlindIndex, (p) => p.stack > 0);
  postBlind(room, smallBlindIndex, smallBlind);
  postBlind(room, bigBlindIndex, bigBlind);
  logAction(room, `${room.players[smallBlindIndex].name} posts small blind ${smallBlind}.`, {
    playerId: room.players[smallBlindIndex].id,
    action: `Posts small blind ${smallBlind}`,
  });
  logAction(room, `${room.players[bigBlindIndex].name} posts big blind ${bigBlind}.`, {
    playerId: room.players[bigBlindIndex].id,
    action: `Posts big blind ${bigBlind}`,
  });
  room.currentBet = Math.max(...room.players.map((player) => player.bet));
  room.raiseEligible = new Set(canActPlayers(room).map((player) => player.id));

  const firstToAct = nextIndex(room, bigBlindIndex, (p) => !p.folded && !p.allIn && p.stack > 0);
  room.turn = firstToAct >= 0 ? room.players[firstToAct].id : null;
  room.message = `Hand ${room.handNumber}: blinds are ${smallBlind}/${bigBlind}.`;
  maybeAdvance(room);
}

function startNextHand(room) {
  const nextDealer = nextIndex(room, room.dealer, (player) => player.stack > 0);
  room.dealer = nextDealer >= 0 ? nextDealer : 0;
  startHand(room);
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

function optimizeSettlements(players) {
  const debtors = players
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      amountCents: Math.max(0, player.buyInsCents - player.cashOutCents),
    }))
    .filter((item) => item.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);
  const creditors = players
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      amountCents: Math.max(0, player.cashOutCents - player.buyInsCents),
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
  }
  room.settlements = optimizeSettlements(room.players);
}

function cashInPlayer(room, playerId, amountCents) {
  const player = room?.players.find((item) => item.id === playerId);
  if (!room?.moneyMode) return { ok: false, error: "This room is not using money mode." };
  if (!player || player.isBot) return { ok: false, error: "Player not found." };
  if (isHandInProgress(room)) return { ok: false, error: "Cash in between hands." };
  const cents = cleanMoneyCents(amountCents, room.buyInCents);
  const chipCents = chipValueCents(room);
  if (!Number.isInteger(chipCents) || cents % chipCents !== 0) {
    return { ok: false, error: `Cash-in must be a multiple of $${(chipCents / 100).toFixed(2)}.` };
  }
  player.buyInsCents += cents;
  player.stack += centsToChips(room, cents);
  player.allIn = false;
  room.settlements = [];
  room.message = `${player.name} cashed in.`;
  return { ok: true };
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
  room.settlements = optimizeSettlements(room.players);
  room.message = `${player.name} cashed out.`;
  return { ok: true };
}

function dealStreet(room) {
  const { bigBlind } = currentBlinds(room);
  for (const player of room.players) player.bet = 0;
  room.currentBet = 0;
  room.minRaise = bigBlind;
  room.acted = new Set();

  if (room.phase === "preflop") {
    room.deck.pop();
    room.community.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
    room.phase = "flop";
  } else if (room.phase === "flop") {
    room.deck.pop();
    room.community.push(room.deck.pop());
    room.phase = "turn";
  } else if (room.phase === "turn") {
    room.deck.pop();
    room.community.push(room.deck.pop());
    room.phase = "river";
  } else {
    beginShowdown(room);
    return;
  }

  const first = nextIndex(room, room.dealer, (p) => !p.folded && !p.allIn && p.stack > 0);
  room.raiseEligible = new Set(canActPlayers(room).map((player) => player.id));
  room.turn = first >= 0 ? room.players[first].id : null;
  room.message = `${room.phase[0].toUpperCase()}${room.phase.slice(1)} betting.`;
  logAction(room, `${room.phase[0].toUpperCase()}${room.phase.slice(1)} dealt.`);
  maybeAdvance(room);
}

function bettingComplete(room) {
  const actors = canActPlayers(room);
  if (actors.length === 0) return true;
  return actors.every((player) => player.bet === room.currentBet && room.acted.has(player.id));
}

function maybeAdvance(room) {
  const contenders = livePlayers(room);
  if (contenders.length === 1) {
    awardUncontested(room, contenders[0]);
    return;
  }

  if (!bettingComplete(room)) {
    if (!room.turn || !canActPlayers(room).some((player) => player.id === room.turn)) {
      const currentIndex = Math.max(0, playerIndex(room, room.turn));
      const next = nextIndex(room, currentIndex, (p) => !p.folded && !p.allIn && p.stack > 0);
      room.turn = next >= 0 ? room.players[next].id : null;
    }
    return;
  }

  if (room.phase === "river") {
    beginShowdown(room);
  } else {
    dealStreet(room);
  }
}

function advanceTurn(room, actorIndex) {
  const next = nextIndex(room, actorIndex, (p) => !p.folded && !p.allIn && p.stack > 0);
  room.turn = next >= 0 ? room.players[next].id : null;
  maybeAdvance(room);
}

function collectPot(room) {
  return room.deadPot + room.players.reduce((sum, player) => sum + player.invested, 0);
}

function revealComputerHands(room) {
  for (const player of room.players) {
    if (player.isBot && player.hand.length) player.showCards = true;
  }
}

function awardUncontested(room, winner) {
  const amount = collectPot(room);
  winner.stack += amount;
  room.phase = "complete";
  room.turn = null;
  revealComputerHands(room);
  room.winners = [{ playerId: winner.id, name: winner.name, amount, hand: "Everyone else folded" }];
  room.message = `${winner.name} wins ${amount}.`;
  logAction(room, `${winner.name} wins ${amount}.`, {
    playerId: winner.id,
    action: `Wins ${amount}`,
  });
  maybeEndGame(room);
}

function buildSidePots(room) {
  const levels = [...new Set(room.players.map((p) => p.invested).filter(Boolean))].sort((a, b) => a - b);
  const pots = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = room.players.filter((player) => player.invested >= level);
    const amount = (level - previous) * contributors.length;
    const contenders = contributors.filter((player) => !player.folded);
    if (amount > 0 && contenders.length > 0) pots.push({ amount, contenders });
    previous = level;
  }
  if (room.deadPot > 0) {
    if (pots.length > 0) {
      pots[0].amount += room.deadPot;
    } else {
      pots.push({ amount: room.deadPot, contenders: livePlayers(room) });
    }
  }
  return pots;
}

function combineWinnerSummaries(summaries) {
  const combined = new Map();
  for (const summary of summaries) {
    const key = `${summary.playerId}:${summary.hand}`;
    const existing = combined.get(key);
    if (existing) {
      existing.amount += summary.amount;
    } else {
      combined.set(key, { ...summary });
    }
  }
  return [...combined.values()];
}

function settleShowdown(room) {
  clearTimeout(room.showdownTimer);
  room.showdownTimer = null;
  room.turn = null;
  const summaries = [];

  for (const pot of buildSidePots(room)) {
    const solved = pot.contenders.map((player) => ({
      player,
      hand: Hand.solve([...player.hand, ...room.community]),
    }));
    const winningHands = Hand.winners(solved.map((entry) => entry.hand));
    const winners = solved
      .filter((entry) => winningHands.includes(entry.hand))
      .sort((a, b) => {
        const aIndex = playerIndex(room, a.player.id);
        const bIndex = playerIndex(room, b.player.id);
        const aDistance = (aIndex - room.dealer + room.players.length) % room.players.length || room.players.length;
        const bDistance = (bIndex - room.dealer + room.players.length) % room.players.length || room.players.length;
        return aDistance - bDistance;
      });
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount % winners.length;

    for (const winner of winners) {
      const payout = share + (remainder > 0 ? 1 : 0);
      remainder -= 1;
      winner.player.stack += payout;
      winner.player.showCards = true;
      summaries.push({
        playerId: winner.player.id,
        name: winner.player.name,
        amount: payout,
        hand: winner.hand.descr,
      });
    }
  }

  room.phase = "complete";
  room.winners = combineWinnerSummaries(summaries);
  revealComputerHands(room);
  room.message = room.winners.map((winner) => `${winner.name} wins ${winner.amount} with ${winner.hand}`).join(" · ");
  for (const winner of room.winners) {
    logAction(room, `${winner.name} wins ${winner.amount} with ${winner.hand}.`, {
      playerId: winner.playerId,
      action: `Wins ${winner.amount}`,
    });
  }
  maybeEndGame(room);
}

function beginShowdown(room) {
  if (room.showdownTimer) return;
  room.phase = "showdown";
  room.turn = null;
  room.message = "Cards down. Revealing the winner…";
  emitRoom(room);
  const revealDelay = isSoloHumanFolded(room) ? 30 : SHOWDOWN_DELAY_MS;
  room.showdownTimer = setTimeout(() => {
    const currentRoom = rooms.get(room.id);
    if (!currentRoom || currentRoom.phase !== "showdown") return;
    settleShowdown(currentRoom);
    emitRoom(currentRoom);
  }, revealDelay);
}

function applyPlayerAction(room, playerId, { type, raiseTo }) {
  if (!room || room.turn !== playerId) return { ok: false, error: "It is not your turn." };
  const index = playerIndex(room, playerId);
  const player = room.players[index];
  const callAmount = Math.max(0, room.currentBet - player.bet);

  if (type === "fold") {
    player.folded = true;
    room.acted.add(player.id);
    room.raiseEligible.delete(player.id);
    room.message = `${player.name} folds.`;
    logAction(room, room.message, { playerId: player.id, action: "Folds" });
  } else if (type === "call" || type === "check") {
    if (type === "check" && callAmount > 0) return { ok: false, error: "You cannot check while facing a bet." };
    const paid = Math.min(callAmount, player.stack);
    player.stack -= paid;
    player.bet += paid;
    player.invested += paid;
    if (player.stack === 0) player.allIn = true;
    room.acted.add(player.id);
    room.raiseEligible.delete(player.id);
    room.message = paid > 0 ? `${player.name} calls ${paid}.` : `${player.name} checks.`;
    logAction(room, room.message, {
      playerId: player.id,
      action: paid > 0 ? `Calls ${paid}` : "Checks",
    });
  } else if (type === "raise") {
    if (!room.raiseEligible.has(player.id)) {
      return { ok: false, error: "The previous short all-in did not reopen raising." };
    }
    const target = Math.floor(Number(raiseTo));
    if (!Number.isFinite(target)) return { ok: false, error: "Invalid raise." };
    const maxBet = player.bet + player.stack;
    if (target > maxBet) return { ok: false, error: "You do not have enough chips." };
    const isAllInShortRaise = target === maxBet && target > room.currentBet;
    if (target < room.currentBet + room.minRaise && !isAllInShortRaise) {
      return { ok: false, error: `Minimum raise is to ${room.currentBet + room.minRaise}.` };
    }
    const paid = target - player.bet;
    player.stack -= paid;
    player.invested += paid;
    const raiseSize = target - room.currentBet;
    player.bet = target;
    if (player.stack === 0) player.allIn = true;
    const isFullRaise = raiseSize >= room.minRaise;
    if (isFullRaise) room.minRaise = raiseSize;
    room.currentBet = Math.max(room.currentBet, target);
    room.acted = new Set([player.id]);
    if (isFullRaise) {
      room.raiseEligible = new Set(canActPlayers(room).filter((item) => item.id !== player.id).map((item) => item.id));
    } else {
      room.raiseEligible.delete(player.id);
    }
    room.message = `${player.name} raises to ${target}.`;
    logAction(room, room.message, { playerId: player.id, action: `Raises to ${target}` });
  } else {
    return { ok: false, error: "Unknown action." };
  }

  advanceTurn(room, index);
  return { ok: true };
}

function showPlayerCards(room, playerId) {
  const player = room?.players.find((item) => item.id === playerId);
  if (!room || !player) return { ok: false, error: "Player not found." };
  if (room.phase !== "complete") return { ok: false, error: "You can show your hand after the hand ends." };
  if (!player.hand.length) return { ok: false, error: "No hand to show." };
  if (player.showCards) return { ok: true };
  player.showCards = true;
  room.message = `${player.name} shows their hand.`;
  logAction(room, room.message, {
    playerId: player.id,
    action: `Shows ${player.hand.join(" ")}`,
  });
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

function cardRankValue(card) {
  return ranks.indexOf(card[0]) + 2;
}

function estimateComputerConfidence(room, player) {
  const cards = [...player.hand, ...room.community];
  const values = cards.map(cardRankValue);
  const holeValues = player.hand.map(cardRankValue);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);

  const pairCount = [...counts.values()].filter((count) => count >= 2).length;
  const hasTrips = [...counts.values()].some((count) => count >= 3);
  const hasPair = pairCount > 0;
  const holePair = holeValues.length === 2 && holeValues[0] === holeValues[1];
  const highCards = holeValues.filter((value) => value >= 11).length;
  const suited = player.hand.length === 2 && player.hand[0][1] === player.hand[1][1];
  const topHole = Math.max(...holeValues);

  let confidence = 0.24;
  if (topHole >= 14) confidence += 0.16;
  else if (topHole >= 12) confidence += 0.1;
  if (highCards === 2) confidence += 0.14;
  if (suited) confidence += 0.06;
  if (holePair) confidence += topHole >= 10 ? 0.34 : 0.22;

  if (room.community.length > 0) {
    confidence -= 0.07;
    if (hasPair) confidence += 0.22;
    if (pairCount >= 2) confidence += 0.12;
    if (hasTrips) confidence += 0.24;
  }

  return Math.max(0.08, Math.min(0.92, confidence));
}

function chooseComputerRaiseTo(room, player, minRaiseTo, confidence) {
  const { bigBlind } = currentBlinds(room);
  const maxBet = player.bet + player.stack;
  const pot = collectPot(room);
  const pressureRaise = minRaiseTo + bigBlind * (confidence > 0.72 ? 2 : 1);
  const potRaise = room.currentBet + Math.ceil(pot * (confidence > 0.66 ? 0.42 : 0.28) / bigBlind) * bigBlind;
  const profile = computerProfile(player);
  const preferred = Math.max(minRaiseTo, Math.random() < 0.3 + profile.aggression * 0.16 ? potRaise : pressureRaise);
  return Math.min(maxBet, preferred);
}

function preflopBlindCallChance(room, player, callAmount) {
  const { bigBlind } = currentBlinds(room);
  if (room.phase !== "preflop" || room.community.length > 0 || callAmount > bigBlind) return null;

  const holeValues = player.hand.map(cardRankValue).sort((a, b) => b - a);
  const highCard = holeValues[0] || 0;
  const lowCard = holeValues[1] || 0;
  const gap = highCard - lowCard;
  const suited = player.hand.length === 2 && player.hand[0][1] === player.hand[1][1];
  const paired = highCard === lowCard;
  const hasBroadway = highCard >= 11;
  const connected = gap <= 1;
  const nearConnected = gap === 2;

  let callChance = callAmount < bigBlind ? 0.86 : 0.68;
  if (paired) callChance += highCard >= 10 ? 0.22 : 0.16;
  if (hasBroadway) callChance += 0.08;
  if (suited) callChance += 0.08;
  if (connected) callChance += 0.1;
  else if (nearConnected) callChance += 0.05;
  if (highCard <= 9 && gap >= 5 && !suited) callChance -= 0.16;

  return Math.max(0.36, Math.min(0.96, callChance));
}

function chooseComputerAction(room, player) {
  const { bigBlind } = currentBlinds(room);
  const callAmount = Math.max(0, room.currentBet - player.bet);
  const maxBet = player.bet + player.stack;
  const canRaise = maxBet > room.currentBet;
  const minRaiseTo = Math.min(maxBet, room.currentBet + room.minRaise);
  const profile = computerProfile(player);
  const rawConfidence = estimateComputerConfidence(room, player);
  const judgmentNoise = (Math.random() - 0.5) * (1 - profile.skill) * 0.42;
  const confidence = Math.max(0.04, Math.min(0.96, rawConfidence + judgmentNoise));

  if (callAmount === 0) {
    const valueRaiseChance = confidence > 0.48 ? confidence * 0.36 * profile.aggression : 0;
    const bluffRaiseChance = confidence < 0.38 ? profile.bluff : profile.bluff * 0.25;
    if (canRaise && minRaiseTo <= maxBet && Math.random() < valueRaiseChance + bluffRaiseChance) {
      return { type: "raise", raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, confidence) };
    }
    return { type: "check" };
  }

  const blindCallChance = preflopBlindCallChance(room, player, callAmount);
  if (blindCallChance !== null) {
    if (Math.random() < Math.min(0.98, blindCallChance * profile.looseness)) return { type: "call" };
    return { type: "fold" };
  }

  const potPressure = callAmount / Math.max(bigBlind, collectPot(room) + callAmount);
  const stackPressure = callAmount / Math.max(1, player.stack + callAmount);
  const callChance = Math.max(0.08, Math.min(0.97, (confidence + 0.29 - potPressure * 0.55 - stackPressure * 0.44) * profile.looseness));
  const reraiseChance = confidence > 0.66 ? (confidence - 0.58) * 0.42 * profile.aggression : profile.bluff * 0.12;
  if (canRaise && minRaiseTo <= maxBet && Math.random() < reraiseChance) {
    return { type: "raise", raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, confidence) };
  }
  if (Math.random() < callChance) return { type: "call" };
  return { type: "fold" };
}

function hasConnectedHuman(room) {
  return room.players.some((player) => !player.isBot && player.connected);
}

function isSoloHumanFolded(room) {
  const humans = room.players.filter((player) => !player.isBot);
  return humans.length === 1 && humans[0].folded;
}

function scheduleComputerTurn(room) {
  clearTimeout(room.botTimer);
  if (!hasConnectedHuman(room)) return;
  const player = room.players.find((item) => item.id === room.turn);
  if (!player?.isBot || !isHandInProgress(room)) return;
  const profile = computerProfile(player);
  const baseDelay = profile.minDelay + Math.random() * (profile.maxDelay - profile.minDelay);
  const decisionDelay = isSoloHumanFolded(room)
    ? 20
    : Math.round(baseDelay + (Math.random() < 0.08 ? 900 + Math.random() * 1000 : 0));
  room.botTimer = setTimeout(() => {
    const currentRoom = rooms.get(room.id);
    const currentPlayer = currentRoom?.players.find((item) => item.id === currentRoom.turn);
    if (!currentRoom || !hasConnectedHuman(currentRoom) || !currentPlayer?.isBot || !isHandInProgress(currentRoom)) return;
    applyPlayerAction(currentRoom, currentPlayer.id, chooseComputerAction(currentRoom, currentPlayer));
    emitRoom(currentRoom);
  }, decisionDelay);
}

function serializeRoom(room, viewerId) {
  dedupePlayersById(room);
  const pot = collectPot(room);
  const viewer = room.players.find((player) => player.id === viewerId);
  const toCall = viewer && !viewer.folded && !viewer.allIn ? Math.max(0, room.currentBet - viewer.bet) : 0;
  const minRaiseTo = room.currentBet + room.minRaise;
  const { smallBlind, bigBlind } = currentBlinds(room);

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
    playerColors: PLAYER_COLORS,
    handNumber: room.handNumber,
    moneyMode: Boolean(room.moneyMode),
    buyInCents: room.buyInCents,
    chipValueCents: chipValueCents(room),
    settlements: room.settlements || [],
    turn: room.turn,
    isYourTurn: room.turn === viewerId,
    canRaise: Boolean(viewer && room.raiseEligible?.has(viewer.id)),
    toCall,
    toCallCents: chipsToCents(room, toCall),
    canShowHand: room.phase === "complete" && Boolean(viewer?.hand?.length) && !viewer.showCards,
    canStart: room.hostId === viewerId && playersWithChips(room).length >= 2 && !isHandInProgress(room) && room.phase !== "gameover",
    canNextHand: room.hostId === viewerId && room.phase === "complete" && playersWithChips(room).length >= 2,
    canRestartGame: room.hostId === viewerId && canAdministerGame(room),
    canEndGame: room.hostId === viewerId && canAdministerGame(room) && (room.moneyMode || room.phase !== "lobby"),
    canAddBot: room.hostId === viewerId && !room.moneyMode && !isHandInProgress(room) && room.players.length < MAX_PLAYERS,
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
      folded: player.folded,
      allIn: player.allIn,
      connected: player.connected,
      isBot: player.isBot,
      showCards: Boolean(player.showCards),
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

function emitRoom(room) {
  for (const player of room.players) {
    for (const socketId of player.socketIds || []) {
      io.to(socketId).emit("room:update", serializeRoom(room, player.id));
    }
  }
  scheduleSave();
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

  clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  player.disconnectExpiresAt = null;
  room.deadPot += player.invested;
  player.bet = 0;
  player.invested = 0;
  player.folded = true;
  room.players.splice(index, 1);
  if (room.players.length === 0) {
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
  }
  emitRoom(room);
}

function leaveCurrentRoom(socket, { removeAfterGrace = true } = {}) {
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
        player.disconnectExpiresAt = Date.now() + DISCONNECT_GRACE_MS;
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = setTimeout(() => {
          const latestRoom = rooms.get(room.id);
          const latestPlayer = latestRoom?.players.find((item) => item.id === player.id);
          if (latestRoom && latestPlayer && !latestPlayer.connected) {
            removePlayerAfterDisconnect(latestRoom, latestPlayer);
          }
        }, DISCONNECT_GRACE_MS);
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
  socket.on("room:create", ({ name, deviceId, computerPlayers, tableSize, moneyMode, buyInCents, smallBlind, bigBlind }, ack) => {
    const playerId = cleanDeviceId(deviceId, socket.id);
    const cleanSmall = cleanBlind(smallBlind, DEFAULT_SMALL_BLIND);
    const cleanBig = cleanBlind(bigBlind, DEFAULT_BIG_BLIND);
    if (cleanBig <= cleanSmall) return ack?.({ ok: false, error: "Big blind must be greater than small blind." });
    if (moneyMode && cleanMoneyCents(buyInCents, DEFAULT_BUY_IN_CENTS) % STARTING_STACK !== 0) {
      return ack?.({ ok: false, error: "Money-mode buy-in must be in $10 increments." });
    }
    const credentials = newReconnectCredentials();
    const requestedSize = moneyMode ? 0 : cleanTableSize(tableSize) || cleanTableSize(computerPlayers);
    const room = makeRoom(playerId, cleanName(name), socket.id, requestedSize, {
      moneyMode,
      buyInCents,
      smallBlind: cleanSmall,
      bigBlind: cleanBig,
      reconnectTokenHash: credentials.tokenHash,
    });
    if (!room.moneyMode) addComputerPlayers(room, requestedSize || computerPlayers);
    attachSocketToPlayer(socket, room, room.players[0]);
    ack?.({ ok: true, roomId: room.id, playerId, reconnectToken: credentials.token });
    emitRoom(room);
  });

  socket.on("room:join", ({ roomId, name, deviceId, reconnectToken }, ack) => {
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
      convertBotToHuman(socket, room, botSeat, playerId, name, credentials.tokenHash);
      ack?.({ ok: true, roomId: room.id, playerId, reconnectToken: credentials.token });
      emitRoom(room);
      return;
    }
    const effectiveMax = room.tableSize || MAX_PLAYERS;
    if (room.players.length >= effectiveMax) return ack?.({ ok: false, error: "Room is full." });
    if (room.phase !== "lobby" && room.phase !== "complete") {
      return ack?.({ ok: false, error: "This hand is in progress. Join after it ends." });
    }
    const credentials = newReconnectCredentials();
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
    emitRoom(room);
  });

  socket.on("room:addBot", (_, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const hostId = socketPlayer.get(socket.id);
    if (!room || room.hostId !== hostId) return ack?.({ ok: false, error: "Only the host can add CPU players." });
    if (room.moneyMode) return ack?.({ ok: false, error: "CPU players are unavailable in money mode." });
    if (isHandInProgress(room)) return ack?.({ ok: false, error: "CPU players can only be added between hands." });
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
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    if (!room || room.hostId !== playerId) return ack?.({ ok: false, error: "Only the host can start." });
    startHand(room);
    ack?.({ ok: true });
    emitRoom(room);
  });

  socket.on("game:next", (_, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    if (!room || room.hostId !== playerId) return ack?.({ ok: false, error: "Only the host can deal the next hand." });
    startNextHand(room);
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
    leaveCurrentRoom(socket);
    ack?.({ ok: true });
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
  blindLevelForHand,
};
