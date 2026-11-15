#!/usr/bin/env node
/**
 * Next-to-act: quiet row tint on the upcoming seat (no ▲/▼ arrow).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const bootSrc = fs.readFileSync(path.join(root, "public/app-boot.ts"), "utf8");
const trainerSrc = fs.readFileSync(path.join(root, "public/trainer.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const dts = fs.readFileSync(path.join(root, "public/client-globals.d.ts"), "utf8");

assert.match(bootSrc, /function nextToActSeat\(/);
assert.match(bootSrc, /function seatWaitingForStreetAction\(/);
assert.match(bootSrc, /next-to-act/);
assert.match(bootSrc, /aria-label="Next to act"/);
assert.match(bootSrc, /action = "—"/);
assert.doesNotMatch(bootSrc, /function nextActArrowGlyph\(/);
assert.doesNotMatch(bootSrc, /next-act-arrow/);
assert.doesNotMatch(bootSrc, /action = isNext \? "Next"/);
assert.doesNotMatch(bootSrc, /isNext \? "Next"/);
assert.match(trainerSrc, /next-to-act/);
assert.match(trainerSrc, /Next to act/);
assert.doesNotMatch(trainerSrc, /next-act-arrow/);
assert.doesNotMatch(trainerSrc, /action = "Next"/);
assert.doesNotMatch(dts, /nextActArrowGlyph/);
assert.match(css, /\.table-player-row\.next-to-act/);
assert.match(css, /\.player-action\.is-waiting/);
assert.doesNotMatch(css, /\.next-act-arrow/);
assert.doesNotMatch(css, /\.player-action\.is-next/);

const turnRule = /\.table-player-row\.turn\s*\{([^}]*)\}/.exec(css)?.[1] || "";
assert.match(turnRule, /inset 3px 0 0/);
const nextRule = /\.table-player-row\.next-to-act:not\(\.turn\)\s*\{([^}]*)\}/.exec(css)?.[1] || "";
assert.match(nextRule, /border-color/);
assert.match(nextRule, /background/);
assert.doesNotMatch(nextRule, /min-height|padding|margin|height:/);

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

// Mid-list: actor near top → next row below marked next-to-act (not the actor).
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
  assert.match(html, /table-player-row[^"]*next-to-act[^"]*"[^>]*aria-label="Next to act"[\s\S]*?utg/);
  assert.doesNotMatch(html, /table-player-row[^"]*turn[^"]*next-to-act/);
  assert.doesNotMatch(html, /next-act-arrow/);
  assert.doesNotMatch(html, /[▲▼]/);
  assert.match(html, /player-action is-waiting[^>]*>—</);
  assert.match(html, />Fold</);
  assert.doesNotMatch(html, /Posts small blind|posts small blind/i);
}

// Wraparound: bottom seat acting → top row marked Next; last-action text kept.
{
  window.state = {
    id: "T2",
    phase: "flop",
    turn: "bb",
    pot: 80,
    actionLog: [
      {
        id: "3",
        phase: "flop",
        playerId: "hero",
        action: "Checks",
        text: "hero checks.",
      },
    ],
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
  // First visual seat (hero) is next after wrap from bb.
  assert.match(
    html,
    /table-player-row[^"]*next-to-act[^"]*"[^>]*aria-label="Next to act"[\s\S]*?hero[\s\S]*?>check</,
  );
  assert.match(html, /player-action[^>]*>check</);
  assert.doesNotMatch(html, /next-act-arrow/);
  assert.doesNotMatch(html, /[▲▼]/);
  // Indicator must not replace the last-action text with a bare "Next".
  assert.doesNotMatch(html, /player-action[^>]*>Next</);
}

console.log("Turn order UI checks passed.");
