const assert = require("node:assert/strict");
const {
  readyPhaseActive,
  seatShowsReadyClock,
  readySecondsRemaining,
  readyPctRemaining,
} = require("../dist/public/ready-clock");

assert.equal(readyPhaseActive("lobby"), true);
assert.equal(readyPhaseActive("complete"), true);
assert.equal(readyPhaseActive("preflop"), false);
assert.equal(readyPhaseActive("showdown"), false);

const ends = 1_000_000;
const human = { isBot: false, sittingOut: false, ready: false, stack: 1000 };
assert.equal(seatShowsReadyClock(human, { readyEndsAt: ends, phase: "complete" }), true);
assert.equal(
  seatShowsReadyClock({ ...human, ready: true }, { readyEndsAt: ends, phase: "complete" }),
  false,
);
assert.equal(
  seatShowsReadyClock({ ...human, isBot: true }, { readyEndsAt: ends, phase: "complete" }),
  false,
);
assert.equal(
  seatShowsReadyClock({ ...human, sittingOut: true }, { readyEndsAt: ends, phase: "complete" }),
  false,
);
assert.equal(
  seatShowsReadyClock({ ...human, stack: 0 }, { readyEndsAt: ends, phase: "complete" }),
  false,
);
assert.equal(seatShowsReadyClock(human, { readyEndsAt: null, phase: "complete" }), false);
assert.equal(seatShowsReadyClock(human, { readyEndsAt: ends, phase: "preflop" }), false);
assert.equal(seatShowsReadyClock(null, { readyEndsAt: ends, phase: "lobby" }), false);

assert.equal(readySecondsRemaining(ends, ends - 20500), 21);
assert.equal(readySecondsRemaining(ends, ends - 20000), 20);
assert.equal(readySecondsRemaining(ends, ends - 1), 1);
assert.equal(readySecondsRemaining(ends, ends), 0);
assert.equal(readySecondsRemaining(null, ends), 0);

assert.equal(readyPctRemaining(ends, 20000, ends - 10000), 0.5);
assert.equal(readyPctRemaining(ends, 20000, ends), 0);
assert.equal(readyPctRemaining(ends, 20000, ends - 20000), 1);
assert.equal(readyPctRemaining(ends, 0, ends - 10000), 0);
assert.equal(readyPctRemaining(null, 20000, ends - 10000), 0);

console.log("Ready-clock UI helper checks passed.");
