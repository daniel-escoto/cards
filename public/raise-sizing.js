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

  /** Free-check detent: raise-to equal to the matched current bet (zero increment). */
  function checkDetentValue(currentBet) {
    return Math.max(0, Math.floor(Number(currentBet) || 0));
  }

  function isCheckDetent(value, currentBet) {
    const target = Math.floor(Number(value));
    if (!Number.isFinite(target)) return true;
    return target <= checkDetentValue(currentBet);
  }

  /**
   * Clamp raise-to. With mergeCheckBet, anything below a full min bet stays on
   * the check detent — a fat-finger partial nudge cannot become a tiny bet.
   */
  function clampRaiseTo(rawValue, {
    minRaiseTo,
    maxRaiseTo,
    step,
    currentBet = 0,
    mergeCheckBet = false,
  } = {}) {
    if (mergeCheckBet) {
      const detent = checkDetentValue(currentBet);
      const target = Math.floor(Number(rawValue));
      if (!Number.isFinite(target) || target <= detent) return detent;
      const minLegal = legalRaiseTo(minRaiseTo, { minRaiseTo, maxRaiseTo, step });
      // Hard detent: must reach a real min bet (or all-in) to leave Check.
      if (target < minLegal) return detent;
    }
    return legalRaiseTo(rawValue, { minRaiseTo, maxRaiseTo, step });
  }

  /**
   * One stepper/keyboard nudge. From Check, the first up-step is a real min bet
   * (or all-in); from min bet, the first down-step returns to Check.
   */
  function nudgeRaiseTo(rawValue, direction, {
    minRaiseTo,
    maxRaiseTo,
    step,
    currentBet = 0,
    mergeCheckBet = false,
  } = {}) {
    const dir = direction < 0 ? -1 : 1;
    const stride = Math.max(1, Math.floor(Number(step) || 1));
    const bounds = { minRaiseTo, maxRaiseTo, step: stride, currentBet, mergeCheckBet };
    const minLegal = legalRaiseTo(minRaiseTo, { minRaiseTo, maxRaiseTo, step: stride });
    const current = mergeCheckBet && isCheckDetent(rawValue, currentBet)
      ? checkDetentValue(currentBet)
      : legalRaiseTo(rawValue, { minRaiseTo, maxRaiseTo, step: stride });

    if (mergeCheckBet) {
      if (dir > 0 && isCheckDetent(current, currentBet)) return minLegal;
      if (dir < 0 && current <= minLegal) return checkDetentValue(currentBet);
    }

    return clampRaiseTo(current + dir * stride, bounds);
  }

  return {
    legalRaiseTo,
    potPresetRaiseTo,
    checkDetentValue,
    isCheckDetent,
    clampRaiseTo,
    nudgeRaiseTo,
  };
});
