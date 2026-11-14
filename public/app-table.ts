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
  // Pre-deal / lobby / game-over: never paint hole cards (also clears stale DOM
  // when lastHeroSignature was reset without wiping #heroHand).
  const showHeroCards =
    room.phase !== "lobby" && room.phase !== "gameover" && Boolean(hero?.cards?.length);
  const heroSignature = showHeroCards
    ? hero!.cards.map((card) => card?.code || `${card?.rank || ""}${card?.suit || ""}`).join("|")
    : "";
  if (!showHeroCards) {
    if (lastHeroSignature !== "" || heroHand.children.length > 0) {
      heroCardsHidden = false;
      heroHand.innerHTML = "";
      updateHeroCardVisibility();
      lastHeroSignature = "";
    }
  } else if (heroSignature !== lastHeroSignature) {
    heroCardsHidden = false;
    heroHand.innerHTML = hero!.cards.map((card) => cardTemplate(card)).join("");
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
    if (typeof syncHandReviewBtn === "function") syncHandReviewBtn();
    if (typeof syncCopyForAiBtn === "function") syncCopyForAiBtn();
  }
  requestAnimationFrame(() => restoreActionFeedScroll(feedScroll));
}

/** Chess.com-style hand recording + table replay (bot games only). */
var handRecording: {
  handNumber: number;
  heroId: string;
  heroCodes: [string, string];
  steps: Array<{
    id: string;
    label: string;
    actorId: string | null;
    kind: "action" | "hero_decision" | "street" | "showdown" | "result";
    table: ReplayTableStateLocal;
    heroDecision?: HandReviewDecisionLocal;
  }>;
} | null = null;
var handReviewLastLogId = "";
var lastHandReplay: HandReplayLocal | null = null;
var handReviewActive = false;
var handReviewSavedState: ClientRoom | null = null;
var handReviewStepIndex = 0;
var handReviewRetryItem: HandReviewItemLocal | null = null;
/** Mistake steps whose answer has been revealed (retry or Show answer). */
var handReviewRevealedSteps = new Set<number>();
var handReviewTouchStartX = 0;

type ReplaySeatLocal = {
  id: string;
  name: string;
  isHero: boolean;
  isBot: boolean;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  dealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  holeCodes: string[] | null;
  lastAction: string | null;
};

type ReplayTableStateLocal = {
  street: "preflop" | "flop" | "turn" | "river" | "showdown" | "complete";
  pot: number;
  toCall: number;
  currentBet: number;
  minRaiseTo: number;
  boardCodes: string[];
  seats: ReplaySeatLocal[];
  actingSeatId: string | null;
  winners: Array<{ playerId: string; name: string; amount: number; hand?: string }>;
};

type HandReviewDecisionLocal = {
  id: string;
  street: "preflop" | "flop" | "turn" | "river";
  boardCodes: string[];
  heroCodes: [string, string];
  pot: number;
  toCall: number;
  currentBet: number;
  heroStack: number;
  opponentStacks: number[];
  taken: "fold" | "check" | "call" | "bet" | "raise";
  raiseTo?: number | null;
  equity?: number;
  canRaise?: boolean;
  minRaiseTo?: number;
  maxRaiseTo?: number;
  raiseStep?: number;
};

type HandReviewItemLocal = {
  id: string;
  street: "preflop" | "flop" | "turn" | "river";
  boardCodes: string[];
  heroCodes: [string, string];
  pot: number;
  toCall: number;
  currentBet: number;
  taken: "fold" | "check" | "call" | "bet" | "raise";
  raiseTo: number | null;
  equity: number;
  potOdds: number;
  recommended: "fold" | "check" | "call" | "bet" | "raise";
  recommendedRaiseTo: number | null;
  verdict: "best" | "fine" | "mistake";
  badge: "Best" | "Fine" | "Borderline" | "Mistake";
  reason: string;
};

type HandReplayLocal = {
  steps: Array<{
    id: string;
    index: number;
    label: string;
    actorId: string | null;
    kind: "action" | "hero_decision" | "street" | "showdown" | "result";
    table: ReplayTableStateLocal;
    decision: HandReviewItemLocal | null;
    isHeroDecision: boolean;
  }>;
  items: HandReviewItemLocal[];
  best: number;
  fine: number;
  mistake: number;
  summary: string;
};

function publicCardFromCode(code: string): PublicCard {
  const suitMap: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const rankChar = code[0] || "";
  const suitChar = (code[1] || "").toLowerCase();
  return {
    code,
    rank: rankChar === "T" ? "10" : rankChar,
    suit: suitMap[suitChar] || suitChar,
    color: suitChar === "h" || suitChar === "d" ? "red" : "black",
  };
}

function snapshotReplayTable(
  room: ClientRoom,
  options: { revealShowdown?: boolean; lastActionById?: Map<string, string> } = {},
): ReplayTableStateLocal {
  const reveal = Boolean(options.revealShowdown);
  const lastActions = options.lastActionById || new Map<string, string>();
  const phase = String(room.phase || "preflop");
  const street = (
    ["preflop", "flop", "turn", "river", "showdown", "complete"].includes(phase)
      ? phase
      : "preflop"
  ) as ReplayTableStateLocal["street"];
  return {
    street,
    pot: Math.max(0, Number(room.pot) || 0),
    toCall: Math.max(0, Number(room.toCall) || 0),
    currentBet: Math.max(0, Number(room.currentBet) || 0),
    minRaiseTo: Math.max(0, Number(room.minRaiseTo) || 0),
    boardCodes: (room.community || []).map((card) => card?.code || "").filter(Boolean),
    actingSeatId: room.turn || null,
    winners: (room.winners || []).map((winner) => ({
      playerId: winner.playerId,
      name: winner.name,
      amount: winner.amount,
      hand: winner.hand || undefined,
    })),
    seats: (room.players || []).map((player) => {
      const codes = (player.cards || [])
        .map((card) => card?.code || "")
        .filter(Boolean);
      const showHoles =
        Boolean(player.isYou) ||
        (reveal && (player.showCards || codes.length === 2) && codes.length === 2);
      return {
        id: player.id,
        name: player.name,
        isHero: Boolean(player.isYou),
        isBot: Boolean(player.isBot),
        stack: player.stack,
        bet: player.bet,
        folded: Boolean(player.folded),
        allIn: Boolean(player.allIn),
        dealer: Boolean(player.dealer),
        isSmallBlind: Boolean(player.isSmallBlind),
        isBigBlind: Boolean(player.isBigBlind),
        isTurn: Boolean(player.isTurn || player.id === room.turn),
        holeCodes: showHoles && codes.length === 2 ? [codes[0]!, codes[1]!] : null,
        lastAction: lastActions.get(player.id) || null,
      };
    }),
  };
}

