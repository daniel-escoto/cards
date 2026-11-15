import { test, expect } from "@playwright/test";
import { VIEWPORTS, openOfflineTable, forceTableState } from "./fixtures";

const LAYOUT_VIEWPORTS = [
  ...VIEWPORTS,
  { name: "390", width: 390, height: 844 },
] as const;

async function panelMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".control-panel");
    const players = document.querySelector("#players");
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      panel: rect(panel),
      players: rect(players),
    };
  });
}

function nearlyEqual(a: number, b: number, tol = 1) {
  return Math.abs(a - b) <= tol;
}

async function openReviewScene(
  page: import("@playwright/test").Page,
  mode: "step" | "retry" | "result",
) {
  await page.evaluate((nextMode) => {
    const w = window as unknown as {
      state: Record<string, unknown>;
      lastHandReplay: unknown;
      openHandReview: () => void;
      startHandReviewRetry: (item: unknown, table: unknown, stack: number) => void;
      paintHandReviewStep: (index: number, options?: { force?: boolean }) => void;
      submitHandReviewRetryAction?: (payload: Record<string, unknown>) => void;
    };
    const decision = {
      id: "d1",
      street: "preflop",
      boardCodes: [],
      heroCodes: ["As", "Ks"],
      pot: 60,
      toCall: 20,
      currentBet: 20,
      taken: "fold",
      raiseTo: null,
      equity: 0.55,
      potOdds: 0.25,
      recommended: "call",
      recommendedRaiseTo: null,
      verdict: "mistake",
      badge: "Mistake",
      reason: "Folding is too tight versus a small open.",
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
    w.lastHandReplay = {
      steps: [
        {
          id: "hero",
          index: 0,
          label: "Your decision",
          actorId: "you",
          kind: "hero_decision",
          isHeroDecision: true,
          decision,
          table,
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
            ...table,
            street: "complete",
            pot: 0,
            toCall: 0,
            currentBet: 0,
            actingSeatId: null,
            winners: [{ playerId: "you", name: "Alex", amount: 120, hand: "Pair of Aces" }],
            seats: seats.map((s) => ({ ...s, bet: 0, isTurn: false })),
          },
        },
      ],
      items: [decision],
      best: 0,
      fine: 0,
      mistake: 1,
      summary: "1 mistake",
    };
    w.openHandReview();
    if (nextMode === "retry") {
      w.startHandReviewRetry(decision, table, 980);
    } else if (nextMode === "result") {
      w.paintHandReviewStep(1);
    }
  }, mode);
  await page.waitForTimeout(80);
}

