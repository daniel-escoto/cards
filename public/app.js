const socket = io();

const welcome = document.querySelector("#welcome");
const tableView = document.querySelector("#tableView");
const scoreView = document.querySelector("#scoreView");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const computerPlayerCount = document.querySelector("#computerPlayerCount");
const tableSizeLabel = computerPlayerCount.closest("label");
const tableActionBtn = document.querySelector("#tableActionBtn");
const joinError = document.querySelector("#joinError");
const roomCode = document.querySelector("#roomCode");
const menuBtn = document.querySelector("#menuBtn");
const gameMenuModal = document.querySelector("#gameMenuModal");
const closeMenuBtn = document.querySelector("#closeMenuBtn");
const restartGameBtn = document.querySelector("#restartGameBtn");
const endGameBtn = document.querySelector("#endGameBtn");
const shareGameBtn = document.querySelector("#shareGameBtn");
const backToMenuBtn = document.querySelector("#backToMenuBtn");
const menuRoomCode = document.querySelector("#menuRoomCode");
const menuPlayers = document.querySelector("#menuPlayers");
const sharePanel = document.querySelector("#sharePanel");
const shareQr = document.querySelector("#shareQr");
const shareLink = document.querySelector("#shareLink");
const copyShareBtn = document.querySelector("#copyShareBtn");
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
const scoreList = document.querySelector("#scoreList");
const scoreMenuBtn = document.querySelector("#scoreMenuBtn");

let state = null;
let raiseState = { value: 0, min: 0, max: 0, step: 20 };
let hasRenderedRoom = false;
let leavingEndedRoom = false;
let menuTimer = null;
let lastAutoRejoinKey = "";
let lastActionFeedSignature = "";
const params = new URLSearchParams(window.location.search);
const initialRoomParam = (params.get("room") || "").toUpperCase();
const initialRoomId = (initialRoomParam || localStorage.getItem("holdem:lastRoom") || "").toUpperCase();
if (initialRoomId) roomInput.value = initialRoomId;
nameInput.value = localStorage.getItem("holdem:name") || "";
let joinPending = false;
let didAutoJoinInitialRoom = false;

function getDeviceId() {
  let deviceId = localStorage.getItem("holdem:deviceId");
  if (!deviceId) {
    deviceId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("holdem:deviceId", deviceId);
  }
  return deviceId;
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
  const isJoining = Boolean(roomInput.value.trim());
  if (!joinPending) tableActionBtn.textContent = isJoining ? "Join table" : "Host table";
  tableActionBtn.disabled = joinPending || !socket.connected;
  tableSizeLabel.classList.toggle("hidden", isJoining);
}

