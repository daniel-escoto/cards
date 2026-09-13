(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RaiseSizing = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Snap a raise-to amount onto a legal server value:
   * at least minRaiseTo (or all-in if the hero cannot make a full raise),
   * at most maxRaiseTo, on minRaiseTo + k*step when in between.
   */
  function legalRaiseTo(rawValue, { minRaiseTo, maxRaiseTo, step } = {}) {
    const max = Math.max(0, Math.floor(Number(maxRaiseTo) || 0));
    const requestedMin = Math.max(0, Math.floor(Number(minRaiseTo) || 0));
    const min = Math.min(max, requestedMin);
    const stride = Math.max(1, Math.floor(Number(step) || 1));

    let target = Math.floor(Number(rawValue));
    if (!Number.isFinite(target)) target = min;

    // Short all-in is the only legal raise when the stack cannot meet minRaiseTo.
    if (min >= max) return max;
    if (target <= min) return min;
    if (target >= max) return max;

    const snapped = min + Math.round((target - min) / stride) * stride;
    if (snapped <= min) return min;
    if (snapped >= max) return max;
    return snapped;
  }

  /** Raw raise-to before legality clamping: currentBet + max(bb, fraction * pot). */
  function potPresetRaiseTo({ pot, currentBet, bigBlind, fraction }) {
    const potSize = Math.max(0, Number(pot) || 0);
    const bb = Math.max(0, Math.floor(Number(bigBlind) || 0));
    const raiseBy = Math.max(bb, Math.round(potSize * (Number(fraction) || 0)));
    return Math.floor(Number(currentBet) || 0) + raiseBy;
  }

  return { legalRaiseTo, potPresetRaiseTo };
});
