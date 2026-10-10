var socket = typeof io === "function"
  ? io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  })
  : null;

var welcome = document.querySelector("#welcome");
var themeColor = document.querySelector("#themeColor");
var tableView = document.querySelector("#tableView");
var scoreView = document.querySelector("#scoreView");
var joinForm = document.querySelector("#joinForm");
var nameInput = document.querySelector("#nameInput");
var roomInput = document.querySelector("#roomInput");
var roomCodeLabel = document.querySelector("#roomCodeLabel");
var hostModeBtn = document.querySelector("#hostModeBtn");
var joinModeBtn = document.querySelector("#joinModeBtn");
var moneyModeLabel = document.querySelector("#moneyModeLabel");
var blindFields = document.querySelector("#blindFields");
var smallBlindInput = document.querySelector("#smallBlindInput");
var bigBlindInput = document.querySelector("#bigBlindInput");
var smallBlindLabel = document.querySelector("#smallBlindLabel");
var bigBlindLabel = document.querySelector("#bigBlindLabel");
var moneyModeInput = document.querySelector("#moneyModeInput");
var buyInLabel = document.querySelector("#buyInLabel");
var buyInInput = document.querySelector("#buyInInput");
var tableActionBtn = document.querySelector("#tableActionBtn");
var watchBtn = document.querySelector("#watchBtn");
var joinError = document.querySelector("#joinError");
var roomCode = document.querySelector("#roomCode");
var roomCodeBtn = document.querySelector("#roomCodeBtn");
var watchingCountEl = document.querySelector("#watchingCount");
var menuBtn = document.querySelector("#menuBtn");
var gameMenuModal = document.querySelector("#gameMenuModal");
var closeMenuBtn = document.querySelector("#closeMenuBtn");
var addBotBtn = document.querySelector("#addBotBtn");
var restartGameBtn = document.querySelector("#restartGameBtn");
var endGameBtn = document.querySelector("#endGameBtn");
var shareGameBtn = document.querySelector("#shareGameBtn");
var backToMenuBtn = document.querySelector("#backToMenuBtn");
var sitOutBtn = document.querySelector("#sitOutBtn");
var hostActionsPanel = document.querySelector("#hostActionsPanel");
var menuRoomCode = document.querySelector("#menuRoomCode");
var menuRoomEyebrow = document.querySelector("#menuRoomEyebrow");
var menuPlayers = document.querySelector("#menuPlayers");
var feltChoices = document.querySelector("#feltChoices");
var deckChoices = document.querySelector("#deckChoices");
var soundEnabledInput = document.querySelector("#soundEnabledInput");
var keybindList = document.querySelector("#keybindList");
var resetKeybindsBtn = document.querySelector("#resetKeybindsBtn");
var sharePanel = document.querySelector("#sharePanel");
var shareQr = document.querySelector("#shareQr");
var shareLink = document.querySelector("#shareLink");
var copyShareBtn = document.querySelector("#copyShareBtn");
var moneyPanel = document.querySelector("#moneyPanel");
var moneyDetails = document.querySelector("#moneyDetails");
var blindPanel = document.querySelector("#blindPanel");
var blindForm = document.querySelector("#blindForm");
var menuSmallBlindLabel = document.querySelector("#menuSmallBlindLabel");
var menuBigBlindLabel = document.querySelector("#menuBigBlindLabel");
var menuSmallBlindInput = document.querySelector("#menuSmallBlindInput");
var menuBigBlindInput = document.querySelector("#menuBigBlindInput");
var shotClockPanel = document.querySelector("#shotClockPanel");
var shotClockChoices = document.querySelector("#shotClockChoices");
var shotClockCustomForm = document.querySelector("#shotClockCustomForm");
var shotClockCustomInput = document.querySelector("#shotClockCustomInput");
var readyTimerPanel = document.querySelector("#readyTimerPanel");
var readyTimerChoices = document.querySelector("#readyTimerChoices");
var readyTimerCustomForm = document.querySelector("#readyTimerCustomForm");
var readyTimerCustomInput = document.querySelector("#readyTimerCustomInput");
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
var cashInInput = document.querySelector("#cashInInput");
var cashInBtn = document.querySelector("#cashInBtn");
var cashOutBtn = document.querySelector("#cashOutBtn");
var moneyNote = document.querySelector(".money-note");
var potValue = document.querySelector("#potValue");
var community = document.querySelector("#community");
var players = document.querySelector("#players");
var heroHand = document.querySelector("#heroHand");
var winnerList = document.querySelector("#winnerList");
var turnInfo = document.querySelector("#turnInfo");
var gameButtons = document.querySelector("#gameButtons");
var betControls = document.querySelector("#betControls");
var raiseMinus = document.querySelector("#raiseMinus");
var raisePlus = document.querySelector("#raisePlus");
var raiseLabel = document.querySelector("#raiseLabel");
var raiseAmount = document.querySelector("#raiseAmount");
var raiseActionBtn = document.querySelector("#raiseActionBtn");
var betPresets = document.querySelector("#betPresets");
var scoreList = document.querySelector("#scoreList");
var scoreMenuBtn = document.querySelector("#scoreMenuBtn");
var toast = document.querySelector("#toast");
var reconnectBanner = document.querySelector("#reconnectBanner");
var Deploy = typeof DeployHandoff !== "undefined" ? DeployHandoff : null;
/** Server build id observed on this page load; used for post-deploy reload gating. */
var knownBuildId = null;
/** Newer build id seen mid-hand; reload once between hands. */
var pendingServerBuildId = null;
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

