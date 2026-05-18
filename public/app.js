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
const phaseTitle = document.querySelector("#phaseTitle");
const potValue = document.querySelector("#potValue");
const betValue = document.querySelector("#betValue");
const community = document.querySelector("#community");
const message = document.querySelector("#message");
const players = document.querySelector("#players");
const heroHand = document.querySelector("#heroHand");
const winnerList = document.querySelector("#winnerList");
const turnInfo = document.querySelector("#turnInfo");
const gameButtons = document.querySelector("#gameButtons");
const betControls = document.querySelector("#betControls");
const raiseMinus = document.querySelector("#raiseMinus");
const raisePlus = document.querySelector("#raisePlus");
const raiseAmount = document.querySelector("#raiseAmount");
const raiseBtn = document.querySelector("#raiseBtn");
const scoreList = document.querySelector("#scoreList");
const scoreMenuBtn = document.querySelector("#scoreMenuBtn");

let state = null;
let raiseState = { value: 0, min: 0, max: 0, step: 20 };
let audioContext = null;
let hasRenderedRoom = false;
let leavingEndedRoom = false;
let menuTimer = null;
let lastAutoRejoinKey = "";
const params = new URLSearchParams(window.location.search);
const initialRoomId = (params.get("room") || localStorage.getItem("holdem:lastRoom") || "").toUpperCase();
if (initialRoomId) roomInput.value = initialRoomId;
nameInput.value = localStorage.getItem("holdem:name") || "";

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
  tableActionBtn.textContent = isJoining ? "Join table" : "Host table";
  tableSizeLabel.classList.toggle("hidden", isJoining);
}

function cardImageUrl(card) {
  const suitCodes = {
    "♣": "C",
    "♦": "D",
    "♥": "H",
    "♠": "S",
  };
  const rankCodes = {
    A: "A",
    J: "J",
    Q: "Q",
    K: "K",
    10: "0",
  };
  const suit = suitCodes[card.suit];
  const rank = rankCodes[card.rank] || card.rank;
  return suit && rank ? `https://deckofcardsapi.com/static/img/${rank}${suit}.png` : "";
}

