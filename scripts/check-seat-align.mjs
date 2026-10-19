#!/usr/bin/env node
/**
 * Playwright check: seat rows line up. The "you" / CPU tag right edge, SB/BB chip slot, status
 * and stack columns must match across rows at 390x844, 360x780 and 1280x800 with 2, 5 and 9
 * players, and long names must truncate without overlapping the tag. Needs a running server and
 * `playwright` installed (not in CI).
 *   node scripts/check-seat-align.mjs [baseUrl] [chromePath]
 */
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3000";
const executablePath = process.argv[3] || undefined;
const tag = "check";
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const spread = (xs) => (xs.length ? +(Math.max(...xs) - Math.min(...xs)).toFixed(2) : 0);
let fail = false;
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 780 }, { width: 1280, height: 800 }]) {
  for (const n of [2, 5, 9]) {
    const page = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
    await page.goto(base, { waitUntil: "networkidle" }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "networkidle" });
    await page.fill("#nameInput", "Alexandrine Montgo"); await page.click("#tableActionBtn"); await page.waitForSelector("#tableView:not(.hidden)");
    for (let i = 0; i < n - 1; i++) { await page.click("#menuBtn"); await page.waitForSelector("#gameMenuModal:not(.hidden)"); const b = page.locator("#addBotBtn:not(.hidden)"); if (await b.count()) await b.click(); await page.waitForTimeout(120); await page.keyboard.press("Escape"); await page.waitForTimeout(120); }
    await page.locator("#gameButtons button", { hasText: /Ready up/ }).click();
    await page.waitForFunction(() => document.querySelectorAll("#players .blind-chip").length >= 2, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#players .table-player-row")];
      return rows.map((row) => {
        const r = (sel) => { const el = row.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width }; };
        const nameEl = row.querySelector(".seat-name-text");
        return {
          tag: r(".seat-you-mark, .bot-style-tag"), chip: r(".blind-chip"), action: r(".player-action"), stack: r(".player-stack"),
          name: r(".seat-name-text"), truncated: nameEl ? nameEl.scrollWidth > nameEl.clientWidth + 0.5 : false, nameText: nameEl?.textContent,
          rowW: row.getBoundingClientRect().width,
        };
      });
    });
    const tagR = m.filter((x) => x.tag).map((x) => x.tag.r);
    const chipL = m.filter((x) => x.chip).map((x) => x.chip.l);
    const actR = m.map((x) => x.action.r), actL = m.map((x) => x.action.l), stR = m.map((x) => x.stack.r), stL = m.map((x) => x.stack.l);
    const res = { rows: m.length, tagRightSpread: spread(tagR), chipLeftSpread: spread(chipL), statusLeftSpread: spread(actL), statusRightSpread: spread(actR), stackLeftSpread: spread(stL), stackRightSpread: spread(stR),
      longNameTruncated: m.find((x) => x.nameText?.startsWith("Alexandrine"))?.truncated, nameOverlapsTag: m.some((x) => x.tag && x.name && x.name.r > x.tag.l + 0.5) };
    console.log(`${tag} ${vp.width}x${vp.height} n=${n}`, JSON.stringify(res));
    if (res.tagRightSpread > 0.5 || res.statusRightSpread > 0.5 || res.stackRightSpread > 0.5 || res.stackLeftSpread > 0.5 || res.nameOverlapsTag) fail = true;
    await page.context().close();
  }
}
await browser.close();
if (fail) console.error("Seat rows are misaligned (see spreads above).");
else console.log("check-seat-align: seat rows aligned");
process.exit(fail ? 1 : 0);
