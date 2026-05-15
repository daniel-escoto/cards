const socket = io();

const welcome = document.querySelector("#welcome");
const tableView = document.querySelector("#tableView");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const createBtn = document.querySelector("#createBtn");
const joinError = document.querySelector("#joinError");
const roomCode = document.querySelector("#roomCode");
const copyLink = document.querySelector("#copyLink");
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

let state = null;
let raiseState = { value: 0, min: 0, max: 0, step: 20 };
const params = new URLSearchParams(window.location.search);
if (params.get("room")) roomInput.value = params.get("room").toUpperCase();
nameInput.value = localStorage.getItem("holdem:name") || "";

function setGameViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--game-vh", `${Math.floor(height)}px`);
}

function setKeyboardMode(isOpen) {
  document.body.classList.toggle("keyboard-open", isOpen && !welcome.classList.contains("hidden"));
  if (isOpen) window.scrollTo(0, 0);
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
  tableView.classList.remove("hidden");
  const url = new URL(window.location.href);
  url.searchParams.set("room", room.id);
  window.history.replaceState({}, "", url);
}

function activeHero() {
  return state?.players.find((player) => player.isYou);
}

function render() {
  if (!state) return;
  showTable(state);
  roomCode.textContent = state.id;
  phaseTitle.textContent = phaseLabel(state.phase);
  potValue.textContent = state.pot;
  betValue.textContent = state.currentBet;
  message.textContent = state.message || "";

  community.innerHTML = state.community.length
    ? state.community.map(cardTemplate).join("")
    : Array.from({ length: 5 }, () => cardTemplate(null)).join("");

  players.innerHTML = state.players.map((player, index) => `
    <article class="seat pos-${index} ${player.isTurn ? "turn" : ""} ${player.folded ? "folded" : ""} ${player.isYou ? "you" : ""}">
      <div class="seat-head">
        <span class="seat-name">${escapeHtml(player.name)}${player.isYou ? " (you)" : ""}</span>
        ${player.dealer ? '<span class="pill">D</span>' : ""}
      </div>
      <div class="seat-line stack-line">
        <span>Stack</span>
        <strong>${player.stack}</strong>
      </div>
      <div class="seat-line bet-line">
        <span>Bet</span>
        <strong>${player.bet}</strong>
      </div>
      ${player.isYou ? "" : `<div class="mini-cards">${player.cards.map(cardTemplate).join("")}</div>`}
    </article>
  `).join("");

  const hero = activeHero();
  heroHand.innerHTML = hero?.cards?.length ? hero.cards.map(cardTemplate).join("") : "";
  winnerList.innerHTML = state.winners.map((winner) => (
    `<div>${escapeHtml(winner.name)} wins ${winner.amount} with ${escapeHtml(winner.hand)}</div>`
  )).join("");

  renderControls(hero);
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
}

function addButton(label, eventName) {
  const button = document.createElement("button");
  button.textContent = label;
  button.addEventListener("click", () => emitWithAck(eventName, {}));
  gameButtons.appendChild(button);
}

function addActionButton(label, payload, className = "") {
  const button = document.createElement("button");
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", () => emitWithAck("game:action", payload));
  gameButtons.appendChild(button);
}

function emitWithAck(eventName, payload) {
  socket.emit(eventName, payload, (response) => {
    if (!response?.ok) joinError.textContent = response?.error || "Action failed.";
  });
}

function joinOrCreate(mode) {
  joinError.textContent = "";
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = "Enter a display name.";
    return;
  }
  localStorage.setItem("holdem:name", name);
  const roomId = roomInput.value.trim().toUpperCase();
  const eventName = mode === "create" ? "room:create" : "room:join";
  socket.emit(eventName, { name, roomId }, (response) => {
    if (!response?.ok) {
      joinError.textContent = response?.error || "Could not join table.";
    }
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

createBtn.addEventListener("click", () => joinOrCreate("create"));
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinOrCreate(roomInput.value.trim() ? "join" : "create");
});

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

raiseBtn.addEventListener("click", () => {
  emitWithAck("game:action", { type: "raise", raiseTo: raiseState.value });
});

copyLink.addEventListener("click", async () => {
  const url = new URL(window.location.href);
  url.searchParams.set("room", state.id);
  await navigator.clipboard.writeText(url.toString());
  copyLink.textContent = "Copied";
  setTimeout(() => { copyLink.textContent = "Copy invite"; }, 1200);
});

socket.on("room:update", (room) => {
  state = room;
  joinError.textContent = "";
  render();
});

window.addEventListener("resize", () => {
  if (document.body.classList.contains("game-open")) setGameViewportHeight();
});

window.visualViewport?.addEventListener("resize", () => {
  if (document.body.classList.contains("game-open")) setGameViewportHeight();
});
