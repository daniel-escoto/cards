var socket =
  typeof io === "function"
    ? io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 4000,
      })
    : null;

var welcome = document.querySelector("#welcome") as HTMLElement;
var themeColor = document.querySelector("#themeColor") as HTMLMetaElement;
var tableView = document.querySelector("#tableView") as HTMLElement;
var scoreView = document.querySelector("#scoreView") as HTMLElement;
var joinForm = document.querySelector("#joinForm") as HTMLFormElement;
var nameInput = document.querySelector("#nameInput") as HTMLInputElement;
var roomInput = document.querySelector("#roomInput") as HTMLInputElement;
var roomCodeLabel = document.querySelector("#roomCodeLabel") as HTMLElement;
var hostModeBtn = document.querySelector("#hostModeBtn") as HTMLButtonElement;
var joinModeBtn = document.querySelector("#joinModeBtn") as HTMLButtonElement;
var moneyModeLabel = document.querySelector("#moneyModeLabel") as HTMLElement;
var blindFields = document.querySelector("#blindFields") as HTMLElement;
var smallBlindInput = document.querySelector("#smallBlindInput") as HTMLInputElement;
var bigBlindInput = document.querySelector("#bigBlindInput") as HTMLInputElement;
var smallBlindLabel = document.querySelector("#smallBlindLabel") as HTMLElement;
var bigBlindLabel = document.querySelector("#bigBlindLabel") as HTMLElement;
var moneyModeInput = document.querySelector("#moneyModeInput") as HTMLInputElement;
var buyInLabel = document.querySelector("#buyInLabel") as HTMLElement;
var buyInInput = document.querySelector("#buyInInput") as HTMLInputElement;
var tableActionBtn = document.querySelector("#tableActionBtn") as HTMLButtonElement;
var watchBtn = document.querySelector("#watchBtn") as HTMLButtonElement;
var joinError = document.querySelector("#joinError") as HTMLElement;
var roomCode = document.querySelector("#roomCode") as HTMLElement;
var roomCodeBtn = document.querySelector("#roomCodeBtn") as HTMLButtonElement;
var watchingCountEl = document.querySelector("#watchingCount") as HTMLElement;
var menuBtn = document.querySelector("#menuBtn") as HTMLButtonElement;
var gameMenuModal = document.querySelector("#gameMenuModal") as HTMLElement;
var closeMenuBtn = document.querySelector("#closeMenuBtn") as HTMLButtonElement;
var menuMainView = document.querySelector("#menuMainView") as HTMLElement;
var menuSettingsView = document.querySelector("#menuSettingsView") as HTMLElement;
var menuHostView = document.querySelector("#menuHostView") as HTMLElement;
var openSettingsBtn = document.querySelector("#openSettingsBtn") as HTMLButtonElement;
var closeSettingsBtn = document.querySelector("#closeSettingsBtn") as HTMLButtonElement;
var closeSettingsMenuBtn = document.querySelector("#closeSettingsMenuBtn") as HTMLButtonElement;
var openHostBtn = document.querySelector("#openHostBtn") as HTMLButtonElement;
var closeHostBtn = document.querySelector("#closeHostBtn") as HTMLButtonElement;
var closeHostMenuBtn = document.querySelector("#closeHostMenuBtn") as HTMLButtonElement;
var addBotBtn = document.querySelector("#addBotBtn") as HTMLButtonElement;
var restartGameBtn = document.querySelector("#restartGameBtn") as HTMLButtonElement;
var endGameBtn = document.querySelector("#endGameBtn") as HTMLButtonElement;
var shareGameBtn = document.querySelector("#shareGameBtn") as HTMLButtonElement;
var backToMenuBtn = document.querySelector("#backToMenuBtn") as HTMLButtonElement;
var sitOutBtn = document.querySelector("#sitOutBtn") as HTMLButtonElement;
var hostActionsPanel = document.querySelector("#hostActionsPanel") as HTMLElement;
var menuRoomCode = document.querySelector("#menuRoomCode") as HTMLElement;
var menuRoomEyebrow = document.querySelector("#menuRoomEyebrow") as HTMLElement | null;
var menuNameForm = document.querySelector("#menuNameForm") as HTMLFormElement;
var menuPlayers = document.querySelector("#menuPlayers") as HTMLElement;
var openPlayerSheetId = "";
var feltChoices = document.querySelector("#feltChoices") as HTMLElement;
var deckChoices = document.querySelector("#deckChoices") as HTMLElement;
var soundEnabledInput = document.querySelector("#soundEnabledInput") as HTMLInputElement;
var keybindList = document.querySelector("#keybindList") as HTMLElement;
var resetKeybindsBtn = document.querySelector("#resetKeybindsBtn") as HTMLButtonElement;
var sharePanel = document.querySelector("#sharePanel") as HTMLElement;
var shareQr = document.querySelector("#shareQr") as HTMLImageElement;
var shareLink = document.querySelector("#shareLink") as HTMLInputElement;
var copyShareBtn = document.querySelector("#copyShareBtn") as HTMLButtonElement;
var moneyPanel = document.querySelector("#moneyPanel") as HTMLElement;
var moneyDetails = document.querySelector("#moneyDetails") as HTMLElement;
var blindPanel = document.querySelector("#blindPanel") as HTMLElement;
var blindForm = document.querySelector("#blindForm") as HTMLFormElement;
var menuSmallBlindLabel = document.querySelector("#menuSmallBlindLabel") as HTMLElement;
var menuBigBlindLabel = document.querySelector("#menuBigBlindLabel") as HTMLElement;
var menuSmallBlindInput = document.querySelector("#menuSmallBlindInput") as HTMLInputElement;
var menuBigBlindInput = document.querySelector("#menuBigBlindInput") as HTMLInputElement;
var shotClockPanel = document.querySelector("#shotClockPanel") as HTMLElement;
var shotClockChoices = document.querySelector("#shotClockChoices") as HTMLElement;
var shotClockCustomForm = document.querySelector("#shotClockCustomForm") as HTMLFormElement;
var shotClockCustomInput = document.querySelector("#shotClockCustomInput") as HTMLInputElement;
var readyTimerPanel = document.querySelector("#readyTimerPanel") as HTMLElement;
var readyTimerChoices = document.querySelector("#readyTimerChoices") as HTMLElement;
var rabbitHuntPanel = document.querySelector("#rabbitHuntPanel") as HTMLElement;
var rabbitHuntChoices = document.querySelector("#rabbitHuntChoices") as HTMLElement;
var readyTimerCustomForm = document.querySelector("#readyTimerCustomForm") as HTMLFormElement;
var readyTimerCustomInput = document.querySelector("#readyTimerCustomInput") as HTMLInputElement;
var SHOT_CLOCK_CHOICES = [
  { seconds: 15, label: "15s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "60s" },
  { seconds: 90, label: "90s" },
  { seconds: 120, label: "2m" },
  { seconds: 300, label: "5m" },
  { seconds: 0, label: "Off" },
];
var SHOT_CLOCK_CUSTOM = "custom";
var READY_TIMER_CHOICES = [
  { seconds: 10, label: "10s" },
  { seconds: 20, label: "20s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "60s" },
  { seconds: 0, label: "Off" },
];
var READY_TIMER_CUSTOM = "custom";
/** Client clock skew vs server (serverNow - Date.now). Countdown uses absolute turnEndsAt. */
var serverTimeOffsetMs = 0;
var shotClockCustomOpen = false;
var readyTimerCustomOpen = false;
var cashInInput = document.querySelector("#cashInInput") as HTMLInputElement;
var cashInBtn = document.querySelector("#cashInBtn") as HTMLButtonElement;
var cashOutBtn = document.querySelector("#cashOutBtn") as HTMLButtonElement;
var moneyNote = document.querySelector(".money-note") as HTMLElement;
var potValue = document.querySelector("#potValue") as HTMLElement;
var community = document.querySelector("#community") as HTMLElement;
var players = document.querySelector("#players") as HTMLElement;
var heroHand = document.querySelector("#heroHand") as HTMLElement;
var winnerList = document.querySelector("#winnerList") as HTMLElement;
var turnInfo = document.querySelector("#turnInfo") as HTMLElement;
var gameButtons = document.querySelector("#gameButtons") as HTMLElement;
var betControls = document.querySelector("#betControls") as HTMLElement;
var raiseMinus = document.querySelector("#raiseMinus") as HTMLButtonElement;
var raisePlus = document.querySelector("#raisePlus") as HTMLButtonElement;
var raiseLabel = document.querySelector("#raiseLabel") as HTMLElement;
var raiseAmount = document.querySelector("#raiseAmount") as HTMLElement;
var raiseActionBtn = document.querySelector("#raiseActionBtn") as HTMLButtonElement;
var betPresets = document.querySelector("#betPresets") as HTMLElement;
var scoreList = document.querySelector("#scoreList") as HTMLElement;
var scoreMenuBtn = document.querySelector("#scoreMenuBtn") as HTMLButtonElement;
var toast = document.querySelector("#toast") as HTMLElement;
var reconnectBanner = document.querySelector("#reconnectBanner") as HTMLElement;
var Deploy: DeployHandoffAPI | null = typeof DeployHandoff !== "undefined" ? DeployHandoff : null;
/** Server build id observed on this page load; used for post-deploy reload gating. */
var knownBuildId: string | null = null;
/** Newer build id seen mid-hand; reload once between hands. */
var pendingServerBuildId: string | null = null;
var expectingServerRestart = false;
var reconnectBannerVisible = false;

var tableSounds = new TableSounds();
soundEnabledInput.checked = tableSounds.enabled;

var {
  escapeHtml,
  escapeRegExp,
  moneyCentsFromInput,
  formatMoney,
  formatSignedMoney,
  formatAmount,
  playerStackLabel,
  cardTemplate,
  playerColorStyle,
} = HoldemFormat;

var KEYBIND_DEFINITIONS = HoldemKeybinds.KEYBIND_DEFINITIONS;
var DEFAULT_KEYBINDS = HoldemKeybinds.DEFAULT_KEYBINDS;
var DEFAULT_KEYBIND_ALIASES = HoldemKeybinds.DEFAULT_KEYBIND_ALIASES;
var keybinds = HoldemKeybinds.loadKeybinds();
var recordingKeybindAction = "";

function normalizedKey(key: string | undefined) {
  return HoldemKeybinds.normalizedKey(key);
}

function loadKeybinds() {
  return HoldemKeybinds.loadKeybinds();
}

function keybindLabel(key: string | undefined) {
  return HoldemKeybinds.keybindLabel(key);
}

function activeKeybindAliases(action: string) {
  return HoldemKeybinds.activeKeybindAliases(keybinds, action);
}

function keysForAction(action: string) {
  return HoldemKeybinds.keysForAction(keybinds, action);
}

function keybindDisplay(action: string) {
  return HoldemKeybinds.keybindDisplay(keybinds, action);
}

function saveKeybinds() {
  HoldemKeybinds.saveKeybinds(keybinds);
}

function renderKeybinds() {
  keybindList.innerHTML = KEYBIND_DEFINITIONS.map(
    ({ id, label }) => `
    <div class="keybind-row">
      <span>${label}</span>
      <button type="button" class="keybind-button ${recordingKeybindAction === id ? "recording" : ""}" data-keybind-action="${id}" aria-label="Set key for ${label}">
        ${recordingKeybindAction === id ? "Press a key…" : escapeHtml(keybindDisplay(id))}
      </button>
    </div>
  `,
  ).join("");
}

function beginKeybindRecording(action: string) {
  if (!DEFAULT_KEYBINDS[action]) return;
  recordingKeybindAction = action;
  renderKeybinds();
  (keybindList.querySelector(`[data-keybind-action="${action}"]`) as HTMLElement | null)?.focus();
}

function cancelKeybindRecording() {
  if (!recordingKeybindAction) return;
  recordingKeybindAction = "";
  renderKeybinds();
}

function assignKeybind(action: string, key: string) {
  const result = HoldemKeybinds.assignKeybindState(keybinds, action, key);
  keybinds = result.keybinds;
  recordingKeybindAction = "";
  saveKeybinds();
  renderKeybinds();
  renderControls(activeHero());
  showToast(result.conflictAction ? "Shortcuts swapped" : "Shortcut updated");
}

function matchesKeybind(event: KeyboardEvent, action: string) {
  return HoldemKeybinds.matchesKeybind(event, keybinds, action);
}

renderKeybinds();

var state: ClientRoom | null = null;
var practiceSession: PracticeSessionHandle | null = null;
var turnCountdownTimer: ReturnType<typeof setInterval> | null = null;
var readyCountdownTimer: ReturnType<typeof setInterval> | null = null;
var lowTimeSession =
  typeof TurnClockWarning !== "undefined" && TurnClockWarning.createLowTimeSession
    ? TurnClockWarning.createLowTimeSession()
    : {
        turnEndsAt: null,
        lastSeenTickSecond: null,
        armed: false,
        sawActive: false,
        timeoutConsumed: false,
      };
var readyLowTimeSession =
  typeof TurnClockWarning !== "undefined" && TurnClockWarning.createLowTimeSession
    ? TurnClockWarning.createLowTimeSession()
    : {
        turnEndsAt: null,
        lastSeenTickSecond: null,
        armed: false,
        sawActive: false,
        timeoutConsumed: false,
      };
var lowTimeVibratedForEndsAt: number | null = null;
/** Absolute deadlines for which this client was eligible to hear timer cues (survives server clear). */
var shotClockCueEligibleForEndsAt: number | null = null;
var readyCueEligibleForEndsAt: number | null = null;
var raiseState = { value: 0, min: 0, max: 0, step: 20 };
var raiseControlsDisabled = false;
/**
 * Merged confirm: one button for Check ↔ Bet {amount} (toCall === 0) or
 * Call {amount} ↔ Raise {amount} (toCall > 0), driven by the raise detent.
 */
var mergePassiveConfirm = false;
var confirmActionBtn: HTMLButtonElement | null = null;
var leavingEndedRoom = false;
var menuTimer: ReturnType<typeof setInterval> | null = null;
var lastAutoRejoinKey = "";
var lastActionEntryId = "";
var lastCommunitySignature: string | null = null;
var lastHeroSignature = "";
var heroCardsHidden = false;
var lastWinnerSignature = "";
var lastPhase = "";
var lastPot: number | null = null;
var params = new URLSearchParams(window.location.search);
var initialRoomParam = (params.get("room") || "").toUpperCase();
var initialRoomId = (
  initialRoomParam ||
  localStorage.getItem("holdem:lastRoom") ||
  ""
).toUpperCase();
if (initialRoomId) roomInput.value = initialRoomId;
nameInput.value = localStorage.getItem("holdem:name") || "";
var joinPending = false;
var watchOfferPending = false;
var acceptedMoneyTerms: MoneyTerms | null = null;
var joinPreview = document.querySelector("#joinPreview") as HTMLElement;
var didAutoJoinInitialRoom = false;
var tableMode = initialRoomId ? "join" : "host";
var toastTimer: ReturnType<typeof setTimeout> | null = null;
var FELT_OPTIONS = [
  { id: "emerald", label: "Emerald", color: "#116853" },
  { id: "navy", label: "Navy", color: "#24527a" },
  { id: "wine", label: "Wine", color: "#7b3043" },
  { id: "violet", label: "Violet", color: "#58448b" },
  { id: "mint", label: "Mint", color: "#72bca4" },
  { id: "sky", label: "Sky", color: "#75aeca" },
  { id: "sand", label: "Sand", color: "#c3a875" },
  { id: "blush", label: "Blush", color: "#c98791" },
];
var DECK_OPTIONS = [
  { id: "classic", label: "Casino", description: "Crisp & familiar", rank: "A", suit: "♠" },
  { id: "midnight", label: "Midnight", description: "Dark & modern", rank: "K", suit: "♠" },
  { id: "ruby", label: "Burgundy", description: "Warm & dramatic", rank: "Q", suit: "♥" },
  { id: "heritage", label: "Heritage", description: "Old-school club", rank: "J", suit: "♣" },
  { id: "riviera", label: "Riviera", description: "Bright & playful", rank: "10", suit: "♦" },
  { id: "minimal", label: "Minimal", description: "Quiet & refined", rank: "A", suit: "♦" },
];

function applyTheme(theme: string) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  themeColor?.setAttribute("content", nextTheme === "dark" ? "#090d10" : "#eef1ec");
}

var deviceTheme = window.matchMedia("(prefers-color-scheme: light)");
applyTheme(deviceTheme.matches ? "light" : "dark");

function applyTableAppearance(felt: string | null, deck: string | null, persist = false) {
  const nextFelt = FELT_OPTIONS.some((option) => option.id === felt) ? felt! : "emerald";
  const nextDeck = DECK_OPTIONS.some((option) => option.id === deck) ? deck! : "classic";
  document.documentElement.dataset.felt = nextFelt;
  document.documentElement.dataset.deck = nextDeck;
  if (persist) {
    localStorage.setItem("holdem:felt", nextFelt);
    localStorage.setItem("holdem:deck", nextDeck);
  }
  renderAppearanceChoices();
}

function renderAppearanceChoices() {
  if (!feltChoices || !deckChoices) return;
  feltChoices.innerHTML = FELT_OPTIONS.map(
    (option) => `
    <button type="button" class="appearance-choice felt-choice ${document.documentElement.dataset.felt === option.id ? "selected" : ""}" data-felt="${option.id}" aria-label="${option.label} felt" aria-pressed="${document.documentElement.dataset.felt === option.id}">
      <i style="--choice-color:${option.color}" aria-hidden="true"></i><span>${option.label}</span>
    </button>
  `,
  ).join("");
  deckChoices.innerHTML = DECK_OPTIONS.map(
    (option) => `
    <button type="button" class="appearance-choice deck-choice ${document.documentElement.dataset.deck === option.id ? "selected" : ""}" data-deck="${option.id}" aria-label="${option.label}: ${option.description}" aria-pressed="${document.documentElement.dataset.deck === option.id}">
      <span class="deck-preview" aria-hidden="true">
        <i class="deck-preview-back"></i>
        <i class="deck-preview-front ${["♥", "♦"].includes(option.suit) ? "red" : ""}"><b>${option.rank}</b><em>${option.suit}</em></i>
      </span>
      <span class="deck-choice-copy"><strong>${option.label}</strong><small>${option.description}</small></span>
    </button>
  `,
  ).join("");
}

applyTableAppearance(localStorage.getItem("holdem:felt"), localStorage.getItem("holdem:deck"));

function getDeviceId() {
  let deviceId = localStorage.getItem("holdem:deviceId");
  if (!deviceId) {
    deviceId =
      window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("holdem:deviceId", deviceId);
  }
  return deviceId;
}

function isRoomCredential(value: unknown): value is RoomCredential {
  if (typeof value !== "object" || value === null) return false;
  if ("playerId" in value && value.playerId != null && typeof value.playerId !== "string") {
    return false;
  }
  if (
    "reconnectToken" in value &&
    value.reconnectToken != null &&
    typeof value.reconnectToken !== "string"
  ) {
    return false;
  }
  if ("spectator" in value && value.spectator != null && typeof value.spectator !== "boolean") {
    return false;
  }
  return true;
}

function roomCredentials(roomId: string): RoomCredential | null {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(`holdem:credentials:${String(roomId || "").toUpperCase()}`) || "null",
    );
    return isRoomCredential(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveRoomCredentials(roomId: string, response: { playerId?: string; reconnectToken?: string; spectator?: boolean }) {
  if (!roomId) return;
  const existing = roomCredentials(roomId) || {};
  const next = {
    playerId: response?.playerId || existing.playerId || getDeviceId(),
    reconnectToken: response?.reconnectToken || existing.reconnectToken || null,
    spectator: Boolean(response?.spectator),
  };
  if (!next.reconnectToken && !next.spectator) return;
  localStorage.setItem(`holdem:credentials:${String(roomId).toUpperCase()}`, JSON.stringify(next));
}

function setViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  const value = `${Math.floor(height)}px`;
  document.documentElement.style.setProperty("--viewport-height", value);
  document.documentElement.style.setProperty("--game-vh", value);
}

function setKeyboardMode(isOpen: boolean) {
  document.body.classList.toggle("keyboard-open", isOpen && !welcome.classList.contains("hidden"));
  setViewportHeight();
}

var previousGameTouchY: number | null = null;

function lockMobileGameOverscroll(event: TouchEvent) {
  if (!document.body.classList.contains("game-open") || !matchMedia("(max-width: 779px)").matches)
    return;

  const touchY = event.touches[0]?.clientY;
  const scrollRegion = (event.target as HTMLElement | null)?.closest?.(".players, .modal-panel");
  const movingDown = previousGameTouchY !== null && touchY > previousGameTouchY;
  const movingUp = previousGameTouchY !== null && touchY < previousGameTouchY;
  previousGameTouchY = touchY;

  const canScrollDown =
    movingUp &&
    scrollRegion != null &&
    scrollRegion.scrollTop < scrollRegion.scrollHeight - scrollRegion.clientHeight;
  const canScrollUp = movingDown && scrollRegion != null && scrollRegion.scrollTop > 0;
  if (!canScrollDown && !canScrollUp) event.preventDefault();
}

function isOfflineSession() {
  return Boolean(practiceSession || state?.offline);
}

function disposePracticeSession() {
  if (!practiceSession) return;
  practiceSession.dispose();
  practiceSession = null;
}

function hostUsesOfflinePath() {
  // Chip Host with no server connection → local table (add bots in-game).
  // Connected chip Host and money Host stay on online create-room.
  return !moneyModeInput.checked && !socket?.connected;
}

/**
 * Mid-session disconnect while solo in a chip room → continue on the local engine.
 * Money / multi-human / already-offline keep reconnect behavior.
 */
function handoffOnlineToOffline() {
  if (practiceSession || !state) return false;
  if (
    typeof PracticeSession?.canHandoffToOffline !== "function" ||
    typeof PracticeSession?.createPracticeSessionFromSnapshot !== "function"
  ) {
    return false;
  }
  if (!PracticeSession.canHandoffToOffline(state)) return false;

  const snapshot = state;
  try {
    practiceSession = PracticeSession.createPracticeSessionFromSnapshot(snapshot, {
      onUpdate: applyRoomUpdate,
    });
  } catch {
    practiceSession = null;
    return false;
  }

  clearRoomUrl();
  lastAutoRejoinKey = "";
  showToast("Connection lost — continuing offline");
  practiceSession.publish();
  return true;
}

function applyRoomUpdate(room: ClientRoom) {
  if (leavingEndedRoom) return;
  noteServerBuildId(room?.buildId, room?.phase);
  if (room?.updatingAfterHand) {
    expectingServerRestart = true;
    setReconnectBanner(true, "Updating after this hand");
  }
  if (isGameOver(room) || isEndedGameReturn(state, room)) {
    leavingEndedRoom = true;
    if (isOfflineSession()) {
      disposePracticeSession();
      showScoreScreen(room);
      return;
    }
    socket?.emit("room:leave");
    showScoreScreen(room);
    return;
  }

  const newTurn =
    room.isYourTurn &&
    (!state?.isYourTurn ||
      state.id !== room.id ||
      state.handNumber !== room.handNumber ||
      state.phase !== room.phase);
  syncServerTimeOffset(room);
  state = room;
  if (newTurn) tableSounds.turn();
  const self = state.players.find((player) => player.isYou && !player.isBot);
  if (self) {
    nameInput.value = self.name;
    localStorage.setItem("holdem:name", self.name);
  }
  joinError.textContent = "";
  render();
  maybeReloadForPendingBuild(room?.phase);
}

function updateTableActionLabel() {
  const isJoining = tableMode === "join";
  const moneyMode = moneyModeInput.checked;
  const offlineHost = !isJoining && hostUsesOfflinePath();
  if (!joinPending) {
    tableActionBtn.textContent = isJoining
      ? acceptedMoneyTerms
        ? "Join table · Play next hand"
        : "Join table"
      : "Host table";
  }
  joinPreview.classList.toggle("hidden", !isJoining || !acceptedMoneyTerms);
  const onlineReady = Boolean(socket?.connected);
  tableActionBtn.disabled = joinPending || (offlineHost ? false : !onlineReady);
  if (watchBtn) {
    watchBtn.classList.toggle("hidden", !isJoining);
    watchBtn.disabled = joinPending || !onlineReady;
    watchBtn.classList.toggle("watch-offer", Boolean(watchOfferPending));
    watchBtn.textContent = watchOfferPending ? "Watch instead" : "Watch";
  }
  blindFields?.classList.toggle("hidden", isJoining);
  moneyModeLabel?.classList.toggle("hidden", isJoining);
  buyInLabel.classList.toggle("hidden", isJoining || !moneyMode);
  roomCodeLabel.classList.toggle("hidden", !isJoining);
  hostModeBtn.classList.toggle("selected", !isJoining);
  joinModeBtn.classList.toggle("selected", isJoining);
  hostModeBtn.setAttribute("aria-selected", String(!isJoining));
  joinModeBtn.setAttribute("aria-selected", String(isJoining));
}

function syncBlindInputMode() {
  if (!blindFields || !smallBlindInput || !bigBlindInput) return;
  const moneyMode = moneyModeInput.checked;
  const previousMode = blindFields.dataset.mode || "chips";
  if ((moneyMode ? "money" : "chips") !== previousMode) {
    if (moneyMode) {
      smallBlindInput.value = (Number(smallBlindInput.value || 10) / 100).toFixed(2);
      bigBlindInput.value = (Number(bigBlindInput.value || 20) / 100).toFixed(2);
    } else {
      smallBlindInput.value = String(
        Math.max(1, Math.round(Number(smallBlindInput.value || 0.1) * 100)),
      );
      bigBlindInput.value = String(
        Math.max(2, Math.round(Number(bigBlindInput.value || 0.2) * 100)),
      );
    }
  }
  blindFields.dataset.mode = moneyMode ? "money" : "chips";
  if (smallBlindLabel) smallBlindLabel.textContent = moneyMode ? "Small blind ($)" : "Small blind";
  if (bigBlindLabel) bigBlindLabel.textContent = moneyMode ? "Big blind ($)" : "Big blind";
  smallBlindInput.min = moneyMode ? "0.01" : "1";
  bigBlindInput.min = moneyMode ? "0.02" : "2";
  smallBlindInput.step = moneyMode ? "0.01" : "1";
  bigBlindInput.step = moneyMode ? "0.01" : "1";
}

function setTableMode(mode: string, focusRoom = false) {
  acceptedMoneyTerms = null;
  watchOfferPending = false;
  tableMode = mode;
  joinError.textContent = "";
  updateTableActionLabel();
  if (focusRoom && mode === "join") roomInput.focus();
}

function isSpectatorView(room: ClientRoom | null = state) {
  return Boolean(room?.isSpectator);
}

function showToast(message: string) {
  if (toastTimer != null) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 1800);
}

