const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Hand } = require("pokersolver");
const { customAlphabet } = require("nanoid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const makeId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

const PORT = process.env.PORT || 3000;
const STARTING_STACK = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MAX_PLAYERS = 8;

app.use(express.static("public"));

const rooms = new Map();
const socketRoom = new Map();
const socketPlayer = new Map();

const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const suits = ["s", "h", "d", "c"];

function makeDeck() {
  const deck = [];
  for (const rank of ranks) for (const suit of suits) deck.push(`${rank}${suit}`);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
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

function makeRoom(hostId, hostName, socketId) {
  const id = makeId();
  const room = {
    id,
    hostId,
    status: "lobby",
    phase: "lobby",
    deck: [],
    community: [],
    dealer: 0,
    turn: null,
    currentBet: 0,
    minRaise: BIG_BLIND,
    acted: new Set(),
    message: "Invite friends with this room link.",
    winners: [],
    handNumber: 0,
    players: [
      {
        id: hostId,
        socketIds: new Set([socketId]),
        name: hostName,
        stack: STARTING_STACK,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        connected: true,
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

function attachSocketToPlayer(socket, room, player) {
  if (!player.socketIds) player.socketIds = new Set();
  player.socketIds.add(socket.id);
  player.connected = true;
  socketRoom.set(socket.id, room.id);
  socketPlayer.set(socket.id, player.id);
  socket.join(room.id);
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

function resetHandState(room) {
  room.community = [];
  room.deck = makeDeck();
  room.currentBet = 0;
  room.minRaise = BIG_BLIND;
  room.acted = new Set();
  room.winners = [];
  for (const player of room.players) {
    player.hand = [];
    player.folded = false;
    player.allIn = player.stack <= 0;
    player.bet = 0;
    player.invested = 0;
  }
}

function isHandInProgress(room) {
  return ["preflop", "flop", "turn", "river", "showdown"].includes(room.phase);
}

function startHand(room) {
  const seated = room.players.filter((player) => player.stack > 0);
  if (seated.length < 2) {
    room.status = "lobby";
    room.phase = "lobby";
    room.message = "At least two players with chips are needed.";
    return;
  }

  resetHandState(room);
  room.status = "playing";
  room.phase = "preflop";
  room.handNumber += 1;

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
  postBlind(room, smallBlindIndex, SMALL_BLIND);
  postBlind(room, bigBlindIndex, BIG_BLIND);
  room.currentBet = Math.max(...room.players.map((player) => player.bet));

  const firstToAct = nextIndex(room, bigBlindIndex, (p) => !p.folded && !p.allIn && p.stack > 0);
  room.turn = firstToAct >= 0 ? room.players[firstToAct].id : null;
  room.message = `Hand ${room.handNumber}: blinds are ${SMALL_BLIND}/${BIG_BLIND}.`;
  maybeAdvance(room);
}

function startNextHand(room) {
  const nextDealer = nextIndex(room, room.dealer, (player) => player.stack > 0);
  room.dealer = nextDealer >= 0 ? nextDealer : 0;
  startHand(room);
}

function endGame(room) {
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
}

function dealStreet(room) {
  for (const player of room.players) player.bet = 0;
  room.currentBet = 0;
  room.minRaise = BIG_BLIND;
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
    settleShowdown(room);
    return;
  }

  const first = nextIndex(room, room.dealer, (p) => !p.folded && !p.allIn && p.stack > 0);
  room.turn = first >= 0 ? room.players[first].id : null;
  room.message = `${room.phase[0].toUpperCase()}${room.phase.slice(1)} betting.`;
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
    settleShowdown(room);
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
  return room.players.reduce((sum, player) => sum + player.invested, 0);
}

function awardUncontested(room, winner) {
  const amount = collectPot(room);
  winner.stack += amount;
  room.phase = "complete";
  room.turn = null;
  room.winners = [{ playerId: winner.id, name: winner.name, amount, hand: "Everyone else folded" }];
  room.message = `${winner.name} wins ${amount}.`;
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
  return pots;
}

function settleShowdown(room) {
  room.phase = "showdown";
  room.turn = null;
  const summaries = [];

  for (const pot of buildSidePots(room)) {
    const solved = pot.contenders.map((player) => ({
      player,
      hand: Hand.solve([...player.hand, ...room.community]),
    }));
    const winningHands = Hand.winners(solved.map((entry) => entry.hand));
    const winners = solved.filter((entry) => winningHands.includes(entry.hand));
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount % winners.length;

    for (const winner of winners) {
      const payout = share + (remainder > 0 ? 1 : 0);
      remainder -= 1;
      winner.player.stack += payout;
      summaries.push({
        playerId: winner.player.id,
        name: winner.player.name,
        amount: payout,
        hand: winner.hand.descr,
      });
    }
  }

  room.phase = "complete";
  room.winners = summaries;
  room.message = summaries.map((winner) => `${winner.name} wins ${winner.amount} with ${winner.hand}`).join(" · ");
}

function serializeRoom(room, viewerId) {
  const pot = collectPot(room);
  const viewer = room.players.find((player) => player.id === viewerId);
  const toCall = viewer && !viewer.folded && !viewer.allIn ? Math.max(0, room.currentBet - viewer.bet) : 0;
  const minRaiseTo = room.currentBet + room.minRaise;

  return {
    id: room.id,
    hostId: room.hostId,
    status: room.status,
    phase: room.phase,
    message: room.message,
    pot,
    currentBet: room.currentBet,
    minRaise: room.minRaise,
    minRaiseTo,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    handNumber: room.handNumber,
    turn: room.turn,
    isYourTurn: room.turn === viewerId,
    toCall,
    canStart: room.hostId === viewerId && room.players.filter((p) => p.stack > 0).length >= 2 && !isHandInProgress(room),
    canNextHand: room.hostId === viewerId && room.phase === "complete" && room.players.filter((p) => p.stack > 0).length >= 2,
    canEndGame: room.hostId === viewerId && room.phase !== "lobby",
    community: room.community.map(publicCard),
    winners: room.winners,
    players: room.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      stack: player.stack,
      bet: player.bet,
      invested: player.invested,
      folded: player.folded,
      allIn: player.allIn,
      connected: player.connected,
      dealer: index === room.dealer,
      isTurn: room.turn === player.id,
      isYou: player.id === viewerId,
      cards: player.id === viewerId || room.phase === "complete" || room.phase === "showdown"
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
}

function leaveCurrentRoom(socket) {
  const roomId = socketRoom.get(socket.id);
  const playerId = socketPlayer.get(socket.id);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.find((item) => item.id === playerId);
  if (player?.socketIds) {
    player.socketIds.delete(socket.id);
    player.connected = player.socketIds.size > 0;
  }
  socketRoom.delete(socket.id);
  socketPlayer.delete(socket.id);
  emitRoom(room);
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name, deviceId }, ack) => {
    const playerId = cleanDeviceId(deviceId, socket.id);
    const room = makeRoom(playerId, cleanName(name), socket.id);
    attachSocketToPlayer(socket, room, room.players[0]);
    ack?.({ ok: true, roomId: room.id });
    emitRoom(room);
  });

  socket.on("room:join", ({ roomId, name, deviceId }, ack) => {
    const room = getRoom(roomId);
    if (!room) return ack?.({ ok: false, error: "Room not found." });
    const playerId = cleanDeviceId(deviceId, socket.id);
    const existing = room.players.find((player) => player.id === playerId);
    if (existing) {
      existing.name = cleanName(name);
      attachSocketToPlayer(socket, room, existing);
      ack?.({ ok: true, roomId: room.id });
      emitRoom(room);
      return;
    }
    if (room.players.length >= MAX_PLAYERS) return ack?.({ ok: false, error: "Room is full." });
    if (room.phase !== "lobby" && room.phase !== "complete") {
      return ack?.({ ok: false, error: "This hand is in progress. Join after it ends." });
    }
    room.players.push({
      id: playerId,
      socketIds: new Set([socket.id]),
      name: cleanName(name),
      stack: STARTING_STACK,
      hand: [],
      folded: false,
      allIn: false,
      bet: 0,
      invested: 0,
      connected: true,
    });
    attachSocketToPlayer(socket, room, room.players[room.players.length - 1]);
    ack?.({ ok: true, roomId: room.id });
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
    if (room.phase === "lobby") return ack?.({ ok: false, error: "No game is in progress." });
    endGame(room);
    ack?.({ ok: true });
    emitRoom(room);
  });

  socket.on("game:action", ({ type, raiseTo }, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    const playerId = socketPlayer.get(socket.id);
    if (!room || room.turn !== playerId) return ack?.({ ok: false, error: "It is not your turn." });
    const index = playerIndex(room, playerId);
    const player = room.players[index];
    const callAmount = Math.max(0, room.currentBet - player.bet);

    if (type === "fold") {
      player.folded = true;
      room.acted.add(player.id);
      room.message = `${player.name} folds.`;
    } else if (type === "call" || type === "check") {
      if (type === "check" && callAmount > 0) return ack?.({ ok: false, error: "You cannot check while facing a bet." });
      const paid = Math.min(callAmount, player.stack);
      player.stack -= paid;
      player.bet += paid;
      player.invested += paid;
      if (player.stack === 0) player.allIn = true;
      room.acted.add(player.id);
      room.message = paid > 0 ? `${player.name} calls ${paid}.` : `${player.name} checks.`;
    } else if (type === "raise") {
      const target = Math.floor(Number(raiseTo));
      if (!Number.isFinite(target)) return ack?.({ ok: false, error: "Invalid raise." });
      const maxBet = player.bet + player.stack;
      if (target > maxBet) return ack?.({ ok: false, error: "You do not have enough chips." });
      const isAllInShortRaise = target === maxBet && target > room.currentBet;
      if (target < room.currentBet + room.minRaise && !isAllInShortRaise) {
        return ack?.({ ok: false, error: `Minimum raise is to ${room.currentBet + room.minRaise}.` });
      }
      const paid = target - player.bet;
      player.stack -= paid;
      player.invested += paid;
      const raiseSize = target - room.currentBet;
      player.bet = target;
      if (player.stack === 0) player.allIn = true;
      if (raiseSize >= room.minRaise) room.minRaise = raiseSize;
      room.currentBet = Math.max(room.currentBet, target);
      room.acted = new Set([player.id]);
      room.message = `${player.name} raises to ${target}.`;
    } else {
      return ack?.({ ok: false, error: "Unknown action." });
    }

    ack?.({ ok: true });
    advanceTurn(room, index);
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Texas Hold'em server listening on http://localhost:${PORT}`);
});
