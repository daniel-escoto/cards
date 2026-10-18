#!/usr/bin/env node
/**
 * Capture oval table layout screens into /opt/cursor/artifacts/layout-v2/
 * Desktop 1280x800 + mobile 390x844 for:
 * in-hand-action (3p / 9p), flop-turn, showdown, ready-up, bust-rebuy, spectator
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://localhost:3000";
const outDir = "/opt/cursor/artifacts/layout";
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

async function addBots(page, count) {
  for (let i = 0; i < count; i += 1) {
    await openMenu(page);
    await page.click("#addBotBtn");
    await page.waitForTimeout(180);
    await closeMenu(page);
    await page.waitForTimeout(120);
  }
}

async function hostAndSeat(page, name, botCount) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.fill("#nameInput", name);
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)", { timeout: 15000 });
  if (botCount > 0) await addBots(page, botCount);
}

async function readyUp(page) {
  const ready = page.locator("#gameButtons button", { hasText: /Ready up/i });
  await ready.waitFor({ state: "visible", timeout: 15000 });
  await ready.click();
}

async function waitForInHand(page) {
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
  for (let i = 0; i < 40; i += 1) {
    const open = await page.evaluate(() =>
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
}

async function forceRoom(page, kind) {
  await page.evaluate((mode) => {
    const base = window.state && typeof window.state === "object" ? window.state : {};
    let next = base;
    if (mode === "action") {
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
            showCards: false,
            dealer: true,
            isSmallBlind: false,
            isBigBlind: true,
            isTurn: true,
          };
        }
        return {
          ...player,
          cards: [],
          folded: false,
          allIn: false,
          bet: index === 1 ? 60 : 20,
          stack: 940 - index,
          ready: false,
          showCards: false,
          isSmallBlind: index === 1,
          isBigBlind: false,
          dealer: false,
          isTurn: false,
        };
      });
      const hero = players.find((p) => p.isYou);
      const aggressor = players.find((p) => p.isBot) || players[1];
      next = {
        ...base,
        phase: "preflop",
        pot: 100,
        potCents: 0,
        community: [],
        rabbitCards: [],
        winners: [],
        actionLog: [
          {
            id: "pre1",
            phase: "preflop",
            playerId: aggressor?.id,
            action: `${aggressor?.name || "Bot"} Raises to 60`,
            text: `${aggressor?.name || "Bot"} Raises to 60`,
          },
        ],
        turn: hero?.id || null,
        isYourTurn: true,
        toCall: 40,
        currentBet: 60,
        minRaiseTo: 100,
        bigBlind: 20,
        canReady: false,
        canAddBot: false,
        canRebuy: false,
        canRabbitHunt: false,
        players,
      };
    } else if (mode === "flop" || mode === "turn") {
      const community =
        mode === "flop"
          ? [
              { rank: "A", suit: "♠", code: "As" },
              { rank: "K", suit: "♥", code: "Kh" },
              { rank: "9", suit: "♦", code: "9d" },
            ]
          : [
              { rank: "A", suit: "♠", code: "As" },
              { rank: "K", suit: "♥", code: "Kh" },
              { rank: "9", suit: "♦", code: "9d" },
              { rank: "2", suit: "♣", code: "2c" },
            ];
      const players = (base.players || []).map((player, index) => {
        if (player.isYou) {
          return {
            ...player,
            cards: [
              { rank: "Q", suit: "♠", code: "Qs" },
              { rank: "J", suit: "♠", code: "Js" },
            ],
            folded: false,
            allIn: false,
            bet: 40,
            stack: 960,
            ready: false,
            showCards: false,
            dealer: true,
          };
        }
        return {
          ...player,
          cards: [],
          folded: index === 2,
          allIn: false,
          bet: index === 1 ? 40 : 0,
          stack: 900 + index * 20,
          ready: false,
          showCards: false,
          isSmallBlind: index === 1,
          isBigBlind: index === 2,
          dealer: false,
        };
      });
      const hero = players.find((p) => p.isYou);
      next = {
        ...base,
        phase: mode,
        pot: 180,
        potCents: 0,
        community,
        rabbitCards: [],
        winners: [],
        actionLog: [
          {
            id: "a1",
            phase: mode,
            playerId: players[1]?.id,
            action: `${players[1]?.name || "Bot"} Checks`,
            text: `${players[1]?.name || "Bot"} Checks`,
          },
          {
            id: "a2",
            phase: mode,
            playerId: hero?.id,
            action: `${hero?.name || "You"} Bets 40`,
            text: `${hero?.name || "You"} Bets 40`,
          },
        ],
        turn: players.find((p) => p.isBot && !p.folded)?.id || null,
        isYourTurn: false,
        toCall: 0,
        currentBet: 40,
        minRaiseTo: 80,
        canReady: false,
        canAddBot: false,
        canRebuy: false,
        canRabbitHunt: false,
        players,
      };
    } else if (mode === "showdown") {
      const players = (base.players || []).map((player, index) => {
        if (player.isYou) {
          return {
            ...player,
            cards: [
              { rank: "A", suit: "♥", code: "Ah" },
              { rank: "A", suit: "♦", code: "Ad" },
            ],
            showCards: true,
            folded: false,
            stack: 1240,
            bet: 0,
          };
        }
        if (player.isBot && index === 1) {
          return {
            ...player,
            cards: [
              { rank: "K", suit: "♠", code: "Ks" },
              { rank: "K", suit: "♣", code: "Kc" },
            ],
            showCards: true,
            folded: false,
            stack: 760,
            bet: 0,
          };
        }
        return {
          ...player,
          cards: [],
          showCards: false,
          folded: true,
          stack: Math.max(200, player.stack || 400),
          bet: 0,
        };
      });
      const hero = players.find((p) => p.isYou);
      next = {
        ...base,
        phase: "showdown",
        pot: 480,
        community: [
          { rank: "2", suit: "♥", code: "2h" },
          { rank: "7", suit: "♦", code: "7d" },
          { rank: "9", suit: "♣", code: "9c" },
          { rank: "J", suit: "♠", code: "Js" },
          { rank: "3", suit: "♥", code: "3h" },
        ],
        winners: [
          {
            playerId: hero?.id,
            name: hero?.name || "You",
            amount: 480,
            amountCents: 0,
            hand: "One Pair, Aces",
          },
        ],
        actionLog: [],
        turn: null,
        isYourTurn: false,
        canReady: false,
        canShowHand: false,
        canRebuy: false,
        players,
      };
    } else if (mode === "ready") {
      const players = (base.players || []).map((player) => ({
        ...player,
        ready: Boolean(player.isBot),
        cards: [],
        folded: false,
        allIn: false,
        bet: 0,
        showCards: false,
      }));
      next = {
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
    } else if (mode === "bust") {
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
      next = {
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
    }
    window.state = next;
    // Force board / hole-card rebuilds when we inject fixture state.
    if (typeof lastCommunitySignature !== "undefined") lastCommunitySignature = null;
    if (typeof lastHeroSignature !== "undefined") lastHeroSignature = "";
    if (typeof lastWinnerSignature !== "undefined") lastWinnerSignature = "";
    if (typeof render === "function") render();
  }, kind);
  await page.waitForTimeout(180);
}

async function captureSpectator(page, context, viewport) {
  const hostPage = await context.newPage();
  await hostPage.setViewportSize({ width: viewport.width, height: viewport.height });
  await hostAndSeat(hostPage, "Hosty", 2);
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

  // 3-player in-hand
  await hostAndSeat(page, "Alex", 2);
  await forceRoom(page, "action");
  await shot(page, viewport.name, "in-hand-action-3p");

  // Mid-hand flop/turn (force community for a reliable artifact)
  await forceRoom(page, "flop");
  await shot(page, viewport.name, "flop-turn");

  // Showdown
  await forceRoom(page, "showdown");
  await shot(page, viewport.name, "showdown");

  // Ready-up
  await forceRoom(page, "ready");
  await shot(page, viewport.name, "ready-up");

  // Bust / rebuy
  await forceRoom(page, "bust");
  await shot(page, viewport.name, "bust-rebuy");

  // 9-player in-hand
  await hostAndSeat(page, "Alex", 8);
  await forceRoom(page, "action");
  await shot(page, viewport.name, "in-hand-action-9p");

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
console.log("done", outDir);