function resetHandRecording(handNumber: number, heroId: string, heroCodes: [string, string]) {
  handRecording = { handNumber, heroId, heroCodes, steps: [] };
  handReviewLastLogId = "";
}

function ensureHandRecording(room: ClientRoom) {
  if (typeof handReviewFeatureAvailable !== "function" || !handReviewFeatureAvailable(room)) {
    return null;
  }
  const hero = room.players?.find((player) => player.isYou && !player.isBot);
  if (!hero) return null;
  const codes = (hero.cards || []).map((card) => card?.code || "").filter(Boolean);
  if (codes.length !== 2) return handRecording;
  const handNumber = Number(room.handNumber) || 0;
  if (!handRecording || handRecording.handNumber !== handNumber) {
    resetHandRecording(handNumber, hero.id, [codes[0]!, codes[1]!]);
  }
  return handRecording;
}

function latestActionByPlayer(room: ClientRoom): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of room.actionLog || []) {
    if (!entry.playerId || !entry.action) continue;
    if (/posts (small|big) blind/i.test(entry.action)) continue;
    map.set(entry.playerId, entry.action);
  }
  return map;
}

/** Ensure the replay ends with a landable result frame (hero decisions + result). */
function appendHandReviewResultStep(room: ClientRoom, recording: NonNullable<typeof handRecording>) {
  if (recording.steps.length === 0) return false;
  if (recording.steps.at(-1)?.kind === "result") return false;
  if (!(room.phase === "complete" || (room.winners || []).length > 0)) return false;
  recording.steps.push({
    id: `${recording.handNumber}-result`,
    label: room.winners?.[0] ? `${room.winners[0].name} wins` : "Hand over",
    actorId: room.winners?.[0]?.playerId || null,
    kind: "result",
    table: snapshotReplayTable(room, {
      revealShowdown: true,
      lastActionById: latestActionByPlayer(room),
    }),
  });
  return true;
}

function recordHandReviewRoom(room: ClientRoom) {
  const recording = ensureHandRecording(room);
  if (!recording) return;
  const entries = (room.actionLog || []).filter((entry) => entry.phase !== "lobby");
  const latest = entries.at(-1);
  if (!latest || latest.id === handReviewLastLogId) {
    // Finalize result frame when winners arrive (same log id as last recorded action).
    if (appendHandReviewResultStep(room, recording)) {
      finalizeHandReplay();
    }
    return;
  }
  handReviewLastLogId = latest.id;
  const actionText = String(latest.action || latest.text || "").trim();
  const isStreet = /dealt/i.test(actionText);
  const isShow = /shows hand/i.test(actionText);
  const kind = isStreet ? "street" : isShow ? "showdown" : "action";
  // Skip duplicate after-frame when the prior step was this hero decision (already recorded).
  const lastStep = recording.steps.at(-1);
  if (
    lastStep?.kind === "hero_decision" &&
    latest.playerId &&
    lastStep.actorId === latest.playerId
  ) {
    // Fold often completes in the same update — still append the result frame.
    if (appendHandReviewResultStep(room, recording)) {
      finalizeHandReplay();
    }
    return;
  }
  recording.steps.push({
    id: latest.id,
    label: actionText || latest.text || "Action",
    actorId: latest.playerId || null,
    kind,
    table: snapshotReplayTable(room, {
      revealShowdown: room.phase === "showdown" || room.phase === "complete" || isShow,
      lastActionById: latestActionByPlayer(room),
    }),
  });
  if (room.phase === "complete" || (room.winners || []).length > 0) {
    appendHandReviewResultStep(room, recording);
    finalizeHandReplay();
  }
}

function captureHandReviewDecision(payload: Record<string, unknown>) {
  if (!state || typeof handReviewFeatureAvailable !== "function" || !handReviewFeatureAvailable(state)) {
    return;
  }
  if (!state.isYourTurn) return;
  if (!["preflop", "flop", "turn", "river"].includes(state.phase)) return;
  const hero = activeHero();
  if (!hero || !hero.cards || hero.cards.length < 2) return;
  const codes = hero.cards.map((card) => card?.code || "").filter(Boolean);
  if (codes.length !== 2) return;
  const recording = ensureHandRecording(state);
  if (!recording) return;

  const type = String(payload.type || "");
  if (!["fold", "check", "call", "bet", "raise"].includes(type)) return;
  const taken = type as HandReviewDecisionLocal["taken"];
  const raiseTo =
    taken === "raise" || taken === "bet"
      ? Math.max(0, Math.floor(Number(payload.raiseTo) || 0))
      : null;
  const boardCodes = (state.community || []).map((card) => card?.code || "").filter(Boolean);
  const liveOpponents = (state.players || []).filter(
    (player) =>
      !player.isYou && !player.folded && (player.stack > 0 || player.allIn || player.invested > 0),
  );
  const toCall = Math.max(0, Number(state.toCall) || 0);
  const pot = Math.max(0, Number(state.pot) || 0);
  const currentBet = Math.max(0, Number(state.currentBet) || 0);
  const minRaiseTo = Math.max(
    0,
    Number(state.minRaiseTo) || currentBet + (Number(state.minRaise) || 0),
  );
  const maxRaiseTo = hero.bet + hero.stack;
  const raiseStep = Math.max(1, Math.floor(Number(state.bigBlind) || 1));
  let equity: number | undefined;
  if (typeof Coach !== "undefined" && Coach.buildCoachSuggestion) {
    const suggestion = Coach.buildCoachSuggestion(state, { iterations: 80 });
    if (suggestion && typeof suggestion.equity === "number") equity = suggestion.equity;
  }
  const id = `${recording.handNumber}-hero-${recording.steps.length + 1}`;
  const label =
    taken === "raise" || taken === "bet"
      ? `You ${taken === "bet" ? "bet" : "raise to"} ${raiseTo}`
      : `You ${taken}`;
  recording.steps.push({
    id,
    label,
    actorId: hero.id,
    kind: "hero_decision",
    table: snapshotReplayTable(state, { lastActionById: latestActionByPlayer(state) }),
    heroDecision: {
      id,
      street: state.phase as HandReviewDecisionLocal["street"],
      boardCodes,
      heroCodes: [codes[0]!, codes[1]!],
      pot,
      toCall,
      currentBet,
      heroStack: hero.stack,
      opponentStacks: liveOpponents.map((player) => player.stack),
      taken,
      raiseTo,
      equity,
      minRaiseTo,
      maxRaiseTo,
      raiseStep,
      canRaise: heroCanRaiseMeaningfully(state, hero),
    },
  });
}