function setReconnectBanner(visible: boolean, message = "Updating…, reconnecting") {
  reconnectBannerVisible = Boolean(visible);
  if (!reconnectBanner) return;
  reconnectBanner.textContent = message;
  reconnectBanner.classList.toggle("hidden", !reconnectBannerVisible);
}

function noteServerBuildId(buildId: string | null | undefined, phase: string | null | undefined = state?.phase) {
  if (!buildId) return;
  const nextId = String(buildId);
  if (!knownBuildId) {
    knownBuildId = nextId;
    return;
  }
  if (nextId === knownBuildId) {
    pendingServerBuildId = null;
    return;
  }

  const shouldReload = Deploy?.shouldReloadForNewBuild?.({
    clientBuildId: knownBuildId,
    serverBuildId: nextId,
    phase,
  });
  if (shouldReload) {
    pendingServerBuildId = null;
    window.location.reload();
    return;
  }
  pendingServerBuildId = nextId;
}

function maybeReloadForPendingBuild(phase: string | null | undefined = state?.phase) {
  if (!pendingServerBuildId || !knownBuildId) return;
  if (
    !Deploy?.shouldReloadForNewBuild?.({
      clientBuildId: knownBuildId,
      serverBuildId: pendingServerBuildId,
      phase,
    })
  )
    return;
  window.location.reload();
}

