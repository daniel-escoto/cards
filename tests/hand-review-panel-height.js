#!/usr/bin/env node
/**
 * Hand Review control-panel height must match live in-hand / post-hand Ready up
 * across step view, retry-live, retry-answered, and result — at 375, 390, and 1280.
 *
 * Always asserts CSS/source contracts (CI). When Chrome + puppeteer-core / Playwright
 * Chromium are available, also asserts live bounding boxes.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const tableSrc = fs.readFileSync(path.join(root, "public/app-table.ts"), "utf8");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

assert.match(
  css,
  /body\.hand-review-open:not\(\.hand-review-retrying\) \.control-panel > \.hand-review-chrome\s*\{[^}]*grid-row:\s*3 \/ 6/s,
);
assert.match(
  css,
  /body\.hand-review-open:not\(\.hand-review-retrying\) \.control-panel > \.hand-review-chrome\s*\{[^}]*min-height:\s*0/s,
);
assert.match(
  css,
  /body\.hand-review-open:not\(\.hand-review-retrying\) \.control-panel > \.game-buttons,\s*\nbody\.hand-review-open:not\(\.hand-review-retrying\) \.control-panel > \.bet-controls\s*\{[^}]*visibility:\s*hidden/s,
);
assert.doesNotMatch(
  css,
  /body\.hand-review-open\s+\.control-panel > \.game-buttons,\s*\nbody\.hand-review-open\s+\.control-panel > \.bet-controls[\s\S]*?display:\s*none\s*!important/s,
);
assert.match(
  css,
  /body\.hand-review-open\.hand-review-retrying \.hand-review-bottom\s*\{[^}]*display:\s*none\s*!important/s,
);
assert.match(css, /\.hand-review-chrome\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
assert.match(html, /hand-review-bottom[\s\S]*handReviewRetryBar[\s\S]*hand-review-nav/);
assert.match(css, /\.hand-review-verdict\s*\{[^}]*min-height:\s*0/s);
assert.match(css, /\.hand-review-verdict-why\s*\{[^}]*overflow-wrap:\s*anywhere/s);
assert.match(css, /\.hand-row \.hand-review-close\.icon-btn/);
assert.match(html, /hand-row[\s\S]*id="handReviewCloseBtn"/);
assert.doesNotMatch(html, /hand-review-chrome-head[\s\S]{0,200}handReviewCloseBtn/);
assert.match(tableSrc, /!handReviewActive && reserved/);
assert.match(tableSrc, /preHandLobby/);
assert.match(tableSrc, /textActionLink\("Continue review"/);
assert.match(css, /hand-review-continue\.text-action-link:focus-visible/);
assert.match(
  css,
  /hand-review-continue\.text-action-link:focus\s*\{[^}]*outline:\s*none/s,
);
assert.match(
  css,
  /body\.hand-review-open \.hand-review-retry-bar\.is-idle\s*\{[^}]*display:\s*none/s,
);
assert.match(css, /\.control-panel:not\(\.is-compact\) \.hero-hand:empty/);
assert.doesNotMatch(css, /\.next-act-arrow/);

const chrome =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));

async function loadBrowser() {
  try {
    const { chromium } = require("playwright");
    return chromium.launch({
      executablePath: chrome || undefined,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu"],
    });
  } catch {
    /* fall through */
  }
  try {
    const puppeteer = require("puppeteer-core");
    if (!chrome) return null;
    return puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900"],
    });
  } catch {
    return null;
  }
}

