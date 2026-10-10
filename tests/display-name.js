const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const engine = require("../shared/engine");
const { createPracticeSession } = require("../public/practice");

// --- Server / engine name cleaning -------------------------------------------
assert.equal(engine.cleanName("  Bobby  "), "Bobby");
assert.equal(engine.cleanName("😀Poker"), "😀Poker");
assert.equal(engine.cleanName("A".repeat(40)), "A".repeat(18));
assert.equal(engine.cleanName("   "), "Player");
assert.equal(engine.cleanName(""), "Player");
assert.equal(engine.cleanName(null), "Player");

{
  const session = createPracticeSession({
    name: "Hero",
    smallBlind: 5,
    bigBlind: 10,
  });
  const before = session.snapshot();
  const heroId = before.players.find((player) => player.isYou).id;
  const result = session.handle("player:setName", { name: "  New Name  " });
  assert.equal(result.ok, true);
  const after = session.snapshot();
  const hero = after.players.find((player) => player.id === heroId);
  assert.equal(hero.name, "New Name");
  assert.equal(after.players.filter((player) => player.name === "New Name").length, 1);
  session.dispose();
}

// --- In-table Save button (DOM click / pointerdown, not Enter) ---------------
function loadAppDom() {
  const html = fs
    .readFileSync(path.join(__dirname, "../public/index.html"), "utf8")
    .replace(/<script src="[^"]+"><\/script>/g, "");
  const emits = [];
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
      window.io = () => {
        const socket = {
          on() {},
          emit() {},
          timeout() {
            return {
              emit(event, payload, cb) {
                emits.push({ event, payload: JSON.parse(JSON.stringify(payload)) });
                cb?.(null, { ok: true });
              },
            };
          },
          connected: true,
          id: "sock-test",
        };
        window.__socket = socket;
        return socket;
      };
      window.CardArt = { render: () => "", layouts: {} };
      window.HoldemEngine = {};
      window.PracticeSession = {};
      window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    },
  });
  // Load client modules in the same order as index.html (classic scripts share var/function globals).
  const clientScripts = [
    "app-sounds.js",
    "app-format.js",
    "app-keybinds.js",
    "app-boot.js",
    "app-table.js",
    "app-events.js",
  ];
  for (const file of clientScripts) {
    const script = dom.window.document.createElement("script");
    script.textContent = fs.readFileSync(path.join(__dirname, "../public", file), "utf8");
    dom.window.document.body.appendChild(script);
  }
  return { window: dom.window, document: dom.window.document, emits };
}

function mountNameForm(document, name = "Alice") {
  const menuPlayers = document.querySelector("#menuPlayers");
  const gameMenuModal = document.querySelector("#gameMenuModal");
  menuPlayers.innerHTML = `
    <article class="menu-player you">
      <form class="menu-name-form" data-name-form>
        <label>
          Display name
          <input data-player-name maxlength="18" value="${name}" autocomplete="name" />
        </label>
        <button type="submit" class="secondary">Save</button>
      </form>
    </article>
  `;
  gameMenuModal.classList.remove("hidden");
  return {
    form: menuPlayers.querySelector("[data-name-form]"),
    input: menuPlayers.querySelector("[data-player-name]"),
    button: menuPlayers.querySelector("button[type='submit']"),
    menuPlayers,
  };
}

