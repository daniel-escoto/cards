(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TurnClockWarning = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Remaining time at or below this is "low time" (inclusive). */
  const LOW_TIME_MS = 5000;

  function remainingMs(turnEndsAt, now) {
    const ends = Number(turnEndsAt);
    const clock = Number(now);
    if (!Number.isFinite(ends) || !Number.isFinite(clock)) return 0;
    return ends - clock;
  }

  /**
   * True when the shot clock is in the last `thresholdMs` and has not expired.
   * Derive from absolute turnEndsAt + injectable now — never a local countdown started on load.
   */
  function isLowTime(turnEndsAt, now, thresholdMs = LOW_TIME_MS) {
    const rem = remainingMs(turnEndsAt, now);
    const threshold = Number(thresholdMs);
    if (!(rem > 0) || !Number.isFinite(threshold) || threshold <= 0) return false;
    return rem <= threshold;
  }

  /** Whole-second bucket still on the clock (matches Math.ceil display). */
  function lowTimeTickSecond(turnEndsAt, now, thresholdMs = LOW_TIME_MS) {
    if (!isLowTime(turnEndsAt, now, thresholdMs)) return null;
    const rem = remainingMs(turnEndsAt, now);
    const tickSecond = Math.ceil(rem / 1000);
    const maxTick = Math.ceil(Number(thresholdMs) / 1000);
    if (tickSecond < 1 || tickSecond > maxTick) return null;
    return tickSecond;
  }

  function createLowTimeSession() {
    return {
      turnEndsAt: null,
      lastSeenTickSecond: null,
      /** False until the first observation of a deadline; prevents reconnect catch-up ticks. */
      armed: false,
      /** True once this client observed rem > 0 for the current deadline. */
      sawActive: false,
      /** True once the timeout cue was consumed for the current deadline. */
      timeoutConsumed: false,
    };
  }

  function resetLowTimeSession(session) {
    if (!session) return;
    session.turnEndsAt = null;
    session.lastSeenTickSecond = null;
    session.armed = false;
    session.sawActive = false;
    session.timeoutConsumed = false;
  }

  function syncDeadlineIdentity(session, ends) {
    if (session.turnEndsAt === ends) return;
    session.turnEndsAt = ends;
    session.lastSeenTickSecond = null;
    session.armed = false;
    session.sawActive = false;
    session.timeoutConsumed = false;
  }

  /**
   * Advance tick state for one poll. Returns the second (1..5) to tick, or null.
   *
   * Rules:
   * - Only while remaining is in (0, thresholdMs].
   * - At most one tick per whole-second bucket per turnEndsAt.
   * - First observation after a mid-window join/refresh does not tick (no double/catch-up ticks).
   * - Watching from above the threshold arms the session so the 5s entry does tick.
   * - Changing or clearing turnEndsAt resets (street/hand change / act / expire).
   */
  function consumeLowTimeTick(session, { turnEndsAt, now, thresholdMs = LOW_TIME_MS } = {}) {
    if (!session) return null;

    const ends = Number(turnEndsAt);
    if (!Number.isFinite(ends) || ends <= 0) {
      resetLowTimeSession(session);
      return null;
    }

    syncDeadlineIdentity(session, ends);

    const rem = remainingMs(ends, now);
    const threshold = Number(thresholdMs) || LOW_TIME_MS;

    if (rem > 0) session.sawActive = true;

    if (rem > threshold) {
      // Still above the warning window — arm so entry into low time can tick.
      session.lastSeenTickSecond = null;
      session.armed = true;
      return null;
    }

    if (!(rem > 0)) {
      // Expired — stop ticks; timeout is handled separately via consumeDeadlineTimeout.
      session.lastSeenTickSecond = null;
      session.armed = false;
      return null;
    }

    const tickSecond = lowTimeTickSecond(ends, now, threshold);
    if (tickSecond == null) return null;

    if (!session.armed) {
      // Mid-window reconnect/refresh: adopt the current second without playing it.
      session.lastSeenTickSecond = tickSecond;
      session.armed = true;
      return null;
    }

    if (session.lastSeenTickSecond === tickSecond) return null;

    if (session.lastSeenTickSecond != null && tickSecond > session.lastSeenTickSecond) {
      // Clock skew jumped remaining upward — adopt without spamming ticks.
      session.lastSeenTickSecond = tickSecond;
      return null;
    }

    session.lastSeenTickSecond = tickSecond;
    return tickSecond;
  }

  /**
   * Returns true exactly once when a deadline this client previously observed as
   * still-active (rem > 0) is now at or past expiry.
   *
   * - Pass the live `turnEndsAt` while the clock is running, or `null` when the
   *   server clears it (act / sit-out / hand start).
   * - Early clear before the deadline does not fire.
   * - Mid-join after expiry (never saw rem > 0) does not fire — no refresh catch-up.
   * - At most one timeout per absolute deadline value.
   */
  function consumeDeadlineTimeout(session, { turnEndsAt, now } = {}) {
    if (!session) return false;

    const clock = Number(now);
    const ends = Number(turnEndsAt);
    const hasEnds = Number.isFinite(ends) && ends > 0;

    if (!hasEnds) {
      const previousEnds = Number(session.turnEndsAt);
      const shouldFire = Boolean(
        Number.isFinite(previousEnds)
        && previousEnds > 0
        && session.sawActive
        && !session.timeoutConsumed
        && Number.isFinite(clock)
        && clock >= previousEnds,
      );
      if (shouldFire) session.timeoutConsumed = true;
      resetLowTimeSession(session);
      return shouldFire;
    }

    // Deadline identity changed: resolve timeout for the previous absolute deadline first.
    if (session.turnEndsAt != null && session.turnEndsAt !== ends) {
      const previousEnds = Number(session.turnEndsAt);
      const shouldFire = Boolean(
        Number.isFinite(previousEnds)
        && previousEnds > 0
        && session.sawActive
        && !session.timeoutConsumed
        && Number.isFinite(clock)
        && clock >= previousEnds,
      );
      syncDeadlineIdentity(session, ends);
      if (shouldFire) {
        // Previous deadline timed out; adopt the new deadline without also
        // evaluating it in this same poll (next poll handles the new clock).
        return true;
      }
    } else {
      syncDeadlineIdentity(session, ends);
    }

    const rem = remainingMs(ends, clock);
    if (rem > 0) {
      session.sawActive = true;
      return false;
    }

    if (!session.sawActive || session.timeoutConsumed) return false;
    session.timeoutConsumed = true;
    return true;
  }

  return {
    LOW_TIME_MS,
    remainingMs,
    isLowTime,
    lowTimeTickSecond,
    createLowTimeSession,
    resetLowTimeSession,
    consumeLowTimeTick,
    consumeDeadlineTimeout,
  };
});