function updateHeroCardVisibility() {
  const hasCards = heroHand.children.length > 0;
  heroHand.classList.toggle("cards-concealed", hasCards && heroCardsHidden);
  heroHand.setAttribute("aria-pressed", String(hasCards && heroCardsHidden));
  heroHand.setAttribute("aria-label", heroCardsHidden ? "Show your cards" : "Hide your cards");
  heroHand.title = heroCardsHidden ? "Show your cards" : "Hide your cards";
  heroHand.querySelectorAll(".card").forEach((card) => {
    card.classList.toggle("back", heroCardsHidden);
    card.setAttribute("aria-hidden", String(heroCardsHidden));
  });
}

function showTable(room: ClientRoom) {
  setViewportHeight();
  document.documentElement.classList.add("game-open-root");
  document.body.classList.add("game-open");
  document.body.classList.remove("keyboard-open");
  welcome.classList.add("hidden");
  scoreView.classList.add("hidden");
  tableView.classList.remove("hidden");
  if (room?.offline) clearRoomUrl();
  else setRoomUrl(room.id);
}

function showMenuMainView() {
  menuSettingsView.classList.add("hidden");
  menuHostView.classList.add("hidden");
  menuMainView.classList.remove("hidden");
  gameMenuModal.querySelectorAll(".appearance-panel").forEach((panel) => {
    (panel as HTMLDetailsElement).open = false;
  });
}

