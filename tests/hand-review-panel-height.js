#!/usr/bin/env node
/**
 * Hand Review control-panel height must be identical across step view, retry-live,
 * retry-answered, and result — at 375 and 1280 (elements hold their spots).
 *
 * Always asserts CSS/source contracts (CI). When Chrome + puppeteer-core are
 * available, also asserts live bounding boxes.
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
  /body\.hand-review-open:not\(\.hand-review-retrying\) \.hand-review-bottom\s*\{[^}]*position:\s*absolute/s,
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
assert.match(
  css,
  /\.hand-review-chrome\s*\{[^}]*grid-template-rows:\s*auto minmax\(calc\(13px \* 1\.3 \* 4/s,
);
assert.match(html, /hand-review-bottom[\s\S]*handReviewRetryBar[\s\S]*hand-review-nav/);
assert.match(css, /\.hand-review-verdict\s*\{[^}]*min-height:\s*calc\(13px \* 1\.3 \* 4/s);
assert.match(css, /\.hand-review-verdict-why\s*\{[^}]*overflow-wrap:\s*anywhere/s);
assert.match(css, /\.hand-row \.hand-review-close\.icon-btn/);
assert.match(html, /hand-row[\s\S]*id="handReviewCloseBtn"/);
assert.doesNotMatch(html, /hand-review-chrome-head[\s\S]{0,200}handReviewCloseBtn/);
assert.match(tableSrc, /!handReviewActive && reserved/);
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

const chrome =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
let puppeteer;
try {
  puppeteer = require("puppeteer-core");
} catch {
  puppeteer = null;
}

if (!chrome || !puppeteer) {
  console.log(
    "Hand review panel height source contracts passed (live bbox skipped — no Chrome/puppeteer-core).",
  );
  process.exit(0);
}

const PORT = "3851";
const base = `http://127.0.0.1:${PORT}`;

async function main() {
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
    reason: "Raise to 80 — you win about 1 in 2, calling only needs 3 in 10.",
  };
  const beforeTable = {
    street: "preflop",
    pot: 60,
    toCall: 20,
    currentBet: 20,
    minRaiseTo: 40,
    boardCodes: [],
    actingSeatId: "hero",
    winners: [],
    seats: [
      {
        id: "hero",
        name: "Daniel",
        isHero: true,
        isBot: false,
        stack: 980,
        bet: 0,
        folded: false,
        allIn: false,
        dealer: false,
        isSmallBlind: false,
        isBigBlind: true,
        isTurn: true,
        holeCodes: ["8s", "Ad"],
        lastAction: null,
      },
      {
        id: "bot",
        name: "CPU",
        isHero: false,
        isBot: true,
        stack: 980,
        bet: 20,
        folded: false,
        allIn: false,
        dealer: true,
        isSmallBlind: true,
        isBigBlind: false,
        isTurn: false,
        holeCodes: null,
        lastAction: "Raises to 20",
      },
    ],
  };
  const resultTable = {
    ...beforeTable,
    street: "complete",
    toCall: 0,
    currentBet: 0,
    actingSeatId: null,
    winners: [{ playerId: "bot", name: "CPU", amount: 60 }],
    seats: beforeTable.seats.map((s) =>
      s.isHero
        ? { ...s, folded: true, isTurn: false, lastAction: "Folds", bet: 0 }
        : { ...s, stack: 1040, bet: 0, lastAction: null, isTurn: false },
    ),
  };
  const replay = {
    steps: [
      {
        id: "s1",
        index: 0,
        label: "You fold",
        actorId: "hero",
        kind: "hero_decision",
        isHeroDecision: true,
        decision,
        table: beforeTable,
      },
      {
        id: "s2",
        index: 1,
        label: "CPU wins",
        actorId: "bot",
        kind: "result",
        isHeroDecision: false,
        decision: null,
        table: resultTable,
      },
    ],
    items: [decision],
    best: 0,
    fine: 0,
    mistake: 1,
    summary: "1 decision · 1 mistake",
  };
  const savedRoom = {
    id: "SHOT",
    phase: "complete",
    handNumber: 3,
    pot: 60,
    bigBlind: 20,
    smallBlind: 10,
    toCall: 0,
    currentBet: 0,
    minRaiseTo: 40,
    community: [],
    winners: [{ playerId: "bot", name: "CPU", amount: 60 }],
    actionLog: [],
    isYourTurn: false,
    canReady: true,
    canRaise: false,
    canShove: false,
    canShowHand: false,
    canStart: false,
    canNextHand: true,
    canAddBot: false,
    canRebuy: false,
    bustedOut: false,
    turn: null,
    players: [
      {
        id: "hero",
        name: "Daniel",
        isYou: true,
        isBot: false,
        stack: 980,
        bet: 0,
        folded: true,
        allIn: false,
        cards: [{ code: "8s" }, { code: "Ad" }],
        dealer: false,
        isSmallBlind: false,
        isBigBlind: true,
      },
      {
        id: "bot",
        name: "CPU",
        isYou: false,
        isBot: true,
        stack: 1040,
        bet: 0,
        folded: false,
        allIn: false,
        cards: [],
        dealer: true,
        isSmallBlind: true,
        isBigBlind: false,
      },
    ],
  };

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900"],
  });

  try {
    for (const [width, height, label] of [
      [1280, 900, "1280"],
      [375, 812, "375"],
    ]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(base, { waitUntil: "networkidle0", timeout: 30000 });
      /* eslint-disable no-undef -- browser page.evaluate callback runs in the page */
      const boxes = await page.evaluate(
        ({ replay: rp, savedRoom: room, decision: dec }) => {
          const panelBox = () => {
            const el = document.querySelector(".control-panel");
            const r = el.getBoundingClientRect();
            return { top: r.top, height: r.height, bottom: r.bottom };
          };
          const paint = (mode) => {
            document.getElementById("welcome")?.classList.add("hidden");
            document.getElementById("tableView")?.classList.remove("hidden");
            lastHandReplay = rp;
            state = structuredClone(room);
            handReviewSavedState = structuredClone(room);
            handReviewActive = true;
            handReviewRetryItem = null;
            handReviewRevealedSteps = new Set();
            handReviewStepIndex = -1;
            document.body.classList.add("hand-review-open");
            document.body.classList.remove("hand-review-retrying");
            handReviewChrome?.classList.remove("hidden");
            if (handReviewCloseBtn) handReviewCloseBtn.hidden = false;
            if (handReviewSummary) handReviewSummary.textContent = rp.summary;
            bustCardRenderCache();
            paintHandReviewStep(0);
            if (mode === "retry-live") {
              startHandReviewRetry(dec, rp.steps[0].table, 980);
            } else if (mode === "retry-answered") {
              startHandReviewRetry(dec, rp.steps[0].table, 980);
              submitHandReviewRetryAction({ type: "call" });
            } else if (mode === "result") {
              paintHandReviewStep(1);
            }
            const panel = panelBox();
            const betBottom =
              document.querySelector("#betControls")?.getBoundingClientRect().bottom ?? 0;
            const bottom = document.querySelector(".hand-review-bottom");
            const nav = document.querySelector(".hand-review-nav");
            const navBottom = nav?.getBoundingClientRect().bottom ?? 0;
            const bottomVisible = Boolean(
              bottom && getComputedStyle(bottom).display !== "none",
            );
            return {
              ...panel,
              // Bottom of the live controls (always laid out); nav must match this when shown.
              controlsBottom: betBottom,
              navBottom,
              bottomZone: mode === "retry-live" ? betBottom : navBottom,
              navAlignedToControls:
                mode === "retry-live" ? true : Math.abs(navBottom - betBottom) <= 3,
              bottomVisible,
            };
          };
          const close = document.querySelector("#handReviewCloseBtn");
          const pot = document.querySelector(".hand-row .pot-chip");
          const closeR = close?.getBoundingClientRect();
          const potR = pot?.getBoundingClientRect();
          const handRow = document.querySelector(".hand-row")?.getBoundingClientRect();
          return {
            step: paint("step"),
            retryLive: paint("retry-live"),
            retryAnswered: paint("retry-answered"),
            result: paint("result"),
            closeInHandRow: Boolean(close?.closest(".hand-row")),
            closeTop: closeR?.top,
            handRowTop: handRow?.top,
            potRight: potR?.right,
            closeLeft: closeR?.left,
            verdictText: document.querySelector("#handReviewVerdict")?.textContent || "",
          };
        },
        { replay, savedRoom, decision },
      );
      /* eslint-enable no-undef */

      const keys = ["step", "retryLive", "retryAnswered", "result"];
      for (let i = 1; i < keys.length; i++) {
        assert.ok(
          Math.abs(boxes.step.height - boxes[keys[i]].height) <= 3,
          `${label} height ${boxes.step.height} vs ${keys[i]}=${boxes[keys[i]].height}`,
        );
        assert.ok(
          Math.abs(boxes.step.top - boxes[keys[i]].top) <= 3,
          `${label} top jumped: step=${boxes.step.top} ${keys[i]}=${boxes[keys[i]].top}`,
        );
        assert.ok(
          Math.abs(boxes.retryLive.bottomZone - boxes[keys[i]].bottomZone) <= 3,
          `${label} bottom zone: retryLive=${boxes.retryLive.bottomZone} vs ${keys[i]}=${boxes[keys[i]].bottomZone}`,
        );
      }
      for (const key of ["step", "retryAnswered", "result"]) {
        assert.equal(boxes[key].bottomVisible, true, `${label} ${key}: bottom stack visible`);
        assert.ok(
          boxes[key].navAlignedToControls,
          `${label} ${key}: nav bottom ${boxes[key].navBottom} must equal controls bottom ${boxes[key].controlsBottom}`,
        );
      }
      assert.equal(boxes.retryLive.bottomVisible, false, `${label} retry-live: bottom stack hidden`);
      assert.equal(boxes.closeInHandRow, true);
      assert.ok(
        Math.abs((boxes.closeTop || 0) - (boxes.handRowTop || 0)) <= 8,
        `${label}: close must sit in the hand-row band (top of panel)`,
      );
      assert.ok(
        (boxes.closeLeft || 0) >= (boxes.potRight || 0) - 1,
        `${label}: close must sit to the right of the pot chip`,
      );
      console.log(
        label,
        `panel height stable @ ${Math.round(boxes.step.height)}px; bottom zone @ ${Math.round(boxes.retryLive.bottomZone)}`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
    kill();
  }
}

main()
  .then(() => {
    console.log("Hand review panel height checks passed.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
