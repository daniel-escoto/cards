/**
 * Undealt board slot after a fold-win: a face-down card the viewer can tap to reveal
 * the rest of the board. Pure placeholder; carries no card data.
 */
function rabbitFaceDownTemplate(withHint: boolean) {
  const shortcut = keybindLabel(keybinds.showBoard);
  const label = `Show the rest of the board${shortcut ? ` (${shortcut})` : ""}`;
  // role="button" (not <button>) so deck themes keep styling the card back on hover.
  return `<div role="button" tabindex="0" class="card back rabbit-facedown${withHint ? " rabbit-hint" : ""}" data-rabbit-reveal aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span></span><span></span></div>`;
}

function render() {
  if (!state) return;
  const room = state;
  const isFirstTableRender = lastCommunitySignature === null;
  showTable(room);
  const offline = isOfflineSession();
  roomCode.textContent = offline ? "Offline" : room.id;
  roomCodeBtn.classList.toggle("offline-practice", offline);
  roomCodeBtn.disabled = offline;
  const roomEyebrow = roomCodeBtn.querySelector(".eyebrow");
  if (roomEyebrow) roomEyebrow.textContent = offline ? "Mode" : "Room";
  menuRoomCode.textContent = offline ? "Offline" : room.id;
  if (menuRoomEyebrow) menuRoomEyebrow.textContent = offline ? "Mode" : "Room";
  potValue.textContent = formatAmount(room.pot, room.potCents);
  if (lastPot !== null && lastPot !== room.pot) {
    replayAnimation(potValue.closest("div"), "value-changed", 480);
  }
  lastPot = room.pot;
  if (watchingCountEl) {
    const count = Number(room.watchingCount) || 0;
    watchingCountEl.textContent = count > 0 ? `${count} watching` : "";
    watchingCountEl.classList.toggle("hidden", count <= 0);
  }

  // "Would have been" cards (rabbit hunt) fill the empty slots after a fold-win.
  const rabbitCards = room.rabbitCards || [];
  const boardCards = [...room.community, ...rabbitCards];
  const canRevealBoard = Boolean(room.canRabbitHunt) && !isSpectatorView();
  const communitySignature = `${boardCards
    .map((card) => card?.code || `${card?.rank || ""}${card?.suit || ""}`)
    .join("|")}${canRevealBoard ? "|tap" : ""}`;
  const expectedCommunityCards = room.phase === "lobby" ? 0 : 5;
  if (
    communitySignature !== lastCommunitySignature ||
    community.children.length !== expectedCommunityCards
  ) {
    const previousCommunity = lastCommunitySignature ? lastCommunitySignature.split("|") : [];
    const isInitialBoard = community.children.length === 0 && room.phase !== "lobby";
    const newCommunityCardCount = boardCards.filter((card, index) => {
      const cardCode = card?.code || `${card?.rank || ""}${card?.suit || ""}`;
      return Boolean(card && previousCommunity[index] !== cardCode);
    }).length;
    community.innerHTML =
      room.phase === "lobby"
        ? ""
        : Array.from({ length: 5 }, (_, index) => {
            const card = boardCards[index] || null;
            const cardCode = card?.code || `${card?.rank || ""}${card?.suit || ""}`;
            const isNewCard =
              isInitialBoard || Boolean(card && previousCommunity[index] !== cardCode);
            const rabbitIndex = index - room.community.length;
            const rabbitClass =
              card && rabbitIndex >= 0
                ? ` rabbit-card${rabbitIndex === 0 ? " rabbit-first" : ""}`
                : "";
            if (!card && canRevealBoard) {
              return rabbitFaceDownTemplate(index === room.community.length);
            }
            return cardTemplate(card, `${isNewCard ? "card-entering" : ""}${rabbitClass}`.trim());
          }).join("");
    lastCommunitySignature = communitySignature;
    if (!isFirstTableRender && newCommunityCardCount) tableSounds.deal(newCommunityCardCount);
  }
  const feltElement = document.querySelector(".felt") as HTMLElement | null;
  if (lastPhase && lastPhase !== room.phase) replayAnimation(feltElement, "street-change", 650);
  feltElement?.classList.toggle("showdown-wait", room.phase === "showdown");
  lastPhase = room.phase;

  const entries = (room.actionLog || []).filter((entry) => entry.phase !== "lobby");
  const latestEntryId = entries.at(-1)?.id || "";
  const hasNewAction = Boolean(latestEntryId && latestEntryId !== lastActionEntryId);
  const feedScroll = captureActionFeedScroll();
  players.innerHTML = renderActionFeed(hasNewAction ? latestEntryId : "");
  restoreActionFeedScroll(feedScroll);
  if (hasNewAction) replayAnimation(players, "feed-updated", 420);
  if (hasNewAction && !isFirstTableRender) playActionSound(entries.at(-1));
  lastActionEntryId = latestEntryId;

  const hero = activeHero();
  const showHeroCards =
    room.phase !== "lobby" && room.phase !== "gameover" && Boolean(hero?.cards?.length);
  const heroSignature = showHeroCards
    ? hero!.cards.map((card) => card?.code || `${card?.rank || ""}${card?.suit || ""}`).join("|")
    : "";
  if (heroSignature !== lastHeroSignature) {
    heroCardsHidden = false;
    heroHand.innerHTML = showHeroCards ? hero!.cards.map((card) => cardTemplate(card)).join("") : "";
    updateHeroCardVisibility();
    replayAnimation(heroHand, "cards-entering", 720);
    if (heroSignature && !document.hidden) tableSounds.deal(hero?.cards?.length || 1);
    lastHeroSignature = heroSignature;
  }
  const winnerMarkup = room.winners
    .map((winner) => {
      const winnerPlayer = room.players.find(
        (player) => player.id === winner.playerId || player.name === winner.name,
      );
      const how = winnerHowText(winner.hand);
      return `
      <div class="result-line" ${playerColorStyle(winnerPlayer)}>
        <span class="result-head"><span class="seat-name">${escapeHtml(winner.name)}</span> wins <span class="result-amount">${formatAmount(winner.amount, winner.amountCents)}</span></span>
        ${how ? `<span class="result-how">${escapeHtml(how)}</span>` : ""}
      </div>
    `;
    })
    .join("");
  if (winnerMarkup !== lastWinnerSignature) {
    winnerList.innerHTML = winnerMarkup;
    if (winnerMarkup) {
      replayAnimation(winnerList, "winner-entering", 800);
      if (!document.hidden) tableSounds.win();
    }
    lastWinnerSignature = winnerMarkup;
  }

  renderControls(hero);
  syncTurnCountdown();
  syncReadyCountdown();
  if (!gameMenuModal.classList.contains("hidden")) {
    renderMenuPlayers();
    addBotBtn.classList.toggle("hidden", !room?.canAddBot || isSpectatorView());
    renderShotClockChoices();
    renderReadyTimerChoices();
    renderRabbitHuntChoices();
    const menuHero = activeHero();
    sitOutBtn.classList.toggle(
      "hidden",
      !menuHero || isSpectatorView() || room?.phase === "gameover",
    );
    if (menuHero) sitOutBtn.textContent = menuHero.sittingOut ? "Sit back in" : "Sit out";
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

function restoreActionFeedScroll(snapshot: ActionFeedScrollSnapshot | null) {
  if (!snapshot) return;
  if (!snapshot || players.scrollHeight <= players.clientHeight) return;
  const maxScrollTop = Math.max(0, players.scrollHeight - players.clientHeight);
  players.scrollTop = snapshot.followBottom ? maxScrollTop : Math.min(snapshot.top ?? 0, maxScrollTop);
}

function scrollActionFeed() {
  const snapshot = captureActionFeedScroll();
  requestAnimationFrame(() => restoreActionFeedScroll(snapshot));
}

function renderControls(hero: ClientPlayer | null | undefined) {
  renderControlsContent(hero);
  reserveActionSpace();
}

/**
 * Keep the control panel one height across in-hand, showdown, folded and ready-up so the
 * table never jumps: the bet controls stay laid out (visibility only) and an empty button
 * row holds an invisible placeholder the size of a real button.
 */
function setBetControlsReserved(reserved: boolean) {
  betControls.classList.toggle("is-reserved", reserved);
  betControls.inert = reserved;
  if (reserved) betControls.setAttribute("aria-hidden", "true");
  else betControls.removeAttribute("aria-hidden");
}

function actionPlaceholder(label: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "action-placeholder";
  button.textContent = label;
  button.tabIndex = -1;
  button.setAttribute("aria-hidden", "true");
  return button;
}

function reserveActionSpace() {
  if (!gameButtons.children.length) gameButtons.appendChild(actionPlaceholder("Ready up"));
  const reserved = betControls.classList.contains("is-reserved");
  if (reserved && !betPresets.children.length) {
    betPresets.appendChild(actionPlaceholder("All in"));
  }
  // Fill the reserved bet slot instead of leaving it blank: hand results get a centered
  // result block there (prompt + buttons drop below it); other button-less states (showdown,
  // folded, waiting) center their status line in the space.
  const panel = betControls.parentElement;
  if (!panel) return;
  const hasResult = winnerList.children.length > 0;
  const hasButtons = Array.from(gameButtons.children).some(
    (child) => !child.classList.contains("action-placeholder"),
  );
  // Before the first hand (lobby, waiting for players) there's nothing to keep stable against,
  // so the panel drops the reserved bet space and just fits its content.
  const handLive = Boolean(state && !["lobby", "complete", "gameover"].includes(state.phase));
  const compact = reserved && !hasResult && !handLive;
  panel.classList.toggle("is-compact", compact);
  panel.classList.toggle("is-result", reserved && hasResult);
  panel.classList.toggle("is-idle", reserved && !hasResult && !hasButtons && !compact);
}

/** Second line of a result: "Everyone folded" for fold-wins, otherwise the made hand. */
function winnerHowText(hand: string | null | undefined) {
  const text = String(hand || "").trim();
  if (!text) return "";
  if (/folded/i.test(text)) return "Everyone folded";
  return text;
}

function renderControlsContent(hero: ClientPlayer | null | undefined) {
  if (!state) return;
  const room = state;
  gameButtons.innerHTML = "";
  setBetControlsReserved(true);
  raiseControlsDisabled = false;
  mergePassiveConfirm = false;
  confirmActionBtn = null;
  raiseActionBtn.classList.remove("hidden");
  betControls.querySelector(".raise-row")?.classList.remove("merge-check-bet");
  betPresets.innerHTML = "";
  turnInfo.textContent = "";
  turnInfo.classList.remove("your-turn", "bust-message");

  if (isSpectatorView()) {
    turnInfo.classList.remove("showdown-message");
    if (room.phase === "showdown") {
      turnInfo.textContent = "Showdown";
      turnInfo.classList.add("showdown-message");
    } else if (["lobby", "complete"].includes(room.phase)) {
      const humans = room.players.filter(
        (player) => !player.isBot && !player.sittingOut && player.stack > 0,
      );
      const readyCount = humans.filter((player) => player.ready).length;
      const readyStatus =
        humans.length < 2 &&
        room.players.filter((player) => player.stack > 0 && !player.sittingOut).length < 2
          ? "Watching — need two players"
          : `Watching — ${readyCount} of ${humans.length} ready`;
      turnInfo.textContent = readyStatus;
    } else {
      const currentIndex = findLastIndex(room.players, (player) => player.id === room.turn);
      const current = currentIndex >= 0 ? room.players[currentIndex] : null;
      turnInfo.textContent = current ? `Watching — ${current.name}` : "Watching";
    }
    if (room.canTakeSeat) {
      const button = document.createElement("button");
      button.textContent = "Take a seat";
      button.addEventListener("click", () => takeSeatFromSpectator());
      gameButtons.appendChild(button);
    }
    return;
  }

  if (room.canRebuy) {
    renderBustPanel(room);
    return;
  }
  if (hero?.sittingOut && (!isBettingPhase(room.phase) || !hero.cards.length)) {
    turnInfo.textContent = "Sitting out";
    addButton("Sit back in", "game:sitOut", "", "", { sittingOut: false });
    return;
  }
  if (hero?.waitingForNextHand) {
    turnInfo.textContent = "In next hand";
    return;
  }
  if (room.phase === "showdown") {
    turnInfo.textContent = "Showdown";
    turnInfo.classList.add("showdown-message");
    return;
  }
  turnInfo.classList.remove("showdown-message");

  if (room.canAddBot) {
    addButton("+ Add bot", "room:addBot", "secondary lobby-add-bot");
  }
  if (room.canReady) {
    const readyShortcut = room.isReady
      ? keybindLabel(keybinds.ready)
      : [keybinds.ready, keybinds.call].filter(Boolean).map(keybindLabel).join(" / ");
    addButton(
      room.isReady ? "Not ready" : "Ready up",
      "game:ready",
      room.isReady ? "secondary" : "",
      readyShortcut,
    );
  }
  if (room.canShowHand) {
    addButton("Show hand", "game:showCards", "secondary", keybindLabel(keybinds.showHand));
  }

  if (!room.isYourTurn || !hero) {
    if (["lobby", "complete"].includes(room.phase)) {
      const humans = room.players.filter(
        (player) => !player.isBot && !player.sittingOut && player.stack > 0,
      );
      const readyCount = humans.filter((player) => player.ready).length;
      const readyStatus =
        humans.length < 2 &&
        room.players.filter((player) => player.stack > 0 && !player.sittingOut).length < 2
          ? "Need two players to start"
          : `${readyCount} of ${humans.length} ready`;
      // No ready-up number here or on the button: the seat progress bar is the countdown.
      turnInfo.textContent = readyStatus;
      return;
    }
    const currentIndex = findLastIndex(room.players, (player) => player.id === room.turn);
    const current = currentIndex >= 0 ? room.players[currentIndex] : null;
    turnInfo.textContent = current ? `${current.name} to act` : "Waiting for host";
    if (hero && isBettingPhase(room.phase) && !hero.folded && !hero.allIn) {
      renderHeroActionControls(hero, true);
    }
    return;
  }

  // Pot is already in the panel header — keep the prompt short.
  turnInfo.textContent =
    room.toCall > 0
      ? `Call ${formatAmount(room.toCall, room.toCallCents)}`
      : "Check or bet";
  turnInfo.classList.add("your-turn");
  renderHeroActionControls(hero, false);
}

/** Every human is out of chips while CPUs play on: offer Rebuy / Restart instead of a dead table. */
function renderBustPanel(room: ClientRoom) {
  const leader = room.players
    .filter((player) => player.stack > 0)
    .sort((a, b) => b.stack - a.stack)[0];
  turnInfo.replaceChildren();
  const title = document.createElement("strong");
  title.className = "bust-title";
  title.textContent = "You’re out";
  turnInfo.append(title);
  if (leader) {
    const detail = document.createElement("span");
    detail.className = "bust-detail";
    detail.textContent = `${leader.name} leads with ${formatAmount(leader.stack, leader.stackCents)}`;
    turnInfo.append(detail);
  }
  turnInfo.classList.add("bust-message");
  const startingStack = typeof HoldemEngine?.STARTING_STACK === "number" ? HoldemEngine.STARTING_STACK : 1000;
  addButton(`Rebuy ${formatAmount(startingStack, startingStack)}`, "game:rebuy");
  if (room.canRestartGame) addButton("Restart", "game:restart", "secondary");
}

function renderHeroActionControls(hero: ClientPlayer, disabled: boolean) {
  if (!state) return;
  const maxRaise = hero.bet + hero.stack;
  const canBetMore = maxRaise > state.currentBet;
  // Merge Check/Bet or Call/Raise into one confirm whenever the hero can put more in.
  mergePassiveConfirm = canBetMore;

  // Fold only when facing a bet — free checks must not offer a fold misclick.
  if (state.toCall > 0) addActionButton("Fold", { type: "fold" }, "danger", disabled);

  if (mergePassiveConfirm) {
    addConfirmPassiveButton(disabled);
  } else {
    addActionButton(
      state.toCall > 0 ? `Call ${formatAmount(state.toCall, state.toCallCents)}` : "Check",
      { type: state.toCall > 0 ? "call" : "check" },
      "",
      disabled,
    );
  }

  // All in (and the bet panel) must stay available whenever the hero can put more
  // chips in — including a short all-in below min-raise. Do not gate on canRaise.
  if (canBetMore) configureRaiseControls(hero, disabled);
}

function configureRaiseControls(hero: ClientPlayer, disabled = false) {
  if (!state) return;
  const maxRaise = hero.bet + hero.stack;
  if (maxRaise <= state.currentBet) return;
  setBetControlsReserved(false);
  // Full min-raise tools only when the stack can meet minRaiseTo; otherwise jam-only.
  const canFullRaise = maxRaise >= state.minRaiseTo;
  const minRaise = canFullRaise ? Math.min(maxRaise, state.minRaiseTo) : maxRaise;
  const preferredRaise = canFullRaise
    ? Math.max(minRaise, state.currentBet + state.bigBlind)
    : maxRaise;
  raiseLabel.textContent = !canFullRaise ? "All in" : state.currentBet > 0 ? "Raise to" : "Bet";
  raiseControlsDisabled = disabled;
  raiseActionBtn.classList.toggle("hidden", mergePassiveConfirm);
  betControls.querySelector(".raise-row")?.classList.toggle("merge-check-bet", mergePassiveConfirm);
  const initialValue = mergePassiveConfirm
    ? RaiseSizing.passiveDetentValue(state.currentBet)
    : Math.min(maxRaise, preferredRaise);
  setRaiseState({
    min: minRaise,
    max: maxRaise,
    step: state.bigBlind,
    value: initialValue,
  });
  renderBetPresets(hero, disabled, canFullRaise);
}

function raiseBounds() {
  const facingBet = (state?.toCall || 0) > 0;
  return {
    minRaiseTo: raiseState.min,
    maxRaiseTo: raiseState.max,
    step: raiseState.step || state?.bigBlind || 1,
    currentBet: state?.currentBet || 0,
    mergeCheckBet: mergePassiveConfirm && !facingBet,
    mergeCallRaise: mergePassiveConfirm && facingBet,
  };
}

function atPassiveDetent() {
  return (
    mergePassiveConfirm && RaiseSizing.isPassiveDetent(raiseState.value, state?.currentBet || 0)
  );
}

function renderBetPresets(hero: ClientPlayer, disabled: boolean, canFullRaise = true) {
  if (!state) return;
  const bounds = raiseBounds();
  const options = [];
  if (canFullRaise) {
    for (const preset of [
      { label: "½ pot", fraction: 0.5 },
      { label: "Pot", fraction: 1 },
    ]) {
      const value = RaiseSizing.legalRaiseTo(
        RaiseSizing.potPresetRaiseTo({
          pot: state.pot,
          currentBet: state.currentBet,
          bigBlind: state.bigBlind,
          fraction: preset.fraction,
          toCall: state.toCall || 0,
        }),
        bounds,
      );
      // Never let ½ pot / Pot replace All in when they clamp to the same amount.
      if (value < raiseState.max) options.push({ label: preset.label, value });
    }
  }
  // Always keep a distinct All in control (do not unique-filter it away).
  const allInTo = raiseState.max;
  options.push({ label: "All in", value: allInTo, allIn: true });
  betPresets.innerHTML = "";
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.disabled = disabled;
    button.addEventListener("click", () => {
      setRaiseState({ value: option.value });
      // Tapping All in sends the all-in raise-to immediately on your turn.
      if (option.allIn && !disabled && state?.isYourTurn) {
        emitWithAck("game:action", { type: "raise", raiseTo: allInTo });
      }
    });
    betPresets.appendChild(button);
  });
}

