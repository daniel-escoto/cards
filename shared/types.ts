/**
 * Shared domain + Socket.IO event types for server and client.
 * Shapes match serialize/restore/persist paths so old rooms still restore.
 */

/** Hole/board card code, e.g. "As", "Th". */
export type CardCode = string;

export type RoomStatus = "lobby" | "playing" | "complete" | string;

export type RoomPhase =
  | "lobby"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "complete"
  | "gameover"
  | string;

/** Hex color `#rrggbb`, or null for bots / unset. */
export type PlayerColor = string | null;

export type TimerHandle = ReturnType<typeof setTimeout> | null;

export type ActionType = "fold" | "check" | "call" | "raise" | string;

export interface PublicCard {
  code: CardCode;
  rank: string;
  suit: string;
  color: "red" | "black";
}

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  hands: number;
}

/** Persisted / runtime ledger row (`room.moneyLedger`). */
export interface LedgerEntry {
  playerId: string;
  name: string;
  buyInsCents: number;
  cashOutCents: number;
}

/** Client-facing ledger row from `serializeRoom` (moneyMode only; else `[]`). */
export interface ClientLedgerEntry extends LedgerEntry {
  netCents: number;
  isYou: boolean;
  color: PlayerColor;
}

export interface Settlement {
  fromPlayerId: string;
  fromName: string;
  toPlayerId: string;
  toName: string;
  amountCents: number;
}

export interface MoneyTerms {
  roomId: string;
  buyInCents: number;
  smallBlindCents: number;
  bigBlindCents: number;
}

export interface WinnerSummary {
  playerId: string;
  name: string;
  amount: number;
  hand: string;
}

export interface ClientWinnerSummary extends WinnerSummary {
  amountCents: number;
}

export interface ActionLogEntry {
  id: string;
  phase: string;
  text: string;
  playerId?: string;
  action?: string;
}

/**
 * Runtime seat (`room.players`).
 * `backgroundedUntil` is set by presence — not in makePlayer.
 */
export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  stack: number;
  hand: CardCode[];
  folded: boolean;
  allIn: boolean;
  bet: number;
  invested: number;
  showCards: boolean;
  ready: boolean;
  sittingOut: boolean;
  connected: boolean;
  isBot: boolean;
  /** Server multiplayer fields (absent in pure offline engine seats). */
  reconnectTokenHash?: string | null;
  socketIds?: Set<string>;
  replacedPlayerId?: string | null;
  replacedPlayerName?: string | null;
  replacedPlayerColor?: PlayerColor;
  replacedReconnectTokenHash?: string | null;
  buyInsCents?: number;
  cashOutCents?: number;
  preflopShoveStreak?: number;
  disconnectExpiresAt?: number | null;
  disconnectTimer?: TimerHandle;
  backgroundedUntil?: number | null;
  /** Bot profile fields from the shared engine. */
  botProfile?: string | null;
  botStyle?: string | null;
  aggression?: number;
  looseness?: number;
  bluff?: number;
  skill?: number;
}

/** Storage seat — no sockets/timers; `connected` always false. */
export interface StoredPlayer {
  id: string;
  reconnectTokenHash: string | null;
  name: string;
  color: PlayerColor;
  stack: number;
  hand: CardCode[];
  folded: boolean;
  allIn: boolean;
  bet: number;
  invested: number;
  showCards: boolean;
  ready: boolean;
  sittingOut: boolean;
  disconnectExpiresAt: number | null;
  connected: false;
  isBot: boolean;
  replacedPlayerId: string | null;
  replacedPlayerName: string | null;
  replacedPlayerColor: PlayerColor;
  replacedReconnectTokenHash: string | null;
  buyInsCents: number;
  cashOutCents: number;
  preflopShoveStreak: number;
}

export interface ClientPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  stack: number;
  stackCents: number;
  buyInsCents: number;
  cashOutCents: number;
  netCents: number;
  bet: number;
  betCents: number;
  invested: number;
  investedCents: number;
  sittingOut: boolean;
  waitingForNextHand: boolean;
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  isBot: boolean;
  showCards: boolean;
  ready: boolean;
  disconnectExpiresAt: number | null;
  isHost: boolean;
  dealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  isYou: boolean;
  canMakeHost: boolean;
  canKick: boolean;
  cards: Array<PublicCard | null>;
}

export interface Spectator {
  id: string;
  name: string;
  reconnectTokenHash: string | null;
  socketIds: Set<string>;
  connected: boolean;
  disconnectExpiresAt: number | null;
  disconnectTimer: TimerHandle;
  backgroundedUntil: number | null;
}

/**
 * Runtime room in `api.rooms`.
 * `acted` / `raiseEligible` are Sets at runtime (arrays on disk).
 * Spectators are memory-only.
 */
