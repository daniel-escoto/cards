const socket = io();

const welcome = document.querySelector("#welcome");
const themeToggle = document.querySelector("#themeToggle");
const themeIcon = document.querySelector("#themeIcon");
const themeLabel = document.querySelector("#themeLabel");
const themeToggles = document.querySelectorAll("#themeToggle, [data-theme-toggle]");
const tableView = document.querySelector("#tableView");
const scoreView = document.querySelector("#scoreView");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const roomCodeLabel = document.querySelector("#roomCodeLabel");
const hostModeBtn = document.querySelector("#hostModeBtn");
const joinModeBtn = document.querySelector("#joinModeBtn");
const formHint = document.querySelector("#formHint");
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
const phaseBadge = document.querySelector("#phaseBadge");
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
const sharePanel = document.querySelector("#sharePanel");
const shareQr = document.querySelector("#shareQr");
const shareLink = document.querySelector("#shareLink");
const copyShareBtn = document.querySelector("#copyShareBtn");
const moneyPanel = document.querySelector("#moneyPanel");
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
const raiseBtn = document.querySelector("#raiseBtn");
const betPresets = document.querySelector("#betPresets");
const scoreList = document.querySelector("#scoreList");
const scoreMenuBtn = document.querySelector("#scoreMenuBtn");
const toast = document.querySelector("#toast");

let state = null;
let raiseState = { value: 0, min: 0, max: 0, step: 20 };
let leavingEndedRoom = false;
let menuTimer = null;
let lastAutoRejoinKey = "";
let lastActionEntryId = "";
let lastCommunitySignature = null;
let lastHeroSignature = "";
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
  { id: "classic", label: "Classic" },
  { id: "midnight", label: "Midnight" },
  { id: "ruby", label: "Ruby" },
  { id: "minimal", label: "Minimal" },
];

function preferredTheme() {
  const saved = localStorage.getItem("holdem:theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme, persist = false) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  const nextLabel = nextTheme === "dark" ? "Light" : "Dark";
  themeIcon.textContent = nextTheme === "dark" ? "☀" : "☾";
  themeLabel.textContent = nextLabel;
  themeToggle.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()} mode`);
  themeToggles.forEach((button) => {
    button.querySelector("[data-theme-icon]")?.replaceChildren(nextTheme === "dark" ? "☀" : "☾");
    button.querySelector("[data-theme-label]")?.replaceChildren(nextLabel);
    button.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()} mode`);
  });
  if (persist) localStorage.setItem("holdem:theme", nextTheme);
}

applyTheme(preferredTheme());

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
    <button type="button" class="appearance-choice deck-choice ${document.documentElement.dataset.deck === option.id ? "selected" : ""}" data-deck="${option.id}" aria-pressed="${document.documentElement.dataset.deck === option.id}">
      <i class="deck-preview" aria-hidden="true"></i><span>${option.label}</span>
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

function setGameViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--game-vh", `${Math.floor(height)}px`);
}

