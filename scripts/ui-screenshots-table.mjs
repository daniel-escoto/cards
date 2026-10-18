#!/usr/bin/env node
/**
 * Capture de-slopped table screens into /opt/cursor/artifacts/final/
 * Desktop + mobile: in-hand-action, ready-up, bust-rebuy; mobile spectator.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://localhost:3000";
const outDir = process.argv[3] || "/opt/cursor/artifacts/final";
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

async function openMenu(page) {
  await page.click("#menuBtn");
  await page.waitForSelector("#gameMenuModal:not(.hidden)");
}

async function closeMenu(page) {
  const close = page.locator("#closeMenuBtn, #closeSettingsMenuBtn, #closeHostMenuBtn").first();
  if (await close.isVisible().catch(() => false)) await close.click();
  else await page.keyboard.press("Escape");
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

async function forceBustUi(page) {
  await page.evaluate(() => {
    const base = window.state && typeof window.state === "object" ? window.state : {};
    const players = (base.players || []).map((player, index) => {
      if (player.isYou) {
        return { ...player, stack: 0, stackCents: 0, ready: false, cards: [], folded: false };
      }
      if (player.isBot) {
        return {
          ...player,
          stack: index === 1 ? 2400 : 1600,
          stackCents: 0,
          ready: true,
          cards: [],
        };
      }
      return player;
    });
    const room = {
      ...base,
      pot: 0,
      potCents: 0,
      phase: "complete",
      community: [],
      winners: [],
      actionLog: [],
      canRestartGame: true,
      canRebuy: true,
      bustedOut: true,
      isYourTurn: false,
      canReady: false,
      canAddBot: false,
      players,
    };
    window.state = room;
    if (typeof render === "function") render();
    else if (typeof renderBustPanel === "function") {
      document.querySelector("#gameButtons")?.replaceChildren();
      renderBustPanel(room);
    }
  });
  await page.waitForTimeout(200);
}

async function captureSpectator(page, context, viewport) {
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
    console.warn("skip spectator — no room code");
    return;
  }

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#welcome");
  await page.evaluate(() => document.querySelector("#joinModeBtn")?.click());
  await page.waitForFunction(
    () => !document.querySelector("#roomCodeLabel")?.classList.contains("hidden"),
    { timeout: 5000 },
  );
  await page.fill("#nameInput", "Watcher");
  await page.fill("#roomInput", code);
  await page.waitForTimeout(400);
  const watchVisible = await page.locator("#watchBtn:not(.hidden)").isVisible().catch(() => false);
  if (watchVisible) await page.click("#watchBtn");
  else await page.click("#tableActionBtn");
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

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  // 12-char name exercises seat-list truncation.
  await page.fill("#nameInput", "Alexandrine1");
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)", { timeout: 15000 });
  await addBots(page, 2);

  const ready = page.locator("#gameButtons button", { hasText: /Ready up/i });
  await ready.waitFor({ state: "visible", timeout: 15000 });
  await ready.click();

  // Wait until a live betting street is visible (hole cards + action / acting status).
  await page
    .waitForFunction(
      () => {
        const heroCards = document.querySelectorAll("#heroHand .card").length;
        const yourTurn = document.querySelector("#turnInfo.your-turn");
        const bet = document.querySelector("#betControls:not(.hidden)");
        const actBtn = Array.from(document.querySelectorAll("#gameButtons button")).some((b) =>
          /^(Fold|Check|Call|Raise|Bet|All in)/i.test((b.textContent || "").trim()),
        );
        const acting = /to act|Acting/i.test(document.querySelector("#turnInfo")?.textContent || "");
        return heroCards >= 1 && (yourTurn || bet || actBtn || acting);
      },
      { timeout: 25000 },
    )
    .catch(() => {});
  // Prefer a frame where the action bar is open; otherwise force a stable in-hand fixture.
  let open = false;
  for (let i = 0; i < 50; i += 1) {
    open = await page.evaluate(() =>
      Boolean(
        document.querySelector("#betControls:not(.hidden)") ||
          Array.from(document.querySelectorAll("#gameButtons button")).some((b) =>
            /^(Fold|Check|Call)/i.test((b.textContent || "").trim()),
          ),
      ),
    );
    if (open) break;
    await page.waitForTimeout(200);
  }
  if (!open) {
    await page.evaluate(() => {
      const base = window.state && typeof window.state === "object" ? window.state : {};
      const players = (base.players || []).map((player, index) => {
        if (player.isYou) {
          return {
            ...player,
            cards: [
              { rank: "A", suit: "♠", code: "As" },
              { rank: "K", suit: "♠", code: "Ks" },
            ],
            folded: false,
            allIn: false,
            bet: 20,
            stack: 980,
            ready: false,
            dealer: true,
            isSmallBlind: false,
            isBigBlind: false,
            isTurn: true,
          };
        }
        const bots = (base.players || []).filter((p) => !p.isYou);
        const botIndex = bots.findIndex((p) => p.id === player.id);
        return {
          ...player,
          cards: [],
          folded: false,
          allIn: false,
          bet: botIndex === 0 ? 10 : botIndex === 1 ? 60 : 0,
          stack: 940 - Math.max(0, botIndex),
          ready: false,
          dealer: false,
          isSmallBlind: botIndex === 0,
          isBigBlind: botIndex === 1,
          isTurn: false,
        };
      });
      const hero = players.find((p) => p.isYou);
      window.state = {
        ...base,
        phase: "preflop",
        pot: 90,
        community: [],
        winners: [],
        actionLog: [],
        turn: hero?.id || null,
        isYourTurn: true,
        toCall: 40,
        currentBet: 60,
        minRaiseTo: 100,
        bigBlind: 20,
        canReady: false,
        canAddBot: false,
        canRebuy: false,
        players,
      };
      if (typeof lastCommunitySignature !== "undefined") lastCommunitySignature = null;
      if (typeof lastHeroSignature !== "undefined") lastHeroSignature = "";
      if (typeof render === "function") render();
    });
    await page.waitForTimeout(200);
  }
  await shot(page, viewport.name, "in-hand-action");

  // Finish the hand (prefer fold) then wait for ready-up chrome.
  for (let i = 0; i < 100; i += 1) {
    const phase = await page.evaluate(() => {
      const readyBtn = Array.from(document.querySelectorAll("#gameButtons button")).some((b) =>
        /Ready up/i.test(b.textContent || ""),
      );
      const text = document.querySelector("#turnInfo")?.textContent || "";
      return { readyBtn, text };
    });
    if (phase.readyBtn || /\d+ of \d+ ready|Need two/i.test(phase.text)) break;
    const fold = page.locator("#gameButtons button", { hasText: /^Fold$/i });
    const check = page.locator("#gameButtons button", { hasText: /^Check$/i });
    const call = page.locator("#gameButtons button", { hasText: /^Call/i });
    if (await fold.isVisible().catch(() => false)) await fold.click();
    else if (await check.isVisible().catch(() => false)) await check.click();
    else if (await call.isVisible().catch(() => false)) await call.click();
    await page.waitForTimeout(200);
  }
  const readyVisible = await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#gameButtons button")).some((b) =>
          /Ready up/i.test(b.textContent || ""),
        ),
      { timeout: 20000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!readyVisible) {
    // Force ready-up chrome for a reliable artifact if bots keep the hand alive.
    await page.evaluate(() => {
      const base = window.state && typeof window.state === "object" ? window.state : {};
      const players = (base.players || []).map((player) => ({
        ...player,
        ready: Boolean(player.isBot),
        cards: [],
        folded: false,
        allIn: false,
        bet: 0,
      }));
      window.state = {
        ...base,
        phase: "complete",
        pot: 0,
        potCents: 0,
        community: [],
        winners: [],
        actionLog: [],
        turn: null,
        isYourTurn: false,
        canReady: true,
        isReady: false,
        canAddBot: true,
        canRebuy: false,
        players,
      };
      if (typeof render === "function") render();
    });
    await page.waitForTimeout(200);
  }
  await shot(page, viewport.name, "ready-up");

  await forceBustUi(page);
  await shot(page, viewport.name, "bust-rebuy");

  if (viewport.name === "mobile") await captureSpectator(page, context, viewport);
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
console.log("done", outDir);
