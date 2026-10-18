#!/usr/bin/env node
/**
 * Capture holdem.nyc UI screens at desktop (1280x800) and mobile (390x844).
 * Usage: node scripts/ui-screenshots.mjs <before|after> [baseUrl]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const phase = process.argv[2] || "before";
const baseUrl = process.argv[3] || "http://localhost:3000";
const outDir = `/opt/cursor/artifacts/${phase}`;
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

async function shot(page, viewport, slug) {
  const file = path.join(outDir, `${viewport}-${slug}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function waitVisible(page, selector, timeout = 8000) {
  await page.waitForSelector(selector, { state: "visible", timeout });
}

async function hostOfflineTable(page, name = "Alex") {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await waitVisible(page, "#welcome");
  await page.fill("#nameInput", name);
  // Prefer online host when socket is up; falls back to offline practice if not.
  await page.click("#tableActionBtn");
  await waitVisible(page, "#tableView", 15000);
}

async function openMenu(page) {
  await page.click("#menuBtn");
  await waitVisible(page, "#gameMenuModal:not(.hidden)");
  await waitVisible(page, "#menuMainView:not(.hidden)");
}

async function closeMenu(page) {
  const close = page.locator("#closeMenuBtn, #closeSettingsMenuBtn, #closeHostMenuBtn").first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page.waitForSelector("#gameMenuModal.hidden", { timeout: 5000 }).catch(() => {});
}

async function addBots(page, count = 2) {
  for (let i = 0; i < count; i += 1) {
    await openMenu(page);
    await page.click("#addBotBtn");
    await page.waitForTimeout(200);
    await closeMenu(page);
    await page.waitForTimeout(150);
  }
}

async function readyUp(page) {
  // Lobby / between-hands control is labeled "Ready up" (shortcut C).
  const ready = page.locator("#gameButtons button", { hasText: /Ready up/i });
  await ready.waitFor({ state: "visible", timeout: 15000 });
  await ready.click();
}

async function waitForInHand(page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const pot = document.querySelector("#potValue");
      const phaseEl = document.body;
      // Community or action controls indicate a live hand.
      const community = document.querySelector("#community");
      const hasCards = community && community.children.length > 0;
      const actions = document.querySelector("#gameButtons");
      const hasActions = actions && actions.querySelectorAll("button").length > 0;
      const yourTurn = document.querySelector("#turnInfo.your-turn");
      return Boolean(hasCards || yourTurn || (hasActions && pot && pot.textContent !== "0"));
    },
    { timeout },
  );
}

async function captureSettingsSections(page, viewport) {
  await openMenu(page);
  await shot(page, viewport.name, "game-menu");
  await page.click("#openSettingsBtn");
  await waitVisible(page, "#menuSettingsView:not(.hidden)");
  await shot(page, viewport.name, "settings-main");

  // Sound + name are on the main settings view; Appearance / Shortcuts were removed.
  await page.click("#closeSettingsBtn");
  await waitVisible(page, "#menuMainView:not(.hidden)");
}

async function captureHostSections(page, viewport) {
  const hostBtn = page.locator("#openHostBtn");
  if (!(await hostBtn.isVisible().catch(() => false))) {
    // Host button may be hidden until syncHostMenuSection decides; force open if possible.
    const canOpen = await page.evaluate(() => {
      const btn = document.querySelector("#openHostBtn");
      return btn && !btn.classList.contains("hidden");
    });
    if (!canOpen) {
      // Try revealing via evaluate for screenshot completeness when host.
      await page.evaluate(() => {
        const btn = document.querySelector("#openHostBtn");
        if (btn) btn.classList.remove("hidden");
      });
    }
  }
  if (await hostBtn.isVisible().catch(() => false)) {
    await hostBtn.click();
    await waitVisible(page, "#menuHostView:not(.hidden)");
    await shot(page, viewport.name, "host-panel");
    // Capture scrolled sections if tall
    for (const id of ["shotClockPanel", "readyTimerPanel", "rabbitHuntPanel"]) {
      const panel = page.locator(`#${id}`);
      if (await panel.isVisible().catch(() => false)) {
        await panel.scrollIntoViewIfNeeded();
        await shot(page, viewport.name, `host-${id.replace("Panel", "").replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "")}`);
      }
    }
    await page.click("#closeHostBtn");
    await waitVisible(page, "#menuMainView:not(.hidden)");
  }
}

async function forceBustUi(page) {
  await page.evaluate(() => {
    const room = {
      pot: 0,
      potCents: 0,
      phase: "waiting",
      canRestartGame: true,
      canRebuy: true,
      bustedOut: true,
      players: [
        {
          id: "you",
          name: "Alex",
          stack: 0,
          stackCents: 0,
          isYou: true,
          isBot: false,
          sittingOut: false,
          ready: false,
          cards: [],
        },
        {
          id: "bot1",
          name: "CPU 1",
          stack: 2400,
          stackCents: 0,
          isBot: true,
          sittingOut: false,
          ready: true,
          cards: [],
        },
        {
          id: "bot2",
          name: "CPU 2",
          stack: 1600,
          stackCents: 0,
          isBot: true,
          sittingOut: false,
          ready: true,
          cards: [],
        },
      ],
    };
    // Prefer real render path when available.
    if (typeof renderBustPanel === "function") {
      const turnInfo = document.querySelector("#turnInfo");
      const gameButtons = document.querySelector("#gameButtons");
      if (turnInfo && gameButtons) {
        gameButtons.replaceChildren();
        // Minimal stubs used by renderBustPanel
        window.state = room;
        renderBustPanel(room);
      }
    }
  });
  await page.waitForTimeout(150);
}

async function captureSpectator(page, context, viewport) {
  // Create an online room with host, then watch from a second page.
  const hostPage = await context.newPage();
  await hostPage.setViewportSize({ width: viewport.width, height: viewport.height });
  await hostPage.goto(baseUrl, { waitUntil: "networkidle" });
  await hostPage.evaluate(() => localStorage.clear());
  await hostPage.reload({ waitUntil: "networkidle" });
  await hostPage.fill("#nameInput", "Hosty");
  await hostPage.click("#tableActionBtn");
  await hostPage.waitForSelector("#tableView:not(.hidden)", { timeout: 15000 });
  const code = (await hostPage.locator("#roomCode").innerText()).trim();
  if (!code || code.length < 4) {
    await hostPage.close();
    console.warn("skip spectator — no room code (offline?)");
    return;
  }

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await waitVisible(page, "#welcome");
  await page.evaluate(() => document.querySelector("#joinModeBtn")?.click());
  await page.waitForFunction(
    () => !document.querySelector("#roomCodeLabel")?.classList.contains("hidden"),
    { timeout: 5000 },
  );
  await page.fill("#nameInput", "Watcher");
  await page.fill("#roomInput", code);
  // Nudge preview so Watch appears for an existing room.
  await page.waitForTimeout(400);
  const watchVisible = await page.locator("#watchBtn:not(.hidden)").isVisible().catch(() => false);
  if (watchVisible) {
    await page.click("#watchBtn");
  } else {
    await page.click("#tableActionBtn");
  }
  await page.waitForSelector("#tableView:not(.hidden)", { timeout: 15000 });
  await shot(page, viewport.name, "spectator");
  await hostPage.close();
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // 1) Home / lobby (host mode)
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await waitVisible(page, "#welcome");
  await shot(page, viewport.name, "home-host");

  // 2) Host/create flow (filled)
  await page.fill("#nameInput", "Alex");
  await page.fill("#smallBlindInput", "10");
  await page.fill("#bigBlindInput", "20");
  await shot(page, viewport.name, "host-create");

  // 3) Join flow (DOM click — synthetic pointer can miss the mode tabs)
  await page.evaluate(() => document.querySelector("#joinModeBtn")?.click());
  await waitVisible(page, "#roomInput");
  await page.fill("#roomInput", "ABCD12");
  await shot(page, viewport.name, "join");

  // 4) Waiting room with bots
  await page.evaluate(() => document.querySelector("#hostModeBtn")?.click());
  await page.click("#tableActionBtn");
  await waitVisible(page, "#tableView", 15000);
  await addBots(page, 2);
  await page.waitForTimeout(400);
  await shot(page, viewport.name, "waiting-room");

  // 5) Game menu + settings sections + host panel
  await captureSettingsSections(page, viewport);
  await captureHostSections(page, viewport);
  await closeMenu(page);

  // 6) In-hand table with action bar
  await readyUp(page);
  // Wait until either your turn or bots finish acting into a visible hand state.
  await page
    .waitForFunction(
      () => {
        const yourTurn = document.querySelector("#turnInfo.your-turn");
        const community = document.querySelector("#community");
        const bet = document.querySelector("#betControls:not(.hidden)");
        const fold = Array.from(document.querySelectorAll("#gameButtons button")).some((b) =>
          /fold|check|call|raise|bet/i.test(b.textContent || ""),
        );
        return Boolean(yourTurn || bet || fold || (community && community.children.length >= 3));
      },
      { timeout: 25000 },
    )
    .catch(() => {});
  // If not our turn, wait a bit for bots / cycle until action bar shows.
  for (let i = 0; i < 40; i += 1) {
    const hasAction = await page.evaluate(() => {
      return Boolean(
        document.querySelector("#turnInfo.your-turn") ||
          document.querySelector("#betControls:not(.hidden)") ||
          Array.from(document.querySelectorAll("#gameButtons button")).some((b) =>
            /fold|check|call|raise|bet|all.?in/i.test(b.textContent || ""),
          ),
      );
    });
    if (hasAction) break;
    await page.waitForTimeout(250);
  }
  await shot(page, viewport.name, "in-hand-action");

  // 7) End-of-hand / ready-up: fold or check through until waiting, or force ready UI.
  // Try to finish the hand quickly by folding/checking when possible.
  for (let i = 0; i < 60; i += 1) {
    const phase = await page.evaluate(() => {
      const ready = Array.from(document.querySelectorAll("#gameButtons button")).some((b) =>
        /Ready up/i.test(b.textContent || ""),
      );
      const turn = document.querySelector("#turnInfo");
      const text = turn?.textContent || "";
      return { ready, text, yourTurn: turn?.classList.contains("your-turn") };
    });
    if (phase.ready || /players ready|waiting for/i.test(phase.text)) {
      break;
    }
    const fold = page.locator("#gameButtons button", { hasText: /^Fold$/i });
    const check = page.locator("#gameButtons button", { hasText: /^Check$/i });
    const call = page.locator("#gameButtons button", { hasText: /^Call/i });
    if (await fold.isVisible().catch(() => false)) {
      await fold.click();
    } else if (await check.isVisible().catch(() => false)) {
      await check.click();
    } else if (await call.isVisible().catch(() => false)) {
      await call.click();
    }
    await page.waitForTimeout(300);
  }
  // Ensure ready button visible for screenshot
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#gameButtons button")).some((b) =>
          /Ready up/i.test(b.textContent || ""),
        ),
      { timeout: 20000 },
    )
    .catch(() => {});
  await shot(page, viewport.name, "ready-up");

  // 8) Bust / rebuy screen (forced UI for reliable capture)
  await forceBustUi(page);
  await shot(page, viewport.name, "bust-rebuy");

  // 9) Spectator view (separate room)
  await captureSpectator(page, context, viewport);

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of VIEWPORTS) {
    console.log("capturing", viewport.name, "→", outDir);
    await runViewport(browser, viewport);
  }
} finally {
  await browser.close();
}
console.log("done", phase, outDir);