function setKeyboardMode(isOpen) {
  document.body.classList.toggle("keyboard-open", isOpen && !welcome.classList.contains("hidden"));
  if (isOpen) window.scrollTo(0, 0);
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
  formHint.textContent = isJoining
    ? "Enter the six-character code from your host."
    : "Invite friends or add CPU players from the table menu.";
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

function phaseLabel(phase) {
  const labels = {
    lobby: "Lobby",
    preflop: "Preflop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    showdown: "Showdown",
    complete: "Hand complete",
    gameover: "Game over",
  };
  return labels[phase] || phase;
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
  setGameViewportHeight();
  document.documentElement.classList.add("game-open-root");
  document.body.classList.add("game-open");
  document.body.classList.remove("keyboard-open");
  welcome.classList.add("hidden");
  scoreView.classList.add("hidden");
  tableView.classList.remove("hidden");
  setRoomUrl(room.id);
}

function hideGameMenu() {
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
  if (["lobby", "complete"].includes(state?.phase)) return player.connected ? "Seated" : "Away";
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
        <em>${escapeHtml(roundStatus(player))}</em>
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
  const status = roundStatus(player);
  return `
    <article class="action-feed-card shown-hand-card ${player.isYou ? "you" : ""}" ${playerColorStyle(player)}>
      <div class="action-card-head">
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
        <span class="pill">Shown</span>
      </div>
      <div class="shown-hand">${player.cards.map(cardTemplate).join("")}</div>
      <div class="action-card-stats">
        <span>${state.moneyMode ? "Bankroll" : "Stack"} <strong>${playerStackLabel(player)}</strong></span>
        <em>${escapeHtml(status)}</em>
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
    const action = entry ? compactPlayerAction(entry, player) : playerTableStatus(player, isActing);
    return `
      <article class="table-player-row ${isActing ? "turn" : ""} ${player.folded ? "folded" : ""} ${player.isYou ? "you" : ""} ${entry?.id === newEntryId ? "new-action" : ""}" ${playerColorStyle(player)}>
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

function render() {
  if (!state) return;
  showTable(state);
  roomCode.textContent = state.id;
  phaseBadge.textContent = phaseLabel(state.phase);
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
    community.innerHTML = state.phase === "lobby"
      ? ""
      : Array.from({ length: 5 }, (_, index) => {
        const card = state.community[index] || null;
        const cardCode = card?.code || `${card?.rank || ""}${card?.suit || ""}`;
        const isNewCard = isInitialBoard || Boolean(card && previousCommunity[index] !== cardCode);
        return cardTemplate(card, isNewCard ? "card-entering" : "");
      }).join("");
    lastCommunitySignature = communitySignature;
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
  lastActionEntryId = latestEntryId;

  const hero = activeHero();
  const heroSignature = hero?.cards?.map((card) => card?.code || `${card?.rank || ""}${card?.suit || ""}`).join("|") || "";
  if (heroSignature !== lastHeroSignature) {
    heroHand.innerHTML = hero?.cards?.length ? hero.cards.map(cardTemplate).join("") : "";
    replayAnimation(heroHand, "cards-entering", 720);
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
  raiseBtn.disabled = false;
  turnInfo.textContent = "";
  turnInfo.classList.remove("your-turn");
  betPresets.innerHTML = "";

  if (state.phase === "showdown") {
    turnInfo.textContent = "Cards down. Revealing the winner…";
    turnInfo.classList.add("showdown-message");
    return;
  }
  turnInfo.classList.remove("showdown-message");

  if (state.canStart && state.phase !== "complete") {
    addButton("Start game", "game:start");
  }
  if (state.canNextHand) {
    addButton("Next hand", "game:next");
  }
  if (state.canShowHand) {
    addButton("Show hand", "game:showCards", "secondary");
  }

  if (!state.isYourTurn || !hero) {
    if (state.phase === "lobby") {
      turnInfo.textContent = state.canStart ? "Ready to deal." : "Waiting for the host to start.";
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
  setRaiseState({
    min: minRaise,
    max: maxRaise,
    step: state.bigBlind,
    value: Math.min(maxRaise, preferredRaise),
  });
  const isRaise = state.currentBet > 0;
  raiseLabel.textContent = isRaise ? "Raise to" : "Bet";
  raiseBtn.textContent = isRaise ? "Raise" : "Bet";
  renderBetPresets(hero, disabled);
  if (disabled) {
    raiseMinus.disabled = true;
    raisePlus.disabled = true;
    raiseBtn.disabled = true;
  }
}

function renderBetPresets(hero, disabled) {
  const options = [
    { label: "½ pot", value: state.currentBet + Math.max(state.bigBlind, Math.round(state.pot / 2)) },
    { label: "Pot", value: state.currentBet + Math.max(state.bigBlind, state.pot) },
    { label: "All in", value: hero.bet + hero.stack },
  ];
  const unique = options.filter((option, index) => options.findIndex((item) => clampRaise(item.value) === clampRaise(option.value)) === index);
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
  raiseAmount.textContent = formatAmount(raiseState.value, Math.round(raiseState.value * (state?.chipValueCents || 0)));
  raiseMinus.disabled = raiseState.value <= raiseState.min;
  raisePlus.disabled = raiseState.value >= raiseState.max;
}

function clampRaise(value) {
  return Math.min(raiseState.max, Math.max(raiseState.min, Math.floor(Number(value) || raiseState.min)));
}

function changeRaise(direction) {
  setRaiseState({ value: raiseState.value + direction * raiseState.step });
}

function addButton(label, eventName, className = "") {
  const button = document.createElement("button");
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", () => emitWithAck(eventName, {}));
  gameButtons.appendChild(button);
}

function addActionButton(label, payload, className = "", disabled = false) {
  const button = document.createElement("button");
  button.textContent = label;
  if (className) button.className = className;
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

themeToggles.forEach((button) => button.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
}));

window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (event) => {
  if (!localStorage.getItem("holdem:theme")) applyTheme(event.matches ? "light" : "dark");
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
  if (event.target.matches("input")) setKeyboardMode(true);
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

raiseBtn.addEventListener("click", () => {
  emitWithAck("game:action", { type: "raise", raiseTo: raiseState.value });
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
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) attemptAutoRejoin();
});

window.addEventListener("resize", () => {
  if (document.body.classList.contains("game-open")) setGameViewportHeight();
  requestAnimationFrame(() => scrollActionFeed());
});

window.visualViewport?.addEventListener("resize", () => {
  if (document.body.classList.contains("game-open")) setGameViewportHeight();
  requestAnimationFrame(() => scrollActionFeed());
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !gameMenuModal.classList.contains("hidden")) {
    hideGameMenu();
    return;
  }
  if (!state || !gameMenuModal.classList.contains("hidden") || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.matches("input, select, textarea")) return;
  if (event.key.toLowerCase() === "m") showGameMenu();
  if (!state.isYourTurn) return;
  const key = event.key.toLowerCase();
  if (key === "f") emitWithAck("game:action", { type: "fold" });
  if (key === "c") emitWithAck("game:action", { type: state.toCall > 0 ? "call" : "check" });
  if (key === "r" && !betControls.classList.contains("hidden")) raiseBtn.click();
});