function setRaiseState(next: Partial<RaiseState> | RaiseState) {
  if (!state) return;
  raiseState = {
    ...raiseState,
    ...next,
  };
  raiseState.value = clampRaise(raiseState.value);
  // At the passive detent the confirm carries Call/Check; show zero increment here.
  const displayChips = atPassiveDetent() ? 0 : raiseState.value;
  const formattedAmount = formatAmount(
    displayChips,
    Math.round(displayChips * (state?.chipValueCents || 0)),
  );
  raiseAmount.textContent = formattedAmount;
  const allInOnly = raiseState.max <= raiseState.min || raiseState.value >= raiseState.max;
  if (!mergePassiveConfirm) {
    setButtonLabel(
      raiseActionBtn,
      allInOnly ? "All in" : state?.currentBet > 0 ? "Raise" : "Bet",
      keybindLabel(keybinds.raise),
    );
  }
  raiseActionBtn.disabled = raiseControlsDisabled;
  raiseMinus.disabled =
    raiseControlsDisabled ||
    (mergePassiveConfirm ? atPassiveDetent() : raiseState.value <= raiseState.min);
  raisePlus.disabled = raiseControlsDisabled || raiseState.value >= raiseState.max;
  updateConfirmPassiveButton();
}

function clampRaise(value: unknown) {
  return RaiseSizing.clampRaiseTo(value, raiseBounds());
}