export interface Room {
  id: string;
  hostId: string | null;
  tableSize: number;
  status: RoomStatus;
  phase: RoomPhase;
  deck: CardCode[];
  community: CardCode[];
  dealer: number;
  /** Set on deal; omitted on fresh practice/makeRoom until blinds post. */
  smallBlindPlayerId?: string | null;
  bigBlindPlayerId?: string | null;
  turn: string | null;
  currentBet: number;
  minRaise: number;
  deadPot: number;
  acted: Set<string>;
  raiseEligible: Set<string>;
  message: string;
  winners: WinnerSummary[];
  actionLog: ActionLogEntry[];
  riverAggressor: string | null;
  allInCardsExposed: boolean;
  handNumber: number;
  moneyMode: boolean;
  moneyUnitCents: 1 | null;
  buyInCents: number;
  baseSmallBlind: number;
  baseBigBlind: number;
  /** Optional on pure offline practice rooms; always set for multiplayer. */
  turnTimeLimitMs?: number;
  turnEndsAt?: number | null;
  turnTimerPlayerId?: string | null;
  turnTimer?: TimerHandle;
  readyTimeLimitMs?: number;
  readyEndsAt?: number | null;
  readyTimer?: TimerHandle;
  settlements?: Settlement[];
  moneyLedger?: LedgerEntry[];
  dormantSince?: number | null;
  dormantTimer?: TimerHandle;
  botTimer?: TimerHandle;
  showdownTimer?: TimerHandle;
  spectators?: Spectator[];
  players: Player[];
  offline?: boolean;
  hostName?: string;
  /** Offline practice: chip→cent multiplier (else moneyUnitCents). */
  chipValueCents?: number;
  /** Offline practice: stack restored by restartPracticeRoom. */
  startingStack?: number;
  /** Set when an online ClientRoom snapshot is hydrated offline. */
  handedOffFromOnline?: boolean;
}

export interface StoredRoom {
  id: string;
  hostId: string | null;
  tableSize: number;
  status: RoomStatus;
  phase: RoomPhase;
  deck: CardCode[];
  community: CardCode[];
  dealer: number;
  smallBlindPlayerId: string | null;
  bigBlindPlayerId: string | null;
  turn: string | null;
  currentBet: number;
  minRaise: number;
  deadPot: number;
  acted: string[];
  raiseEligible: string[];
  message: string;
  winners: WinnerSummary[];
  actionLog: ActionLogEntry[];
  riverAggressor: string | null;
  allInCardsExposed: boolean;
  handNumber: number;
  moneyMode: boolean;
  moneyUnitCents: 1 | null;
  buyInCents: number;
  baseSmallBlind: number;
  baseBigBlind: number;
  turnTimeLimitMs: number;
  turnEndsAt: number | null;
  turnTimerPlayerId: string | null;
  readyTimeLimitMs: number;
  readyEndsAt: number | null;
  settlements: Settlement[];
  moneyLedger: LedgerEntry[];
  dormantSince: number | null;
  players: StoredPlayer[];
}

export interface ClientRoom {
  id: string;
  hostId: string | null;
  status: RoomStatus;
  phase: RoomPhase;
  buildId: string;
  updatingAfterHand: boolean;
  tableSize: number;
  message: string;
  pot: number;
  potCents: number;
  currentBet: number;
  currentBetCents: number;
  minRaise: number;
  minRaiseTo: number;
  minRaiseToCents: number;
  smallBlind: number;
  bigBlind: number;
  smallBlindCents: number;
  bigBlindCents: number;
  playerColors: string[];
  handNumber: number;
  moneyMode: boolean;
  buyInCents: number;
  chipValueCents: number;
  settlements: Settlement[];
  ledger: ClientLedgerEntry[];
  turn: string | null;
  isYourTurn: boolean;
  canRaise: boolean;
  canShove: boolean;
  canCashIn: boolean;
  toCall: number;
  toCallCents: number;
  canShowHand: boolean;
  canStart: boolean;
  canNextHand: boolean;
  canReady: boolean;
  isReady: boolean;
  isSpectator: boolean;
  watchingCount: number;
  canTakeSeat: boolean;
  canChangeBlinds: boolean;
  canChangeShotClock: boolean;
  canChangeReadyTimer: boolean;
  turnTimeLimitMs: number;
  turnEndsAt: number | null;
  readyEndsAt: number | null;
  readyTimeLimitMs: number;
  serverNow: number;
  canRestartGame: boolean;
  canEndGame: boolean;
  canAddBot: boolean;
  community: PublicCard[];
  winners: ClientWinnerSummary[];
  actionLog: ActionLogEntry[];
  allInCardsExposed: boolean;
  players: ClientPlayer[];
  offline?: boolean;
}

/**
 * Redis/file snapshot shape. `shutdownFlushedAt` only on SIGTERM final flush.
 */
export interface PersistedState {
  version: 1;
  savedAt: string;
  buildId: string;
  rooms: StoredRoom[];
  shutdownFlushedAt?: string;
}

export interface HandoffMeta {
  at: string;
  buildId?: string;
  shutdown?: boolean;
  flushedAt?: string;
  shutdownFlushedAt?: string;
  [key: string]: unknown;
}

