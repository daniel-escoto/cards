const path = require("path");
const crypto = require("crypto");
const engine = require("../shared/engine");
const api = require("./api");

const PACKAGE_VERSION = (() => {
  try {
    return require("../package.json").version || "1.0.0";
  } catch {
    return "1.0.0";
  }
})();

const PORT = process.env.PORT || 3000;
/** Deploy/build identity for client version handoff (Railway commit SHA or package version). */
const BUILD_ID =
  String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.BUILD_ID || PACKAGE_VERSION).trim() ||
  PACKAGE_VERSION;
const DEFAULT_BUY_IN_CENTS = 2000;

const {
  STARTING_STACK,
  BLIND_LEVELS,
  DEFAULT_BIG_BLIND,
  DEFAULT_SMALL_BLIND,
  MAX_PLAYERS,
  PLAYER_COLORS,
  setRandomInt,
  blindLevelForHand,
  currentBlinds,
  publicCard,
  cleanName,
  cleanTableSize,
  cleanPlayerColor,
  defaultPlayerColor,
  makePlayer,
  computerName,
  addComputerPlayers,
  nextBotNumber,
  canActPlayers,
  nextIndex,
  playerIndex,
  resetHandState,
  isHandInProgress,
  canAdministerGame,
  canReadyForHand,
  resetReadiness,
  maybeStartReadyHand,
  playersWithChips,
  maybeAdvance,
  collectPot,
  buildSidePots,
  settleShowdown,
  applyPlayerAction,
  showPlayerCards,
  sanitizeActionLogForClient,
  visibleHoleCards,
  estimateComputerConfidence,
  chooseComputerRaiseTo,
  preflopBlindRaiseChance,
  preflopShoveRange,
  estimatePreflopEquityAgainstRange,
  estimatePostflopEquity,
  assessPreflopAllInCall,
  chooseComputerAction,
  isSoloHumanFolded,
  bettingComplete,
} = engine;

setRandomInt((maxExclusive) => crypto.randomInt(maxExclusive));

function envNonNegativeMs(name, fallback) {
  if (process.env[name] == null || process.env[name] === "") return fallback;
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}
// Allow 0 via env (tests); `Number("0") || fallback` would incorrectly keep the default.
const DISCONNECT_GRACE_MS = envNonNegativeMs("DISCONNECT_GRACE_MS", 30000);
const BACKGROUND_DISCONNECT_GRACE_MS = Math.max(
  DISCONNECT_GRACE_MS,
  envNonNegativeMs("BACKGROUND_DISCONNECT_GRACE_MS", 5 * 60 * 1000),
);
const BACKGROUND_PRESENCE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  process.env.DATA_DIR ||
  path.join(__dirname, "..", ".data");
const STATE_FILE = process.env.GAME_STATE_FILE || path.join(DEFAULT_DATA_DIR, "rooms.json");
/** Cap for waiting on in-progress hands during SIGTERM (must stay under Railway's ~30s drain). */
const DEPLOY_HAND_WAIT_MS = envNonNegativeMs("DEPLOY_HAND_WAIT_MS", 25000);
/**
 * Crash-safety takeover if the draining instance never writes a handoff marker.
 * Keep under Railway's ~30s drain/overlap window so we don't sit passive too long.
 */
const DEPLOY_TAKEOVER_MS = envNonNegativeMs("DEPLOY_TAKEOVER_MS", 20000);
/** How often a booting Redis replica polls the durable holdem:handoff key. */
const DEPLOY_HANDOFF_POLL_MS = envNonNegativeMs("DEPLOY_HANDOFF_POLL_MS", 200);
const SAVE_DEBOUNCE_MS = 150;
const SHOWDOWN_DELAY_MS = 1600;
const CPU_ACTION_DELAY_MS = 250;
/** Host shot-clock presets (ms). 0 = Off. Default 30s. Custom values allowed in [MIN, MAX]. */
const SHOT_CLOCK_OPTIONS_MS = Object.freeze([0, 15000, 30000, 60000, 90000, 120000, 300000]);
const SHOT_CLOCK_DEFAULT_MS = 30000;
const SHOT_CLOCK_MIN_MS = 10000;
const SHOT_CLOCK_MAX_MS = 600000;
/** Host ready-up timer presets (ms). 0 = Off. Default 20s. Custom values allowed in [MIN, MAX]. */
const READY_TIMER_OPTIONS_MS = Object.freeze([0, 10000, 20000, 30000, 60000]);
const READY_TIMER_DEFAULT_MS = 20000;
/** @deprecated alias — prefer READY_TIMER_DEFAULT_MS */
const READY_TIMER_MS = READY_TIMER_DEFAULT_MS;
const READY_TIMER_MIN_MS = 5000;
const READY_TIMER_MAX_MS = 300000;
const DORMANT_ROOM_TTL_MS = Math.max(
  60000,
  Number(process.env.DORMANT_ROOM_TTL_MS) || 60 * 60 * 1000,
);
/** Injectable clock for tests (fake timers). Production uses Date/setTimeout. */
const shotClockTime = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};

function setShotClockTime(hooks = {}) {
  if (typeof hooks.now === "function") shotClockTime.now = hooks.now;
  if (typeof hooks.setTimeout === "function") shotClockTime.setTimeout = hooks.setTimeout;
  if (typeof hooks.clearTimeout === "function") shotClockTime.clearTimeout = hooks.clearTimeout;
}

function resetShotClockTime() {
  shotClockTime.now = () => Date.now();
  shotClockTime.setTimeout = (fn, ms) => setTimeout(fn, ms);
  shotClockTime.clearTimeout = (timer) => clearTimeout(timer);
}

