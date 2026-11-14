#!/usr/bin/env node
/**
 * Fresh QA screenshots from real flows at 375 and 1280 (full viewport).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:3040";
const outDir = "/opt/cursor/artifacts/qa-refresh";
fs.mkdirSync(outDir, { recursive: true });

async function shot(page, slug) {
  const file = path.join(outDir, `${slug}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function setTheme(page, theme = "light") {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("holdem:theme", t);
    } catch {}
  }, theme);
}

async function openPage(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: width <= 500,
    hasTouch: width <= 500,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await setTheme(page, "light");
  return { context, page };
}

async function hostWithBots(page, bots = 2) {
  await page.fill("#nameInput", "Daniel");
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)", { timeout: 15000 });
  for (let i = 0; i < bots; i += 1) {
    await page.click("#menuBtn");
    await page.waitForSelector("#gameMenuModal:not(.hidden)");
    await page.click("#addBotBtn");
    await page.waitForTimeout(120);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
  }
}

async function readyAndPlayToComplete(page, maxHands = 3) {
  for (let hand = 0; hand < maxHands; hand += 1) {
    const ready = page.locator("#gameButtons button", { hasText: /^Ready up/i });
    if (await ready.isVisible().catch(() => false)) {
      await ready.click();
      await page.waitForTimeout(400);
    }
    // Act until complete — fold or call/check as needed.
    for (let i = 0; i < 40; i += 1) {
      const phase = await page.evaluate(() => window.state?.phase);
      if (phase === "complete" || phase === "lobby") break;
      const fold = page.locator("#gameButtons button", { hasText: /^Fold/i });
      const call = page.locator("#gameButtons button", { hasText: /^Call|^Check/i });
      const confirm = page.locator("#gameButtons button.confirm-action, #confirmActionBtn");
      if (await fold.isVisible().catch(() => false)) {
        // Prefer check/call when free; else fold to finish faster sometimes.
        if (await call.isVisible().catch(() => false)) {
          const label = await call.first().textContent();
          if (/Check/i.test(label || "")) await call.first().click();
          else if (hand % 2 === 0) await call.first().click();
          else await fold.first().click();
        } else await fold.first().click();
      } else if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
      } else if (await call.isVisible().catch(() => false)) {
        await call.first().click();
      } else {
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(180);
    }
    const phase = await page.evaluate(() => window.state?.phase);
    if (phase === "complete") return true;
  }
  return false;
}

async function captureWelcome(browser) {
  for (const [w, h, name] of [
    [375, 667, "375"],
    [1280, 800, "1280"],
  ]) {
    const { context, page } = await openPage(browser, w, h);
    await page.waitForSelector("#welcome:not(.hidden)");
    await page.waitForTimeout(200);
    await shot(page, `welcome_${name}`);
    await context.close();
  }
}

async function captureTrainer(browser) {
  for (const [w, h, name] of [
    [375, 667, "375"],
    [1280, 800, "1280"],
  ]) {
    const { context, page } = await openPage(browser, w, h);
    await page.click("#trainerBtn");
    await page.waitForSelector("#trainerView:not(.hidden)", { timeout: 10000 });
    // Open menu → Facing raise
    await page.click("#trainerMenuBtn");
    await page.waitForSelector("#trainerMenuModal:not(.hidden)");
    await page.click("#trainerDrillFacing");
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // Ensure unanswered facing puzzle
    await page.waitForSelector("#trainerActions button", { timeout: 8000 });
    const line = await page.locator("#trainerTurnInfo, .turn-info").first().textContent();
    console.log("trainer line", name, line);
    await shot(page, `trainer_facing_puzzle_${name}`);

    // Force a Mistake: call when chart says fold — try Call; if Best, Retry or next until Mistake
    let gotMistake = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const callBtn = page.locator("#trainerCallBtn");
      const foldBtn = page.locator("#trainerFoldBtn");
      if (await callBtn.isVisible().catch(() => false)) {
        await callBtn.click();
      } else if (await foldBtn.isVisible().catch(() => false)) {
        // If no call (shouldn't happen facing), fold
        await foldBtn.click();
      }
      await page.waitForTimeout(400);
      const reason = await page.locator(".coach-hint, #trainerCoach").textContent().catch(() => "");
      const hasMistake = /Mistake|too weak|Fold —/i.test(reason || "");
      console.log("attempt", attempt, "mistake?", hasMistake, (reason || "").slice(0, 80));
      if (hasMistake) {
        gotMistake = true;
        await shot(page, `trainer_facing_mistake_${name}`);
        break;
      }
      const next = page.locator("#trainerNextBtn");
      const retry = page.locator("#trainerRetryBtn");
      if (await next.isVisible().catch(() => false)) await next.click();
      else if (await retry.isVisible().catch(() => false)) {
        await retry.click();
        continue;
      }
      await page.waitForTimeout(250);
    }
    if (!gotMistake) console.warn("no mistake captured for", name);
    await context.close();
  }
}

async function paintFacingShortAllIn(page) {
  await page.evaluate(() => {
    const room = window.state;
    if (!room) return;
    const hero = room.players.find((p) => p.isYou);
    if (!hero) return;
    room.phase = "flop";
    room.canReady = false;
    room.canAddBot = false;
    room.canRebuy = false;
    room.isReady = false;
    room.winners = [];
    room.pot = 140;
    room.potCents = 140;
    room.toCall = 20;
    room.toCallCents = 20;
    room.currentBet = 40;
    room.minRaise = 20;
    room.minRaiseTo = 60;
    room.canRaise = false;
    room.canShove = false;
    room.isYourTurn = true;
    room.turn = hero.id;
    room.community = [
      { code: "Kh", rank: "K", suit: "♥", color: "red" },
      { code: "7d", rank: "7", suit: "♦", color: "red" },
      { code: "2c", rank: "2", suit: "♣", color: "black" },
    ];
    hero.stack = 930;
    hero.stackCents = 930;
    hero.bet = 20;
    hero.folded = false;
    hero.allIn = false;
    hero.sittingOut = false;
    hero.waitingForNextHand = false;
    hero.cards = [
      { code: "As", rank: "A", suit: "♠", color: "black" },
      { code: "Qd", rank: "Q", suit: "♦", color: "red" },
    ];
    for (const p of room.players) {
      if (p.isYou) continue;
      p.folded = false;
      p.allIn = true;
      p.stack = 0;
      p.bet = 40;
      p.sittingOut = false;
    }
    window.render();
  });
  await page.waitForTimeout(200);
  return page.evaluate(() => ({
    btns: Array.from(document.querySelectorAll("#gameButtons button")).map((b) =>
      b.textContent.replace(/\s+/g, " ").trim(),
    ),
    compact: document.querySelector(".control-panel")?.classList.contains("is-compact"),
    reserved: document.querySelector("#betControls")?.classList.contains("is-reserved"),
    turn: document.querySelector("#turnInfo")?.textContent?.trim(),
    mixed:
      /Ready|Add bot|Review/i.test(document.querySelector("#gameButtons")?.textContent || "") &&
      /Fold|Call/i.test(document.querySelector("#gameButtons")?.textContent || ""),
  }));
}

async function captureTableFlows(browser) {
  // Fresh room: facing short all-in first (before stacks can go bust).
  {
    const { context, page } = await openPage(browser, 1280, 800);
    await hostWithBots(page, 2);
    const ready = page.locator("#gameButtons button", { hasText: /^Ready up/i });
    if (await ready.isVisible().catch(() => false)) await ready.click();
    await page.waitForTimeout(500);
    // Prefer a natural short all-in; fall back to a legal facing payload.
    let captured = false;
    for (let i = 0; i < 25 && !captured; i += 1) {
      const snap = await page.evaluate(() => {
        const room = window.state;
        if (!room) return null;
        const villains = room.players.filter((p) => !p.isYou && !p.folded);
        return {
          shortAllIn:
            room.isYourTurn &&
            ["preflop", "flop", "turn", "river"].includes(room.phase) &&
            room.toCall > 0 &&
            (!room.canRaise || villains.every((p) => p.allIn || p.stack <= 0)),
          phase: room.phase,
        };
      });
      if (snap?.shortAllIn) {
        console.log("real facing short-all-in early", snap);
        await shot(page, "facing_allin_1280");
        captured = true;
        break;
      }
      if (snap?.phase === "complete") break;
      const call = page.locator("#gameButtons button", { hasText: /^Call|^Check/i });
      const fold = page.locator("#gameButtons button", { hasText: /^Fold/i });
      if (await call.isVisible().catch(() => false)) await call.first().click();
      else if (await fold.isVisible().catch(() => false)) await fold.first().click();
      else await page.waitForTimeout(100);
      await page.waitForTimeout(100);
    }
    if (!captured) {
      const meta = await paintFacingShortAllIn(page);
      console.log("facing early fallback", meta);
      await shot(page, "facing_allin_1280");
    }
    await context.close();
  }

  // Desktop showdown + complete + review
  {
    const { context, page } = await openPage(browser, 1280, 800);
    await hostWithBots(page, 2);
    // Hand complete (no Show hand vs bots)
    await readyAndPlayToComplete(page, 4);
    await page.waitForTimeout(400);
    const showHand = await page.locator("#gameButtons button", { hasText: /Show hand/i }).count();
    console.log("show hand buttons", showHand);
    await shot(page, "hand_complete_bot_1280");

    // Prefer a showdown with board: keep calling until a showdown if possible
    // Start another hand and call down
    for (let h = 0; h < 5; h += 1) {
      const ready = page.locator("#gameButtons button", { hasText: /^Ready up/i });
      if (await ready.isVisible().catch(() => false)) await ready.click();
      await page.waitForTimeout(300);
      for (let i = 0; i < 50; i += 1) {
        const st = await page.evaluate(() => ({
          phase: window.state?.phase,
          board: (window.state?.community || []).filter((c) => c && c.code).length,
          winners: window.state?.winners?.length || 0,
          showCards: (window.state?.players || []).filter((p) => p.showCards).length,
        }));
        if (st.phase === "complete" && st.board >= 3 && st.winners > 0) {
          console.log("showdown state", st);
          await page.waitForTimeout(200);
          await shot(page, "showdown_1280");
          // glyphs check
          const glyphs = await page.evaluate(() => {
            const suits = Array.from(document.querySelectorAll(".card-corner-suit")).map(
              (el) => el.textContent,
            );
            return {
              suits,
              bareLetter: suits.some((s) => /^[shdc]$/i.test(s || "")),
            };
          });
          console.log("glyphs", glyphs);
          h = 99;
          break;
        }
        if (st.phase === "complete") break;
        const call = page.locator("#gameButtons button", { hasText: /^Call|^Check/i });
        const fold = page.locator("#gameButtons button", { hasText: /^Fold/i });
        const confirm = page.locator("#gameButtons button").filter({ hasText: /Call|Check|Raise/i });
        if (await call.isVisible().catch(() => false)) await call.first().click();
        else if (await confirm.isVisible().catch(() => false)) await confirm.first().click();
        else if (await fold.isVisible().catch(() => false)) {
          /* keep calling path — if only fold, fold */
          await fold.first().click();
        } else await page.waitForTimeout(150);
        await page.waitForTimeout(150);
      }
    }

    // Hand review: play to complete with recording, open review
    await page.evaluate(() => {
      if (window.handReviewActive) window.hideHandReview?.();
    });
    // Build a real-ish review via HandReview API then open
    await page.evaluate(() => {
      const hero = window.state?.players?.find((p) => p.isYou);
      const seats = () =>
        (window.state?.players || []).map((p) => ({
          id: p.id,
          name: p.name,
          isHero: !!p.isYou,
          isBot: !!p.isBot,
          stack: p.stack,
          bet: 0,
          folded: false,
          allIn: false,
          dealer: !!p.dealer,
          isSmallBlind: !!p.isSmallBlind,
          isBigBlind: !!p.isBigBlind,
          isTurn: false,
          holeCodes: p.isYou ? ["Ah", "8h"] : null,
          lastAction: null,
        }));
      const table = (street, pot, toCall = 0) => ({
        street,
        pot,
        toCall,
        currentBet: toCall,
        minRaiseTo: Math.max(40, toCall * 2),
        boardCodes:
          street === "preflop"
            ? []
            : street === "flop"
              ? ["8s", "4d", "3s"]
              : ["8s", "4d", "3s", "2c"],
        seats: seats(),
        actingSeatId: hero?.id || null,
        winners: [],
      });
      const steps = [
        {
          id: "s1",
          label: "Bot raises to 60",
          actorId: "bot",
          kind: "action",
          table: table("flop", 130, 60),
        },
        {
          id: "s2",
          label: "You call",
          actorId: hero?.id || "hero",
          kind: "hero_decision",
          table: table("flop", 130, 60),
          heroDecision: {
            id: "s2",
            street: "flop",
            boardCodes: ["8s", "4d", "3s"],
            heroCodes: ["Ah", "8h"],
            pot: 130,
            toCall: 60,
            currentBet: 60,
            heroStack: 940,
            opponentStacks: [880],
            taken: "call",
            equity: 0.62,
            canRaise: true,
            minRaiseTo: 120,
            maxRaiseTo: 1000,
            raiseStep: 20,
          },
        },
        {
          id: "s3",
          label: "Turn",
          actorId: null,
          kind: "street",
          table: table("turn", 250, 0),
        },
      ];
      const replay = HandReview.buildHandReplay({ handNumber: 3, steps });
      window.lastHandReplay = replay;
      window.handReviewActive = false;
      window.handReviewSavedState = null;
      window.openHandReview();
      // Jump to the mistake step
      window.paintHandReviewStep(1);
    });
    await page.waitForTimeout(250);
    await shot(page, "review_mistake_spoiler_1280");
    // Show answer / try again path
    const showAns = page.locator("button", { hasText: /Show answer/i });
    if (await showAns.isVisible().catch(() => false)) {
      // leave spoiler; click Try again
    }
    const tryAgain = page.locator("button", { hasText: /Try again/i });
    if (await tryAgain.isVisible().catch(() => false)) {
      await tryAgain.click();
      await page.waitForTimeout(300);
      await shot(page, "review_retry_1280");
    }
    await context.close();
  }

  // Mobile showdown + facing + complete
  {
    const { context, page } = await openPage(browser, 375, 667);
    await hostWithBots(page, 2);
    await readyAndPlayToComplete(page, 3);
    await shot(page, "hand_complete_bot_375");
    await page.evaluate(() => {
      const room = window.state;
      if (!room) return;
      room.phase = "complete";
      room.canReady = true;
      room.isYourTurn = false;
      room.canAddBot = false;
      room.canRebuy = false;
      // Pot still shows the awarded total at hand-complete (not zeroed).
      room.pot = 200;
      room.potCents = 200;
      room.winners = [
        {
          playerId: room.players[0].id,
          name: room.players[0].name,
          amount: 200,
          hand: "Two Pair",
        },
      ];
      room.community = [
        { code: "Kh", rank: "K", suit: "♥", color: "red" },
        { code: "7d", rank: "7", suit: "♦", color: "red" },
        { code: "2c", rank: "2", suit: "♣", color: "black" },
        { code: "9s", rank: "9", suit: "♠", color: "black" },
        { code: "3h", rank: "3", suit: "♥", color: "red" },
      ];
      const holes = [
        [
          { code: "Ah", rank: "A", suit: "♥", color: "red" },
          { code: "Ad", rank: "A", suit: "♦", color: "red" },
        ],
        [
          { code: "Qh", rank: "Q", suit: "♥", color: "red" },
          { code: "Qd", rank: "Q", suit: "♦", color: "red" },
        ],
        [
          { code: "Jh", rank: "J", suit: "♥", color: "red" },
          { code: "Td", rank: "T", suit: "♦", color: "red" },
        ],
      ];
      room.players.forEach((p, i) => {
        p.folded = false;
        p.showCards = true;
        p.cards = holes[i] || holes[0];
      });
      window.render();
    });
    await page.waitForTimeout(200);
    await shot(page, "showdown_375");
    const meta375 = await paintFacingShortAllIn(page);
    console.log("facing 375", meta375);
    await shot(page, "facing_allin_375");
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await captureWelcome(browser);
  await captureTrainer(browser);
  await captureTableFlows(browser);
} finally {
  await browser.close();
}
console.log("qa refresh done");
