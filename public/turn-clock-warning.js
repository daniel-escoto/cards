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
    };
  }

  function resetLowTimeSession(session) {
    if (!session) return;
    session.turnEndsAt = null;
    session.lastSeenTickSecond = null;
    session.armed = false;
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

    if (session.turnEndsAt !== ends) {
      session.turnEndsAt = ends;
      session.lastSeenTickSecond = null;
      session.armed = false;
    }

    const rem = remainingMs(ends, now);
    const threshold = Number(thresholdMs) || LOW_TIME_MS;

    if (rem > threshold) {
      // Still above the warning window — arm so entry into low time can tick.
      session.lastSeenTickSecond = null;
      session.armed = true;
      return null;
    }

    if (!(rem > 0)) {
      // Expired — stop immediately; next deadline gets a fresh session via turnEndsAt change.
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

  return {
    LOW_TIME_MS,
    remainingMs,
    isLowTime,
    lowTimeTickSecond,
    createLowTimeSession,
    resetLowTimeSession,
    consumeLowTimeTick,
  };
});
