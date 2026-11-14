#!/usr/bin/env node
/**
 * Capture before/after for:
 * - Welcome/join (375, 600, iPhone SE, short desktop) light+dark
 * - Facing all-in Call UI, Hand Review timeline, inline showdown cards
 *
 * Usage: node scripts/ui-screenshots-bugs-welcome.mjs <before|after> [baseUrl]
 */
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const phase = process.argv[2] || "after";
const baseUrl = process.argv[3] || "http://127.0.0.1:3030";
const outDir = `/opt/cursor/artifacts/${phase === "before" ? "welcome-before" : "welcome-after"}`;
const bugsDir = `/opt/cursor/artifacts/${phase === "before" ? "bugs-before" : "bugs-after"}`;
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(bugsDir, { recursive: true });

const WELCOME_VIEWPORTS = [
  { name: "iphone-se", ...devices["iPhone SE"] },
  { name: "375", width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: "600", width: 600, height: 800 },
  { name: "short-desktop", width: 1280, height: 560 },
  { name: "1280", width: 1280, height: 800 },
];

async function shot(page, dir, slug) {
  const file = path.join(dir, `${slug}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("holdem:theme", t);
    } catch {}
  }, theme);
}

async function captureWelcome(browser) {
  for (const vp of WELCOME_VIEWPORTS) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: vp.viewport || { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor || 1,
        isMobile: Boolean(vp.isMobile),
        hasTouch: Boolean(vp.hasTouch),
        userAgent: vp.userAgent,
      });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await setTheme(page, theme);
      await page.waitForSelector("#welcome:not(.hidden)");
      await page.waitForTimeout(200);
      await shot(page, outDir, `welcome-${vp.name}-${theme}`);
      await context.close();
    }
  }
}

async function hostPractice(page, name = "Daniel") {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await setTheme(page, "light");
  await page.fill("#nameInput", name);
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)", { timeout: 15000 });
}

async function openMenu(page) {
  await page.click("#menuBtn");
  await page.waitForSelector("#gameMenuModal:not(.hidden)");
}

async function closeMenu(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

async function addBots(page, n = 2) {
  for (let i = 0; i < n; i += 1) {
    await openMenu(page);
    await page.click("#addBotBtn");
    await page.waitForTimeout(150);
    await closeMenu(page);
  }
}

async function injectFacingAllInSpot(page) {
  // Force a facing-short-all-in UI state via practice room mutation when available.
  return page.evaluate(() => {
    const room = window.state;
    if (!room) return { ok: false, reason: "no state" };
    const hero = (room.players || []).find((p) => p.isYou);
    if (!hero) return { ok: false, reason: "no hero" };
    // Synthesize: villains all-in, hero faces toCall 20 with chips behind, raise closed.
    room.phase = "flop";
    room.pot = 100;
    room.toCall = 20;
    room.toCallCents = false;
    room.currentBet = 20;
    room.minRaise = 20;
    room.minRaiseTo = 40;
    room.canRaise = false;
    room.canShove = false;
    room.isYourTurn = true;
    room.turn = hero.id;
    hero.stack = 930;
    hero.bet = 0;
    hero.folded = false;
    hero.allIn = false;
    hero.cards = hero.cards?.length
      ? hero.cards
      : [
          { code: "As", rank: "A", suit: "s" },
          { code: "Qd", rank: "Q", suit: "d" },
        ];
    for (const p of room.players || []) {
      if (p.isYou) continue;
      p.folded = false;
      p.allIn = true;
      p.stack = 0;
      p.bet = 20;
    }
    if (typeof window.render === "function") window.render();
    return {
      ok: true,
      canRaise: room.canRaise,
      toCall: room.toCall,
      buttons: Array.from(document.querySelectorAll("#gameButtons button")).map((b) =>
        b.textContent.trim(),
      ),
    };
  });
}

async function injectShowdownInline(page) {
  return page.evaluate(() => {
    const room = window.state;
    if (!room) return { ok: false };
    room.phase = "complete";
    room.isYourTurn = false;
    room.winners = room.winners?.length
      ? room.winners
      : [{ playerId: room.players[0]?.id, name: room.players[0]?.name, amount: 200 }];
    for (const p of room.players || []) {
      if (p.folded) continue;
      p.showCards = true;
      p.cards = p.cards?.length
        ? p.cards
        : [
            { code: "Ah", rank: "A", suit: "h" },
            { code: "Ad", rank: "A", suit: "d" },
          ];
    }
    if (typeof window.render === "function") window.render();
    const feedCards = document.querySelectorAll(".shown-hand-card").length;
    const inline = document.querySelectorAll(".seat-shown-hand.is-visible").length;
    return { ok: true, feedCards, inline };
  });
}

async function injectLongReview(page) {
  return page.evaluate(() => {
    if (typeof HandReview === "undefined" || !HandReview.buildHandReplay) {
      return { ok: false, reason: "no HandReview" };
    }
    const seats = (n) =>
      Array.from({ length: n }, (_, i) => ({
        id: i === 0 ? "hero" : `bot${i}`,
        name: i === 0 ? "Daniel" : `Bot${i}`,
        isHero: i === 0,
        isBot: i !== 0,
        stack: i === 0 ? 900 : 0,
        bet: 0,
        folded: false,
        allIn: i !== 0,
        dealer: i === 0,
        isSmallBlind: false,
        isBigBlind: false,
        isTurn: false,
        holeCodes: i === 0 ? ["As", "Qd"] : ["Ah", "Ad"],
        lastAction: null,
      }));
    const table = (street, pot, labelSeats = seats(3)) => ({
      street,
      pot,
      toCall: 0,
      currentBet: 0,
      minRaiseTo: 20,
      boardCodes:
        street === "preflop"
          ? []
          : street === "flop"
            ? ["Kh", "7d", "2c"]
            : street === "turn"
              ? ["Kh", "7d", "2c", "9s"]
              : ["Kh", "7d", "2c", "9s", "3h"],
      seats: labelSeats,
      actingSeatId: "hero",
      winners: [],
    });
    const steps = [];
    let id = 0;
    const push = (kind, label, street, pot, heroDecision = null) => {
      id += 1;
      steps.push({
        id: `s${id}`,
        label,
        actorId: kind === "hero_decision" ? "hero" : kind === "street" ? null : "bot1",
        kind,
        table: table(street, pot),
        heroDecision,
      });
    };
    // 31 steps with ~5 hero decisions mixed in
    push("action", "Bot1 posts SB", "preflop", 10);
    push("action", "Bot2 posts BB", "preflop", 30);
    for (let i = 0; i < 8; i += 1) push("action", `Bot fills ${i}`, "preflop", 30 + i);
    push("hero_decision", "You call", "preflop", 40, {
      id: "h1",
      street: "preflop",
      boardCodes: [],
      heroCodes: ["As", "Qd"],
      pot: 40,
      toCall: 20,
      currentBet: 20,
      heroStack: 980,
      opponentStacks: [0, 0],
      taken: "call",
      equity: 0.55,
      canRaise: false,
      minRaiseTo: 40,
      maxRaiseTo: 1000,
    });
    push("street", "Flop", "flop", 60);
    for (let i = 0; i < 6; i += 1) push("action", `Flop action ${i}`, "flop", 60);
    push("hero_decision", "You check", "flop", 60, {
      id: "h2",
      street: "flop",
      boardCodes: ["Kh", "7d", "2c"],
      heroCodes: ["As", "Qd"],
      pot: 60,
      toCall: 0,
      currentBet: 0,
      heroStack: 960,
      opponentStacks: [0, 0],
      taken: "check",
      equity: 0.45,
      canRaise: false,
      minRaiseTo: 20,
      maxRaiseTo: 960,
    });
    push("street", "Turn", "turn", 60);
    for (let i = 0; i < 5; i += 1) push("action", `Turn action ${i}`, "turn", 60);
    push("hero_decision", "You check", "turn", 60, {
      id: "h3",
      street: "turn",
      boardCodes: ["Kh", "7d", "2c", "9s"],
      heroCodes: ["As", "Qd"],
      pot: 60,
      toCall: 0,
      currentBet: 0,
      heroStack: 960,
      opponentStacks: [0, 0],
      taken: "check",
      equity: 0.4,
      canRaise: false,
      minRaiseTo: 20,
      maxRaiseTo: 960,
    });
    push("street", "River", "river", 60);
    for (let i = 0; i < 4; i += 1) push("action", `River action ${i}`, "river", 60);
    push("hero_decision", "You check", "river", 60, {
      id: "h4",
      street: "river",
      boardCodes: ["Kh", "7d", "2c", "9s", "3h"],
      heroCodes: ["As", "Qd"],
      pot: 60,
      toCall: 0,
      currentBet: 0,
      heroStack: 960,
      opponentStacks: [0, 0],
      taken: "check",
      equity: 0.35,
      canRaise: false,
      minRaiseTo: 20,
      maxRaiseTo: 960,
    });
    while (steps.length < 31) {
      push("action", `Pad ${steps.length}`, "river", 60);
    }
    const replay = HandReview.buildHandReplay({ handNumber: 7, steps: steps.slice(0, 31) });
    window.lastHandReplay = replay;
    window.handReviewSavedState = window.state;
    window.handReviewActive = true;
    document.body.classList.add("hand-review-open");
    if (typeof window.openHandReview === "function") {
      window.openHandReview();
    } else if (typeof window.paintHandReviewStep === "function") {
      const chrome = document.querySelector("#handReviewChrome");
      chrome?.classList.remove("hidden");
      window.paintHandReviewStep(replay.steps.length - 1);
    }
    return {
      ok: true,
      steps: replay.steps.length,
      summary: replay.summary,
      dots: document.querySelectorAll(".hand-review-dot").length,
      label: document.querySelector("#handReviewStepLabel")?.textContent || "",
    };
  });
}

async function captureBugs(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await hostPractice(page);
  await addBots(page, 2);
  // Ready once so players exist with structure
  const ready = page.locator("#gameButtons button", { hasText: /Ready/i });
  if (await ready.isVisible().catch(() => false)) {
    await ready.click();
    await page.waitForTimeout(800);
  }

  const facing = await injectFacingAllInSpot(page);
  console.log("facing", facing);
  await page.waitForTimeout(200);
  await shot(page, bugsDir, "facing-allin-1280");

  const showdown = await injectShowdownInline(page);
  console.log("showdown", showdown);
  await page.waitForTimeout(200);
  await shot(page, bugsDir, "showdown-inline-1280");

  const review = await injectLongReview(page);
  console.log("review", review);
  await page.waitForTimeout(300);
  await shot(page, bugsDir, "review-timeline-1280");

  // Mobile
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mobile.newPage();
  await hostPractice(mpage);
  await addBots(mpage, 2);
  await injectShowdownInline(mpage);
  await mpage.waitForTimeout(200);
  await shot(mpage, bugsDir, "showdown-inline-375");
  await injectLongReview(mpage);
  await mpage.waitForTimeout(200);
  await shot(mpage, bugsDir, "review-timeline-375");
  await injectFacingAllInSpot(mpage);
  await mpage.waitForTimeout(200);
  await shot(mpage, bugsDir, "facing-allin-375");
  await mobile.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await captureWelcome(browser);
  await captureBugs(browser);
} finally {
  await browser.close();
}
console.log("done", phase);
