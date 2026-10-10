(function (
  root: typeof globalThis & { ReadyClock?: ReadyClockAPI },
  factory: () => ReadyClockAPI,
) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ReadyClock = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis), function () {
  "use strict";

  function readyPhaseActive(phase: unknown) {
    return phase === "lobby" || phase === "complete";
  }

  /**
   * Not-yet-ready human seats show the same countdown chrome as the shot clock.
   * Bots / sitting-out / empty stacks never arm a ready clock.
   */
  function seatShowsReadyClock(
    player: ClientPlayer | null | undefined,
    { readyEndsAt, phase }: { readyEndsAt?: unknown; phase?: unknown } = {},
  ) {
    if (!readyEndsAt || !readyPhaseActive(phase) || !player) return false;
    if (player.isBot || player.sittingOut || player.ready) return false;
    return Number(player.stack) > 0;
  }

  function readySecondsRemaining(readyEndsAt: unknown, now: unknown) {
    const ends = Number(readyEndsAt);
    const clock = Number(now);
    if (!Number.isFinite(ends) || !Number.isFinite(clock)) return 0;
    return Math.max(0, Math.ceil((ends - clock) / 1000));
  }

  function readyPctRemaining(readyEndsAt: unknown, readyTimeLimitMs: unknown, now: unknown) {
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
