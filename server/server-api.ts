/**
 * Mutable server bootstrap bag. Modules assign onto this during load.
 * Typed for call sites; construction uses progressive assignment.
 */
import type { Express } from "express";
import type { Server as HttpServer } from "http";
import type { Server as IoServer } from "socket.io";
import type {
  ClientRoom,
  ClientToServerEvents,
  HandoffMeta,
  LedgerEntry,
  MoneyTerms,
  PersistedState,
  Player,
  Room,
  ServerToClientEvents,
  Settlement,
  Spectator,
  StoredPlayer,
  StoredRoom,
  InterServerEvents,
  SocketData,
} from "../shared/types";
import type { StateStore } from "../state-store-types";
import type { HoldemEngine } from "../shared/create-holdem-engine";

export type TypedIoServer = IoServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface ShotClockTime {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout> | null | undefined) => void;
}

/** Engine methods the server bag re-exports — typed via typeof of the factory return. */
export type ServerEngineApi = Pick<
  HoldemEngine,
  | "blindLevelForHand"
  | "currentBlinds"
  | "publicCard"
  | "cleanName"
  | "cleanTableSize"
  | "cleanPlayerColor"
  | "defaultPlayerColor"
  | "makePlayer"
  | "computerName"
  | "addComputerPlayers"
  | "nextBotNumber"
  | "canActPlayers"
  | "nextIndex"
  | "playerIndex"
  | "resetHandState"
  | "isHandInProgress"
  | "canAdministerGame"
  | "canReadyForHand"
  | "resetReadiness"
  | "maybeStartReadyHand"
  | "playersWithChips"
  | "maybeAdvance"
  | "collectPot"
  | "buildSidePots"
  | "settleShowdown"
  | "applyPlayerAction"
  | "showPlayerCards"
  | "sanitizeActionLogForClient"
  | "visibleHoleCards"
  | "estimateComputerConfidence"
  | "chooseComputerRaiseTo"
  | "preflopBlindRaiseChance"
  | "preflopShoveRange"
  | "estimatePreflopEquityAgainstRange"
  | "estimatePostflopEquity"
  | "assessPreflopAllInCall"
  | "chooseComputerAction"
  | "isSoloHumanFolded"
  | "bettingComplete"
  | "STARTING_STACK"
  | "BLIND_LEVELS"
  | "DEFAULT_BIG_BLIND"
  | "DEFAULT_SMALL_BLIND"
  | "MAX_PLAYERS"
  | "PLAYER_COLORS"
>;

export interface ServerApi extends ServerEngineApi {
  // ── runtime flags / handles ──────────────────────────────────────────────
  saveTimer: ReturnType<typeof setTimeout> | null;
  shuttingDown: boolean;
  holdNewHands: boolean;
  suppressPersistence: boolean;
  handoffComplete: boolean;
  stateRestored: boolean;
  serverListening: boolean;
  stateStore: StateStore | null;
  unsubscribeHandoff: (() => void | Promise<void>) | null;
  takeoverTimer: ReturnType<typeof setTimeout> | null;
  handoffPollTimer: ReturnType<typeof setInterval> | null;
  handoffWaitStartedAtMs: number;
  lastHandoffMeta: HandoffMeta | null;

  // ── http / sockets ───────────────────────────────────────────────────────
  app: Express;
  server: HttpServer;
  io: TypedIoServer;
  makeId: () => string;
  rooms: Map<string, Room>;
  socketRoom: Map<string, string>;
  socketPlayer: Map<string, string>;
  liveRoomIds: Set<string>;

  // ── config ───────────────────────────────────────────────────────────────
  BUILD_ID: string;
  DEFAULT_BUY_IN_CENTS: number;
  PORT: number | string;
  DISCONNECT_GRACE_MS: number;
  BACKGROUND_DISCONNECT_GRACE_MS: number;
  BACKGROUND_PRESENCE_TTL_MS: number;
  STATE_FILE: string;
  DEPLOY_HAND_WAIT_MS: number;
  DEPLOY_TAKEOVER_MS: number;
  DEPLOY_HANDOFF_POLL_MS: number;
  SAVE_DEBOUNCE_MS: number;
  SHOWDOWN_DELAY_MS: number;
  CPU_ACTION_DELAY_MS: number;
  SHOT_CLOCK_OPTIONS_MS: readonly number[];
  SHOT_CLOCK_DEFAULT_MS: number;
  SHOT_CLOCK_MIN_MS: number;
  SHOT_CLOCK_MAX_MS: number;
  READY_TIMER_OPTIONS_MS: readonly number[];
  READY_TIMER_DEFAULT_MS: number;
  READY_TIMER_MS: number;
  READY_TIMER_MIN_MS: number;
  READY_TIMER_MAX_MS: number;
  DORMANT_ROOM_TTL_MS: number;
  SETTLED_MONEY_ROOM_TTL_MS: number;
  shotClockTime: ShotClockTime;
  setShotClockTime: (hooks?: Partial<ShotClockTime>) => void;
  resetShotClockTime: () => void;
  normalizeShotClockMs: (value: unknown, fallback?: number) => number;
  normalizeReadyTimerMs: (value: unknown, fallback?: number) => number;
  formatShotClockSeconds: (seconds: number) => string;
  envNonNegativeMs: (name: string, fallback: number) => number;
  crypto: typeof import("crypto");
  path: typeof import("path");