function changeRaise(direction: number) {
  setRaiseState({ value: RaiseSizing.nudgeRaiseTo(raiseState.value, direction, raiseBounds()) });
}

function setButtonLabel(button: HTMLElement | null | undefined, label: string, shortcut = "") {
  if (!button) return;
  button.innerHTML = `<span>${escapeHtml(label)}</span>${shortcut ? `<kbd aria-hidden="true">${escapeHtml(shortcut)}</kbd>` : ""}`;
  button.classList.toggle("has-shortcut", Boolean(shortcut));
  button.setAttribute("aria-label", shortcut ? `${label} (${shortcut})` : label);
}

function addConfirmPassiveButton(disabled = false) {
  if (!state) return;
  const button = document.createElement("button");
  confirmActionBtn = button;
  button.disabled = disabled;
  button.addEventListener("click", () => {
    if (!state) return;
    if (atPassiveDetent()) {
      emitWithAck("game:action", { type: state.toCall > 0 ? "call" : "check" });
      return;
    }
    emitWithAck("game:action", { type: "raise", raiseTo: raiseState.value });
  });
  gameButtons.appendChild(button);
  updateConfirmPassiveButton();
}

function updateConfirmPassiveButton() {
  if (!state) return;
  if (!confirmActionBtn || !mergePassiveConfirm) return;
  const shortcut = keybindLabel(keybinds.call);
  if (atPassiveDetent()) {
    if (state.toCall > 0) {
      setButtonLabel(
        confirmActionBtn,
        `Call ${formatAmount(state.toCall, state.toCallCents)}`,
        shortcut,
      );
      return;
    }
    setButtonLabel(confirmActionBtn, "Check", shortcut);
    return;
  }
  const formatted = formatAmount(
    raiseState.value,
    Math.round(raiseState.value * (state?.chipValueCents || 0)),
  );
  // Facing a bet: Raise {amount}; free check: Bet {amount}.
  const verb = state.toCall > 0 ? "Raise" : "Bet";
  setButtonLabel(confirmActionBtn, `${verb} ${formatted}`, shortcut);
}