function finalizeHandReplay() {
  if (!handRecording || !handRecording.steps.length) return;
  if (typeof HandReview === "undefined" || typeof HandReview.buildHandReplay !== "function") {
    return;
  }
  lastHandReplay = HandReview.buildHandReplay(handRecording) as HandReplayLocal;
  if (typeof syncHandReviewBtn === "function") syncHandReviewBtn();
}

function hasReviewableCompletedHand(room: ClientRoom | null | undefined = state) {
  if (!room) return false;
  if (!lastHandReplay || lastHandReplay.steps.length === 0) return false;
  // Fresh lobby before any deal must never inherit a prior room's replay.
  const handNumber = Number(room.handNumber) || 0;
  if (room.phase === "lobby" && handNumber <= 0 && !(room.winners?.length > 0)) {
    return false;
  }
  return true;
}

function maybeOfferHandReview(room: ClientRoom) {
  if (typeof handReviewFeatureAvailable !== "function" || !handReviewFeatureAvailable(room)) {
    lastHandReplay = null;
    handRecording = null;
    if (typeof syncHandReviewBtn === "function") syncHandReviewBtn();
    return;
  }
  const handNumber = Number(room.handNumber) || 0;
  if (room.phase === "lobby" && handNumber <= 0 && !(room.winners?.length > 0)) {
    lastHandReplay = null;
    handRecording = null;
    if (typeof syncHandReviewBtn === "function") syncHandReviewBtn();
    return;
  }
  const betweenHands =
    room.phase === "complete" ||
    (room.canReady && (room.winners?.length || 0) > 0);
  if (betweenHands && handRecording && handRecording.steps.length > 0) {
    finalizeHandReplay();
  }
  if (typeof syncHandReviewBtn === "function") syncHandReviewBtn();
}

function addReviewHandButton() {
  if (!hasReviewableCompletedHand()) return;
  if (typeof handReviewFeatureAvailable !== "function" || !handReviewFeatureAvailable()) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.addEventListener("click", () => openHandReview());
  gameButtons.appendChild(button);
  setButtonLabel(button, "Review hand", keybindLabel(keybinds.reviewHand || "v"));
}

/**
 * Optional "Show hand" after a fold-win / muck. Skip in bot-only games
 * (offline practice or every other seated player is a bot) — there is no
 * human left to show to. Multi-human rooms keep the button.
 */
function isHeroVsBotsOnly(room: ClientRoom): boolean {
  if (typeof handReviewFeatureAvailable === "function" && handReviewFeatureAvailable(room)) {
    return true;
  }
  if (room.offline) {
    const hero = (room.players || []).find((player) => player.isYou && !player.isBot);
    if (!hero) return Boolean(room.offline);
    return (room.players || []).every((player) => player.isYou || player.isBot);
  }
  const hero = (room.players || []).find((player) => player.isYou && !player.isBot);
  if (!hero) return false;
  const others = (room.players || []).filter((player) => !player.isYou);
  return others.length > 0 && others.every((player) => player.isBot);
}

function showHandButtonAvailable(room: ClientRoom): boolean {
  return Boolean(room.canShowHand) && !isHeroVsBotsOnly(room);
}

function roomFromReplayTable(
  table: ReplayTableStateLocal,
  template: ClientRoom,
): ClientRoom {
  const community = table.boardCodes.map((code) => publicCardFromCode(code));
  const players = table.seats.map((seat) => {
    const base = template.players.find((player) => player.id === seat.id);
    const holes = seat.holeCodes
      ? seat.holeCodes.map((code) => publicCardFromCode(code))
      : [null, null];
    return {
      ...(base || {
        id: seat.id,
        name: seat.name,
        color: "#888",
        stackCents: 0,
        buyInsCents: 0,
        cashOutCents: 0,
        netCents: 0,
        betCents: 0,
        invested: seat.bet,
        investedCents: 0,
        sittingOut: false,
        waitingForNextHand: false,
        connected: true,
        botProfile: null,
        botStyle: null,
        botStyleShort: null,
        showCards: false,
        ready: false,
        disconnectExpiresAt: null,
        isHost: false,
        canMakeHost: false,
        canKick: false,
      }),
      name: seat.name,
      stack: seat.stack,
      bet: seat.bet,
      folded: seat.folded,
      allIn: seat.allIn,
      isBot: seat.isBot,
      isYou: seat.isHero,
      dealer: seat.dealer,
      isSmallBlind: seat.isSmallBlind,
      isBigBlind: seat.isBigBlind,
      isTurn: seat.isTurn,
      showCards: Boolean(seat.holeCodes && !seat.isHero),
      cards: holes,
    } as ClientPlayer;
  });
  return {
    ...template,
    phase: table.street === "complete" ? "complete" : table.street === "showdown" ? "showdown" : table.street,
    pot: table.pot,
    toCall: table.toCall,
    currentBet: table.currentBet,
    minRaiseTo: table.minRaiseTo,
    community,
    rabbitCards: [],
    winners: table.winners.map((winner) => ({
      playerId: winner.playerId,
      name: winner.name,
      amount: winner.amount,
      amountCents: 0,
      hand: winner.hand || "",
    })),
    turn: table.actingSeatId,
    isYourTurn: false,
    canReady: false,
    canRaise: false,
    canShove: false,
    canShowHand: false,
    canStart: false,
    canNextHand: false,
    canAddBot: false,
    canRebuy: false,
    bustedOut: false,
    players,
  };
}

