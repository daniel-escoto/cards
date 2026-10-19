const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const boot = fs.readFileSync(path.join(__dirname, "../dist/public/app-boot.js"), "utf8");

{
  const dom = new JSDOM(html);
  const { document } = dom.window;

  assert.equal(document.querySelector("#feltChoices"), null, "felt picker removed from settings");
  assert.equal(document.querySelector("#deckChoices"), null, "deck picker removed from settings");
  assert.equal(document.querySelector("#keybindList"), null, "keybind editor removed from settings");
  assert.equal(document.querySelector("#resetKeybindsBtn"), null, "reset keybinds removed");
  assert.equal(document.querySelector("#shotClockCustomForm"), null, "custom shot clock form removed");
  assert.equal(document.querySelector("#readyTimerCustomForm"), null, "custom ready timer form removed");

  assert.ok(document.querySelector("#soundEnabledInput"), "sound toggle kept");
  assert.ok(document.querySelector("#menuNameForm"), "display name kept");
  assert.ok(document.querySelector("#moneyPanel"), "money panel kept");
  assert.ok(document.querySelector("#shotClockChoices"), "shot clock choices kept");
  assert.ok(document.querySelector("#readyTimerChoices"), "ready timer choices kept");
  assert.ok(document.querySelector("#rabbitHuntChoices"), "rabbit hunt kept");

  const soundCopy = document.querySelector(".sound-toggle .checkbox-copy");
  assert.ok(soundCopy, "sound label present");
  assert.equal(soundCopy.querySelector("small"), null, "sound subtitle trimmed");
}

{
  // Client timer presets match the trimmed host UI (no Custom path).
  assert.match(boot, /seconds:\s*30,\s*label:\s*"30s"/);
  assert.match(boot, /seconds:\s*60,\s*label:\s*"60s"/);
  assert.match(boot, /seconds:\s*120,\s*label:\s*"2m"/);
  assert.doesNotMatch(boot, /seconds:\s*15,\s*label:\s*"15s"/);
  assert.doesNotMatch(boot, /seconds:\s*90,\s*label:\s*"90s"/);
  assert.doesNotMatch(boot, /seconds:\s*300,\s*label:\s*"5m"/);
  assert.doesNotMatch(boot, /SHOT_CLOCK_CUSTOM/);
  assert.doesNotMatch(boot, /READY_TIMER_CUSTOM/);
  assert.doesNotMatch(boot, /seconds:\s*10,\s*label:\s*"10s"/);
  assert.match(boot, /timerChoicesForValue/);
}

{
  // Host controls live in Settings as a host-only "Table" section; no separate Host view.
  const dom = new JSDOM(html);
  const { document } = dom.window;
  assert.equal(document.querySelector("#openHostBtn"), null, "Host row removed from game menu");
  assert.equal(document.querySelector("#menuHostView"), null, "separate Host view removed");
  const settings = document.querySelector("#menuSettingsView");
  const table = document.querySelector("#settingsTableSection");
  assert.ok(table && settings.contains(table), "Table section is inside Settings");
  assert.equal(table.querySelector(".settings-section-title").textContent.trim(), "Table");
  for (const id of ["blindPanel", "shotClockPanel", "readyTimerPanel", "rabbitHuntPanel", "hostActionsPanel"]) {
    assert.ok(table.querySelector(`#${id}`), `${id} lives in the Table section`);
  }
  const name = document.querySelector("#menuNameForm");
  const sound = document.querySelector("#soundEnabledInput");
  assert.ok(!table.contains(name) && !table.contains(sound), "Name/Sound stay in the everyone section");
  assert.ok(
    name.compareDocumentPosition(table) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    "Table section sits below Name/Sound",
  );
}

{
  // The Table section appears / disappears live as host rights change.
  const vm = require("node:vm");
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const grab = (fn) => {
    const start = boot.indexOf(`function ${fn}(`);
    assert.ok(start >= 0, `${fn} exists`);
    const end = boot.indexOf("\nfunction ", start + 10);
    return boot.slice(start, end === -1 ? undefined : end);
  };
  const $ = (sel) => document.querySelector(sel);
  const context = {
    document,
    state: null,
    settingsTableSection: $("#settingsTableSection"),
    hostActionsPanel: $("#hostActionsPanel"),
    restartGameBtn: $("#restartGameBtn"),
    endGameBtn: $("#endGameBtn"),
    blindPanel: $("#blindPanel"),
    menuSmallBlindLabel: $("#menuSmallBlindLabel"),
    menuBigBlindLabel: $("#menuBigBlindLabel"),
    menuSmallBlindInput: $("#menuSmallBlindInput"),
    menuBigBlindInput: $("#menuBigBlindInput"),
    isSpectatorView: () => false,
    isOfflineSession: () => false,
  };
  vm.runInNewContext(`${grab("syncHostMenuSection")}\n${grab("syncBlindPanel")}\nthis.sync = syncHostMenuSection;`, context);
  const hostState = {
    phase: "preflop",
    canRestartGame: true,
    canEndGame: true,
    canChangeBlinds: true,
    canChangeShotClock: true,
    canChangeReadyTimer: true,
    canChangeRabbitHunt: true,
    moneyMode: false,
    smallBlind: 10,
    bigBlind: 20,
  };
  const guestState = { phase: "preflop", moneyMode: false, smallBlind: 10, bigBlind: 20 };

  context.state = guestState;
  context.sync();
  assert.ok(context.settingsTableSection.classList.contains("hidden"), "non-host: no Table section");

  context.state = hostState;
  context.sync();
  assert.ok(!context.settingsTableSection.classList.contains("hidden"), "host: Table section shown");
  assert.ok(!context.blindPanel.classList.contains("hidden"), "host: blinds shown");
  assert.equal(context.menuBigBlindInput.value, "20", "blind inputs filled when the section appears");

  context.state = guestState; // host handed over mid-game
  context.sync();
  assert.ok(context.settingsTableSection.classList.contains("hidden"), "Table section hides live");
}

console.log("Settings UI trim checks passed.");