function addButton(label: string, eventName: string, className = "", shortcut = "", payload: Record<string, unknown> = {}) {
  const button = document.createElement("button");
  if (className) button.className = className;
  setButtonLabel(button, label, shortcut);
  button.addEventListener("click", () => emitWithAck(eventName, payload));
  gameButtons.appendChild(button);
  return button;
}

function addActionButton(label: string, payload: Record<string, unknown>, className = "", disabled = false) {
  const button = document.createElement("button");
  if (className) button.className = className;
  const shortcut =
    payload.type === "fold"
      ? keybindLabel(keybinds.fold)
      : ["check", "call"].includes(String(payload.type))
        ? keybindLabel(keybinds.call)
        : "";
  setButtonLabel(button, label, shortcut);
  button.disabled = disabled;
  button.addEventListener("click", () => emitWithAck("game:action", payload));
  gameButtons.appendChild(button);
}

function makeHost(playerId: string | undefined) {
  if (!playerId) return;
  emitWithAck("room:makeHost", { playerId });
}

function kickPlayer(playerId: string | undefined) {
  if (!playerId) return;
  emitWithAck("room:kick", { playerId });
}

var copyIconResetTimer: ReturnType<typeof setTimeout> | null = null;

function flashCopyIcon(root: HTMLElement | null = roomCodeBtn) {
  const icon = root?.querySelector(".copy-icon");
  if (!icon) return;
  const copyGlyph = icon.querySelector(".copy-icon-copy");
  const checkGlyph = icon.querySelector(".copy-icon-check");
  if (!copyGlyph || !checkGlyph) return;
  copyGlyph.classList.add("hidden");
  checkGlyph.classList.remove("hidden");
  if (copyIconResetTimer != null) clearTimeout(copyIconResetTimer);
  copyIconResetTimer = setTimeout(() => {
    checkGlyph.classList.add("hidden");
    copyGlyph.classList.remove("hidden");
    copyIconResetTimer = null;
  }, 1200);
}

