/**
 * Capture Trainer + Coach hint + Invite sub-view screenshots for the PR.
 * Usage: node scripts/ui-screenshots-trainer-coach.mjs [baseUrl] [outDir]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:3847";
const outDir = process.argv[3] || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
  return file;
}

async function enableCoachAndWait(page) {
  await page.locator("#menuBtn").click();
  await page.locator("#coachBtn").click();
  // Coach: On
  await page.waitForFunction(() => {
    const btn = document.querySelector("#coachBtn");
    return btn && /Coach:\s*On/i.test(btn.textContent || "");
  });
  await page.locator("#closeMenuBtn").click();
  await page.waitForSelector("#coachHint:not(.hidden)", { timeout: 120000 });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

// —— Trainer home + drill (375 / 850 / 1280) ——
for (const width of [375, 850, 1280]) {
  const context = await browser.newContext({
    viewport: { width, height: width === 375 ? 812 : 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(baseUrl + "/");
  await page.fill("#nameInput", "Hero");
  await shot(page, `trainer-home-${width}`);
  await page.locator("#trainerBtn").click();
  await page.waitForSelector("#trainerView:not(.hidden)");
  await shot(page, `trainer-drill-${width}`);
  await page.locator("#trainerRaiseBtn").click();
  await page.waitForSelector("#trainerFeedback:not(.hidden)");
  await shot(page, `trainer-feedback-${width}`);
  await context.close();
}

// —— Invite sub-view at 375 + 1280 ——
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(baseUrl + "/");
  await page.fill("#nameInput", "Host");
  await page.locator("#tableActionBtn").click();
  await page.waitForSelector("#tableView:not(.hidden)");
  // Online host may need connection — if offline path, Invite is hidden.
  // Force online create via socket if available; otherwise Practice then skip invite.
  const inviteVisible = await page.locator("#shareGameBtn").isVisible().catch(() => false);
  if (!inviteVisible) {
    // Offline practice — Invite hidden. Create room via socket from page.
    await page.evaluate(async () => {
      if (!window.io) return;
      const socket = window.io({ transports: ["websocket"] });
      await new Promise((resolve) => socket.on("connect", resolve));
      await new Promise((resolve, reject) => {
        socket.emit(
          "room:create",
          { name: "Host", deviceId: "shot-host", smallBlind: 10, bigBlind: 20 },
          (res) => (res?.ok ? resolve(res) : reject(res)),
        );
      });
    });
    await page.reload();
  }
  await context.close();
}

// Reliable online room + coach via Playwright page + socket helpers
async function openBotTable(page, name) {
  await page.goto(baseUrl + "/");
  await page.fill("#nameInput", name);
  // Prefer Host when connected; otherwise Practice then add bots.
  const online = await page.evaluate(() => {
    return new Promise((resolve) => {
      if (typeof io === "undefined") return resolve(false);
      const s = io({ transports: ["websocket"] });
      const t = setTimeout(() => resolve(false), 3000);
      s.on("connect", () => {
        clearTimeout(t);
        s.disconnect();
        resolve(true);
      });
    });
  });
  if (online) {
    // Ensure money mode off, host online
    await page.evaluate(() => {
      const money = document.querySelector("#moneyModeInput");
      if (money) money.checked = false;
    });
    // Wait for Host button enabled
    await page.waitForFunction(() => {
      const btn = document.querySelector("#tableActionBtn");
      return btn && !btn.disabled;
    });
    await page.locator("#tableActionBtn").click();
  } else {
    await page.locator("#practiceBtn").click();
  }
  await page.waitForSelector("#tableView:not(.hidden)");
  // Add a couple bots from menu
  await page.locator("#menuBtn").click();
  for (let i = 0; i < 2; i++) {
    const add = page.locator("#addBotBtn");
    if (await add.isVisible()) await add.click();
    await page.waitForTimeout(200);
  }
  await page.locator("#closeMenuBtn").click();
}

// Coach screenshots
for (const width of [375, 850, 1280]) {
  const context = await browser.newContext({
    viewport: { width, height: width === 375 ? 812 : 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await openBotTable(page, "CoachHero");
  // Ready up and wait for turn with coach
  await page.locator("#menuBtn").click();
  const coachBtn = page.locator("#coachBtn");
  if (await coachBtn.isEnabled()) {
    await coachBtn.click();
  }
  await page.locator("#closeMenuBtn").click();

  // Click Ready if present
  const ready = page.locator("#gameButtons button", { hasText: /Ready up/i });
  if (await ready.count()) {
    await ready.first().click();
  }

  // Wait for coach hint up to 2 minutes (bots think)
  try {
    await page.waitForSelector("#coachHint:not(.hidden) .coach-hint-headline", {
      timeout: 120000,
    });
    // Ensure no stray Call label in turnInfo while coach visible
    const turnText = await page.locator("#turnInfo").innerText().catch(() => "");
    const coachText = await page.locator("#coachHint").innerText();
    console.log(`coach@${width}:`, coachText.replace(/\n/g, " | "), "| turnInfo:", turnText);
    await shot(page, `coach-hint-${width}`);
  } catch (error) {
    await shot(page, `coach-hint-${width}-miss`);
    console.error(`coach hint miss at ${width}:`, error.message);
  }
  await context.close();
}

// Invite menu at 375 and 1280 (online room)
for (const width of [375, 1280]) {
  const context = await browser.newContext({
    viewport: { width, height: width === 375 ? 812 : 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(baseUrl + "/");
  await page.fill("#nameInput", "InviteHost");
  await page.waitForFunction(() => {
    const btn = document.querySelector("#tableActionBtn");
    return btn && !btn.disabled;
  });
  await page.locator("#tableActionBtn").click();
  await page.waitForSelector("#tableView:not(.hidden)");
  await page.locator("#menuBtn").click();
  await page.waitForSelector("#menuMainView:not(.hidden)");
  await shot(page, `menu-main-invite-row-${width}`);
  if (await page.locator("#shareGameBtn").isVisible()) {
    await page.locator("#shareGameBtn").click();
    await page.waitForSelector("#menuInviteView:not(.hidden)");
    await shot(page, `menu-invite-subview-${width}`);
    const link = await page.locator("#shareLink").inputValue();
    console.log(`invite link@${width}:`, link);
  }
  await context.close();
}

await browser.close();
console.log("Screenshots done →", outDir);
