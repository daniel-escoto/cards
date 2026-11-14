#!/usr/bin/env node
/**
 * Copy for AI prompt builder + availability (bot-only always; multi-human / spectator between hands).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../dist/shared/engine.node");
const CopyForAi = require("../dist/public/copy-for-ai");

function card(code) {
  const suitMap = { s: "♠", h: "♥", d: "♦", c: "♣" };
  return {
    code,
    rank: code[0] === "T" ? "10" : code[0],
    suit: suitMap[code[1]],
    color: code[1] === "h" || code[1] === "d" ? "red" : "black",
  };
}

function player(id, overrides = {}) {
  return {
    id,
    name: id,
    stack: 1000,
    stackCents: 0,
    folded: false,
    allIn: false,
    sittingOut: false,
    waitingForNextHand: false,
    showCards: false,
    dealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    isYou: false,
    isBot: false,
    cards: [null, null],
    ...overrides,
  };
}

{
  // Bot-only / practice: always on, even mid-hand.
  assert.equal(
    CopyForAi.copyForAiAllowed({
      offline: true,
      phase: "preflop",
      isSpectator: false,
      players: [player("h", { isYou: true }), player("b", { isBot: true })],
    }),
    true,
  );
  assert.equal(
    engine.copyForAiAvailableForViewer(
      { phase: "flop", players: [{ id: "h", isBot: false }, { id: "b", isBot: true }] },
      "h",
      false,
    ),
    true,
  );

  // Multi-human: only between hands.
  assert.equal(
    CopyForAi.copyForAiAllowed({
      offline: false,
      phase: "preflop",
      players: [player("h", { isYou: true }), player("o")],
    }),
    false,
  );
  assert.equal(
    CopyForAi.copyForAiAllowed({
      offline: false,
      phase: "complete",
      players: [player("h", { isYou: true }), player("o")],
    }),
    true,
  );
  assert.equal(
    engine.copyForAiAvailableForViewer(
      { phase: "turn", players: [{ id: "h", isBot: false }, { id: "o", isBot: false }] },
      "h",
      false,
    ),
    false,
  );
  assert.equal(
    engine.copyForAiAvailableForViewer(
      { phase: "lobby", players: [{ id: "h", isBot: false }, { id: "o", isBot: false }] },
      "h",
      false,
    ),
    true,
  );

  // Spectators: between hands only.
  assert.equal(
    engine.copyForAiAvailableForViewer(
      { phase: "flop", players: [{ id: "h", isBot: false }, { id: "b", isBot: true }] },
      "spec",
      true,
    ),
    false,
  );
  assert.equal(
    engine.copyForAiAvailableForViewer(
      { phase: "complete", players: [{ id: "h", isBot: false }, { id: "b", isBot: true }] },
      "spec",
      true,
    ),
    true,
  );
  assert.equal(
    CopyForAi.copyForAiAllowed({
      isSpectator: true,
      phase: "river",
      players: [player("h"), player("b", { isBot: true })],
    }),
    false,
  );
}

{
  const room = {
    offline: true,
    moneyMode: false,
    phase: "flop",
    handNumber: 3,
    smallBlind: 10,
    bigBlind: 20,
    smallBlindCents: 0,
    bigBlindCents: 0,
    pot: 60,
    potCents: 0,
    community: [card("Ah"), card("Kd"), card("2c")],
    rabbitCards: [],
    isSpectator: false,
    actionLog: [
      {
        id: "3-1",
        phase: "preflop",
        playerId: "hero",
        action: "Posts small blind 10",
        text: "hero posts small blind 10.",
      },
      {
        id: "3-2",
        phase: "preflop",
        playerId: "villain",
        action: "Posts big blind 20",
        text: "villain posts big blind 20.",
      },
      { id: "3-3", phase: "preflop", playerId: "hero", action: "Calls 10", text: "hero calls 10." },
      {
        id: "3-4",
        phase: "preflop",
        playerId: "villain",
        action: "Checks",
        text: "villain checks.",
      },
      { id: "2-9", phase: "river", playerId: "old", action: "Raises to 99", text: "old raises to 99." },
    ],
    players: [
      player("hero", {
        isYou: true,
        dealer: true,
        isSmallBlind: true,
        cards: [card("As"), card("Ks")],
        stack: 980,
      }),
      player("villain", {
        isBot: true,
        isBigBlind: true,
        cards: [null, null],
        stack: 980,
      }),
    ],
  };

  const prompt = CopyForAi.buildCopyForAiPrompt(room);
  assert.match(prompt, /No-limit Hold'em/);
  assert.match(prompt, /Blinds: 10\/20/);
  assert.match(prompt, /BTN\/SB: hero \(you\)/);
  assert.match(prompt, /Hero: hero \(BTN\/SB\) hole cards: As Ks/);
  assert.match(prompt, /Board: Ah Kd 2c/);
  assert.match(prompt, /hero calls 10/i);
  assert.doesNotMatch(prompt, /old raises|Raises to 99/);
  assert.match(prompt, /What should I do here\?$/m);
  assert.doesNotMatch(prompt, /^Shown hands:/m);
  assert.doesNotMatch(prompt, /villain hole cards/i);
  assert.doesNotMatch(prompt, /villain: [A2-9TJQK]/i);
  assert.doesNotMatch(prompt, /\bnull\b/);
}

{
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.match(
    html,
    /id="menuPlayers"[\s\S]*?id="coachBtn"[\s\S]*?id="copyForAiBtn"[\s\S]*?id="openSettingsBtn"/,
  );
}

console.log("Copy for AI checks passed.");
