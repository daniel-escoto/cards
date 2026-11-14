const assert = require("node:assert/strict");
const {
  CANONICAL_ORIGIN,
  isProductionInviteHost,
  canonicalInviteUrl,
  roomCodeFromPath,
  isRoomCodePath,
  normalizeRoomCode,
} = require("../dist/public/invite-url");

assert.equal(CANONICAL_ORIGIN, "https://holdem.nyc");

// --- Production hosts → canonical holdem.nyc/{CODE} ---
for (const host of [
  "holdem.nyc",
  "www.holdem.nyc",
  "floproom.com",
  "www.floproom.com",
  "holdem-production-b0fc.up.railway.app",
  "cards-staging.up.railway.app",
]) {
  assert.equal(isProductionInviteHost(host), true, `${host} is a production invite host`);
  assert.equal(
    canonicalInviteUrl("ABCD12", { hostname: host, origin: `https://${host}`, pathname: "/table" }),
    "https://holdem.nyc/ABCD12",
    `${host} invite ignores pathname and uses canonical short URL`,
  );
}

// Extra query params / hash must be dropped on production.
assert.equal(
  canonicalInviteUrl("ZX9K2A", "https://floproom.com/play?utm=1&room=OLD#seat"),
  "https://holdem.nyc/ZX9K2A",
);

// --- Dev / unknown hosts keep current origin with /{CODE} ---
for (const host of ["localhost", "127.0.0.1", "192.168.1.20", "dev.example.com"]) {
  assert.equal(isProductionInviteHost(host), false, `${host} is not production`);
}

assert.equal(
  canonicalInviteUrl("ROOM1A", {
    hostname: "localhost",
    origin: "http://localhost:3000",
    pathname: "/",
  }),
  "http://localhost:3000/ROOM1A",
);

assert.equal(
  canonicalInviteUrl("ROOM2B", {
    hostname: "127.0.0.1",
    origin: "http://127.0.0.1:4173",
    pathname: "/app/",
  }),
  "http://127.0.0.1:4173/ROOM2B",
);

// Extra query params dropped on localhost too.
assert.equal(
  canonicalInviteUrl("ROOM3C", "http://localhost:3000/?foo=1&room=OLD#x"),
  "http://localhost:3000/ROOM3C",
);

// Bare hostname helper (tests / convenience).
assert.equal(
  canonicalInviteUrl("CODE99", "holdem-production-b0fc.up.railway.app"),
  "https://holdem.nyc/CODE99",
);

// Path parsing for short links.
assert.equal(roomCodeFromPath("/LL3RJF"), "LL3RJF");
assert.equal(roomCodeFromPath("/ll3rjf/"), "LL3RJF");
assert.equal(roomCodeFromPath("/trainer"), "");
assert.equal(roomCodeFromPath("/"), "");
assert.equal(isRoomCodePath("/Ab12Cd"), true);
assert.equal(isRoomCodePath("/styles.css"), false);
assert.equal(normalizeRoomCode(" ab-12 "), "AB12");

console.log("Invite URL helper checks passed.");