function cardTemplate(card) {
  if (!card) return '<div class="card back"><span></span><span></span></div>';
  const imageUrl = cardImageUrl(card);
  const cardName = `${card.rank}${card.suit}`;
  return `
    <div class="card ${card.color === "red" ? "red" : ""}">
      ${imageUrl ? `<img class="card-image" src="${imageUrl}" alt="${escapeHtml(cardName)}" loading="eager" draggable="false" />` : ""}
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
        <span>Bet <strong>${player.bet}</strong></span>
        <span>In pot <strong>${player.invested}</strong></span>
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
      ${player.canMakeHost ? `
        <div class="menu-player-actions">
          <button type="button" class="secondary" data-make-host="${escapeHtml(player.id)}">Make host</button>
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
  hideGameMenu();
  document.documentElement.classList.remove("game-open-root");
  document.body.classList.remove("game-open", "keyboard-open");
  welcome.classList.add("hidden");
  tableView.classList.add("hidden");
  scoreView.classList.remove("hidden");
  scoreList.innerHTML = standings.map((player, index) => `
    <div class="score-row ${player.isYou ? "you" : ""}">
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

function audioNow() {
  return audioContext?.currentTime || 0;
}

function ensureAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone({ frequency, duration = 0.08, type = "sine", gain = 0.055, delay = 0 }) {
  const context = ensureAudio();
  if (!context) return;

  const start = audioNow() + delay;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playNoise({ duration = 0.08, gain = 0.04, delay = 0, filterFrequency = 1200 }) {
  const context = ensureAudio();
  if (!context) return;

  const start = audioNow() + delay;
  const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    output[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFrequency, start);
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(context.destination);
  source.start(start);
}

function playSound(name) {
  if (document.hidden) return;

  const sounds = {
    click: () => playTone({ frequency: 420, duration: 0.045, type: "triangle", gain: 0.035 }),
    tick: () => playTone({ frequency: 620, duration: 0.035, type: "triangle", gain: 0.025 }),
    deal: () => {
      playNoise({ duration: 0.055, gain: 0.035, filterFrequency: 1800 });
      playNoise({ duration: 0.055, gain: 0.03, delay: 0.055, filterFrequency: 2100 });
    },
    fold: () => playTone({ frequency: 180, duration: 0.12, type: "sawtooth", gain: 0.035 }),
    check: () => playTone({ frequency: 360, duration: 0.07, type: "triangle", gain: 0.035 }),
    call: () => {
      playTone({ frequency: 300, duration: 0.055, type: "square", gain: 0.025 });
      playTone({ frequency: 460, duration: 0.055, type: "square", gain: 0.025, delay: 0.045 });
    },
    raise: () => {
      playTone({ frequency: 420, duration: 0.06, type: "triangle", gain: 0.032 });
      playTone({ frequency: 640, duration: 0.075, type: "triangle", gain: 0.038, delay: 0.055 });
    },
    turn: () => {
      playTone({ frequency: 760, duration: 0.08, type: "sine", gain: 0.035 });
      playTone({ frequency: 980, duration: 0.08, type: "sine", gain: 0.032, delay: 0.07 });
    },
    win: () => {
      playTone({ frequency: 523.25, duration: 0.09, type: "triangle", gain: 0.036 });
      playTone({ frequency: 659.25, duration: 0.09, type: "triangle", gain: 0.036, delay: 0.08 });
      playTone({ frequency: 783.99, duration: 0.13, type: "triangle", gain: 0.04, delay: 0.16 });
    },
  };

  sounds[name]?.();
}

function communitySignature(room) {
  return room.community.map((card) => card.code).join(",");
}

function winnerSignature(room) {
  return room.winners.map((winner) => `${winner.playerId}:${winner.amount}:${winner.hand}`).join("|");
}

function streetLabel(phase) {
  const labels = {
    lobby: "Lobby",
    preflop: "Preflop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    showdown: "Showdown",
    complete: "Result",
  };
  return labels[phase] || phaseLabel(phase);
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

function groupActionLog(entries) {
  const ordered = ["preflop", "flop", "turn", "river", "showdown", "complete", "lobby"];
  const groups = new Map();
  for (const entry of entries) {
    const phase = entry.phase || "preflop";
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push(entry);
  }
  return [...groups.entries()].sort((a, b) => {
    const left = ordered.indexOf(a[0]);
    const right = ordered.indexOf(b[0]);
    return (left < 0 ? ordered.length : left) - (right < 0 ? ordered.length : right);
  });
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
      <div class="action-card-head">
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
        <span class="seat-badges">
          ${player.dealer ? '<span class="pill">D</span>' : ""}
          ${player.isHost ? '<span class="pill">Host</span>' : ""}
          ${player.isBot ? '<span class="pill">CPU</span>' : ""}
        </span>
      </div>
      <div class="action-card-stats">
        <span>Stack <strong>${player.stack}</strong></span>
        <span>In pot <strong>${player.invested}</strong></span>
        <em>${status}</em>
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
        <span>In pot <strong>${player.invested}</strong></span>
        <em>${escapeHtml(status)}</em>
      </div>
    </article>
  `;
}

function currentTurnPlayer() {
  const index = findLastIndex(state.players, (player) => player.id === state.turn);
  return index >= 0 ? state.players[index] : null;
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
    const phaseDivider = phase !== lastPhase
      ? `<div class="street-divider">${escapeHtml(streetLabel(phase))}</div>`
      : "";
    lastPhase = phase;
    return `
      ${phaseDivider}
      <article class="action-feed-card action-history-card ${player?.folded ? "folded" : ""} ${player?.isYou ? "you" : ""}" ${playerColorStyle(player)}>
        <div class="action-card-head">
          <span class="seat-name">${escapeHtml(player?.name || "Table")}${player?.isYou ? " (you)" : ""}</span>
          <span class="seat-badges">
            ${player?.dealer ? '<span class="pill">D</span>' : ""}
            ${player?.isHost ? '<span class="pill">Host</span>' : ""}
            ${player?.isBot ? '<span class="pill">CPU</span>' : ""}
          </span>
        </div>
        <div class="action-card-move">
          ${compactStreetLabel(phase) ? `<em>${escapeHtml(compactStreetLabel(phase))}</em>` : ""}
          <strong>${escapeHtml(compactPlayerAction(entry, player))}</strong>
        </div>
        ${player ? `
          <div class="action-card-stats">
            <span>Stack <strong>${player.stack}</strong></span>
            <span>In pot <strong>${player.invested}</strong></span>
            <em>${playerTableStatus(player, false)}</em>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
  const shownHands = state.phase === "complete"
    ? state.players.filter((player) => player.showCards).map(renderShownHandCard).join("")
    : "";
  const markup = `${historyMarkup}${shownHands}${activePlayer ? renderSeatCard(activePlayer, true) : ""}`.trim();
  return markup || seatMarkup();
}

function inferActionSound(previous, next) {
  if (!previous || previous.id !== next.id || previous.handNumber !== next.handNumber) return null;
  const actingPlayer = previous.players.find((player) => player.isTurn);
  if (!actingPlayer) return null;

  const nextPlayer = next.players.find((player) => player.id === actingPlayer.id);
  if (!nextPlayer) return null;
  if (!actingPlayer.folded && nextPlayer.folded) return "fold";
  if (nextPlayer.bet > actingPlayer.bet && next.currentBet > previous.currentBet) return "raise";
  if (nextPlayer.bet > actingPlayer.bet || nextPlayer.invested > actingPlayer.invested) return "call";
  if (next.turn !== previous.turn || next.phase !== previous.phase) return "check";
  return null;
}

function playRoomSounds(previous, next) {
  if (!hasRenderedRoom || !previous) return;

  if (next.handNumber > previous.handNumber && next.phase === "preflop") {
    playSound("deal");
  }

  const actionSound = inferActionSound(previous, next);
  if (actionSound) playSound(actionSound);

  if (communitySignature(previous) !== communitySignature(next) && next.community.length > previous.community.length) {
    playSound("deal");
  }

  if (!previous.isYourTurn && next.isYourTurn) {
    playSound("turn");
  }

  if (previous.phase !== "complete" && next.phase === "complete" && winnerSignature(next)) {
    playSound("win");
  }
}

function isEndedGameReturn(previous, next) {
  return previous && previous.phase !== "lobby" && next.phase === "lobby" && next.message === "Game ended by host.";
}

function render() {
  if (!state) return;
  showTable(state);
  roomCode.textContent = state.id;
  phaseTitle.textContent = phaseLabel(state.phase);
  potValue.textContent = state.pot;
  betValue.textContent = state.toCall;
  message.textContent = state.message || "";

  community.innerHTML = state.community.length
    ? state.community.map(cardTemplate).join("")
    : Array.from({ length: 5 }, () => cardTemplate(null)).join("");

  const actionEntries = (state.actionLog || []).filter((entry) => entry.phase !== "lobby");
  const shouldStickPlayersToFeedEnd = !hasRenderedRoom
    || players.scrollHeight - players.scrollTop - players.clientHeight < 48;
  players.innerHTML = renderActionFeed();

  const hero = activeHero();
  heroHand.innerHTML = hero?.cards?.length ? hero.cards.map(cardTemplate).join("") : "";
  winnerList.innerHTML = state.winners.map((winner) => (
    `<div>${escapeHtml(winner.name)} wins ${winner.amount} with ${escapeHtml(winner.hand)}</div>`
  )).join("");

  renderControls(hero);
  if (!gameMenuModal.classList.contains("hidden")) renderMenuPlayers();
  requestAnimationFrame(() => scrollActionFeed(shouldStickPlayersToFeedEnd, actionEntries.length > 0));
}

function scrollActionFeed(shouldScroll, hasActionEntries = false) {
  if (!shouldScroll) return;
  if (players.scrollHeight <= players.clientHeight) return;
  if (hasActionEntries) {
    const actionCards = players.querySelectorAll(".action-history-card");
    const latestAction = actionCards[actionCards.length - 1];
    if (latestAction) {
      players.scrollTo({
        top: Math.max(0, latestAction.offsetTop + latestAction.offsetHeight - players.clientHeight),
        behavior: "auto",
      });
      return;
    }
  }
  players.scrollTo({ top: players.scrollHeight, behavior: hasRenderedRoom ? "smooth" : "auto" });
}

function renderControls(hero) {
  gameButtons.innerHTML = "";
  betControls.classList.add("hidden");
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
    turnInfo.textContent = current ? `${current.name} is acting.` : "Waiting for the host.";
    return;
  }

  turnInfo.textContent = state.toCall > 0 ? `Your turn. ${state.toCall} to call.` : "Your turn. You can check or bet.";
  addActionButton("Fold", { type: "fold" }, "secondary");
  addActionButton(state.toCall > 0 ? `Call ${state.toCall}` : "Check", { type: state.toCall > 0 ? "call" : "check" });

  const maxRaise = hero.bet + hero.stack;
  if (maxRaise > state.currentBet) {
    betControls.classList.remove("hidden");
    const minRaise = Math.min(maxRaise, state.minRaiseTo);
    const preferredRaise = Math.max(minRaise, state.currentBet + state.bigBlind);
    setRaiseState({
      min: minRaise,
      max: maxRaise,
      step: state.bigBlind,
      value: Math.min(maxRaise, preferredRaise),
    });
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
  playSound("tick");
}

function addButton(label, eventName, className = "") {
  const button = document.createElement("button");
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", () => emitWithAck(eventName, {}, "click"));
  gameButtons.appendChild(button);
}

function addActionButton(label, payload, className = "") {
  const button = document.createElement("button");
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", () => emitWithAck("game:action", payload, "click"));
  gameButtons.appendChild(button);
}

function kickPlayer(playerId) {
  emitWithAck("room:kick", { playerId }, "click");
}

function makeHost(playerId) {
  emitWithAck("room:makeHost", { playerId }, "click");
}

async function copyText(text, button) {
  if (!text) return;
  ensureAudio();
  await navigator.clipboard.writeText(text);
  playSound("click");
  const original = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => { button.textContent = original; }, 1200);
}

