#!/usr/bin/env node
/**
 * Playwright: key chrome bounding boxes must stay put across Hand Review steps
 * and between bot→hero turn changes. Needs a running server + playwright.
 *   node scripts/check-layout-stability.mjs [baseUrl] [chromePath]
 */
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3020";
const executablePath = process.argv[3] || undefined;
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
];

const WATCH = [
  ".control-panel",
  "#heroHand",
  "#potValue",
  "#players",
  "#gameButtons",
  "#handReviewChrome",
  "#handReviewTimeline",
  "#handReviewVerdict",
];

function sameBox(a, b, tol = 1) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) <= tol &&
    Math.abs(a.y - b.y) <= tol &&
    Math.abs(a.width - b.width) <= tol &&
    Math.abs(a.height - b.height) <= tol
  );
}

async function boxes(page) {
  return page.evaluate((selectors) => {
    const out = {};
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el || el.classList.contains("hidden")) {
        out[selector] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      out[selector] = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return out;
  }, WATCH);
}

async function dotXs(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#handReviewTimeline .hand-review-dot")].map(
      (el) => el.getBoundingClientRect().x,
    ),
  );
}

async function runViewport(browser, viewport) {
  const failures = [];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  // Offline bot table via Host → add bots → ready.
  await page.fill("#nameInput", "Hero");
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)");
  for (let i = 0; i < 2; i += 1) {
    await page.click("#menuBtn");
    await page.waitForSelector("#gameMenuModal:not(.hidden)");
    await page.click("#addBotBtn");
    await page.waitForTimeout(120);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
  }
  await page.locator("#gameButtons button", { hasText: /Ready up/i }).click();

  // Hero → bot turn: panel / seats / cards must not jump.
  for (let i = 0; i < 200; i += 1) {
    const heroTurn = await page.evaluate(() => Boolean(window.state?.isYourTurn));
    if (!heroTurn) {
      await page.waitForTimeout(80);
      continue;
    }
    const before = await boxes(page);
    const btn = page.locator("#gameButtons button:not([disabled])", {
      hasText: /^(Check|Call)/,
    });
    if (!(await btn.count())) break;
    await btn.first().click();
    await page.waitForTimeout(250);
    const after = await boxes(page);
    for (const sel of [".control-panel", "#players", "#heroHand", "#potValue"]) {
      if (!sameBox(before[sel], after[sel], 2)) {
        failures.push(
          `${viewport.width}: ${sel} shifted on turn change ${JSON.stringify(before[sel])} -> ${JSON.stringify(after[sel])}`,
        );
      }
    }
    break;
  }

  // Reach hand-complete, open review if available, step through dots.
  for (let i = 0; i < 400; i += 1) {
    const phase = await page.evaluate(() => window.state?.phase);
    if (phase === "complete") break;
    const heroTurn = await page.evaluate(() => Boolean(window.state?.isYourTurn));
    if (heroTurn) {
      const btn = page.locator("#gameButtons button:not([disabled])", {
        hasText: /^(Check|Call|Fold)/,
      });
      if (await btn.count()) await btn.first().click().catch(() => {});
    }
    await page.waitForTimeout(80);
  }

  const reviewBtn = page.locator("#gameButtons button", { hasText: /Review hand/i });
  if (await reviewBtn.count()) {
    await reviewBtn.first().click();
    await page.waitForSelector("body.hand-review-open");
    const baselineDots = await dotXs(page);
    const chromeBefore = await boxes(page);
    const next = page.locator("#handReviewNextBtn");
    for (let step = 0; step < 12; step += 1) {
      if (await next.isDisabled().catch(() => true)) break;
      await next.click();
      await page.waitForTimeout(60);
      const xs = await dotXs(page);
      if (xs.length !== baselineDots.length) {
        failures.push(`${viewport.width}: dot count changed while stepping`);
        break;
      }
      for (let i = 0; i < xs.length; i += 1) {
        if (Math.abs(xs[i] - baselineDots[i]) > 1) {
          failures.push(
            `${viewport.width}: dot[${i}] x shifted ${baselineDots[i]} -> ${xs[i]} on step ${step + 1}`,
          );
          break;
        }
      }
      const chromeAfter = await boxes(page);
      for (const sel of ["#handReviewChrome", "#handReviewTimeline", "#handReviewVerdict"]) {
        if (!sameBox(chromeBefore[sel], chromeAfter[sel], 2)) {
          failures.push(
            `${viewport.width}: ${sel} shifted while stepping ${JSON.stringify(chromeBefore[sel])} -> ${JSON.stringify(chromeAfter[sel])}`,
          );
        }
      }
    }
    await page.keyboard.press("Escape");
  }

  await context.close();
  return failures;
}

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const failures = [];
for (const viewport of VIEWPORTS) {
  failures.push(...(await runViewport(browser, viewport)));
}
await browser.close();
if (failures.length) {
  console.error("Layout stability failed:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("check-layout-stability: key chrome stable across turns and review steps");
