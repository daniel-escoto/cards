#!/usr/bin/env node
/**
 * Next-to-act: arrow on the acting row (▲/▼ by visual list order), waiting "—".
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const bootSrc = fs.readFileSync(path.join(root, "public/app-boot.ts"), "utf8");
const trainerSrc = fs.readFileSync(path.join(root, "public/trainer.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

assert.match(bootSrc, /function nextToActSeat\(/);
assert.match(bootSrc, /function nextActArrowGlyph\(/);
assert.match(bootSrc, /function seatWaitingForStreetAction\(/);
assert.match(bootSrc, /next-act-arrow/);
assert.match(bootSrc, /action = "—"/);
assert.doesNotMatch(bootSrc, /action = isNext \? "Next"/);
assert.doesNotMatch(bootSrc, /"next-to-act"/);
assert.doesNotMatch(bootSrc, /isNext \? "Next"/);
assert.match(trainerSrc, /next-act-arrow/);
assert.doesNotMatch(trainerSrc, /action = "Next"/);
assert.doesNotMatch(trainerSrc, /"next-to-act"/);
assert.match(css, /\.next-act-arrow/);
assert.match(css, /\.player-action\.is-waiting/);
assert.doesNotMatch(css, /\.table-player-row\.next-to-act/);
assert.doesNotMatch(css, /\.player-action\.is-next/);

const turnRule = /\.table-player-row\.turn\s*\{([^}]*)\}/.exec(css)?.[1] || "";
assert.match(turnRule, /inset 3px 0 0/);

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
const {
  nextToActSeat,
  nextActArrowGlyph,
  seatWaitingForStreetAction,
  seatCanActThisStreet,
  renderActionFeed,
} = window;

{
  const players = [seat("a"), seat("b"), seat("c"), seat("d", { folded: true })];
  assert.equal(nextToActSeat(players, "a", "preflop")?.id, "b");
  assert.equal(nextToActSeat(players, "c", "flop")?.id, "a", "wraps and skips folded");
  assert.equal(nextToActSeat(players, "b", "turn")?.id, "c");
  assert.equal(nextToActSeat(players, "a", "lobby"), null);
  assert.equal(nextToActSeat(players, null, "preflop"), null);
}

{
  const seats = [seat("a"), seat("b"), seat("c")];
  assert.equal(nextActArrowGlyph(seats, "a", "b"), "▼", "next below");
  assert.equal(nextActArrowGlyph(seats, "c", "a"), "▲", "next above / wrap");
  assert.equal(nextActArrowGlyph(seats, "a", "a"), "");
  assert.equal(nextActArrowGlyph(seats, "a", null), "");
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

// Actor near top → ▼ toward next below.
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
  assert.match(html, /next-act-arrow[^>]*>▼</);
  assert.doesNotMatch(html, />Next</);
  assert.doesNotMatch(html, /next-to-act/);
  assert.match(html, /player-action is-waiting[^>]*>—</);
  assert.match(html, />Fold</);
  assert.doesNotMatch(html, /Posts small blind|posts small blind/i);
}

// Actor near bottom → ▲ toward next above (wrap).
{
  window.state = {
    id: "T2",
    phase: "flop",
    turn: "bb",
    pot: 80,
    actionLog: [],
    players: [
      seat("hero", { isYou: true }),
      seat("utg", { folded: true }),
      seat("mp", { folded: true }),
      seat("sb", { isSmallBlind: true, folded: true }),
      seat("bb", { isBigBlind: true, isTurn: true }),
    ],
    community: [],
    winners: [],
    chipValueCents: 0,
  };
  const html = renderActionFeed();
  assert.match(html, /table-player-row[^"]*turn[^"]*"[^>]*>[\s\S]*?bb[\s\S]*?Acting/);
  assert.match(html, /next-act-arrow[^>]*>▲</);
  assert.doesNotMatch(html, />Next</);
}

console.log("Turn order UI checks passed.");
