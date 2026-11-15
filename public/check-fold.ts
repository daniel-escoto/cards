(function (
  root: typeof globalThis & { CheckFold?: CheckFoldAPI },
  factory: () => CheckFoldAPI,
) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CheckFold = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis), function () {
  "use strict";

  const BETTING_PHASES = new Set(["preflop", "flop", "turn", "river"]);

  function createSession(): CheckFoldSession {
    return {
      armed: false,
      armedToCall: 0,
      handNumber: null,
    };
  }

  function disarm(session: CheckFoldSession | null | undefined): void {
    if (!session) return;
    session.armed = false;
    session.armedToCall = 0;
    session.handNumber = null;
  }

  function arm(
    session: CheckFoldSession | null | undefined,
    toCall: unknown,
    handNumber: unknown,
  ): void {
    if (!session) return;
    session.armed = true;
    session.armedToCall = Math.max(0, Math.floor(Number(toCall) || 0));
    const hand = Number(handNumber);
    session.handNumber = Number.isFinite(hand) ? hand : null;
  }

  function toggle(
    session: CheckFoldSession | null | undefined,
    toCall: unknown,
    handNumber: unknown,
  ): boolean {
    if (!session) return false;
    if (session.armed) {
      disarm(session);
      return false;
    }
    arm(session, toCall, handNumber);
    return true;
  }

  function isBettingPhase(phase: unknown): boolean {
    return BETTING_PHASES.has(String(phase || ""));
  }

  function heroLiveForPreAction(hero: {
    folded?: unknown;
    allIn?: unknown;
    sittingOut?: unknown;
    cards?: unknown;
  } | null | undefined): boolean {
    if (!hero || hero.folded || hero.allIn || hero.sittingOut) return false;
    const cards = hero.cards as unknown;
    if (Array.isArray(cards) && cards.length === 0) return false;
    return true;
  }

  /**
   * Off-turn pre-action is offered while the hero is still live in a betting street.
   * Fold chrome stays mounted (as Check/Fold) — never unmount for layout stability.
   * Not offered while sitting out, folded, all-in, spectating (no hero/cards), or on-turn.
   */
  function shouldOffer(options: {
    isYourTurn?: unknown;
    phase?: unknown;
    hero?: {
      folded?: unknown;
      allIn?: unknown;
      sittingOut?: unknown;
      cards?: unknown;
    } | null;
  }): boolean {
    if (options.isYourTurn) return false;
    if (!isBettingPhase(options.phase)) return false;
    return heroLiveForPreAction(options.hero);
  }

  /**
   * Sync armed state against the latest room. Returns an action to fire through the
   * normal click path when the hero's turn arrives while still armed; otherwise null.
   *
   * Disarm rules (deterministic):
   * - hand over / hero out of the hand (fold, all-in, sit-out, empty cards, non-betting phase)
   * - hand number changed (includes new hand even if hero was not dealt in)
   * - toCall increased vs the amount stored when armed (bet/raise before hero acts)
   *
   * Street choice: stay armed across streets within the same hand. A new street resets
   * bets to toCall=0; that is not a "rise", so the arm holds and auto-checks when free.
   * A bet/raise that pushes toCall above armedToCall disarms (does not auto-fold).
   *
   * Session is in-memory only — reconnect/refresh starts unarmed (never fires stale).
   * sync disarms before returning an action, so a turn-arrival race fires at most once.
   */
  function sync(
    session: CheckFoldSession | null | undefined,
    options: {
      isYourTurn?: unknown;
      phase?: unknown;
      toCall?: unknown;
      handNumber?: unknown;
      hero?: {
        folded?: unknown;
        allIn?: unknown;
        sittingOut?: unknown;
        cards?: unknown;
      } | null;
    },
  ): { type: "check" | "fold" } | null {
    if (!session || !session.armed) return null;

    const hand = Number(options.handNumber);
    if (
      session.handNumber != null &&
      Number.isFinite(hand) &&
      hand !== session.handNumber
    ) {
      disarm(session);
      return null;
    }

    if (!shouldOffer({ ...options, isYourTurn: false }) && !options.isYourTurn) {
      disarm(session);
      return null;
    }

    const hero = options.hero;
    if (!heroLiveForPreAction(hero) || !isBettingPhase(options.phase)) {
      disarm(session);
      return null;
    }

    const toCall = Math.max(0, Math.floor(Number(options.toCall) || 0));
    if (toCall > session.armedToCall) {
      disarm(session);
      return null;
    }

    if (!options.isYourTurn) return null;

    // Disarm before returning so a second sync in the same turn cannot double-send.
    const action = { type: toCall === 0 ? ("check" as const) : ("fold" as const) };
    disarm(session);
    return action;
  }

  function resolveArmedAction(toCall: unknown): "check" | "fold" {
    return Math.max(0, Math.floor(Number(toCall) || 0)) === 0 ? "check" : "fold";
  }

  return {
    LABEL: "Check/Fold",
    createSession,
    disarm,
    arm,
    toggle,
    shouldOffer,
    sync,
    resolveArmedAction,
    isBettingPhase,
  };
});
