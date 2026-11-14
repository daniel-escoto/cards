import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  VIEWPORTS,
  type Theme,
  openOfflineTable,
  openTrainer,
  forceTableState,
  openGameMenu,
  openTrainerMenu,
  forceTrainerScene,
} from "./fixtures";

/**
 * Lean visual coverage (≤ ~24 PNGs): table, Hand Review retry+result,
 * Trainer facing-raise, and both menus — at 375/1280 × light/dark.
 * Screenshots target the surface under test (not full page) to keep
 * baseline size ~1–2MB total.
 */
const THEMES: Theme[] = ["dark", "light"];

async function stabilize(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        caret-color: transparent !important;
        transition: none !important;
        animation: none !important;
      }
    `,
  });
}

async function shot(target: Locator, name: string) {
  await expect(target).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    // Element shots are smaller; allow light AA/subpixel noise.
    maxDiffPixelRatio: 0.02,
  });
}

async function forceHandReview(page: Page, kind: "mistake" | "result") {
  await page.evaluate((scene) => {
    const w = window as unknown as {
      state: Record<string, unknown> | null;
      lastHandReplay: unknown;
      openHandReview?: () => void;
      handReviewJumpToEnd?: () => void;
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
      steps: [heroStep, resultStep],
      items: [decision],
      best: scene === "mistake" ? 0 : 1,
      fine: 0,
      mistake: scene === "mistake" ? 1 : 0,
      summary: scene === "mistake" ? "1 mistake" : "Solid hand",
    };

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

/** Start a retry so the Try again / Call row is visible for the mistake baseline. */
async function startHandReviewRetry(page: Page) {
  const tryBtn = page.locator(".hand-review-try-again, #handReviewRetryBar button").first();
  if (await tryBtn.isVisible().catch(() => false)) {
    await tryBtn.click();
    await page.waitForSelector("body.hand-review-retrying", { timeout: 5000 }).catch(() => {});
  }
}

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    test.describe(`${theme} ${vp.name}`, () => {
      test.use({
        colorScheme: theme,
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });

      test(`in-hand-on-turn`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "in-hand-on-turn");
        await stabilize(page);
        // Panel + seat strip: the actionable surface (not full-bleed felt).
        await shot(page.locator("#tableView .control-panel"), `${theme}-${vp.name}-in-hand-on-turn`);
      });

      test(`hand-review-retry`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await forceHandReview(page, "mistake");
        await startHandReviewRetry(page);
        await stabilize(page);
        await shot(page.locator("#tableView .control-panel"), `${theme}-${vp.name}-hand-review-retry`);
      });

      test(`hand-review-result`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await forceHandReview(page, "result");
        await stabilize(page);
        await shot(page.locator("#tableView .control-panel"), `${theme}-${vp.name}-hand-review-result`);
      });

      test(`trainer-facing-raise`, async ({ page }) => {
        await openTrainer(page);
        await openTrainerMenu(page);
        const facing = page.locator("#trainerDrillFacing");
        if (!(await facing.isDisabled())) await facing.click();
        await page.click("#trainerCloseMenuBtn");
        await forceTrainerScene(page, "facing-raise");
        await page.waitForSelector("#trainerFoldBtn, #trainerConfirmBtn", { timeout: 10000 });
        await stabilize(page);
        await shot(page.locator("#trainerControlPanel"), `${theme}-${vp.name}-trainer-facing-raise`);
      });

      test(`game-menu`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await openGameMenu(page);
        await stabilize(page);
        await shot(page.locator("#gameMenuModal .modal-panel"), `${theme}-${vp.name}-game-menu`);
      });

      test(`trainer-menu`, async ({ page }) => {
        await openTrainer(page);
        await openTrainerMenu(page);
        await stabilize(page);
        await shot(page.locator("#trainerMenuModal .modal-panel"), `${theme}-${vp.name}-trainer-menu`);
      });
    });
  }
}
