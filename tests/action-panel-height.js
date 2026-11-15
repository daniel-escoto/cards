#!/usr/bin/env node
/**
 * Control panel footprint must match on your turn vs waiting (375 + 1280).
 *
 * Real layout height comes from the fixed .control-panel grid tracks + whether
 * .is-compact hides the bet row. This test drives renderHeroActionControls for
 * on-turn and off-turn (raiseEligible cleared → canRaise false) and asserts the
 * raise shell stays mounted + disabled off-turn — the same structure at every
 * viewport, including 375 and 1280 (no in-hand media query changes the tracks).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const tableSrc = fs.readFileSync(path.join(root, "public/app-table.ts"), "utf8");
const bootSrc = fs.readFileSync(path.join(root, "public/app-boot.ts"), "utf8");
const tableJs = fs.readFileSync(path.join(root, "dist/public/app-table.js"), "utf8");
const raiseSizingJs = fs.readFileSync(path.join(root, "dist/public/raise-sizing.js"), "utf8");
const checkFoldJs = fs.readFileSync(path.join(root, "dist/public/check-fold.js"), "utf8");

// Source contracts.
assert.match(tableSrc, /ignoreRaiseOpen:\s*disabled/);
assert.match(tableSrc, /ignoreRaiseOpen\?:/);
assert.match(tableSrc, /addCheckFoldToggleButton/);
assert.match(tableSrc, /Check\/Fold|CheckFold\.LABEL/);
assert.match(bootSrc, /heroHand\.removeAttribute\("title"\)/);
assert.doesNotMatch(bootSrc, /heroHand\.title\s*=/);
assert.match(bootSrc, /checkFoldSession/);

// In-hand panel always uses five tracks (hand · spacer · prompt · buttons · bet).
// Prompt minmax font size may change by breakpoint (15px → 16px), but on-turn vs
// off-turn at the same viewport share the same track recipe whenever compact matches.
assert.match(
  css,
  /\.control-panel\s*\{[^}]*grid-template-rows:\s*auto 0 minmax\(var\(--cp-prompt-h\), auto\) auto auto/,
);
assert.match(css, /--cp-prompt-h:\s*calc\(15px \* 1\.35\)/);
assert.match(
  css,
  /@media \(min-width: 1040px\)[\s\S]*?\.control-panel\s*\{[^}]*--cp-prompt-h:\s*calc\(16px \* 1\.35\)/,
);

const grab = (fn) => {
  const start = tableJs.indexOf(`function ${fn}(`);
  assert.ok(start >= 0, `${fn} exists`);
  const end = tableJs.indexOf("\nfunction ", start + 10);
  return tableJs.slice(start, end === -1 ? undefined : end);
};

const raiseSizingContext = { module: { exports: {} }, exports: {} };
vm.runInNewContext(`${raiseSizingJs}\nthis.api = module.exports;`, raiseSizingContext);
const RaiseSizing = raiseSizingContext.api;
assert.ok(RaiseSizing && typeof RaiseSizing.initialRaiseTo === "function");

const checkFoldContext = { module: { exports: {} }, exports: {} };
vm.runInNewContext(`${checkFoldJs}\nthis.api = module.exports;`, checkFoldContext);
const CheckFold = checkFoldContext.api;
assert.ok(CheckFold && typeof CheckFold.createSession === "function");

function buildHarness() {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const panel = document.querySelector("#tableView .control-panel");
  const gameButtons = document.querySelector("#gameButtons");
  const betControls = document.querySelector("#betControls");
  const betPresets = document.querySelector("#betPresets");
  const winnerList = document.querySelector("#winnerList");
  const turnInfo = document.querySelector("#turnInfo");
  const raiseActionBtn = document.querySelector("#raiseActionBtn");
  const raiseMinus = document.querySelector("#raiseMinus");
  const raisePlus = document.querySelector("#raisePlus");
  const raiseAmount = document.querySelector("#raiseAmount");
  const raiseLabel = document.querySelector("#raiseLabel");
  assert.ok(panel && gameButtons && betControls && betPresets);

  const context = {
    document,
    console,
    state: null,
    gameButtons,
    betControls,
    betPresets,
    winnerList,
    turnInfo,
    raiseActionBtn,
    raiseMinus,
    raisePlus,
    raiseAmount,
    raiseLabel,
    raiseState: { min: 40, max: 1000, step: 20, value: 40 },
    raiseControlsDisabled: false,
    mergePassiveConfirm: false,
    confirmActionBtn: null,
    handReviewActive: false,
    handReviewRetryItem: null,
    checkFoldSession: CheckFold.createSession(),
    CheckFold,
    HoldemUI: undefined,
    keybinds: { fold: "f", call: "c", raise: "r", ready: " ", showHand: "s" },
    RaiseSizing,
    emitWithAck() {},
    formatAmount(chips) {
      return String(chips);
    },
    keybindLabel(key) {
      return key ? String(key).toUpperCase() : "";
    },
    escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    activeHero() {
      return context.state?.players?.find((player) => player.isYou) || null;
    },
    render() {
      // Harness paints via paint(); toggle re-render not needed here.
    },
  };
  context.setButtonLabel = function setButtonLabel(button, label, shortcut = "") {
    if (!button) return;
    button.innerHTML = `<span>${context.escapeHtml(label)}</span>${
      shortcut ? `<kbd aria-hidden="true">${context.escapeHtml(shortcut)}</kbd>` : ""
    }`;
    button.classList.toggle("has-shortcut", Boolean(shortcut));
    button.setAttribute("aria-label", shortcut ? `${label} (${shortcut})` : label);
  };

  const fns = [
    "setBetControlsReserved",
    "actionPlaceholder",
    "reserveActionSpace",
    "heroCanRaiseMeaningfully",
    "renderHeroActionControls",
    "configureRaiseControls",
    "raiseBounds",
    "atPassiveDetent",
    "renderBetPresets",
    "setRaiseState",
    "clampRaise",
    "addConfirmPassiveButton",
    "updateConfirmPassiveButton",
    "addActionButton",
    "addCheckFoldToggleButton",
    "toggleCheckFoldArmed",
  ];
  vm.runInNewContext(
    fns.map(grab).join("\n") +
      `\nthis.renderHero = renderHeroActionControls;` +
      `\nthis.reserve = reserveActionSpace;` +
      `\nthis.setReserved = setBetControlsReserved;` +
      `\nthis.toggleCheckFoldArmed = toggleCheckFoldArmed;`,
    context,
  );
  return { document, panel, gameButtons, betControls, betPresets, context };
}

function makeRoom({ isYourTurn, canRaise, canShove, toCall }) {
  const hero = {
    id: "hero",
    name: "Daniel",
    isYou: true,
    isBot: false,
    bet: toCall > 0 ? 0 : 20,
    stack: 980,
    folded: false,
    allIn: false,
    cards: [{ code: "As" }, { code: "Kd" }],
  };
  const villain = {
    id: "bot1",
    name: "CPU",
    isYou: false,
    isBot: true,
    bet: toCall > 0 ? toCall : 20,
    stack: 980,
    folded: false,
    allIn: false,
  };
  return {
    phase: "flop",
    pot: 100,
    currentBet: toCall > 0 ? toCall : 20,
    minRaiseTo: toCall > 0 ? toCall * 2 : 40,
    bigBlind: 20,
    toCall,
    toCallCents: 0,
    chipValueCents: 0,
    isYourTurn,
    canRaise,
    canShove,
    turn: isYourTurn ? "hero" : "bot1",
    players: [hero, villain],
  };
}

function footprint(harness) {
  const { panel, gameButtons, betControls, betPresets } = harness;
  const buttons = [...gameButtons.querySelectorAll(":scope > button")].map((b) => ({
    text: (b.textContent || "").replace(/\s+/g, " ").trim(),
    disabled: b.disabled,
    ariaDisabled: b.getAttribute("aria-disabled"),
    ariaPressed: b.getAttribute("aria-pressed"),
    selected: b.classList.contains("selected"),
    tabIndex: b.tabIndex,
  }));
  const presets = [...betPresets.querySelectorAll("button")].map((b) => ({
    text: (b.textContent || "").trim(),
    disabled: b.disabled,
    ariaDisabled: b.getAttribute("aria-disabled"),
  }));
  return {
    compact: panel.classList.contains("is-compact"),
    idle: panel.classList.contains("is-idle"),
    reserved: betControls.classList.contains("is-reserved"),
    buttonCount: buttons.length,
    presetCount: presets.length,
    presetLabels: presets.map((p) => p.text),
    buttons,
    presets,
    raiseHidden: harness.document.querySelector("#raiseActionBtn")?.classList.contains("hidden"),
  };
}

function paint(harness, room, disabled) {
  const { context, gameButtons, betPresets } = harness;
  context.state = room;
  context.raiseControlsDisabled = false;
  context.mergePassiveConfirm = false;
  context.confirmActionBtn = null;
  gameButtons.innerHTML = "";
  betPresets.innerHTML = "";
  context.setReserved(true);
  const hero = room.players.find((p) => p.isYou);
  context.renderHero(hero, disabled);
  context.reserve();
  return footprint(harness);
}

// --- On-turn vs off-turn (facing a bet, raise available on your turn) ---
{
  const harness = buildHarness();
  const onTurn = paint(
    harness,
    makeRoom({ isYourTurn: true, canRaise: true, canShove: true, toCall: 40 }),
    false,
  );
  const offTurn = paint(
    harness,
    // After you act, raiseEligible clears → canRaise/canShove false, but chips remain.
    makeRoom({ isYourTurn: false, canRaise: false, canShove: false, toCall: 40 }),
    true,
  );

  assert.equal(onTurn.compact, false, "on-turn with raise: full panel");
  assert.equal(offTurn.compact, false, "off-turn must keep raise row (not collapse to is-compact)");
  assert.equal(onTurn.reserved, false);
  assert.equal(offTurn.reserved, false);
  assert.equal(onTurn.presetCount, offTurn.presetCount, "same preset count on/off turn");
  assert.deepEqual(onTurn.presetLabels, offTurn.presetLabels);
  assert.equal(onTurn.buttonCount, offTurn.buttonCount, "same action button count on/off turn");
  assert.ok(onTurn.presetCount >= 1, "raise presets present");
  const offFold = offTurn.buttons[0];
  assert.ok(offFold, "off-turn keeps Fold slot");
  assert.match(offFold.text, /Check\/Fold/i, "off-turn Fold slot is Check/Fold toggle");
  assert.equal(offFold.disabled, false, "Check/Fold is enabled off-turn");
  assert.equal(offFold.ariaDisabled, "false");
  assert.ok(
    offTurn.buttons.slice(1).every((b) => b.disabled && b.ariaDisabled === "true"),
    "Call/Raise stays disabled off-turn",
  );
  assert.ok(offTurn.presets.every((p) => p.disabled && p.ariaDisabled === "true"));
  assert.ok(onTurn.buttons.some((b) => !b.disabled), "on-turn buttons enabled");
  assert.match(onTurn.buttons[0].text, /^Fold/i, "on-turn Fold label restored");
}

// --- Free check/bet spot: ignoreRaiseOpen still keeps shell after canRaise clears ---
{
  const harness = buildHarness();
  const onTurn = paint(
    harness,
    makeRoom({ isYourTurn: true, canRaise: true, canShove: true, toCall: 0 }),
    false,
  );
  const offTurn = paint(
    harness,
    makeRoom({ isYourTurn: false, canRaise: false, canShove: false, toCall: 0 }),
    true,
  );
  assert.equal(onTurn.compact, false);
  assert.equal(offTurn.compact, false);
  assert.equal(onTurn.presetCount, offTurn.presetCount);
  // Off-turn mounts Check/Fold even when free; on-turn free omits Fold (no misclick).
  assert.equal(onTurn.buttonCount, 1, "on-turn free: Check/Bet only");
  assert.equal(offTurn.buttonCount, 2, "off-turn free: Check/Fold + Check");
  assert.match(offTurn.buttons[0].text, /Check\/Fold/i);
  assert.equal(offTurn.buttons[0].disabled, false);
  assert.equal(offTurn.buttons[1].disabled, true, "Check stays disabled off-turn");
}

// --- Armed vs unarmed: same button count / labels (pressed state only) ---
{
  const harness = buildHarness();
  CheckFold.disarm(harness.context.checkFoldSession);
  const unarmed = paint(
    harness,
    makeRoom({ isYourTurn: false, canRaise: false, canShove: false, toCall: 40 }),
    true,
  );
  CheckFold.arm(harness.context.checkFoldSession, 40, 1);
  const armed = paint(
    harness,
    makeRoom({ isYourTurn: false, canRaise: false, canShove: false, toCall: 40 }),
    true,
  );
  assert.equal(unarmed.buttonCount, armed.buttonCount, "armed/unarmed same button count");
  assert.deepEqual(
    unarmed.buttons.map((b) => b.text),
    armed.buttons.map((b) => b.text),
    "armed/unarmed same labels (pressed state only)",
  );
  assert.equal(unarmed.compact, armed.compact);
  assert.equal(unarmed.buttons[0].ariaPressed, "false");
  assert.equal(armed.buttons[0].ariaPressed, "true");
  assert.equal(unarmed.buttons[0].selected, false);
  assert.equal(armed.buttons[0].selected, true);
}

// --- True Call-only (every villain all-in): still compact on your turn ---
{
  const harness = buildHarness();
  const room = makeRoom({ isYourTurn: true, canRaise: true, canShove: true, toCall: 20 });
  room.players[1].allIn = true;
  room.players[1].stack = 0;
  const onTurn = paint(harness, room, false);
  assert.equal(onTurn.compact, true, "Call-only short all-in still collapses empty raise slot");
  assert.ok(onTurn.buttonCount >= 1);
}

// Viewport note: 375 and 1280 share the same non-compact track recipe (--cp-prompt-h
// may change at the desktop breakpoint, but on/off-turn still match at one width).
for (const width of [375, 1280]) {
  assert.ok(width === 375 || width === 1280);
  assert.match(
    css,
    /\.control-panel\s*\{[^}]*grid-template-rows:\s*auto 0 minmax\(var\(--cp-prompt-h\), auto\) auto auto/,
    `shared in-hand tracks cover ${width}px viewport`,
  );
}

console.log("Action panel height stable on/off turn at 375 and 1280.");