export type OkAck = { ok: true };
export type ErrAck = { ok: false; error: string };

export type RoomCreateAck =
  | { ok: true; roomId: string; playerId: string; reconnectToken: string }
  | ErrAck;

export type RoomJoinAck =
  | { ok: true; roomId: string; playerId?: string; reconnectToken?: string; settlementView?: true }
  | { ok: false; error: string; canWatch?: true }
  | { ok: false; error: string; moneyTerms: MoneyTerms };

export type RoomWatchAck =
  | {
      ok: true;
      roomId: string;
      playerId: string;
      spectator: true;
      reconnectToken?: string;
    }
  | ErrAck;

export type RoomTakeSeatAck =
  | { ok: true; roomId: string; playerId: string; reconnectToken?: string }
  | { ok: false; error: string; canWatch?: true }
  | { ok: false; error: string; moneyTerms: MoneyTerms }
  | ErrAck;

export interface ServerToClientEvents {
  "server:hello": (payload: { buildId: string }) => void;
  "server:deploy-waiting": (payload: { buildId: string; message: string }) => void;
  "server:restarting": (payload: { buildId: string }) => void;
  "room:update": (room: ClientRoom) => void;
  "room:kicked": () => void;
}

export interface ClientToServerEvents {
  "room:create": (
    payload: {
      name?: string;
      deviceId?: string;
      computerPlayers?: number;
      tableSize?: number;
      moneyMode?: boolean;
      buyInCents?: number;
      smallBlind?: number;
      bigBlind?: number;
      smallBlindCents?: number;
      bigBlindCents?: number;
    },
    ack?: (response: RoomCreateAck) => void,
  ) => void;

  "room:join": (
    payload: {
      roomId?: string;
      name?: string;
      deviceId?: string;
      reconnectToken?: string;
      acceptedMoneyTerms?: MoneyTerms | null;
    },
    ack?: (response: RoomJoinAck) => void,
  ) => void;

  "room:watch": (
    payload: {
      roomId?: string;
      name?: string;
      deviceId?: string;
      reconnectToken?: string;
    },
    ack?: (response: RoomWatchAck) => void,
  ) => void;

  "room:takeSeat": (
    payload?: {
      name?: string;
      deviceId?: string;
      reconnectToken?: string;
      acceptedMoneyTerms?: MoneyTerms | null;
    },
    ack?: (response: RoomTakeSeatAck) => void,
  ) => void;

  "room:kick": (payload: { playerId?: string }, ack?: (response: OkAck | ErrAck) => void) => void;

  "room:addBot": (payload?: unknown, ack?: (response: OkAck | ErrAck) => void) => void;

  "room:makeHost": (
    payload: { playerId?: string },
    ack?: (response: OkAck | ErrAck) => void,
  ) => void;

  "room:leave": (payload?: unknown, ack?: (response: OkAck) => void) => void;

  "room:presence": (payload?: { hidden?: boolean }) => void;

  "game:start": (payload?: unknown, ack?: (response: ErrAck) => void) => void;

  "game:next": (payload?: unknown, ack?: (response: ErrAck) => void) => void;

  "game:sitOut": (
    payload?: { sittingOut?: boolean },
    ack?: (response: OkAck | ErrAck) => void,
  ) => void;

  "game:ready": (payload?: { ready?: boolean }, ack?: (response: OkAck | ErrAck) => void) => void;

  "game:setShotClock": (
    payload?: { seconds?: number },
    ack?: (response: OkAck | ErrAck) => void,
  ) => void;

  "game:setReadyTimer": (
    payload?: { seconds?: number },
    ack?: (response: OkAck | ErrAck) => void,
  ) => void;

  "game:setBlinds": (
    payload?: {
      smallBlind?: number;
      bigBlind?: number;
      smallBlindCents?: number;
      bigBlindCents?: number;
    },
    ack?: (response: OkAck | ErrAck) => void,
  ) => void;

  "game:end": (payload?: unknown, ack?: (response: OkAck | ErrAck) => void) => void;

  "game:restart": (payload?: unknown, ack?: (response: OkAck | ErrAck) => void) => void;

  "game:showCards": (payload?: unknown, ack?: (response: OkAck | ErrAck) => void) => void;

  "game:action": (
    payload: { type?: ActionType; raiseTo?: number },
    ack?: (response: OkAck | ErrAck) => void,
  ) => void;

  "money:cashIn": (
    payload: { amountCents?: number },
    ack?: (response: OkAck | ErrAck) => void,
  ) => void;

  "money:cashOut": (payload?: unknown, ack?: (response: OkAck | ErrAck) => void) => void;

  "player:setColor": (
    payload: { color?: string },
    ack?: (response: OkAck | ErrAck) => void,
  ) => void;

  "player:setName": (payload: { name?: string }, ack?: (response: OkAck | ErrAck) => void) => void;
}

export interface InterServerEvents {
  // unused — required by Socket.IO generic slots
}

export interface SocketData {
  // unused — required by Socket.IO generic slots
}