function normalizedKey(key) {
  return HoldemKeybinds.normalizedKey(key);
}

function loadKeybinds() {
  return HoldemKeybinds.loadKeybinds();
}

function keybindLabel(key) {
  return HoldemKeybinds.keybindLabel(key);
}

function activeKeybindAliases(action) {
  return HoldemKeybinds.activeKeybindAliases(keybinds, action);
}

function keysForAction(action) {
  return HoldemKeybinds.keysForAction(keybinds, action);
}

function keybindDisplay(action) {
  return HoldemKeybinds.keybindDisplay(keybinds, action);
}

function saveKeybinds() {
  HoldemKeybinds.saveKeybinds(keybinds);
}

function renderKeybinds() {
  keybindList.innerHTML = KEYBIND_DEFINITIONS.map(({ id, label }) => `
    <div class="keybind-row">
      <span>${label}</span>
      <button type="button" class="keybind-button ${recordingKeybindAction === id ? "recording" : ""}" data-keybind-action="${id}" aria-label="Set key for ${label}">
        ${recordingKeybindAction === id ? "Press a key…" : escapeHtml(keybindDisplay(id))}
      </button>
    </div>
  `).join("");
}

function beginKeybindRecording(action) {
  if (!DEFAULT_KEYBINDS[action]) return;
  recordingKeybindAction = action;
  renderKeybinds();
  keybindList.querySelector(`[data-keybind-action="${action}"]`)?.focus();
}

function cancelKeybindRecording() {
  if (!recordingKeybindAction) return;
  recordingKeybindAction = "";
  renderKeybinds();
}

function assignKeybind(action, key) {
  const result = HoldemKeybinds.assignKeybindState(keybinds, action, key);
  keybinds = result.keybinds;
  recordingKeybindAction = "";
  saveKeybinds();
  renderKeybinds();
  renderControls(activeHero());
  showToast(result.conflictAction ? "Shortcuts swapped" : "Shortcut updated");
}

function matchesKeybind(event, action) {
  return HoldemKeybinds.matchesKeybind(event, keybinds, action);
}

renderKeybinds();

var state = null;
var practiceSession = null;
var turnCountdownTimer = null;
var readyCountdownTimer = null;
var lowTimeSession = (typeof TurnClockWarning !== "undefined" && TurnClockWarning.createLowTimeSession)
  ? TurnClockWarning.createLowTimeSession()
  : { turnEndsAt: null, lastSeenTickSecond: null, armed: false, sawActive: false, timeoutConsumed: false };
var readyLowTimeSession = (typeof TurnClockWarning !== "undefined" && TurnClockWarning.createLowTimeSession)
  ? TurnClockWarning.createLowTimeSession()
  : { turnEndsAt: null, lastSeenTickSecond: null, armed: false, sawActive: false, timeoutConsumed: false };
var lowTimeVibratedForEndsAt = null;
/** Absolute deadlines for which this client was eligible to hear timer cues (survives server clear). */
var shotClockCueEligibleForEndsAt = null;
var readyCueEligibleForEndsAt = null;
var raiseState = { value: 0, min: 0, max: 0, step: 20 };
var raiseControlsDisabled = false;
/**
 * Merged confirm: one button for Check ↔ Bet {amount} (toCall === 0) or
 * Call {amount} ↔ Raise {amount} (toCall > 0), driven by the raise detent.
 */
var mergePassiveConfirm = false;
var confirmActionBtn = null;
var leavingEndedRoom = false;
var menuTimer = null;
var lastAutoRejoinKey = "";
var lastActionEntryId = "";
var lastCommunitySignature = null;
var lastHeroSignature = "";
var heroCardsHidden = false;
var lastWinnerSignature = "";
var lastPhase = "";
var lastPot = null;
var params = new URLSearchParams(window.location.search);
var initialRoomParam = (params.get("room") || "").toUpperCase();
var initialRoomId = (initialRoomParam || localStorage.getItem("holdem:lastRoom") || "").toUpperCase();
if (initialRoomId) roomInput.value = initialRoomId;
nameInput.value = localStorage.getItem("holdem:name") || "";
var joinPending = false;
var watchOfferPending = false;
var acceptedMoneyTerms = null;
var joinPreview = document.querySelector("#joinPreview");
var didAutoJoinInitialRoom = false;
var tableMode = initialRoomId ? "join" : "host";
var toastTimer = null;
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

function applyTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  themeColor?.setAttribute("content", nextTheme === "dark" ? "#090d10" : "#eef1ec");
}