{
  const { window, document, emits } = loadAppDom();
  const { input, button, menuPlayers } = mountNameForm(document, "Alice");
  input.focus();
  input.value = "Alice Renamed";

  // Reproduce the failure mode: after the control is pressed, a menu refresh
  // replaces the form (as the 1s timer / room:update did when focus left the input).
  button.dispatchEvent(
    new window.PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
  menuPlayers.innerHTML = "<p>re-rendered</p>";

  assert.equal(
    emits.length,
    1,
    "Save pointerdown must emit before a re-render can tear down the button",
  );
  assert.deepEqual(emits[0], { event: "player:setName", payload: { name: "Alice Renamed" } });
  assert.equal(window.localStorage.getItem("holdem:name"), "Alice Renamed");
  assert.equal(document.querySelector("#nameInput").value, "Alice Renamed");
}

{
  const { document, emits } = loadAppDom();
  const { form, input } = mountNameForm(document, "Bob");
  input.focus();
  input.value = "Bobby";
  form.requestSubmit();
  assert.equal(emits.length, 1, "Enter / form submit uses the same save path");
  assert.deepEqual(emits[0], { event: "player:setName", payload: { name: "Bobby" } });
}

{
  const { document, emits } = loadAppDom();
  const { input, button } = mountNameForm(document, "Carol");
  input.focus();
  input.value = "Carol Clicked";
  // Prefer a real click() on the Save button — not keyboard Enter.
  button.click();
  assert.ok(
    emits.some((item) => item.event === "player:setName" && item.payload.name === "Carol Clicked"),
    "button.click() on Save must persist the display name",
  );
}

{
  const { window, document, emits } = loadAppDom();
  const { input, button } = mountNameForm(document, "Dave");
  input.focus();
  input.value = "   ";
  button.dispatchEvent(
    new window.PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
  assert.equal(emits.length, 0, "blank names must not be sent");
  const toast = document.querySelector("#toast");
  assert.equal(toast.classList.contains("hidden"), false, "blank names show an error toast");
  assert.match(toast.textContent, /display name/i);
}

{
  // Lobby host/join still submits the shared #nameInput (no separate Save control).
  const { document } = loadAppDom();
  const nameInput = document.querySelector("#nameInput");
  const joinForm = document.querySelector("#joinForm");
  assert.ok(nameInput);
  assert.ok(joinForm);
  assert.equal(joinForm.contains(nameInput), true);
  assert.ok(document.querySelector("#tableActionBtn")?.type === "submit");
}

// --- Online broadcast: peers see the renamed player ---------------------------
(async () => {
  const { io } = require("socket.io-client");
  const { server, rooms } = require("../server");

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  function connect(name) {
    const socket = io(url, { transports: ["websocket"], forceNew: true });
    const player = { socket, name, deviceId: `dn-${name}-${Date.now()}`, state: null };
    socket.on("room:update", (state) => {
      player.state = state;
    });
    return player;
  }
  async function wait(check, label) {
    for (let i = 0; i < 200; i++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`timeout: ${label}`);
  }
  function emit(socket, event, payload = {}) {
    return new Promise((resolve, reject) => {
      socket
        .timeout(4000)
        .emit(event, payload, (err, result) => (err ? reject(err) : resolve(result)));
    });
  }

  const alice = connect("Alice");
  const bob = connect("Bob");
  await wait(() => alice.socket.connected && bob.socket.connected, "connect");
  const created = await emit(alice.socket, "room:create", {
    name: "Alice",
    deviceId: alice.deviceId,
  });
  assert.equal(created.ok, true);
  await emit(bob.socket, "room:join", {
    roomId: created.roomId,
    name: "Bob",
    deviceId: bob.deviceId,
  });
  await wait(() => alice.state?.players?.length === 2, "bob joined");

  const renamed = await emit(bob.socket, "player:setName", { name: "  Bobby Tables  " });
  assert.equal(renamed.ok, true);
  await wait(
    () => alice.state?.players?.some((player) => player.name === "Bobby Tables"),
    "alice sees rename",
  );
  await wait(
    () => bob.state?.players?.find((player) => player.isYou)?.name === "Bobby Tables",
    "bob sees own rename",
  );

  // No uniqueness rule — duplicates / case variants are allowed.
  const dup = await emit(alice.socket, "player:setName", { name: "bobby tables" });
  assert.equal(dup.ok, true);
  await wait(
    () =>
      bob.state?.players?.filter((player) => player.name.toLowerCase() === "bobby tables")
        .length === 2,
    "duplicate names ok",
  );

  const long = await emit(bob.socket, "player:setName", { name: "X".repeat(40) });
  assert.equal(long.ok, true);
  await wait(
    () => alice.state?.players?.some((player) => player.name === "X".repeat(18)),
    "max length trim",
  );

  const emoji = await emit(bob.socket, "player:setName", { name: "♠️Queen" });
  assert.equal(emoji.ok, true);
  await wait(
    () => alice.state?.players?.some((player) => player.name === "♠️Queen"),
    "unicode name",
  );

  alice.socket.close();
  bob.socket.close();
  await new Promise((resolve) => server.close(resolve));
  rooms.clear();
  console.log("Display name save checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
