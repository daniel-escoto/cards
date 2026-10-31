/**
 * Typed Hold'em engine factory — Node and browser share this implementation.
 */
/**
 * Shared Hold'em engine — pure rules + bots.
 * Works in Node (CommonJS) and the browser (UMD / script tag).
 * No Express, Socket.IO, fs, rooms Map, or money ledger.
 */

type Room = import("./types").Room;
type Player = import("./types").Player;
type PublicCard = import("./types").PublicCard;
type CardCode = import("./types").CardCode;
type BlindLevel = import("./types").BlindLevel;
type ActionLogEntry = import("./types").ActionLogEntry;
type ActionType = import("./types").ActionType;
type PlayerColor = import("./types").PlayerColor;
type WinnerSummary = import("./types").WinnerSummary;
type RandomIntFn = import("./engine-types").RandomIntFn;
type BotProfile = import("./engine-types").BotProfile;
type MakePlayerArgs = import("./engine-types").MakePlayerArgs;
type ActionMetadata = import("./engine-types").ActionMetadata;
type SidePot = import("./engine-types").SidePot;
type PracticeRoomOptions = import("./engine-types").PracticeRoomOptions;
type PracticeSnapshot = import("./engine-types").PracticeSnapshot;
type PlayerActionInput = import("./engine-types").PlayerActionInput;

import PokerSolver = require("./pokersolver");
type HandConstructor = PokerSolver.HandConstructor;