var deviceTheme = window.matchMedia("(prefers-color-scheme: light)");
applyTheme(deviceTheme.matches ? "light" : "dark");

function applyTableAppearance(felt, deck, persist = false) {
  const nextFelt = FELT_OPTIONS.some((option) => option.id === felt) ? felt : "emerald";
  const nextDeck = DECK_OPTIONS.some((option) => option.id === deck) ? deck : "classic";
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
  feltChoices.innerHTML = FELT_OPTIONS.map((option) => `
    <button type="button" class="appearance-choice felt-choice ${document.documentElement.dataset.felt === option.id ? "selected" : ""}" data-felt="${option.id}" aria-label="${option.label} felt" aria-pressed="${document.documentElement.dataset.felt === option.id}">
      <i style="--choice-color:${option.color}" aria-hidden="true"></i><span>${option.label}</span>
    </button>
  `).join("");
  deckChoices.innerHTML = DECK_OPTIONS.map((option) => `
    <button type="button" class="appearance-choice deck-choice ${document.documentElement.dataset.deck === option.id ? "selected" : ""}" data-deck="${option.id}" aria-label="${option.label}: ${option.description}" aria-pressed="${document.documentElement.dataset.deck === option.id}">
      <span class="deck-preview" aria-hidden="true">
        <i class="deck-preview-back"></i>
        <i class="deck-preview-front ${["♥", "♦"].includes(option.suit) ? "red" : ""}"><b>${option.rank}</b><em>${option.suit}</em></i>
      </span>
      <span class="deck-choice-copy"><strong>${option.label}</strong><small>${option.description}</small></span>
    </button>
  `).join("");
}

applyTableAppearance(localStorage.getItem("holdem:felt"), localStorage.getItem("holdem:deck"));

function getDeviceId() {
  let deviceId = localStorage.getItem("holdem:deviceId");
  if (!deviceId) {
    deviceId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("holdem:deviceId", deviceId);
  }
  return deviceId;
}

function roomCredentials(roomId) {
  try {
    return JSON.parse(localStorage.getItem(`holdem:credentials:${String(roomId || "").toUpperCase()}`) || "null");
  } catch {
    return null;
  }
}

