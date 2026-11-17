import type { Page } from "@playwright/test";

export const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1280", width: 1280, height: 800 },
] as const;

export type Theme = "light" | "dark";

export async function preparePage(page: Page, theme: Theme) {
  await page.addInitScript((nextTheme) => {
    try {
      localStorage.clear();
      localStorage.setItem("holdem:theme", nextTheme);
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = nextTheme;
  }, theme);
}

export async function gotoFresh(page: Page, path = "/") {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: "networkidle" });
}

export async function openOfflineTable(page: Page, name = "Alex") {
  await gotoFresh(page, "/");
  await page.waitForSelector("#welcome");
  await page.fill("#nameInput", name);
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)", { timeout: 15000 });
}

export async function openTrainer(page: Page) {
  await gotoFresh(page, "/");
  await page.waitForSelector("#welcome");
  const trainerBtn = page.locator("#trainerBtn, [data-open-trainer], a[href='/trainer']").first();
  if (await trainerBtn.count()) {
    await trainerBtn.click();
  } else {
    await page.goto("/trainer", { waitUntil: "networkidle" });
  }
  await page.waitForSelector("#trainerView:not(.hidden)", { timeout: 15000 });
}

/** Deterministic room snapshot for live-table screenshot scenes. */
export function forceTableState(
  page: Page,
  scene:
    | "lobby-waiting"
    | "in-hand-on-turn"
    | "in-hand-off-turn"
    | "all-in-runout"
    | "showdown"
    | "hand-end-offline"
    | "hand-end-online"
    | "tournament-level-clock"
    | "tournament-eliminated"
    | "tournament-results",
) {
  return page.evaluate((sceneName) => {
    const base =
      window.state && typeof window.state === "object"
        ? (window.state as Record<string, unknown>)
        : {};

    const you = {
      id: "you",
      name: "Alex",
      stack: 980,
      stackCents: 0,
      isYou: true,
      isBot: false,
      sittingOut: false,
      ready: false,
      folded: false,
      allIn: false,
      bet: 20,
      cards: [
        { rank: "A", suit: "♠", code: "As", color: "black" },
        { rank: "K", suit: "♠", code: "Ks", color: "black" },
      ],
      dealer: true,
      isSmallBlind: false,
      isBigBlind: true,
      isTurn: sceneName === "in-hand-on-turn",
      color: "#60a5fa",
    };
    const bot1 = {
      id: "bot1",
      name: "CPU 1",
      stack: 960,
      stackCents: 0,
      isBot: true,
      sittingOut: false,
      ready: true,
      folded: false,
      allIn: false,
      bet: 40,
      cards: [],
      dealer: false,
      isSmallBlind: true,
      isBigBlind: false,
      isTurn: sceneName === "in-hand-off-turn",
      color: "#4caf82",
    };
    const bot2 = {
      id: "bot2",
      name: "CPU 2",
      stack: 1000,
      stackCents: 0,
      isBot: true,
      sittingOut: false,
      ready: true,
      folded: sceneName !== "lobby-waiting",
      allIn: false,
      bet: 0,
      cards: [],
      dealer: false,
      isSmallBlind: false,
      isBigBlind: false,
      isTurn: false,
      color: "#ef6b63",
    };

    let room: Record<string, unknown> = {
      ...base,
      code: "TEST",
      pot: 60,
      potCents: 0,
      bigBlind: 20,
      smallBlind: 10,
      currentBet: 40,
      minRaiseTo: 80,
      toCall: 20,
      toCallCents: 0,
      chipValueCents: 0,
      moneyMode: false,
      tournamentMode: false,
      tournamentLevelIndex: 0,
      tournamentPendingAdvance: false,
      tournamentLevelEndsAt: null,
      tournamentLevelDurationMs: 600_000,
      phase: "preflop",
      community: [],
      winners: [],
      actionLog: [],
      turn: sceneName === "in-hand-off-turn" ? "bot1" : "you",
      isYourTurn: sceneName === "in-hand-on-turn",
      canReady: false,
      canAddBot: false,
      canRaise: true,
      canRebuy: false,
      players: [you, bot1, bot2],
    };

    if (sceneName === "tournament-level-clock") {
      // Freeze client clock so the level countdown is screenshot-stable (9:42).
      const fixedNow = 1_700_000_000_000;
      Date.now = () => fixedNow;
      const win = window as unknown as { serverTimeOffsetMs?: number };
      win.serverTimeOffsetMs = 0;
      room = {
        ...room,
        tournamentMode: true,
        tournamentLevelIndex: 0,
        tournamentPendingAdvance: false,
        tournamentLevelEndsAt: fixedNow + 9 * 60 * 1000 + 42 * 1000,
        tournamentLevelDurationMs: 600_000,
        placesRemaining: 3,
        serverNow: fixedNow,
        handNumber: 1,
        canAddBot: false,
        canChangeBlinds: false,
        players: [
          { ...you, isBot: false, finishPlace: null },
          { ...bot1, id: "p2", name: "Sam", isBot: false, finishPlace: null },
          { ...bot2, id: "p3", name: "Riley", isBot: false, finishPlace: null },
        ],
      };
    } else if (sceneName === "tournament-eliminated") {
      // Still mid-event: freeze the level clock so the snapshot shows a real countdown.
      const fixedNow = 1_700_000_000_000;
      Date.now = () => fixedNow;
      const win = window as unknown as { serverTimeOffsetMs?: number };
      win.serverTimeOffsetMs = 0;
      room = {
        ...room,
        tournamentMode: true,
        tournamentLevelIndex: 0,
        tournamentPendingAdvance: false,
        tournamentLevelEndsAt: fixedNow + 9 * 60 * 1000 + 42 * 1000,
        tournamentLevelDurationMs: 600_000,
        placesRemaining: 2,
        phase: "complete",
        pot: 0,
        toCall: 0,
        currentBet: 0,
        smallBlind: 10,
        bigBlind: 20,
        isYourTurn: false,
        turn: null,
        canReady: false,
        handNumber: 4,
        serverNow: fixedNow,
        canAddBot: false,
        canChangeBlinds: false,
        players: [
          {
            ...you,
            stack: 0,
            bet: 0,
            cards: [],
            finishPlace: 3,
            isTurn: false,
            isBigBlind: false,
          },
          {
            ...bot1,
            id: "p2",
            name: "Sam",
            isBot: false,
            stack: 1800,
            bet: 0,
            finishPlace: null,
            isTurn: false,
            isSmallBlind: false,
          },
          {
            ...bot2,
            id: "p3",
            name: "Riley",
            isBot: false,
            stack: 1200,
            bet: 0,
            folded: false,
            finishPlace: null,
          },
        ],
      };
    } else if (sceneName === "tournament-results") {
      room = {
        ...room,
        tournamentMode: true,
        moneyMode: false,
        phase: "gameover",
        placesRemaining: 1,
        buyInCents: 2000,
        settlements: [
          {
            fromPlayerId: "p3",
            fromName: "Riley",
            toPlayerId: "you",
            toName: "Alex",
            amountCents: 2000,
          },
          {
            fromPlayerId: "p2",
            fromName: "Sam",
            toPlayerId: "you",
            toName: "Alex",
            amountCents: 2000,
          },
        ],
        ledger: [
          {
            playerId: "you",
            name: "Alex",
            buyInsCents: 2000,
            cashOutCents: 6000,
            netCents: 4000,
            isYou: true,
            color: "#60a5fa",
            finishPlace: 1,
          },
          {
            playerId: "p2",
            name: "Sam",
            buyInsCents: 2000,
            cashOutCents: 0,
            netCents: -2000,
            isYou: false,
            color: "#4caf82",
            finishPlace: 2,
          },
          {
            playerId: "p3",
            name: "Riley",
            buyInsCents: 2000,
            cashOutCents: 0,
            netCents: -2000,
            isYou: false,
            color: "#ef6b63",
            finishPlace: 3,
          },
        ],
        players: [
          { ...you, finishPlace: 1, stack: 0 },
          { ...bot1, id: "p2", name: "Sam", isBot: false, finishPlace: 2, stack: 0 },
          { ...bot2, id: "p3", name: "Riley", isBot: false, finishPlace: 3, stack: 0 },
        ],
      };
    } else if (sceneName === "lobby-waiting") {
      room = {
        ...room,
        pot: 0,
        phase: "lobby",
        toCall: 0,
        currentBet: 0,
        isYourTurn: false,
        turn: null,
        canReady: true,
        isReady: false,
        canAddBot: true,
        players: [
          { ...you, stack: 1000, bet: 0, cards: [], ready: false, isBigBlind: false },
          { ...bot1, stack: 1000, bet: 0, cards: [], ready: true, isSmallBlind: false },
          { ...bot2, stack: 1000, bet: 0, cards: [], folded: false, ready: true },
        ],
      };
    } else if (sceneName === "in-hand-off-turn") {
      room = {
        ...room,
        isYourTurn: false,
        turn: "bot1",
        players: [
          { ...you, isTurn: false },
          { ...bot1, isTurn: true },
          bot2,
        ],
      };
    } else if (sceneName === "all-in-runout") {
      room = {
        ...room,
        phase: "flop",
        pot: 2000,
        toCall: 0,
        currentBet: 0,
        isYourTurn: false,
        turn: null,
        community: [
          { rank: "Q", suit: "♥", code: "Qh", color: "red" },
          { rank: "J", suit: "♥", code: "Jh", color: "red" },
          { rank: "2", suit: "♣", code: "2c", color: "black" },
        ],
        players: [
          { ...you, stack: 0, bet: 0, allIn: true, isTurn: false },
          { ...bot1, stack: 0, bet: 0, allIn: true, isTurn: false },
          { ...bot2, stack: 0, bet: 0, folded: true },
        ],
      };
    } else if (sceneName === "showdown") {
      room = {
        ...room,
        phase: "showdown",
        pot: 200,
        toCall: 0,
        isYourTurn: false,
        turn: null,
        community: [
          { rank: "Q", suit: "♥", code: "Qh", color: "red" },
          { rank: "J", suit: "♥", code: "Jh", color: "red" },
          { rank: "2", suit: "♣", code: "2c", color: "black" },
          { rank: "9", suit: "♦", code: "9d", color: "red" },
          { rank: "3", suit: "♠", code: "3s", color: "black" },
        ],
        winners: [{ playerId: "bot1", name: "FrostyRaven", hand: "King high", amount: 200 }],
        players: [
          {
            ...you,
            stack: 860,
            bet: 0,
            showCards: true,
            cards: [
              { rank: "A", suit: "♠", code: "As", color: "black" },
              { rank: "A", suit: "♥", code: "Ah", color: "red" },
            ],
          },
          {
            ...bot1,
            name: "FrostyRaven",
            stack: 1150,
            bet: 0,
            isBigBlind: true,
            ready: true,
            showCards: true,
            cards: [
              { rank: "8", suit: "♠", code: "8s", color: "black" },
              { rank: "K", suit: "♠", code: "Ks", color: "black" },
            ],
          },
          { ...bot2, folded: true, showCards: false },
        ],
      };
    } else if (sceneName === "hand-end-offline") {
      // Offline Practice: Ready up + Review hand (secondary).
      room = {
        ...room,
        offline: true,
        coachAvailable: true,
        phase: "complete",
        pot: 0,
        toCall: 0,
        currentBet: 0,
        isYourTurn: false,
        turn: null,
        canReady: true,
        isReady: false,
        canShowHand: false,
        handNumber: 3,
        winners: [{ playerId: "you", name: "Alex", hand: "Pair of Aces", amount: 120 }],
        community: [
          { rank: "Q", suit: "♥", code: "Qh", color: "red" },
          { rank: "J", suit: "♥", code: "Jh", color: "red" },
          { rank: "2", suit: "♣", code: "2c", color: "black" },
        ],
        players: [
          { ...you, stack: 1060, bet: 0, cards: [], ready: false },
          { ...bot1, stack: 940, bet: 0, cards: [], ready: true },
          { ...bot2, stack: 1000, bet: 0, folded: false, cards: [], ready: true },
        ],
      };
    } else if (sceneName === "hand-end-online") {
      // Online multi-human: Ready up + Show hand (same secondary slot as Review).
      room = {
        ...room,
        offline: false,
        coachAvailable: false,
        phase: "complete",
        pot: 0,
        toCall: 0,
        currentBet: 0,
        isYourTurn: false,
        turn: null,
        canReady: true,
        isReady: false,
        canShowHand: true,
        canAddBot: false,
        handNumber: 3,
        winners: [{ playerId: "you", name: "Alex", hand: "Pair of Aces", amount: 120 }],
        community: [
          { rank: "Q", suit: "♥", code: "Qh", color: "red" },
          { rank: "J", suit: "♥", code: "Jh", color: "red" },
          { rank: "2", suit: "♣", code: "2c", color: "black" },
        ],
        players: [
          { ...you, stack: 1060, bet: 0, cards: [], ready: false, isBot: false },
          {
            ...bot1,
            id: "sam",
            name: "Sam",
            isBot: false,
            stack: 940,
            bet: 0,
            cards: [],
            ready: true,
          },
          {
            ...bot2,
            id: "riley",
            name: "Riley",
            isBot: false,
            stack: 1000,
            bet: 0,
            folded: false,
            cards: [],
            ready: true,
          },
        ],
      };
    }

    const win = window as unknown as {
      state: unknown;
      lastHandReplay?: { steps: unknown[]; summary?: string } | null;
      render?: () => void;
      showScoreScreen?: (next: Record<string, unknown>) => void;
    };
    win.state = room;
    if (sceneName === "hand-end-offline") {
      // Stub a completed replay so Review hand mounts beside Ready up.
      win.lastHandReplay = {
        summary: "Solid hand",
        best: 1,
        fine: 0,
        mistake: 0,
        items: [],
        steps: [
          {
            id: "hero",
            index: 0,
            label: "Your decision",
            actorId: "you",
            kind: "hero_decision",
            isHeroDecision: true,
            decision: {
              id: "d1",
              street: "preflop",
              boardCodes: [],
              heroCodes: ["As", "Ks"],
              pot: 60,
              toCall: 20,
              currentBet: 40,
              taken: "call",
              raiseTo: null,
              equity: 0.62,
              potOdds: 0.25,
              recommended: "call",
              recommendedRaiseTo: null,
              verdict: "best",
              badge: "Best",
              reason: "Calling is fine here.",
            },
            table: {
              street: "preflop",
              pot: 60,
              toCall: 20,
              currentBet: 40,
              boardCodes: [],
              actingSeatId: "you",
              winners: [],
              seats: [],
            },
          },
          {
            id: "result",
            index: 1,
            label: "Result",
            actorId: null,
            kind: "result",
            isHeroDecision: false,
            decision: null,
            table: {
              street: "complete",
              pot: 0,
              toCall: 0,
              currentBet: 0,
              boardCodes: ["Qh", "Jh", "2c"],
              actingSeatId: null,
              winners: [{ playerId: "you", name: "Alex", amount: 120, hand: "Pair of Aces" }],
              seats: [],
            },
          },
        ],
      };
    }
    if (sceneName === "tournament-results" && typeof win.showScoreScreen === "function") {
      win.showScoreScreen(room);
      return;
    }
    if (typeof win.render === "function") win.render();
  }, scene);
}