function bustCardRenderCache() {
  // Review rebuilds PublicCards from codes; bust signatures so suit glyphs
  // (♥♦♣♠) always replace any stale letter-suit DOM from a prior paint.
  lastHeroSignature = "";
  lastCommunitySignature = null;
}

function isHandReviewLandableStep(step: HandReplayLocal["steps"][number] | null | undefined) {
  if (!step) return false;
  return Boolean(step.isHeroDecision || step.kind === "result");
}

/** Hero decisions + final result — the only frames Next/Back/dots/keys land on. */
function handReviewLandableIndexes(): number[] {
  const steps = lastHandReplay?.steps || [];
  const indexes: number[] = [];
  steps.forEach((step, idx) => {
    if (isHandReviewLandableStep(step)) indexes.push(idx);
  });
  return indexes;
}

function syncHandReviewNavButtons() {
  const landable = handReviewLandableIndexes();
  const pos = landable.indexOf(handReviewStepIndex);
  const atStart = landable.length === 0 || pos <= 0;
  const atEnd = landable.length === 0 || pos < 0 || pos >= landable.length - 1;
  for (const [btn, disabled] of [
    [handReviewStartBtn, atStart],
    [handReviewPrevBtn, atStart],
    [handReviewNextBtn, atEnd],
    [handReviewEndBtn, atEnd],
  ] as const) {
    if (!btn) continue;
    btn.disabled = disabled;
    btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    btn.tabIndex = disabled ? -1 : 0;
  }
}

function handReviewJumpToStart() {
  const landable = handReviewLandableIndexes();
  if (!landable.length) return;
  paintHandReviewStep(landable[0]!);
}

function handReviewJumpToEnd() {
  const landable = handReviewLandableIndexes();
  if (!landable.length) return;
  paintHandReviewStep(landable[landable.length - 1]!);
}

function syncHandReviewRetryingClass() {
  document.body.classList.toggle("hand-review-retrying", Boolean(handReviewActive && handReviewRetryItem));
}

function openHandReview() {
  if (!lastHandReplay || !lastHandReplay.steps.length || !state) return;
  if (handReviewActive) return;
  handReviewSavedState = state;
  handReviewActive = true;
  handReviewRetryItem = null;
  handReviewRevealedSteps = new Set();
  // Force the first landable paint (sentinel so paintHandReviewStep does not no-op).
  handReviewStepIndex = -1;
  document.body.classList.add("hand-review-open");
  syncHandReviewRetryingClass();
  handReviewChrome?.classList.remove("hidden");
  if (handReviewSummary) handReviewSummary.textContent = lastHandReplay.summary;
  bustCardRenderCache();
  handReviewJumpToStart();
}

function hideHandReview() {
  if (!handReviewActive) return;
  handReviewActive = false;
  handReviewRetryItem = null;
  handReviewRevealedSteps = new Set();
  document.body.classList.remove("hand-review-open", "hand-review-retrying");
  handReviewChrome?.classList.add("hidden");
  if (handReviewRetryBar) {
    handReviewRetryBar.classList.add("is-idle");
    handReviewRetryBar.classList.remove("hidden");
    handReviewRetryBar.replaceChildren();
  }
  if (handReviewVerdict) {
    handReviewVerdict.className = "hand-review-verdict is-idle";
    handReviewVerdict.replaceChildren();
  }
  if (handReviewSavedState) {
    state = handReviewSavedState;
    handReviewSavedState = null;
  }
  render();
}

function paintHandReviewStep(index: number, options: { force?: boolean } = {}) {
  if (!lastHandReplay || !handReviewSavedState) return;
  const steps = lastHandReplay.steps;
  if (!steps.length) return;
  const next = Math.max(0, Math.min(steps.length - 1, index));
  // Already on this frame: do not re-render or re-animate cards (esp. at ends).
  // `force` exits retry-answer chrome back onto the same landable step.
  if (next === handReviewStepIndex && !options.force) {
    syncHandReviewNavButtons();
    return;
  }
  handReviewStepIndex = next;
  const step = steps[handReviewStepIndex]!;
  handReviewRetryItem = null;
  syncHandReviewRetryingClass();
  // Keep lastHero/Community signatures so unchanged cards stay still between steps.
  state = roomFromReplayTable(step.table, handReviewSavedState);
  render();
  // Review chrome owns the control panel content.
  renderHandReviewChrome(step);
  syncHandReviewNavButtons();
}

/**
 * Leave the retry-answered chrome: restore the normal step view, and advance to the
 * next landable frame (usually the result) when one exists.
 */
function continueHandReview() {
  if (!handReviewActive || !lastHandReplay) return;
  const landable = handReviewLandableIndexes();
  const pos = landable.indexOf(handReviewStepIndex);
  const hasNext = pos >= 0 && pos < landable.length - 1;
  if (hasNext) {
    paintHandReviewStep(landable[pos + 1]!);
    return;
  }
  // Same step (e.g. last landable): force a re-paint so Continue is not a no-op.
  paintHandReviewStep(handReviewStepIndex, { force: true });
}

function handReviewWhy(item: HandReviewItemLocal): string {
  if (typeof HandReview !== "undefined" && HandReview.formatVerdictWhy) {
    return HandReview.formatVerdictWhy(item);
  }
  return item.reason;
}

function handReviewBadge(item: HandReviewItemLocal): string {
  if (typeof HandReview !== "undefined" && HandReview.formatVerdictBadge) {
    return HandReview.formatVerdictBadge(item);
  }
  // FE0E keeps ✓/✗ as text glyphs on iOS (avoids emoji presentation).
  const mark =
    item.verdict === "mistake" ? "✗\uFE0E" : item.verdict === "best" ? "✓\uFE0E" : "~";
  return `${mark} ${item.badge}`;
}

