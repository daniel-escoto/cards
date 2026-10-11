deviceTheme.addEventListener("change", (event) => applyTheme(event.matches ? "light" : "dark"));

document.addEventListener("pointerdown", () => tableSounds.unlock(), { once: true });
document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest("button");
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
// Face-down board slots after a fold-win: tap any of them to see the rest of the board.
community.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("[data-rabbit-reveal]")) revealRabbitBoard();
});
keybindList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest("[data-keybind-action]") as HTMLElement | null;
  if (button) beginKeybindRecording(button.dataset.keybindAction || "");
});
resetKeybindsBtn.addEventListener("click", () => {
  keybinds = { ...DEFAULT_KEYBINDS };
  recordingKeybindAction = "";
  saveKeybinds();
  renderKeybinds();
  if (state) renderControls(activeHero());
  showToast("Shortcuts reset");
});

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  acceptedMoneyTerms = null;
  watchOfferPending = false;
  updateTableActionLabel();
});
hostModeBtn.addEventListener("click", () => setTableMode("host"));
joinModeBtn.addEventListener("click", () => setTableMode("join", true));
watchBtn?.addEventListener("click", () => watchRoom());
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
  if ((event.target as HTMLElement).matches("input")) {
    setKeyboardMode(true);
    setTimeout(() => {
      setViewportHeight();
      (event.target as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
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
  if (!state?.id || isOfflineSession()) return;
  await navigator.clipboard.writeText(canonicalInviteUrl(state.id));
  flashCopyIcon(roomCodeBtn);
  showToast("Invite link copied");
});

closeMenuBtn.addEventListener("click", hideGameMenu);

addBotBtn.addEventListener("click", () => emitWithAck("room:addBot", {}));

gameMenuModal.addEventListener("click", (event) => {
  const feltButton = (event.target as HTMLElement).closest("button[data-felt]") as HTMLElement | null;
  if (feltButton) {
    applyTableAppearance(feltButton.dataset.felt || null, document.documentElement.dataset.deck || null, true);
    showToast(`${(feltButton.textContent || "").trim()} felt selected`);
    return;
  }
  const deckButton = (event.target as HTMLElement).closest("button[data-deck]") as HTMLElement | null;
  if (deckButton) {
    applyTableAppearance(document.documentElement.dataset.felt || null, deckButton.dataset.deck || null, true);
    showToast(`${(deckButton.textContent || "").trim()} deck selected`);
    return;
  }
  const shotClockButton = (event.target as HTMLElement).closest("button[data-shot-clock]") as HTMLElement | null;
  if (shotClockButton) {
    const choice = shotClockButton.dataset.shotClock;
    if (choice === SHOT_CLOCK_CUSTOM) {
      shotClockCustomOpen = true;
      renderShotClockChoices();
      shotClockCustomInput?.focus();
      return;
    }
    shotClockCustomOpen = false;
    const seconds = Math.floor(Number(choice));
    emitWithAck("game:setShotClock", { seconds });
    return;
  }
  const rabbitHuntButton = (event.target as HTMLElement).closest(
    "button[data-rabbit-hunt]",
  ) as HTMLElement | null;
  if (rabbitHuntButton) {
    emitWithAck("game:setRabbitHunt", { enabled: rabbitHuntButton.dataset.rabbitHunt === "on" });
    return;
  }
  const readyTimerButton = (event.target as HTMLElement).closest("button[data-ready-timer]") as HTMLElement | null;
  if (readyTimerButton) {
    const choice = readyTimerButton.dataset.readyTimer;
    if (choice === READY_TIMER_CUSTOM) {
      readyTimerCustomOpen = true;
      renderReadyTimerChoices();
      readyTimerCustomInput?.focus();
      return;
    }
    readyTimerCustomOpen = false;
    const seconds = Math.floor(Number(choice));
    emitWithAck("game:setReadyTimer", { seconds });
    return;
  }
  const sheetToggle = (event.target as HTMLElement).closest(
    "[data-player-sheet]",
  ) as HTMLElement | null;
  if (sheetToggle) {
    const playerId = sheetToggle.dataset.playerSheet || "";
    openPlayerSheetId = openPlayerSheetId === playerId ? "" : playerId;
    renderMenuPlayers();
    return;
  }
  const hostButton = (event.target as HTMLElement).closest("[data-make-host]") as HTMLElement | null;
  if (hostButton) {
    makeHost(hostButton.dataset.makeHost);
    openPlayerSheetId = "";
    return;
  }
  const kickButton = (event.target as HTMLElement).closest("[data-kick-player]") as HTMLElement | null;
  if (kickButton) {
    kickPlayer(kickButton.dataset.kickPlayer);
    openPlayerSheetId = "";
    return;
  }
  if (event.target === gameMenuModal) hideGameMenu();
});

// Save on pointerdown (not only click/submit) so a menu re-render between blur and
// click cannot destroy the button. preventDefault keeps the field focused through the tap.
gameMenuModal.addEventListener("pointerdown", (event) => {
  if (event.button != null && event.button !== 0) return;
  const nameSaveBtn = (event.target as HTMLElement).closest("[data-name-form] button[type='submit']") as HTMLElement | null;
  if (nameSaveBtn) {
    event.preventDefault();
    commitMenuDisplayName(nameSaveBtn.closest("[data-name-form]") as HTMLElement | null);
    return;
  }
  const shotClockSaveBtn = (event.target as HTMLElement).closest("[data-shot-clock-form] button[type='submit']") as HTMLElement | null;
  if (shotClockSaveBtn) {
    event.preventDefault();
    commitShotClockCustom(shotClockSaveBtn.closest("[data-shot-clock-form]") as HTMLElement | null);
    return;
  }
  const readyTimerSaveBtn = (event.target as HTMLElement).closest("[data-ready-timer-form] button[type='submit']") as HTMLElement | null;
  if (readyTimerSaveBtn) {
    event.preventDefault();
    commitReadyTimerCustom(readyTimerSaveBtn.closest("[data-ready-timer-form]") as HTMLElement | null);
  }
});

gameMenuModal.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target === blindForm) {
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
    emitWithAck("money:cashIn", {
      amountCents: moneyCentsFromInput(
        cashInInput,
        state?.buyInCents ? state.buyInCents / 100 : 20,
      ),
    });
    return;
  }
  if (event.target === shotClockCustomForm || (event.target as HTMLElement | null)?.closest?.("[data-shot-clock-form]")) {
    commitShotClockCustom(((event.target as HTMLElement).closest("[data-shot-clock-form]") as HTMLElement | null) || shotClockCustomForm);
    return;
  }
  if (event.target === readyTimerCustomForm || (event.target as HTMLElement | null)?.closest?.("[data-ready-timer-form]")) {
    commitReadyTimerCustom(((event.target as HTMLElement).closest("[data-ready-timer-form]") as HTMLElement | null) || readyTimerCustomForm);
    return;
  }
  const nameForm = (event.target as HTMLElement).closest("[data-name-form]") as HTMLElement | null;
  if (!nameForm) return;
  commitMenuDisplayName(nameForm);
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

sitOutBtn.addEventListener("click", () => {
  emitWithAck("game:sitOut", { sittingOut: !activeHero()?.sittingOut });
  hideGameMenu();
});

shareGameBtn.addEventListener("click", showSharePanel);
copyShareBtn.addEventListener("click", () => copyText(shareLink.value, copyShareBtn));
openSettingsBtn.addEventListener("click", showMenuSettingsView);
closeSettingsBtn.addEventListener("click", showMenuMainView);
closeSettingsMenuBtn.addEventListener("click", hideGameMenu);
openHostBtn.addEventListener("click", showMenuHostView);
closeHostBtn.addEventListener("click", showMenuMainView);
closeHostMenuBtn.addEventListener("click", hideGameMenu);

backToMenuBtn.addEventListener("click", () => {
  hideGameMenu();
  if (isOfflineSession()) {
    showWelcome();
    return;
  }
  socket?.emit("room:leave");
  showWelcome();
});

scoreMenuBtn.addEventListener("click", () => showWelcome());

socket?.on("room:update", (room: ClientRoom) => {
  if (practiceSession) return;
  applyRoomUpdate(room);
});

socket?.on("room:kicked", () => {
  showWelcome("You were kicked from the table.");
});

function attemptAutoRejoin() {
  // After an offline handoff, stay on the local table for the rest of the session.
  if (!state || practiceSession || isOfflineSession() || !socket) return;
  const roomId = (state?.id || roomInput.value.trim()).toUpperCase();
  if (!roomId || roomId === "PRACTICE") return;
  const name = nameInput.value.trim() || localStorage.getItem("holdem:name") || "Player";
  const rejoinKey = `${socket.id}:${roomId}`;
  if (socket.connected && roomId && rejoinKey !== lastAutoRejoinKey && !leavingEndedRoom) {
    lastAutoRejoinKey = rejoinKey;
    const credentials = roomCredentials(roomId);
    const asSpectator = Boolean(state?.isSpectator || credentials?.spectator);
    const eventName = asSpectator ? "room:watch" : "room:join";
    socket.emit(
      eventName,
      {
        roomId,
        name,
        deviceId: credentials?.playerId || getDeviceId(),
        reconnectToken: credentials?.reconnectToken,
      },
      ((response?: RoomJoinAck | RoomWatchAck) => {
        if (!response?.ok) {
          lastAutoRejoinKey = "";
          joinError.textContent = response?.error || "Could not rejoin table.";
          return;
        }
        saveRoomCredentials(response.roomId || roomId, {
          ...response,
          spectator: asSpectator || Boolean("spectator" in response && response.spectator),
        });
        setRoomUrl(response.roomId || roomId);
      }) satisfies (response?: RoomJoinAck | RoomWatchAck) => void,
    );
  }
}

function autoJoinInitialRoom() {
  if (didAutoJoinInitialRoom || !initialRoomParam || !nameInput.value.trim() || state) return;
  didAutoJoinInitialRoom = true;
  joinOrCreate("join");
}

socket?.on("server:hello", ({ buildId }: { buildId?: string } = {}) => {
  noteServerBuildId(buildId, state?.phase);
});

socket?.on("server:deploy-waiting", ({ message }: { message?: string } = {}) => {
  expectingServerRestart = true;
  setReconnectBanner(true, message || "Updating after this hand");
});

socket?.on("server:restarting", () => {
  expectingServerRestart = true;
  setReconnectBanner(true, "Updating…, reconnecting");
});

socket?.on("connect", () => {
  expectingServerRestart = false;
  setReconnectBanner(false);
  updateTableActionLabel();
  autoJoinInitialRoom();
  attemptAutoRejoin();
});

socket?.on("disconnect", () => {
  updateTableActionLabel();
  // Solo chip games still hand off to the local engine on true network loss.
  if (!expectingServerRestart && handoffOnlineToOffline()) {
    setReconnectBanner(false);
    return;
  }
  // Deploy restart or multiplayer disconnect: soft banner + auto-rejoin (no scary lost state).
  if (state && !practiceSession && !isOfflineSession()) {
    setReconnectBanner(true, expectingServerRestart ? "Updating…, reconnecting" : "Reconnecting…");
  }
});
autoJoinInitialRoom();
attemptAutoRejoin();

window.addEventListener("focus", attemptAutoRejoin);
function reportVisibility() {
  if (state && !practiceSession && socket?.connected)
    socket.emit("room:presence", { hidden: document.hidden });
  if (!document.hidden) attemptAutoRejoin();
}

document.addEventListener("visibilitychange", reportVisibility);
window.addEventListener("pagehide", () => {
  if (state && !practiceSession && socket?.connected)
    socket.emit("room:presence", { hidden: true });
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

document.addEventListener(
  "touchstart",
  (event) => {
    previousGameTouchY = event.touches[0]?.clientY ?? null;
  },
  { passive: true },
);
document.addEventListener("touchmove", lockMobileGameOverscroll, { passive: false });
document.addEventListener(
  "touchend",
  () => {
    previousGameTouchY = null;
  },
  { passive: true },
);
document.addEventListener(
  "touchcancel",
  () => {
    previousGameTouchY = null;
  },
  { passive: true },
);

setViewportHeight();

if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

document.addEventListener("keydown", (event) => {
  const rabbitTarget = (event.target as HTMLElement | null)?.closest?.("[data-rabbit-reveal]");
  if (rabbitTarget && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    revealRabbitBoard();
    return;
  }
  if (recordingKeybindAction) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      cancelKeybindRecording();
      return;
    }
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      ["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key)
    ) {
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
  if (
    !state ||
    !gameMenuModal.classList.contains("hidden") ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  )
    return;
  if ((event.target as HTMLElement).matches("input, select, textarea, button, [contenteditable]")) return;
  if (matchesKeybind(event, "menu")) {
    showGameMenu();
    return;
  }
  if (matchesKeybind(event, "ready") && state.canReady) {
    event.preventDefault();
    if (!event.repeat) emitWithAck("game:ready", {});
    return;
  }
  if (matchesKeybind(event, "call") && state.canReady) {
    event.preventDefault();
    if (!event.repeat && !state.isReady) emitWithAck("game:ready", { ready: true });
    return;
  }
  if (matchesKeybind(event, "showHand") && state.canShowHand) {
    if (!event.repeat) emitWithAck("game:showCards", {});
    return;
  }
  if (matchesKeybind(event, "showBoard") && state.canRabbitHunt) {
    if (!event.repeat) revealRabbitBoard();
    return;
  }
  if (!state.isYourTurn) return;
  if (
    (matchesKeybind(event, "raiseUp") || matchesKeybind(event, "raiseDown")) &&
    !betControls.classList.contains("hidden")
  ) {
    event.preventDefault();
    changeRaise(matchesKeybind(event, "raiseUp") ? 1 : -1);
    return;
  }
  if (event.repeat) return;
  if (matchesKeybind(event, "fold") && state.toCall > 0)
    emitWithAck("game:action", { type: "fold" });
  if (matchesKeybind(event, "call")) {
    if (mergePassiveConfirm) {
      if (atPassiveDetent()) {
        emitWithAck("game:action", { type: state.toCall > 0 ? "call" : "check" });
      } else {
        emitWithAck("game:action", { type: "raise", raiseTo: raiseState.value });
      }
    } else {
      emitWithAck("game:action", { type: state.toCall > 0 ? "call" : "check" });
    }
  }
  if (matchesKeybind(event, "raise") && !betControls.classList.contains("hidden")) {
    // Merged confirm: R / raise-up keys increment off the detent to a real size.
    if (mergePassiveConfirm) changeRaise(1);
    else raiseActionBtn.click();
  }
});

/** Tap/click/Enter on a face-down board slot (or the shortcut): reveal the rest once. */
function revealRabbitBoard() {
  const cards = community.querySelectorAll<HTMLElement>("[data-rabbit-reveal]");
  if (!cards.length || cards[0].getAttribute("aria-disabled") === "true") return;
  cards.forEach((card) => card.setAttribute("aria-disabled", "true"));
  emitWithAck("game:rabbitHunt", {});
}
