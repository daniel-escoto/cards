import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  VIEWPORTS,
  type Theme,
  gotoFresh,
  openOfflineTable,
  openTrainer,
  forceTableState,
  openGameMenu,
  openTrainerMenu,
  forceTrainerScene,
} from "./fixtures";

/**
 * Lean visual coverage: actionable panels/menus plus a few high-churn
 * surfaces (showdown, off-turn, trainer-answered, welcome) at
 * 375/1280 × light/dark. Element-cropped (not full page) to keep
 * total PNG size under ~1.5MB.
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

/** Clip a union of element boxes (e.g. board + seats) without full felt chrome. */
async function shotUnion(page: Page, locators: Locator[], name: string) {
  const boxes = [];
  for (const loc of locators) {
    await loc.waitFor({ state: "visible", timeout: 10000 });
    const box = await loc.boundingBox();
    if (box) boxes.push(box);
  }
  if (!boxes.length) throw new Error(`No bounding boxes for ${name}`);
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
    clip: {
      x: Math.max(0, Math.floor(x)),
      y: Math.max(0, Math.floor(y)),
      width: Math.ceil(right - x),
      height: Math.ceil(bottom - y),
    },
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
      reason: "Need 25%, have ~62%. Call.",
    };
    const decisionMistake = {
      ...decisionBest,
      id: "d2",
      taken: "raise",
      raiseTo: 80,
      recommended: "call",
      verdict: "mistake",
      badge: "Mistake",
      reason: "Suited connector, fine call. Raise is too much.",
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
        holeCodes: scene === "mistake" ? ["8h", "7h"] : ["As", "Ks"],
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

      test(`in-hand-off-turn`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "in-hand-off-turn");
        await stabilize(page);
        // Controls rendered but disabled while waiting on another seat.
        await shot(page.locator("#tableView .control-panel"), `${theme}-${vp.name}-in-hand-off-turn`);
      });

      test(`showdown`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "showdown");
        await page.waitForSelector("#tableView #community .card", { timeout: 10000 });
        await page.waitForSelector("#tableView .shown-hand .card", { timeout: 10000 });
        await stabilize(page);
        // Stack board + seats + revealed holes into a dense crop (no empty felt / panel).
        await page.addStyleTag({
          content: `
            #tableView .topbar,
            #tableView .control-panel { display: none !important; }
            #tableView .felt {
              display: flex !important;
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 10px !important;
              padding: 12px !important;
              min-height: 0 !important;
              height: auto !important;
              background: var(--color-bg, #121212) !important;
              background-image: none !important;
            }
            #tableView .community {
              position: static !important;
              top: auto !important;
              left: auto !important;
              transform: none !important;
              align-self: center !important;
            }
            #tableView .players {
              position: static !important;
              inset: auto !important;
              max-height: none !important;
              overflow: visible !important;
            }
            #tableView .players > :first-child { margin-top: 0 !important; }
          `,
        });
        await shotUnion(
          page,
          [page.locator("#tableView #community"), page.locator("#tableView #players")],
          `${theme}-${vp.name}-showdown`,
        );
      });

      // Hand-end panel: offline Review hand vs online Show hand (same secondary slot).
      // 375 only — side-by-side comparison for the shared Ready + secondary row.
      if (vp.name === "375") {
        test(`hand-end-offline`, async ({ page }) => {
          await openOfflineTable(page);
          await forceTableState(page, "hand-end-offline");
          await page.waitForSelector("#tableView .control-panel.is-result", { timeout: 10000 });
          await page.waitForFunction(() => {
            const buttons = Array.from(
              document.querySelectorAll<HTMLButtonElement>(
                "#tableView .control-panel.is-result .game-buttons > button",
              ),
            );
            return buttons.some((btn) => /Review hand/i.test(btn.textContent || ""));
          });
          await stabilize(page);
          await shot(
            page.locator("#tableView .control-panel"),
            `${theme}-${vp.name}-hand-end-offline`,
          );
        });

        test(`hand-end-online`, async ({ page }) => {
          await openOfflineTable(page);
          await forceTableState(page, "hand-end-online");
          await page.waitForSelector("#tableView .control-panel.is-result", { timeout: 10000 });
          await page.waitForFunction(() => {
            const buttons = Array.from(
              document.querySelectorAll<HTMLButtonElement>(
                "#tableView .control-panel.is-result .game-buttons > button",
              ),
            );
            return (
              buttons.some((btn) => /Show hand/i.test(btn.textContent || "")) &&
              buttons.every((btn) => !btn.classList.contains("text-action-link"))
            );
          });
          await stabilize(page);
          await shot(
            page.locator("#tableView .control-panel"),
            `${theme}-${vp.name}-hand-end-online`,
          );
        });
      }

      test(`welcome`, async ({ page }) => {
        await gotoFresh(page, "/");
        await page.waitForSelector("#joinForm.join-panel, #welcome .join-panel");
        await stabilize(page);
        await shot(page.locator("#welcome .join-panel").first(), `${theme}-${vp.name}-welcome`);
      });

      test(`welcome-tournament`, async ({ page }) => {
        await gotoFresh(page, "/");
        await page.waitForSelector("#tournamentModeInput");
        await page.check("#tournamentModeInput");
        await page.waitForFunction(
          () =>
            (document.querySelector("#blindFields") as HTMLElement | null)?.classList.contains(
              "hidden",
            ) === true,
        );
        await stabilize(page);
        await shot(
          page.locator("#welcome .join-panel").first(),
          `${theme}-${vp.name}-welcome-tournament`,
        );
      });

      test(`tournament-level-clock`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "tournament-level-clock");
        await page.waitForSelector("#levelClock:not(.hidden)");
        await stabilize(page);
        await shot(page.locator("#tableView .hand-row"), `${theme}-${vp.name}-tournament-level-clock`);
      });

      test(`tournament-eliminated`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "tournament-eliminated");
        await page.waitForFunction(() =>
          Boolean(document.querySelector("#turnInfo")?.textContent?.includes("eliminated")),
        );
        // Mid-event: level clock must show a live countdown (not "—").
        await page.waitForFunction(() => {
          const clock = document.querySelector("#levelClockValue");
          const text = clock?.textContent?.trim() || "";
          return Boolean(text) && text !== "—" && text !== "Soon";
        });
        await stabilize(page);
        await shot(page.locator("#tableView .control-panel"), `${theme}-${vp.name}-tournament-eliminated`);
      });

      test(`tournament-results`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "tournament-results");
        await page.waitForSelector("#scoreView:not(.hidden)");
        await stabilize(page);
        await shot(page.locator("#scoreView .score-panel").first(), `${theme}-${vp.name}-tournament-results`);
      });

      test(`hand-review-mistake`, async ({ page }) => {
        await openOfflineTable(page);
        await forceTableState(page, "lobby-waiting");
        await forceHandReview(page, "mistake");
        // Reveal the why-line (Show answer) while Try again stays — the overflow case.
        const showBtn = page.locator(".hand-review-show-answer");
        await showBtn.waitFor({ state: "visible", timeout: 5000 });
        await showBtn.click();
        await expect(page.locator(".hand-review-verdict-why")).toContainText(/Raise is too much|Need \d+%/);
        await stabilize(page);
        await shot(page.locator("#tableView .control-panel"), `${theme}-${vp.name}-hand-review-mistake`);
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

      test(`trainer-answered`, async ({ page }) => {
        await openTrainer(page);
        await forceTrainerScene(page, "answered");
        await page.waitForSelector("#trainerNextBtn", { timeout: 10000 });
        await page.waitForSelector("#trainerChartBtn", { timeout: 10000 });
        await stabilize(page);
        await shot(page.locator("#trainerControlPanel"), `${theme}-${vp.name}-trainer-answered`);
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