function showMenuSettingsView() {
  menuMainView.classList.add("hidden");
  menuHostView.classList.add("hidden");
  menuSettingsView.classList.remove("hidden");
  syncMenuNameForm();
  closeSettingsBtn.focus({ preventScroll: true });
}

function showMenuHostView() {
  menuMainView.classList.add("hidden");
  menuSettingsView.classList.add("hidden");
  menuHostView.classList.remove("hidden");
  closeHostBtn.focus({ preventScroll: true });
}

function hideGameMenu() {
  cancelKeybindRecording();
  gameMenuModal.classList.add("hidden");
  sharePanel.classList.add("hidden");
  showMenuMainView();
  openPlayerSheetId = "";
  if (menuTimer != null) clearInterval(menuTimer);
  menuTimer = null;
  if (!tableView.classList.contains("hidden")) menuBtn.focus({ preventScroll: true });
}

function playerIsOut(player: ClientPlayer) {
  const betweenHands = ["lobby", "complete", "gameover"].includes(state?.phase || "");
  return player.stack <= 0 && (betweenHands || player.invested <= 0);
}

// Cashed-out / busted seats stay in state.players for ledger, but should not appear
// on the table or menu. Folded / sitting-out / waiting-for-next-hand keep their seat.
function seatedPlayers(players: ClientPlayer[] | null | undefined = state?.players) {
  return (players || []).filter((player) => !playerIsOut(player));
}

function roundStatus(player: ClientPlayer) {
  if (!state) return "";
  if (player.sittingOut)
    return player.cards.length && isBettingPhase(state.phase) ? "Sits out next" : "Sitting out";

  if (!player.connected && player.disconnectExpiresAt) {
    const seconds = Math.max(
      0,
      Math.ceil((new Date(player.disconnectExpiresAt).getTime() - Date.now()) / 1000),
    );
    return seconds > 0 ? `Away ${seconds}s` : "Away";
  }
  if (!player.connected) return "Away";
  if (playerIsOut(player)) return "Out";
  if (["lobby", "complete"].includes(state?.phase)) return "";
  if (player.waitingForNextHand) return "Next hand";
  if (player.folded) return "Folded";
  if (player.allIn) return "All in";
  if (player.isTurn) return "Acting";
  if (player.stack > 0 || player.invested > 0) return "In round";
  return "Out";
}

function isMenuNameEditing() {
  // Treat the whole name form as an edit session. Checking only the text input
  // misses the Save button (and mobile taps that blur the input without focusing
  // the button), which let the 1s menu refresh / room:update replace the form
  // and swallow the click before submit.
  return Boolean(document.activeElement?.closest?.("[data-name-form]"));
}

function isMenuShotClockEditing() {
  return Boolean(document.activeElement?.closest?.("[data-shot-clock-form]"));
}

function isMenuReadyTimerEditing() {
  return Boolean(document.activeElement?.closest?.("[data-ready-timer-form]"));
}

function syncServerTimeOffset(nextState: ClientRoom | null | undefined) {
  const serverNow = Number(nextState?.serverNow);
  if (Number.isFinite(serverNow)) serverTimeOffsetMs = serverNow - Date.now();
}

function clientNow() {
  return Date.now() + serverTimeOffsetMs;
}

function formatTurnCountdown(seconds: number) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total >= 60) {
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }
  return String(total);
}

function syncMenuNameForm() {
  if (!menuNameForm) return;
  const hero = activeHero();
  const canEdit = Boolean(hero && !hero.isBot && !isSpectatorView());
  menuNameForm.classList.toggle("hidden", !canEdit);
  if (!canEdit || isMenuNameEditing()) return;
  const input = menuNameForm.querySelector("[data-player-name]") as HTMLInputElement | null;
  if (input && hero) input.value = hero.name;
}

function syncHostMenuSection() {
  if (!openHostBtn || !hostActionsPanel) return;
  const canRestart = Boolean(state?.canRestartGame && state.phase !== "lobby");
  const canEnd = Boolean(state?.canEndGame);
  const canBlinds = Boolean(state?.canChangeBlinds) && !isSpectatorView();
  const canShotClock =
    Boolean(state?.canChangeShotClock) && !isOfflineSession() && !isSpectatorView();
  const canReadyTimer =
    Boolean(state?.canChangeReadyTimer) && !isOfflineSession() && !isSpectatorView();
  const canRabbitHunt = Boolean(state?.canChangeRabbitHunt) && !isSpectatorView();
  restartGameBtn.classList.toggle("hidden", !canRestart);
  endGameBtn.classList.toggle("hidden", !canEnd);
  hostActionsPanel.classList.toggle("hidden", !canRestart && !canEnd);
  const showHost =
    canBlinds || canShotClock || canReadyTimer || canRabbitHunt || canRestart || canEnd;
  openHostBtn.classList.toggle("hidden", !showHost);
  if (!showHost) menuHostView.classList.add("hidden");
}

function commitMenuDisplayName(nameForm: HTMLElement | null) {
  if (!nameForm) return false;
  const input = nameForm.querySelector("[data-player-name]") as HTMLInputElement | null;
  if (!input) return false;
  const name = input.value.trim();
  if (!name) {
    showToast("Enter a display name.");
    return false;
  }

  // pointerdown (Save) and submit (Enter / click) share this path; dedupe one gesture.
  const now = Date.now();
  if (
    nameForm.dataset.nameSaving === "1" &&
    now - Number(nameForm.dataset.nameSavedAt || 0) < 750
  ) {
    return true;
  }
  nameForm.dataset.nameSaving = "1";
  nameForm.dataset.nameSavedAt = String(now);

  nameInput.value = name;
  localStorage.setItem("holdem:name", name);

  const finish = (ok: boolean, errorMessage?: string) => {
    delete nameForm.dataset.nameSaving;
    if (!ok) showToast(errorMessage || "Could not update name.");
  };

  if (practiceSession) {
    const response = practiceSession.handle("player:setName", { name });
    input.blur();
    finish(Boolean(response?.ok), response?.error);
    return Boolean(response?.ok);
  }
  if (!socket) {
    input.blur();
    finish(false, "Connecting...");
    return false;
  }
  socket.timeout(4000).emit("player:setName", { name }, (error: Error | null, response?: { ok?: boolean; error?: string }) => {
    if (error) {
      finish(false, "Could not update name. Reconnecting...");
      lastAutoRejoinKey = "";
      attemptAutoRejoin();
      return;
    }
    finish(Boolean(response?.ok), response?.error);
  });
  input.blur();
  return true;
}