function normalizeShotClockMs(value, fallback = SHOT_CLOCK_DEFAULT_MS) {
  const ms = Math.floor(Number(value));
  if (!Number.isFinite(ms)) return fallback;
  if (ms === 0) return 0;
  if (ms >= SHOT_CLOCK_MIN_MS && ms <= SHOT_CLOCK_MAX_MS) return ms;
  return fallback;
}

function normalizeReadyTimerMs(value, fallback = READY_TIMER_DEFAULT_MS) {
  const ms = Math.floor(Number(value));
  if (!Number.isFinite(ms)) return fallback;
  if (ms === 0) return 0;
  if (ms >= READY_TIMER_MIN_MS && ms <= READY_TIMER_MAX_MS) return ms;
  return fallback;
}

function formatShotClockSeconds(seconds) {
  if (!seconds) return "Off";
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
/** Empty settled money rooms keep their ledger this long so players can reopen settle-up by room code. */
const SETTLED_MONEY_ROOM_TTL_MS = Math.max(
  DORMANT_ROOM_TTL_MS,
  Number(process.env.SETTLED_MONEY_ROOM_TTL_MS) || 48 * 60 * 60 * 1000,
);

Object.assign(api, {
  BUILD_ID,
  DEFAULT_BUY_IN_CENTS,
  PORT,
  DISCONNECT_GRACE_MS,
  BACKGROUND_DISCONNECT_GRACE_MS,
  BACKGROUND_PRESENCE_TTL_MS,
  STATE_FILE,
  DEPLOY_HAND_WAIT_MS,
  DEPLOY_TAKEOVER_MS,
  DEPLOY_HANDOFF_POLL_MS,
  SAVE_DEBOUNCE_MS,
  SHOWDOWN_DELAY_MS,
  CPU_ACTION_DELAY_MS,
  SHOT_CLOCK_OPTIONS_MS,
  SHOT_CLOCK_DEFAULT_MS,
  SHOT_CLOCK_MIN_MS,
  SHOT_CLOCK_MAX_MS,
  READY_TIMER_OPTIONS_MS,
  READY_TIMER_DEFAULT_MS,
  READY_TIMER_MS,
  READY_TIMER_MIN_MS,
  READY_TIMER_MAX_MS,
  DORMANT_ROOM_TTL_MS,
  SETTLED_MONEY_ROOM_TTL_MS,
  shotClockTime,
  setShotClockTime,
  resetShotClockTime,
  normalizeShotClockMs,
  normalizeReadyTimerMs,
  formatShotClockSeconds,
  envNonNegativeMs,
  STARTING_STACK,
  BLIND_LEVELS,
  DEFAULT_BIG_BLIND,
  DEFAULT_SMALL_BLIND,
  MAX_PLAYERS,
  PLAYER_COLORS,
  blindLevelForHand,
  currentBlinds,
  publicCard,
  cleanName,
  cleanTableSize,
  cleanPlayerColor,
  defaultPlayerColor,
  makePlayer,
  computerName,
  addComputerPlayers,
  nextBotNumber,
  canActPlayers,
  nextIndex,
  playerIndex,
  resetHandState,
  isHandInProgress,
  canAdministerGame,
  canReadyForHand,
  resetReadiness,
  maybeStartReadyHand,
  playersWithChips,
  maybeAdvance,
  collectPot,
  buildSidePots,
  settleShowdown,
  applyPlayerAction,
  showPlayerCards,
  sanitizeActionLogForClient,
  visibleHoleCards,
  estimateComputerConfidence,
  chooseComputerRaiseTo,
  preflopBlindRaiseChance,
  preflopShoveRange,
  estimatePreflopEquityAgainstRange,
  estimatePostflopEquity,
  assessPreflopAllInCall,
  chooseComputerAction,
  isSoloHumanFolded,
  bettingComplete,
  crypto,
  path,
});

module.exports = {
  BUILD_ID,
  DEFAULT_BUY_IN_CENTS,
  PORT,
  DISCONNECT_GRACE_MS,
  BACKGROUND_DISCONNECT_GRACE_MS,
  BACKGROUND_PRESENCE_TTL_MS,
  STATE_FILE,
  DEPLOY_HAND_WAIT_MS,
  DEPLOY_TAKEOVER_MS,
  DEPLOY_HANDOFF_POLL_MS,
  SAVE_DEBOUNCE_MS,
  SHOWDOWN_DELAY_MS,
  CPU_ACTION_DELAY_MS,
  SHOT_CLOCK_OPTIONS_MS,
  SHOT_CLOCK_DEFAULT_MS,
  SHOT_CLOCK_MIN_MS,
  SHOT_CLOCK_MAX_MS,
  READY_TIMER_OPTIONS_MS,
  READY_TIMER_DEFAULT_MS,
  READY_TIMER_MS,
  READY_TIMER_MIN_MS,
  READY_TIMER_MAX_MS,
  DORMANT_ROOM_TTL_MS,
  SETTLED_MONEY_ROOM_TTL_MS,
  shotClockTime,
  setShotClockTime,
  resetShotClockTime,
  normalizeShotClockMs,
  normalizeReadyTimerMs,
  formatShotClockSeconds,
  envNonNegativeMs,
  STARTING_STACK,
  BLIND_LEVELS,
  DEFAULT_BIG_BLIND,
  DEFAULT_SMALL_BLIND,
  MAX_PLAYERS,
  PLAYER_COLORS,
};
