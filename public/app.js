const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

const welcome = document.querySelector("#welcome");
const themeColor = document.querySelector("#themeColor");
const tableView = document.querySelector("#tableView");
const scoreView = document.querySelector("#scoreView");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const roomCodeLabel = document.querySelector("#roomCodeLabel");
const hostModeBtn = document.querySelector("#hostModeBtn");
const joinModeBtn = document.querySelector("#joinModeBtn");
const blindFields = document.querySelector("#blindFields");
const smallBlindInput = document.querySelector("#smallBlindInput");
const bigBlindInput = document.querySelector("#bigBlindInput");
const smallBlindLabel = document.querySelector("#smallBlindLabel");
const bigBlindLabel = document.querySelector("#bigBlindLabel");
const moneyModeInput = document.querySelector("#moneyModeInput");
const buyInLabel = document.querySelector("#buyInLabel");
const buyInInput = document.querySelector("#buyInInput");
const tableActionBtn = document.querySelector("#tableActionBtn");
const joinError = document.querySelector("#joinError");
const roomCode = document.querySelector("#roomCode");
const roomCodeBtn = document.querySelector("#roomCodeBtn");
const menuBtn = document.querySelector("#menuBtn");
const gameMenuModal = document.querySelector("#gameMenuModal");
const closeMenuBtn = document.querySelector("#closeMenuBtn");
const addBotBtn = document.querySelector("#addBotBtn");
const restartGameBtn = document.querySelector("#restartGameBtn");
const endGameBtn = document.querySelector("#endGameBtn");
const shareGameBtn = document.querySelector("#shareGameBtn");
const backToMenuBtn = document.querySelector("#backToMenuBtn");
const menuRoomCode = document.querySelector("#menuRoomCode");
const menuPlayers = document.querySelector("#menuPlayers");
const feltChoices = document.querySelector("#feltChoices");
const deckChoices = document.querySelector("#deckChoices");
const soundEnabledInput = document.querySelector("#soundEnabledInput");
const keybindList = document.querySelector("#keybindList");
const resetKeybindsBtn = document.querySelector("#resetKeybindsBtn");
const sharePanel = document.querySelector("#sharePanel");
const shareQr = document.querySelector("#shareQr");
const shareLink = document.querySelector("#shareLink");
const copyShareBtn = document.querySelector("#copyShareBtn");
const moneyPanel = document.querySelector("#moneyPanel");
const blindPanel = document.querySelector("#blindPanel");
const blindForm = document.querySelector("#blindForm");
const menuSmallBlindLabel = document.querySelector("#menuSmallBlindLabel");
const menuBigBlindLabel = document.querySelector("#menuBigBlindLabel");
const menuSmallBlindInput = document.querySelector("#menuSmallBlindInput");
const menuBigBlindInput = document.querySelector("#menuBigBlindInput");
const cashInInput = document.querySelector("#cashInInput");
const cashOutBtn = document.querySelector("#cashOutBtn");
const potValue = document.querySelector("#potValue");
const community = document.querySelector("#community");
const players = document.querySelector("#players");
const heroHand = document.querySelector("#heroHand");
const winnerList = document.querySelector("#winnerList");
const turnInfo = document.querySelector("#turnInfo");
const gameButtons = document.querySelector("#gameButtons");
const betControls = document.querySelector("#betControls");
const raiseMinus = document.querySelector("#raiseMinus");
const raisePlus = document.querySelector("#raisePlus");
const raiseLabel = document.querySelector("#raiseLabel");
const raiseAmount = document.querySelector("#raiseAmount");
const raiseActionBtn = document.querySelector("#raiseActionBtn");
const betPresets = document.querySelector("#betPresets");
const scoreList = document.querySelector("#scoreList");
const scoreMenuBtn = document.querySelector("#scoreMenuBtn");
const toast = document.querySelector("#toast");

class TableSounds {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = localStorage.getItem("holdem:sound") !== "off";
  }

  unlock() {
    if (!this.enabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.context) {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.24;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    return this.context;
  }

  createNoiseBuffer() {
    const length = Math.floor(this.context.sampleRate * 0.45);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.32 + white * 0.68;
      data[index] = previous;
    }
    return buffer;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    localStorage.setItem("holdem:sound", this.enabled ? "on" : "off");
    if (this.enabled) this.unlock();
  }

  output(gainValue, pan = 0) {
    const gain = this.context.createGain();
    gain.gain.value = gainValue;
    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner).connect(this.master);
    } else {
      gain.connect(this.master);
    }
    return gain;
  }

  paper(at = 0, pan = 0) {
    const context = this.unlock();
    if (!context) return;
    const start = Math.max(context.currentTime, at || context.currentTime);
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const peak = context.createBiquadFilter();
    const envelope = this.output(0, pan);
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.92 + Math.random() * 0.18;
    highpass.type = "highpass";
    highpass.frequency.value = 650;
    peak.type = "bandpass";
    peak.frequency.value = 1900 + Math.random() * 650;
    peak.Q.value = 0.7;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.2, start + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.035, start + 0.055);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    source.connect(highpass).connect(peak).connect(envelope);
    source.start(start, Math.random() * 0.08, 0.16);
    source.stop(start + 0.17);
    this.tap(start + 0.025, 118, 0.08, pan);
  }

  tap(at = 0, frequency = 150, volume = 0.12, pan = 0) {
    const context = this.unlock();
    if (!context) return;
    const start = Math.max(context.currentTime, at || context.currentTime);
    const oscillator = context.createOscillator();
    const envelope = this.output(0, pan);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(55, frequency * 0.52), start + 0.045);
    envelope.gain.setValueAtTime(volume, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
    oscillator.connect(envelope);
    oscillator.start(start);
    oscillator.stop(start + 0.06);
  }

  click() {
    const context = this.unlock();
    if (!context) return;
    this.tap(context.currentTime, 310, 0.075, 0);
  }

  chips(kind = "action") {
    const context = this.unlock();
    if (!context) return;
    const count = kind === "raise" ? 3 : 2;
    for (let index = 0; index < count; index += 1) {
      this.tap(context.currentTime + index * 0.032, 720 + index * 115 + Math.random() * 55, 0.065, (index - 1) * 0.16);
    }
  }

  deal(count = 1) {
    const context = this.unlock();
    if (!context) return;
    for (let index = 0; index < Math.min(count, 5); index += 1) {
      this.paper(context.currentTime + index * 0.075, (index - (count - 1) / 2) * 0.12);
    }
  }

  win() {
    const context = this.unlock();
    if (!context) return;
    [392, 523.25, 659.25].forEach((frequency, index) => {
      const start = context.currentTime + index * 0.085;
      const oscillator = context.createOscillator();
      const envelope = this.output(0, 0);
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.045, start + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      oscillator.connect(envelope);
      oscillator.start(start);
      oscillator.stop(start + 0.34);
    });
  }
}

