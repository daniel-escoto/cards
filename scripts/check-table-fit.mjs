#!/usr/bin/env node
/**
 * Playwright check: the in-hand table fits its window at every width from 700 to 1440px,
 * with the Wide table setting off and on. Nothing inside the felt may stick out past the
 * felt's edges and the page must not scroll sideways. Needs a running server and
 * `playwright` installed (not in CI).
 *   node scripts/check-table-fit.mjs [baseUrl] [chromePath] [screenshotDir]
 */
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3000";
const executablePath = process.argv[3] || undefined;
const shotDir = process.argv[4] || "";
const WIDTHS = [700, 780, 850, 900, 1000, 1039, 1040, 1100, 1280, 1440];
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let fail = false;
for (const wide of [false, true]) {
  // One table per setting; resize through the sweep so the hand (5 board cards) stays put.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(
    (on) => localStorage.setItem("holdem:wide-table", on ? "on" : "off"),
    wide,
  );
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.fill("#nameInput", "Daniel");
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)");
  for (let i = 0; i < 4; i += 1) {
    await page.click("#menuBtn");
    await page.click("#addBotBtn");
    await page.waitForTimeout(120);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
  }
  // Hero's turn with a full five-card board: the widest board next to the widest action row.
  const ensureTurn = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const text = (await page.textContent("#gameButtons")) || "";
      if (/Call|Check/.test(text)) break;
      const ready = page.locator("#gameButtons button", { hasText: /Ready up/ });
      if (await ready.count())
        await ready
          .first()
          .click()
          .catch(() => {});
      await page
        .waitForFunction(
          () => /Call|Check/.test(document.querySelector("#gameButtons")?.textContent || ""),
          null,
          { timeout: 20000 },
        )
        .catch(() => {});
    }
    await page.evaluate(() => {
      const board = document.querySelector(".community");
      const card = board.querySelector(".card") || document.querySelector("#heroHand .card");
      while (card && board.querySelectorAll(".card").length < 5)
        board.appendChild(card.cloneNode(true));
    });
  };
  for (const width of WIDTHS) {
    await ensureTurn();
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const felt = document.querySelector(".felt").getBoundingClientRect();
      const offenders = [];
      for (const el of document.querySelectorAll(".felt *")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
        if (r.right > felt.right + 1 || r.left < felt.left - 1) {
          offenders.push(
            `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} ${Math.round(r.left)}-${Math.round(r.right)}`,
          );
        }
      }
      return {
        felt: [Math.round(felt.left), Math.round(felt.right)],
        scroll: document.documentElement.scrollWidth - innerWidth,
        cards: document.querySelectorAll(".community .card").length,
        offenders: offenders.slice(0, 6),
        buttons: document
          .querySelector("#gameButtons")
          ?.textContent.replace(/\s+/g, " ")
          .trim()
          .slice(0, 40),
      };
    });
    const ok = m.offenders.length === 0 && m.scroll <= 0;
    if (!ok) fail = true;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${width}px wide=${wide ? "on" : "off"} felt ${m.felt.join("-")} board ${m.cards} [${m.buttons}] scrollX ${m.scroll} ${m.offenders.join(" | ")}`,
    );
    if (shotDir && [850, 1000].includes(width)) {
      await page.screenshot({ path: `${shotDir}/table-${width}-wide-${wide ? "on" : "off"}.png` });
    }
  }
  await context.close();
}
await browser.close();
if (fail) {
  console.error("Table overflows its window at some widths.");
  process.exit(1);
}
console.log("Table fits at every width.");
