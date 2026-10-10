(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ReadyClock = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function readyPhaseActive(phase) {
    return phase === "lobby" || phase === "complete";
  }

  /**
   * Not-yet-ready human seats show the same countdown chrome as the shot clock.
   * Bots / sitting-out / empty stacks never arm a ready clock.
   */
  function seatShowsReadyClock(player, { readyEndsAt, phase } = {}) {
    if (!readyEndsAt || !readyPhaseActive(phase) || !player) return false;
    if (player.isBot || player.sittingOut || player.ready) return false;
    return Number(player.stack) > 0;
  }

  function readySecondsRemaining(readyEndsAt, now) {
    const ends = Number(readyEndsAt);
    const clock = Number(now);
    if (!Number.isFinite(ends) || !Number.isFinite(clock)) return 0;
    return Math.max(0, Math.ceil((ends - clock) / 1000));
  }

  function readyPctRemaining(readyEndsAt, readyTimeLimitMs, now) {
    const limit = Number(readyTimeLimitMs) || 0;
    const ends = Number(readyEndsAt);
    const clock = Number(now);
    if (!(limit > 0) || !Number.isFinite(ends) || !Number.isFinite(clock)) return 0;
    return Math.max(0, Math.min(1, (ends - clock) / limit));
  }

  return {
    readyPhaseActive,
    seatShowsReadyClock,
    readySecondsRemaining,
    readyPctRemaining,
  };
});