const tableSounds = new TableSounds();
soundEnabledInput.checked = tableSounds.enabled;

const KEYBIND_DEFINITIONS = [
  { id: "fold", label: "Fold", defaultKey: "f" },
  { id: "call", label: "Check / call", defaultKey: "c" },
  { id: "raise", label: "Bet / raise", defaultKey: "r" },
  { id: "raiseUp", label: "Increase bet", defaultKey: "ArrowUp" },
  { id: "raiseDown", label: "Decrease bet", defaultKey: "ArrowDown" },
  { id: "ready", label: "Ready up", defaultKey: "Space" },
  { id: "showHand", label: "Show hand", defaultKey: "h" },
  { id: "menu", label: "Table menu", defaultKey: "m" },
];
const DEFAULT_KEYBINDS = Object.fromEntries(KEYBIND_DEFINITIONS.map((item) => [item.id, item.defaultKey]));
let keybinds = loadKeybinds();
let recordingKeybindAction = "";

function normalizedKey(key) {
  if (key === " " || key === "Spacebar") return "Space";
  return key?.length === 1 ? key.toLowerCase() : key;
}

function loadKeybinds() {
  try {
    const saved = JSON.parse(localStorage.getItem("holdem:keybinds") || "null");
    if (!saved || typeof saved !== "object") return { ...DEFAULT_KEYBINDS };
    const next = { ...DEFAULT_KEYBINDS };
    KEYBIND_DEFINITIONS.forEach(({ id }) => {
      if (typeof saved[id] === "string" && saved[id]) next[id] = normalizedKey(saved[id]);
    });
    return next;
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

function keybindLabel(key) {
  return ({
    Space: "Space",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    Backspace: "⌫",
    Delete: "Del",
  })[key] || (key?.length === 1 ? key.toUpperCase() : key);
}

function saveKeybinds() {
  localStorage.setItem("holdem:keybinds", JSON.stringify(keybinds));
}

function renderKeybinds() {
  keybindList.innerHTML = KEYBIND_DEFINITIONS.map(({ id, label }) => `
    <div class="keybind-row">
      <span>${label}</span>
      <button type="button" class="keybind-button ${recordingKeybindAction === id ? "recording" : ""}" data-keybind-action="${id}" aria-label="Set key for ${label}">
        ${recordingKeybindAction === id ? "Press a key…" : escapeHtml(keybindLabel(keybinds[id]))}
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
  const previousKey = keybinds[action];
  const conflictAction = Object.keys(keybinds).find((id) => id !== action && keybinds[id] === key);
  keybinds[action] = key;
  if (conflictAction) keybinds[conflictAction] = previousKey;
  recordingKeybindAction = "";
  saveKeybinds();
  renderKeybinds();
  renderControls(activeHero());
  showToast(conflictAction ? "Shortcuts swapped" : "Shortcut updated");
}

function matchesKeybind(event, action) {
  return normalizedKey(event.key) === keybinds[action];
}

renderKeybinds();

let state = null;
let raiseState = { value: 0, min: 0, max: 0, step: 20 };
let raiseControlsDisabled = false;
let leavingEndedRoom = false;
let menuTimer = null;
let lastAutoRejoinKey = "";
let lastActionEntryId = "";
let lastCommunitySignature = null;
let lastHeroSignature = "";
let heroCardsHidden = false;
let lastWinnerSignature = "";
let lastPhase = "";
let lastPot = null;
const params = new URLSearchParams(window.location.search);
const initialRoomParam = (params.get("room") || "").toUpperCase();
const initialRoomId = (initialRoomParam || localStorage.getItem("holdem:lastRoom") || "").toUpperCase();
if (initialRoomId) roomInput.value = initialRoomId;
nameInput.value = localStorage.getItem("holdem:name") || "";
let joinPending = false;
let didAutoJoinInitialRoom = false;
let tableMode = initialRoomId ? "join" : "host";
let toastTimer = null;
const FELT_OPTIONS = [
  { id: "emerald", label: "Emerald", color: "#116853" },
  { id: "navy", label: "Navy", color: "#24527a" },
  { id: "wine", label: "Wine", color: "#7b3043" },
  { id: "violet", label: "Violet", color: "#58448b" },
  { id: "mint", label: "Mint", color: "#72bca4" },
  { id: "sky", label: "Sky", color: "#75aeca" },
  { id: "sand", label: "Sand", color: "#c3a875" },
  { id: "blush", label: "Blush", color: "#c98791" },
];
const DECK_OPTIONS = [
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

const deviceTheme = window.matchMedia("(prefers-color-scheme: light)");
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
  if (!roomId || !response?.reconnectToken) return;
  localStorage.setItem(`holdem:credentials:${String(roomId).toUpperCase()}`, JSON.stringify({
    playerId: response.playerId || getDeviceId(),
    reconnectToken: response.reconnectToken,
  }));
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

let previousGameTouchY = null;

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

function updateTableActionLabel() {
  const isJoining = tableMode === "join";
  if (!joinPending) tableActionBtn.textContent = isJoining ? "Join table" : "Host table";
  tableActionBtn.disabled = joinPending || !socket.connected;
  blindFields.classList.toggle("hidden", isJoining);
  moneyModeInput.closest("label").classList.toggle("hidden", isJoining);
  buyInLabel.classList.toggle("hidden", isJoining || !moneyModeInput.checked);
  roomCodeLabel.classList.toggle("hidden", !isJoining);
  hostModeBtn.classList.toggle("selected", !isJoining);
  joinModeBtn.classList.toggle("selected", isJoining);
  hostModeBtn.setAttribute("aria-selected", String(!isJoining));
  joinModeBtn.setAttribute("aria-selected", String(isJoining));
}

function syncBlindInputMode() {
  const moneyMode = moneyModeInput.checked;
  const previousMode = blindFields.dataset.mode || "chips";
  if ((moneyMode ? "money" : "chips") !== previousMode) {
    const buyInCents = moneyCentsFromInput(buyInInput);
    const chipCents = buyInCents / 1000;
    if (moneyMode) {
      smallBlindInput.value = (Number(smallBlindInput.value || 10) * chipCents / 100).toFixed(2);
      bigBlindInput.value = (Number(bigBlindInput.value || 20) * chipCents / 100).toFixed(2);
    } else {
      smallBlindInput.value = String(Math.max(1, Math.round(Number(smallBlindInput.value || 0.2) * 100 / chipCents)));
      bigBlindInput.value = String(Math.max(2, Math.round(Number(bigBlindInput.value || 0.4) * 100 / chipCents)));
    }
  }
  blindFields.dataset.mode = moneyMode ? "money" : "chips";
  smallBlindLabel.textContent = moneyMode ? "Small blind ($)" : "Small blind";
  bigBlindLabel.textContent = moneyMode ? "Big blind ($)" : "Big blind";
  smallBlindInput.min = moneyMode ? "0.01" : "1";
  bigBlindInput.min = moneyMode ? "0.02" : "2";
  smallBlindInput.step = moneyMode ? "0.01" : "1";
  bigBlindInput.step = moneyMode ? "0.01" : "1";
}

function setTableMode(mode, focusRoom = false) {
  tableMode = mode;
  joinError.textContent = "";
  updateTableActionLabel();
  if (focusRoom && mode === "join") roomInput.focus();
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 1800);
}

function cardTemplate(card, extraClass = "") {
  const className = extraClass ? ` ${extraClass}` : "";
  if (!card) return `<div class="card back${className}"><span></span><span></span></div>`;
  const cardName = `${card.rank}${card.suit}`;
  return `
    <div class="card ${card.color === "red" ? "red" : ""}${className}" aria-label="${escapeHtml(cardName)}">
      <span class="card-corner card-corner-top">
        <span class="card-rank">${card.rank}</span>
      </span>
      <span class="card-corner card-corner-bottom">
        <span class="card-corner-suit suit">${card.suit}</span>
      </span>
    </div>
  `;
}

function playerColorStyle(player) {
  return player?.color ? `style="--player-color: ${escapeHtml(player.color)}"` : "";
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

function moneyCentsFromInput(input, fallback = 20) {
  const dollars = Number(input.value);
  if (!Number.isFinite(dollars) || dollars <= 0) return Math.round(fallback * 100);
  return Math.max(100, Math.min(1000000, Math.round(dollars * 100)));
}

function formatMoney(cents) {
  const amount = (Math.round(Number(cents) || 0) / 100).toFixed(2);
  return `$${amount}`;
}

function formatSignedMoney(cents) {
  const amount = Math.round(Number(cents) || 0);
  if (amount === 0) return "$0.00";
  return `${amount > 0 ? "+" : "-"}${formatMoney(Math.abs(amount))}`;
}

function formatAmount(chips, cents) {
  return state?.moneyMode ? formatMoney(cents) : String(chips);
}

function playerStackLabel(player) {
  return formatAmount(player.stack, player.stackCents);
}

function showTable(room) {
  setViewportHeight();
  document.documentElement.classList.add("game-open-root");
  document.body.classList.add("game-open");
  document.body.classList.remove("keyboard-open");
  welcome.classList.add("hidden");
  scoreView.classList.add("hidden");
  tableView.classList.remove("hidden");
  setRoomUrl(room.id);
}

function hideGameMenu() {
  cancelKeybindRecording();
  gameMenuModal.classList.add("hidden");
  sharePanel.classList.add("hidden");
  clearInterval(menuTimer);
  menuTimer = null;
  if (!tableView.classList.contains("hidden")) menuBtn.focus({ preventScroll: true });
}

function roundStatus(player) {
  if (!player.connected && player.disconnectExpiresAt) {
    const seconds = Math.max(0, Math.ceil((new Date(player.disconnectExpiresAt).getTime() - Date.now()) / 1000));
    return seconds > 0 ? `Away ${seconds}s` : "Away";
  }
  if (!player.connected) return "Away";
  if (["lobby", "complete"].includes(state?.phase)) return "";
  if (player.folded) return "Folded";
  if (player.allIn) return "All in";
  if (player.isTurn) return "Acting";
  if (player.stack > 0 || player.invested > 0) return "In round";
  return "Out";
}

function renderMenuPlayers() {
  if (!state) return;
  if (document.activeElement?.matches("[data-player-name]")) return;
  menuRoomCode.textContent = state.id;
  restartGameBtn.classList.toggle("hidden", !state.canRestartGame || state.phase === "lobby");
  endGameBtn.classList.toggle("hidden", !state.canEndGame);
  menuPlayers.innerHTML = state.players.map((player) => `
    <article class="menu-player ${player.isYou ? "you" : ""} ${player.folded ? "folded" : ""}" ${playerColorStyle(player)}>
      <div class="menu-player-head">
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
        <span class="seat-badges">
          ${player.dealer ? '<span class="pill">D</span>' : ""}
          ${player.isHost ? '<span class="pill">Host</span>' : ""}
          ${player.isBot ? '<span class="pill bot-pill">Bot</span>' : ""}
        </span>
      </div>
      <div class="menu-player-stats">
        <span>${state.moneyMode ? "Bankroll" : "Stack"} <strong>${playerStackLabel(player)}</strong></span>
        ${state.moneyMode ? `<span>Net <strong>${formatSignedMoney(player.netCents)}</strong></span>` : ""}
        ${roundStatus(player) ? `<em>${escapeHtml(roundStatus(player))}</em>` : ""}
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
      ${player.canMakeHost || player.canKick ? `
        <div class="menu-player-actions">
          ${player.canMakeHost ? `<button type="button" class="secondary" data-make-host="${escapeHtml(player.id)}">Make host</button>` : ""}
          ${player.canKick ? `<button type="button" class="danger" data-kick-player="${escapeHtml(player.id)}">Kick</button>` : ""}
        </div>
      ` : ""}
    </article>
  `).join("");
}

function showGameMenu() {
  renderMenuPlayers();
  addBotBtn.classList.toggle("hidden", !state?.canAddBot);
  moneyPanel.classList.toggle("hidden", !state?.moneyMode);
  blindPanel.classList.toggle("hidden", !state?.canChangeBlinds);
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
  if (state?.moneyMode) cashInInput.value = (state.buyInCents / 100).toFixed(0);
  clearInterval(menuTimer);
  menuTimer = setInterval(renderMenuPlayers, 1000);
  gameMenuModal.classList.remove("hidden");
  closeMenuBtn.focus({ preventScroll: true });
}

function showWelcome(status = "") {
  state = null;
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
  scoreList.innerHTML = standings.map((player, index) => `
    <div class="score-row ${player.isYou ? "you" : ""}" ${playerColorStyle(player)}>
      <span class="score-rank">${index + 1}</span>
      <span class="score-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
      <strong>${room.moneyMode ? formatSignedMoney(player.netCents) : player.stack}</strong>
    </div>
  `).join("") + (room.moneyMode ? `
    <div class="settlement-list">
      <p class="eyebrow">Settle up</p>
      ${(room.settlements || []).length ? room.settlements.map((item) => `
        <div class="settlement-row">
          <span>${escapeHtml(item.fromName)} pays ${escapeHtml(item.toName)}</span>
          <strong>${formatMoney(item.amountCents)}</strong>
        </div>
      `).join("") : '<div class="settlement-row"><span>No transfers needed</span><strong>$0.00</strong></div>'}
    </div>
  ` : "");
  clearRoomUrl();
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
  const url = new URL(window.location.href);
  url.searchParams.set("room", state.id);
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
    .replace(/^Posts small blind\s+(\d+)/i, (_, value) => `SB ${amount(value)}`)
    .replace(/^Posts big blind\s+(\d+)/i, (_, value) => `BB ${amount(value)}`)
    .replace(/^Calls\s+(\d+)/i, (_, value) => `call ${amount(value)}`)
    .replace(/^Checks$/i, "check")
    .replace(/^Folds$/i, "fold")
    .replace(/^Raises to\s+(\d+)/i, (_, value) => `raise ${amount(value)}`)
    .replace(/^Wins\s+(\d+)/i, (_, value) => `+${amount(value)}`);
}

function actionTokenClass(entry, player) {
  const compact = compactPlayerAction(entry, player).toLowerCase();
  if (compact.startsWith("raise ")) return " action-token-raise";
  return "";
}

function playerTableStatus(player, isActiveTurn = player.isTurn) {
  if (["lobby", "complete"].includes(state?.phase)) return player.ready || player.isBot ? "Ready" : "Not ready";
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

function renderActionFeed(newEntryId = "") {
  const entries = (state.actionLog || []).filter((entry) => entry.phase !== "lobby");
  const activePlayer = currentTurnPlayer();
  const latestByPlayer = new Map();
  entries.forEach((entry) => {
    const player = playerForAction(entry);
    if (player) latestByPlayer.set(player.id, entry);
  });
  const tableMarkup = state.players.map((player) => {
    const entry = latestByPlayer.get(player.id);
    const isActing = player.id === activePlayer?.id;
    const betweenHands = ["lobby", "complete"].includes(state.phase);
    const isOutOfAction = player.folded || player.allIn;
    const action = !betweenHands && entry && !isOutOfAction
      ? compactPlayerAction(entry, player)
      : playerTableStatus(player, isActing);
    return `
      <article class="table-player-row ${isActing ? "turn" : ""} ${player.folded ? "folded" : ""} ${player.allIn ? "all-in" : ""} ${player.isYou ? "you" : ""} ${entry?.id === newEntryId ? "new-action" : ""}" ${playerColorStyle(player)}>
        <i class="player-dot" aria-hidden="true"></i>
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
        <span class="player-action${entry ? actionTokenClass(entry, player) : ""}">${escapeHtml(action)}</span>
        <strong class="player-stack">${playerStackLabel(player)}</strong>
      </article>
    `;
  }).join("");
  const shownHands = state.phase === "complete"
    ? state.players.filter((player) => player.showCards).map(renderShownHandCard).join("")
    : "";
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

function render() {
  if (!state) return;
  const isFirstTableRender = lastCommunitySignature === null;
  showTable(state);
  roomCode.textContent = state.id;
  potValue.textContent = formatAmount(state.pot, state.potCents);
  if (lastPot !== null && lastPot !== state.pot) {
    replayAnimation(potValue.closest("div"), "value-changed", 480);
  }
  lastPot = state.pot;

  const communitySignature = state.community.map((card) => card?.code || `${card?.rank || ""}${card?.suit || ""}`).join("|");
  const expectedCommunityCards = state.phase === "lobby" ? 0 : 5;
  if (communitySignature !== lastCommunitySignature || community.children.length !== expectedCommunityCards) {
    const previousCommunity = lastCommunitySignature ? lastCommunitySignature.split("|") : [];
    const isInitialBoard = community.children.length === 0 && state.phase !== "lobby";
    const newCommunityCardCount = state.community.filter((card, index) => {
      const cardCode = card?.code || `${card?.rank || ""}${card?.suit || ""}`;
      return Boolean(card && previousCommunity[index] !== cardCode);
    }).length;
    community.innerHTML = state.phase === "lobby"
      ? ""
      : Array.from({ length: 5 }, (_, index) => {
        const card = state.community[index] || null;
        const cardCode = card?.code || `${card?.rank || ""}${card?.suit || ""}`;
        const isNewCard = isInitialBoard || Boolean(card && previousCommunity[index] !== cardCode);
        return cardTemplate(card, isNewCard ? "card-entering" : "");
      }).join("");
    lastCommunitySignature = communitySignature;
    if (!isFirstTableRender && newCommunityCardCount) tableSounds.deal(newCommunityCardCount);
  }
  const feltElement = document.querySelector(".felt");
  if (lastPhase && lastPhase !== state.phase) replayAnimation(feltElement, "street-change", 650);
  feltElement.classList.toggle("showdown-wait", state.phase === "showdown");
  lastPhase = state.phase;

  const entries = (state.actionLog || []).filter((entry) => entry.phase !== "lobby");
  const latestEntryId = entries.at(-1)?.id || "";
  const hasNewAction = Boolean(latestEntryId && latestEntryId !== lastActionEntryId);
  const feedScroll = captureActionFeedScroll();
  players.innerHTML = renderActionFeed(hasNewAction ? latestEntryId : "");
  restoreActionFeedScroll(feedScroll);
  if (hasNewAction) replayAnimation(players, "feed-updated", 420);
  if (hasNewAction && !isFirstTableRender) playActionSound(entries.at(-1));
  lastActionEntryId = latestEntryId;

  const hero = activeHero();
  const heroSignature = hero?.cards?.map((card) => card?.code || `${card?.rank || ""}${card?.suit || ""}`).join("|") || "";
  if (heroSignature !== lastHeroSignature) {
    heroCardsHidden = false;
    heroHand.innerHTML = hero?.cards?.length ? hero.cards.map(cardTemplate).join("") : "";
    updateHeroCardVisibility();
    replayAnimation(heroHand, "cards-entering", 720);
    if (heroSignature && !document.hidden) tableSounds.deal(hero?.cards?.length || 1);
    lastHeroSignature = heroSignature;
  }
  const winnerMarkup = state.winners.map((winner) => {
    const winnerPlayer = state.players.find((player) => player.id === winner.playerId || player.name === winner.name);
    return `
      <div ${playerColorStyle(winnerPlayer)}>
        <span class="seat-name">${escapeHtml(winner.name)}</span> wins ${formatAmount(winner.amount, winner.amountCents)} with ${escapeHtml(winner.hand)}
      </div>
    `;
  }).join("");
  if (winnerMarkup !== lastWinnerSignature) {
    winnerList.innerHTML = winnerMarkup;
    if (winnerMarkup) {
      replayAnimation(winnerList, "winner-entering", 800);
      if (!document.hidden) tableSounds.win();
    }
    lastWinnerSignature = winnerMarkup;
  }

  renderControls(hero);
  if (!gameMenuModal.classList.contains("hidden")) {
    renderMenuPlayers();
    addBotBtn.classList.toggle("hidden", !state?.canAddBot);
  }
  requestAnimationFrame(() => restoreActionFeedScroll(feedScroll));
}

function captureActionFeedScroll() {
  const maxScrollTop = Math.max(0, players.scrollHeight - players.clientHeight);
  return {
    followBottom: maxScrollTop - players.scrollTop < 28,
    top: players.scrollTop,
  };
}

function restoreActionFeedScroll(snapshot) {
  if (!snapshot || players.scrollHeight <= players.clientHeight) return;
  const maxScrollTop = Math.max(0, players.scrollHeight - players.clientHeight);
  players.scrollTop = snapshot.followBottom ? maxScrollTop : Math.min(snapshot.top, maxScrollTop);
}

function scrollActionFeed() {
  const snapshot = captureActionFeedScroll();
  requestAnimationFrame(() => restoreActionFeedScroll(snapshot));
}

function renderControls(hero) {
  gameButtons.innerHTML = "";
  betControls.classList.add("hidden");
  raiseControlsDisabled = false;
  betPresets.innerHTML = "";
  turnInfo.textContent = "";
  turnInfo.classList.remove("your-turn");

  if (state.phase === "showdown") {
    turnInfo.textContent = "Cards down. Revealing the winner…";
    turnInfo.classList.add("showdown-message");
    return;
  }
  turnInfo.classList.remove("showdown-message");

  if (state.canAddBot) {
    addButton("+ Add CPU player", "room:addBot", "secondary lobby-add-bot");
  }
  if (state.canReady) {
    addButton(state.isReady ? "Not ready" : "Ready up", "game:ready", state.isReady ? "secondary" : "", keybindLabel(keybinds.ready));
  }
  if (state.canShowHand) {
    addButton("Show hand", "game:showCards", "secondary", keybindLabel(keybinds.showHand));
  }

  if (!state.isYourTurn || !hero) {
    if (["lobby", "complete"].includes(state.phase)) {
      const humans = state.players.filter((player) => !player.isBot && player.stack > 0);
      const readyCount = humans.filter((player) => player.ready).length;
      turnInfo.textContent = humans.length < 2 && state.players.filter((player) => player.stack > 0).length < 2
        ? "Invite a player or add a CPU to begin."
        : `${readyCount} of ${humans.length} players ready.`;
      return;
    }
    const currentIndex = findLastIndex(state.players, (player) => player.id === state.turn);
    const current = currentIndex >= 0 ? state.players[currentIndex] : null;
    turnInfo.textContent = current ? `Pot ${formatAmount(state.pot, state.potCents)}. ${current.name} is acting.` : "Waiting for the host.";
    if (hero && isBettingPhase(state.phase) && !hero.folded && !hero.allIn) {
      addActionButton("Fold", { type: "fold" }, "danger", true);
      addActionButton(state.toCall > 0 ? `Call ${formatAmount(state.toCall, state.toCallCents)}` : "Check", { type: state.toCall > 0 ? "call" : "check" }, "", true);
      configureRaiseControls(hero, true);
    }
    return;
  }

  turnInfo.textContent = state.toCall > 0
    ? `Pot ${formatAmount(state.pot, state.potCents)}. Call ${formatAmount(state.toCall, state.toCallCents)} to continue.`
    : `Pot ${formatAmount(state.pot, state.potCents)}. Your turn: check or bet.`;
  turnInfo.classList.add("your-turn");
  addActionButton("Fold", { type: "fold" }, "danger");
  addActionButton(state.toCall > 0 ? `Call ${formatAmount(state.toCall, state.toCallCents)}` : "Check", { type: state.toCall > 0 ? "call" : "check" });

  const maxRaise = hero.bet + hero.stack;
  if (state.canRaise && maxRaise > state.currentBet) {
    configureRaiseControls(hero);
  }
}

function configureRaiseControls(hero, disabled = false) {
  const maxRaise = hero.bet + hero.stack;
  if (maxRaise <= state.currentBet) return;
  betControls.classList.remove("hidden");
  const minRaise = Math.min(maxRaise, state.minRaiseTo);
  const preferredRaise = Math.max(minRaise, state.currentBet + state.bigBlind);
  raiseLabel.textContent = state.currentBet > 0 ? "Raise to" : "Bet amount";
  raiseControlsDisabled = disabled;
  setRaiseState({
    min: minRaise,
    max: maxRaise,
    step: state.bigBlind,
    value: Math.min(maxRaise, preferredRaise),
  });
  renderBetPresets(hero, disabled);
}

function renderBetPresets(hero, disabled) {
  const options = [
    { label: "½ pot", value: state.currentBet + Math.max(state.bigBlind, Math.round(state.pot / 2)) },
    { label: "Pot", value: state.currentBet + Math.max(state.bigBlind, state.pot) },
    { label: "All in", value: hero.bet + hero.stack },
  ];
  const unique = options.filter((option, index) => (
    options.findIndex((item) => clampRaise(item.value) === clampRaise(option.value)) === index
  ));
  betPresets.innerHTML = "";
  unique.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.disabled = disabled;
    button.addEventListener("click", () => setRaiseState({ value: option.value }));
    betPresets.appendChild(button);
  });
}

function setRaiseState(next) {
  raiseState = {
    ...raiseState,
    ...next,
  };
  raiseState.value = clampRaise(raiseState.value);
  const formattedAmount = formatAmount(raiseState.value, Math.round(raiseState.value * (state?.chipValueCents || 0)));
  raiseAmount.textContent = formattedAmount;
  setButtonLabel(raiseActionBtn, state?.currentBet > 0 ? "Raise" : "Bet", keybindLabel(keybinds.raise));
  raiseActionBtn.disabled = raiseControlsDisabled;
  raiseMinus.disabled = raiseControlsDisabled || raiseState.value <= raiseState.min;
  raisePlus.disabled = raiseControlsDisabled || raiseState.value >= raiseState.max;
}

function clampRaise(value) {
  return Math.min(raiseState.max, Math.max(raiseState.min, Math.floor(Number(value) || raiseState.min)));
}

function changeRaise(direction) {
  setRaiseState({ value: raiseState.value + direction * raiseState.step });
}

function setButtonLabel(button, label, shortcut = "") {
  button.innerHTML = `<span>${escapeHtml(label)}</span>${shortcut ? `<kbd aria-hidden="true">${escapeHtml(shortcut)}</kbd>` : ""}`;
  button.classList.toggle("has-shortcut", Boolean(shortcut));
  button.setAttribute("aria-label", shortcut ? `${label} (${shortcut})` : label);
}

function addButton(label, eventName, className = "", shortcut = "") {
  const button = document.createElement("button");
  if (className) button.className = className;
  setButtonLabel(button, label, shortcut);
  button.addEventListener("click", () => emitWithAck(eventName, {}));
  gameButtons.appendChild(button);
}

function addActionButton(label, payload, className = "", disabled = false) {
  const button = document.createElement("button");
  if (className) button.className = className;
  const shortcut = payload.type === "fold"
    ? keybindLabel(keybinds.fold)
    : ["check", "call"].includes(payload.type) ? keybindLabel(keybinds.call) : "";
  setButtonLabel(button, label, shortcut);
  button.disabled = disabled;
  button.addEventListener("click", () => emitWithAck("game:action", payload));
  gameButtons.appendChild(button);
}

function makeHost(playerId) {
  emitWithAck("room:makeHost", { playerId });
}

function kickPlayer(playerId) {
  emitWithAck("room:kick", { playerId });
}

async function copyText(text, button) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = "Copied";
  showToast("Copied to clipboard");
  setTimeout(() => { button.textContent = original; }, 1200);
}

function showSharePanel() {
  const link = inviteUrl();
  if (!link) return;
  shareLink.value = link;
  shareQr.src = `/qr.svg?text=${encodeURIComponent(link)}`;
  sharePanel.classList.toggle("hidden");
}

function emitWithAck(eventName, payload) {
  socket.timeout(4000).emit(eventName, payload, (error, response) => {
    if (error) {
      joinError.textContent = "Reconnecting to the table...";
      lastAutoRejoinKey = "";
      attemptAutoRejoin();
      return;
    }
    if (!response?.ok) {
      joinError.textContent = response?.error || "Action failed.";
      return;
    }
  });
}

function joinOrCreate(mode) {
  joinError.textContent = "";
  if (joinPending) return;
  if (!socket.connected) {
    joinError.textContent = "Connecting...";
    socket.once("connect", () => joinOrCreate(mode));
    return;
  }
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = "Enter a display name.";
    return;
  }
  localStorage.setItem("holdem:name", name);
  const roomId = roomInput.value.trim().toUpperCase();
  const eventName = mode === "join" ? "room:join" : "room:create";
  const credentials = roomCredentials(roomId);
  const payload = {
    name,
    roomId,
    deviceId: credentials?.playerId || getDeviceId(),
    reconnectToken: credentials?.reconnectToken,
  };
  if (mode !== "join") {
    payload.moneyMode = moneyModeInput.checked;
    payload.buyInCents = moneyCentsFromInput(buyInInput);
    if (payload.moneyMode) {
      payload.smallBlindCents = Math.round(Number(smallBlindInput.value) * 100);
      payload.bigBlindCents = Math.round(Number(bigBlindInput.value) * 100);
    } else {
      payload.smallBlind = Math.max(1, Math.floor(Number(smallBlindInput.value) || 10));
      payload.bigBlind = Math.max(2, Math.floor(Number(bigBlindInput.value) || 20));
    }
  }
  joinPending = true;
  tableActionBtn.textContent = mode === "join" ? "Joining..." : "Hosting...";
  updateTableActionLabel();
  socket.timeout(4000).emit(eventName, payload, (error, response) => {
    joinPending = false;
    updateTableActionLabel();
    if (error) {
      joinError.textContent = "Still connecting. Try again.";
      return;
    }
    if (!response?.ok) {
      joinError.textContent = response?.error || "Could not join table.";
      return;
    }
    lastAutoRejoinKey = `${socket.id}:${response.roomId || roomId}`;
    saveRoomCredentials(response.roomId || roomId, response);
    setRoomUrl(response.roomId || roomId);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

deviceTheme.addEventListener("change", (event) => applyTheme(event.matches ? "light" : "dark"));

document.addEventListener("pointerdown", () => tableSounds.unlock(), { once: true });
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button && !button.disabled) tableSounds.click();
});
soundEnabledInput.addEventListener("change", () => {
  tableSounds.setEnabled(soundEnabledInput.checked);
  if (soundEnabledInput.checked) {
    tableSounds.paper();
    showToast("Table sounds on");
  } else {
    showToast("Table sounds off");
  }
});
keybindList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-keybind-action]");
  if (button) beginKeybindRecording(button.dataset.keybindAction);
});
resetKeybindsBtn.addEventListener("click", () => {
  keybinds = { ...DEFAULT_KEYBINDS };
  recordingKeybindAction = "";
  saveKeybinds();
  renderKeybinds();
  if (state) renderControls(activeHero());
  showToast("Shortcuts reset");
});

roomInput.addEventListener("input", () => { roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
hostModeBtn.addEventListener("click", () => setTableMode("host"));
joinModeBtn.addEventListener("click", () => setTableMode("join", true));
moneyModeInput.addEventListener("change", () => {
  syncBlindInputMode();
  updateTableActionLabel();
});
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinOrCreate(tableMode === "join" ? "join" : "create");
});
syncBlindInputMode();
updateTableActionLabel();

joinForm.addEventListener("focusin", (event) => {
  if (event.target.matches("input")) {
    setKeyboardMode(true);
    setTimeout(() => {
      setViewportHeight();
      event.target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
  }
});

joinForm.addEventListener("focusout", () => {
  setTimeout(() => {
    if (!joinForm.contains(document.activeElement)) setKeyboardMode(false);
  }, 80);
});

raiseMinus.addEventListener("click", () => changeRaise(-1));
raisePlus.addEventListener("click", () => changeRaise(1));
raiseMinus.addEventListener("dblclick", (event) => event.preventDefault());
raisePlus.addEventListener("dblclick", (event) => event.preventDefault());
raiseActionBtn.addEventListener("click", () => {
  emitWithAck("game:action", { type: "raise", raiseTo: raiseState.value });
});

heroHand.addEventListener("click", () => {
  if (!heroHand.children.length) return;
  heroCardsHidden = !heroCardsHidden;
  updateHeroCardVisibility();
});

menuBtn.addEventListener("click", () => {
  showGameMenu();
});

roomCodeBtn.addEventListener("click", async () => {
  if (!state?.id) return;
  const inviteUrl = new URL(window.location.origin + window.location.pathname);
  inviteUrl.searchParams.set("room", state.id);
  await navigator.clipboard.writeText(inviteUrl.toString());
  showToast("Invite link copied");
});

closeMenuBtn.addEventListener("click", hideGameMenu);

addBotBtn.addEventListener("click", () => emitWithAck("room:addBot", {}));

gameMenuModal.addEventListener("click", (event) => {
  const feltButton = event.target.closest("button[data-felt]");
  if (feltButton) {
    applyTableAppearance(feltButton.dataset.felt, document.documentElement.dataset.deck, true);
    showToast(`${feltButton.textContent.trim()} felt selected`);
    return;
  }
  const deckButton = event.target.closest("button[data-deck]");
  if (deckButton) {
    applyTableAppearance(document.documentElement.dataset.felt, deckButton.dataset.deck, true);
    showToast(`${deckButton.textContent.trim()} deck selected`);
    return;
  }
  const hostButton = event.target.closest("[data-make-host]");
  if (hostButton) {
    makeHost(hostButton.dataset.makeHost);
    return;
  }
  const kickButton = event.target.closest("[data-kick-player]");
  if (kickButton) {
    kickPlayer(kickButton.dataset.kickPlayer);
    return;
  }
  if (event.target === gameMenuModal) hideGameMenu();
});

gameMenuModal.addEventListener("submit", (event) => {
  if (event.target === blindForm) {
    event.preventDefault();
    const payload = state?.moneyMode
      ? {
        smallBlindCents: Math.round(Number(menuSmallBlindInput.value) * 100),
        bigBlindCents: Math.round(Number(menuBigBlindInput.value) * 100),
      }
      : {
        smallBlind: Math.floor(Number(menuSmallBlindInput.value)),
        bigBlind: Math.floor(Number(menuBigBlindInput.value)),
      };
    emitWithAck("game:setBlinds", payload);
    return;
  }
  if (event.target === moneyPanel) {
    event.preventDefault();
    emitWithAck("money:cashIn", { amountCents: moneyCentsFromInput(cashInInput, state?.buyInCents ? state.buyInCents / 100 : 20) });
    return;
  }
  const nameForm = event.target.closest("[data-name-form]");
  if (!nameForm) return;
  event.preventDefault();
  const input = nameForm.querySelector("[data-player-name]");
  const name = input.value.trim();
  if (!name) return;
  nameInput.value = name;
  localStorage.setItem("holdem:name", name);
  input.blur();
  emitWithAck("player:setName", { name });
});

cashOutBtn.addEventListener("click", () => {
  emitWithAck("money:cashOut", {});
});

restartGameBtn.addEventListener("click", () => {
  hideGameMenu();
  emitWithAck("game:restart", {});
});

endGameBtn.addEventListener("click", () => {
  hideGameMenu();
  emitWithAck("game:end", {});
});

shareGameBtn.addEventListener("click", showSharePanel);
copyShareBtn.addEventListener("click", () => copyText(shareLink.value, copyShareBtn));

backToMenuBtn.addEventListener("click", () => {
  hideGameMenu();
  socket.emit("room:leave");
  showWelcome();
});

scoreMenuBtn.addEventListener("click", () => showWelcome());

socket.on("room:update", (room) => {
  if (leavingEndedRoom) return;
  if (isGameOver(room) || isEndedGameReturn(state, room)) {
    leavingEndedRoom = true;
    socket.emit("room:leave");
    showScoreScreen(room);
    return;
  }

  state = room;
  const self = state.players.find((player) => player.isYou && !player.isBot);
  if (self) {
    nameInput.value = self.name;
    localStorage.setItem("holdem:name", self.name);
  }
  joinError.textContent = "";
  render();
});

socket.on("room:kicked", () => {
  showWelcome("You were kicked from the table.");
});

function attemptAutoRejoin() {
  if (!state) return;
  const roomId = (state?.id || roomInput.value.trim()).toUpperCase();
  const name = nameInput.value.trim() || localStorage.getItem("holdem:name") || "Player";
  const rejoinKey = `${socket.id}:${roomId}`;
  if (socket.connected && roomId && rejoinKey !== lastAutoRejoinKey && !leavingEndedRoom) {
    lastAutoRejoinKey = rejoinKey;
    const credentials = roomCredentials(roomId);
    socket.emit("room:join", {
      roomId,
      name,
      deviceId: credentials?.playerId || getDeviceId(),
      reconnectToken: credentials?.reconnectToken,
    }, (response) => {
      if (!response?.ok) {
        lastAutoRejoinKey = "";
        joinError.textContent = response?.error || "Could not rejoin table.";
        return;
      }
      saveRoomCredentials(response.roomId || roomId, response);
      setRoomUrl(response.roomId || roomId);
    });
  }
}

function autoJoinInitialRoom() {
  if (didAutoJoinInitialRoom || !initialRoomParam || !nameInput.value.trim() || state) return;
  didAutoJoinInitialRoom = true;
  joinOrCreate("join");
}

socket.on("connect", () => {
  updateTableActionLabel();
  autoJoinInitialRoom();
  attemptAutoRejoin();
});
socket.on("disconnect", updateTableActionLabel);
autoJoinInitialRoom();
attemptAutoRejoin();

window.addEventListener("focus", attemptAutoRejoin);
function reportVisibility() {
  if (state && socket.connected) socket.emit("room:presence", { hidden: document.hidden });
  if (!document.hidden) attemptAutoRejoin();
}

document.addEventListener("visibilitychange", reportVisibility);
window.addEventListener("pagehide", () => {
  if (state && socket.connected) socket.emit("room:presence", { hidden: true });
});
window.addEventListener("pageshow", () => {
  setViewportHeight();
  reportVisibility();
});

window.addEventListener("resize", () => {
  setViewportHeight();
  requestAnimationFrame(() => scrollActionFeed());
});

window.visualViewport?.addEventListener("resize", () => {
  setViewportHeight();
  requestAnimationFrame(() => scrollActionFeed());
});

document.addEventListener("touchstart", (event) => {
  previousGameTouchY = event.touches[0]?.clientY ?? null;
}, { passive: true });
document.addEventListener("touchmove", lockMobileGameOverscroll, { passive: false });
document.addEventListener("touchend", () => { previousGameTouchY = null; }, { passive: true });
document.addEventListener("touchcancel", () => { previousGameTouchY = null; }, { passive: true });

setViewportHeight();

document.addEventListener("keydown", (event) => {
  if (recordingKeybindAction) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      cancelKeybindRecording();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || ["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key)) {
      showToast("Choose a single non-modifier key");
      return;
    }
    const nextKey = normalizedKey(event.key);
    if (!nextKey || ["Dead", "Unidentified"].includes(nextKey)) {
      showToast("That key is not available");
      return;
    }
    assignKeybind(recordingKeybindAction, nextKey);
    return;
  }
  if (event.key === "Escape" && !gameMenuModal.classList.contains("hidden")) {
    hideGameMenu();
    return;
  }
  if (!state || !gameMenuModal.classList.contains("hidden") || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.matches("input, select, textarea, button, [contenteditable]")) return;
  if (matchesKeybind(event, "menu")) {
    showGameMenu();
    return;
  }
  if (matchesKeybind(event, "ready") && state.canReady) {
    event.preventDefault();
    if (!event.repeat) emitWithAck("game:ready", {});
    return;
  }
  if (matchesKeybind(event, "showHand") && state.canShowHand) {
    if (!event.repeat) emitWithAck("game:showCards", {});
    return;
  }
  if (!state.isYourTurn) return;
  if ((matchesKeybind(event, "raiseUp") || matchesKeybind(event, "raiseDown")) && !betControls.classList.contains("hidden")) {
    event.preventDefault();
    changeRaise(matchesKeybind(event, "raiseUp") ? 1 : -1);
    return;
  }
  if (event.repeat) return;
  if (matchesKeybind(event, "fold")) emitWithAck("game:action", { type: "fold" });
  if (matchesKeybind(event, "call")) emitWithAck("game:action", { type: state.toCall > 0 ? "call" : "check" });
  if (matchesKeybind(event, "raise") && !betControls.classList.contains("hidden")) raiseActionBtn.click();
});
