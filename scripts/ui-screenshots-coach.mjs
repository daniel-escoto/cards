/**
 * Offline Practice → bots → Coach On → wait for hero turn → screenshot coach card.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:3847";
const outDir = process.argv[3] || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function setupCoachHand(page) {
  await page.goto(baseUrl + "/");
  await page.fill("#nameInput", "Hero");
  await page.locator("#practiceBtn").click();
  await page.waitForSelector("#tableView:not(.hidden)");

  await page.locator("#menuBtn").click();
  await page.waitForSelector("#menuMainView:not(.hidden)");
  for (let i = 0; i < 2; i++) {
    const add = page.locator("#addBotBtn");
    if (!(await add.isVisible()) || (await add.isDisabled())) break;
    await add.click();
    await page.waitForTimeout(150);
  }
  const coachBtn = page.locator("#coachBtn");
  await coachBtn.waitFor({ state: "visible" });
  if (await coachBtn.isEnabled()) {
    const label = await coachBtn.innerText();
    if (!/Coach:\s*On/i.test(label)) await coachBtn.click();
  }
  await page.locator("#closeMenuBtn").click();

  const ready = page.locator("#gameButtons button").filter({ hasText: /Ready up/i });
  await ready.first().click();

  await page.waitForFunction(
    () => {
      const hint = document.querySelector("#coachHint");
      return (
        hint &&
        !hint.classList.contains("hidden") &&
        Boolean(hint.querySelector(".coach-hint-headline"))
      );
    },
    null,
    { timeout: 90000 },
  );
}

for (const width of [375, 850, 1280]) {
  const height = width === 375 ? 812 : 900;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await setupCoachHand(page);

  const coachText = await page.locator("#coachHint").innerText();
  const turnVisible = await page.evaluate(() => {
    const el = document.querySelector("#turnInfo");
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
  const turnText = await page.locator("#turnInfo").innerText().catch(() => "");
  console.log(`coach@${width}:`, JSON.stringify(coachText), "turnVisible", turnVisible, turnText);

  if (turnVisible && /Call\s+\d+/i.test(turnText)) {
    throw new Error(`Duplicate Call label still visible at ${width}: ${turnText}`);
  }

  await page.screenshot({
    path: path.join(outDir, `coach-hint-${width}.png`),
    fullPage: false,
  });
  await page.locator(".control-panel").screenshot({
    path: path.join(outDir, `coach-hint-panel-${width}.png`),
  });
  console.log("wrote coach-hint-" + width);
  await context.close();
}

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
  await page.waitForSelector("#tableView:not(.hidden)", { timeout: 15000 });

  let hasInvite = await page.locator("#shareGameBtn").isVisible().catch(() => false);
  if (!hasInvite) {
    const roomId = await page.evaluate(async () => {
      const socket = io({ transports: ["websocket"] });
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("connect timeout")), 5000);
        socket.on("connect", () => {
          clearTimeout(t);
          resolve();
        });
      });
      return await new Promise((resolve, reject) => {
        socket.emit(
          "room:create",
          {
            name: "InviteHost",
            deviceId: localStorage.getItem("holdem:deviceId") || "invite-shot",
            smallBlind: 10,
            bigBlind: 20,
          },
          (res) =>
            res?.ok ? resolve(res.roomId) : reject(new Error(res?.error || "create failed")),
        );
      });
    });
    await page.goto(`${baseUrl}/${roomId}`);
    await page.fill("#nameInput", "InviteHost");
    await page.setTableMode?.();
    // Ensure join mode
    await page.locator("#joinModeBtn").click().catch(() => {});
    await page.fill("#roomInput", roomId);
    await page.locator("#tableActionBtn").click();
    await page.waitForSelector("#tableView:not(.hidden)");
    hasInvite = true;
  }

  await page.locator("#menuBtn").click();
  await page.waitForSelector("#menuMainView:not(.hidden)");
  await page.screenshot({
    path: path.join(outDir, `menu-main-invite-row-${width}.png`),
    fullPage: false,
  });
  await page.locator("#shareGameBtn").click();
  await page.waitForSelector("#menuInviteView:not(.hidden)");
  const link = await page.locator("#shareLink").inputValue();
  console.log(`invite@${width}:`, link);
  if (!/\/[A-Z0-9]{6}$/i.test(link.replace(/\/$/, ""))) {
    console.warn("unexpected invite link shape", link);
  }
  await page.screenshot({
    path: path.join(outDir, `menu-invite-subview-${width}.png`),
    fullPage: false,
  });
  await context.close();
}

await browser.close();
console.log("done");
