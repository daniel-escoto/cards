#!/usr/bin/env node
/**
 * Next-to-act mark + waiting placeholder for seats that haven't acted this street.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const bootSrc = fs.readFileSync(path.join(root, "public/app-boot.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

assert.match(bootSrc, /function nextToActSeat\(/);
assert.match(bootSrc, /function seatWaitingForStreetAction\(/);
assert.match(bootSrc, /isNext \? "next-to-act"/);
assert.match(bootSrc, /action = isNext \? "Next" : "—"/);
assert.match(css, /\.table-player-row\.next-to-act:not\(\.turn\)/);
assert.match(css, /\.player-action\.is-waiting/);
assert.match(css, /\.player-action\.is-next/);

const nextRule = /\.table-player-row\.next-to-act:not\(\.turn\)\s*\{([^}]*)\}/.exec(css)?.[1] || "";
const turnRule = /\.table-player-row\.turn\s*\{([^}]*)\}/.exec(css)?.[1] || "";
assert.match(turnRule, /inset 3px 0 0/);
assert.match(nextRule, /inset 2px 0 0/);
assert.doesNotMatch(nextRule, /accent\) 16%/);

function loadGlobals() {
  const html = fs
    .readFileSync(path.join(root, "dist/public/index.html"), "utf8")
    .replace(/<script src="[^"]+"><\/script>/g, "");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously",
    beforeParse(window) {
      window.matchMedia = () => ({
        matches: false,
        media: "",
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      });
      window.io = () => ({ on() {}, emit() {}, timeout: () => ({ emit() {} }), connected: true, id: "t" });
      window.CardArt = { render: () => "", layouts: {} };
      window.HoldemEngine = {};
      window.PracticeSession = {};
      window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    },
  });
  for (const file of [
    "app-sounds.js",
    "app-format.js",
    "app-keybinds.js",
    "app-boot.js",
    "app-table.js",
    "app-events.js",
  ]) {
    const script = dom.window.document.createElement("script");
    script.textContent = fs.readFileSync(path.join(root, "dist/public", file), "utf8");
    dom.window.document.body.appendChild(script);
  }
  return dom.window;
}

function seat(id, overrides = {}) {
  return {
    id,
    name: id,
    stack: 1000,
    folded: false,
    allIn: false,
    sittingOut: false,
    waitingForNextHand: false,
    connected: true,
    cards: [{ code: "As" }, { code: "Kh" }],
    ...overrides,
  };
}

const window = loadGlobals();
const { nextToActSeat, seatWaitingForStreetAction, seatCanActThisStreet, renderActionFeed } = window;

{
  const players = [seat("a"), seat("b"), seat("c"), seat("d", { folded: true })];
  assert.equal(nextToActSeat(players, "a", "preflop")?.id, "b");
  assert.equal(nextToActSeat(players, "c", "flop")?.id, "a", "wraps and skips folded");
  assert.equal(nextToActSeat(players, "b", "turn")?.id, "c");
  assert.equal(nextToActSeat(players, "a", "lobby"), null);
  assert.equal(nextToActSeat(players, null, "preflop"), null);
}

{
  // Only the actor can still act → hide next (street about to close).
  const players = [seat("a"), seat("b", { folded: true }), seat("c", { allIn: true, stack: 0 })];
  assert.equal(nextToActSeat(players, "a", "river"), null);
  assert.equal(seatCanActThisStreet(players[2]), false);
}

{
  const live = seat("x");
  assert.equal(
    seatWaitingForStreetAction(live, { hasStreetAction: false, isActing: false, phase: "preflop" }),
    true,
  );
  assert.equal(
    seatWaitingForStreetAction(live, { hasStreetAction: true, isActing: false, phase: "preflop" }),
    false,
  );
  assert.equal(
    seatWaitingForStreetAction(live, { hasStreetAction: false, isActing: true, phase: "preflop" }),
    false,
  );
  assert.equal(
    seatWaitingForStreetAction(seat("y", { folded: true }), {
      hasStreetAction: false,
      isActing: false,
      phase: "flop",
    }),
    false,
  );
}

// Rendered markup: Acting / Next / — / Fold with next-to-act class.
{
  window.state = {
    id: "T",
    phase: "preflop",
    turn: "hero",
    pot: 30,
    actionLog: [
      { id: "1", phase: "preflop", playerId: "sb", action: "Posts small blind 10", text: "SB posts small blind 10." },
      { id: "2", phase: "preflop", playerId: "bb", action: "Posts big blind 20", text: "BB posts big blind 20." },
    ],
    players: [
      seat("hero", { isYou: true, isTurn: true }),
      seat("utg"),
      seat("foldy", { folded: true }),
      seat("sb", { isSmallBlind: true, bet: 10 }),
      seat("bb", { isBigBlind: true, bet: 20 }),
    ],
    community: [],
    winners: [],
    chipValueCents: 0,
  };
  const html = renderActionFeed();
  assert.match(html, /table-player-row[^"]*turn[^"]*"[^>]*>[\s\S]*?hero[\s\S]*?Acting/);
  assert.match(html, /next-to-act/);
  assert.match(html, /player-action is-next[^>]*>Next</);
  assert.match(html, /player-action is-waiting[^>]*>—</);
  assert.match(html, />Fold</);
  // Blind posts are not street actions — SB/BB still waiting (or Next if next).
  assert.doesNotMatch(html, /Posts small blind|posts small blind/i);
}

console.log("Turn order UI checks passed.");
