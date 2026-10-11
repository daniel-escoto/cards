// Client side of the rabbit hunt: face-down board slots are tappable placeholders
// (no card data), reveal via tap / Enter / Space / the "b" shortcut, once.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// 1. Face-down slot markup: button semantics, accessible label, hint on the first slot only,
//    and no card data at all.
{
  const source = fs.readFileSync(require.resolve("../dist/public/app-table.js"), "utf8");
  const start = source.indexOf("function rabbitFaceDownTemplate(");
  assert.ok(start >= 0, "rabbitFaceDownTemplate exists");
  const end = source.indexOf("\nfunction ", start + 10);
  const context = {
    keybinds: { showBoard: "b" },
    keybindLabel: (key) => (key ? key.toUpperCase() : ""),
    escapeHtml: (value) => String(value).replace(/"/g, "&quot;"),
  };
  vm.runInNewContext(
    `${source.slice(start, end)}\nthis.template = rabbitFaceDownTemplate;`,
    context,
  );
  const first = context.template(true);
  const other = context.template(false);
  for (const html of [first, other]) {
    assert.match(html, /role="button"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /data-rabbit-reveal/);
    assert.match(html, /aria-label="Show the rest of the board \(B\)"/);
    assert.match(html, /class="card back rabbit-facedown/);
    assert.doesNotMatch(html, /[2-9TJQKA][shdc♠♥♦♣]|card-rank|data-code/, "no card data");
  }
  assert.match(first, /rabbit-hint/);
  assert.doesNotMatch(other, /rabbit-hint/);
}

// 2. Keyboard + tap flow through the real listener (DOM / socket stubbed).
{
  const source = fs.readFileSync(require.resolve("../dist/public/app-events.js"), "utf8");
  const listener = source.slice(source.indexOf('document.addEventListener("keydown",'));
  const messages = [];
  let handler;
  const cards = [0, 1, 2].map(() => {
    const attrs = {};
    return {
      attrs,
      setAttribute: (name, value) => {
        attrs[name] = value;
      },
      getAttribute: (name) => attrs[name] ?? null,
    };
  });
  const context = {
    document: { addEventListener: (_name, callback) => (handler = callback) },
    recordingKeybindAction: "",
    state: { canReady: false, isReady: false, isYourTurn: false, canRabbitHunt: true },
    gameMenuModal: { classList: { contains: () => true } },
    community: {
      querySelectorAll: () => ({
        length: cards.length,
        0: cards[0],
        forEach: (fn) => cards.forEach(fn),
      }),
    },
    matchesKeybind: (event, action) => action === "showBoard" && event.key === "b",
    emitWithAck: (event, payload) => messages.push({ event, payload }),
  };
  vm.runInNewContext(listener, context);
  const press = (key, target = { matches: () => false }) => {
    let prevented = false;
    handler({ key, repeat: false, target, preventDefault: () => (prevented = true) });
    return prevented;
  };

  context.state.canRabbitHunt = false;
  press("b");
  assert.equal(messages.length, 0, "shortcut does nothing when not eligible");

  context.state.canRabbitHunt = true;
  press("b");
  assert.deepEqual(
    messages.map((message) => message.event),
    ["game:rabbitHunt"],
    "shortcut reveals",
  );
  assert.ok(
    cards.every((card) => card.attrs["aria-disabled"] === "true"),
    "slots disable on tap",
  );
  press("b");
  assert.equal(messages.length, 1, "only once");

  // Enter / Space on a focused face-down slot.
  for (const card of cards) delete card.attrs["aria-disabled"];
  const focused = {
    matches: () => false,
    closest: (selector) => (selector === "[data-rabbit-reveal]" ? cards[1] : null),
  };
  assert.equal(press("Enter", focused), true, "Enter is handled");
  assert.equal(messages.length, 2);
  for (const card of cards) delete card.attrs["aria-disabled"];
  assert.equal(press(" ", focused), true, "Space is handled");
  assert.equal(messages.length, 3);
  assert.equal(press("x", focused), false, "other keys ignored");
  assert.equal(messages.length, 3);
}

// 3. A tap/click on any face-down slot reveals (listener on the board itself).
{
  const source = fs.readFileSync(require.resolve("../dist/public/app-events.js"), "utf8");
  const start = source.indexOf('community.addEventListener("click"');
  assert.ok(start >= 0, "board click listener exists");
  const end = source.indexOf("});", start) + 3;
  let clickHandler;
  let reveals = 0;
  vm.runInNewContext(source.slice(start, end), {
    community: { addEventListener: (_name, callback) => (clickHandler = callback) },
    revealRabbitBoard: () => (reveals += 1),
  });
  clickHandler({ target: { closest: () => ({}) } });
  assert.equal(reveals, 1, "tap on a face-down slot reveals");
  clickHandler({ target: { closest: () => null } });
  assert.equal(reveals, 1, "tap on a real card does nothing");
}

console.log("Rabbit hunt client checks passed.");
