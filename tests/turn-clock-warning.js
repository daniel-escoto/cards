const assert = require("node:assert/strict");
const {
  LOW_TIME_MS,
  isLowTime,
  lowTimeTickSecond,
  createLowTimeSession,
  resetLowTimeSession,
  consumeLowTimeTick,
  consumeDeadlineTimeout,
} = require("../public/turn-clock-warning");

const ENDS = 1_000_000;

assert.equal(LOW_TIME_MS, 5000);

// --- isLowTime ---
assert.equal(isLowTime(ENDS, ENDS - 5000), true, "exactly 5s is low time");
assert.equal(isLowTime(ENDS, ENDS - 5001), false, "just over 5s is not low time");
assert.equal(isLowTime(ENDS, ENDS - 1), true, "fractional last second is low time");
assert.equal(isLowTime(ENDS, ENDS), false, "expired is not low time");
assert.equal(isLowTime(ENDS, ENDS + 10), false, "past deadline is not low time");
assert.equal(isLowTime(null, ENDS - 1000), false);
assert.equal(isLowTime(ENDS, ENDS - 3000, 2000), false, "custom threshold respected");
assert.equal(isLowTime(ENDS, ENDS - 1500, 2000), true);

// --- lowTimeTickSecond ---
assert.equal(lowTimeTickSecond(ENDS, ENDS - 5000), 5);
assert.equal(lowTimeTickSecond(ENDS, ENDS - 4001), 5);
assert.equal(lowTimeTickSecond(ENDS, ENDS - 4000), 4);
assert.equal(lowTimeTickSecond(ENDS, ENDS - 1), 1);
assert.equal(lowTimeTickSecond(ENDS, ENDS - 5001), null);
assert.equal(lowTimeTickSecond(ENDS, ENDS), null);

// --- consumeLowTimeTick: watch from above, then tick each second ---
{
  const session = createLowTimeSession();
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 8000 }), null);
  assert.equal(session.armed, true, "armed while still above threshold");
  assert.equal(session.sawActive, true);

  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 4999 }), 5);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 4500 }), null, "same second no double tick");
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 4000 }), 4);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 3000 }), 3);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 2000 }), 2);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 1000 }), 1);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 100 }), null, "still in second 1");
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS }), null, "expired stops");
}

// --- Mid-window reconnect/refresh: no catch-up ticks ---
{
  const session = createLowTimeSession();
  assert.equal(
    consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 3500 }),
    null,
    "first mid-window observation does not tick",
  );
  assert.equal(session.lastSeenTickSecond, 4);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 3200 }), null);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 3000 }), 3);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 2000 }), 2);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 1000 }), 1);
}

// --- New turnEndsAt (act / street / hand) resets immediately ---
{
  const session = createLowTimeSession();
  consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 8000 });
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 4500 }), 5);

  const nextEnds = ENDS + 30_000;
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: nextEnds, now: nextEnds - 4500 }), null, "new deadline mid-window skips");
  assert.equal(session.turnEndsAt, nextEnds);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: nextEnds, now: nextEnds - 4000 }), 4);
}

// --- Clearing turnEndsAt resets ---
{
  const session = createLowTimeSession();
  consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 8000 });
  consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 4500 });
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: null, now: ENDS - 3000 }), null);
  assert.equal(session.turnEndsAt, null);
  assert.equal(session.armed, false);
  resetLowTimeSession(session);
  assert.equal(session.lastSeenTickSecond, null);
}

// --- Injectable clock: rapid polls at exact boundaries ---
{
  const session = createLowTimeSession();
  let now = ENDS - 6000;
  const fired = [];
  for (let i = 0; i < 70; i += 1) {
    const tick = consumeLowTimeTick(session, { turnEndsAt: ENDS, now });
    if (tick != null) fired.push(tick);
    now += 100;
  }
  assert.deepEqual(fired, [5, 4, 3, 2, 1], "exactly one tick per second bucket");
}

// --- consumeDeadlineTimeout: fires once at expiry when previously active ---
{
  const session = createLowTimeSession();
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS - 2000 }), false);
  assert.equal(session.sawActive, true);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS - 1 }), false);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS }), true, "fires at exact deadline");
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS + 50 }), false, "no double timeout");
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS + 500 }), false);
}

// --- Timeout when server clears deadline after expiry ---
{
  const session = createLowTimeSession();
  consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS - 500 });
  assert.equal(
    consumeDeadlineTimeout(session, { turnEndsAt: null, now: ENDS + 20 }),
    true,
    "clear-after-expiry still fires once",
  );
  assert.equal(session.turnEndsAt, null);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: null, now: ENDS + 100 }), false);
}

// --- Early act/clear before deadline: no timeout ---
{
  const session = createLowTimeSession();
  consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS - 8000 });
  assert.equal(
    consumeDeadlineTimeout(session, { turnEndsAt: null, now: ENDS - 7000 }),
    false,
    "acting early must not play timeout",
  );
  assert.equal(session.sawActive, false);
}

// --- Mid-join after expiry / refresh: no catch-up timeout ---
{
  const session = createLowTimeSession();
  assert.equal(
    consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS + 100 }),
    false,
    "never saw active remaining — no timeout",
  );
  assert.equal(session.timeoutConsumed, false);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: null, now: ENDS + 200 }), false);
}

// --- New deadline after timeout does not replay old one ---
{
  const session = createLowTimeSession();
  consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS - 100 });
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS }), true);
  const nextEnds = ENDS + 30_000;
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: nextEnds, now: nextEnds - 1000 }), false);
  assert.equal(session.turnEndsAt, nextEnds);
  assert.equal(session.sawActive, true);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: nextEnds, now: nextEnds }), true);
}

// --- Deadline swap past previous expiry fires previous timeout once ---
{
  const session = createLowTimeSession();
  consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS - 100 });
  const nextEnds = ENDS + 30_000;
  assert.equal(
    consumeDeadlineTimeout(session, { turnEndsAt: nextEnds, now: ENDS + 10 }),
    true,
    "switching away after expiry surfaces the prior timeout",
  );
  assert.equal(session.turnEndsAt, nextEnds);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: nextEnds, now: ENDS + 20 }), false);
}

// --- Tick + timeout together across the final second ---
{
  const session = createLowTimeSession();
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 8000 }), null);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS - 8000 }), false);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS - 1000 }), 1);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS - 100 }), false);
  assert.equal(consumeLowTimeTick(session, { turnEndsAt: ENDS, now: ENDS }), null);
  assert.equal(consumeDeadlineTimeout(session, { turnEndsAt: ENDS, now: ENDS }), true);
}

console.log("Turn clock low-time warning checks passed.");