/** Crowded in-hand table: many seats with a lower seat acting (auto-scroll target). */
export function forceCrowdedInHand(
  page: Page,
  options: {
    playerCount: 6 | 9;
    actingIndex: number;
    offline?: boolean;
  },
) {
  return page.evaluate((opts) => {
    const colors = [
      "#60a5fa",
      "#4caf82",
      "#f59e0b",
      "#ef4444",
      "#a78bfa",
      "#22d3ee",
      "#f472b6",
      "#94a3b8",
      "#eab308",
    ];
    const actingIndex = Math.max(0, Math.min(opts.playerCount - 1, opts.actingIndex));
    const players = [];
    for (let i = 0; i < opts.playerCount; i++) {
      const isYou = i === 0;
      const isTurn = i === actingIndex;
      players.push({
        id: isYou ? "you" : `p${i}`,
        name: isYou ? "Alex" : `Player${i}`,
        stack: 1000 - i * 40,
        stackCents: 0,
        isYou,
        isBot: !isYou,
        sittingOut: false,
        ready: true,
        folded: false,
        allIn: false,
        bet: i === 1 ? 10 : i === 2 ? 20 : 0,
        showCards: false,
        cards: isYou
          ? [
              { rank: "A", suit: "♠", code: "As", color: "black" },
              { rank: "K", suit: "♠", code: "Ks", color: "black" },
            ]
          : [],
        dealer: i === 0,
        isSmallBlind: i === 1,
        isBigBlind: i === 2,
        isTurn,
        color: colors[i % colors.length],
      });
    }
    const turnId = players[actingIndex]!.id;
    const base =
      window.state && typeof window.state === "object"
        ? (window.state as Record<string, unknown>)
        : {};
    const room = {
      ...base,
      offline: Boolean(opts.offline),
      coachAvailable: Boolean(opts.offline),
      phase: "preflop",
      status: "playing",
      pot: 30,
      toCall: 20,
      currentBet: 20,
      isYourTurn: turnId === "you",
      turn: turnId,
      canReady: false,
      isReady: false,
      canRaise: true,
      handNumber: 3,
      community: [],
      winners: [],
      actionLog: [],
      players,
    };
    const win = window as unknown as {
      state: unknown;
      render?: () => void;
      lastPlayersListScrollKey?: string | null;
      playersListUserScrollAt?: number;
    };
    // Allow auto-scroll to run for the forced turn change.
    win.playersListUserScrollAt = 0;
    win.lastPlayersListScrollKey = null;
    win.state = room;
    if (typeof win.render === "function") win.render();
  }, options);
}