for (const vp of LAYOUT_VIEWPORTS) {
  test.describe(`layout ${vp.name}`, () => {
    test.use({
      colorScheme: "dark",
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });

    test("panel height/position stable on-turn vs off-turn vs after fold vs between hands", async ({
      page,
    }) => {
      await openOfflineTable(page);

      await forceTableState(page, "in-hand-on-turn");
      await page.waitForTimeout(100);
      const onTurn = await panelMetrics(page);

      await forceTableState(page, "in-hand-off-turn");
      await page.waitForTimeout(100);
      const offTurn = await panelMetrics(page);

      // Armed Check/Fold must not shift panel geometry vs unarmed off-turn.
      await page.evaluate(() => {
        const w = window as unknown as {
          checkFoldSession?: { armed: boolean; armedToCall: number; handNumber: number | null };
          CheckFold?: { arm: (s: unknown, toCall: unknown, hand: unknown) => void };
          state: Record<string, unknown>;
          render?: () => void;
        };
        if (w.checkFoldSession && w.CheckFold?.arm) {
          w.CheckFold.arm(w.checkFoldSession, w.state?.toCall ?? 20, w.state?.handNumber ?? 1);
        } else if (w.checkFoldSession) {
          w.checkFoldSession.armed = true;
          w.checkFoldSession.armedToCall = Number(w.state?.toCall) || 20;
          w.checkFoldSession.handNumber = Number(w.state?.handNumber) || 1;
        }
        if (typeof w.render === "function") w.render();
      });
      await page.waitForTimeout(100);
      const offTurnArmed = await panelMetrics(page);
      expect(
        nearlyEqual(offTurnArmed.panel!.y, offTurn.panel!.y),
        "armed Check/Fold panel y drifted",
      ).toBe(true);
      expect(
        nearlyEqual(offTurnArmed.panel!.height, offTurn.panel!.height, 2),
        "armed Check/Fold panel height drifted",
      ).toBe(true);
      await page.evaluate(() => {
        const w = window as unknown as {
          checkFoldSession?: { armed: boolean; armedToCall: number; handNumber: number | null };
          CheckFold?: { disarm: (s: unknown) => void };
          render?: () => void;
        };
        if (w.checkFoldSession && w.CheckFold?.disarm) w.CheckFold.disarm(w.checkFoldSession);
        else if (w.checkFoldSession) {
          w.checkFoldSession.armed = false;
          w.checkFoldSession.armedToCall = 0;
          w.checkFoldSession.handNumber = null;
        }
        if (typeof w.render === "function") w.render();
      });
      await page.waitForTimeout(80);

      // Folded hero still in-hand: reuse off-turn fixture with folded flag.
      await page.evaluate(() => {
        const w = window as unknown as { state: Record<string, unknown>; render?: () => void };
        const room = { ...(w.state || {}) } as {
          players: Array<Record<string, unknown>>;
          isYourTurn: boolean;
        };
        room.isYourTurn = false;
        room.players = (room.players || []).map((p) =>
          p.isYou ? { ...p, folded: true, isTurn: false } : p,
        );
        w.state = room;
        if (typeof w.render === "function") w.render();
      });
      await page.waitForTimeout(100);
      const afterFold = await panelMetrics(page);

      await forceTableState(page, "lobby-waiting");
      await page.waitForTimeout(100);
      const betweenHands = await panelMetrics(page);

      expect(onTurn.panel).toBeTruthy();
      expect(offTurn.panel).toBeTruthy();
      expect(afterFold.panel).toBeTruthy();
      expect(betweenHands.panel).toBeTruthy();

      // On/off turn and after fold: same panel y and height (layout-stability contract).
      for (const [label, sample] of [
        ["off-turn", offTurn],
        ["after-fold", afterFold],
      ] as const) {
        expect(
          nearlyEqual(sample.panel!.y, onTurn.panel!.y),
          `${label} panel y drifted`,
        ).toBe(true);
        expect(
          nearlyEqual(sample.panel!.height, onTurn.panel!.height, 2),
          `${label} panel height drifted`,
        ).toBe(true);
        expect(
          nearlyEqual(sample.players!.y, onTurn.players!.y, 2),
          `${label} players y drifted`,
        ).toBe(true);
      }

      // Pre-hand lobby may compact; x origin must stay put.
      expect(
        nearlyEqual(betweenHands.panel!.x, onTurn.panel!.x, 2),
        "between-hands panel x drifted",
      ).toBe(true);
      expect(
        nearlyEqual(betweenHands.players!.x, onTurn.players!.x, 2),
        "between-hands players x drifted",
      ).toBe(true);
    });

    test("panel height/top identical for in-hand, post-hand Ready up, and review steps", async ({
      page,
    }) => {
      await openOfflineTable(page);

      await forceTableState(page, "in-hand-on-turn");
      await page.waitForTimeout(80);
      const inHand = await panelMetrics(page);

      // Post-hand Ready up (complete phase — full footprint, not compact lobby).
      await page.evaluate(() => {
        const w = window as unknown as { state: Record<string, unknown>; render?: () => void };
        const room = { ...(w.state || {}) } as {
          phase: string;
          pot: number;
          toCall: number;
          currentBet: number;
          isYourTurn: boolean;
          turn: string | null;
          canReady: boolean;
          isReady: boolean;
          winners: unknown[];
          community: unknown[];
          players: Array<Record<string, unknown>>;
        };
        room.phase = "complete";
        room.pot = 0;
        room.toCall = 0;
        room.currentBet = 0;
        room.isYourTurn = false;
        room.turn = null;
        room.canReady = true;
        room.isReady = false;
        room.winners = [];
        room.community = [];
        room.players = (room.players || []).map((p) => ({
          ...p,
          bet: 0,
          cards: [],
          folded: false,
          allIn: false,
          isTurn: false,
          ready: p.isYou ? false : true,
          stack: 1000,
        }));
        w.state = room;
        if (typeof w.render === "function") w.render();
      });
      await page.waitForTimeout(80);
      const postHand = await panelMetrics(page);

      await openReviewScene(page, "step");
      const reviewStep = await panelMetrics(page);

      await openReviewScene(page, "retry");
      const reviewRetry = await panelMetrics(page);

      await openReviewScene(page, "result");
      const reviewResult = await panelMetrics(page);

      expect(inHand.panel).toBeTruthy();
      for (const [label, sample] of [
        ["post-hand", postHand],
        ["review-step", reviewStep],
        ["review-retry", reviewRetry],
        ["review-result", reviewResult],
      ] as const) {
        expect(
          nearlyEqual(sample.panel!.height, inHand.panel!.height, 2),
          `${label} panel height drifted (${sample.panel!.height} vs ${inHand.panel!.height})`,
        ).toBe(true);
        expect(
          nearlyEqual(sample.panel!.y, inHand.panel!.y, 2),
          `${label} panel top drifted (${sample.panel!.y} vs ${inHand.panel!.y})`,
        ).toBe(true);
        expect(
          nearlyEqual(sample.players!.y, inHand.players!.y, 2),
          `${label} players y drifted`,
        ).toBe(true);
      }
    });

    test("seat columns align and table does not overflow horizontally", async ({ page }) => {
      await openOfflineTable(page, "Alexandrine1");
      await forceTableState(page, "in-hand-on-turn");
      await page.waitForTimeout(100);

      const metrics = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("#players .table-player-row")];
        const col = (row: Element, sel: string) => {
          const el = row.querySelector(sel);
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { left: b.left, right: b.right };
        };
        const actionLefts = rows.map((r) => col(r, ".player-action")?.left).filter((n) => n != null);
        const stackLefts = rows.map((r) => col(r, ".player-stack")?.left).filter((n) => n != null);
        const spread = (xs: number[]) =>
          xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
        const felt = document.querySelector(".felt")?.getBoundingClientRect();
        const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        return {
          statusSpread: spread(actionLefts as number[]),
          stackSpread: spread(stackLefts as number[]),
          overflowX,
          feltWidth: felt?.width || 0,
        };
      });

      expect(metrics.statusSpread, "status column drifted across seats").toBeLessThanOrEqual(1);
      expect(metrics.stackSpread, "stack column drifted across seats").toBeLessThanOrEqual(1);
      expect(metrics.overflowX, "page scrolls horizontally").toBe(false);
      expect(metrics.feltWidth).toBeGreaterThan(0);
    });
  });
}
