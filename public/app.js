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
const shareGameBtn = document.querySelector("#shareGameBtn");
const backToMenuBtn = document.querySelector("#backToMenuBtn");
const menuRoomCode = document.querySelector("#menuRoomCode");
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

function cardTemplate(card) {
  if (!card) return '<div class="card back"><span></span><span></span></div>';
  return `
    <div class="card ${card.color === "red" ? "red" : ""}">
      <span>${card.rank}</span>
      <span class="suit">${card.suit}</span>
    </div>
  `;
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
}

function showGameMenu() {
  if (!state) return;
  menuRoomCode.textContent = state.id;
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

function clearRoomUrl() {
  localStorage.removeItem("holdem:lastRoom");
  roomInput.value = "";
  updateTableActionLabel();
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url);
}

function activeHero() {
  return state?.players.find((player) => player.isYou);
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
  const withoutName = raw
    .replace(new RegExp(`^${escapeRegExp(player.name)}\\s+`, "i"), "")
    .replace(/\.$/, "");
  return withoutName
    .replace(/^Posts small blind\s+/i, "SB ")
    .replace(/^Posts big blind\s+/i, "BB ")
    .replace(/^Calls\s+/i, "call ")
    .replace(/^Checks$/i, "check")
    .replace(/^Folds$/i, "fold")
    .replace(/^Raises to\s+/i, "raise ")
    .replace(/^Wins\s+/i, "+");
}

function playerActionHistory(player) {
  const entries = (state.actionLog || []).filter((entry) => (
    entry.playerId === player.id || (!entry.playerId && entry.text?.startsWith(player.name))
  ));
  if (!entries.length) {
    return "";
  }
  return groupActionLog(entries).flatMap(([phase, phaseEntries]) => (
    phaseEntries.map((entry) => `
      <span class="seat-action-card">
        ${compactStreetLabel(phase) ? `<em>${escapeHtml(compactStreetLabel(phase))}</em>` : ""}
        <strong>${escapeHtml(compactPlayerAction(entry, player))}</strong>
      </span>
    `)
  )).join("");
}

function playerTableStatus(player) {
  if (player.folded) return "Folded";
  if (player.allIn) return "All in";
  if (player.isTurn) return "Acting";
  return player.connected ? "In hand" : "Away";
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

  players.innerHTML = state.players.map((player, index) => `
    <article class="seat pos-${index} ${player.isTurn ? "turn" : ""} ${player.folded ? "folded" : ""} ${player.isYou ? "you" : ""}">
      <div class="seat-top">
        <div class="seat-head">
          <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
          <span class="seat-badges">
            ${player.dealer ? '<span class="pill">D</span>' : ""}
            ${player.isBot ? '<span class="pill">CPU</span>' : ""}
          </span>
        </div>
        ${player.isYou ? "" : `<div class="mini-cards">${player.cards.map(cardTemplate).join("")}</div>`}
      </div>
      <div class="seat-history">${playerActionHistory(player)}</div>
      <div class="seat-footer">
        <div class="seat-stats">
          <div class="seat-line stack-line">
            <span>Stack</span>
            <strong>${player.stack}</strong>
          </div>
          <div class="seat-line bet-line">
            <span>In pot</span>
            <strong>${player.invested}</strong>
          </div>
        </div>
        <span class="seat-status">${playerTableStatus(player)}</span>
        ${player.canKick ? `<button type="button" class="kick-btn danger" data-kick-player="${escapeHtml(player.id)}">Kick</button>` : ""}
      </div>
    </article>
  `).join("");

  const hero = activeHero();
  heroHand.innerHTML = hero?.cards?.length ? hero.cards.map(cardTemplate).join("") : "";
  winnerList.innerHTML = state.winners.map((winner) => (
    `<div>${escapeHtml(winner.name)} wins ${winner.amount} with ${escapeHtml(winner.hand)}</div>`
  )).join("");

  renderControls(hero);
  requestAnimationFrame(scrollPlayersToBottom);
}

function scrollPlayersToBottom() {
  if (!window.matchMedia("(max-width: 779px)").matches) return;
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
  if (state.canEndGame) {
    addButton("End game", "game:end", "danger");
  }

  if (!state.isYourTurn || !hero) {
    const current = state.players.find((player) => player.id === state.turn);
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

async function copyInviteLink() {
  if (!state) return;
  ensureAudio();
  const url = new URL(window.location.href);
  url.searchParams.set("room", state.id);
  await navigator.clipboard.writeText(url.toString());
  playSound("click");
  shareGameBtn.textContent = "Copied";
  setTimeout(() => { shareGameBtn.textContent = "Share"; }, 1200);
}

function emitWithAck(eventName, payload, pendingSound = null) {
  ensureAudio();
  socket.emit(eventName, payload, (response) => {
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
  if (event.target === gameMenuModal) hideGameMenu();
});

restartGameBtn.addEventListener("click", () => {
  hideGameMenu();
  emitWithAck("game:restart", {}, "click");
});

shareGameBtn.addEventListener("click", copyInviteLink);

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
  joinError.textContent = "";
  render();
  hasRenderedRoom = true;
});

socket.on("room:kicked", () => {
  showWelcome("You were kicked from the table.");
});

function attemptAutoRejoin() {
  const roomId = roomInput.value.trim().toUpperCase();
  const name = nameInput.value.trim() || localStorage.getItem("holdem:name") || "Player";
  if (socket.connected && !state && roomId) {
    socket.emit("room:join", { roomId, name, deviceId: getDeviceId() }, (response) => {
      if (!response?.ok) {
        joinError.textContent = response?.error || "Could not rejoin table.";
        return;
      }
      setRoomUrl(response.roomId || roomId);
    });
  }
}

socket.on("connect", attemptAutoRejoin);
attemptAutoRejoin();

window.addEventListener("resize", () => {
  if (document.body.classList.contains("game-open")) setGameViewportHeight();
  requestAnimationFrame(scrollPlayersToBottom);
});

window.visualViewport?.addEventListener("resize", () => {
  if (document.body.classList.contains("game-open")) setGameViewportHeight();
  requestAnimationFrame(scrollPlayersToBottom);
});
