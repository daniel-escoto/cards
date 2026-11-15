deviceTheme.addEventListener("change", (event) => applyTheme(event.matches ? "light" : "dark"));

// iOS Safari only lets an AudioContext start/resume inside a user gesture; unlock on the first
// ones (touchend/click count on iOS, pointerdown elsewhere).
for (const type of ["pointerdown", "touchend", "keydown"]) {
  document.addEventListener(type, () => tableSounds.unlock(), { once: true, passive: true });
}
/** Fold / Check / Call / Bet / Raise / All in / Ready up get the fuller "primary" tap. */
function isPrimaryActionButton(button: HTMLButtonElement) {
  if (button.closest("#gameButtons") || button.id === "raiseActionBtn") return true;
  return /^all in\b/i.test((button.textContent || "").trim());
}
document.addEventListener("click", (event) => {
  const target = event.target;
  const button = target instanceof Element ? target.closest("button") : null;
  if (!button || button.disabled || button.classList.contains("action-placeholder")) return;
  tableSounds.buttonTap(isPrimaryActionButton(button));
});
wideTableInput?.addEventListener("change", (event) =>
  setWideTable((event.currentTarget as HTMLInputElement).checked),
);
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
  if (!(event.target as HTMLElement).matches("input, select, textarea")) return;
  // Re-measure after the keyboard animates; scroll only while typing so the
  // focused field stays visible. Idle / unfocused home stays vertically centered.
  setTimeout(() => {
    setViewportHeight();
    if (document.body.classList.contains("keyboard-open")) {
      (event.target as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, 280);
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
  const shotClockButton = (event.target as HTMLElement).closest("button[data-shot-clock]") as HTMLElement | null;
  if (shotClockButton) {
    const seconds = Math.floor(Number(shotClockButton.dataset.shotClock));
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
    const seconds = Math.floor(Number(readyTimerButton.dataset.readyTimer));
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
closeInviteBtn?.addEventListener("click", showMenuMainView);
closeInviteMenuBtn?.addEventListener("click", hideGameMenu);
handReviewCloseBtn?.addEventListener("click", () => {
  if (typeof hideHandReview === "function") hideHandReview();
});
handReviewStartBtn?.addEventListener("click", () => {
  if (handReviewStartBtn?.disabled) return;
  if (typeof handReviewJumpToStart === "function") handReviewJumpToStart();
});
handReviewPrevBtn?.addEventListener("click", () => {
  if (handReviewPrevBtn?.disabled) return;
  if (typeof handReviewStepBy === "function") handReviewStepBy(-1);
});
handReviewNextBtn?.addEventListener("click", () => {
  if (handReviewNextBtn?.disabled) return;
  if (typeof handReviewStepBy === "function") handReviewStepBy(1);
});
handReviewEndBtn?.addEventListener("click", () => {
  if (handReviewEndBtn?.disabled) return;
  if (typeof handReviewJumpToEnd === "function") handReviewJumpToEnd();
});
// Swipe on the chrome / felt for prev/next on phones.
let handReviewSwipeX = 0;
document.addEventListener(
  "touchstart",
  (event) => {
    if (typeof handReviewActive === "undefined" || !handReviewActive) return;
    handReviewSwipeX = event.changedTouches[0]?.clientX || 0;
  },
  { passive: true },
);
document.addEventListener(
  "touchend",
  (event) => {
    if (typeof handReviewActive === "undefined" || !handReviewActive) return;
    if (typeof handReviewRetryItem !== "undefined" && handReviewRetryItem) return;
    const x = event.changedTouches[0]?.clientX || 0;
    const dx = x - handReviewSwipeX;
    if (Math.abs(dx) < 48) return;
    if (typeof handReviewStepBy === "function") handReviewStepBy(dx < 0 ? 1 : -1);
  },
  { passive: true },
);
openSettingsBtn.addEventListener("click", showMenuSettingsView);
closeSettingsBtn.addEventListener("click", showMenuMainView);
closeSettingsMenuBtn.addEventListener("click", hideGameMenu);

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
  // Path codes (/CODE) and legacy ?room= both land in initialRoomId. After a
  // refresh, state is null — attemptAutoRejoin needs state, so this path must
  // silently rejoin via saved reconnectToken (no money-terms re-prompt).
  if (didAutoJoinInitialRoom || !initialRoomId || !nameInput.value.trim() || state) return;
  if (typeof practiceSession !== "undefined" && practiceSession) return;
  const credentials = roomCredentials(initialRoomId);
  if (!credentials?.reconnectToken && !credentials?.spectator) return;
  didAutoJoinInitialRoom = true;
  // Hide welcome before the socket round-trip so refresh does not flash the Join screen.
  welcome.classList.add("hidden");
  if (credentials.spectator) watchRoom();
  else joinOrCreate("join");
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
  const typingTarget = (event.target as HTMLElement | null)?.matches?.(
    "input, select, textarea, [contenteditable]",
  );
  if (event.key === "Escape" && typeof handReviewActive !== "undefined" && handReviewActive) {
    if (typeof hideHandReview === "function") hideHandReview();
    return;
  }
  if (event.key === "Escape" && !gameMenuModal.classList.contains("hidden")) {
    hideGameMenu();
    return;
  }
  if (typeof handReviewActive !== "undefined" && handReviewActive) {
    if (typingTarget || event.metaKey || event.ctrlKey || event.altKey) return;
    // In-spot retry: reuse live Fold/Call/Raise keybinds (same as the table).
    if (typeof handReviewRetryItem !== "undefined" && handReviewRetryItem && state?.isYourTurn) {
      if (
        (matchesKeybind(event, "raiseUp") || matchesKeybind(event, "raiseDown")) &&
        !betControls.classList.contains("is-reserved")
      ) {
        event.preventDefault();
        changeRaise(matchesKeybind(event, "raiseUp") ? 1 : -1);
        return;
      }
      if (event.repeat) return;
      if (matchesKeybind(event, "fold") && state.toCall > 0) {
        event.preventDefault();
        emitWithAck("game:action", { type: "fold" });
        return;
      }
      if (matchesKeybind(event, "call")) {
        event.preventDefault();
        if (mergePassiveConfirm) {
          if (atPassiveDetent()) {
            emitWithAck("game:action", { type: state.toCall > 0 ? "call" : "check" });
          } else {
            emitWithAck("game:action", { type: "raise", raiseTo: raiseState.value });
          }
        } else {
          emitWithAck("game:action", { type: state.toCall > 0 ? "call" : "check" });
        }
        return;
      }
      if (matchesKeybind(event, "raise") && !betControls.classList.contains("is-reserved")) {
        event.preventDefault();
        if (mergePassiveConfirm) changeRaise(1);
        else raiseActionBtn.click();
        return;
      }
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (typeof handReviewStepBy === "function") {
        handReviewStepBy(event.key === "ArrowLeft" ? -1 : 1);
      }
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      if (typeof handReviewJumpToStart === "function") handReviewJumpToStart();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      if (typeof handReviewJumpToEnd === "function") handReviewJumpToEnd();
      return;
    }
    const reviewKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (reviewKey === "t" && !event.repeat) {
      const tryBtn = document.querySelector(
        "#handReviewRetryBar .hand-review-try-again",
      ) as HTMLButtonElement | null;
      if (tryBtn && !tryBtn.disabled) {
        event.preventDefault();
        tryBtn.click();
      }
      return;
    }
    if (reviewKey === "a" && !event.repeat) {
      const showBtn = document.querySelector(
        "#handReviewRetryBar .hand-review-show-answer",
      ) as HTMLButtonElement | null;
      if (showBtn && !showBtn.disabled) {
        event.preventDefault();
        showBtn.click();
      }
      return;
    }
    // Continue review after a retry answer (Enter) — same path as the link click.
    if (event.key === "Enter" && !event.repeat) {
      const contBtn = document.querySelector(
        "#handReviewRetryBar:not(.is-idle) .hand-review-continue",
      ) as HTMLButtonElement | null;
      if (contBtn && !contBtn.disabled) {
        event.preventDefault();
        contBtn.click();
      }
      return;
    }
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
  // Between hands only — never steals in-hand raise (R) or other bet keys.
  // Menu no longer lists Review; V opens the post-hand button path only.
  if (
    matchesKeybind(event, "reviewHand") &&
    state.canReady &&
    !state.isYourTurn &&
    typeof openHandReview === "function" &&
    typeof hasReviewableCompletedHand === "function" &&
    hasReviewableCompletedHand(state)
  ) {
    event.preventDefault();
    if (!event.repeat) openHandReview();
    return;
  }
  if (
    matchesKeybind(event, "showHand") &&
    state.canShowHand &&
    (typeof showHandButtonAvailable !== "function" || showHandButtonAvailable(state))
  ) {
    if (!event.repeat) emitWithAck("game:showCards", {});
    return;
  }
  if (matchesKeybind(event, "showBoard") && state.canRabbitHunt) {
    if (!event.repeat) revealRabbitBoard();
    return;
  }
  // Off-turn: Fold key arms/disarms Check/Fold (same badge as the Fold button).
  if (
    !state.isYourTurn &&
    matchesKeybind(event, "fold") &&
    typeof CheckFold !== "undefined" &&
    CheckFold.shouldOffer?.({
      isYourTurn: state.isYourTurn,
      phase: state.phase,
      hero: typeof activeHero === "function" ? activeHero() : null,
    })
  ) {
    if (!event.repeat && typeof toggleCheckFoldArmed === "function") {
      event.preventDefault();
      toggleCheckFoldArmed();
    }
    return;
  }
  if (!state.isYourTurn) return;
  if (
    (matchesKeybind(event, "raiseUp") || matchesKeybind(event, "raiseDown")) &&
    !betControls.classList.contains("is-reserved")
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
  if (matchesKeybind(event, "raise") && !betControls.classList.contains("is-reserved")) {
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