function renderMenuPlayers() {
  if (!state) return;
  menuRoomCode.textContent = isOfflineSession() ? "Offline" : state.id;
  if (menuRoomEyebrow) menuRoomEyebrow.textContent = isOfflineSession() ? "Mode" : "Room";
  const hero = activeHero();
  if (state.moneyMode && hero) {
    moneyDetails.innerHTML = `
      <div><span>Your stack</span><strong>${formatMoney(hero.stackCents)}</strong></div>
      <div><span>Session</span><strong class="${hero.netCents >= 0 ? "positive" : "negative"}">${formatSignedMoney(hero.netCents)}</strong></div>
    `;
    cashOutBtn.textContent =
      hero.stackCents > 0 ? `Cash out ${formatMoney(hero.stackCents)}` : "No stack";
    cashOutBtn.disabled = hero.stackCents <= 0;
  }
  syncHostMenuSection();
  syncMenuNameForm();
  menuPlayers.innerHTML = seatedPlayers()
    .map((player) => {
      const status = roundStatus(player);
      const hasActions = Boolean(player.canMakeHost || player.canKick);
      const sheetOpen = hasActions && openPlayerSheetId === player.id;
      const badges = [
        player.dealer ? "D" : "",
        player.isHost ? "Host" : "",
        player.isBot ? "Bot" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const sheet = hasActions
        ? `<div class="menu-player-sheet ${sheetOpen ? "" : "hidden"}">
          ${player.canMakeHost ? `<button type="button" class="secondary" data-make-host="${escapeHtml(player.id)}">Make host</button>` : ""}
          ${player.canKick ? `<button type="button" class="danger" data-kick-player="${escapeHtml(player.id)}">Kick</button>` : ""}
        </div>`
        : "";
      const rowTag = hasActions ? "button" : "div";
      const rowAttrs = hasActions
        ? `type="button" class="menu-player-row" data-player-sheet="${escapeHtml(player.id)}" aria-expanded="${sheetOpen ? "true" : "false"}"`
        : `class="menu-player-row static"`;
      return `
    <article class="menu-player ${player.isYou ? "you" : ""} ${player.folded ? "folded" : ""} ${player.isBot ? "bot" : ""} ${sheetOpen ? "sheet-open" : ""}" ${playerColorStyle(player)}>
      <${rowTag} ${rowAttrs}>
        <span class="menu-player-line">
          <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
          ${badges ? `<span class="menu-player-badges">${escapeHtml(badges)}</span>` : ""}
          ${status ? `<em class="menu-player-status">${escapeHtml(status)}</em>` : ""}
        </span>
        <strong class="menu-player-stack">${playerStackLabel(player)}</strong>
      </${rowTag}>
      ${sheet}
    </article>
  `;
    })
    .join("");
  syncCashInControls();
}

function heroCanCashIn() {
  if (!state?.moneyMode) return false;
  if (typeof state.canCashIn === "boolean") return state.canCashIn;
  const hero = activeHero();
  if (!hero) return false;
  const handLive = ["preflop", "flop", "turn", "river", "showdown"].includes(state.phase);
  if (!handLive) return true;
  // Same rule as the server: anyone not contesting the current pot may buy in for next hand.
  return hero.folded || !hero.cards?.length;
}

function syncCashInControls() {
  if (!moneyPanel || moneyPanel.classList.contains("hidden")) return;
  const allowed = heroCanCashIn();
  if (cashInInput) cashInInput.disabled = !allowed;
  if (cashInBtn) {
    cashInBtn.disabled = !allowed;
    cashInBtn.title = allowed
      ? "Add chips for the next hand"
      : "Finish this hand before adding chips";
  }
  if (moneyNote) {
    moneyNote.textContent = allowed
      ? ["preflop", "flop", "turn", "river", "showdown"].includes(state?.phase || "")
        ? "Buy-in now and you’ll play on the next hand. Payments happen separately after the game."
        : "Payments happen separately after the game."
      : "You’re in this hand — buy-in will be available after you fold or the hand ends.";
  }
}

function showGameMenu() {
  openPlayerSheetId = "";
  showMenuMainView();
  renderMenuPlayers();
  gameMenuModal.querySelectorAll(".appearance-panel").forEach((panel) => {
    (panel as HTMLDetailsElement).open = false;
  });
  addBotBtn.classList.toggle("hidden", !state?.canAddBot || isSpectatorView());
  const hero = activeHero();
  sitOutBtn.classList.toggle("hidden", !hero || isSpectatorView() || state?.phase === "gameover");
  if (hero) sitOutBtn.textContent = hero.sittingOut ? "Sit in" : "Sit out";
  moneyPanel.classList.toggle(
    "hidden",
    !state?.moneyMode || isSpectatorView() || isOfflineSession(),
  );
  const offline = isOfflineSession();
  shareGameBtn.classList.toggle("hidden", offline);
  sharePanel.classList.add("hidden");
  blindPanel.classList.toggle("hidden", !state?.canChangeBlinds || isSpectatorView());
  if (state?.canChangeBlinds) {
    const moneyMode = state.moneyMode;
    menuSmallBlindLabel.textContent = moneyMode ? "Small ($)" : "Small";
    menuBigBlindLabel.textContent = moneyMode ? "Big ($)" : "Big";
    menuSmallBlindInput.value = moneyMode
      ? (state.smallBlindCents / 100).toFixed(2)
      : String(state.smallBlind);
    menuBigBlindInput.value = moneyMode
      ? (state.bigBlindCents / 100).toFixed(2)
      : String(state.bigBlind);
    menuSmallBlindInput.min = moneyMode ? "0.01" : "1";
    menuBigBlindInput.min = moneyMode ? "0.02" : "2";
    menuSmallBlindInput.step = moneyMode ? "0.01" : "1";
    menuBigBlindInput.step = moneyMode ? "0.01" : "1";
  }
  renderShotClockChoices();
  renderReadyTimerChoices();
  renderRabbitHuntChoices();
  syncHostMenuSection();
  if (state?.moneyMode) cashInInput.value = (state.buyInCents / 100).toFixed(0);
  syncCashInControls();
  if (menuTimer != null) clearInterval(menuTimer);
  menuTimer = setInterval(renderMenuPlayers, 1000);
  gameMenuModal.classList.remove("hidden");
  closeMenuBtn.focus({ preventScroll: true });
}

function showWelcome(status = "") {
  disposePracticeSession();
  state = null;
  watchOfferPending = false;
  acceptedMoneyTerms = null;
  if (watchingCountEl) {
    watchingCountEl.textContent = "";
    watchingCountEl.classList.add("hidden");
  }
  lastActionEntryId = "";
  lastCommunitySignature = null;
  lastHeroSignature = "";
  lastWinnerSignature = "";
  lastPhase = "";
  lastPot = null;
  leavingEndedRoom = false;
  hideGameMenu();
  document.documentElement.classList.remove("game-open-root");
  document.body.classList.remove("game-open", "keyboard-open");
  tableView.classList.add("hidden");
  scoreView.classList.add("hidden");
  welcome.classList.remove("hidden");
  joinError.textContent = status;
  clearRoomUrl();
  updateTableActionLabel();
}

function showScoreScreen(room: ClientRoom) {
  const standings = room.moneyMode
    ? [...(room.ledger || [])].sort(
        (a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name),
      )
    : [...room.players].sort((a, b) => b.stack - a.stack || a.name.localeCompare(b.name));
  state = null;
  lastActionEntryId = "";
  hideGameMenu();
  document.documentElement.classList.remove("game-open-root");
  document.body.classList.remove("game-open", "keyboard-open");
  welcome.classList.add("hidden");
  tableView.classList.add("hidden");
  scoreView.classList.remove("hidden");
  const scoreHead = scoreView.querySelector(".score-head");
  if (scoreHead) {
    scoreHead.innerHTML = room.moneyMode
      ? `<p class="eyebrow">Room ${escapeHtml(room.id)} · reopen anytime with this code</p><h2>Settle up</h2>`
      : `<p class="eyebrow">Final standings</p><h2>Game over</h2>`;
  }
  scoreList.innerHTML =
    standings
      .map((player, index) => {
        const colorPlayer = player as ClientPlayer;
        const netOrStack = room.moneyMode
          ? formatSignedMoney((player as { netCents: number }).netCents)
          : (player as ClientPlayer).stack;
        return `
    <div class="score-row ${player.isYou ? "you" : ""}" ${playerColorStyle(colorPlayer)}>
      <span class="score-rank">${index + 1}</span>
      <span class="score-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
      <strong>${netOrStack}</strong>
    </div>
  `;
      })
      .join("") +
    (room.moneyMode
      ? `
    <div class="settlement-list">
      <p class="eyebrow">Who owes whom</p>
      ${
        (room.settlements || []).length
          ? room.settlements
              .map(
                (item) => `
        <div class="settlement-row">
          <span>${escapeHtml(item.fromName)} pays ${escapeHtml(item.toName)}</span>
          <strong>${formatMoney(item.amountCents)}</strong>
        </div>
      `,
              )
              .join("")
          : '<div class="settlement-row"><span>No transfers needed</span><strong>$0.00</strong></div>'
      }
    </div>
  `
      : "");
  if (room.moneyMode && room.id) setRoomUrl(room.id);
  else clearRoomUrl();
}

function replayAnimation(element: Element | null | undefined, className: string, duration = 700) {
  if (!element) return;
  element.classList.remove(className);
  requestAnimationFrame(() => {
    element.classList.add(className);
    setTimeout(() => element.classList.remove(className), duration);
  });
}

function setRoomUrl(roomId: string) {
  if (!roomId) return;
  const normalized = String(roomId).toUpperCase();
  localStorage.setItem("holdem:lastRoom", normalized);
  roomInput.value = normalized;
  const url = new URL(window.location.href);
  url.searchParams.set("room", normalized);
  window.history.replaceState({}, "", url);
}

function inviteUrl() {
  if (!state) return "";
  return canonicalInviteUrl(state.id);
}

function canonicalInviteUrl(roomId: string) {
  if (typeof InviteUrl !== "undefined" && InviteUrl.canonicalInviteUrl) {
    return InviteUrl.canonicalInviteUrl(roomId);
  }
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("room", roomId);
  return url.toString();
}

function clearRoomUrl() {
  localStorage.removeItem("holdem:lastRoom");
  roomInput.value = "";
  tableMode = "host";
  updateTableActionLabel();
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url);
}

