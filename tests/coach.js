#!/usr/bin/env node
/**
 * Bot-only coach: availability gate, no hidden-card use, basic suggestions.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../dist/shared/engine.node");
const Coach = require("../dist/public/coach");

engine.setRandomInt(() => 0);

function card(code) {
  const suitMap = { s: "♠", h: "♥", d: "♦", c: "♣" };
  return {
    code,
    rank: code[0] === "T" ? "10" : code[0],
    suit: suitMap[code[1]],
    color: code[1] === "h" || code[1] === "d" ? "red" : "black",
  };
}

function seat(id, overrides = {}) {
  return {
    id,
    name: id,
    isBot: false,
    isYou: false,
    folded: false,
    allIn: false,
    stack: 1000,
    bet: 0,
    invested: 0,
    cards: [null, null],
    ...overrides,
  };
}

{
  assert.equal(
    Coach.coachAvailableForPlayers([seat("h", { isYou: true }), seat("b", { isBot: true })]),
    true,
  );
  assert.equal(
    Coach.coachAvailableForPlayers([
      seat("h", { isYou: true }),
      seat("b", { isBot: true }),
      seat("human2"),
    ]),
    false,
    "another human blocks coach",
  );
  assert.equal(Coach.coachAvailableForPlayers([seat("b", { isBot: true, isYou: true })]), false);
  assert.equal(engine.coachAvailableForViewer({ players: [{ id: "h", isBot: false }, { id: "b", isBot: true }] }, "h"), true);
  assert.equal(engine.coachAvailableForViewer({ players: [{ id: "h", isBot: false }, { id: "o", isBot: false }] }, "h"), false);
  assert.equal(engine.coachAvailableForViewer({ players: [{ id: "h", isBot: false }, { id: "b", isBot: true }] }, "spectator"), false);
}

{
  // Server serialize enforces the flag (spectator / multi-human → false).
  const room = engine.createPracticeRoom({ botCount: 2, name: "Hero" });
  const view = engine.serializeRoom(room, room.hostId);
  assert.equal(view.coachAvailable, true);

  const multi = {
    players: [
      { id: "alice", isBot: false },
      { id: "bob", isBot: false },
    ],
  };
  assert.equal(engine.coachAvailableForViewer(multi, "alice"), false);
}

{
  const villainHidden = [card("Qc"), card("Jd")];
  const room = {
    coachAvailable: true,
    isSpectator: false,
    isYourTurn: true,
    phase: "flop",
    pot: 60,
    toCall: 20,
    toCallCents: 0,
    currentBet: 40,
    minRaise: 20,
    minRaiseTo: 60,
    canRaise: true,
    canShove: true,
    moneyMode: false,
    community: [card("Ah"), card("7d"), card("2c")],
    players: [
      seat("hero", {
        isYou: true,
        cards: [card("As"), card("Ks")],
        bet: 20,
        stack: 980,
      }),
      seat("villain", {
        isBot: true,
        // If the builder ever read these, suggestions/tests would leak them.
        cards: villainHidden,
        bet: 40,
        stack: 960,
        invested: 40,
      }),
    ],
  };

  // Avoid a constant RNG — Fisher–Yates collapses when random() is always 0.5.
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const suggestion = Coach.buildCoachSuggestion(room, { random, iterations: 80 });
  assert.ok(suggestion, "builds a suggestion on hero turn");
  assert.ok(suggestion.equity >= 0 && suggestion.equity <= 1);
  assert.ok(suggestion.equity > 0.4, `AK on A-high should be favored (got ${suggestion.equity})`);
  assert.ok(["fold", "call", "raise", "bet", "check"].includes(suggestion.action));
  const blob = JSON.stringify(suggestion) + Coach.formatCoachHint(suggestion, room);
  assert.doesNotMatch(blob, /Qc|Jd/);
  assert.doesNotMatch(blob, /villain/);
  const model = Coach.formatCoachHintModel(suggestion, room);
  assert.ok(model.headline);
  assert.ok(model.reason);
  assert.match(model.equity, /%$/);
  assert.equal(model.action, suggestion.action);
  assert.doesNotMatch(model.headline + model.reason, /Coach ·/);
}

{
  // Facing a big bet with air on a dry river → fold.
  const room = {
    coachAvailable: true,
    isYourTurn: true,
    phase: "river",
    pot: 100,
    toCall: 400,
    currentBet: 400,
    minRaiseTo: 800,
    canRaise: true,
    canShove: true,
    moneyMode: false,
    community: [card("As"), card("Kd"), card("Qc"), card("Jh"), card("2c")],
    players: [
      seat("hero", {
        isYou: true,
        cards: [card("4s"), card("8d")],
        bet: 0,
        stack: 800,
      }),
      seat("bot", { isBot: true, bet: 400, stack: 400, invested: 400 }),
    ],
  };
  let seed = 3;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const suggestion = Coach.buildCoachSuggestion(room, { random, iterations: 80 });
  assert.ok(suggestion);
  assert.ok(suggestion.equity + 0.03 < suggestion.potOdds, "air vs huge bet is behind");
  assert.equal(suggestion.action, "fold");
  assert.match(suggestion.reason, /pot odds/i);
}

{
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.match(
    html,
    /id="menuPlayers"[\s\S]*?id="shareGameBtn"[\s\S]*?id="coachBtn"[\s\S]*?id="copyForAiBtn"/,
  );
  assert.match(html, /id="coachHint"/);
  const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
  assert.match(css, /\.blind-chip\.dealer\s*\{[^}]*#f5f5f4/);
  assert.match(css, /\.coach-hint-headline/);
  assert.match(css, /coach-hint\[data-action="fold"\]/);
}

console.log("Coach checks passed.");