/** Crowded showdown: many seat rows + appended reveal rows (reproduces flex-shrink overflow). */
export function forceCrowdedShowdown(
  page: Page,
  options: {
    playerCount: 6 | 9;
    revealCount: number;
    offline: boolean;
  },
) {
  return page.evaluate((opts) => {
    const colors = [
      "#60a5fa",
      "#4caf82",
      "#f59e0b",
      "#ef4444",
      "#a78bfa",
      "#22d3ee",
      "#f472b6",
      "#94a3b8",
      "#eab308",
    ];
    const holes = [
      [
        { rank: "A", suit: "♠", code: "As", color: "black" },
        { rank: "A", suit: "♥", code: "Ah", color: "red" },
      ],
      [
        { rank: "K", suit: "♠", code: "Ks", color: "black" },
        { rank: "8", suit: "♠", code: "8s", color: "black" },
      ],
      [
        { rank: "Q", suit: "♦", code: "Qd", color: "red" },
        { rank: "J", suit: "♦", code: "Jd", color: "red" },
      ],
    ];
    const players = [];
    for (let i = 0; i < opts.playerCount; i++) {
      const isYou = i === 0;
      const reveal = i < opts.revealCount;
      players.push({
        id: isYou ? "you" : `p${i}`,
        name: isYou ? "Alex" : `Player${i}`,
        stack: 1000 - i * 40,
        stackCents: 0,
        isYou,
        isBot: !isYou,
        sittingOut: false,
        ready: i !== 0,
        folded: !reveal && i >= 2,
        allIn: false,
        bet: 0,
        showCards: reveal,
        cards: reveal ? holes[i % holes.length] : [],
        dealer: i === 0,
        isSmallBlind: i === 1,
        isBigBlind: i === 2,
        isTurn: false,
        color: colors[i % colors.length],
      });
    }
    const base =
      window.state && typeof window.state === "object"
        ? (window.state as Record<string, unknown>)
        : {};
    const room = {
      ...base,
      offline: opts.offline,
      coachAvailable: opts.offline,
      phase: "showdown",
      status: "playing",
      pot: 420,
      toCall: 0,
      currentBet: 0,
      isYourTurn: false,
      turn: null,
      canReady: true,
      isReady: false,
      canShowHand: !opts.offline,
      handNumber: 4,
      community: [
        { rank: "Q", suit: "♥", code: "Qh", color: "red" },
        { rank: "J", suit: "♥", code: "Jh", color: "red" },
        { rank: "2", suit: "♣", code: "2c", color: "black" },
        { rank: "9", suit: "♦", code: "9d", color: "red" },
        { rank: "3", suit: "♠", code: "3s", color: "black" },
      ],
      winners: [{ playerId: "you", name: "Alex", hand: "Pair of Aces", amount: 420 }],
      players,
    };
    const win = window as unknown as { state: unknown; render?: () => void };
    win.state = room;
    if (typeof win.render === "function") win.render();
  }, options);
}

