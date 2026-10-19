#!/usr/bin/env node
/**
 * Playwright check: the action panel and seat list must not move when the turn passes
 * from the hero to a CPU, nor when a hand ends (showdown / fold-win) and the table goes to
 * ready-up. Needs a running server and `playwright` installed (not in CI).
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

  // Every rAF, record the panel / seat-list rect per hand phase (lobby excluded: no hand yet).
  await page.evaluate(() => {
    const w = window;
    w.__phaseRects = {};
    const tick = () => {
      const phase = w.state?.phase;
      if (phase && phase !== "lobby" && phase !== "gameover") {
        const key = ["preflop", "flop", "turn", "river"].includes(phase) ? "in-hand" : phase;
        const rect = (selector) => {
          const r = document.querySelector(selector)?.getBoundingClientRect();
          return r ? [r.y, r.height].map((v) => v.toFixed(2)).join("/") : "";
        };
        const value = `panel ${rect(".control-panel")} players ${rect("#players")}`;
        (w.__phaseRects[key] ||= {})[value] = true;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });

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
  // Play on until a hand has finished, so in-hand, showdown/fold-win and ready-up are all seen.
  for (let i = 0; i < 300; i += 1) {
    const seen = await page.evaluate(() => Object.keys(window.__phaseRects));
    if (seen.includes("in-hand") && seen.includes("complete")) break;
    const button = page.locator("#gameButtons button:not([disabled])", { hasText: /^(Check|Call)/ });
    if (await page.evaluate(() => Boolean(window.state?.isYourTurn)) && (await button.count())) {
      await button.first().click().catch(() => {});
    }
    await page.waitForTimeout(100);
  }
  const phaseRects = await page.evaluate(() =>
    Object.fromEntries(Object.entries(window.__phaseRects).map(([k, v]) => [k, Object.keys(v)])),
  );
  const distinct = new Set(Object.values(phaseRects).flat());
  if (!phaseRects.complete) failures.push(`${viewport.width}x${viewport.height}: never reached ready-up`);
  if (distinct.size > 1) {
    failures.push(
      `${viewport.width}x${viewport.height} panel height changes across hand phases: ${JSON.stringify(phaseRects)}`,
    );
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
  console.error("Layout shifted:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("check-turn-shift: panel and seat list stable across turn changes and hand end");
