#!/usr/bin/env node
/**
 * Copy for AI prompt builder: visible info only; never leaks hidden hole cards.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CopyForAi = require("../dist/public/copy-for-ai");

function card(code) {
  const rank = code[0] === "T" ? "10" : code[0];
  const suitMap = { s: "♠", h: "♥", d: "♦", c: "♣" };
  return {
    code,
    rank,
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
    cards: [null, null],
    ...overrides,
  };
}

{
  assert.equal(CopyForAi.copyForAiAllowed({ offline: true, phase: "preflop" }), true);
  assert.equal(CopyForAi.copyForAiAllowed({ offline: false, phase: "preflop" }), false);
  assert.equal(CopyForAi.copyForAiAllowed({ offline: false, phase: "flop" }), false);
  assert.equal(CopyForAi.copyForAiAllowed({ offline: false, phase: "showdown" }), false);
  assert.equal(CopyForAi.copyForAiAllowed({ offline: false, phase: "complete" }), true);
  assert.equal(CopyForAi.copyForAiAllowed({ offline: false, phase: "lobby" }), true);
  assert.equal(CopyForAi.copyForAiAllowed({ offline: false, isSpectator: true, phase: "turn" }), false);
  assert.equal(CopyForAi.copyForAiAllowed({ offline: false, isSpectator: true, phase: "complete" }), true);
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
      { id: "3-1", phase: "preflop", playerId: "hero", action: "Posts small blind 10", text: "hero posts small blind 10." },
      { id: "3-2", phase: "preflop", playerId: "villain", action: "Posts big blind 20", text: "villain posts big blind 20." },
      { id: "3-3", phase: "preflop", playerId: "hero", action: "Calls 10", text: "hero calls 10." },
      { id: "3-4", phase: "preflop", playerId: "villain", action: "Checks", text: "villain checks." },
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
        isBigBlind: true,
        // Hidden holes arrive as nulls — must never appear in the prompt.
        cards: [null, null],
        stack: 980,
      }),
    ],
  };

  const prompt = CopyForAi.buildCopyForAiPrompt(room);
  assert.match(prompt, /No-limit Hold'em/);
  assert.match(prompt, /Blinds: 10\/20/);
  assert.match(prompt, /BTN\/SB: hero \(you\)/);
  assert.match(prompt, /BB: villain/);
  assert.match(prompt, /Hero: hero \(BTN\/SB\) hole cards: As Ks/);
  assert.match(prompt, /Board: Ah Kd 2c/);
  assert.match(prompt, /Pot: 60/);
  assert.match(prompt, /Preflop:/);
  assert.match(prompt, /hero calls 10/i);
  assert.doesNotMatch(prompt, /old raises|Raises to 99/);
  assert.match(prompt, /What should I do here\?$/m);
  assert.doesNotMatch(prompt, /\bnull\b/);
  // Explicit leak guard: no "Shown hands" / hole line for villain when cards are hidden.
  assert.doesNotMatch(prompt, /^Shown hands:/m);
  assert.doesNotMatch(prompt, /^Hero: villain/m);
  assert.doesNotMatch(prompt, /villain hole cards/i);
  assert.doesNotMatch(prompt, /villain: [A2-9TJQK]/i);
}

{
  // Showdown: shown villain cards are allowed; unshown stay out.
  const room = {
    offline: false,
    moneyMode: false,
    phase: "complete",
    handNumber: 1,
    smallBlind: 5,
    bigBlind: 10,
    pot: 100,
    potCents: 0,
    community: [card("2h"), card("7d"), card("9c"), card("Ts"), card("Aa")],
    rabbitCards: [],
    actionLog: [
      { id: "1-1", phase: "showdown", playerId: "hero", action: "Shows As Ks", text: "hero shows As Ks." },
    ],
    players: [
      player("btn", { dealer: true, folded: true, cards: [null, null] }),
      player("hero", {
        isYou: true,
        isSmallBlind: true,
        showCards: true,
        cards: [card("As"), card("Ks")],
      }),
      player("villain", {
        isBigBlind: true,
        showCards: true,
        cards: [card("Qh"), card("Qd")],
      }),
      player("muck", {
        folded: true,
        showCards: false,
        cards: [null, null],
      }),
    ],
  };
  // Fix community Ace code
  room.community[4] = card("Ac");
  const prompt = CopyForAi.buildCopyForAiPrompt(room);
  assert.match(prompt, /Shown hands:/);
  assert.match(prompt, /villain: Qh Qd/);
  assert.doesNotMatch(prompt, /muck: /);
  assert.match(prompt, /How did I play this hand\?$/m);
  assert.equal(CopyForAi.copyForAiAllowed(room), true);
}

{
  // Source: menu row sits after players, before Settings; fairness copy.
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const boot = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
  assert.match(html, /id="menuPlayers"[\s\S]*?id="copyForAiBtn"[\s\S]*?id="openSettingsBtn"/);
  assert.match(html, /class="secondary menu-row-btn"/);
  assert.match(boot, /Available after the hand/);
  assert.match(boot, /syncCopyForAiBtn/);
}

console.log("Copy for AI checks passed.");