function saveRoomCredentials(roomId, response) {
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

function setKeyboardMode(isOpen) {
  document.body.classList.toggle("keyboard-open", isOpen && !welcome.classList.contains("hidden"));
  setViewportHeight();
}

var previousGameTouchY = null;

function lockMobileGameOverscroll(event) {
  if (!document.body.classList.contains("game-open") || !matchMedia("(max-width: 779px)").matches) return;

  const touchY = event.touches[0]?.clientY;
  const scrollRegion = event.target.closest?.(".players, .modal-panel");
  const movingDown = previousGameTouchY !== null && touchY > previousGameTouchY;
  const movingUp = previousGameTouchY !== null && touchY < previousGameTouchY;
  previousGameTouchY = touchY;

  const canScrollDown = movingUp && scrollRegion?.scrollTop < scrollRegion?.scrollHeight - scrollRegion?.clientHeight;
  const canScrollUp = movingDown && scrollRegion?.scrollTop > 0;
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
  if (typeof PracticeSession?.canHandoffToOffline !== "function"
    || typeof PracticeSession?.createPracticeSessionFromSnapshot !== "function") {
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

function applyRoomUpdate(room) {
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

  const newTurn = room.isYourTurn && (!state?.isYourTurn || state.id !== room.id
    || state.handNumber !== room.handNumber || state.phase !== room.phase);
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
      ? (acceptedMoneyTerms ? "Join table · Play next hand" : "Join table")
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
      smallBlindInput.value = String(Math.max(1, Math.round(Number(smallBlindInput.value || 0.1) * 100)));
      bigBlindInput.value = String(Math.max(2, Math.round(Number(bigBlindInput.value || 0.2) * 100)));
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

function setTableMode(mode, focusRoom = false) {
  acceptedMoneyTerms = null;
  watchOfferPending = false;
  tableMode = mode;
  joinError.textContent = "";
  updateTableActionLabel();
  if (focusRoom && mode === "join") roomInput.focus();
}

function isSpectatorView(room = state) {
  return Boolean(room?.isSpectator);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 1800);
}

function setReconnectBanner(visible, message = "Updating…, reconnecting") {
  reconnectBannerVisible = Boolean(visible);
  if (!reconnectBanner) return;
  reconnectBanner.textContent = message;
  reconnectBanner.classList.toggle("hidden", !reconnectBannerVisible);
}

function noteServerBuildId(buildId, phase = state?.phase) {
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

function maybeReloadForPendingBuild(phase = state?.phase) {
  if (!pendingServerBuildId || !knownBuildId) return;
  if (!Deploy?.shouldReloadForNewBuild?.({
    clientBuildId: knownBuildId,
    serverBuildId: pendingServerBuildId,
    phase,
  })) return;
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


function showTable(room) {
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

function hideGameMenu() {
  cancelKeybindRecording();
  gameMenuModal.classList.add("hidden");
  sharePanel.classList.add("hidden");
  clearInterval(menuTimer);
  menuTimer = null;
  if (!tableView.classList.contains("hidden")) menuBtn.focus({ preventScroll: true });
}

function playerIsOut(player) {
  const betweenHands = ["lobby", "complete", "gameover"].includes(state?.phase);
  return player.stack <= 0 && (betweenHands || player.invested <= 0);
}

// Cashed-out / busted seats stay in state.players for ledger, but should not appear
// on the table or menu. Folded / sitting-out / waiting-for-next-hand keep their seat.
function seatedPlayers(players = state?.players) {
  return (players || []).filter((player) => !playerIsOut(player));
}

function roundStatus(player) {
  if (player.sittingOut) return player.cards.length && isBettingPhase(state.phase) ? "Sits out next" : "Sitting out";

  if (!player.connected && player.disconnectExpiresAt) {
    const seconds = Math.max(0, Math.ceil((new Date(player.disconnectExpiresAt).getTime() - Date.now()) / 1000));
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

function syncServerTimeOffset(nextState) {
  const serverNow = Number(nextState?.serverNow);
  if (Number.isFinite(serverNow)) serverTimeOffsetMs = serverNow - Date.now();
}

function clientNow() {
  return Date.now() + serverTimeOffsetMs;
}

function formatTurnCountdown(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total >= 60) {
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }
  return String(total);
}

function commitMenuDisplayName(nameForm) {
  if (!nameForm) return false;
  const input = nameForm.querySelector("[data-player-name]");
  if (!input) return false;
  const name = input.value.trim();
  if (!name) {
    showToast("Enter a display name.");
    return false;
  }

  // pointerdown (Save) and submit (Enter / click) share this path; dedupe one gesture.
  const now = Date.now();
  if (nameForm.dataset.nameSaving === "1" && now - Number(nameForm.dataset.nameSavedAt || 0) < 750) {
    return true;
  }
  nameForm.dataset.nameSaving = "1";
  nameForm.dataset.nameSavedAt = String(now);

  nameInput.value = name;
  localStorage.setItem("holdem:name", name);

  const finish = (ok, errorMessage) => {
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
  socket.timeout(4000).emit("player:setName", { name }, (error, response) => {
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
  if (isMenuNameEditing()) return;
  menuRoomCode.textContent = isOfflineSession() ? "Offline" : state.id;
  if (menuRoomEyebrow) menuRoomEyebrow.textContent = isOfflineSession() ? "Mode" : "Room";
  const hero = activeHero();
  if (state.moneyMode && hero) {
    moneyDetails.innerHTML = `
      <div><span>Your stack</span><strong>${formatMoney(hero.stackCents)}</strong></div>
      <div><span>Session</span><strong class="${hero.netCents >= 0 ? "positive" : "negative"}">${formatSignedMoney(hero.netCents)}</strong></div>
    `;
    cashOutBtn.textContent = hero.stackCents > 0 ? `Leave with ${formatMoney(hero.stackCents)}` : "No stack to cash out";
    cashOutBtn.disabled = hero.stackCents <= 0;
  }
  const canRestart = Boolean(state.canRestartGame && state.phase !== "lobby");
  const canEnd = Boolean(state.canEndGame);
  restartGameBtn.classList.toggle("hidden", !canRestart);
  endGameBtn.classList.toggle("hidden", !canEnd);
  hostActionsPanel.classList.toggle("hidden", !canRestart && !canEnd);
  menuPlayers.innerHTML = seatedPlayers().map((player) => {
    const status = roundStatus(player);
    const actions = player.canMakeHost || player.canKick
      ? `<div class="menu-player-actions">
          ${player.canMakeHost ? `<button type="button" class="secondary" data-make-host="${escapeHtml(player.id)}">Make host</button>` : ""}
          ${player.canKick ? `<button type="button" class="danger" data-kick-player="${escapeHtml(player.id)}">Kick</button>` : ""}
        </div>`
      : "";
    return `
    <article class="menu-player ${player.isYou ? "you" : ""} ${player.folded ? "folded" : ""} ${player.isBot ? "bot" : ""}" ${playerColorStyle(player)}>
      <div class="menu-player-main">
        <div class="menu-player-identity">
          <div class="menu-player-head">
            <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
            <span class="seat-badges">
              ${player.dealer ? '<span class="pill">D</span>' : ""}
              ${player.isHost ? '<span class="pill">Host</span>' : ""}
              ${player.isBot ? '<span class="pill bot-pill">Bot</span>' : ""}
            </span>
          </div>
          <div class="menu-player-stats">
            <span>Stack <strong>${playerStackLabel(player)}</strong></span>
            ${status ? `<em>${escapeHtml(status)}</em>` : ""}
          </div>
        </div>
        ${actions}
      </div>
      ${player.isYou && !player.isBot ? `
        <form class="menu-name-form" data-name-form>
          <label>
            Display name
            <input data-player-name maxlength="18" value="${escapeHtml(player.name)}" autocomplete="name" />
          </label>
          <button type="submit" class="secondary">Save</button>
        </form>
      ` : ""}
    </article>
  `;
  }).join("");
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
  return hero.folded || !(hero.cards?.length);
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
      ? (["preflop", "flop", "turn", "river", "showdown"].includes(state?.phase)
        ? "Buy-in now and you’ll play on the next hand. Payments happen separately after the game."
        : "Payments happen separately after the game.")
      : "You’re in this hand — buy-in will be available after you fold or the hand ends.";
  }
}

function showGameMenu() {
  renderMenuPlayers();
  gameMenuModal.querySelectorAll(".appearance-panel, .table-actions-panel").forEach((panel) => {
    panel.open = false;
  });
  addBotBtn.classList.toggle("hidden", !state?.canAddBot || isSpectatorView());
  const hero = activeHero();
  sitOutBtn.classList.toggle("hidden", !hero || isSpectatorView() || state?.phase === "gameover");
  if (hero) sitOutBtn.textContent = hero.sittingOut ? "Sit back in" : "Sit out next hand";
  moneyPanel.classList.toggle("hidden", !state?.moneyMode || isSpectatorView() || isOfflineSession());
  shareGameBtn.classList.toggle("hidden", isOfflineSession());
  sharePanel.classList.add("hidden");
  blindPanel.classList.toggle("hidden", !state?.canChangeBlinds || isSpectatorView());
  if (state?.canChangeBlinds) {
    const moneyMode = state.moneyMode;
    menuSmallBlindLabel.textContent = moneyMode ? "Small blind ($)" : "Small blind";
    menuBigBlindLabel.textContent = moneyMode ? "Big blind ($)" : "Big blind";
    menuSmallBlindInput.value = moneyMode ? (state.smallBlindCents / 100).toFixed(2) : state.smallBlind;
    menuBigBlindInput.value = moneyMode ? (state.bigBlindCents / 100).toFixed(2) : state.bigBlind;
    menuSmallBlindInput.min = moneyMode ? "0.01" : "1";
    menuBigBlindInput.min = moneyMode ? "0.02" : "2";
    menuSmallBlindInput.step = moneyMode ? "0.01" : "1";
    menuBigBlindInput.step = moneyMode ? "0.01" : "1";
  }
  renderShotClockChoices();
  renderReadyTimerChoices();
  if (state?.moneyMode) cashInInput.value = (state.buyInCents / 100).toFixed(0);
  syncCashInControls();
  clearInterval(menuTimer);
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

function showScoreScreen(room) {
  const standings = [...(room.moneyMode ? room.ledger || [] : room.players)].sort((a, b) => (
    room.moneyMode
      ? b.netCents - a.netCents || a.name.localeCompare(b.name)
      : b.stack - a.stack || a.name.localeCompare(b.name)
  ));
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
  scoreList.innerHTML = standings.map((player, index) => `
    <div class="score-row ${player.isYou ? "you" : ""}" ${playerColorStyle(player)}>
      <span class="score-rank">${index + 1}</span>
      <span class="score-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
      <strong>${room.moneyMode ? formatSignedMoney(player.netCents) : player.stack}</strong>
    </div>
  `).join("") + (room.moneyMode ? `
    <div class="settlement-list">
      <p class="eyebrow">Who owes whom</p>
      ${(room.settlements || []).length ? room.settlements.map((item) => `
        <div class="settlement-row">
          <span>${escapeHtml(item.fromName)} pays ${escapeHtml(item.toName)}</span>
          <strong>${formatMoney(item.amountCents)}</strong>
        </div>
      `).join("") : '<div class="settlement-row"><span>No transfers needed</span><strong>$0.00</strong></div>'}
    </div>
  ` : "");
  if (room.moneyMode && room.id) setRoomUrl(room.id);
  else clearRoomUrl();
}

function replayAnimation(element, className, duration = 700) {
  element.classList.remove(className);
  requestAnimationFrame(() => {
    element.classList.add(className);
    setTimeout(() => element.classList.remove(className), duration);
  });
}

function setRoomUrl(roomId) {
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

function canonicalInviteUrl(roomId) {
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

function findLastIndex(items, predicate) {
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

function compactPlayerAction(entry, player) {
  const raw = entry.action || entry.text || "";
  const withoutName = player
    ? raw.replace(new RegExp(`^${escapeRegExp(player.name)}\\s+`, "i"), "").replace(/\.$/, "")
    : raw.replace(/\.$/, "");
  const amount = (value) => formatAmount(Number(value), Math.round(Number(value) * (state?.chipValueCents || 0)));
  return withoutName
    .replace(/^Calls\s+(\d+)/i, (_, value) => `call ${amount(value)}`)
    .replace(/^Checks$/i, "check")
    .replace(/^Folds$/i, "fold")
    .replace(/^Raises to\s+(\d+)/i, (_, value) => `raise ${amount(value)}`)
    .replace(/^Wins\s+(\d+)/i, (_, value) => `+${amount(value)}`);
}

function isBlindPost(entry) {
  return /^Posts (small|big) blind\b/i.test(entry?.action || "");
}

function actionTokenClass(entry, player) {
  const compact = compactPlayerAction(entry, player).toLowerCase();
  if (compact.startsWith("raise ")) return " action-token-raise";
  return "";
}

function playerTableStatus(player, isActiveTurn = player.isTurn) {
  if (player.sittingOut) return player.cards.length && isBettingPhase(state.phase) ? "Sits out next" : "Sitting out";

  if (playerIsOut(player)) return "Out";
  if (["lobby", "complete"].includes(state?.phase)) return player.ready || player.isBot ? "Ready" : "Not ready";
  if (player.waitingForNextHand) return "Next hand";
  if (player.folded) return "Folded";
  if (player.allIn) return "All in";
  if (isActiveTurn) return "Acting";
  return player.connected ? "In hand" : "Away";
}

function playerForAction(entry) {
  if (entry.playerId) {
    const byIdIndex = findLastIndex(state.players, (player) => player.id === entry.playerId);
    if (byIdIndex >= 0) return state.players[byIdIndex];
  }
  const byNameIndex = findLastIndex(state.players, (player) => entry.text?.startsWith(`${player.name} `));
  return byNameIndex >= 0 ? state.players[byNameIndex] : null;
}

function renderShownHandCard(player) {
  return `
    <article class="action-feed-card shown-hand-card ${player.isYou ? "you" : ""}" ${playerColorStyle(player)}>
      <div class="action-card-head">
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
      </div>
      <div class="shown-hand">${player.cards.map(cardTemplate).join("")}</div>
      <div class="action-card-stats">
        <span>${state.moneyMode ? "Bankroll" : "Stack"} <strong>${playerStackLabel(player)}</strong></span>
      </div>
    </article>
  `;
}

function currentTurnPlayer() {
  const index = findLastIndex(state.players, (player) => player.id === state.turn);
  return index >= 0 ? state.players[index] : null;
}

function isBettingPhase(phase) {
  return ["preflop", "flop", "turn", "river"].includes(phase);
}

function streetActionEntries(actionLog, phase) {
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
  shotClockChoices.innerHTML = `${SHOT_CLOCK_CHOICES.map((item) => `
    <button
      type="button"
      class="appearance-choice${!customActive && item.seconds === selected ? " selected" : ""}"
      data-shot-clock="${item.seconds}"
      aria-pressed="${!customActive && item.seconds === selected ? "true" : "false"}"
    >${item.label}</button>
  `).join("")}
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

function commitShotClockCustom(form) {
  if (!form || !shotClockCustomInput) return false;
  const raw = shotClockCustomInput.value.trim();
  const seconds = Number(raw);
  if (!raw || !Number.isFinite(seconds) || !Number.isInteger(seconds) || seconds < 10 || seconds > 600) {
    showToast("Enter an integer from 10 to 600 seconds.");
    return false;
  }

  // pointerdown (Save) and submit (Enter / click) share this path; dedupe one gesture.
  const now = Date.now();
  if (form.dataset.shotClockSaving === "1" && now - Number(form.dataset.shotClockSavedAt || 0) < 750) {
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
  readyTimerChoices.innerHTML = `${READY_TIMER_CHOICES.map((item) => `
    <button
      type="button"
      class="appearance-choice${!customActive && item.seconds === selected ? " selected" : ""}"
      data-ready-timer="${item.seconds}"
      aria-pressed="${!customActive && item.seconds === selected ? "true" : "false"}"
    >${item.label}</button>
  `).join("")}
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

function commitReadyTimerCustom(form) {
  if (!form || !readyTimerCustomInput) return false;
  const raw = readyTimerCustomInput.value.trim();
  const seconds = Number(raw);
  if (!raw || !Number.isFinite(seconds) || !Number.isInteger(seconds) || seconds < 5 || seconds > 300) {
    showToast("Enter an integer from 5 to 300 seconds.");
    return false;
  }

  // pointerdown (Save) and submit (Enter / click) share this path; dedupe one gesture.
  const now = Date.now();
  if (form.dataset.readyTimerSaving === "1" && now - Number(form.dataset.readyTimerSavedAt || 0) < 750) {
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
  if (!state?.turnEndsAt || !state?.turnTimeLimitMs || !isBettingPhase(state.phase) || !state.turn) return 0;
  return Math.max(0, Math.ceil((state.turnEndsAt - clientNow()) / 1000));
}

function turnPctRemaining() {
  const limit = Number(state?.turnTimeLimitMs) || 0;
  if (!limit || !state?.turnEndsAt) return 0;
  return Math.max(0, Math.min(1, (state.turnEndsAt - clientNow()) / limit));
}

function actingSeatShowsClock(player) {
  return Boolean(
    player
    && !player.isBot
    && state?.turnEndsAt
    && state?.turnTimeLimitMs
    && isBettingPhase(state.phase)
    && player.id === state.turn,
  );
}

function lowTimeWarningActive() {
  if (!state?.turnEndsAt || !state?.turnTimeLimitMs || !isBettingPhase(state.phase) || !state.turn) return false;
  if (typeof TurnClockWarning === "undefined" || !TurnClockWarning.isLowTime) {
    const rem = state.turnEndsAt - clientNow();
    return rem > 0 && rem <= 5000;
  }
  return TurnClockWarning.isLowTime(state.turnEndsAt, clientNow());
}

function canHearShotClockCues() {
  return Boolean(state?.isYourTurn) && !isSpectatorView() && !document.hidden;
}

function playTimerTimeoutIfEligible(eligibleForEndsAt, endsAt) {
  if (endsAt == null || eligibleForEndsAt !== endsAt || document.hidden || isSpectatorView()) return;
  tableSounds.timerTimeout();
}

function syncLowTimeWarningEffects(now = clientNow()) {
  if (!state?.turnEndsAt || !state?.turnTimeLimitMs || !isBettingPhase(state.phase) || !state.turn) {
    const previousEnds = lowTimeSession.turnEndsAt;
    const timedOut = typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeDeadlineTimeout
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

  const timedOut = typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeDeadlineTimeout
    ? TurnClockWarning.consumeDeadlineTimeout(lowTimeSession, { turnEndsAt: endsAt, now })
    : false;
  if (timedOut) playTimerTimeoutIfEligible(shotClockCueEligibleForEndsAt, endsAt);

  const tickSecond = typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeLowTimeTick
    ? TurnClockWarning.consumeLowTimeTick(lowTimeSession, { turnEndsAt: endsAt, now })
    : null;

  // Sound + vibrate only on the acting player's own device (never spectators).
  if (tickSecond != null && canHearShotClockCues()) {
    tableSounds.shotClockTick();
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
  clearInterval(turnCountdownTimer);
  turnCountdownTimer = null;
  if (!state?.turnEndsAt || !state?.turnTimeLimitMs || !isBettingPhase(state.phase) || !state.turn) {
    syncLowTimeWarningEffects();
    return;
  }
  const tick = () => {
    const seconds = turnSecondsRemaining();
    const labelText = formatTurnCountdown(seconds);
    const pct = turnPctRemaining();
    const lowTime = lowTimeWarningActive();
    document.querySelectorAll("[data-turn-seat-clock]").forEach((row) => {
      row.style.setProperty("--turn-pct", String(pct));
      row.classList.toggle("low-time", lowTime);
      const label = row.querySelector("[data-turn-countdown]");
      if (label) {
        label.textContent = labelText;
        label.setAttribute("aria-label", `${labelText} left`);
      }
    });
    syncLowTimeWarningEffects();
    if (seconds <= 0) clearInterval(turnCountdownTimer);
  };
  tick();
  turnCountdownTimer = setInterval(tick, 200);
}

function blindChipMarkup(player) {
  if (player.isBigBlind) return '<span class="blind-chip big" title="Big blind" aria-label="Big blind">BB</span>';
  if (player.isSmallBlind) return '<span class="blind-chip small" title="Small blind" aria-label="Small blind">SB</span>';
  return "";
}

function readyTimerActive() {
  if (typeof ReadyClock !== "undefined" && ReadyClock.readyPhaseActive) {
    return Boolean(state?.readyEndsAt && ReadyClock.readyPhaseActive(state.phase));
  }
  return Boolean(state?.readyEndsAt && ["lobby", "complete"].includes(state.phase));
}

function readySecondsRemaining() {
  if (!readyTimerActive()) return 0;
  if (typeof ReadyClock !== "undefined" && ReadyClock.readySecondsRemaining) {
    return ReadyClock.readySecondsRemaining(state.readyEndsAt, clientNow());
  }
  return Math.max(0, Math.ceil((state.readyEndsAt - clientNow()) / 1000));
}

function readyPctRemaining() {
  if (!readyTimerActive()) return 0;
  const limit = Number(state?.readyTimeLimitMs) || 20000;
  if (typeof ReadyClock !== "undefined" && ReadyClock.readyPctRemaining) {
    return ReadyClock.readyPctRemaining(state.readyEndsAt, limit, clientNow());
  }
  return Math.max(0, Math.min(1, (state.readyEndsAt - clientNow()) / limit));
}

function seatShowsReadyClock(player) {
  if (typeof ReadyClock !== "undefined" && ReadyClock.seatShowsReadyClock) {
    return ReadyClock.seatShowsReadyClock(player, {
      readyEndsAt: state?.readyEndsAt,
      phase: state?.phase,
    });
  }
  return Boolean(
    readyTimerActive()
    && player
    && !player.isBot
    && !player.sittingOut
    && !player.ready
    && player.stack > 0,
  );
}

function readyLowTimeWarningActive() {
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
    const timedOut = typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeDeadlineTimeout
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

  const endsAt = state.readyEndsAt;
  if (canHearReadyClockCues() && now < endsAt) {
    readyCueEligibleForEndsAt = endsAt;
  }

  const timedOut = typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeDeadlineTimeout
    ? TurnClockWarning.consumeDeadlineTimeout(readyLowTimeSession, { turnEndsAt: endsAt, now })
    : false;
  if (timedOut) playTimerTimeoutIfEligible(readyCueEligibleForEndsAt, endsAt);

  const tickSecond = typeof TurnClockWarning !== "undefined" && TurnClockWarning.consumeLowTimeTick
    ? TurnClockWarning.consumeLowTimeTick(readyLowTimeSession, { turnEndsAt: endsAt, now })
    : null;

  // Quiet tick only for the local player who still needs to ready (never spectators).
  if (tickSecond != null && canHearReadyClockCues()) {
    tableSounds.shotClockTick();
  }
}

function appendReadyCountdown(target, { separator = true } = {}) {
  if (!target || !readyTimerActive()) return null;
  if (separator) target.append(" · ");
  const countdown = document.createElement("span");
  const seconds = readySecondsRemaining();
  const labelText = formatTurnCountdown(seconds);
  const lowTime = readyLowTimeWarningActive();
  countdown.className = `turn-clock${lowTime ? " low-time" : ""}`;
  countdown.dataset.readyCountdown = "1";
  countdown.textContent = labelText;
  countdown.setAttribute("aria-label", `${labelText} left to ready up`);
  target.append(countdown);
  return countdown;
}

function syncReadyCountdown() {
  clearInterval(readyCountdownTimer);
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
      row.style.setProperty("--turn-pct", String(pct));
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
    if (seconds <= 0) clearInterval(readyCountdownTimer);
  };
  tick();
  readyCountdownTimer = setInterval(tick, 200);
}

function renderActionFeed(newEntryId = "") {
  const entries = streetActionEntries(state.actionLog, state.phase);
  const activePlayer = currentTurnPlayer();
  const latestByPlayer = new Map();
  entries.forEach((entry) => {
    // Blind posts aren't actions; the SB/BB chips mark those seats for the whole hand.
    if (isBlindPost(entry)) return;
    const player = playerForAction(entry);
    if (player) latestByPlayer.set(player.id, entry);
  });
  const tableMarkup = seatedPlayers().map((player) => {
    const entry = latestByPlayer.get(player.id);
    const isActing = player.id === activePlayer?.id;
    const betweenHands = ["lobby", "complete"].includes(state.phase);
    const isAllIn = Boolean(player.allIn);
    const isOutOfAction = player.folded || isAllIn;
    const showStreetAction = !betweenHands && entry && !isOutOfAction;
    const action = showStreetAction
      ? compactPlayerAction(entry, player)
      : playerTableStatus(player, isActing);
    const showTurnClock = isActing && actingSeatShowsClock(player);
    const showReadyClock = !showTurnClock && seatShowsReadyClock(player);
    const showClock = showTurnClock || showReadyClock;
    const seconds = showTurnClock ? turnSecondsRemaining() : showReadyClock ? readySecondsRemaining() : 0;
    const pct = showTurnClock ? turnPctRemaining() : showReadyClock ? readyPctRemaining() : 0;
    const styleVars = [
      player?.color ? `--player-color: ${escapeHtml(player.color)}` : "",
      showClock ? `--turn-pct: ${pct}` : "",
    ].filter(Boolean).join("; ");
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
    const clockAria = showReadyClock ? `${countdownLabel} left to ready up` : `${countdownLabel} left`;
    const clockMarkup = showClock
      ? `<span class="turn-clock${lowTime ? " low-time" : ""}" ${countdownAttr} aria-label="${clockAria}">${countdownLabel}</span>`
      : "";
    const barMarkup = showClock ? `<span class="turn-clock-bar" aria-hidden="true"><i></i></span>` : "";
    const seatClockAttr = showTurnClock
      ? ' data-turn-seat-clock="1"'
      : showReadyClock
        ? ' data-ready-seat-clock="1"'
        : "";
    return `
      <article class="table-player-row ${isActing ? "turn" : ""} ${showClock ? "shot-clock" : ""} ${lowTime ? "low-time" : ""} ${player.folded ? "folded" : ""} ${isAllIn ? "all-in" : ""} ${player.isYou ? "you" : ""} ${entry?.id === newEntryId ? "new-action" : ""}"${seatClockAttr}${styleAttr}>
        <span class="seat-timer" aria-hidden="true"><i class="player-dot"></i></span>
        <span class="seat-name seat-name-with-chips"><span class="seat-name-text">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>${blindChipMarkup(player)}</span>
        <span class="player-action${showStreetAction ? actionTokenClass(entry, player) : ""}">${escapeHtml(action)}${clockMarkup}</span>
        <strong class="player-stack">${playerStackLabel(player)}</strong>
        ${barMarkup}
      </article>
    `;
  }).join("");
  // Revealed hands: showdown winners/mucks, voluntary shows, and all-in runout face-ups.
  const shownHands = state.players
    .filter((player) => player.showCards && player.cards?.some((card) => card && (card.code || card.rank)))
    .map(renderShownHandCard)
    .join("");
  return `${tableMarkup}${shownHands}`;
}

function isEndedGameReturn(previous, next) {
  return previous && previous.phase !== "lobby" && next.phase === "lobby" && next.message === "Game ended by host.";
}

function isGameOver(room) {
  return room?.phase === "gameover";
}

function playActionSound(entry) {
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