  // ── store / lifecycle ────────────────────────────────────────────────────
  getStateStore: () => StateStore;
  setStateStore: (store: StateStore | null) => void;
  usingRedis: () => boolean;
  markRoomLive: (roomId: string) => void;
  markStateRestored: (value?: boolean) => void;
  markServerListening: (value?: boolean) => void;
  isHoldingNewHands: () => boolean;
  isHandoffComplete: () => boolean;
  isServerReady: () => boolean;

  registerHttpRoutes: () => void;
  registerSocketHandlers: () => void;
  startServer: () => Promise<void>;

  // ── money ────────────────────────────────────────────────────────────────
  cleanMoneyCents: (value: unknown, fallback?: number) => number;
  chipValueCents: (room: Room) => number;
  centsToChips: (room: Room, cents: number) => number;
  chipsToCents: (room: Room, chips: number) => number;
  syncPlayerToMoneyLedger: (room: Room, player: Player) => LedgerEntry | null;
  addMoneyBuyIn: (room: Room, player: Player, cents: number) => void;
  optimizeSettlements: (entries: LedgerEntry[]) => Settlement[];
  settleMoneyGame: (room: Room) => void;
  cashInPlayer: (
    room: Room,
    playerId: string,
    amountCents: number,
  ) => { ok: boolean; error?: string };
  playerCanCashIn: (room: Room, player: Player | null | undefined) => boolean;
  cashOutPlayer: (room: Room, playerId: string) => { ok: boolean; error?: string };
  moneyTermsForRoom: (room: Room) => MoneyTerms;
  moneyTermsAccepted: (room: Room, terms: MoneyTerms | null | undefined) => boolean;

  // ── timers ───────────────────────────────────────────────────────────────
  clearTurnTimer: (room: Room) => void;
  clearReadyTimer: (room: Room) => void;
  applyReadyTimeout: (room: Room) => void;
  armReadyTimeout: (room: Room, delayMs: number) => void;
  scheduleReadyTimer: (room: Room) => void;
  autoTurnAction: (room: Room, player: Player) => { type: string };
  isBettingStreet: (phase: string) => boolean;
  armTurnTimeout: (room: Room, delayMs: number) => void;
  scheduleHumanTurnTimer: (room: Room) => void;
  setRoomShotClock: (room: Room, seconds: number) => { ok: boolean; error?: string };
  setRoomReadyTimer: (room: Room, seconds: number) => { ok: boolean; error?: string };
  scheduleComputerTurn: (room: Room) => void;