export function createHoldemEngine(Hand: HandConstructor) {
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
    {
      tag: "cpu_7f3a",
      style: "Loose cannon",
      short: "Loose",
      tempo: 0.9,
      aggression: 1.28,
      looseness: 1.24,
      bluff: 0.13,
      skill: 0.58,
      cbet: 0.55,
      barrel: 0.4,
      stickiness: 0.05,
      heroCall: 0.05,
    },
    {
      tag: "cpu_b204",
      style: "Patient grinder",
      short: "Grinder",
      tempo: 1.15,
      aggression: 0.72,
      looseness: 0.74,
      bluff: 0.025,
      skill: 0.82,
      cbet: 0.5,
      barrel: 0.08,
      stickiness: -0.07,
      heroCall: 0.01,
    },
    {
      tag: "cpu_19d8",
      style: "Balanced regular",
      short: "Balanced",
      tempo: 1,
      aggression: 1.02,
      looseness: 1.0,
      bluff: 0.065,
      skill: 0.76,
      cbet: 0.56,
      barrel: 0.34,
      stickiness: 0,
      heroCall: 0.03,
    },
    {
      tag: "cpu_e621",
      style: "Pressure player",
      short: "Pressure",
      tempo: 0.95,
      aggression: 1.48,
      looseness: 1.08,
      bluff: 0.1,
      skill: 0.68,
      cbet: 0.55,
      barrel: 0.58,
      stickiness: 0,
      heroCall: 0.03,
    },
    {
      tag: "cpu_04ac",
      style: "Casual caller",
      short: "Casual",
      tempo: 1.05,
      aggression: 0.64,
      looseness: 1.3,
      bluff: 0.02,
      skill: 0.48,
      cbet: 0.06,
      barrel: 0.01,
      stickiness: 0.14,
      heroCall: 0.1,
    },
    {
      tag: "cpu_c97e",
      style: "Sharp and tricky",
      short: "Tricky",
      tempo: 1.1,
      aggression: 1.12,
      looseness: 0.94,
      bluff: 0.09,
      skill: 0.9,
      cbet: 0.56,
      barrel: 0.6,
      stickiness: 0.02,
      heroCall: 0.1,
    },
    {
      tag: "cpu_52b1",
      style: "Tight and quick",
      short: "Quick",
      tempo: 0.6,
      aggression: 0.84,
      looseness: 0.68,
      bluff: 0.035,
      skill: 0.7,
      cbet: 0.55,
      barrel: 0.24,
      stickiness: 0.03,
      heroCall: 0.02,
    },
  ];
  const PLAYER_COLORS = [
    "#60a5fa",
    "#38bdf8",
    "#7ddc85",
    "#f472b6",
    "#a78bfa",
    "#fb7185",
    "#818cf8",
    "#2dd4bf",
    "#fbbf24",
  ];

  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const suits = ["s", "h", "d", "c"];
  const allCards = ranks.flatMap((rank) => suits.map((suit) => `${rank}${suit}`));

  let randomInt: RandomIntFn = function defaultRandomInt(maxExclusive: number): number {
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

  function setRandomInt(fn: RandomIntFn): void {
    if (typeof fn === "function") randomInt = fn;
  }

  function cleanBlind(value: unknown, fallback: number): number {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function chipValueCents(room: Room): number {
    return Math.max(
      1,
      Math.floor(Number(room?.chipValueCents) || Number(room?.moneyUnitCents) || 1),
    );
  }

  function chipsToCents(room: Room, chips: number): number {
    return Math.round(Number(chips) || 0) * chipValueCents(room);
  }

  function blindLevelForHand(handNumber: number): BlindLevel {
    let remainingHands = Math.max(1, Math.floor(Number(handNumber) || 1));
    for (const level of BLIND_LEVELS) {
      if (remainingHands <= level.hands) return level;
      remainingHands -= level.hands;
    }
    return BLIND_LEVELS[BLIND_LEVELS.length - 1];
  }

  function currentBlinds(room: Room): { smallBlind: number; bigBlind: number } {
    const baseSmallBlind = Math.max(
      1,
      Math.floor(Number(room?.baseSmallBlind) || DEFAULT_SMALL_BLIND),
    );
    const baseBigBlind = Math.max(
      baseSmallBlind + 1,
      Math.floor(Number(room?.baseBigBlind) || DEFAULT_BIG_BLIND),
    );
    if (room?.moneyMode) return { smallBlind: baseSmallBlind, bigBlind: baseBigBlind };
    const level = blindLevelForHand(room?.handNumber || 1);
    return {
      smallBlind: Math.max(
        1,
        Math.round((baseSmallBlind * level.smallBlind) / DEFAULT_SMALL_BLIND),
      ),
      bigBlind: Math.max(2, Math.round((baseBigBlind * level.bigBlind) / DEFAULT_BIG_BLIND)),
    };
  }

  function makeDeck(): CardCode[] {
    const deck = [];
    for (const rank of ranks) for (const suit of suits) deck.push(`${rank}${suit}`);
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function publicCard(card: CardCode): PublicCard {
    const rankNames: Record<string, string> = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
    const suitNames: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
    return {
      code: card,
      rank: rankNames[card[0]] || card[0],
      suit: suitNames[card[1]],
      color: card[1] === "h" || card[1] === "d" ? "red" : "black",
    };
  }

  function cleanName(name: unknown): string {
    return (
      String(name || "Player")
        .trim()
        .slice(0, 18) || "Player"
    );
  }

  function cleanComputerPlayers(count: unknown): number {
    return Math.max(0, Math.min(MAX_PLAYERS, Math.floor(Number(count) || 0)));
  }

  function cleanTableSize(count: unknown): number {
    const parsed = Math.floor(Number(count) || 0);
    if (!parsed) return 0;
    return Math.max(2, Math.min(MAX_PLAYERS, parsed));
  }

  function cleanPlayerColor(color: unknown): PlayerColor {
    const normalized = String(color || "").toLowerCase();
    return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
  }

  function defaultPlayerColor(room: Room): string {
    const used = new Set(room.players.map((player) => player.color).filter(Boolean));
    return (
      PLAYER_COLORS.find((color) => !used.has(color)) ||
      PLAYER_COLORS[room.players.length % PLAYER_COLORS.length]
    );
  }

  function makePlayer({ id, name, socketId = null, isBot = false }: MakePlayerArgs): Player {
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
      sittingOut: false,
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

  function legacyComputerProfile(player: Pick<Player, "id"> | null | undefined): BotProfile {
    const number = Number(/:(\d+)$/.exec(player?.id || "")?.[1]) || 1;
    return BOT_PROFILES[(number - 1) % BOT_PROFILES.length];
  }

  /**
   * A CPU's personality. Seats carry a persisted `botProfile` tag (assigned at add
   * time); seats without one (rooms saved by older builds) fall back to the legacy
   * seat-number mapping so a restored room keeps its bots' behavior.
   */
  function computerProfile(
    player: (Pick<Player, "id"> & { botProfile?: string | null }) | null | undefined,
  ): BotProfile {
    const tag = player?.botProfile;
    if (tag) {
      const tagged = BOT_PROFILES.find((profile) => profile.tag === tag);
      if (tagged) return tagged;
    }
    return legacyComputerProfile(player);
  }

  /**
   * Pick a personality for a newly seated CPU: random start, then the next style
   * not already at the table (so small tables get variety). Persisted on the seat.
   */
  function assignComputerProfile(room: Pick<Room, "players">, player: Player): BotProfile {
    const used = new Set(
      room.players
        .filter((item) => item !== player && item.isBot)
        .map((item) => computerProfile(item).tag),
    );
    const start = randomInt(BOT_PROFILES.length);
    let chosen = BOT_PROFILES[start];
    for (let offset = 0; offset < BOT_PROFILES.length; offset += 1) {
      const candidate = BOT_PROFILES[(start + offset) % BOT_PROFILES.length];
      if (!used.has(candidate.tag)) {
        chosen = candidate;
        break;
      }
    }
    player.botProfile = chosen.tag;
    return chosen;
  }

  /** Think-time ranges (ms) before a CPU acts, before the personality tempo multiplier. */
  const CPU_THINK_MS = {
    check: [500, 900],
    fold: [600, 1300],
    act: [1000, 2500],
    tank: [3000, 4000],
    runout: [150, 300],
  } as const;
  const CPU_TANK_CHANCE = 0.3;

  /**
   * How long a CPU "thinks" before acting. Checks are quick, calls/raises take longer,
   * big decisions occasionally tank. Once the only human has folded, bots play the
   * rest out fast. `random` is injectable for tests.
   */
  function computerThinkDelayMs(
    room: Room,
    player: Player,
    action: { type: ActionType; raiseTo?: number },
    random: () => number = Math.random,
  ): number {
    const pick = ([min, max]: readonly [number, number]) => min + random() * (max - min);
    if (isSoloHumanFolded(room)) return Math.round(pick(CPU_THINK_MS.runout));
    const profile = computerProfile(player);
    if (action.type === "check") return Math.round(pick(CPU_THINK_MS.check) * profile.tempo);
    if (action.type === "fold") return Math.round(pick(CPU_THINK_MS.fold) * profile.tempo);
    const { bigBlind } = currentBlinds(room);
    const callAmount = Math.max(0, room.currentBet - player.bet);
    const committing =
      callAmount >= player.stack * 0.4 ||
      (action.type === "raise" && Number(action.raiseTo) >= player.bet + player.stack);
    const bigPot = collectPot(room) + callAmount >= bigBlind * 20;
    const range =
      (committing || bigPot) && random() < CPU_TANK_CHANCE ? CPU_THINK_MS.tank : CPU_THINK_MS.act;
    return Math.round(pick(range) * profile.tempo);
  }

  function computerName(player: Pick<Player, "id"> | null | undefined): string {
    const seed = String(player?.id || "cpu");
    let hash = 2166136261;
    for (const character of seed) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const value = hash >>> 0;
    const adjectives = [
      "Brave",
      "Chill",
      "Clever",
      "Cosmic",
      "Crimson",
      "Dusty",
      "Frosty",
      "Golden",
      "Happy",
      "Lucky",
      "Mighty",
      "Neon",
      "Quiet",
      "Rapid",
      "Sunny",
      "Velvet",
    ];
    const nouns = [
      "Badger",
      "Cobra",
      "Comet",
      "Falcon",
      "Fox",
      "Gecko",
      "Moth",
      "Otter",
      "Panda",
      "Raven",
      "Rook",
      "Shark",
      "Sloth",
      "Tiger",
      "Toast",
      "Wolf",
    ];
    const adjective = adjectives[value % adjectives.length];
    const noun = nouns[Math.floor(value / adjectives.length) % nouns.length];
    return `${adjective}${noun}`;
  }

  function addComputerPlayers(room: Room, totalPlayers: unknown): void {
    if (room.moneyMode) return;
    const target = cleanTableSize(totalPlayers) || cleanComputerPlayers(totalPlayers);
    if (target > 0) room.tableSize = target;
    const needed = Math.max(0, Math.min(MAX_PLAYERS, target) - room.players.length);
    for (let index = 0; index < needed; index += 1) {
      const botNumber = nextBotNumber(room);
      const bot = makePlayer({
        id: `bot:${room.id}:${botNumber}`,
        name: computerName({ id: `bot:${room.id}:${botNumber}` }),
        isBot: true,
      });
      assignComputerProfile(room, bot);
      room.players.push(bot);
    }
    if (needed > 0) room.message = `Computer table ready with ${room.players.length} players.`;
  }

  function nextBotNumber(room: Room): number {
    const used = new Set(
      room.players
        .map((player) => /^bot:[^:]+:(\d+)$/.exec(player.id)?.[1])
        .filter(Boolean)
        .map(Number),
    );
    for (let number = 1; number <= MAX_PLAYERS * 4; number += 1) {
      if (!used.has(number)) return number;
    }
    return Date.now();
  }

  function activePlayers(room: Room): Player[] {
    return room.players.filter((player) => player.stack > 0 || player.invested > 0);
  }

  function livePlayers(room: Room): Player[] {
    return room.players.filter(
      (player) => !player.folded && (player.stack > 0 || player.invested > 0),
    );
  }

  function canActPlayers(room: Room): Player[] {
    return room.players.filter((player) => !player.folded && !player.allIn && player.stack > 0);
  }

  function nextIndex(room: Room, fromIndex: number, predicate: (player: Player, index: number) => boolean): number {
    for (let offset = 1; offset <= room.players.length; offset += 1) {
      const index = (fromIndex + offset) % room.players.length;
      if (predicate(room.players[index], index)) return index;
    }
    return -1;
  }

  function playerIndex(room: Room, playerId: string | null | undefined): number {
    return room.players.findIndex((player) => player.id === playerId);
  }

  function postBlind(room: Room, index: number, amount: number): number {
    const player = room.players[index];
    const posted = Math.min(amount, player.stack);
    player.stack -= posted;
    player.bet += posted;
    player.invested += posted;
    if (player.stack === 0) player.allIn = true;
    return posted;
  }

  function logAction(room: Room, text: string, metadata: ActionMetadata = {}): void {
    room.actionLog.push({
      id: `${room.handNumber}-${room.actionLog.length + 1}`,
      phase: room.phase,
      text,
      ...metadata,
    });
    if (room.actionLog.length > 24) room.actionLog.shift();
  }

  function clearEngineTimer(timer: ReturnType<typeof setTimeout> | null | undefined): void {
    if (timer == null) return;
    // Combined DOM+Node libs disagree on Timeout vs number; call through globalThis.
    globalThis.clearTimeout(timer as Parameters<typeof globalThis.clearTimeout>[0]);
  }

  function resetHandState(room: Room): void {
    clearEngineTimer(room.showdownTimer);
    room.showdownTimer = null;
    const { bigBlind } = currentBlinds(room);
    room.community = [];
    room.deck = makeDeck();
    room.currentBet = 0;
    room.minRaise = bigBlind;
    room.deadPot = 0;
    room.acted = new Set();
    room.raiseEligible = new Set();
    room.smallBlindPlayerId = null;
    room.bigBlindPlayerId = null;
    room.winners = [];
    room.actionLog = [];
    room.riverAggressor = null;
    room.allInCardsExposed = false;
    room.rabbitCards = null;
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

  function isHandInProgress(room: Pick<Room, "phase">): boolean {
    return ["preflop", "flop", "turn", "river", "showdown"].includes(room.phase);
  }

  function canAdministerGame(room: Pick<Room, "phase"> | null | undefined): boolean {
    return ["lobby", "complete", "gameover"].includes(room?.phase ?? "");
  }

  function canReadyForHand(room: Pick<Room, "phase"> | null | undefined): boolean {
    return ["lobby", "complete"].includes(room?.phase ?? "");
  }

  function resetReadiness(room: Pick<Room, "players"> | null | undefined): void {
    for (const player of room?.players || []) {
      if (!player.isBot) player.ready = false;
    }
  }

  function maybeStartReadyHand(room: Room): boolean {
    if (!canReadyForHand(room)) return false;
    const seated = playersWithChips(room).filter((player) => !player.sittingOut);
    const humans = seated.filter((player) => !player.isBot);
    if (seated.length < 2 || humans.length === 0) return false;
    if (!humans.every((player) => player.connected && player.ready)) return false;
    if (room.phase === "complete") startNextHand(room);
    else startHand(room);
    return true;
  }

  function playersWithChips(room: Room): Player[] {
    return room.players.filter((player) => player.stack > 0);
  }

  function maybeEndGame(room: Room): boolean {
    if (room.moneyMode) return false;
    const remaining = playersWithChips(room);
    if (remaining.length >= 2 || room.phase !== "complete") return false;
    room.status = "complete";
    room.phase = "gameover";
    room.turn = null;
    room.message = remaining.length === 1 ? `${remaining[0].name} wins the game.` : "Game over.";
    return true;
  }

  /**
   * Chip game between hands where every human seat is out of chips but 2+ CPUs still
   * have chips. Without a rebuy nobody can ready up, so the table would sit frozen.
   * (One CPU left is already a normal game over via maybeEndGame.)
   */
  function humansBustedOut(room: Room): boolean {
    if (room.moneyMode || !canReadyForHand(room)) return false;
    const humans = room.players.filter((player) => !player.isBot);
    if (!humans.length || humans.some((player) => player.stack > 0)) return false;
    return room.players.filter((player) => player.isBot && player.stack > 0).length >= 2;
  }

  /**
   * Busted human tops back up to the room's starting stack and is marked ready, so the
   * next hand deals as soon as the caller runs the ready check.
   */
  function rebuyBustedPlayer(room: Room, playerId: string): { ok: boolean; error?: string } {
    const player = room.players.find((item) => item.id === playerId);
    if (!player || player.isBot) return { ok: false, error: "Player not found." };
    if (player.stack > 0 || !humansBustedOut(room)) {
      return { ok: false, error: "Rebuy is only available after you bust." };
    }
    const stack = Math.max(1, Math.floor(Number(room.startingStack) || STARTING_STACK));
    player.stack = stack;
    player.sittingOut = false;
    player.ready = true;
    player.preflopShoveStreak = 0;
    room.message = `${player.name} rebought for ${stack} chips.`;
    return { ok: true };
  }

  function startHand(room: Room): void {
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
      room.dealer = nextIndex(
        room,
        room.dealer,
        (player) => player.stack > 0 && !player.sittingOut,
      );
    }

    for (let round = 0; round < 2; round += 1) {
      for (let offset = 1; offset <= room.players.length; offset += 1) {
        const player = room.players[(room.dealer + offset) % room.players.length];
        if (player.stack > 0 && !player.sittingOut) player.hand.push(room.deck.pop() as CardCode);
      }
    }

    const headsUp = seated.length === 2;
    const smallBlindIndex = headsUp
      ? room.dealer
      : nextIndex(room, room.dealer, (p) => p.stack > 0 && !p.sittingOut);
    const bigBlindIndex = nextIndex(room, smallBlindIndex, (p) => p.stack > 0 && !p.sittingOut);
    postBlind(room, smallBlindIndex, smallBlind);
    postBlind(room, bigBlindIndex, bigBlind);
    room.smallBlindPlayerId = room.players[smallBlindIndex].id;
    room.bigBlindPlayerId = room.players[bigBlindIndex].id;
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

  function startNextHand(room: Room): void {
    const nextDealer = nextIndex(
      room,
      room.dealer,
      (player) => player.stack > 0 && !player.sittingOut,
    );
    room.dealer = nextDealer >= 0 ? nextDealer : 0;
    startHand(room);
  }

  function dealStreet(room: Room): void {
    const { bigBlind } = currentBlinds(room);
    for (const player of room.players) player.bet = 0;
    room.currentBet = 0;
    room.minRaise = bigBlind;
    room.acted = new Set();

    if (room.phase === "preflop") {
      room.deck.pop();
      room.community.push(
        room.deck.pop() as CardCode,
        room.deck.pop() as CardCode,
        room.deck.pop() as CardCode,
      );
      room.phase = "flop";
    } else if (room.phase === "flop") {
      room.deck.pop();
      room.community.push(room.deck.pop() as CardCode);
      room.phase = "turn";
    } else if (room.phase === "turn") {
      room.deck.pop();
      room.community.push(room.deck.pop() as CardCode);
      room.phase = "river";
    } else {
      beginShowdown(room);
      return;
    }

    const first = nextIndex(room, room.dealer, (p) => !p.folded && !p.allIn && p.stack > 0);
    room.raiseEligible = new Set(canActPlayers(room).map((player) => player.id));
    room.turn = first >= 0 ? room.players[first].id : null;
    room.message = room.allInCardsExposed
      ? `${room.phase[0].toUpperCase()}${room.phase.slice(1)} — all-in runout.`
      : `${room.phase[0].toUpperCase()}${room.phase.slice(1)} betting.`;
    logAction(room, `${room.phase[0].toUpperCase()}${room.phase.slice(1)} dealt.`);
    maybeAdvance(room);
  }

  function bettingComplete(room: Room): boolean {
    const actors = canActPlayers(room);
    if (actors.length === 0) return true;
    // Once every other contender is all-in, the last player with chips only
    // needs to respond to an outstanding bet. If they are already matched,
    // there is nobody who could call another bet, so run out the board.
    if (actors.length === 1 && actors[0].bet === room.currentBet) return true;
    return actors.every((player) => player.bet === room.currentBet && room.acted.has(player.id));
  }

  function shouldExposeAllInRunout(room: Room): boolean {
    if (livePlayers(room).length < 2) return false;
    if (!bettingComplete(room)) return false;
    // Two or more players can still bet on later streets — keep hole cards private.
    if (canActPlayers(room).length > 1) return false;
    return ["preflop", "flop", "turn"].includes(room.phase);
  }

  function exposeAllInRunoutHands(room: Room): boolean {
    if (room.allInCardsExposed) return false;
    let exposed = false;
    for (const player of livePlayers(room)) {
      if (!player.hand.length) continue;
      player.showCards = true;
      exposed = true;
    }
    if (exposed) {
      room.allInCardsExposed = true;
      room.message = "All in — cards up. Running out the board.";
      logAction(room, room.message);
    }
    return exposed;
  }

  function maybeAdvance(room: Room): void {
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

    // All remaining players all-in (or one matched vs all-ins): flip holes, then run out.
    if (shouldExposeAllInRunout(room)) {
      exposeAllInRunoutHands(room);
    }

    if (room.phase === "river") {
      beginShowdown(room);
    } else {
      dealStreet(room);
    }
  }

  function advanceTurn(room: Room, actorIndex: number): void {
    const next = nextIndex(room, actorIndex, (p) => !p.folded && !p.allIn && p.stack > 0);
    room.turn = next >= 0 ? room.players[next].id : null;
    maybeAdvance(room);
  }

  function collectPot(room: Room): number {
    return room.deadPot + room.players.reduce((sum, player) => sum + player.invested, 0);
  }

  function revealComputerHands(room: Room): void {
    // Kept for callers/tests; standard showdown no longer force-shows bot losers.
    for (const player of room.players) {
      if (player.isBot && player.hand.length) player.showCards = true;
    }
  }

  function awardUncontested(room: Room, winner: Player): void {
    const amount = collectPot(room);
    winner.stack += amount;
    room.phase = "complete";
    room.turn = null;
    // Fold-win: winner does not show. Optional Show hand remains via showPlayerCards.
    winner.showCards = false;
    room.winners = [
      { playerId: winner.id, name: winner.name, amount, hand: "Everyone folded" },
    ];
    room.message = `${winner.name} wins ${amount}.`;
    logAction(room, `${winner.name} wins ${amount}.`, {
      playerId: winner.id,
      action: `Wins ${amount}`,
    });
    maybeEndGame(room);
  }

  function showdownContenders(room: Room): Player[] {
    return room.players.filter((player) => !player.folded && player.hand.length >= 2);
  }

  function showdownOrder(room: Room): Player[] {
    const contenders = showdownContenders(room);
    if (!contenders.length) return [];

    const contenderIds = new Set(contenders.map((player) => player.id));
    const startIndex =
      room.riverAggressor && contenderIds.has(room.riverAggressor)
        ? playerIndex(room, room.riverAggressor)
        : nextIndex(room, room.dealer, (player) => contenderIds.has(player.id));
    if (startIndex < 0) return contenders.slice();

    const ordered = [];
    for (let offset = 0; offset < room.players.length; offset += 1) {
      const player = room.players[(startIndex + offset) % room.players.length];
      if (contenderIds.has(player.id)) ordered.push(player);
    }
    return ordered;
  }

  function playerCanWinOrTieEligiblePot(player: Player, pots: SidePot[], shownPlayers: Player[], community: CardCode[]): boolean {
    for (const pot of pots) {
      if (!pot.contenderIds.includes(player.id)) continue;
      const shownEligible = shownPlayers.filter((item) => pot.contenderIds.includes(item.id));
      if (!shownEligible.length) return true;
      const entries = [
        ...shownEligible.map((item) => ({
          player: item,
          hand: Hand.solve([...item.hand, ...community]),
        })),
        {
          player,
          hand: Hand.solve([...player.hand, ...community]),
        },
      ];
      const winningHands = Hand.winners(entries.map((entry) => entry.hand));
      if (
        entries.some((entry) => entry.player.id === player.id && winningHands.includes(entry.hand))
      ) {
        return true;
      }
    }
    return false;
  }

  function applyShowdownReveals(room: Room): Player[] {
    // All-in runout already flipped holes publicly; keep them up through settlement.
    if (room.allInCardsExposed) {
      for (const player of showdownContenders(room)) player.showCards = true;
      return showdownContenders(room);
    }

    const pots = buildSidePots(room);
    const shown = [];
    for (const player of showdownOrder(room)) {
      if (playerCanWinOrTieEligiblePot(player, pots, shown, room.community)) {
        player.showCards = true;
        shown.push(player);
      } else {
        player.showCards = false;
      }
    }
    // Anyone not in the showdown order keeps cards private.
    for (const player of room.players) {
      if (!shown.includes(player)) player.showCards = false;
    }
    for (const player of shown) player.showCards = true;
    return shown;
  }

  function buildSidePots(room: Room): SidePot[] {
    const levels = [...new Set(room.players.map((p) => p.invested).filter(Boolean))].sort(
      (a, b) => a - b,
    );
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

  function combineWinnerSummaries(summaries: WinnerSummary[]): WinnerSummary[] {
    const combined = new Map<string, WinnerSummary>();
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

  function settleShowdown(room: Room): void {
    clearEngineTimer(room.showdownTimer);
    room.showdownTimer = null;
    room.turn = null;
    const summaries = [];

    applyShowdownReveals(room);

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
          const aDistance =
            (aIndex - room.dealer + room.players.length) % room.players.length ||
            room.players.length;
          const bDistance =
            (bIndex - room.dealer + room.players.length) % room.players.length ||
            room.players.length;
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
    room.message = room.winners
      .map((winner) => `${winner.name} wins ${winner.amount} with ${winner.hand}`)
      .join(" · ");
    for (const winner of room.winners) {
      logAction(room, `${winner.name} wins ${winner.amount} with ${winner.hand}.`, {
        playerId: winner.playerId,
        action: `Wins ${winner.amount}`,
      });
    }
    maybeEndGame(room);
  }

  function beginShowdown(room: Room): boolean {
    if (room.showdownTimer || room.phase === "showdown") return false;
    room.phase = "showdown";
    room.turn = null;
    room.message = "Cards down. Revealing the winner…";
    return true;
  }

  function applyPlayerAction(room: Room, playerId: string, { type, raiseTo }: PlayerActionInput): { ok: true } | { ok: false; error: string } {
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
      if (type === "check" && callAmount > 0)
        return { ok: false, error: "You cannot check while facing a bet." };
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
        player.preflopShoveStreak =
          target === maxBet ? Math.min(8, (player.preflopShoveStreak || 0) + 1) : 0;
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
        room.raiseEligible = new Set(
          canActPlayers(room)
            .filter((item) => item.id !== player.id)
            .map((item) => item.id),
        );
      } else {
        room.raiseEligible.delete(player.id);
      }
      if (room.phase === "river") room.riverAggressor = player.id;
      room.message = `${player.name} raises to ${target}.`;
      logAction(room, room.message, { playerId: player.id, action: `Raises to ${target}` });
    } else {
      return { ok: false, error: "Unknown action." };
    }

    advanceTurn(room, index);
    return { ok: true };
  }

  function showPlayerCards(room: Room, playerId: string): { ok: true } | { ok: false; error: string } {
    const player = room?.players.find((item) => item.id === playerId);
    if (!room || !player) return { ok: false, error: "Player not found." };
    if (room.phase !== "complete")
      return { ok: false, error: "You can show your hand after the hand ends." };
    if (!player.hand.length) return { ok: false, error: "No hand to show." };
    if (player.showCards) return { ok: true };
    player.showCards = true;
    room.message = `${player.name} shows their hand.`;
    // Never put hole-card codes in the shared action log — cards go out via showCards serialization.
    logAction(room, room.message, {
      playerId: player.id,
      action: "Shows hand",
    });
    return { ok: true };
  }

  /** Rabbit hunt ("Show rest of board") is on unless the host turned it off. */
  function rabbitHuntEnabled(room: Pick<Room, "rabbitHuntEnabled">): boolean {
    return room.rabbitHuntEnabled !== false;
  }

  /**
   * The community cards the deal would have produced had the hand continued, taken
   * from the hand's real deck with burns exactly like dealStreet (pop = top of deck:
   * burn + 3 for the flop, burn + 1 for the turn, burn + 1 for the river). Read-only:
   * the deck itself is not touched. Null when the board is complete or the deck is gone.
   */
  function rabbitHuntRunout(room: Pick<Room, "deck" | "community">): CardCode[] | null {
    if (!Array.isArray(room.deck) || room.community.length >= 5) return null;
    const deck = room.deck.slice();
    const cards: CardCode[] = [];
    let boardSize = room.community.length;
    while (boardSize < 5) {
      deck.pop(); // burn
      const count = boardSize === 0 ? 3 : 1;
      for (let index = 0; index < count; index += 1) {
        const card = deck.pop();
        if (!card) return null;
        cards.push(card);
      }
      boardSize += count;
    }
    return cards;
  }

  /** Hand ended early because everyone else folded (one player left with cards). */
  function handEndedOnFold(room: Room): boolean {
    if (room.phase !== "complete" || room.community.length >= 5) return false;
    const dealt = room.players.filter((player) => player.hand.length === 2);
    return dealt.length >= 2 && dealt.filter((player) => !player.folded).length === 1;
  }

  function canRabbitHunt(room: Room): boolean {
    return (
      rabbitHuntEnabled(room) &&
      handEndedOnFold(room) &&
      !room.rabbitCards?.length &&
      rabbitHuntRunout(room) !== null
    );
  }

  /** Revealed "would have been" cards for clients (only while that hand is on screen). */
  function visibleRabbitCards(room: Room): CardCode[] {
    if (!rabbitHuntEnabled(room) || room.phase !== "complete" || !room.rabbitCards?.length)
      return [];
    return room.rabbitCards.slice(0, 5 - room.community.length);
  }

  /**
   * Any seated player reveals the rest of the board after a fold-win. Display only:
   * chips, pot, winners and the action log are untouched. Idempotent.
   */
  function revealRabbitHunt(
    room: Room,
    playerId: string,
  ): { ok: true } | { ok: false; error: string } {
    const player = room?.players.find((item) => item.id === playerId);
    if (!room || !player) return { ok: false, error: "Only seated players can show the board." };
    if (visibleRabbitCards(room).length) return { ok: true };
    if (!rabbitHuntEnabled(room)) return { ok: false, error: "Show rest of board is off." };
    if (!canRabbitHunt(room)) return { ok: false, error: "Nothing left to show." };
    room.rabbitCards = rabbitHuntRunout(room);
    room.message = `${player.name} showed the rest of the board.`;
    return { ok: true };
  }

  /** Host setting; turning it off also hides an already revealed runout. */
  function setRabbitHunt(room: Room, enabled: boolean): void {
    room.rabbitHuntEnabled = Boolean(enabled);
  }

  const HOLE_CARD_CODE_RE = /\b[2-9TJQKA][shdc]\b/gi;

  function sanitizeActionLogForClient(actionLog: ActionLogEntry[] | null | undefined): ActionLogEntry[] {
    return (actionLog || []).map((entry) => {
      const next = { ...entry };
      if (typeof next.action === "string" && /^Shows\b/i.test(next.action)) {
        next.action = "Shows hand";
      }
      if (typeof next.text === "string") {
        next.text = next.text.replace(HOLE_CARD_CODE_RE, "??");
      }
      if (typeof next.action === "string") {
        next.action = next.action.replace(HOLE_CARD_CODE_RE, "??");
      }
      return next;
    });
  }

  function visibleHoleCards(player: Player, viewerId: string): Array<PublicCard | null> {
    if (!player) return [];
    if (player.id === viewerId || player.showCards) {
      return player.hand.map(publicCard);
    }
    return player.hand.map(() => null);
  }

  function cardRankValue(card: CardCode): number {
    return ranks.indexOf(card[0]) + 2;
  }

  function estimateComputerConfidence(room: Room, player: Player): number {
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

  function chooseComputerRaiseTo(room: Room, player: Player, minRaiseTo: number, confidence: number): number {
    const { bigBlind } = currentBlinds(room);
    const maxBet = player.bet + player.stack;
    const pot = Math.max(bigBlind * 2, collectPot(room));
    const profile = computerProfile(player);
    const pressureRaise = minRaiseTo + bigBlind * (confidence > 0.65 ? 2 : 1);
    const potRaise =
      room.currentBet +
      Math.max(
        room.minRaise || bigBlind,
        Math.ceil((pot * (confidence > 0.66 ? 0.7 : 0.5)) / bigBlind) * bigBlind,
      );
    const isPreflopOpen =
      room.phase === "preflop" &&
      (!room.community || room.community.length === 0) &&
      room.currentBet <= bigBlind;
    let preferred;
    if (isPreflopOpen) {
      // Prefer ~2.5–3x opens instead of frequent min-raises.
      const openTo = Math.max(minRaiseTo, Math.round((confidence > 0.68 ? 3 : 2.5) * bigBlind));
      preferred =
        Math.random() < 0.62 + profile.aggression * 0.14
          ? openTo
          : Math.max(minRaiseTo, pressureRaise);
    } else {
      preferred = Math.max(
        minRaiseTo,
        Math.random() < 0.42 + profile.aggression * 0.2 ? potRaise : pressureRaise,
      );
    }
    return Math.min(maxBet, preferred);
  }

  /**
   * Chance to limp / complete / defend when facing at most one big blind preflop.
   * Driven by preflopHandScore against a per-style threshold: tight styles play
   * roughly the top 20% of hands, loose styles roughly the top 45%. No floor, so
   * trash folds.
   */
  function preflopBlindCallChance(room: Room, player: Player, callAmount: number): number | null {
    const { bigBlind } = currentBlinds(room);
    if (room.phase !== "preflop" || room.community.length > 0 || callAmount > bigBlind) return null;
    // Completing the small blind is cheaper, so defend a little wider.
    const discount = callAmount < bigBlind ? 0.04 : 0;
    const threshold =
      preflopPlayThreshold(player) -
      discount -
      preflopTableWiden(room) -
      preflopBigBlindDiscount(room, player);
    return Math.max(0, Math.min(0.97, 0.5 + (preflopHandScore(player.hand) - threshold) / 0.08));
  }

  /** Players dealt into this hand (folded players keep their cards until the reset). */
  function playersDealtIn(room: Room): number {
    return room.players.filter((item) => item.hand.length === 2).length;
  }

  /**
   * Short-handed tables play wider: lowers the preflop bar by 0.035 per missing seat
   * below six dealt in (6-max unchanged, 3-handed −0.105, heads-up −0.14).
   */
  function preflopTableWiden(room: Room): number {
    return Math.max(0, Math.min(0.14, (6 - playersDealtIn(room)) * 0.035));
  }

  /**
   * Short-handed (≤3 dealt in) big blind already has a blind in and closes the action,
   * so it defends wider. 0 for everyone else.
   */
  function preflopBigBlindDiscount(room: Room, player: Player): number {
    return room.bigBlindPlayerId === player.id && playersDealtIn(room) <= 3 ? 0.04 : 0;
  }

  /** preflopHandScore a style needs to play a hand (looser styles need less). */
  function preflopPlayThreshold(player: Player): number {
    return 0.57 - (computerProfile(player).looseness - 0.68) * 0.13;
  }

  /**
   * Multiplier on the pot-odds call chance when facing a preflop raise: flatting a
   * raise needs a hand a notch better than limping does, so weak hands stop
   * calling opens just because the price looks good. 1 outside that spot.
   */
  function preflopFacingRaiseGate(room: Room, player: Player, callAmount: number): number {
    const { bigBlind } = currentBlinds(room);
    if (room.phase !== "preflop" || room.community.length > 0 || callAmount <= bigBlind) return 1;
    const bb = preflopBigBlindDiscount(room, player);
    // Short-handed BB gets a discounted price: scale the extra bar with the raise size
    // (2x → +0, 2.5x → +0.04, 3x and up → the full +0.08).
    const extra = bb
      ? Math.max(0, Math.min(PREFLOP_FLAT_RAISE_EXTRA, (room.currentBet / bigBlind - 2) * 0.08))
      : PREFLOP_FLAT_RAISE_EXTRA;
    const threshold = preflopPlayThreshold(player) + extra - preflopTableWiden(room) - bb;
    return Math.max(0, Math.min(1, 0.5 + (preflopHandScore(player.hand) - threshold) / 0.08));
  }

  /**
   * Aggressive styles turn part of their limping range into open-raises when the pot
   * is still unopened (only blinds/limps in).
   */
  const PREFLOP_FLAT_RAISE_EXTRA = 0.08;

  function preflopOpenInsteadOfLimpChance(player: Player): number {
    const profile = computerProfile(player);
    return Math.max(0, Math.min(0.75, (profile.aggression - 1) * 1.2));
  }

  function preflopBlindRaiseChance(player: Player, confidence: number): number {
    const profile = computerProfile(player);
    const valueRaiseChance = confidence >= 0.42 ? (confidence - 0.2) * 1.2 * profile.aggression : 0;
    const bluffRaiseChance = confidence < 0.44 ? profile.bluff * 0.55 : profile.bluff * 0.16;
    return Math.max(0, Math.min(0.9, valueRaiseChance + bluffRaiseChance));
  }

  function preflopHandScore(cards: CardCode[]): number {
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

  function preflopShoveRange(effectiveBigBlinds: number, shoveStreak = 1, profile: BotProfile = BOT_PROFILES[2]): number {
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

  function estimatePreflopEquityAgainstRange(
    playerCards: CardCode[],
    rangeFraction: number,
    iterations = 180,
    random: () => number = Math.random,
  ): number {
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
    const candidateCount = Math.max(
      1,
      Math.ceil(opponentCombos.length * Math.max(0.02, Math.min(1, rangeFraction))),
    );
    const candidates = opponentCombos.slice(0, candidateCount);
    let equity = 0;

    for (let trial = 0; trial < iterations; trial += 1) {
      const opponent =
        candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))].cards;
      const opponentSet = new Set(opponent);
      const boardDeck = available.filter((card) => !opponentSet.has(card));
      for (let index = 0; index < 5; index += 1) {
        const swapIndex =
          index +
          Math.min(boardDeck.length - index - 1, Math.floor(random() * (boardDeck.length - index)));
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

  function estimatePostflopEquity(playerCards: CardCode[], community: CardCode[], iterations = 140, random: () => number = Math.random): number {
    if (!Array.isArray(playerCards) || playerCards.length !== 2 || !community.length) return 0;
    const blocked = new Set([...playerCards, ...community]);
    const available = allCards.filter((card) => !blocked.has(card));
    const missingBoardCards = 5 - community.length;
    let equity = 0;

    for (let trial = 0; trial < iterations; trial += 1) {
      const trialDeck = [...available];
      const cardsNeeded = 2 + missingBoardCards;
      for (let index = 0; index < cardsNeeded; index += 1) {
        const swapIndex =
          index +
          Math.min(trialDeck.length - index - 1, Math.floor(random() * (trialDeck.length - index)));
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

  function estimateComputerEquity(room: Room, player: Player, callAmount = 0, random: () => number = Math.random): number {
    const opponentCount = Math.max(
      1,
      livePlayers(room).filter((item) => item.id !== player.id).length,
    );
    if (room.community.length > 0) {
      const headsUpEquity = estimatePostflopEquity(player.hand, room.community, 140, random);
      return headsUpEquity ** opponentCount;
    }
    const { bigBlind } = currentBlinds(room);
    const raiseSizeInBlinds = callAmount / Math.max(1, bigBlind);
    const opponentRange =
      callAmount > 0
        ? Math.max(0.16, Math.min(0.65, 0.68 - Math.log2(1 + raiseSizeInBlinds) * 0.12))
        : 1;
    const headsUpEquity = estimatePreflopEquityAgainstRange(
      player.hand,
      opponentRange,
      140,
      random,
    );
    return headsUpEquity ** opponentCount;
  }

  function currentPreflopAllInAggressor(room: Room, player: Player): Player | null {
    if (room.phase !== "preflop" || room.community.length > 0) return null;
    for (let index = room.actionLog.length - 1; index >= 0; index -= 1) {
      const entry = room.actionLog[index];
      if (entry.phase !== "preflop" || !/^Raises to\s+/i.test(entry.action || "")) continue;
      const aggressor = room.players.find((item) => item.id === entry.playerId);
      if (
        aggressor &&
        aggressor.id !== player.id &&
        aggressor.allIn &&
        aggressor.bet === room.currentBet
      )
        return aggressor;
    }
    return (
      room.players.find(
        (item) =>
          item.id !== player.id && !item.folded && item.allIn && item.bet === room.currentBet,
      ) || null
    );
  }

  function assessPreflopAllInCall(
    room: Room,
    player: Player,
    aggressor: Player,
    { iterations = 180, random = Math.random }: { iterations?: number; random?: () => number } = {},
  ): {
    call: boolean;
    effectiveBigBlinds: number;
    equity: number;
    requiredEquity: number;
    shoveRange: number;
  } {
    const { bigBlind } = currentBlinds(room);
    const callAmount = Math.max(0, room.currentBet - player.bet);
    const effectiveStack = Math.min(player.bet + player.stack, aggressor.bet);
    const effectiveBigBlinds = effectiveStack / bigBlind;
    const profile = computerProfile(player);
    const shoveRange = preflopShoveRange(
      effectiveBigBlinds,
      aggressor.preflopShoveStreak || 1,
      profile,
    );
    const headsUpEquity = estimatePreflopEquityAgainstRange(
      player.hand,
      shoveRange,
      iterations,
      random,
    );
    const opponentCount = Math.max(
      1,
      livePlayers(room).filter((item) => item.id !== player.id).length,
    );
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

  /**
   * Outs to a flush or straight that use at least one hole card (0 on the river or
   * once the hand is already made). Open-ender / double gutter = 8, gutshot = 4,
   * flush draw = 9; combos cap at 15.
   */
  function countDrawOuts(hand: CardCode[], community: CardCode[]): number {
    if (hand.length !== 2 || community.length < 3 || community.length >= 5) return 0;
    const cards = [...hand, ...community];
    let outs = 0;
    for (const suit of suits) {
      const count = cards.filter((card) => card[1] === suit).length;
      if (count === 4 && hand.some((card) => card[1] === suit)) outs += 9;
      if (count >= 5) return 0;
    }
    const withLowAce = (values: number[]): Set<number> =>
      new Set(values.flatMap((value) => (value === 14 ? [14, 1] : [value])));
    const values = withLowAce(cards.map(cardRankValue));
    const holeValues = withLowAce(hand.map(cardRankValue));
    const completing = new Set<number>();
    for (let low = 1; low <= 10; low += 1) {
      const window = [low, low + 1, low + 2, low + 3, low + 4];
      const missing = window.filter((value) => !values.has(value));
      if (missing.length === 0) return outs;
      if (missing.length === 1 && window.some((value) => holeValues.has(value))) {
        completing.add(missing[0] === 1 ? 14 : missing[0]);
      }
    }
    return Math.min(15, outs + Math.min(8, completing.size * 4));
  }

  /** True when the hole cards improve on the board (a pair or better of our own). */
  function hasMadeHand(hand: CardCode[], community: CardCode[]): boolean {
    if (hand.length !== 2 || community.length < 3) return false;
    const own = Hand.solve([...hand, ...community]);
    if (own.rank <= 1) return false;
    const board = Hand.solve([...community]);
    if (own.rank > board.rank) return true;
    // Same category (e.g. both a pair): ours only counts when it beats the board alone.
    return own.rank > 2 && Hand.winners([own, board]).length === 1;
  }

  /** Player who made the last preflop raise this hand (the "preflop raiser"), if any. */
  function preflopRaiserId(room: Room): string | null {
    for (let index = room.actionLog.length - 1; index >= 0; index -= 1) {
      const entry = room.actionLog[index];
      if (entry.phase === "preflop" && /^Raises to\s+/i.test(entry.action || "")) {
        return entry.playerId || null;
      }
    }
    return null;
  }

  /** Last player to bet or raise on `phase` (null if it went check-around). */
  function streetAggressorId(room: Room, phase: string): string | null {
    for (let index = room.actionLog.length - 1; index >= 0; index -= 1) {
      const entry = room.actionLog[index];
      if (entry.phase === phase && /^Raises to\s+/i.test(entry.action || "")) {
        return entry.playerId || null;
      }
    }
    return null;
  }

  const PREVIOUS_STREET: Record<string, string> = { flop: "preflop", turn: "flop", river: "turn" };

  /**
   * Postflop decisions. Equity is estimated against a random hand, then discounted
   * for the bettor's (stronger) range and the bet size, with a floor from draw
   * outs. Calls need that equity to beat the pot odds plus a style margin; checked-to
   * spots mix value bets with c-bets, semi-bluffs, barrels and river bluffs.
   */
  function choosePostflopAction(
    room: Room,
    player: Player,
    { callAmount, canRaise, minRaiseTo, maxBet }: {
      callAmount: number;
      canRaise: boolean;
      minRaiseTo: number;
      maxBet: number;
    },
  ): { type: ActionType; raiseTo?: number } {
    const { bigBlind } = currentBlinds(room);
    const profile = computerProfile(player);
    const opponents = Math.max(
      1,
      livePlayers(room).filter((item) => item.id !== player.id).length,
    );
    const river = room.community.length >= 5;
    const perceptionNoise = (Math.random() - 0.5) * (1 - profile.skill) * 0.12;
    const headsUpEquity = Math.max(
      0.01,
      Math.min(0.99, estimatePostflopEquity(player.hand, room.community, 140) + perceptionNoise),
    );
    const outs = countDrawOuts(player.hand, room.community);
    const made = hasMadeHand(player.hand, room.community);
    const cardsToCome = 5 - room.community.length;
    const drawEquity = Math.min(0.55, outs * (cardsToCome >= 2 ? 0.04 : 0.021));
    // Multiway: needing to beat everyone, but opponents' hands overlap, so soften the power.
    const strength = headsUpEquity ** (1 + (opponents - 1) * 0.7);
    const raiseTo = (confidence: number) =>
      chooseComputerRaiseTo(room, player, minRaiseTo, confidence);
    const multiwayDamp = 0.85 ** (opponents - 1);

    if (callAmount === 0) {
      const ableToBet = canRaise && minRaiseTo <= maxBet;
      if (!ableToBet) return { type: "check" };
      if (made && strength > 0.5) {
        const valueChance = Math.min(0.92, (strength - 0.36) * 2 * profile.aggression);
        if (Math.random() < valueChance) return { type: "raise", raiseTo: raiseTo(strength) };
      }
      const isPfr = preflopRaiserId(room) === player.id;
      const firstToBetFlop = room.phase === "flop" && !streetAggressorId(room, "flop");
      const barrelling = streetAggressorId(room, PREVIOUS_STREET[room.phase] || "") === player.id;
      let bluffChance;
      if (isPfr && firstToBetFlop) {
        bluffChance = profile.cbet * multiwayDamp;
      } else if (outs >= 8) {
        bluffChance = Math.min(0.7, (0.02 + profile.barrel * 1.25) * profile.aggression) * multiwayDamp;
      } else if (outs >= 4) {
        bluffChance = profile.barrel * 0.6 * multiwayDamp;
      } else if (river && strength < 0.3) {
        bluffChance = profile.barrel * (barrelling ? 0.9 : 0.35) * multiwayDamp;
      } else {
        bluffChance = profile.barrel * (barrelling ? 0.7 : 0.45) * multiwayDamp;
      }
      if (Math.random() < bluffChance) {
        return { type: "raise", raiseTo: raiseTo(Math.max(strength, 0.4)) };
      }
      return { type: "check" };
    }

    const potBeforeBet = Math.max(bigBlind, collectPot(room) - callAmount);
    const betFraction = Math.min(1.5, callAmount / potBeforeBet);
    const requiredEquity = callAmount / Math.max(1, collectPot(room) + callAmount);
    // A bet narrows the bettor's range toward made hands: bigger bets, more so.
    const rangeDiscount = 1.45 + betFraction * 0.65 + (river ? 0.7 : 0);
    const rangeEquity = Math.max(headsUpEquity ** rangeDiscount, drawEquity * 0.9) ** opponents;
    const margin = 0.04 - profile.stickiness - (profile.looseness - 1) * 0.05;
    const edge = rangeEquity - requiredEquity - margin;
    const ableToRaise = canRaise && minRaiseTo <= maxBet;

    if (ableToRaise) {
      const valueRaise =
        made && rangeEquity > 0.6 ? Math.min(0.7, (rangeEquity - 0.5) * 1.6 * profile.aggression) : 0;
      const bluffRaise = river
        ? profile.barrel * 0.06
        : outs >= 8
          ? profile.barrel * 0.4
          : profile.barrel * 0.05;
      if (Math.random() < valueRaise + bluffRaise * multiwayDamp) {
        return { type: "raise", raiseTo: raiseTo(Math.max(rangeEquity, 0.45)) };
      }
    }
    const callChance = Math.max(0, Math.min(0.97, 0.5 + edge * 4.5));
    if (Math.random() < callChance) return { type: "call" };
    // Hero call: a river bluff-catcher (ace-high, weak pair) the math says to fold.
    if (river && headsUpEquity >= 0.3 && Math.random() < profile.heroCall * 1.5) {
      return { type: "call" };
    }
    return { type: "fold" };
  }

  function chooseComputerAction(room: Room, player: Player): { type: ActionType; raiseTo?: number } {
    const { bigBlind } = currentBlinds(room);
    const callAmount = Math.max(0, room.currentBet - player.bet);
    const maxBet = player.bet + player.stack;
    const canRaise = room.raiseEligible.has(player.id) && maxBet > room.currentBet;
    const minRaiseTo = Math.min(maxBet, room.currentBet + room.minRaise);
    const profile = computerProfile(player);
    const rawConfidence = estimateComputerConfidence(room, player);
    const judgmentNoise = (Math.random() - 0.5) * (1 - profile.skill) * 0.42;
    let confidence = Math.max(0.04, Math.min(0.96, rawConfidence + judgmentNoise));

    if (room.community.length > 0) {
      return choosePostflopAction(room, player, { callAmount, canRaise, minRaiseTo, maxBet });
    }

    if (callAmount === 0) {
      const equity = estimateComputerEquity(room, player);
      const perceptionNoise = (Math.random() - 0.5) * (1 - profile.skill) * 0.07;
      confidence = Math.max(
        0.04,
        Math.min(0.96, equity * 0.78 + rawConfidence * 0.22 + perceptionNoise),
      );
      const valueRaiseChance =
        confidence > 0.46 ? Math.min(0.92, (confidence - 0.34) * 1.35 * profile.aggression) : 0;
      const bluffRaiseChance = confidence < 0.42 ? profile.bluff * 1.15 : profile.bluff * 0.28;
      if (canRaise && minRaiseTo <= maxBet && Math.random() < valueRaiseChance + bluffRaiseChance) {
        return {
          type: "raise",
          raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, confidence),
        };
      }
      return { type: "check" };
    }

    const allInAggressor = currentPreflopAllInAggressor(room, player);
    if (allInAggressor) {
      return assessPreflopAllInCall(room, player, allInAggressor).call
        ? { type: "call" }
        : { type: "fold" };
    }

    const blindCallChance = preflopBlindCallChance(room, player, callAmount);
    if (blindCallChance !== null) {
      if (
        canRaise &&
        minRaiseTo <= maxBet &&
        Math.random() < preflopBlindRaiseChance(player, confidence)
      ) {
        return {
          type: "raise",
          raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, confidence),
        };
      }
      if (Math.random() < blindCallChance) {
        const unopened = room.currentBet <= bigBlind;
        if (
          unopened &&
          canRaise &&
          minRaiseTo <= maxBet &&
          Math.random() < preflopOpenInsteadOfLimpChance(player)
        ) {
          return {
            type: "raise",
            raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, confidence),
          };
        }
        return { type: "call" };
      }
      return { type: "fold" };
    }

    const equity = estimateComputerEquity(room, player, callAmount);
    const potAfterCall = collectPot(room) + callAmount;
    const requiredEquity = callAmount / Math.max(1, potAfterCall);
    const betPressure = callAmount / Math.max(bigBlind, collectPot(room));
    const safetyMargin = Math.max(
      0.005,
      Math.min(0.08, 0.02 + betPressure * 0.025 + (1 - profile.looseness) * 0.04),
    );
    const perceptionNoise = (Math.random() - 0.5) * (1 - profile.skill) * 0.07;
    const perceivedEquity = Math.max(0.02, Math.min(0.98, equity + perceptionNoise));
    const edge = perceivedEquity - requiredEquity - safetyMargin;
    const callChance = Math.max(
      0.04,
      Math.min(0.98, 0.5 + edge * 3.2 + (profile.looseness - 1) * 0.16),
    );
    const valueReraiseChance =
      perceivedEquity > 0.56
        ? Math.min(0.9, (perceivedEquity - 0.4) * 1.55 * profile.aggression)
        : 0;
    const reraiseChance = Math.min(0.92, valueReraiseChance + profile.bluff * 0.16);
    if (canRaise && minRaiseTo <= maxBet && Math.random() < reraiseChance) {
      return {
        type: "raise",
        raiseTo: chooseComputerRaiseTo(room, player, minRaiseTo, perceivedEquity),
      };
    }
    const raiseGate = preflopFacingRaiseGate(room, player, callAmount);
    // Short-handed BB closing vs a small open (≤3x): the price is fixed and good, so the
    // hand-score gate alone decides (pot-odds noise was folding far too much heads-up).
    const smallOpenVsBigBlind =
      preflopBigBlindDiscount(room, player) > 0 &&
      room.phase === "preflop" &&
      room.currentBet <= bigBlind * 3;
    if (Math.random() < (smallOpenVsBigBlind ? raiseGate : callChance * raiseGate)) {
      return { type: "call" };
    }
    return { type: "fold" };
  }

  function isSoloHumanFolded(room: Room): boolean {
    const humans = room.players.filter((player) => !player.isBot);
    return humans.length === 1 && humans[0].folded;
  }

  /** Client-facing personality for CPU seats (null for humans). */
  function botStyleView(player: Player): {
    botProfile: string | null;
    botStyle: string | null;
    botStyleShort: string | null;
  } {
    if (!player.isBot) return { botProfile: null, botStyle: null, botStyleShort: null };
    const profile = computerProfile(player);
    return { botProfile: profile.tag, botStyle: profile.style, botStyleShort: profile.short };
  }

  function serializeRoom(room: Room, viewerId: string) {
    const pot = collectPot(room);
    const viewer = room.players.find((player) => player.id === viewerId);
    const toCall =
      viewer && !viewer.folded && !viewer.allIn ? Math.max(0, room.currentBet - viewer.bet) : 0;
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
      canShowHand:
        room.phase === "complete" && Boolean(viewer?.hand?.length) && !viewer?.showCards,
      canStart: false,
      canNextHand: false,
      canReady: Boolean(
        viewer &&
        !viewer.isBot &&
        viewer.stack > 0 &&
        !viewer.sittingOut &&
        canReadyForHand(room) &&
        playersWithChips(room).filter((player) => !player.sittingOut).length >= 2,
      ),
      isReady: Boolean(viewer?.ready),
      canChangeBlinds: room.hostId === viewerId && canReadyForHand(room),
      // Offline practice never runs a shot clock / ready timer so humans cannot get stuck alone.
      canChangeShotClock: false,
      canChangeReadyTimer: false,
      turnTimeLimitMs: 0,
      turnEndsAt: null,
      readyEndsAt: null,
      readyTimeLimitMs: 0,
      canRestartGame: room.hostId === viewerId && !room.moneyMode && canAdministerGame(room),
      canEndGame:
        room.hostId === viewerId &&
        canAdministerGame(room) &&
        (room.moneyMode || room.phase !== "lobby"),
      canAddBot:
        room.hostId === viewerId &&
        !room.moneyMode &&
        room.handNumber === 0 &&
        room.players.length < MAX_PLAYERS,
      bustedOut: humansBustedOut(room),
      canRebuy: Boolean(viewer && !viewer.isBot && viewer.stack <= 0 && humansBustedOut(room)),
      rabbitHuntEnabled: rabbitHuntEnabled(room),
      canChangeRabbitHunt: room.hostId === viewerId,
      canRabbitHunt: Boolean(viewer) && canRabbitHunt(room),
      rabbitCards: visibleRabbitCards(room).map(publicCard),
      community: room.community.map(publicCard),
      winners: room.winners.map((winner) => ({
        ...winner,
        amountCents: chipsToCents(room, winner.amount),
      })),
      actionLog: sanitizeActionLogForClient(room.actionLog),
      allInCardsExposed: Boolean(room.allInCardsExposed),
      players: room.players.map((player, index) => ({
        id: player.id,
        name: player.name,
        color: player.color || null,
        stack: player.stack,
        stackCents: chipsToCents(room, player.stack),
        buyInsCents: player.buyInsCents || 0,
        cashOutCents: player.cashOutCents || 0,
        netCents:
          (player.cashOutCents || 0) + chipsToCents(room, player.stack) - (player.buyInsCents || 0),
        bet: player.bet,
        betCents: chipsToCents(room, player.bet),
        invested: player.invested,
        investedCents: chipsToCents(room, player.invested),
        sittingOut: Boolean(player.sittingOut),
        waitingForNextHand:
          isHandInProgress(room) && player.hand.length === 0 && player.folded && player.stack > 0,
        folded: player.folded,
        allIn: player.allIn,
        connected: player.connected,
        isBot: player.isBot,
        ...botStyleView(player),
        showCards: Boolean(player.showCards),
        ready: Boolean(player.ready || player.isBot),
        disconnectExpiresAt: player.disconnectExpiresAt || null,
        isHost: player.id === room.hostId,
        dealer: index === room.dealer,
        isSmallBlind: Boolean(room.smallBlindPlayerId) && player.id === room.smallBlindPlayerId,
        isBigBlind: Boolean(room.bigBlindPlayerId) && player.id === room.bigBlindPlayerId,
        isTurn: room.turn === player.id,
        isYou: player.id === viewerId,
        canMakeHost: false,
        canKick: false,
        cards: visibleHoleCards(player, viewerId),
      })),
    };
  }

  function createPracticeRoom(options: PracticeRoomOptions = {}): Room {
    const tableSize = cleanTableSize(options.tableSize) || 6;
    const startingStack = Math.max(1, Math.floor(Number(options.startingStack) || STARTING_STACK));
    const smallBlind = cleanBlind(options.smallBlind, DEFAULT_SMALL_BLIND);
    const bigBlind = cleanBlind(options.bigBlind, DEFAULT_BIG_BLIND);
    const name = cleanName(options.name);
    const playerId = String(options.playerId || "practice-hero");
    const botCount =
      options.botCount != null
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
      deck: [] as CardCode[],
      community: [] as CardCode[],
      dealer: 0,
      turn: null,
      currentBet: 0,
      minRaise: bigBlind,
      deadPot: 0,
      acted: new Set<string>(),
      raiseEligible: new Set<string>(),
      message: "Table ready. Ready up to deal.",
      winners: [] as WinnerSummary[],
      actionLog: [] as ActionLogEntry[],
      handNumber: 0,
      moneyMode: false,
      moneyUnitCents: null as 1 | null,
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
      riverAggressor: null as string | null,
      allInCardsExposed: false,
      players: [hero],
    } as Room;

    const targetSeats = botCount > 0 ? Math.min(MAX_PLAYERS, Math.max(2, 1 + botCount)) : 0;
    if (targetSeats > 0) {
      addComputerPlayers(room, targetSeats);
      for (const player of room.players) {
        if (player.isBot) player.stack = startingStack;
      }
      room.tableSize = room.players.length;
    } else {
      // Solo offline host; seats fill via in-table Add CPU (up to MAX_PLAYERS).
      room.tableSize = MAX_PLAYERS;
      room.message = "Table ready. Add CPU players, then ready up to deal.";
    }
    return room;
  }

  function restartPracticeRoom(room: Room): void {
    clearEngineTimer(room.botTimer);
    clearEngineTimer(room.showdownTimer);
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
    room.smallBlindPlayerId = null;
    room.bigBlindPlayerId = null;
    room.winners = [];
    room.actionLog = [];
    room.riverAggressor = null;
    room.allInCardsExposed = false;
    room.message = "Table restarted. Ready up when you want the next hand.";
  }

  function endPracticeGame(room: Room): void {
    if (isHandInProgress(room)) {
      for (const player of room.players) player.stack += player.invested;
    }
    resetHandState(room);
    room.status = "lobby";
    room.phase = "lobby";
    room.turn = null;
    room.message = "Game ended by host.";
    room.actionLog = [];
    room.riverAggressor = null;
    room.allInCardsExposed = false;
  }

  function cardCodeFromPublic(card: PublicCard | CardCode | null | undefined): CardCode | null {
    if (!card) return null;
    if (typeof card === "string") {
      const raw = card.trim();
      if (/^[2-9TJQKA][shdc]$/i.test(raw)) {
        return `${raw[0].toUpperCase()}${raw[1].toLowerCase()}`;
      }
      return null;
    }
    if (card.code && /^[2-9TJQKA][shdc]$/i.test(card.code)) {
      return `${card.code[0].toUpperCase()}${card.code[1].toLowerCase()}`;
    }
    return null;
  }

  function inferBaseBlindsFromSnapshot(snapshot: PracticeSnapshot | null | undefined): { smallBlind: number; bigBlind: number } {
    const small = Math.max(1, Math.floor(Number(snapshot?.smallBlind) || DEFAULT_SMALL_BLIND));
    const big = Math.max(small + 1, Math.floor(Number(snapshot?.bigBlind) || DEFAULT_BIG_BLIND));
    const handNumber = Math.max(0, Math.floor(Number(snapshot?.handNumber) || 0));
    if (handNumber <= 0) return { smallBlind: small, bigBlind: big };
    const level = blindLevelForHand(handNumber);
    return {
      smallBlind: Math.max(1, Math.round((small * DEFAULT_SMALL_BLIND) / level.smallBlind)),
      bigBlind: Math.max(2, Math.round((big * DEFAULT_BIG_BLIND) / level.bigBlind)),
    };
  }

  function reconstructBettingSets(room: Room, snapshotBigBlind?: number): void {
    room.acted = new Set();
    room.raiseEligible = new Set(canActPlayers(room).map((player) => player.id));
    if (!["preflop", "flop", "turn", "river"].includes(room.phase)) return;

    const openingBet =
      room.phase === "preflop"
        ? Math.max(
            1,
            Math.floor(Number(snapshotBigBlind) || room.baseBigBlind || DEFAULT_BIG_BLIND),
          )
        : 0;
    let streetBet = openingBet;
    let minRaise =
      openingBet || Math.max(1, Math.floor(Number(room.minRaise) || DEFAULT_BIG_BLIND));

    for (const entry of room.actionLog || []) {
      if (entry.phase !== room.phase) continue;
      const action = String(entry.action || "");
      const playerId = entry.playerId;
      if (!playerId) continue;
      if (/^Posts\b/i.test(action)) continue;

      if (/^Folds$/i.test(action) || /^Checks$/i.test(action) || /^Calls\b/i.test(action)) {
        room.acted.add(playerId);
        room.raiseEligible.delete(playerId);
        continue;
      }

      const raiseMatch = /^Raises to\s+(\d+)/i.exec(action);
      if (!raiseMatch) continue;
      const target = Math.floor(Number(raiseMatch[1]));
      if (!Number.isFinite(target)) continue;
      const raiseSize = target - streetBet;
      const isFullRaise = raiseSize >= minRaise;
      streetBet = Math.max(streetBet, target);
      room.acted = new Set([playerId]);
      if (isFullRaise) {
        minRaise = Math.max(1, raiseSize);
        room.raiseEligible = new Set(
          canActPlayers(room)
            .filter((player) => player.id !== playerId)
            .map((player) => player.id),
        );
      } else {
        room.raiseEligible.delete(playerId);
      }
    }

    // Keep the player to act eligible to respond if reconstruction drifted.
    if (room.turn && canActPlayers(room).some((player) => player.id === room.turn)) {
      room.acted.delete(room.turn);
      room.raiseEligible.add(room.turn);
    }
  }

  function hydratePracticeRoomFromSnapshot(snapshot: PracticeSnapshot): Room {
    if (!snapshot || !Array.isArray(snapshot.players) || !snapshot.players.length) {
      throw new Error("Cannot hydrate practice room without players.");
    }
    if (snapshot.moneyMode) {
      throw new Error("Money-mode rooms cannot be hydrated into practice.");
    }

    const hero =
      snapshot.players.find((player) => player.isYou && !player.isBot) ||
      snapshot.players.find((player) => !player.isBot);
    if (!hero) throw new Error("Cannot hydrate practice room without a human player.");

    const viewerId = hero.id;
    const bases = inferBaseBlindsFromSnapshot(snapshot);
    const handNumber = Math.max(0, Math.floor(Number(snapshot.handNumber) || 0));
    const phase = String(snapshot.phase || "lobby");
    const knownCodes = new Set();

    const players = snapshot.players.map((seat, index) => {
      const player = makePlayer({
        id: seat.id,
        name: cleanName(seat.name),
        isBot: Boolean(seat.isBot),
      });
      player.color =
        cleanPlayerColor(seat.color) ||
        (seat.isBot ? null : PLAYER_COLORS[index % PLAYER_COLORS.length]);
      player.stack = Math.max(0, Math.floor(Number(seat.stack) || 0));
      player.bet = Math.max(0, Math.floor(Number(seat.bet) || 0));
      player.invested = Math.max(0, Math.floor(Number(seat.invested) || 0));
      player.folded = Boolean(seat.folded);
      player.allIn = Boolean(seat.allIn) || (player.stack <= 0 && isHandInProgress({ phase }));
      player.showCards = Boolean(seat.showCards);
      player.ready = Boolean(seat.ready || seat.isBot);
      player.sittingOut = Boolean(seat.sittingOut);
      player.connected = true;
      player.buyInsCents = Math.max(0, Math.floor(Number(seat.buyInsCents) || 0));
      player.cashOutCents = Math.max(0, Math.floor(Number(seat.cashOutCents) || 0));
      if (seat.isBot && typeof seat.botProfile === "string") player.botProfile = seat.botProfile;
      player.hand = [];
      for (const card of seat.cards || []) {
        const code = cardCodeFromPublic(card);
        if (!code) continue;
        player.hand.push(code);
        knownCodes.add(code);
      }
      return player;
    });

    const community = [];
    for (const card of snapshot.community || []) {
      const code = cardCodeFromPublic(card);
      if (!code) continue;
      community.push(code);
      knownCodes.add(code);
    }

    const remaining = allCards.filter((card) => !knownCodes.has(card));
    for (let i = remaining.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    const handActive = isHandInProgress({ phase }) || phase === "complete";
    for (const player of players) {
      const seat = snapshot.players.find((item) => item.id === player.id);
      if (!handActive) {
        player.hand = [];
        continue;
      }
      if (player.sittingOut || seat?.waitingForNextHand) continue;
      while (player.hand.length < 2 && remaining.length) {
        player.hand.push(remaining.pop() as CardCode);
      }
    }

    const investedTotal = players.reduce((sum, player) => sum + player.invested, 0);
    const pot = Math.max(0, Math.floor(Number(snapshot.pot) || investedTotal));
    const deadPot = Math.max(0, pot - investedTotal);
    const dealerIndex = Math.max(
      0,
      players.findIndex((player) => {
        const seat = snapshot.players.find((item) => item.id === player.id);
        return Boolean(seat?.dealer);
      }),
    );

    const room = {
      id: "PRACTICE",
      hostId: viewerId,
      tableSize: Math.max(players.length, Math.floor(Number(snapshot.tableSize) || players.length)),
      status:
        snapshot.status ||
        (isHandInProgress({ phase }) ? "playing" : phase === "gameover" ? "complete" : "lobby"),
      phase,
      // A finished hand's real deck stayed on the server: no rabbit hunt from a reshuffle.
      deck: phase === "complete" ? [] : remaining,
      community,
      dealer: dealerIndex >= 0 ? dealerIndex : 0,
      smallBlindPlayerId: snapshot.players.find((seat) => seat.isSmallBlind)?.id || null,
      bigBlindPlayerId: snapshot.players.find((seat) => seat.isBigBlind)?.id || null,
      turn: snapshot.turn || null,
      currentBet: Math.max(0, Math.floor(Number(snapshot.currentBet) || 0)),
      minRaise: Math.max(1, Math.floor(Number(snapshot.minRaise) || bases.bigBlind)),
      deadPot,
      acted: new Set<string>(),
      raiseEligible: new Set<string>(),
      message: snapshot.message || "Continuing offline.",
      winners: Array.isArray(snapshot.winners)
        ? snapshot.winners.map((winner) => ({ ...winner }))
        : [],
      actionLog: Array.isArray(snapshot.actionLog)
        ? snapshot.actionLog.map((entry) => ({ ...entry }))
        : [],
      handNumber,
      moneyMode: false,
      moneyUnitCents: null as 1 | null,
      buyInCents: 0,
      baseSmallBlind: bases.smallBlind,
      baseBigBlind: bases.bigBlind,
      chipValueCents: Math.max(1, Math.floor(Number(snapshot.chipValueCents) || 1)),
      settlements: [],
      moneyLedger: [],
      offline: true,
      startingStack: Math.max(
        STARTING_STACK,
        ...players.map((player) => player.stack + player.invested),
      ),
      showdownTimer: null,
      botTimer: null,
      riverAggressor: snapshot.riverAggressor || null,
      allInCardsExposed: Boolean(snapshot.allInCardsExposed),
      players,
      handedOffFromOnline: true,
    } as Room;

    if (["preflop", "flop", "turn", "river"].includes(room.phase)) {
      reconstructBettingSets(room, snapshot.bigBlind);
    }

    return room;
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
    assignComputerProfile,
    computerThinkDelayMs,
    CPU_THINK_MS,
    botStyleView,
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
    humansBustedOut,
    rebuyBustedPlayer,
    startHand,
    startNextHand,
    dealStreet,
    bettingComplete,
    maybeAdvance,
    advanceTurn,
    collectPot,
    revealComputerHands,
    awardUncontested,
    shouldExposeAllInRunout,
    exposeAllInRunoutHands,
    showdownContenders,
    showdownOrder,
    playerCanWinOrTieEligiblePot,
    applyShowdownReveals,
    buildSidePots,
    combineWinnerSummaries,
    settleShowdown,
    beginShowdown,
    applyPlayerAction,
    showPlayerCards,
    rabbitHuntEnabled,
    rabbitHuntRunout,
    canRabbitHunt,
    visibleRabbitCards,
    revealRabbitHunt,
    setRabbitHunt,
    sanitizeActionLogForClient,
    visibleHoleCards,
    cardRankValue,
    estimateComputerConfidence,
    chooseComputerRaiseTo,
    preflopBlindCallChance,
    preflopBlindRaiseChance,
    preflopOpenInsteadOfLimpChance,
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
    cardCodeFromPublic,
    inferBaseBlindsFromSnapshot,
    reconstructBettingSets,
    hydratePracticeRoomFromSnapshot,
  };

}

export type HoldemEngine = ReturnType<typeof createHoldemEngine>;