function handReviewMistakeNudge(): string {
  if (typeof HandReview !== "undefined" && HandReview.formatMistakeNudge) {
    return HandReview.formatMistakeNudge();
  }
  return "There was a better play here.";
}

/**
 * Always keeps the verdict slot visible (fixed height). Never toggles display:none —
 * bot steps and idle states use muted/empty content so stepping doesn't jump.
 */
function paintHandReviewVerdict(opts: {
  kind: "decision" | "spoiler" | "correct" | "retry-wrong" | "context" | "prompt" | "idle";
  item?: HandReviewItemLocal | null;
  context?: string;
  prompt?: string;
}) {
  if (!handReviewVerdict) return;
  handReviewVerdict.classList.remove("hidden");
  if (opts.kind === "idle") {
    handReviewVerdict.className = "hand-review-verdict is-idle";
    handReviewVerdict.replaceChildren();
    return;
  }
  if (opts.kind === "prompt" && opts.prompt) {
    handReviewVerdict.textContent = opts.prompt;
    handReviewVerdict.className = "hand-review-verdict is-prompt";
    return;
  }
  if (opts.kind === "context") {
    const detail = document.createElement("span");
    detail.className = "hand-review-verdict-why";
    detail.textContent = opts.context || "";
    handReviewVerdict.replaceChildren(detail);
    handReviewVerdict.className = "hand-review-verdict is-context";
    return;
  }
  if (opts.kind === "spoiler" && opts.item) {
    const mark = document.createElement("span");
    mark.className = "hand-review-verdict-mark";
    mark.textContent = "✗\uFE0E Mistake";
    const detail = document.createElement("span");
    detail.className = "hand-review-verdict-why";
    detail.textContent = handReviewMistakeNudge();
    handReviewVerdict.replaceChildren(mark, detail);
    handReviewVerdict.className = "hand-review-verdict is-mistake is-spoiler";
    return;
  }
  // Retry feedback is labeled separately from the header's original-mistake count.
  if ((opts.kind === "correct" || opts.kind === "retry-wrong") && opts.item) {
    const mark = document.createElement("span");
    mark.className = "hand-review-verdict-mark";
    mark.textContent =
      opts.kind === "correct" ? "Your retry: Correct" : "Your retry: Still off";
    const detail = document.createElement("span");
    detail.className = "hand-review-verdict-why";
    detail.textContent = handReviewWhy(opts.item);
    handReviewVerdict.replaceChildren(mark, detail);
    handReviewVerdict.className = `hand-review-verdict is-${opts.kind === "correct" ? "best" : "mistake"}`;
    return;
  }
  if (opts.item) {
    const mark = document.createElement("span");
    mark.className = "hand-review-verdict-mark";
    mark.textContent = handReviewBadge(opts.item);
    const detail = document.createElement("span");
    detail.className = "hand-review-verdict-why";
    detail.textContent = handReviewWhy(opts.item);
    handReviewVerdict.replaceChildren(mark, detail);
    handReviewVerdict.className = `hand-review-verdict is-${opts.item.verdict}`;
    return;
  }
  handReviewVerdict.className = "hand-review-verdict is-idle";
  handReviewVerdict.replaceChildren();
}

function setHandReviewRetryIdle() {
  if (!handReviewRetryBar) return;
  handReviewRetryBar.replaceChildren();
  handReviewRetryBar.classList.add("is-idle");
  handReviewRetryBar.classList.remove("hidden");
}

function renderMistakeRetryActions(item: HandReviewItemLocal, beforeTable: ReplayTableStateLocal) {
  if (!handReviewRetryBar) return;
  const heroStack =
    beforeTable.seats.find((seat) => seat.isHero)?.stack ?? item.pot;
  const tryBtn = document.createElement("button");
  tryBtn.type = "button";
  tryBtn.className = "hand-review-try-again has-shortcut";
  tryBtn.innerHTML = `<span>Try again</span><kbd aria-hidden="true">T</kbd>`;
  tryBtn.setAttribute("aria-label", "Try again (T)");
  tryBtn.addEventListener("click", () => startHandReviewRetry(item, beforeTable, heroStack));

  const showBtn = document.createElement("button");
  showBtn.type = "button";
  showBtn.className = "secondary hand-review-show-answer has-shortcut";
  showBtn.innerHTML = `<span>Show answer</span><kbd aria-hidden="true">A</kbd>`;
  showBtn.setAttribute("aria-label", "Show answer (A)");
  showBtn.addEventListener("click", () => {
    handReviewRevealedSteps.add(handReviewStepIndex);
    paintHandReviewVerdict({ kind: "decision", item });
    // Keep Try again available after revealing.
    renderMistakeRetryActions(item, beforeTable);
  });

  handReviewRetryBar.replaceChildren(tryBtn, showBtn);
  handReviewRetryBar.classList.remove("is-idle", "hidden");
}

function formatHandReviewStepLabel(step: HandReplayLocal["steps"][number]): string {
  const streetRaw = String(step.table?.street || "");
  const street =
    streetRaw === "preflop"
      ? "Preflop"
      : streetRaw === "flop"
        ? "Flop"
        : streetRaw === "turn"
          ? "Turn"
          : streetRaw === "river"
            ? "River"
            : streetRaw
              ? streetRaw.charAt(0).toUpperCase() + streetRaw.slice(1)
              : "";
  const raw = String(step.label || "").trim();
  if (!raw) return street || "Step";
  // Already "River · You check" style.
  if (street && raw.toLowerCase().startsWith(street.toLowerCase())) return raw;
  if (step.kind === "street" || /^(preflop|flop|turn|river)$/i.test(raw)) {
    return street || raw;
  }
  return street ? `${street} · ${raw}` : raw;
}