  // ── rooms ────────────────────────────────────────────────────────────────
  claimRoomForLiveActivity: (roomId: string) => Promise<Room | null>;
  tryStartReadyHand: (room: Room) => boolean;
  anyHandInProgress: () => boolean;
  waitForHandsToFinish: (
    maxMs: number,
    opts?: { now?: () => number; sleep?: (ms: number) => Promise<void> },
  ) => Promise<boolean>;
  newReconnectCredentials: () => { token: string; tokenHash: string };
  reconnectTokenMatches: (
    player: Pick<Player, "reconnectTokenHash"> | Player | Spectator | null | undefined,
    token: string | undefined,
  ) => boolean;
  serializePlayerForStorage: (player: Player) => StoredPlayer;
  serializeRoomForStorage: (room: Room) => StoredRoom;
  buildRoomsPayload: (
    roomList: Room[],
    options?: { shutdownFlush?: boolean },
  ) => PersistedState;
  saveRoomsNow: (options?: {
    shutdownFlush?: boolean;
    all?: boolean;
  }) => Promise<PersistedState | null | undefined>;
  scheduleSave: () => void;
  pauseRoomTimers: (room: Room) => void;
  pauseAllRoomTimers: () => void;
  extendDeadlinesAfterRestore: (room: Room, downtimeMs: number) => void;
  downtimeMsFromSavedAt: (savedAt: string | undefined, now?: number) => number;
  handoffPadMs: (handoffMeta: HandoffMeta | null | undefined, now?: number) => number;
  restoreDowntimeMs: (
    payload: PersistedState | null | undefined,
    options?: { downtimeMs?: number; handoffMeta?: HandoffMeta | null },
    now?: number,
  ) => number;
  clearRoomDormancy: (room: Room) => void;
  isSettledMoneyRoom: (room: Room) => boolean;
  roomCleanupTtlMs: (room: Room) => number;
  scheduleDormantRoomCleanup: (room: Room) => void;
  preserveSettledMoneyRoom: (room: Room) => void;
  restorePlayer: (raw: StoredPlayer | Record<string, unknown>) => Player;
  markRestoredHumanAsBot: (room: Room, player: Player) => void;
  restoreRoom: (raw: StoredRoom | Record<string, unknown>) => Room | null;
  dedupePlayersById: (room: Room) => void;
  assignMissingPlayerColors: (room: Room) => void;
  activateRoom: (room: Room, opts?: { scheduleSaveAfter?: boolean }) => void;
  clearRoomRuntime: (room: Room) => void;
  applyRoomsPayload: (
    payload: PersistedState | null | undefined,
    options?: {
      downtimeMs?: number;
      handoffMeta?: HandoffMeta | null;
      replaceLive?: boolean;
      replaceNonLive?: boolean;
      activate?: boolean;
      markLive?: boolean;
    },
  ) => { restored: number; downtimeMs: number } | void;
  loadFilePayloadForMigration: () => Promise<PersistedState | null>;
  loadRooms: (options?: Record<string, unknown>) => Promise<unknown>;
  refreshNonLiveRoomsFromStore: (options?: {
    downtimeMs?: number;
    handoffMeta?: HandoffMeta | null;
  }) => Promise<unknown>;
  makeRoom: (
    hostId: string,
    hostName: string,
    socketId: string,
    tableSize?: number,
    options?: Record<string, unknown>,
  ) => Room;
  getRoom: (roomId: string) => Room | undefined;
  cleanDeviceId: (deviceId: unknown, fallback: string) => string;
  cleanBlind: (value: unknown, fallback: number) => number;
  makeHumanPlayer: (
    room: Room,
    opts: { id: string; socketId: string; name: string; reconnectTokenHash: string },
  ) => Player;
  attachSocketToPlayer: (
    socket: { id: string; join: (roomId: string) => void },
    room: Room,
    player: Player,
  ) => void;
  ensureSpectators: (room: Room) => Spectator[];
  findSpectator: (room: Room, spectatorId: string) => Spectator | null | undefined;
  watchingCount: (room: Room) => number;
  roomSeatCap: (room: Room) => number;
  roomIsFull: (room: Room) => boolean;
  canTakeSeatNow: (room: Room) => boolean;
  makeSpectator: (opts: {
    id: string;
    socketId: string;
    name: string;
    reconnectTokenHash: string;
  }) => Spectator;
  attachSocketToSpectator: (
    socket: { id: string; join: (roomId: string) => void },
    room: Room,
    spectator: Spectator,
  ) => void;
  removeSpectator: (room: Room, spectator: Spectator) => void;
  clearSpectators: (room: Room) => void;
  replaceActedId: (room: Room, oldId: string, newId: string) => void;
  replaceRaiseEligibleId: (room: Room, oldId: string, newId: string) => void;
  convertBotToHuman: (
    socket: { id: string; join: (roomId: string) => void },
    room: Room,
    bot: Player,
    playerId: string,
    name: string,
    reconnectTokenHash: string | null | undefined,
  ) => Player;
  convertHumanToBot: (room: Room, player: Player) => Player | null;
  endGame: (room: Room) => void;
  restartGame: (room: Room) => void;
  setPlayerColor: (room: Room, playerId: string, color: string) => { ok: boolean; error?: string };
  setPlayerName: (room: Room, playerId: string, name: string) => { ok: boolean; error?: string };
  hasConnectedHuman: (room: Room) => boolean;
  serializeRoom: (room: Room, viewerId: string) => ClientRoom;
  scheduleShowdown: (room: Room) => void;
  emitRoom: (room: Room) => void;
  detachSocketFromRoom: (socketId: string, roomId: string) => void;
  chooseNextHost: (room: Room) => void;
  transferHost: (
    room: Room | null | undefined,
    currentHostId: string | undefined,
    nextHostId: string,
  ) => { ok: boolean; error?: string };
  removePlayerAfterDisconnect: (room: Room, player: Player) => void;
  leaveCurrentRoom: (
    socket: { id: string },
    opts?: { removeAfterGrace?: boolean; allowBackgroundGrace?: boolean },
  ) => void;
  kickPlayerFromRoom: (room: Room, playerId: string) => Player | null;

  // ── deploy ───────────────────────────────────────────────────────────────
  clearHandoffWaiters: () => void;
  isRelevantHandoffMeta: (
    meta: HandoffMeta | null | undefined,
    opts?: { waitStartedAtMs?: number; now?: number },
  ) => boolean;
  completeHandoffTakeover: (
    reason?: string,
    handoffMeta?: HandoffMeta | null,
  ) => Promise<{ ok: boolean; reason?: string }>;
  maybeTakeoverFromHandoffKey: (reason?: string) => Promise<boolean>;
  setupHandoffSubscription: () => Promise<void>;
  notifyDeployWaiting: () => void;
  gracefulShutdown: (
    signal?: string,
    options?: {
      exit?: boolean;
      handWaitMs?: number;
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) => Promise<unknown>;
  resetShutdownState: () => void;
}

/** Create the empty bag; modules fill it during require/bootstrap. */
export function createServerApiBag(): ServerApi {
  // Progressive assignment during side-effect imports — Partial then sealed as ServerApi.
  const bag: Partial<ServerApi> = {};
  return bag as ServerApi;
}