function showSharePanel() {
  const link = inviteUrl();
  if (!link) return;
  ensureAudio();
  playSound("click");
  shareLink.value = link;
  shareQr.src = `/qr.svg?text=${encodeURIComponent(link)}`;
  sharePanel.classList.toggle("hidden");
}

function emitWithAck(eventName, payload, pendingSound = null) {
  ensureAudio();
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
    if (pendingSound) playSound(pendingSound);
  });
}

function joinOrCreate(mode) {
  ensureAudio();
  joinError.textContent = "";
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
  socket.emit(eventName, payload, (response) => {
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
  emitWithAck("game:action", { type: "raise", raiseTo: raiseState.value }, "click");
});

menuBtn.addEventListener("click", () => {
  ensureAudio();
  playSound("click");
  showGameMenu();
});

closeMenuBtn.addEventListener("click", hideGameMenu);

gameMenuModal.addEventListener("click", (event) => {
  const colorButton = event.target.closest("[data-player-color]");
  if (colorButton) {
    emitWithAck("player:setColor", { color: colorButton.dataset.playerColor }, "click");
    return;
  }
  const hostButton = event.target.closest("[data-make-host]");
  if (hostButton) {
    makeHost(hostButton.dataset.makeHost);
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
  emitWithAck("player:setName", { name }, "click");
});

restartGameBtn.addEventListener("click", () => {
  hideGameMenu();
  emitWithAck("game:restart", {}, "click");
});

endGameBtn.addEventListener("click", () => {
  hideGameMenu();
  emitWithAck("game:end", {}, "click");
});

shareGameBtn.addEventListener("click", showSharePanel);
copyShareBtn.addEventListener("click", () => copyText(shareLink.value, copyShareBtn));

backToMenuBtn.addEventListener("click", () => {
  hideGameMenu();
  socket.emit("room:leave");
  showWelcome();
});

players.addEventListener("click", (event) => {
  const button = event.target.closest("[data-kick-player]");
  if (!button) return;
  kickPlayer(button.dataset.kickPlayer);
});

scoreMenuBtn.addEventListener("click", () => showWelcome());

socket.on("room:update", (room) => {
  if (leavingEndedRoom) return;
  if (isEndedGameReturn(state, room)) {
    leavingEndedRoom = true;
    socket.emit("room:leave");
    showScoreScreen(room);
    return;
  }

  playRoomSounds(state, room);
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

socket.on("connect", attemptAutoRejoin);
attemptAutoRejoin();

window.addEventListener("focus", attemptAutoRejoin);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) attemptAutoRejoin();
});

window.addEventListener("resize", () => {
  if (document.body.classList.contains("game-open")) setGameViewportHeight();
  requestAnimationFrame(() => scrollActionFeed(true, Boolean(state?.actionLog?.length)));
});

window.visualViewport?.addEventListener("resize", () => {
  if (document.body.classList.contains("game-open")) setGameViewportHeight();
  requestAnimationFrame(() => scrollActionFeed(true, Boolean(state?.actionLog?.length)));
});