async function copyText(text: string, button: HTMLElement) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = "Copied";
  showToast("Copied to clipboard");
  setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function showSharePanel() {
  const link = inviteUrl();
  if (!link) return;
  shareLink.value = link;
  shareQr.src = `/qr.svg?text=${encodeURIComponent(link)}`;
  sharePanel.classList.toggle("hidden");
}

function emitWithAck(eventName: string, payload?: Record<string, unknown>) {
  if (practiceSession) {
    const response = practiceSession.handle(eventName, payload || {});
    if (!response?.ok) {
      joinError.textContent = response?.error || "Action failed.";
    }
    return;
  }
  if (!socket) {
    joinError.textContent = "Connecting...";
    return;
  }
  socket.timeout(4000).emit(
    eventName,
    payload,
    ((error: Error | null, response?: OkAck | ErrAck) => {
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
    }) satisfies SocketTimeoutAck<OkAck | ErrAck>,
  );
}

function startOfflineHost() {
  joinError.textContent = "";
  if (
    typeof PracticeSession?.createPracticeSession !== "function" ||
    typeof HoldemEngine === "undefined"
  ) {
    joinError.textContent = "Offline engine failed to load. Refresh and try again.";
    return;
  }
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = "Enter a display name.";
    return;
  }
  localStorage.setItem("holdem:name", name);
  moneyModeInput.checked = false;
  disposePracticeSession();
  practiceSession = PracticeSession.createPracticeSession({
    name,
    playerId: getDeviceId() || "offline-hero",
    tableSize: typeof HoldemEngine?.MAX_PLAYERS === "number" ? HoldemEngine.MAX_PLAYERS : 9,
    botCount: 0,
    smallBlind: Math.max(1, Math.floor(Number(smallBlindInput?.value) || 10)),
    bigBlind: Math.max(2, Math.floor(Number(bigBlindInput?.value) || 20)),
    onUpdate: applyRoomUpdate,
  });
  clearRoomUrl();
  leavingEndedRoom = false;
  practiceSession.publish();
}

