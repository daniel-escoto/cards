/**
 * Deterministic pot-odds + implied-odds advice for the in-game Coach.
 * No RNG and no LLM — pure functions over equity, price, stack depth, and hole cards.
 *
 * Speculative hands (small/mid pairs, suited connectors/gappers, suited aces) often
 * win by hitting a strong flop (e.g. a set ≈ 1 in 8) and then winning a big pot.
 * When raw equity is short of pot odds but stacks are deep enough to pay that
 * implied pot, we upgrade a blind Fold to Borderline or Call.
 *
 * Depth thresholds (effective stack ÷ amount to call), tuned for recreational play:
 * - Pocket pairs 22–99: need ≥ 20× the call (classic ~15–20× set-mine floor; we use
 *   20× so short stacks still fold cleanly).
 * - Suited connectors / one-gappers, suited aces: ≥ 15× the call (playability helps
 *   a bit sooner than pairs).
 */

export type SpeculativeCategory =
  | "small_pair"
  | "suited_connector"
  | "suited_ace"
  | null;

/** Coach display verdict (Borderline is a soft call). */
export type CoachOddsVerdict = "fold" | "call" | "borderline" | "raise";

export type CoachOddsInput = {
  /** Monte Carlo equity in [0, 1]. */
  equity: number;
  /** Pot odds toCall / (pot + toCall) in [0, 1]. */
  potOdds: number;
  /** Chips needed to call (> 0). */
  toCall: number;
  /** min(hero stack, deepest live opponent stack). */
  effectiveStack: number;
  /** Two hole-card codes like `4c`, `4s`. */
  heroCodes: [string, string];
  /** Empty / short board = preflop speculative logic applies. */
  boardLength: number;
};

export type CoachOddsAdvice = {
  verdict: CoachOddsVerdict;
  /** Playable action for controls (borderline → call). */
  action: "fold" | "call";
  category: SpeculativeCategory;
  /** effectiveStack / toCall when toCall > 0. */
  stackToCallRatio: number;
  /** Required depth for this category, or null if not speculative. */
  depthThreshold: number | null;
  /** Plain-English one-liner for the coach card. */
  reason: string;
};

const RANK_ORDER = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

const PAIR_DEPTH = 20;
const SUITED_DEPTH = 15;
/** Max equity shortfall (potOdds − equity) we'll cover with implied odds. */
const MAX_IMPLIED_GAP = 0.18;
/** Soft cushion already used by pot-odds Fold rule (equity + 0.03 < potOdds). */
const POT_ODDS_CUSHION = 0.03;

function rankIndex(rank: string): number {
  return RANK_ORDER.indexOf(rank.toUpperCase() as (typeof RANK_ORDER)[number]);
}

function parseCode(code: string): { rank: string; suit: string } | null {
  if (!/^[2-9TJQKA][cdhs]$/i.test(code)) return null;
  return { rank: code[0]!.toUpperCase(), suit: code[1]!.toLowerCase() };
}

/**
 * Classify speculative calling hands. Returns null for non-speculative holdings
 * (big pairs, offsuit junk, broadway, etc.).
 */
export function classifySpeculativeHand(heroCodes: readonly string[]): SpeculativeCategory {
  if (heroCodes.length !== 2) return null;
  const a = parseCode(heroCodes[0]!);
  const b = parseCode(heroCodes[1]!);
  if (!a || !b) return null;
  const suited = a.suit === b.suit;
  if (a.rank === b.rank) {
    const idx = rankIndex(a.rank);
    // 22–99 → small/medium pair; TT+ are value hands, not set-mines.
    if (idx >= rankIndex("9") && idx <= rankIndex("2")) return "small_pair";
    return null;
  }
  if (!suited) return null;
  if (a.rank === "A" || b.rank === "A") return "suited_ace";
  const gap = Math.abs(rankIndex(a.rank) - rankIndex(b.rank));
  if (gap <= 2) return "suited_connector";
  return null;
}

