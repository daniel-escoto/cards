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

console.log("Settings UI trim checks passed.");