function findLastIndex<T>(items: T[], predicate: (item: T, index: number) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) return index;
  }
  return -1;
}

function activeHero() {
  if (!state?.players) return null;
  const heroIndex = findLastIndex(state.players, (player) => player.isYou);
  return heroIndex >= 0 ? state.players[heroIndex] : null;
}

function compactPlayerAction(entry: ActionLogEntry, player: ClientPlayer | null | undefined) {
  const raw = entry.action || entry.text || "";
  const withoutName = player
    ? raw.replace(new RegExp(`^${escapeRegExp(player.name)}\\s+`, "i"), "").replace(/\.$/, "")
    : raw.replace(/\.$/, "");
  const amount = (value: string) =>
    formatAmount(Number(value), Math.round(Number(value) * (state?.chipValueCents || 0)));
  return withoutName
    .replace(/^Calls\s+(\d+)/i, (_match: string, value: string) => `call ${amount(value)}`)
    .replace(/^Checks$/i, "check")
    .replace(/^Folds$/i, "fold")
    .replace(/^Raises to\s+(\d+)/i, (_match: string, value: string) => `raise ${amount(value)}`)
    .replace(/^Wins\s+(\d+)/i, (_match: string, value: string) => `+${amount(value)}`);
}

function isBlindPost(entry: ActionLogEntry) {
  return /^Posts (small|big) blind\b/i.test(entry?.action || "");
}

function actionTokenClass(entry: ActionLogEntry, player: ClientPlayer | null | undefined) {
  const compact = compactPlayerAction(entry, player).toLowerCase();
  if (compact.startsWith("raise ")) return " action-token-raise";
  return "";
}

function playerTableStatus(player: ClientPlayer, isActiveTurn = player.isTurn) {
  if (!state) return "";
  if (player.sittingOut)
    return player.cards.length && isBettingPhase(state.phase) ? "Sits out next" : "Sitting out";

  if (playerIsOut(player)) return "Out";
  if (["lobby", "complete"].includes(state?.phase))
    return player.ready || player.isBot ? "Ready" : "Not ready";
  if (player.waitingForNextHand) return "Next hand";
  if (player.folded) return "Folded";
  if (player.allIn) return "All in";
  if (isActiveTurn) return "Acting";
  return player.connected ? "In hand" : "Away";
}

function playerForAction(entry: ActionLogEntry) {
  if (!state) return undefined;
  if (entry.playerId) {
    const byIdIndex = findLastIndex(state.players, (player) => player.id === entry.playerId);
    if (byIdIndex >= 0) return state.players[byIdIndex];
  }
  const byNameIndex = findLastIndex(state.players, (player) =>
    entry.text?.startsWith(`${player.name} `),
  );
  return byNameIndex >= 0 ? state.players[byNameIndex] : null;
}

function renderShownHandCard(player: ClientPlayer) {
  if (!state) return "";
  return `
    <article class="action-feed-card shown-hand-card ${player.isYou ? "you" : ""}" ${playerColorStyle(player)}>
      <div class="action-card-head">
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
      </div>
      <div class="shown-hand">${player.cards.map((card) => cardTemplate(card)).join("")}</div>
      <div class="action-card-stats">
        <span>${state.moneyMode ? "Bankroll" : "Stack"} <strong>${playerStackLabel(player)}</strong></span>
      </div>
    </article>
  `;
}

function currentTurnPlayer() {
  if (!state) return undefined;
  const room = state;
  const index = findLastIndex(room.players, (player) => player.id === room.turn);
  return index >= 0 ? room.players[index] : null;
}

function isBettingPhase(phase: string | null | undefined) {
  return ["preflop", "flop", "turn", "river"].includes(phase || "");
}

function streetActionEntries(actionLog: ActionLogEntry[] | null | undefined, phase: string | null | undefined) {
  // Only the current street's player actions drive last-action pills.
  // Prior-street check/raise/call must not linger after a new street deals.
  return (actionLog || []).filter((entry) => entry.phase === phase);
}

function renderShotClockChoices() {
  if (!shotClockPanel || !shotClockChoices) return;
  const canEdit = Boolean(state?.canChangeShotClock) && !isOfflineSession();
  shotClockPanel.classList.toggle("hidden", !canEdit);
  if (!canEdit) {
    shotClockCustomOpen = false;
    shotClockCustomForm?.classList.add("hidden");
    return;
  }
  if (isMenuShotClockEditing()) return;
  const selected = Math.floor(Number(state?.turnTimeLimitMs) / 1000);
  const isPreset = SHOT_CLOCK_CHOICES.some((item) => item.seconds === selected);
  const customActive = shotClockCustomOpen || (!isPreset && selected > 0);
  if (customActive) shotClockCustomOpen = true;
  shotClockChoices.innerHTML = `${SHOT_CLOCK_CHOICES.map(
    (item) => `
    <button
      type="button"
      class="appearance-choice${!customActive && item.seconds === selected ? " selected" : ""}"
      data-shot-clock="${item.seconds}"
      aria-pressed="${!customActive && item.seconds === selected ? "true" : "false"}"
    >${item.label}</button>
  `,
  ).join("")}
    <button
      type="button"
      class="appearance-choice${customActive ? " selected" : ""}"
      data-shot-clock="${SHOT_CLOCK_CUSTOM}"
      aria-pressed="${customActive ? "true" : "false"}"
    >Custom</button>`;
  if (shotClockCustomForm && shotClockCustomInput) {
    shotClockCustomForm.classList.toggle("hidden", !customActive);
    if (customActive && document.activeElement !== shotClockCustomInput) {
      const value = selected > 0 ? selected : 45;
      shotClockCustomInput.value = String(Math.min(600, Math.max(10, value)));
    }
  }
}

function commitShotClockCustom(form: HTMLElement | null) {
  if (!form || !shotClockCustomInput) return false;
  const raw = shotClockCustomInput.value.trim();
  const seconds = Number(raw);
  if (
    !raw ||
    !Number.isFinite(seconds) ||
    !Number.isInteger(seconds) ||
    seconds < 10 ||
    seconds > 600
  ) {
    showToast("Enter an integer from 10 to 600 seconds.");
    return false;
  }

  // pointerdown (Save) and submit (Enter / click) share this path; dedupe one gesture.
  const now = Date.now();
  if (
    form.dataset.shotClockSaving === "1" &&
    now - Number(form.dataset.shotClockSavedAt || 0) < 750
  ) {
    return true;
  }
  form.dataset.shotClockSaving = "1";
  form.dataset.shotClockSavedAt = String(now);

  shotClockCustomOpen = true;
  emitWithAck("game:setShotClock", { seconds });
  shotClockCustomInput.blur();
  queueMicrotask(() => {
    delete form.dataset.shotClockSaving;
  });
  return true;
}

/** Host setting: "Show rest of board" after a fold-win (default on). */
function renderRabbitHuntChoices() {
  if (!rabbitHuntPanel || !rabbitHuntChoices) return;
  const canEdit = Boolean(state?.canChangeRabbitHunt) && !isSpectatorView();
  rabbitHuntPanel.classList.toggle("hidden", !canEdit);
  if (!canEdit) return;
  const enabled = state?.rabbitHuntEnabled !== false;
  rabbitHuntChoices.innerHTML = [
    { value: "on", label: "On", selected: enabled },
    { value: "off", label: "Off", selected: !enabled },
  ]
    .map(
      (item) => `
    <button
      type="button"
      class="appearance-choice${item.selected ? " selected" : ""}"
      data-rabbit-hunt="${item.value}"
      aria-pressed="${item.selected ? "true" : "false"}"
    >${item.label}</button>`,
    )
    .join("");
}

function renderReadyTimerChoices() {
  if (!readyTimerPanel || !readyTimerChoices) return;
  const canEdit = Boolean(state?.canChangeReadyTimer) && !isOfflineSession();
  readyTimerPanel.classList.toggle("hidden", !canEdit);
  if (!canEdit) {
    readyTimerCustomOpen = false;
    readyTimerCustomForm?.classList.add("hidden");
    return;
  }
  if (isMenuReadyTimerEditing()) return;
  const selected = Math.floor(Number(state?.readyTimeLimitMs) / 1000);
  const isPreset = READY_TIMER_CHOICES.some((item) => item.seconds === selected);
  const customActive = readyTimerCustomOpen || (!isPreset && selected > 0);
  if (customActive) readyTimerCustomOpen = true;
  readyTimerChoices.innerHTML = `${READY_TIMER_CHOICES.map(
    (item) => `
    <button
      type="button"
      class="appearance-choice${!customActive && item.seconds === selected ? " selected" : ""}"
      data-ready-timer="${item.seconds}"
      aria-pressed="${!customActive && item.seconds === selected ? "true" : "false"}"
    >${item.label}</button>
  `,
  ).join("")}
    <button
      type="button"
      class="appearance-choice${customActive ? " selected" : ""}"
      data-ready-timer="${READY_TIMER_CUSTOM}"
      aria-pressed="${customActive ? "true" : "false"}"
    >Custom</button>`;
  if (readyTimerCustomForm && readyTimerCustomInput) {
    readyTimerCustomForm.classList.toggle("hidden", !customActive);
    if (customActive && document.activeElement !== readyTimerCustomInput) {
      const value = selected > 0 ? selected : 20;
      readyTimerCustomInput.value = String(Math.min(300, Math.max(5, value)));
    }
  }
}

