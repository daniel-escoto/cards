import { test, expect } from "@playwright/test";
import { VIEWPORTS, openOfflineTable, forceTableState } from "./fixtures";

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

for (const vp of VIEWPORTS) {
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

      // Between hands (lobby/ready): panel may compact, but its x origin and seat list
      // x origin must stay put so the table does not horizontally jump.
      expect(
        nearlyEqual(betweenHands.panel!.x, onTurn.panel!.x, 2),
        "between-hands panel x drifted",
      ).toBe(true);
      expect(
        nearlyEqual(betweenHands.players!.x, onTurn.players!.x, 2),
        "between-hands players x drifted",
      ).toBe(true);
    });
  });
}