function joinOrCreate(mode: string) {
  joinError.textContent = "";
  if (mode === "create" && hostUsesOfflinePath()) {
    startOfflineHost();
    return;
  }
  if (joinPending) return;
  if (!socket) {
    joinError.textContent = "Online play needs a connection.";
    return;
  }
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
  const payload: Record<string, unknown> = {
    name,
    roomId,
    deviceId: credentials?.playerId || getDeviceId(),
    reconnectToken: credentials?.reconnectToken,
    acceptedMoneyTerms,
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
  watchOfferPending = false;
  tableActionBtn.textContent = mode === "join" ? "Joining..." : "Hosting...";
  updateTableActionLabel();
  socket.timeout(4000).emit(
    eventName,
    payload,
    ((error: Error | null, response?: RoomCreateAck | RoomJoinAck) => {
      joinPending = false;
      updateTableActionLabel();
      if (error) {
        joinError.textContent = "Still connecting. Try again.";
        return;
      }
      if (!response?.ok) {
        if (response && "moneyTerms" in response) {
          acceptedMoneyTerms = response.moneyTerms;
          const terms = acceptedMoneyTerms;
          joinPreview.textContent = `Money game · Buy-in ${formatMoney(terms.buyInCents)} · Blinds ${formatMoney(terms.smallBlindCents)}/${formatMoney(terms.bigBlindCents)}. You’ll play on the next deal. Payments happen separately after the game.`;
          joinError.textContent = "";
          updateTableActionLabel();
          return;
        }
        if (response && "canWatch" in response && response.canWatch) {
          watchOfferPending = true;
          joinError.textContent = response.error || "Table is full — you can watch instead.";
          updateTableActionLabel();
          return;
        }
        joinError.textContent = response?.error || "Could not join table.";
        return;
      }
      acceptedMoneyTerms = null;
      watchOfferPending = false;
      lastAutoRejoinKey = `${socket!.id}:${response.roomId || roomId}`;
      saveRoomCredentials(response.roomId || roomId, response);
      setRoomUrl(response.roomId || roomId);
    }) satisfies SocketTimeoutAck<RoomCreateAck | RoomJoinAck>,
  );
}

function watchRoom() {
  joinError.textContent = "";
  if (joinPending) return;
  if (tableMode !== "join") setTableMode("join");
  if (!socket) {
    joinError.textContent = "Online play needs a connection.";
    return;
  }
  if (!socket.connected) {
    joinError.textContent = "Connecting...";
    socket.once("connect", () => watchRoom());
    return;
  }
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = "Enter a display name.";
    return;
  }
  const roomId = roomInput.value.trim().toUpperCase();
  if (!roomId) {
    joinError.textContent = "Enter a room code to watch.";
    return;
  }
  localStorage.setItem("holdem:name", name);
  const credentials = roomCredentials(roomId);
  joinPending = true;
  if (watchBtn) watchBtn.textContent = "Joining...";
  updateTableActionLabel();
  socket.timeout(4000).emit(
    "room:watch",
    {
      name,
      roomId,
      deviceId: credentials?.playerId || getDeviceId(),
      reconnectToken: credentials?.reconnectToken,
    },
    ((error: Error | null, response?: RoomWatchAck) => {
      joinPending = false;
      updateTableActionLabel();
      if (error) {
        joinError.textContent = "Still connecting. Try again.";
        return;
      }
      if (!response?.ok) {
        joinError.textContent = response?.error || "Could not watch table.";
        return;
      }
      acceptedMoneyTerms = null;
      watchOfferPending = false;
      lastAutoRejoinKey = `${socket!.id}:${response.roomId || roomId}`;
      saveRoomCredentials(response.roomId || roomId, { ...response, spectator: true });
      setRoomUrl(response.roomId || roomId);
    }) satisfies SocketTimeoutAck<RoomWatchAck>,
  );
}

