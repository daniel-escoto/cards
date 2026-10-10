const assert = require("node:assert/strict");
const {
  CANONICAL_ORIGIN,
  isProductionInviteHost,
  canonicalInviteUrl,
} = require("../dist/public/invite-url");

assert.equal(CANONICAL_ORIGIN, "https://holdem.nyc");

// --- Production hosts → canonical holdem.nyc ---
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
    canonicalInviteUrl("ABCD", { hostname: host, origin: `https://${host}`, pathname: "/table" }),
    "https://holdem.nyc/?room=ABCD",
    `${host} invite ignores pathname and uses canonical domain`,
  );
}

// Extra query params / hash must be dropped on production.
assert.equal(
  canonicalInviteUrl("ZX9K", "https://floproom.com/play?utm=1&room=OLD#seat"),
  "https://holdem.nyc/?room=ZX9K",
);

// --- Dev / unknown hosts keep current origin ---
for (const host of ["localhost", "127.0.0.1", "192.168.1.20", "dev.example.com"]) {
  assert.equal(isProductionInviteHost(host), false, `${host} is not production`);
}

assert.equal(
  canonicalInviteUrl("ROOM1", {
    hostname: "localhost",
    origin: "http://localhost:3000",
    pathname: "/",
  }),
  "http://localhost:3000/?room=ROOM1",
);

assert.equal(
  canonicalInviteUrl("ROOM2", {
    hostname: "127.0.0.1",
    origin: "http://127.0.0.1:4173",
    pathname: "/app/",
  }),
  "http://127.0.0.1:4173/app/?room=ROOM2",
);

// Extra query params dropped on localhost too.
assert.equal(
  canonicalInviteUrl("ROOM3", "http://localhost:3000/?foo=1&room=OLD#x"),
  "http://localhost:3000/?room=ROOM3",
);

// Bare hostname helper (tests / convenience).
assert.equal(
  canonicalInviteUrl("CODE", "holdem-production-b0fc.up.railway.app"),
  "https://holdem.nyc/?room=CODE",
);

console.log("Invite URL helper checks passed.");