function commitReadyTimerCustom(form: HTMLElement | null) {
  if (!form || !readyTimerCustomInput) return false;
  const raw = readyTimerCustomInput.value.trim();
  const seconds = Number(raw);
  if (
    !raw ||
    !Number.isFinite(seconds) ||
    !Number.isInteger(seconds) ||
    seconds < 5 ||
    seconds > 300
  ) {
    showToast("Enter an integer from 5 to 300 seconds.");
    return false;
  }

  // pointerdown (Save) and submit (Enter / click) share this path; dedupe one gesture.
  const now = Date.now();
  if (
    form.dataset.readyTimerSaving === "1" &&
    now - Number(form.dataset.readyTimerSavedAt || 0) < 750
  ) {
    return true;
  }
  form.dataset.readyTimerSaving = "1";
  form.dataset.readyTimerSavedAt = String(now);

  readyTimerCustomOpen = true;
  emitWithAck("game:setReadyTimer", { seconds });
  readyTimerCustomInput.blur();
  queueMicrotask(() => {
    delete form.dataset.readyTimerSaving;
  });
  return true;
}

function turnSecondsRemaining() {
  if (!state?.turnEndsAt || !state?.turnTimeLimitMs || !isBettingPhase(state.phase) || !state.turn)
    return 0;
  return Math.max(0, Math.ceil((state.turnEndsAt - clientNow()) / 1000));
}

function turnPctRemaining() {
  const limit = Number(state?.turnTimeLimitMs) || 0;
  if (!limit || !state?.turnEndsAt) return 0;
  return Math.max(0, Math.min(1, (state.turnEndsAt - clientNow()) / limit));
}

function actingSeatShowsClock(player: ClientPlayer) {
  return Boolean(
    player &&
    !player.isBot &&
    state?.turnEndsAt &&
    state?.turnTimeLimitMs &&
    isBettingPhase(state.phase) &&
    player.id === state.turn,
  );
}

function lowTimeWarningActive() {
  if (!state?.turnEndsAt || !state?.turnTimeLimitMs || !isBettingPhase(state.phase) || !state.turn)
    return false;
  if (typeof TurnClockWarning === "undefined" || !TurnClockWarning.isLowTime) {
    const rem = state.turnEndsAt - clientNow();
    return rem > 0 && rem <= 5000;
  }
  return TurnClockWarning.isLowTime(state.turnEndsAt, clientNow());
}

function canHearShotClockCues() {
  return Boolean(state?.isYourTurn) && !isSpectatorView() && !document.hidden;
}

function playTimerTimeoutIfEligible(eligibleForEndsAt: number | null, endsAt: number | null | undefined) {
  if (endsAt == null || eligibleForEndsAt !== endsAt || document.hidden || isSpectatorView())
    return;
  tableSounds.timerTimeout();
}

function syncLowTimeWarningEffects(now = clientNow()) {
  if (
    !state?.turnEndsAt ||
    !state?.turnTimeLimitMs ||
    !isBettingPhase(state.phase) ||
    !state.turn
  ) {
    const previousEnds = lowTimeSession.turnEndsAt;
    const timedOut =
      typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeDeadlineTimeout
        ? TurnClockWarning.consumeDeadlineTimeout(lowTimeSession, { turnEndsAt: null, now })
        : false;
    if (timedOut) playTimerTimeoutIfEligible(shotClockCueEligibleForEndsAt, previousEnds);
    if (typeof TurnClockWarning !== "undefined" && TurnClockWarning.resetLowTimeSession) {
      TurnClockWarning.resetLowTimeSession(lowTimeSession);
    } else {
      lowTimeSession.turnEndsAt = null;
      lowTimeSession.lastSeenTickSecond = null;
      lowTimeSession.armed = false;
      lowTimeSession.sawActive = false;
      lowTimeSession.timeoutConsumed = false;
    }
    lowTimeVibratedForEndsAt = null;
    shotClockCueEligibleForEndsAt = null;
    return;
  }

  const endsAt = state.turnEndsAt;
  if (canHearShotClockCues() && now < endsAt) {
    shotClockCueEligibleForEndsAt = endsAt;
  }

  const timedOut =
    typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeDeadlineTimeout
      ? TurnClockWarning.consumeDeadlineTimeout(lowTimeSession, { turnEndsAt: endsAt, now })
      : false;
  if (timedOut) playTimerTimeoutIfEligible(shotClockCueEligibleForEndsAt, endsAt);

  const tickSecond =
    typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeLowTimeTick
      ? TurnClockWarning.consumeLowTimeTick(lowTimeSession, { turnEndsAt: endsAt, now })
      : null;

  // Sound + vibrate only on the acting player's own device (never spectators).
  if (tickSecond != null && canHearShotClockCues()) {
    tableSounds.shotClockTick(tickSecond);
    if (tickSecond === 5 && lowTimeVibratedForEndsAt !== endsAt) {
      lowTimeVibratedForEndsAt = endsAt;
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(40);
        }
      } catch (_) {
        // Vibration is optional; never throw.
      }
    }
  }
}

function syncTurnCountdown() {
  if (!state) return;
  if (turnCountdownTimer != null) clearInterval(turnCountdownTimer);
  turnCountdownTimer = null;
  if (
    !state?.turnEndsAt ||
    !state?.turnTimeLimitMs ||
    !isBettingPhase(state.phase) ||
    !state.turn
  ) {
    syncLowTimeWarningEffects();
    return;
  }
  const tick = () => {
    const seconds = turnSecondsRemaining();
    const labelText = formatTurnCountdown(seconds);
    const pct = turnPctRemaining();
    const lowTime = lowTimeWarningActive();
    document.querySelectorAll("[data-turn-seat-clock]").forEach((row) => {
      (row as HTMLElement).style.setProperty("--turn-pct", String(pct));
      row.classList.toggle("low-time", lowTime);
      const label = row.querySelector("[data-turn-countdown]");
      if (label) {
        label.textContent = labelText;
        label.setAttribute("aria-label", `${labelText} left`);
      }
    });
    syncLowTimeWarningEffects();
    if (seconds <= 0 && turnCountdownTimer != null) clearInterval(turnCountdownTimer);
  };
  tick();
  turnCountdownTimer = setInterval(tick, 200);
}

/** Small personality pill on CPU seats ("Loose", "Grinder"…); full style in the tooltip. */
function botStyleTagMarkup(player: ClientPlayer) {
  if (!player.isBot || !player.botStyleShort) return "";
  const tag = escapeHtml(player.botProfile || "");
  const style = escapeHtml(player.botStyle || player.botStyleShort);
  return `<span class="bot-style-tag" data-bot-style="${tag}" title="${style}" aria-label="${style} CPU">${escapeHtml(player.botStyleShort)}</span>`;
}

function blindChipMarkup(player: ClientPlayer) {
  if (player.isBigBlind)
    return '<span class="blind-chip big" title="Big blind" aria-label="Big blind">BB</span>';
  if (player.isSmallBlind)
    return '<span class="blind-chip small" title="Small blind" aria-label="Small blind">SB</span>';
  return "";
}

function readyTimerActive() {
  if (typeof ReadyClock !== "undefined" && ReadyClock.readyPhaseActive) {
    return Boolean(state?.readyEndsAt && ReadyClock.readyPhaseActive(state.phase));
  }
  return Boolean(state?.readyEndsAt && ["lobby", "complete"].includes(state.phase));
}

function readySecondsRemaining() {
  if (!state?.readyEndsAt) return 0;
  if (!readyTimerActive()) return 0;
  if (typeof ReadyClock !== "undefined" && ReadyClock.readySecondsRemaining) {
    return ReadyClock.readySecondsRemaining(state.readyEndsAt, clientNow());
  }
  return Math.max(0, Math.ceil((state.readyEndsAt - clientNow()) / 1000));
}

function readyPctRemaining() {
  if (!state?.readyEndsAt) return 0;
  if (!readyTimerActive()) return 0;
  const limit = Number(state?.readyTimeLimitMs) || 20000;
  if (typeof ReadyClock !== "undefined" && ReadyClock.readyPctRemaining) {
    return ReadyClock.readyPctRemaining(state.readyEndsAt, limit, clientNow());
  }
  return Math.max(0, Math.min(1, (state.readyEndsAt - clientNow()) / limit));
}