export function speculativeDepthThreshold(category: SpeculativeCategory): number | null {
  if (category === "small_pair") return PAIR_DEPTH;
  if (category === "suited_connector" || category === "suited_ace") return SUITED_DEPTH;
  return null;
}

function pct(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function categoryPhrase(category: Exclude<SpeculativeCategory, null>): string {
  if (category === "small_pair") return "small pairs";
  if (category === "suited_ace") return "suited aces";
  return "suited connectors";
}

function hitPhrase(category: Exclude<SpeculativeCategory, null>): string {
  if (category === "small_pair") return "hit a set";
  if (category === "suited_ace") return "flop well";
  return "hit a strong draw";
}

/**
 * When raw equity is behind pot odds, decide whether implied odds rescue a call.
 * Preflop-only: once a board is out, stick to pot odds (postflop has real outs).
 */
export function adviseFacingBet(input: CoachOddsInput): CoachOddsAdvice {
  const equity = Math.max(0, Math.min(1, input.equity));
  const potOdds = Math.max(0, Math.min(1, input.potOdds));
  const toCall = Math.max(0, input.toCall);
  const effectiveStack = Math.max(0, input.effectiveStack);
  const ratio = toCall > 0 ? effectiveStack / toCall : Number.POSITIVE_INFINITY;
  const category = classifySpeculativeHand(input.heroCodes);
  const depthThreshold = speculativeDepthThreshold(category);

  const foldBehind = (): CoachOddsAdvice => ({
    verdict: "fold",
    action: "fold",
    category,
    stackToCallRatio: ratio,
    depthThreshold,
    reason: `You need to win ${pct(potOdds)} to call; you win about ${pct(equity)}. Fold.`,
  });

  // Already getting the price (with the same cushion as the live coach).
  if (equity + POT_ODDS_CUSHION >= potOdds) {
    return {
      verdict: "call",
      action: "call",
      category,
      stackToCallRatio: ratio,
      depthThreshold,
      reason: `You need to win ${pct(potOdds)} to call; you win about ${pct(equity)}. Call.`,
    };
  }

  const gap = potOdds - equity;

  // Implied-odds rescue only preflop for speculative hands.
  if (input.boardLength > 0 || !category || depthThreshold == null) {
    return foldBehind();
  }

  if (ratio < depthThreshold || gap > MAX_IMPLIED_GAP) {
    if (ratio < depthThreshold) {
      return {
        verdict: "fold",
        action: "fold",
        category,
        stackToCallRatio: ratio,
        depthThreshold,
        reason: `Short on odds (${pct(equity)} vs ${pct(potOdds)}), and stacks are too short for ${categoryPhrase(category)} to get paid. Fold.`,
      };
    }
    return foldBehind();
  }

  const comfortable = ratio >= depthThreshold * 1.15 && gap <= 0.14;
  if (comfortable) {
    return {
      verdict: "call",
      action: "call",
      category,
      stackToCallRatio: ratio,
      depthThreshold,
      reason: `Short on odds now (${pct(equity)} vs ${pct(potOdds)}), but ${categoryPhrase(category)} win big when they ${hitPhrase(category)}, and you're deep. Calling is fine.`,
    };
  }

  return {
    verdict: "borderline",
    action: "call",
    category,
    stackToCallRatio: ratio,
    depthThreshold,
    reason: `Short on odds now (${pct(equity)} vs ${pct(potOdds)}), but ${categoryPhrase(category)} can get paid when they ${hitPhrase(category)} and stacks are deep. Borderline call.`,
  };
}

/** Effective stack for implied odds: chips you can still win from the deepest threat. */
export function effectiveStackForCall(
  heroStack: number,
  opponentStacks: readonly number[],
): number {
  const hero = Math.max(0, heroStack);
  const oppMax = opponentStacks.reduce((max, stack) => Math.max(max, Math.max(0, stack)), 0);
  if (oppMax <= 0) return hero;
  return Math.min(hero, oppMax);
}