function cardTemplate(card) {
  if (!card) return '<div class="card back"><span></span><span></span></div>';
  const cardName = `${card.rank}${card.suit}`;
  return `
    <div class="card ${card.color === "red" ? "red" : ""}" aria-label="${escapeHtml(cardName)}">
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
  restartGameBtn.classList.toggle("hidden", !state.canRestartGame);
  endGameBtn.classList.toggle("hidden", !state.canEndGame);
  menuPlayers.innerHTML = state.players.map((player) => `
    <article class="menu-player ${player.isYou ? "you" : ""} ${player.folded ? "folded" : ""}" ${playerColorStyle(player)}>
      <div class="menu-player-head">
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
        <span class="seat-badges">
          ${player.dealer ? '<span class="pill">D</span>' : ""}
          ${player.isHost ? '<span class="pill">Host</span>' : ""}
          ${player.isBot ? '<span class="pill">CPU</span>' : ""}
        </span>
      </div>
      <div class="menu-player-stats">
        <span>Stack <strong>${player.stack}</strong></span>
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
      ${player.isYou && !player.isBot ? `
        <div class="color-swatches" aria-label="Player color">
          ${(state.playerColors || []).map((color) => `
            <button
              type="button"
              class="color-swatch ${player.color === color ? "selected" : ""}"
              style="--swatch-color: ${escapeHtml(color)}"
              data-player-color="${escapeHtml(color)}"
              aria-label="Choose ${escapeHtml(color)}"
              aria-pressed="${player.color === color ? "true" : "false"}"
            ></button>
          `).join("")}
        </div>
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
  clearInterval(menuTimer);
  menuTimer = setInterval(renderMenuPlayers, 1000);
  gameMenuModal.classList.remove("hidden");
}

function showWelcome(status = "") {
  state = null;
  hasRenderedRoom = false;
  lastActionFeedSignature = "";
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
  const standings = [...room.players].sort((a, b) => b.stack - a.stack || a.name.localeCompare(b.name));
  state = null;
  hasRenderedRoom = false;
  lastActionFeedSignature = "";
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
      <strong>${player.stack}</strong>
    </div>
  `).join("");
  clearRoomUrl();
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

function compactStreetLabel(phase) {
  const labels = {
    preflop: "PF",
    flop: "F",
    turn: "T",
    river: "R",
  };
  return labels[phase] || "";
}

function compactPlayerAction(entry, player) {
  const raw = entry.action || entry.text || "";
  const withoutName = player
    ? raw.replace(new RegExp(`^${escapeRegExp(player.name)}\\s+`, "i"), "").replace(/\.$/, "")
    : raw.replace(/\.$/, "");
  return withoutName
    .replace(/^Posts small blind\s+/i, "SB ")
    .replace(/^Posts big blind\s+/i, "BB ")
    .replace(/^Calls\s+/i, "call ")
    .replace(/^Checks$/i, "check")
    .replace(/^Folds$/i, "fold")
    .replace(/^Raises to\s+/i, "raise ")
    .replace(/^Wins\s+/i, "+");
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

function renderSeatCard(player, isActiveTurn = player.isTurn) {
  const status = playerTableStatus(player, isActiveTurn);
  return `
    <article class="action-feed-card state-card ${isActiveTurn ? "turn" : ""} ${player.folded ? "folded" : ""} ${player.isYou ? "you" : ""}" ${playerColorStyle(player)}>
      <div class="state-card-grid">
        <span class="state-card-spacer"></span>
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
        <span class="seat-badges">
          ${player.dealer ? '<span class="pill">D</span>' : ""}
          ${player.isHost ? '<span class="pill">Host</span>' : ""}
          ${player.isBot ? '<span class="pill">CPU</span>' : ""}
        </span>
        <span class="state-stack">Stack <strong>${player.stack}</strong></span>
        <span class="state-pot">${player.invested ? `Pot <strong>${player.invested}</strong>` : ""}</span>
        <em class="state-status">${status}</em>
      </div>
    </article>
  `;
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
        <span>Stack <strong>${player.stack}</strong></span>
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

function renderActionFeed() {
  const entries = (state.actionLog || []).filter((entry) => entry.phase !== "lobby");
  const activePlayer = currentTurnPlayer();
  const activeSeatIndex = findLastIndex(state.players, (player) => player.id === activePlayer?.id);
  const seatMarkup = () => state.players.map((player, index) => renderSeatCard(player, index === activeSeatIndex)).join("");
  if (!entries.length) {
    return seatMarkup();
  }

  let lastPhase = "";
  const historyMarkup = entries.map((entry) => {
    const player = playerForAction(entry);
    const phase = entry.phase || "preflop";
    const showPhase = phase !== lastPhase;
    lastPhase = phase;
    return `
      <article class="action-feed-card action-history-card ${player?.folded ? "folded" : ""} ${player?.isYou ? "you" : ""}" ${playerColorStyle(player)}>
        <div class="action-card-move">
          <em>${showPhase && compactStreetLabel(phase) ? escapeHtml(compactStreetLabel(phase)) : ""}</em>
          <span class="seat-name">${escapeHtml(player?.name || "Table")}${player?.isYou ? " (you)" : ""}</span>
          <strong class="action-token${actionTokenClass(entry, player)}">${escapeHtml(compactPlayerAction(entry, player))}</strong>
          ${player ? `<span class="stack-chip">${player.stack}</span>` : ""}
        </div>
      </article>
    `;
  }).join("");
  const shownHands = state.phase === "complete"
    ? state.players.filter((player) => player.showCards).map(renderShownHandCard).join("")
    : "";
  const markup = `${historyMarkup}${shownHands}${activePlayer ? renderSeatCard(activePlayer, true) : ""}`.trim();
  return markup || seatMarkup();
}

function actionFeedSignature(room) {
  const log = (room.actionLog || [])
    .filter((entry) => entry.phase !== "lobby")
    .map((entry) => `${entry.id}:${entry.playerId || ""}:${entry.phase || ""}:${entry.action || entry.text || ""}`)
    .join("|");
  const seats = room.players
    .map((player) => [
      player.id,
      player.stack,
      player.bet,
      player.invested,
      player.folded,
      player.allIn,
      player.showCards,
      player.cards?.map((card) => card?.code || "").join(",") || "",
    ].join(":"))
    .join("|");
  return `${room.handNumber}:${room.phase}:${room.turn}:${log}:${seats}`;
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
  potValue.textContent = state.pot;
  community.innerHTML = Array.from({ length: 5 }, (_, index) => cardTemplate(state.community[index] || null)).join("");

  const actionEntries = (state.actionLog || []).filter((entry) => entry.phase !== "lobby");
  const nextFeedSignature = actionFeedSignature(state);
  players.innerHTML = renderActionFeed();
  lastActionFeedSignature = nextFeedSignature;

  const hero = activeHero();
  heroHand.innerHTML = hero?.cards?.length ? hero.cards.map(cardTemplate).join("") : "";
  winnerList.innerHTML = state.winners.map((winner) => {
    const winnerPlayer = state.players.find((player) => player.id === winner.playerId || player.name === winner.name);
    return `
      <div ${playerColorStyle(winnerPlayer)}>
        <span class="seat-name">${escapeHtml(winner.name)}</span> wins ${winner.amount} with ${escapeHtml(winner.hand)}
      </div>
    `;
  }).join("");

  renderControls(hero);
  if (!gameMenuModal.classList.contains("hidden")) renderMenuPlayers();
  requestAnimationFrame(() => scrollActionFeed());
}

function scrollActionFeed() {
  if (players.scrollHeight <= players.clientHeight) return;
  players.scrollTo({ top: players.scrollHeight, behavior: hasRenderedRoom ? "smooth" : "auto" });
}

function renderControls(hero) {
  gameButtons.innerHTML = "";
  betControls.classList.add("hidden");
  raiseBtn.disabled = false;
  turnInfo.textContent = "";

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
    const currentIndex = findLastIndex(state.players, (player) => player.id === state.turn);
    const current = currentIndex >= 0 ? state.players[currentIndex] : null;
    turnInfo.textContent = current ? `Pot ${state.pot}. ${current.name} is acting.` : "Waiting for the host.";
    if (hero && isBettingPhase(state.phase) && !hero.folded && !hero.allIn) {
      addActionButton("Fold", { type: "fold" }, "danger", true);
      addActionButton(state.toCall > 0 ? `Call ${state.toCall}` : "Check", { type: state.toCall > 0 ? "call" : "check" }, "", true);
      configureRaiseControls(hero, true);
    }
    return;
  }

  turnInfo.textContent = state.toCall > 0
    ? `Pot ${state.pot}. Call ${state.toCall} to continue.`
    : `Pot ${state.pot}. Your turn: check or bet.`;
  addActionButton("Fold", { type: "fold" }, "danger");
  addActionButton(state.toCall > 0 ? `Call ${state.toCall}` : "Check", { type: state.toCall > 0 ? "call" : "check" });

  const maxRaise = hero.bet + hero.stack;
  if (maxRaise > state.currentBet) {
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
  if (disabled) {
    raiseMinus.disabled = true;
    raisePlus.disabled = true;
    raiseBtn.disabled = true;
  }
}

function setRaiseState(next) {
  raiseState = {
    ...raiseState,
    ...next,
  };
  raiseState.value = clampRaise(raiseState.value);
  raiseAmount.textContent = raiseState.value;
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
  const selectedTableSize = Math.max(2, Math.min(8, Math.floor(Number(computerPlayerCount.value) || 2)));
  const payload = { name, roomId, deviceId: getDeviceId() };
  if (mode !== "join") {
    payload.tableSize = selectedTableSize;
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

roomInput.addEventListener("input", updateTableActionLabel);
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinOrCreate(roomInput.value.trim() ? "join" : "create");
});
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

closeMenuBtn.addEventListener("click", hideGameMenu);

gameMenuModal.addEventListener("click", (event) => {
  const colorButton = event.target.closest("[data-player-color]");
  if (colorButton) {
    emitWithAck("player:setColor", { color: colorButton.dataset.playerColor });
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
  hasRenderedRoom = true;
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
    socket.emit("room:join", { roomId, name, deviceId: getDeviceId() }, (response) => {
      if (!response?.ok) {
        lastAutoRejoinKey = "";
        joinError.textContent = response?.error || "Could not rejoin table.";
        return;
      }
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