export async function openGameMenu(page: Page) {
  await page.click("#menuBtn");
  await page.waitForSelector("#gameMenuModal:not(.hidden)");
}

export async function openSettings(page: Page) {
  await openGameMenu(page);
  await page.click("#openSettingsBtn");
  await page.waitForSelector("#menuSettingsView:not(.hidden)");
}

export async function openTrainerMenu(page: Page) {
  await page.click("#trainerMenuBtn");
  await page.waitForSelector("#trainerMenuModal:not(.hidden)");
}

/** Force a stable trainer spot via PreflopTrainerTest.forceSpot when available. */
export async function forceTrainerScene(
  page: Page,
  scene: "question" | "answered" | "facing-raise",
) {
  await page.evaluate((sceneName) => {
    const hook = (
      window as unknown as {
        PreflopTrainerTest?: { forceSpot?: (spot: Record<string, unknown>) => void };
      }
    ).PreflopTrainerTest?.forceSpot;
    if (typeof hook !== "function") return;

    if (sceneName === "facing-raise") {
      hook({
        kind: "facing",
        tableSize: 6,
        position: "BB",
        openerPosition: "BTN",
        callers: [],
        cards: [
          { rank: "A", suit: "♠", code: "As", color: "black" },
          { rank: "K", suit: "♠", code: "Ks", color: "black" },
        ],
        handKey: "AKs",
        standard: "call",
        openTo: 60,
        toCall: 40,
        pot: 90,
        minRaiseTo: 100,
        maxRaiseTo: 1000,
        raiseTo: 60,
        answered: false,
        chosen: null,
        correct: null,
        hintStep: 0,
        whyOpen: false,
        scored: false,
      });
      return;
    }
    if (sceneName === "answered") {
      hook({
        kind: "rfi",
        tableSize: 6,
        position: "BTN",
        cards: [
          { rank: "A", suit: "♠", code: "As", color: "black" },
          { rank: "A", suit: "♥", code: "Ah", color: "red" },
        ],
        handKey: "AA",
        standard: "raise",
        answered: true,
        chosen: "raise",
        correct: true,
        hintStep: 0,
        whyOpen: false,
        scored: true,
      });
      return;
    }
    hook({
      kind: "rfi",
      tableSize: 6,
      position: "CO",
      cards: [
        { rank: "K", suit: "♠", code: "Ks", color: "black" },
        { rank: "Q", suit: "♠", code: "Qs", color: "black" },
      ],
      handKey: "KQs",
      standard: "raise",
      answered: false,
      chosen: null,
      correct: null,
      hintStep: 0,
      whyOpen: false,
      scored: false,
    });
  }, scene);
}
