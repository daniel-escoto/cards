(function (
  root: typeof globalThis & { RaiseSizing?: RaiseSizingAPI },
  factory: () => RaiseSizingAPI,
) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RaiseSizing = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis), function () {
  "use strict";

  /**
   * Snap a raise-to amount onto a legal server value:
   * at least minRaiseTo (or all-in if the hero cannot make a full raise),
   * at most maxRaiseTo, on minRaiseTo + k*step when in between.
   */
  function legalRaiseTo(rawValue: unknown, { minRaiseTo, maxRaiseTo, step }: RaiseBoundsInput = {}) {
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

  /**
   * Raw raise-to before legality clamping (pot-limit style):
   *   raiseTo = currentBet + max(bb, round(fraction × (pot + toCall)))
   * Unopened (toCall 0): fraction × pot. Facing a bet: pot-after-calling includes
   * the call. `pot` must already include all chips in play (current-street bets).
   */
  function potPresetRaiseTo({ pot, currentBet, bigBlind, fraction, toCall = 0 }: { pot: unknown; currentBet: unknown; bigBlind: unknown; fraction: unknown; toCall?: unknown }) {
    const potSize = Math.max(0, Number(pot) || 0);
    const callAmount = Math.max(0, Math.floor(Number(toCall) || 0));
    const potAfterCall = potSize + callAmount;
    const bb = Math.max(0, Math.floor(Number(bigBlind) || 0));
    const raiseBy = Math.max(bb, Math.round(potAfterCall * (Number(fraction) || 0)));
    return Math.floor(Number(currentBet) || 0) + raiseBy;
  }

  /**
   * Passive detent (Check or Call): raise-to equal to the matched current bet
   * (zero increment beyond calling).
   */
  function passiveDetentValue(currentBet: unknown) {
    return Math.max(0, Math.floor(Number(currentBet) || 0));
  }

  function isPassiveDetent(value: unknown, currentBet: unknown) {
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
  }: { mergeCheckBet?: boolean; mergeCallRaise?: boolean; hardDetent?: boolean } = {}) {
    return Boolean(mergeCheckBet || mergeCallRaise || hardDetent);
  }

  /**
   * Clamp raise-to. With a passive detent (Check/Bet or Call/Raise merge),
   * anything below a full min raise stays on the detent — a fat-finger partial
   * nudge cannot become a tiny illegal bet/raise.
   */
  function clampRaiseTo(
    rawValue: unknown,
    {
      minRaiseTo,
      maxRaiseTo,
      step,
      currentBet = 0,
      mergeCheckBet = false,
      mergeCallRaise = false,
      hardDetent = false,
    }: RaiseBoundsInput = {},
  ) {
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
   * Initial raise-to when the bet panel opens.
   * Merged Call/Raise or Check/Bet: open on the passive detent (Call / Check).
   * The first + / arrow / preset moves to the min legal raise (via nudgeRaiseTo /
   * legalRaiseTo) — never open already raising.
   * Separate Raise button (no merge): still open on preferred / min legal raise.
   */
  function initialRaiseTo({
    facingBet,
    mergePassiveConfirm,
    currentBet,
    minRaiseTo,
    maxRaiseTo,
    preferredRaiseTo,
  }: {
    facingBet: boolean;
    mergePassiveConfirm: boolean;
    currentBet: unknown;
    minRaiseTo: unknown;
    maxRaiseTo: unknown;
    preferredRaiseTo?: unknown;
  }) {
    const max = Math.max(0, Math.floor(Number(maxRaiseTo) || 0));
    const minLegal = Math.min(max, Math.max(0, Math.floor(Number(minRaiseTo) || 0)));
    if (mergePassiveConfirm) {
      // Facing a bet → Call detent (currentBet). Free check → Check detent (0).
      return Math.min(max, passiveDetentValue(currentBet));
    }
    void facingBet;
    const preferred = Math.floor(Number(preferredRaiseTo));
    const target = Number.isFinite(preferred) ? preferred : minLegal;
    return Math.max(minLegal, Math.min(max, target));
  }

  /**
   * Chips shown in the RAISE TO / BET box.
   * At Call/Check detent → null (UI shows a muted "Min N" placeholder so the
   * call-total is never mistaken for a raise). Real raises → the raise-to amount.
   */
  function displayRaiseAmount({
    facingBet,
    atDetent,
    value,
  }: {
    facingBet: boolean;
    atDetent: boolean;
    value: unknown;
  }): number | null {
    void facingBet;
    if (atDetent) return null;
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  /** Muted placeholder under RAISE TO / BET while the box is on Call/Check. */
  function detentPlaceholderLabel(minRaiseTo: unknown): string {
    const min = Math.max(0, Math.floor(Number(minRaiseTo) || 0));
    return min > 0 ? `Min ${min}` : "Min";
  }

  /**
   * One stepper/keyboard nudge. From the passive detent, the first up-step is a
   * real min raise (or all-in); from min raise, the first down-step returns to
   * the detent (Check or Call).
   */
  function nudgeRaiseTo(
    rawValue: unknown,
    direction: number,
    {
      minRaiseTo,
      maxRaiseTo,
      step,
      currentBet = 0,
      mergeCheckBet = false,
      mergeCallRaise = false,
      hardDetent = false,
    }: RaiseBoundsInput = {},
  ) {
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
    const current =
      detentOn && isPassiveDetent(rawValue, currentBet)
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
    initialRaiseTo,
    displayRaiseAmount,
    detentPlaceholderLabel,
    clampRaiseTo,
    nudgeRaiseTo,
  };
});