function seatShowsReadyClock(player: ClientPlayer) {
  if (!state) return false;
  if (typeof ReadyClock !== "undefined" && ReadyClock.seatShowsReadyClock) {
    return ReadyClock.seatShowsReadyClock(player, {
      readyEndsAt: state?.readyEndsAt,
      phase: state?.phase,
    });
  }
  return Boolean(
    readyTimerActive() &&
    player &&
    !player.isBot &&
    !player.sittingOut &&
    !player.ready &&
    player.stack > 0,
  );
}

function readyLowTimeWarningActive() {
  if (!state?.readyEndsAt) return false;
  if (!readyTimerActive()) return false;
  if (typeof TurnClockWarning === "undefined" || !TurnClockWarning.isLowTime) {
    const rem = state.readyEndsAt - clientNow();
    return rem > 0 && rem <= 5000;
  }
  return TurnClockWarning.isLowTime(state.readyEndsAt, clientNow());
}

function canHearReadyClockCues() {
  return Boolean(state?.canReady && !state?.isReady) && !isSpectatorView() && !document.hidden;
}

function syncReadyLowTimeWarningEffects(now = clientNow()) {
  if (!readyTimerActive()) {
    const previousEnds = readyLowTimeSession.turnEndsAt;
    const timedOut =
      typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeDeadlineTimeout
        ? TurnClockWarning.consumeDeadlineTimeout(readyLowTimeSession, { turnEndsAt: null, now })
        : false;
    if (timedOut) playTimerTimeoutIfEligible(readyCueEligibleForEndsAt, previousEnds);
    if (typeof TurnClockWarning !== "undefined" && TurnClockWarning.resetLowTimeSession) {
      TurnClockWarning.resetLowTimeSession(readyLowTimeSession);
    } else {
      readyLowTimeSession.turnEndsAt = null;
      readyLowTimeSession.lastSeenTickSecond = null;
      readyLowTimeSession.armed = false;
      readyLowTimeSession.sawActive = false;
      readyLowTimeSession.timeoutConsumed = false;
    }
    readyCueEligibleForEndsAt = null;
    return;
  }

  const endsAt = state?.readyEndsAt ?? null;
  if (endsAt != null && canHearReadyClockCues() && now < endsAt) {
    readyCueEligibleForEndsAt = endsAt;
  }

  const timedOut =
    typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeDeadlineTimeout
      ? TurnClockWarning.consumeDeadlineTimeout(readyLowTimeSession, { turnEndsAt: endsAt, now })
      : false;
  if (timedOut) playTimerTimeoutIfEligible(readyCueEligibleForEndsAt, endsAt);

  const tickSecond =
    typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeLowTimeTick
      ? TurnClockWarning.consumeLowTimeTick(readyLowTimeSession, { turnEndsAt: endsAt, now })
      : null;

  // Tick only for the local player who still needs to ready (never spectators).
  if (tickSecond != null && canHearReadyClockCues()) {
    tableSounds.shotClockTick(tickSecond);
  }
}

function syncReadyCountdown() {
  if (!state) return;
  if (readyCountdownTimer != null) clearInterval(readyCountdownTimer);
  readyCountdownTimer = null;
  if (!readyTimerActive()) {
    syncReadyLowTimeWarningEffects();
    return;
  }
  const tick = () => {
    const seconds = readySecondsRemaining();
    const labelText = formatTurnCountdown(seconds);
    const pct = readyPctRemaining();
    const lowTime = readyLowTimeWarningActive();
    document.querySelectorAll("[data-ready-seat-clock]").forEach((row) => {
      (row as HTMLElement).style.setProperty("--turn-pct", String(pct));
      row.classList.toggle("low-time", lowTime);
      const label = row.querySelector("[data-ready-countdown]");
      if (label) {
        label.textContent = labelText;
        label.setAttribute("aria-label", `${labelText} left to ready up`);
        label.classList.toggle("low-time", lowTime);
      }
    });
    document.querySelectorAll("[data-ready-countdown]").forEach((node) => {
      if (node.closest("[data-ready-seat-clock]")) return;
      node.textContent = labelText;
      node.setAttribute("aria-label", `${labelText} left to ready up`);
      node.classList.toggle("low-time", lowTime);
    });
    syncReadyLowTimeWarningEffects();
    if (seconds <= 0 && readyCountdownTimer != null) clearInterval(readyCountdownTimer);
  };
  tick();
  readyCountdownTimer = setInterval(tick, 200);
}

function renderActionFeed(newEntryId = "") {
  if (!state) return "";
  const room = state;
  const entries = streetActionEntries(room.actionLog, room.phase);
  const activePlayer = currentTurnPlayer();
  const latestByPlayer = new Map<string, ActionLogEntry>();
  entries.forEach((entry) => {
    // Blind posts aren't actions; the SB/BB chips mark those seats for the whole hand.
    if (isBlindPost(entry)) return;
    const player = playerForAction(entry);
    if (player) latestByPlayer.set(player.id, entry);
  });
  const tableMarkup = seatedPlayers()
    .map((player) => {
      const entry = latestByPlayer.get(player.id);
      const isActing = player.id === activePlayer?.id;
      const betweenHands = ["lobby", "complete"].includes(room.phase);
      const isAllIn = Boolean(player.allIn);
      const isOutOfAction = player.folded || isAllIn;
      const showStreetAction = !betweenHands && entry && !isOutOfAction;
      const action = showStreetAction
        ? compactPlayerAction(entry, player)
        : playerTableStatus(player, isActing);
      const showTurnClock = isActing && actingSeatShowsClock(player);
      const showReadyClock = !showTurnClock && seatShowsReadyClock(player);
      const showClock = showTurnClock || showReadyClock;
      const seconds = showTurnClock
        ? turnSecondsRemaining()
        : showReadyClock
          ? readySecondsRemaining()
          : 0;
      const pct = showTurnClock ? turnPctRemaining() : showReadyClock ? readyPctRemaining() : 0;
      const styleVars = [
        player?.color ? `--player-color: ${escapeHtml(player.color)}` : "",
        showClock ? `--turn-pct: ${pct}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      const styleAttr = styleVars ? ` style="${styleVars}"` : "";
      const countdownLabel = formatTurnCountdown(seconds);
      const lowTime = showTurnClock
        ? lowTimeWarningActive()
        : showReadyClock && readyLowTimeWarningActive();
      const countdownAttr = showTurnClock
        ? "data-turn-countdown"
        : showReadyClock
          ? "data-ready-countdown"
          : "";
      const clockAria = showReadyClock
        ? `${countdownLabel} left to ready up`
        : `${countdownLabel} left`;
      // Ready-up shows only the shrinking bar (no number); the shot clock keeps its number.
      const clockMarkup = showTurnClock
        ? `<span class="turn-clock${lowTime ? " low-time" : ""}" ${countdownAttr} aria-label="${clockAria}">${countdownLabel}</span>`
        : "";
      const barMarkup = showClock
        ? `<span class="turn-clock-bar" aria-hidden="true"><i></i></span>`
        : "";
      const seatClockAttr = showTurnClock
        ? ' data-turn-seat-clock="1"'
        : showReadyClock
          ? ' data-ready-seat-clock="1"'
          : "";
      return `
      <article class="table-player-row ${isActing ? "turn" : ""} ${showClock ? "shot-clock" : ""} ${lowTime ? "low-time" : ""} ${player.folded ? "folded" : ""} ${isAllIn ? "all-in" : ""} ${player.isYou ? "you" : ""} ${entry?.id === newEntryId ? "new-action" : ""}"${seatClockAttr}${styleAttr}>
        <span class="seat-timer" aria-hidden="true"><i class="player-dot"></i></span>
        <span class="seat-name seat-name-with-chips"><span class="seat-name-text">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>${botStyleTagMarkup(player)}${blindChipMarkup(player)}</span>
        <span class="player-action${showStreetAction ? actionTokenClass(entry, player) : ""}">${escapeHtml(action)}${clockMarkup}</span>
        <strong class="player-stack">${playerStackLabel(player)}</strong>
        ${barMarkup}
      </article>
    `;
    })
    .join("");
  // Revealed hands: showdown winners/mucks, voluntary shows, and all-in runout face-ups.
  const shownHands = room.players
    .filter(
      (player) =>
        player.showCards && player.cards?.some((card) => card && (card.code || card.rank)),
    )
    .map(renderShownHandCard)
    .join("");
  return `${tableMarkup}${shownHands}`;
}

function isEndedGameReturn(previous: ClientRoom | null | undefined, next: ClientRoom | null | undefined) {
  return Boolean(
    previous &&
      previous.phase !== "lobby" &&
      next &&
      next.phase === "lobby" &&
      next.message === "Game ended by host.",
  );
}

function isGameOver(room: ClientRoom | null | undefined) {
  return room?.phase === "gameover";
}

function playActionSound(entry: ActionLogEntry | null | undefined) {
  if (!entry || document.hidden) return;
  const action = String(entry.action || entry.text || "").toLowerCase();
  if (action.includes("raise") || action.includes("bet")) {
    tableSounds.chips("raise");
  } else if (action.includes("call") || action.includes("blind") || action.includes("wins")) {
    tableSounds.chips();
  } else if (action.includes("fold")) {
    tableSounds.paper();
  } else if (action.includes("check")) {
    tableSounds.click();
  }
}