function takeSeatFromSpectator() {
  if (!state) return;
  if (!state?.isSpectator || !socket) return;
  const credentials = roomCredentials(state.id) || {};
  const payload = {
    name: nameInput.value.trim() || localStorage.getItem("holdem:name") || "Player",
    deviceId: credentials.playerId || getDeviceId(),
    reconnectToken: credentials.reconnectToken,
    acceptedMoneyTerms,
  };
  socket.timeout(4000).emit(
    "room:takeSeat",
    payload,
    ((error: Error | null, response?: RoomTakeSeatAck) => {
      if (error) {
        joinError.textContent = "Reconnecting to the table...";
        lastAutoRejoinKey = "";
        attemptAutoRejoin();
        return;
      }
      if (!response?.ok) {
        if (response && "moneyTerms" in response) {
          acceptedMoneyTerms = response.moneyTerms;
          showToast(
            `Money game · Buy-in ${formatMoney(response.moneyTerms.buyInCents)}. Confirm to take a seat.`,
          );
          if (state) renderControls(activeHero());
          return;
        }
        joinError.textContent = response?.error || "Could not take a seat.";
        showToast(response?.error || "Could not take a seat.");
        return;
      }
      acceptedMoneyTerms = null;
      saveRoomCredentials(response.roomId || state!.id, { ...response, spectator: false });
    }) satisfies SocketTimeoutAck<RoomTakeSeatAck>,
  );
}
