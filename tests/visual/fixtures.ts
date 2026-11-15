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
    | "showdown",
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

    if (sceneName === "lobby-waiting") {
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
        winners: [{ playerId: "you", name: "Alex", hand: "Pair of Aces", amount: 200 }],
        players: [
          {
            ...you,
            stack: 1180,
            bet: 0,
            showCards: true,
            cards: [
              { rank: "A", suit: "♠", code: "As", color: "black" },
              { rank: "A", suit: "♥", code: "Ah", color: "red" },
            ],
          },
          {
            ...bot1,
            stack: 860,
            bet: 0,
            showCards: true,
            cards: [
              { rank: "K", suit: "♦", code: "Kd", color: "red" },
              { rank: "Q", suit: "♦", code: "Qd", color: "red" },
            ],
          },
          { ...bot2, folded: true, showCards: false },
        ],
      };
    }

    (window as unknown as { state: unknown }).state = room;
    const render = (window as unknown as { render?: () => void }).render;
    if (typeof render === "function") render();
  }, scene);
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
