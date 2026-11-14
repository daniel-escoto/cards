import { test, expect, type Page } from "@playwright/test";
import {
  VIEWPORTS,
  type Theme,
  openOfflineTable,
  openTrainer,
  forceTableState,
  openGameMenu,
  openSettings,
  openTrainerMenu,
  forceTrainerScene,
} from "./fixtures";

const THEMES: Theme[] = ["dark", "light"];

async function shot(page: Page, name: string) {
  // Hide caret / reduce flaky animations.
  await page.addStyleTag({
    content: `
      *, *::before, *::after { caret-color: transparent !important; transition: none !important; animation: none !important; }
    `,
  });
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: false,
    animations: "disabled",
  });
}

async function forceHandReview(
  page: Page,
  kind: "decision" | "mistake" | "result",
) {
  await page.evaluate((scene) => {
    const w = window as unknown as {
      state: Record<string, unknown> | null;
      lastHandReplay: unknown;
      openHandReview?: () => void;
      paintHandReviewStep?: (i: number) => void;
      handReviewJumpToEnd?: () => void;
      render?: () => void;
    };

    const decisionBest = {
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
    };
    const decisionMistake = {
      ...decisionBest,
      id: "d2",
      taken: "fold",
      recommended: "call",
      verdict: "mistake",
      badge: "Mistake",
      reason: "Folding is too tight.",
    };

    const seats = [
      {
        id: "you",
        name: "Alex",
        isHero: true,
        isBot: false,
        stack: 980,
        bet: 20,
        folded: false,
        allIn: false,
        dealer: true,
        isSmallBlind: false,
        isBigBlind: true,
        isTurn: true,
        holeCodes: ["As", "Ks"],
        lastAction: null,
      },
      {
        id: "bot1",
        name: "CPU 1",
        isHero: false,
        isBot: true,
        stack: 960,
        bet: 40,
        folded: false,
        allIn: false,
        dealer: false,
        isSmallBlind: true,
        isBigBlind: false,
        isTurn: false,
        holeCodes: null,
        lastAction: "Raises to 40",
      },
    ];

    const table = {
      street: "preflop",
      pot: 60,
      toCall: 20,
      currentBet: 40,
      minRaiseTo: 80,
      boardCodes: [],
      seats,
      actingSeatId: "you",
      winners: [],
    };

    const decision = scene === "mistake" ? decisionMistake : decisionBest;
    const resultStep = {
      id: "result",
      index: 1,
      label: "Result",
      actorId: null,
      kind: "result",
      isHeroDecision: false,
      decision: null,
      table: {
        ...table,
        street: "complete",
        pot: 0,
        toCall: 0,
        currentBet: 0,
        actingSeatId: null,
        winners: [{ playerId: "you", name: "Alex", amount: 120, hand: "Pair of Aces" }],
        seats: seats.map((s) => ({ ...s, bet: 0, isTurn: false })),
      },
    };

    const heroStep = {
      id: "hero",
      index: 0,
      label: "Your decision",
      actorId: "you",
      kind: "hero_decision",
      isHeroDecision: true,
      decision,
      table,
    };

    w.lastHandReplay = {
      steps: scene === "result" ? [heroStep, resultStep] : [heroStep, resultStep],
      items: [decision],
      best: scene === "mistake" ? 0 : 1,
      fine: 0,
      mistake: scene === "mistake" ? 1 : 0,
      summary: scene === "mistake" ? "1 mistake" : "Solid hand",
    };

    // Ensure a live table state exists as the review template.
    if (!w.state) {
      w.state = {
        phase: "complete",
        pot: 0,
        players: [],
        community: [],
        winners: [],
      };
    }
    if (typeof w.openHandReview === "function") w.openHandReview();
    if (scene === "result" && typeof w.handReviewJumpToEnd === "function") {
      w.handReviewJumpToEnd();
    }
  }, kind);
  await page.waitForSelector("body.hand-review-open");
}

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    test.describe(`${theme} ${vp.name}`, () => {
      test.use({
        colorScheme: theme,
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });

      test(`lobby-waiting`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await shot(page, `${theme}-${vp.name}-lobby-waiting`);
      });

      test(`in-hand-on-turn`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "in-hand-on-turn");
        await shot(page, `${theme}-${vp.name}-in-hand-on-turn`);
      });

      test(`in-hand-off-turn`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "in-hand-off-turn");
        await shot(page, `${theme}-${vp.name}-in-hand-off-turn`);
      });

      test(`all-in-runout`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "all-in-runout");
        await shot(page, `${theme}-${vp.name}-all-in-runout`);
      });

      test(`showdown`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "showdown");
        await shot(page, `${theme}-${vp.name}-showdown`);
      });

      test(`game-menu`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await openGameMenu(page);
        await shot(page, `${theme}-${vp.name}-game-menu`);
      });

      test(`settings`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await openSettings(page);
        await shot(page, `${theme}-${vp.name}-settings`);
      });

      test(`hand-review-decision`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await forceHandReview(page, "decision");
        await shot(page, `${theme}-${vp.name}-hand-review-decision`);
      });

      test(`hand-review-mistake`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await forceHandReview(page, "mistake");
        await shot(page, `${theme}-${vp.name}-hand-review-mistake`);
      });

      test(`hand-review-result`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await forceHandReview(page, "result");
        await shot(page, `${theme}-${vp.name}-hand-review-result`);
      });

      test(`trainer-question`, async ({ page }) => {
        await openTrainer(page);
        await forceTrainerScene(page, "question");
        // If no force hook, interact: ensure unanswered actions visible.
        await page.waitForSelector("#trainerActions button", { timeout: 10000 });
        await shot(page, `${theme}-${vp.name}-trainer-question`);
      });

      test(`trainer-answered`, async ({ page }) => {
        await openTrainer(page);
        await forceTrainerScene(page, "answered");
        // Fallback: answer via Raise if still unanswered.
        const raise = page.locator("#trainerRaiseBtn");
        if (await raise.isVisible().catch(() => false)) {
          await raise.click();
          await page.waitForSelector("#trainerNextBtn", { timeout: 5000 });
        }
        await shot(page, `${theme}-${vp.name}-trainer-answered`);
      });

      test(`trainer-facing-raise`, async ({ page }) => {
        await openTrainer(page);
        // Switch drill to facing if menu available.
        await openTrainerMenu(page);
        const facing = page.locator("#trainerDrillFacing");
        if (!(await facing.isDisabled())) {
          await facing.click();
        }
        await page.click("#trainerCloseMenuBtn");
        await forceTrainerScene(page, "facing-raise");
        await page.waitForSelector("#trainerFoldBtn, #trainerConfirmBtn", { timeout: 10000 });
        await shot(page, `${theme}-${vp.name}-trainer-facing-raise`);
      });

      test(`trainer-menu`, async ({ page }) => {
        await openTrainer(page);
        await openTrainerMenu(page);
        await shot(page, `${theme}-${vp.name}-trainer-menu`);
      });
    });
  }
}