function renderHandReviewChrome(step: HandReplayLocal["steps"][number]) {
  if (handReviewStepLabel) {
    const landable = handReviewLandableIndexes();
    const ordinal = landable.indexOf(handReviewStepIndex);
    const prefix =
      ordinal >= 0
        ? `${ordinal + 1}/${landable.length || 1}`
        : `${handReviewStepIndex + 1}/${(lastHandReplay?.steps || []).length || 1}`;
    handReviewStepLabel.textContent = `${prefix} · ${formatHandReviewStepLabel(step)}`;
  }

  if (step.decision) {
    const revealed = handReviewRevealedSteps.has(handReviewStepIndex);
    if (step.decision.verdict === "mistake" && !revealed) {
      paintHandReviewVerdict({ kind: "spoiler", item: step.decision });
      renderMistakeRetryActions(step.decision, step.table);
    } else {
      paintHandReviewVerdict({ kind: "decision", item: step.decision });
      if (step.decision.verdict === "mistake") {
        renderMistakeRetryActions(step.decision, step.table);
      } else {
        setHandReviewRetryIdle();
      }
    }
  } else {
    // Result (and any non-decision landable): muted context keeps the slot height stable.
    paintHandReviewVerdict({
      kind: "context",
      context: step.label || "Hand result",
    });
    setHandReviewRetryIdle();
  }

  if (handReviewTimeline && lastHandReplay) {
    // Dots = hero decisions + final result (bot/street frames are never landed on).
    handReviewTimeline.replaceChildren();
    const landable = handReviewLandableIndexes();
    landable.forEach((idx, ordinal) => {
      const dotStep = lastHandReplay!.steps[idx]!;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hand-review-dot";
      if (dotStep.isHeroDecision) {
        btn.classList.add("is-hero");
        if (dotStep.decision) btn.classList.add(`is-${dotStep.decision.verdict}`);
      } else {
        btn.classList.add("is-result");
      }
      if (idx === handReviewStepIndex) btn.classList.add("is-active");
      btn.setAttribute("role", "listitem");
      const label =
        dotStep.isHeroDecision
          ? `Decision ${ordinal + 1}: ${dotStep.label}`
          : `Result: ${dotStep.label}`;
      btn.setAttribute("aria-label", label);
      btn.addEventListener("click", () => paintHandReviewStep(idx));
      handReviewTimeline.append(btn);
    });
    // Keep the active dot in view without shifting layout of neighbors.
    const activeEl = handReviewTimeline.querySelector(".hand-review-dot.is-active");
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  gameButtons.innerHTML = "";
  turnInfo.textContent = step.decision
    ? `You ${step.decision.taken}${step.decision.raiseTo != null ? ` ${step.decision.raiseTo}` : ""}`
    : step.label;
  turnInfo.classList.toggle("your-turn", Boolean(step.decision));
  setBetControlsReserved(false);
}

/**
 * Grade a retry attempt from the shared Fold / Call-Raise controls (same path
 * as live table + Trainer). Never paints a bespoke 3-button Fold|Call|Raise row.
 */
function submitHandReviewRetryAction(payload: Record<string, unknown>) {
  if (!handReviewRetryItem) return;
  if (typeof HandReview === "undefined" || typeof HandReview.gradeRetry !== "function") return;
  const item = handReviewRetryItem;
  const type = String(payload.type || "");
  if (!["fold", "check", "call", "bet", "raise"].includes(type)) return;
  const taken = type as "fold" | "check" | "call" | "bet" | "raise";
  const result = HandReview.gradeRetry(item, taken);
  handReviewRevealedSteps.add(handReviewStepIndex);
  handReviewRetryItem = null;
  syncHandReviewRetryingClass();
  // Collapse live action controls; nav chrome stays below.
  gameButtons.innerHTML = "";
  setBetControlsReserved(true);
  mergePassiveConfirm = false;
  confirmActionBtn = null;
  if (result.correct) {
    paintHandReviewVerdict({ kind: "correct", item });
  } else {
    paintHandReviewVerdict({ kind: "retry-wrong", item });
  }
  if (handReviewRetryBar) {
    handReviewRetryBar.replaceChildren();
    const cont = document.createElement("button");
    cont.type = "button";
    cont.className = "ghost hand-review-continue";
    cont.textContent = "Continue review";
    cont.setAttribute("aria-label", "Continue review (Enter)");
    cont.addEventListener("click", () => continueHandReview());
    handReviewRetryBar.append(cont);
    handReviewRetryBar.classList.remove("is-idle", "hidden");
  }
  turnInfo.textContent = result.correct ? "Correct" : "Keep reviewing";
  turnInfo.classList.remove("your-turn");
  reserveActionSpace();
  syncHandReviewNavButtons();
}

function startHandReviewRetry(
  item: HandReviewItemLocal,
  beforeTable: ReplayTableStateLocal,
  heroStack: number,
) {
  if (!handReviewSavedState) return;
  handReviewRetryItem = item;
  syncHandReviewRetryingClass();
  // Paint the decision's before-state on the table.
  const template = handReviewSavedState;
  const table: ReplayTableStateLocal = {
    ...beforeTable,
    street: item.street,
    pot: item.pot,
    toCall: item.toCall,
    currentBet: item.currentBet,
    minRaiseTo: Math.max(beforeTable.minRaiseTo || 0, item.currentBet + (template.bigBlind || 20)),
    boardCodes: item.boardCodes.slice(),
    actingSeatId: beforeTable.seats.find((seat) => seat.isHero)?.id || null,
    winners: [],
    seats: beforeTable.seats.map((seat) => ({
      ...seat,
      stack: seat.isHero ? heroStack : seat.stack,
      isTurn: seat.isHero,
      holeCodes: seat.isHero ? [item.heroCodes[0], item.heroCodes[1]] : null,
      // Keep intervening bot last-action pills from the before-state.
      lastAction: seat.isHero ? null : seat.lastAction,
    })),
  };
  bustCardRenderCache();
  state = roomFromReplayTable(table, template);
  state.isYourTurn = true;
  state.toCall = item.toCall;
  state.currentBet = item.currentBet;
  state.pot = item.pot;
  state.minRaiseTo = table.minRaiseTo;
  state.phase = item.street;
  const hero = state.players.find((player) => player.isYou && !player.isBot);
  if (hero) {
    state.canRaise = heroCanRaiseMeaningfully(state, hero);
    state.canShove = hero.bet + hero.stack > state.currentBet;
  } else {
    state.canRaise = true;
    state.canShove = true;
  }
  // render() → renderControlsContent sees handReviewRetryItem and paints live Fold + Call/Raise.
  render();

  // Keep spoiler verdict until they pick — don't leak the answer in the prompt.
  paintHandReviewVerdict({
    kind: "prompt",
    prompt: `Your turn · Pot ${item.pot}${item.toCall > 0 ? ` · Call ${item.toCall}` : ""}`,
  });
  // No bespoke Fold|Call|Raise row in the retry bar — actions live in gameButtons.
  if (handReviewRetryBar) {
    handReviewRetryBar.replaceChildren();
    handReviewRetryBar.classList.add("is-idle");
    handReviewRetryBar.classList.remove("hidden");
  }
  syncHandReviewNavButtons();
}

function handReviewStepBy(delta: number) {
  if (!handReviewActive || handReviewRetryItem) return;
  const landable = handReviewLandableIndexes();
  if (!landable.length) return;
  const pos = landable.indexOf(handReviewStepIndex);
  if (pos < 0) {
    // Rare: landed off-grid — snap to the next landable in the step direction.
    if (delta > 0) {
      const next = landable.find((idx) => idx > handReviewStepIndex);
      if (next == null) return;
      paintHandReviewStep(next);
      return;
    }
    for (let i = landable.length - 1; i >= 0; i -= 1) {
      const idx = landable[i]!;
      if (idx < handReviewStepIndex) {
        paintHandReviewStep(idx);
        return;
      }
    }
    return;
  }
  const nextPos = pos + (delta < 0 ? -1 : 1);
  // At an end: no-op — do not re-paint or re-animate cards.
  if (nextPos < 0 || nextPos >= landable.length) return;
  paintHandReviewStep(landable[nextPos]!);
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
    (child) =>
      !child.classList.contains("action-placeholder") &&
      !child.classList.contains("action-links") &&
      child.tagName === "BUTTON",
  );
  // Drop the reserved bet row when it would only leave empty space: pre-hand lobby, or
  // Fold/Call-only turns (short all-in / no reopen) where Raise isn't offered.
  const handLive = Boolean(state && !["lobby", "complete", "gameover"].includes(state.phase));
  const compact = reserved && !hasResult && (!handLive || hasButtons);
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

  // Replay chrome owns the panel while open — except in-spot retry, which reuses
  // the live Fold + Call/Raise controls (same component as the table / Trainer).
  if (handReviewActive) {
    if (handReviewRetryItem) {
      const reviewHero = activeHero();
      if (reviewHero) {
        renderHeroActionControls(reviewHero, false);
        turnInfo.textContent =
          (state.toCall || 0) > 0
            ? `Call ${formatAmount(state.toCall, state.toCallCents)}`
            : "Check or bet";
        turnInfo.classList.add("your-turn");
      } else {
        setBetControlsReserved(true);
      }
      return;
    }
    setBetControlsReserved(false);
    betControls.classList.add("is-reserved");
    betControls.setAttribute("aria-hidden", "true");
    betControls.setAttribute("inert", "");
    raiseActionBtn.classList.add("hidden");
    return;
  }

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

  // Never mix between-hands controls with in-hand actions — even if state is inconsistent.
  const betweenHands = ["lobby", "complete", "gameover"].includes(room.phase);
  const heroToAct =
    Boolean(room.isYourTurn && hero) && isBettingPhase(room.phase) && !betweenHands;

  if (!heroToAct) {
    // Main order: + Add bot (dashed secondary), then Ready up. Max two buttons per row —
    // Review follows when present (wraps to the next row). Show hand stays a text link.
    if (room.canAddBot && betweenHands) {
      addButton("+ Add bot", "room:addBot", "secondary lobby-add-bot");
    }
    if (room.canReady && betweenHands) {
      const readyShortcut = room.isReady
        ? keybindLabel(keybinds.ready)
        : [keybinds.ready, keybinds.call].filter(Boolean).map(keybindLabel).join(" / ");
      addButton(
        room.isReady ? "Not ready" : "Ready up",
        "game:ready",
        room.isReady ? "secondary" : "",
        readyShortcut,
      );
      maybeOfferHandReview(room);
      addReviewHandButton();
    }
    // Show hand is for multi-human tables (muck / reveal). Hide vs bots — no audience.
    if (showHandButtonAvailable(room)) {
      const showShortcut = keybindLabel(keybinds.showHand);
      appendActionLinks([
        textActionLink(
          showShortcut ? `Show hand (${showShortcut})` : "Show hand",
          () => emitWithAck("game:showCards", {}),
        ),
      ]);
    }
  }

  if (!heroToAct) {
    if (betweenHands) {
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
    // Keep Fold/Call + raise shell mounted (disabled) while still in the hand.
    // Folded / all-in use the reserved idle slot instead (same height, no live buttons).
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
  renderHeroActionControls(hero!, false);
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

/**
 * True when a raise/shove is a legal, meaningful action for the hero.
 * Short all-ins that did not reopen (canRaise/canShove false) must not show Raise.
 * When every live opponent is already all-in, raising builds a dead side pot — Call only.
 *
 * `ignoreRaiseOpen`: off-turn disabled shell — raiseEligible clears after you act, but the
 * raise row must stay mounted so the panel height does not jump between turns.
 */
function heroCanRaiseMeaningfully(
  room: ClientRoom,
  hero: ClientPlayer,
  options: { ignoreRaiseOpen?: boolean } = {},
): boolean {
  const maxRaise = hero.bet + hero.stack;
  if (maxRaise <= room.currentBet) return false;
  if (!options.ignoreRaiseOpen && !(room.canRaise || room.canShove)) return false;
  const liveVillains = (room.players || []).filter(
    (player) => !player.isYou && !player.folded && player.id !== hero.id,
  );
  if (liveVillains.length === 0) return false;
  // Nobody left who can put more chips in behind a raise.
  if (liveVillains.every((player) => player.allIn || player.stack <= 0)) return false;
  return true;
}

function renderHeroActionControls(hero: ClientPlayer, disabled: boolean) {
  if (!state) return;
  const maxRaise = hero.bet + hero.stack;
  const canBetMore = maxRaise > state.currentBet;
  const canRaiseUi = heroCanRaiseMeaningfully(state, hero, {
    ignoreRaiseOpen: disabled,
  });
  // Merge Check/Bet or Call/Raise only when a raise is actually available.
  mergePassiveConfirm = canRaiseUi;

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

  // Bet panel only when raise/shove is legal. Facing a short all-in that did not
  // reopen — or when every villain is all-in — Call/Check alone is the UI.
  // Off-turn uses ignoreRaiseOpen so the raise shell stays for layout stability.
  // reserveActionSpace() then collapses the empty raise slot (is-compact) only for
  // true Call-only spots.
  if (canRaiseUi && canBetMore) configureRaiseControls(hero, disabled);
  else setBetControlsReserved(true);
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
  // Merged Call/Raise: open on Call (or Check when free). First + / arrow / preset
  // snaps to the min legal raise via legalRaiseTo — never open already raising.
  const facingBet = (state.toCall || 0) > 0;
  const initialValue = RaiseSizing.initialRaiseTo({
    facingBet,
    mergePassiveConfirm,
    currentBet: state.currentBet,
    minRaiseTo: minRaise,
    maxRaiseTo: maxRaise,
    preferredRaiseTo: preferredRaise,
  });
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
    button.setAttribute("aria-disabled", disabled ? "true" : "false");
    button.tabIndex = disabled ? -1 : 0;
    button.addEventListener("click", () => {
      if (disabled) return;
      setRaiseState({ value: option.value });
      // Tapping All in sends the all-in raise-to immediately on your turn.
      if (option.allIn && state?.isYourTurn) {
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
  // Check detent → 0. Facing a bet → never paint 0 (Call detent shows matched bet).
  const displayChips = RaiseSizing.displayRaiseAmount({
    facingBet: (state.toCall || 0) > 0,
    atDetent: atPassiveDetent(),
    value: raiseState.value,
  });
  raiseAmount.textContent = formatAmount(
    displayChips,
    Math.round(displayChips * (state?.chipValueCents || 0)),
  );
  const allInOnly = raiseState.max <= raiseState.min || raiseState.value >= raiseState.max;
  if (!mergePassiveConfirm) {
    setButtonLabel(
      raiseActionBtn,
      allInOnly ? "All in" : state?.currentBet > 0 ? "Raise" : "Bet",
      keybindLabel(keybinds.raise),
    );
  }
  raiseActionBtn.disabled = raiseControlsDisabled;
  raiseActionBtn.setAttribute("aria-disabled", raiseControlsDisabled ? "true" : "false");
  raiseActionBtn.tabIndex = raiseControlsDisabled ? -1 : 0;
  const minusDisabled =
    raiseControlsDisabled ||
    (mergePassiveConfirm ? atPassiveDetent() : raiseState.value <= raiseState.min);
  const plusDisabled = raiseControlsDisabled || raiseState.value >= raiseState.max;
  raiseMinus.disabled = minusDisabled;
  raiseMinus.setAttribute("aria-disabled", minusDisabled ? "true" : "false");
  raiseMinus.tabIndex = minusDisabled ? -1 : 0;
  raisePlus.disabled = plusDisabled;
  raisePlus.setAttribute("aria-disabled", plusDisabled ? "true" : "false");
  raisePlus.tabIndex = plusDisabled ? -1 : 0;
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
  button.setAttribute("aria-disabled", disabled ? "true" : "false");
  button.tabIndex = disabled ? -1 : 0;
  button.addEventListener("click", () => {
    if (!state || disabled) return;
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

/** Secondary action as a compact text link — never a third button in the row. */
function textActionLink(label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-action-link";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function appendActionLinks(links: HTMLElement[]) {
  if (!links.length) return;
  const row = document.createElement("div");
  row.className = "action-links";
  row.replaceChildren(...links);
  gameButtons.prepend(row);
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
  button.setAttribute("aria-disabled", disabled ? "true" : "false");
  button.tabIndex = disabled ? -1 : 0;
  button.addEventListener("click", () => {
    if (disabled) return;
    emitWithAck("game:action", payload);
  });
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

async function writeClipboardText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback (older browsers / insecure contexts).
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

async function copyText(text: string, button: HTMLElement) {
  if (!text) return;
  const ok = await writeClipboardText(text);
  if (!ok) {
    showToast("Could not copy");
    return;
  }
  const original = button.textContent;
  button.textContent = "Copied";
  showToast("Copied");
  setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function showSharePanel() {
  if (typeof showMenuInviteView === "function") {
    showMenuInviteView();
    return;
  }
  const link = inviteUrl();
  if (!link) return;
  shareLink.value = link;
  shareQr.src = `/qr.svg?text=${encodeURIComponent(link)}`;
}

function reportActionFailure(message: string) {
  const text = message || "Action failed.";
  joinError.textContent = text;
  if (typeof showToast === "function") showToast(text);
}

function emitWithAck(eventName: string, payload?: Record<string, unknown>) {
  // Hand Review in-spot retry: live Fold/Call/Raise controls grade locally.
  if (handReviewActive && eventName === "game:action" && handReviewRetryItem && payload) {
    submitHandReviewRetryAction(payload);
    return;
  }
  // Offline Practice: pause Ready/auto-deal while the replay chrome is open.
  if (handReviewActive && (eventName === "game:ready" || eventName === "game:action")) {
    return;
  }
  if (eventName === "game:action" && payload) {
    captureHandReviewDecision(payload);
  }
  if (practiceSession) {
    const response = practiceSession.handle(eventName, payload || {});
    if (!response?.ok) {
      reportActionFailure(response?.error || "Action failed.");
    }
    return;
  }
  if (!socket) {
    reportActionFailure("Connecting...");
    return;
  }
  socket.timeout(4000).emit(
    eventName,
    payload,
    ((error: Error | null, response?: OkAck | ErrAck) => {
      if (error) {
        reportActionFailure("Reconnecting to the table...");
        lastAutoRejoinKey = "";
        attemptAutoRejoin();
        return;
      }
      if (!response?.ok) {
        reportActionFailure(response?.error || "Action failed.");
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