async function main() {
  const browser = await loadBrowser();
  if (!browser) {
    console.log(
      "Hand review panel height source contracts passed (live bbox skipped — no Chrome).",
    );
    return;
  }

  const PORT = "3851";
  const base = `http://127.0.0.1:${PORT}`;
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: root,
    env: { ...process.env, PORT },
    stdio: "ignore",
  });
  const kill = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  };
  process.on("exit", kill);

  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(base + "/");
      if (res.ok) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 49) {
      kill();
      throw new Error("test server failed to start");
    }
  }

  const decision = {
    id: "d1",
    street: "preflop",
    boardCodes: [],
    heroCodes: ["8s", "Ad"],
    pot: 60,
    toCall: 20,
    currentBet: 20,
    taken: "fold",
    raiseTo: null,
    equity: 0.55,
    potOdds: 0.25,
    recommended: "call",
    recommendedRaiseTo: null,
    verdict: "mistake",
    badge: "Mistake",
    reason: "Folding is too tight versus a small open.",
  };

  try {
    for (const [width, height, label] of [
      [1280, 800, "1280"],
      [390, 844, "390"],
      [375, 812, "375"],
    ]) {
      const page = await browser.newPage();
      if (page.setViewportSize) await page.setViewportSize({ width, height });
      else await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(base, { waitUntil: "networkidle" });

      const boxes = await page.evaluate(
        ({ decision: dec }) => {
          const panelBox = () => {
            const el = document.querySelector(".control-panel");
            const r = el.getBoundingClientRect();
            return { top: r.top, height: r.height, bottom: r.bottom };
          };
          const you = {
            id: "you",
            name: "Alex",
            stack: 980,
            isYou: true,
            isBot: false,
            sittingOut: false,
            ready: false,
            folded: false,
            allIn: false,
            bet: 20,
            cards: [
              { rank: "A", suit: "♠", code: "As", color: "black" },
              { rank: "K", suit: "♠", code: "Ks", color: "black" },
            ],
            dealer: true,
            isSmallBlind: false,
            isBigBlind: true,
            isTurn: true,
            color: "#60a5fa",
          };
          const bot = {
            id: "bot",
            name: "CPU",
            isYou: false,
            isBot: true,
            stack: 1040,
            bet: 40,
            folded: false,
            allIn: false,
            cards: [],
            dealer: true,
            isSmallBlind: true,
            isBigBlind: false,
            isTurn: false,
            color: "#4caf82",
          };
          document.getElementById("welcome")?.classList.add("hidden");
          document.getElementById("tableView")?.classList.remove("hidden");
          state = {
            code: "TEST",
            pot: 60,
            bigBlind: 20,
            smallBlind: 10,
            currentBet: 40,
            minRaiseTo: 80,
            toCall: 20,
            chipValueCents: 0,
            phase: "preflop",
            community: [],
            winners: [],
            actionLog: [],
            turn: "you",
            isYourTurn: true,
            canReady: false,
            canRaise: true,
            players: [you, bot],
          };
          render();
          const inHand = panelBox();

          state = {
            ...state,
            phase: "complete",
            pot: 0,
            toCall: 0,
            currentBet: 0,
            isYourTurn: false,
            turn: null,
            canReady: true,
            isReady: false,
            winners: [],
            community: [],
            players: state.players.map((p) => ({
              ...p,
              bet: 0,
              cards: [],
              folded: false,
              allIn: false,
              isTurn: false,
              ready: p.isYou ? false : true,
              stack: 1000,
            })),
          };
          render();
          const postHand = panelBox();

          const seats = [
            {
              id: "you",
              name: "Alex",
              isHero: true,
              isBot: false,
              stack: 980,
              bet: 20,
              folded: false,
              allIn: false,
              dealer: true,
              isSmallBlind: false,
              isBigBlind: true,
              isTurn: true,
              holeCodes: ["As", "Ks"],
              lastAction: null,
            },
            {
              id: "bot",
              name: "CPU",
              isHero: false,
              isBot: true,
              stack: 960,
              bet: 40,
              folded: false,
              allIn: false,
              dealer: false,
              isSmallBlind: true,
              isBigBlind: false,
              isTurn: false,
              holeCodes: null,
              lastAction: "Raises to 40",
            },
          ];
          const table = {
            street: "preflop",
            pot: 60,
            toCall: 20,
            currentBet: 40,
            minRaiseTo: 80,
            boardCodes: [],
            seats,
            actingSeatId: "you",
            winners: [],
          };
          const heroStep = {
            id: "hero",
            index: 0,
            label: "Your decision",
            actorId: "you",
            kind: "hero_decision",
            isHeroDecision: true,
            decision: dec,
            table,
          };
          const resultStep = {
            id: "result",
            index: 1,
            label: "Result",
            actorId: null,
            kind: "result",
            isHeroDecision: false,
            decision: null,
            table: {
              ...table,
              street: "complete",
              pot: 0,
              toCall: 0,
              currentBet: 0,
              actingSeatId: null,
              winners: [{ playerId: "you", name: "Alex", amount: 120, hand: "Pair of Aces" }],
              seats: seats.map((s) => ({ ...s, bet: 0, isTurn: false })),
            },
          };
          lastHandReplay = {
            steps: [heroStep, resultStep],
            items: [dec],
            best: 0,
            fine: 0,
            mistake: 1,
            summary: "1 mistake",
          };
          openHandReview();
          const step = panelBox();
          startHandReviewRetry(dec, heroStep.table, 980);
          const retryLive = panelBox();
          submitHandReviewRetryAction({ type: "call" });
          const retryAnswered = panelBox();
          handReviewRetryItem = null;
          document.body.classList.remove("hand-review-retrying");
          paintHandReviewStep(1);
          const result = panelBox();

          const bottom = document.querySelector(".hand-review-bottom");
          const nav = document.querySelector(".hand-review-nav");
          return {
            inHand,
            postHand,
            step,
            retryLive,
            retryAnswered,
            result,
            bottomVisible: Boolean(bottom && getComputedStyle(bottom).display !== "none"),
            navBottom: nav?.getBoundingClientRect().bottom ?? 0,
            closeInHandRow: Boolean(document.querySelector("#handReviewCloseBtn")?.closest(".hand-row")),
          };
        },
        { decision },
      );

      const keys = ["postHand", "step", "retryLive", "retryAnswered", "result"];
      for (const key of keys) {
        assert.ok(
          Math.abs(boxes.inHand.height - boxes[key].height) <= 2,
          `${label} height inHand=${boxes.inHand.height} vs ${key}=${boxes[key].height}`,
        );
        assert.ok(
          Math.abs(boxes.inHand.top - boxes[key].top) <= 2,
          `${label} top jumped: inHand=${boxes.inHand.top} ${key}=${boxes[key].top}`,
        );
      }
      assert.equal(boxes.closeInHandRow, true);
      console.log(
        label,
        `panel height stable @ ${Math.round(boxes.inHand.height)}px across in-hand / Ready up / review`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
    kill();
  }
  console.log("Hand review panel height checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
