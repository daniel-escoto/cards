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

  /**
   * Passive detent (Check or Call): raise-to equal to the matched current bet
   * (zero increment beyond calling).
   */
  function passiveDetentValue(currentBet) {
    return Math.max(0, Math.floor(Number(currentBet) || 0));
  }

  function isPassiveDetent(value, currentBet) {
    const target = Math.floor(Number(value));
    if (!Number.isFinite(target)) return true;
    return target <= passiveDetentValue(currentBet);
  }

  // Aliases kept for Check/Bet call sites and tests.
  const checkDetentValue = passiveDetentValue;
  const isCheckDetent = isPassiveDetent;
  const callDetentValue = passiveDetentValue;
  const isCallDetent = isPassiveDetent;

  function usesPassiveDetent({
    mergeCheckBet = false,
    mergeCallRaise = false,
    hardDetent = false,
  } = {}) {
    return Boolean(mergeCheckBet || mergeCallRaise || hardDetent);
  }

  /**
   * Clamp raise-to. With a passive detent (Check/Bet or Call/Raise merge),
   * anything below a full min raise stays on the detent — a fat-finger partial
   * nudge cannot become a tiny illegal bet/raise.
   */
  function clampRaiseTo(rawValue, {
    minRaiseTo,
    maxRaiseTo,
    step,
    currentBet = 0,
    mergeCheckBet = false,
    mergeCallRaise = false,
    hardDetent = false,
  } = {}) {
    const detentOn = usesPassiveDetent({ mergeCheckBet, mergeCallRaise, hardDetent });
    if (detentOn) {
      const detent = passiveDetentValue(currentBet);
      const target = Math.floor(Number(rawValue));
      if (!Number.isFinite(target) || target <= detent) return detent;
      const minLegal = legalRaiseTo(minRaiseTo, { minRaiseTo, maxRaiseTo, step });
      // Hard detent: must reach a real min raise (or all-in) to leave Call/Check.
      if (target < minLegal) return detent;
    }
    return legalRaiseTo(rawValue, { minRaiseTo, maxRaiseTo, step });
  }

  /**
   * One stepper/keyboard nudge. From the passive detent, the first up-step is a
   * real min raise (or all-in); from min raise, the first down-step returns to
   * the detent (Check or Call).
   */
  function nudgeRaiseTo(rawValue, direction, {
    minRaiseTo,
    maxRaiseTo,
    step,
    currentBet = 0,
    mergeCheckBet = false,
    mergeCallRaise = false,
    hardDetent = false,
  } = {}) {
    const dir = direction < 0 ? -1 : 1;
    const stride = Math.max(1, Math.floor(Number(step) || 1));
    const detentFlags = { mergeCheckBet, mergeCallRaise, hardDetent };
    const detentOn = usesPassiveDetent(detentFlags);
    const bounds = {
      minRaiseTo,
      maxRaiseTo,
      step: stride,
      currentBet,
      ...detentFlags,
    };
    const minLegal = legalRaiseTo(minRaiseTo, { minRaiseTo, maxRaiseTo, step: stride });
    const current = detentOn && isPassiveDetent(rawValue, currentBet)
      ? passiveDetentValue(currentBet)
      : legalRaiseTo(rawValue, { minRaiseTo, maxRaiseTo, step: stride });

    if (detentOn) {
      if (dir > 0 && isPassiveDetent(current, currentBet)) return minLegal;
      if (dir < 0 && current <= minLegal) return passiveDetentValue(currentBet);
    }

    return clampRaiseTo(current + dir * stride, bounds);
  }

  return {
    legalRaiseTo,
    potPresetRaiseTo,
    passiveDetentValue,
    isPassiveDetent,
    checkDetentValue,
    isCheckDetent,
    callDetentValue,
    isCallDetent,
    usesPassiveDetent,
    clampRaiseTo,
    nudgeRaiseTo,
  };
});
