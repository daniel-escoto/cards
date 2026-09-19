const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Exercise the actual browser listener with DOM/socket boundaries stubbed.
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const listener = source.slice(source.indexOf('document.addEventListener("keydown",'));
const messages = [];
let handler;
let menuOpen = false;
const bindings = { call: "c", ready: " ", fold: "f" };
const context = {
  document: { addEventListener: (name, callback) => { handler = callback; } },
  recordingKeybindAction: "",
  mergePassiveConfirm: false,
  atPassiveDetent: () => true,
  raiseState: { value: 100 },
  state: { canReady: true, isReady: false, isYourTurn: false },
  gameMenuModal: { classList: { contains: () => !menuOpen } },
  matchesKeybind: (event, action) => event.key === bindings[action],
  emitWithAck: (event, payload) => messages.push({ event, payload: JSON.parse(JSON.stringify(payload)) }),
};
vm.runInNewContext(listener, context);
function press(key, options = {}) {
  let prevented = false;
  handler({ key, repeat: false, target: { matches: () => false }, preventDefault: () => { prevented = true; }, ...options });
  return prevented;
}
assert(press("c"));
assert.deepEqual(messages.pop(), { event: "game:ready", payload: { ready: true } });
context.state.isReady = true;
press("c");
assert.equal(messages.length, 0, "Check must not unready a player");
context.state.isReady = false;
press("c", { repeat: true });
press("c", { ctrlKey: true });
press("c", { target: { matches: () => true } });
menuOpen = true;
press("c");
menuOpen = false;
assert.equal(messages.length, 0, "Ignore held keys, editing, modifiers, and the menu");
bindings.call = "x";
press("c");
assert.equal(messages.length, 0);
press("x");
assert.equal(messages.pop().event, "game:ready", "Honor custom bindings");
press(" ");
assert.deepEqual(messages.pop(), { event: "game:ready", payload: {} }, "Keep the dedicated ready toggle");
context.state = { canReady: false, isYourTurn: true, toCall: 0 };
press("x");
assert.deepEqual(messages.pop(), { event: "game:action", payload: { type: "check" } });
context.state.toCall = 20;
press("x");
assert.deepEqual(messages.pop(), { event: "game:action", payload: { type: "call" } });
context.mergePassiveConfirm = true;
press("x");
assert.deepEqual(messages.pop(), { event: "game:action", payload: { type: "call" } });
context.atPassiveDetent = () => false;
press("x");
assert.deepEqual(messages.pop(), { event: "game:action", payload: { type: "raise", raiseTo: 100 } });
context.state.isYourTurn = false;
press("x");
assert.equal(messages.length, 0, "Do not act outside the player's turn");
console.log("Check/call/ready keyboard checks passed.");
