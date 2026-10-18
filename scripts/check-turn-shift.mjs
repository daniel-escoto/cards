#!/usr/bin/env node
/**
 * Playwright check: the action panel and seat list must not move when the turn passes
 * from the hero to a CPU. Needs a running server and `playwright` installed (not in CI).
 *   node scripts/check-turn-shift.mjs [baseUrl] [chromePath]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://localhost:3000";
const executablePath = process.argv[3] || undefined;
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 900, height: 800 },
  { width: 390, height: 844 },
];
const WATCH = [".control-panel", "#turnInfo", "#players", "#community"];

async function runViewport(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.fill("#nameInput", "Hero");
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)");
  for (let i = 0; i < 2; i += 1) {
    await page.click("#menuBtn");
    await page.waitForSelector("#gameMenuModal:not(.hidden)");
    await page.click("#addBotBtn");
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
  await page.locator("#gameButtons button", { hasText: /Ready up/i }).click();

  const rects = () =>
    page.evaluate((selectors) => {
      const out = {};
      for (const selector of selectors) {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        out[selector] = r ? [r.x, r.y, r.width, r.height].map((v) => v.toFixed(3)).join(",") : "";
      }
      return out;
    }, WATCH);

  const failures = [];
  let checked = 0;
  for (let i = 0; i < 400 && checked < 3; i += 1) {
    const heroTurn = await page.evaluate(() => Boolean(window.state?.isYourTurn));
    if (heroTurn) {
      await page.waitForTimeout(300);
      const before = await rects();
      const button = page.locator("#gameButtons button:not([disabled])", {
        hasText: /^(Check|Call)/,
      });
      if (!(await button.count())) break;
      await button.first().click();
      await page
        .waitForFunction(
          () => /to act$/.test(document.querySelector("#turnInfo")?.textContent || ""),
          null,
          {
            timeout: 3000,
          },
        )
        .catch(() => {});
      if (!/to act$/.test((await page.locator("#turnInfo").textContent()) || "")) continue;
      const after = await rects();
      checked += 1;
      for (const selector of WATCH) {
        if (before[selector] !== after[selector]) {
          failures.push(
            `${viewport.width}x${viewport.height} ${selector}: ${before[selector]} -> ${after[selector]}`,
          );
        }
      }
    }
    await page.waitForTimeout(100);
  }
  await context.close();
  if (!checked)
    failures.push(`${viewport.width}x${viewport.height}: never observed a hero→CPU turn change`);
  return failures;
}

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const failures = [];
for (const viewport of VIEWPORTS) failures.push(...(await runViewport(browser, viewport)));
await browser.close();
if (failures.length) {
  console.error("Layout shifted on turn change:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("check-turn-shift: panel and seat list stable across turn changes");
