/**
 * Shared Hold'em engine — pure rules + bots.
 * Works in Node (CommonJS) and the browser (UMD / script tag).
 * No Express, Socket.IO, fs, rooms Map, or money ledger.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    var pokersolver = require("./pokersolver.js");
    module.exports = factory(pokersolver.Hand);
  } else {
    root.HoldemEngine = factory(root.Hand);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Hand) {
  "use strict";

  if (!Hand || typeof Hand.solve !== "function") {
    throw new Error("HoldemEngine requires pokersolver Hand");
  }

  const STARTING_STACK = 1000;
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
  const MAX_PLAYERS = 9;
  const BOT_PROFILES = [
  { tag: "cpu_7f3a", style: "Loose cannon", aggression: 1.28, looseness: 1.24, bluff: 0.13, skill: 0.58 },
  { tag: "cpu_b204", style: "Patient grinder", aggression: 0.72, looseness: 0.74, bluff: 0.025, skill: 0.82 },
  { tag: "cpu_19d8", style: "Balanced regular", aggression: 1.02, looseness: 1.0, bluff: 0.065, skill: 0.76 },
  { tag: "cpu_e621", style: "Pressure player", aggression: 1.48, looseness: 1.08, bluff: 0.1, skill: 0.68 },
  { tag: "cpu_04ac", style: "Casual caller", aggression: 0.64, looseness: 1.3, bluff: 0.02, skill: 0.48 },
  { tag: "cpu_c97e", style: "Sharp and tricky", aggression: 1.12, looseness: 0.94, bluff: 0.09, skill: 0.9 },
  { tag: "cpu_52b1", style: "Tight and quick", aggression: 0.84, looseness: 0.68, bluff: 0.035, skill: 0.7 },
];
  const PLAYER_COLORS = ["#60a5fa", "#38bdf8", "#7ddc85", "#f472b6", "#a78bfa", "#fb7185", "#818cf8", "#2dd4bf", "#fbbf24"];

  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const suits = ["s", "h", "d", "c"];
  const allCards = ranks.flatMap((rank) => suits.map((suit) => `${rank}${suit}`));

  let randomInt = function defaultRandomInt(maxExclusive) {
    const max = Math.max(1, Math.floor(Number(maxExclusive) || 1));
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const limit = Math.floor(0x100000000 / max) * max;
      let value;
      const buf = new Uint32Array(1);
      do {
        crypto.getRandomValues(buf);
        value = buf[0];
      } while (value >= limit);
      return value % max;
    }
    return Math.floor(Math.random() * max);
  };

  function setRandomInt(fn) {
    if (typeof fn === "function") randomInt = fn;
  }

  function cleanBlind(value, fallback) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function chipValueCents(room) {
    return Math.max(1, Math.floor(Number(room?.chipValueCents) || Number(room?.moneyUnitCents) || 1));
  }

  function chipsToCents(room, chips) {
    return Math.round(Number(chips) || 0) * chipValueCents(room);
  }


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

function makeDeck() {
  const deck = [];
  for (const rank of ranks) for (const suit of suits) deck.push(`${rank}${suit}`);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
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

function cleanName(name) {
  return String(name || "Player").trim().slice(0, 18) || "Player";
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
    ready: false,
    connected: true,
    isBot,
    replacedPlayerId: null,
    replacedPlayerName: null,
    replacedPlayerColor: null,
    replacedReconnectTokenHash: null,
    buyInsCents: 0,
    cashOutCents: 0,
    preflopShoveStreak: 0,
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
    player.ready = false;
  }
}

function isHandInProgress(room) {
  return ["preflop", "flop", "turn", "river", "showdown"].includes(room.phase);
}

function canAdministerGame(room) {
  return ["lobby", "complete", "gameover"].includes(room?.phase);
}

function canReadyForHand(room) {
  return ["lobby", "complete"].includes(room?.phase);
}

function resetReadiness(room) {
  for (const player of room?.players || []) {
    if (!player.isBot) player.ready = false;
  }
}

function maybeStartReadyHand(room) {
  if (!canReadyForHand(room)) return false;
  const seated = playersWithChips(room).filter((player) => !player.sittingOut);
  const humans = seated.filter((player) => !player.isBot);
  if (seated.length < 2 || humans.length === 0) return false;
  if (!humans.every((player) => player.connected && player.ready)) return false;
  if (room.phase === "complete") startNextHand(room);
  else startHand(room);
  return true;
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
  const seated = playersWithChips(room).filter((player) => !player.sittingOut);
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
  for (const player of room.players) player.folded = Boolean(player.sittingOut);
  room.status = "playing";
  room.phase = "preflop";
  room.handNumber += 1;
  if (room.handNumber === 1) room.dealer = randomInt(room.players.length);
  const { smallBlind, bigBlind } = currentBlinds(room);
  room.minRaise = bigBlind;

  if (room.players[room.dealer]?.stack <= 0 || room.players[room.dealer]?.sittingOut) {
    room.dealer = nextIndex(room, room.dealer, (player) => player.stack > 0 && !player.sittingOut);
  }

  for (let round = 0; round < 2; round += 1) {
    for (let offset = 1; offset <= room.players.length; offset += 1) {
      const player = room.players[(room.dealer + offset) % room.players.length];
      if (player.stack > 0 && !player.sittingOut) player.hand.push(room.deck.pop());
    }
  }

  const headsUp = seated.length === 2;
  const smallBlindIndex = headsUp ? room.dealer : nextIndex(room, room.dealer, (p) => p.stack > 0 && !p.sittingOut);
  const bigBlindIndex = nextIndex(room, smallBlindIndex, (p) => p.stack > 0 && !p.sittingOut);
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
  const nextDealer = nextIndex(room, room.dealer, (player) => player.stack > 0 && !player.sittingOut);
  room.dealer = nextDealer >= 0 ? nextDealer : 0;
  startHand(room);
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
  // Once every other contender is all-in, the last player with chips only
  // needs to respond to an outstanding bet. If they are already matched,
  // there is nobody who could call another bet, so run out the board.
  if (actors.length === 1 && actors[0].bet === room.currentBet) return true;
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
    if (amount > 0 && contenders.length > 0) {
      pots.push({
        amount,
        contenders,
        contenderIds: contenders.map((player) => player.id),
      });
    }
    previous = level;
  }
  if (room.deadPot > 0) {
    if (pots.length > 0) {
      pots[0].amount += room.deadPot;
    } else {
      const contenders = livePlayers(room);
      pots.push({
        amount: room.deadPot,
        contenders,
        contenderIds: contenders.map((player) => player.id),
      });
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
  if (room.showdownTimer || room.phase === "showdown") return false;
  room.phase = "showdown";
  room.turn = null;
  room.message = "Cards down. Revealing the winner…";
  return true;
}

function applyPlayerAction(room, playerId, { type, raiseTo }) {
  if (!room || room.turn !== playerId) return { ok: false, error: "It is not your turn." };
  const index = playerIndex(room, playerId);
  const player = room.players[index];
  const callAmount = Math.max(0, room.currentBet - player.bet);

  if (type === "fold") {
    if (room.phase === "preflop") player.preflopShoveStreak = 0;
    player.folded = true;
    room.acted.add(player.id);
    room.raiseEligible.delete(player.id);
    room.message = `${player.name} folds.`;
    logAction(room, room.message, { playerId: player.id, action: "Folds" });
  } else if (type === "call" || type === "check") {
    if (type === "check" && callAmount > 0) return { ok: false, error: "You cannot check while facing a bet." };
    const paid = Math.min(callAmount, player.stack);
    if (room.phase === "preflop") player.preflopShoveStreak = 0;
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
    if (room.phase === "preflop") {
      player.preflopShoveStreak = target === maxBet
        ? Math.min(8, (player.preflopShoveStreak || 0) + 1)
        : 0;
    }
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
  // Pocket pairs should look raiseable: small/medium pairs were stuck below the
  // value-raise threshold and almost never opened or re-raised.
  if (holePair) {
    if (topHole >= 10) confidence += 0.34;
    else if (topHole >= 7) confidence += 0.3;
    else confidence += 0.26;
  }

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
  const pot = Math.max(bigBlind * 2, collectPot(room));
  const profile = computerProfile(player);
  const pressureRaise = minRaiseTo + bigBlind * (confidence > 0.65 ? 2 : 1);
  const potRaise = room.currentBet + Math.max(
    room.minRaise || bigBlind,
    Math.ceil(pot * (confidence > 0.66 ? 0.7 : 0.5) / bigBlind) * bigBlind,
  );
  const isPreflopOpen = room.phase === "preflop"
    && (!room.community || room.community.length === 0)
    && room.currentBet <= bigBlind;
  let preferred;
  if (isPreflopOpen) {
    // Prefer ~2.5–3x opens instead of frequent min-raises.
    const openTo = Math.max(minRaiseTo, Math.round((confidence > 0.68 ? 3 : 2.5) * bigBlind));
    preferred = Math.random() < 0.62 + profile.aggression * 0.14 ? openTo : Math.max(minRaiseTo, pressureRaise);
  } else {
    preferred = Math.max(
      minRaiseTo,
      Math.random() < 0.42 + profile.aggression * 0.2 ? potRaise : pressureRaise,
    );
  }
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

function preflopBlindRaiseChance(player, confidence) {
  const profile = computerProfile(player);
  const valueRaiseChance = confidence >= 0.42
    ? (confidence - 0.2) * 1.2 * profile.aggression
    : 0;
  const bluffRaiseChance = confidence < 0.44 ? profile.bluff * 0.55 : profile.bluff * 0.16;
  return Math.max(0, Math.min(0.9, valueRaiseChance + bluffRaiseChance));
}

function preflopHandScore(cards) {
  if (!Array.isArray(cards) || cards.length !== 2) return 0;
  const values = cards.map(cardRankValue).sort((a, b) => b - a);
  const [high, low] = values;
  const paired = high === low;
  const suited = cards[0][1] === cards[1][1];
  const gap = high - low;

  if (paired) return Math.min(1, 0.56 + (high - 2) * 0.035);

  let score = 0.12 + (high - 2) * 0.035 + (low - 2) * 0.014;
  if (suited) score += 0.055;
  if (gap === 1) score += 0.045;
  else if (gap === 2) score += 0.025;
  else if (gap >= 5) score -= 0.035;
  if (high === 14 && low >= 10) score += 0.09;
  if (high >= 11 && low >= 10) score += 0.045;
  return Math.max(0.05, Math.min(0.95, score));
}

function preflopShoveRange(effectiveBigBlinds, shoveStreak = 1, profile = BOT_PROFILES[2]) {
  let range;
  if (effectiveBigBlinds <= 5) range = 0.9;
  else if (effectiveBigBlinds <= 8) range = 0.72;
  else if (effectiveBigBlinds <= 12) range = 0.56;
  else if (effectiveBigBlinds <= 20) range = 0.36;
  else if (effectiveBigBlinds <= 30) range = 0.22;
  else range = 0.12;

  const adaptation = 0.12 + (profile.skill || 0.7) * 0.12;
  return Math.min(1, range + Math.max(0, shoveStreak - 1) * adaptation);
}

function estimatePreflopEquityAgainstRange(playerCards, rangeFraction, iterations = 180, random = Math.random) {
  if (!Array.isArray(playerCards) || playerCards.length !== 2) return 0;
  const blocked = new Set(playerCards);
  const available = allCards.filter((card) => !blocked.has(card));
  const opponentCombos = [];
  for (let first = 0; first < available.length; first += 1) {
    for (let second = first + 1; second < available.length; second += 1) {
      const cards = [available[first], available[second]];
      opponentCombos.push({ cards, score: preflopHandScore(cards) });
    }
  }
  opponentCombos.sort((a, b) => b.score - a.score);
  const candidateCount = Math.max(1, Math.ceil(opponentCombos.length * Math.max(0.02, Math.min(1, rangeFraction))));
  const candidates = opponentCombos.slice(0, candidateCount);
  let equity = 0;

  for (let trial = 0; trial < iterations; trial += 1) {
    const opponent = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))].cards;
    const opponentSet = new Set(opponent);
    const boardDeck = available.filter((card) => !opponentSet.has(card));
    for (let index = 0; index < 5; index += 1) {
      const swapIndex = index + Math.min(
        boardDeck.length - index - 1,
        Math.floor(random() * (boardDeck.length - index)),
      );
      [boardDeck[index], boardDeck[swapIndex]] = [boardDeck[swapIndex], boardDeck[index]];
    }
    const board = boardDeck.slice(0, 5);
    const playerHand = Hand.solve([...playerCards, ...board]);
    const opponentHand = Hand.solve([...opponent, ...board]);
    const winners = Hand.winners([playerHand, opponentHand]);
    if (winners.includes(playerHand)) equity += 1 / winners.length;
  }

  return equity / iterations;
}

function estimatePostflopEquity(playerCards, community, iterations = 140, random = Math.random) {
  if (!Array.isArray(playerCards) || playerCards.length !== 2 || !community.length) return 0;
  const blocked = new Set([...playerCards, ...community]);
  const available = allCards.filter((card) => !blocked.has(card));
  const missingBoardCards = 5 - community.length;
  let equity = 0;

  for (let trial = 0; trial < iterations; trial += 1) {
    const trialDeck = [...available];
    const cardsNeeded = 2 + missingBoardCards;
    for (let index = 0; index < cardsNeeded; index += 1) {
      const swapIndex = index + Math.min(
        trialDeck.length - index - 1,
        Math.floor(random() * (trialDeck.length - index)),
      );
      [trialDeck[index], trialDeck[swapIndex]] = [trialDeck[swapIndex], trialDeck[index]];
    }
    const opponent = trialDeck.slice(0, 2);
    const board = [...community, ...trialDeck.slice(2, cardsNeeded)];
    const playerHand = Hand.solve([...playerCards, ...board]);
    const opponentHand = Hand.solve([...opponent, ...board]);
    const winners = Hand.winners([playerHand, opponentHand]);
    if (winners.includes(playerHand)) equity += 1 / winners.length;
  }

  return equity / iterations;
}

function estimateComputerEquity(room, player, callAmount = 0, random = Math.random) {
  const opponentCount = Math.max(1, livePlayers(room).filter((item) => item.id !== player.id).length);
  if (room.community.length > 0) {
    const headsUpEquity = estimatePostflopEquity(player.hand, room.community, 140, random);
    return headsUpEquity ** opponentCount;
  }
  const { bigBlind } = currentBlinds(room);
  const raiseSizeInBlinds = callAmount / Math.max(1, bigBlind);
  const opponentRange = callAmount > 0
    ? Math.max(0.16, Math.min(0.65, 0.68 - Math.log2(1 + raiseSizeInBlinds) * 0.12))
    : 1;
  const headsUpEquity = estimatePreflopEquityAgainstRange(player.hand, opponentRange, 140, random);
  return headsUpEquity ** opponentCount;
}

function currentPreflopAllInAggressor(room, player) {
  if (room.phase !== "preflop" || room.community.length > 0) return null;
  for (let index = room.actionLog.length - 1; index >= 0; index -= 1) {
    const entry = room.actionLog[index];
    if (entry.phase !== "preflop" || !/^Raises to\s+/i.test(entry.action || "")) continue;
    const aggressor = room.players.find((item) => item.id === entry.playerId);
    if (aggressor && aggressor.id !== player.id && aggressor.allIn && aggressor.bet === room.currentBet) return aggressor;
  }
  return room.players.find((item) => (
    item.id !== player.id && !item.folded && item.allIn && item.bet === room.currentBet
  )) || null;
}

function assessPreflopAllInCall(room, player, aggressor, { iterations = 180, random = Math.random } = {}) {
  const { bigBlind } = currentBlinds(room);
  const callAmount = Math.max(0, room.currentBet - player.bet);
  const effectiveStack = Math.min(player.bet + player.stack, aggressor.bet);
  const effectiveBigBlinds = effectiveStack / bigBlind;
  const profile = computerProfile(player);
  const shoveRange = preflopShoveRange(effectiveBigBlinds, aggressor.preflopShoveStreak || 1, profile);
  const headsUpEquity = estimatePreflopEquityAgainstRange(player.hand, shoveRange, iterations, random);
  const opponentCount = Math.max(1, livePlayers(room).filter((item) => item.id !== player.id).length);
  const equity = headsUpEquity ** opponentCount;
  const requiredEquity = callAmount / Math.max(1, collectPot(room) + callAmount);
  const safetyMargin = Math.max(-0.01, Math.min(0.055, 0.025 + (1 - profile.looseness) * 0.05));
  const judgmentNoise = (random() - 0.5) * (1 - profile.skill) * 0.05;
  return {
    call: equity + judgmentNoise >= requiredEquity + safetyMargin,
    effectiveBigBlinds,
    equity,
    requiredEquity,
    shoveRange,
  };
}

function chooseComputerAction(room, player) {
  const { bigBlind } = currentBlinds(room);
  const callAmount = Math.max(0, room.currentBet - player.bet);
  const maxBet = player.bet + player.stack;
  const canRaise = room.raiseEligible.has(player.id) && maxBet > room.currentBet;
  const minRaiseTo = Math.min(maxBet, room.currentBet + room.minRaise);
  const profile = computerProfile(player);
  const rawConfidence = estimateComputerConfidence(room, player);
  const judgmentNoise = (Math.random() - 0.5) * (1 - profile.skill) * 0.42;
  let confidence = Math.max(0.04, Math.min(0.96, rawConfidence + judgmentNoise));

  if (callAmount === 0) {
    const equity = estimateComputerEquity(room, player);
    const perceptionNoise = (Math.random() - 0.5) * (1 - profile.skill) * 0.07;
    confidence = Math.max(0.04, Math.min(0.96, equity * 0.78 + rawConfidence * 0.22 + perceptionNoise));
    const valueRaiseChance = confidence > 0.46
      ? Math.min(0.92, (confidence - 0.34) * 1.35 * profile.aggression)
      : 0;
    const bluffRaiseChance = confidence < 0.42 ? profile.bluff * 1.15 : profile.bluff * 0.28;
    if (canRaise && minRaiseTo <= maxBet && Math.random() < valueRaiseChance + bluffRaiseChance) {
      return { type: "raise", raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, confidence) };
    }
    return { type: "check" };
  }

  const allInAggressor = currentPreflopAllInAggressor(room, player);
  if (allInAggressor) {
    return assessPreflopAllInCall(room, player, allInAggressor).call ? { type: "call" } : { type: "fold" };
  }

  const blindCallChance = preflopBlindCallChance(room, player, callAmount);
  if (blindCallChance !== null) {
    if (canRaise && minRaiseTo <= maxBet && Math.random() < preflopBlindRaiseChance(player, confidence)) {
      return { type: "raise", raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, confidence) };
    }
    if (Math.random() < Math.min(0.98, blindCallChance * profile.looseness)) return { type: "call" };
    return { type: "fold" };
  }

  const equity = estimateComputerEquity(room, player, callAmount);
  const potAfterCall = collectPot(room) + callAmount;
  const requiredEquity = callAmount / Math.max(1, potAfterCall);
  const betPressure = callAmount / Math.max(bigBlind, collectPot(room));
  const safetyMargin = Math.max(0.005, Math.min(0.08, 0.02 + betPressure * 0.025 + (1 - profile.looseness) * 0.04));
  const perceptionNoise = (Math.random() - 0.5) * (1 - profile.skill) * 0.07;
  const perceivedEquity = Math.max(0.02, Math.min(0.98, equity + perceptionNoise));
  const edge = perceivedEquity - requiredEquity - safetyMargin;
  const callChance = Math.max(0.04, Math.min(0.98, 0.5 + edge * 3.2 + (profile.looseness - 1) * 0.16));
  const valueReraiseChance = perceivedEquity > 0.56
    ? Math.min(0.9, (perceivedEquity - 0.4) * 1.55 * profile.aggression)
    : 0;
  const reraiseChance = Math.min(0.92, valueReraiseChance + profile.bluff * 0.16);
  if (canRaise && minRaiseTo <= maxBet && Math.random() < reraiseChance) {
    return { type: "raise", raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, perceivedEquity) };
  }
  if (Math.random() < callChance) return { type: "call" };
  return { type: "fold" };
}

function isSoloHumanFolded(room) {
  const humans = room.players.filter((player) => !player.isBot);
  return humans.length === 1 && humans[0].folded;
}

  function serializeRoom(room, viewerId) {
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
      buyInCents: room.buyInCents || 0,
      chipValueCents: chipValueCents(room),
      settlements: room.settlements || [],
      ledger: [],
      offline: Boolean(room.offline),
      turn: room.turn,
      isYourTurn: room.turn === viewerId,
      canRaise: raiseOpen && viewerMaxBet >= minRaiseTo,
      canShove: raiseOpen && viewerMaxBet > room.currentBet,
      canCashIn: false,
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
        canMakeHost: false,
        canKick: false,
        cards: player.id === viewerId || player.showCards
          ? player.hand.map(publicCard)
          : player.hand.map(() => null),
      })),
    };
  }

  function createPracticeRoom(options = {}) {
    const tableSize = cleanTableSize(options.tableSize) || 6;
    const startingStack = Math.max(1, Math.floor(Number(options.startingStack) || STARTING_STACK));
    const smallBlind = cleanBlind(options.smallBlind, DEFAULT_SMALL_BLIND);
    const bigBlind = cleanBlind(options.bigBlind, DEFAULT_BIG_BLIND);
    const name = cleanName(options.name);
    const playerId = String(options.playerId || "practice-hero");
    const botCount = options.botCount != null
      ? Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(Number(options.botCount))))
      : Math.max(1, tableSize - 1);

    const hero = makePlayer({ id: playerId, name, isBot: false });
    hero.stack = startingStack;
    hero.color = PLAYER_COLORS[0];
    hero.connected = true;

    const room = {
      id: "PRACTICE",
      hostId: playerId,
      tableSize,
      status: "lobby",
      phase: "lobby",
      deck: [],
      community: [],
      dealer: 0,
      turn: null,
      currentBet: 0,
      minRaise: bigBlind,
      deadPot: 0,
      acted: new Set(),
      raiseEligible: new Set(),
      message: "Practice table ready. Ready up to deal.",
      winners: [],
      actionLog: [],
      handNumber: 0,
      moneyMode: false,
      moneyUnitCents: null,
      buyInCents: 0,
      baseSmallBlind: smallBlind,
      baseBigBlind: bigBlind,
      chipValueCents: 1,
      settlements: [],
      moneyLedger: [],
      offline: true,
      startingStack,
      showdownTimer: null,
      botTimer: null,
      players: [hero],
    };

    const targetSeats = Math.min(MAX_PLAYERS, Math.max(2, 1 + botCount));
    addComputerPlayers(room, targetSeats);
    for (const player of room.players) {
      if (player.isBot) player.stack = startingStack;
    }
    room.tableSize = room.players.length;
    return room;
  }

  function restartPracticeRoom(room) {
    clearTimeout(room.botTimer);
    clearTimeout(room.showdownTimer);
    room.showdownTimer = null;
    room.botTimer = null;
    const stack = Math.max(1, Math.floor(Number(room.startingStack) || STARTING_STACK));
    for (const player of room.players) {
      player.stack = stack;
      player.buyInsCents = 0;
      player.cashOutCents = 0;
      player.hand = [];
      player.folded = false;
      player.allIn = false;
      player.bet = 0;
      player.invested = 0;
      player.showCards = false;
      player.ready = false;
      player.sittingOut = false;
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
    room.actionLog = [];
    room.message = "Practice restarted. Ready up when you want the next hand.";
  }

  function endPracticeGame(room) {
    if (isHandInProgress(room)) {
      for (const player of room.players) player.stack += player.invested;
    }
    resetHandState(room);
    room.status = "lobby";
    room.phase = "lobby";
    room.turn = null;
    room.message = "Game ended by host.";
    room.actionLog = [];
  }


  return {
    STARTING_STACK,
    BLIND_LEVELS,
    DEFAULT_BIG_BLIND,
    DEFAULT_SMALL_BLIND,
    MAX_PLAYERS,
    BOT_PROFILES,
    PLAYER_COLORS,
    ranks,
    suits,
    allCards,
    setRandomInt,
    randomInt,
    blindLevelForHand,
    currentBlinds,
    makeDeck,
    publicCard,
    cleanName,
    cleanBlind,
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
    beginShowdown,
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
    chipValueCents,
    chipsToCents,
    serializeRoom,
    createPracticeRoom,
    restartPracticeRoom,
    endPracticeGame,
  };
});
