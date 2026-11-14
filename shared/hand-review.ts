/**
 * Post-hand review for bot-only tables (chess.com Game Review style).
 * Pure builders over a typed HandRecording — grades hero decisions with coach-odds
 * implied-odds math. No LLM. Equity is injected by the caller.
 */

import {
  adviseFacingBet,
  effectiveStackForCall,
  type CoachOddsAdvice,
} from "./coach-odds";

export type ReviewStreet = "preflop" | "flop" | "turn" | "river";
export type ReviewAction = "fold" | "check" | "call" | "bet" | "raise";
export type ReviewVerdict = "best" | "fine" | "mistake";
export type ReviewBadge = "Best" | "Fine" | "Borderline" | "Mistake";
export type ReplayStreet = ReviewStreet | "showdown" | "complete";

export type HandReviewDecision = {
  id: string;
  street: ReviewStreet;
  boardCodes: string[];
  heroCodes: [string, string];
  pot: number;
  toCall: number;
  currentBet: number;
  heroStack: number;
  opponentStacks: number[];
  taken: ReviewAction;
  raiseTo?: number | null;
  /** Optional fixed equity for deterministic tests / replay. */
  equity?: number;
  canRaise?: boolean;
  minRaiseTo?: number;
  maxRaiseTo?: number;
};

export type HandReviewItem = {
  id: string;
  street: ReviewStreet;
  boardCodes: string[];
  heroCodes: [string, string];
  pot: number;
  toCall: number;
  currentBet: number;
  taken: ReviewAction;
  raiseTo: number | null;
  equity: number;
  potOdds: number;
  recommended: ReviewAction;
  recommendedRaiseTo: number | null;
  verdict: ReviewVerdict;
  badge: ReviewBadge;
  reason: string;
};

export type HandReviewReport = {
  items: HandReviewItem[];
  best: number;
  fine: number;
  mistake: number;
  summary: string;
};

/** Seat row for one replay frame. */
export type ReplaySeat = {
  id: string;
  name: string;
  isHero: boolean;
  isBot: boolean;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  dealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  /** Visible holes only — hero always; bots only when revealed at showdown. */
  holeCodes: string[] | null;
  lastAction: string | null;
};

/** Table frame shown at one replay step. */
export type ReplayTableState = {
  street: ReplayStreet;
  pot: number;
  toCall: number;
  currentBet: number;
  minRaiseTo: number;
  boardCodes: string[];
  seats: ReplaySeat[];
  actingSeatId: string | null;
  winners: Array<{ playerId: string; name: string; amount: number; hand?: string }>;
};

export type HandRecordingStep = {
  id: string;
  label: string;
  actorId: string | null;
  kind: "action" | "hero_decision" | "street" | "showdown" | "result";
  /** Table to paint (BEFORE for hero_decision; AFTER otherwise). */
  table: ReplayTableState;
  /** Present on hero voluntary decisions — graded by buildHandReplay. */
  heroDecision?: HandReviewDecision;
};

/** Raw per-hand recording captured during play (input to buildHandReplay). */
export type HandRecording = {
  handNumber: number;
  heroId: string;
  heroCodes: [string, string];
  steps: HandRecordingStep[];
};

export type ReplayStep = {
  id: string;
  index: number;
  label: string;
  actorId: string | null;
  kind: HandRecordingStep["kind"];
  table: ReplayTableState;
  /** Graded hero decision when kind === "hero_decision". */
  decision: HandReviewItem | null;
  /** Timeline dots: true for hero decision steps. */
  isHeroDecision: boolean;
};

export type HandReplay = {
  steps: ReplayStep[];
  items: HandReviewItem[];
  best: number;
  fine: number;
  mistake: number;
  summary: string;
};

function pct(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function streetLabel(street: ReviewStreet): string {
  if (street === "preflop") return "Preflop";
  if (street === "flop") return "Flop";
  if (street === "turn") return "Turn";
  return "River";
}

function actionLabel(action: ReviewAction, raiseTo: number | null): string {
  if (action === "raise" || action === "bet") {
    return raiseTo != null
      ? `${action === "bet" ? "Bet" : "Raise to"} ${raiseTo}`
      : action === "bet"
        ? "Bet"
        : "Raise";
  }
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/**
 * Pick the standard action from equity + pot odds (+ implied odds when short).
 * Check/bet when toCall is 0; fold/call/raise when facing a bet.
 */
export function recommendAction(input: {
  equity: number;
  pot: number;
  toCall: number;
  currentBet: number;
  heroStack: number;
  opponentStacks: readonly number[];
  heroCodes: [string, string];
  boardLength: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}): { action: ReviewAction; raiseTo: number | null; advice: CoachOddsAdvice | null; potOdds: number } {
  const toCall = Math.max(0, input.toCall);
  const pot = Math.max(0, input.pot);
  const potOdds = toCall > 0 ? toCall / Math.max(1, pot + toCall) : 0;
  const equity = Math.max(0, Math.min(1, input.equity));
  const effective = effectiveStackForCall(input.heroStack, input.opponentStacks);

  if (toCall <= 0) {
    if (equity >= 0.62 && input.canRaise) {
      const raiseTo = Math.max(
        input.minRaiseTo,
        Math.min(input.maxRaiseTo, Math.round(input.currentBet + Math.max(pot * 0.5, 1))),
      );
      return {
        action: input.currentBet > 0 ? "raise" : "bet",
        raiseTo,
        advice: null,
        potOdds,
      };
    }
    if (equity >= 0.52 && input.canRaise) {
      const raiseTo = Math.max(input.minRaiseTo, Math.min(input.maxRaiseTo, input.minRaiseTo));
      return {
        action: input.currentBet > 0 ? "raise" : "bet",
        raiseTo,
        advice: null,
        potOdds,
      };
    }
    return { action: "check", raiseTo: null, advice: null, potOdds };
  }

  if (equity + 0.03 < potOdds) {
    const advice = adviseFacingBet({
      equity,
      potOdds,
      toCall,
      effectiveStack: effective,
      heroCodes: input.heroCodes,
      boardLength: input.boardLength,
    });
    if (advice.action === "call") {
      return { action: "call", raiseTo: null, advice, potOdds };
    }
    return { action: "fold", raiseTo: null, advice, potOdds };
  }

  if (equity >= potOdds + 0.12 && input.canRaise) {
    const raw = Math.round(input.currentBet + Math.max(toCall, pot * 0.5));
    const raiseTo = Math.max(input.minRaiseTo, Math.min(input.maxRaiseTo, raw));
    return { action: "raise", raiseTo, advice: null, potOdds };
  }

  return { action: "call", raiseTo: null, advice: null, potOdds };
}

function sameAction(taken: ReviewAction, recommended: ReviewAction): boolean {
  if (taken === recommended) return true;
  if ((taken === "bet" || taken === "raise") && (recommended === "bet" || recommended === "raise")) {
    return true;
  }
  return false;
}

function buildReason(args: {
  taken: ReviewAction;
  recommended: ReviewAction;
  raiseTo: number | null;
  recommendedRaiseTo: number | null;
  equity: number;
  potOdds: number;
  advice: CoachOddsAdvice | null;
  match: boolean;
}): string {
  if (args.advice && args.advice.reason) {
    if (args.match) return args.advice.reason;
    return `${args.advice.reason} You ${actionLabel(args.taken, args.raiseTo).toLowerCase()}.`;
  }
  if (args.potOdds <= 0) {
    if (args.match) {
      return args.recommended === "check"
        ? "No bet to call — checking is fine."
        : "Strong enough equity to take the lead.";
    }
    return `Better to ${actionLabel(args.recommended, args.recommendedRaiseTo).toLowerCase()} here.`;
  }
  if (args.match) {
    if (args.recommended === "fold") {
      return `You need to win ${pct(args.potOdds)} to call; you win about ${pct(args.equity)}. Fold.`;
    }
    if (args.recommended === "raise" || args.recommended === "bet") {
      return `Well ahead of the price (${pct(args.equity)} vs ${pct(args.potOdds)} needed). Raise.`;
    }
    return `You need to win ${pct(args.potOdds)} to call; you win about ${pct(args.equity)}. Call.`;
  }
  return `Equity ${pct(args.equity)} vs pot odds ${pct(args.potOdds)} — ${actionLabel(args.recommended, args.recommendedRaiseTo)} was better.`;
}

/**
 * Grade one hero decision. Pass `equity` on the decision (or via options) for
 * deterministic tests; live review should pre-fill equity from Monte Carlo.
 */
export function gradeHandDecision(
  decision: HandReviewDecision,
  options: {
    equity?: number;
    canRaise?: boolean;
    minRaiseTo?: number;
    maxRaiseTo?: number;
  } = {},
): HandReviewItem {
  const equity =
    typeof options.equity === "number"
      ? options.equity
      : typeof decision.equity === "number"
        ? decision.equity
        : 0.5;
  const maxRaiseTo =
    typeof options.maxRaiseTo === "number"
      ? options.maxRaiseTo
      : typeof decision.maxRaiseTo === "number"
        ? decision.maxRaiseTo
        : decision.heroStack + Math.max(0, decision.currentBet);
  const minRaiseTo =
    typeof options.minRaiseTo === "number"
      ? options.minRaiseTo
      : typeof decision.minRaiseTo === "number"
        ? decision.minRaiseTo
        : Math.max(decision.currentBet + decision.toCall, decision.currentBet * 2);
  const canRaise =
    (typeof options.canRaise === "boolean"
      ? options.canRaise
      : typeof decision.canRaise === "boolean"
        ? decision.canRaise
        : true) && maxRaiseTo > decision.currentBet;

  const rec = recommendAction({
    equity,
    pot: decision.pot,
    toCall: decision.toCall,
    currentBet: decision.currentBet,
    heroStack: decision.heroStack,
    opponentStacks: decision.opponentStacks,
    heroCodes: decision.heroCodes,
    boardLength: decision.boardCodes.length,
    canRaise,
    minRaiseTo,
    maxRaiseTo,
  });

  const match = sameAction(decision.taken, rec.action);
  let verdict: ReviewVerdict;
  let badge: ReviewBadge;
  if (!match) {
    verdict = "mistake";
    badge = "Mistake";
  } else if (rec.advice?.verdict === "borderline") {
    verdict = "fine";
    badge = "Borderline";
  } else if (rec.advice?.verdict === "call" && equity + 0.03 < rec.potOdds) {
    verdict = "fine";
    badge = "Fine";
  } else {
    verdict = "best";
    badge = "Best";
  }

  const reason = buildReason({
    taken: decision.taken,
    recommended: rec.action,
    raiseTo: decision.raiseTo ?? null,
    recommendedRaiseTo: rec.raiseTo,
    equity,
    potOdds: rec.potOdds,
    advice: rec.advice,
    match,
  });

  return {
    id: decision.id,
    street: decision.street,
    boardCodes: decision.boardCodes.slice(),
    heroCodes: [decision.heroCodes[0], decision.heroCodes[1]],
    pot: decision.pot,
    toCall: decision.toCall,
    currentBet: decision.currentBet,
    taken: decision.taken,
    raiseTo: decision.raiseTo ?? null,
    equity,
    potOdds: rec.potOdds,
    recommended: rec.action,
    recommendedRaiseTo: rec.raiseTo,
    verdict,
    badge,
    reason,
  };
}

export function buildHandReview(
  decisions: readonly HandReviewDecision[],
  options: { equityFor?: (decision: HandReviewDecision) => number } = {},
): HandReviewReport {
  const items = decisions.map((decision) =>
    gradeHandDecision(decision, {
      equity: options.equityFor ? options.equityFor(decision) : decision.equity,
    }),
  );
  const best = items.filter((item) => item.verdict === "best").length;
  const fine = items.filter((item) => item.verdict === "fine").length;
  const mistake = items.filter((item) => item.verdict === "mistake").length;
  const parts = [`${items.length} decision${items.length === 1 ? "" : "s"}`];
  if (best) parts.push(`${best} Best`);
  if (fine) parts.push(`${fine} Fine`);
  if (mistake) parts.push(`${mistake} Mistake${mistake === 1 ? "" : "s"}`);
  return {
    items,
    best,
    fine,
    mistake,
    summary: parts.join(" · "),
  };
}

/**
 * Build a step-through replay from a typed hand recording.
 * Grades every hero_decision step and places verdicts on the timeline.
 */
export function buildHandReplay(recording: HandRecording): HandReplay {
  const steps: ReplayStep[] = [];
  const items: HandReviewItem[] = [];

  recording.steps.forEach((raw, index) => {
    let decision: HandReviewItem | null = null;
    if (raw.kind === "hero_decision" && raw.heroDecision) {
      decision = gradeHandDecision(raw.heroDecision);
      items.push(decision);
    }
    steps.push({
      id: raw.id,
      index,
      label: raw.label,
      actorId: raw.actorId,
      kind: raw.kind,
      table: raw.table,
      decision,
      isHeroDecision: raw.kind === "hero_decision",
    });
  });

  const best = items.filter((item) => item.verdict === "best").length;
  const fine = items.filter((item) => item.verdict === "fine").length;
  const mistake = items.filter((item) => item.verdict === "mistake").length;
  const parts = [`${items.length} decision${items.length === 1 ? "" : "s"}`];
  if (best) parts.push(`${best} Best`);
  if (fine) parts.push(`${fine} Fine`);
  if (mistake) parts.push(`${mistake} Mistake${mistake === 1 ? "" : "s"}`);

  return {
    steps,
    items,
    best,
    fine,
    mistake,
    summary: parts.join(" · ") || `${steps.length} steps`,
  };
}

/** Grade a retry attempt against the original review item. */
export function gradeRetry(
  item: HandReviewItem,
  taken: ReviewAction,
): { correct: boolean; line: string } {
  const correct = sameAction(taken, item.recommended);
  if (correct) {
    return {
      correct: true,
      line: `✓ Now Best — ${actionLabel(item.recommended, item.recommendedRaiseTo)}.`,
    };
  }
  return {
    correct: false,
    line: `✗ Still off — ${actionLabel(item.recommended, item.recommendedRaiseTo)} was the play.`,
  };
}

export function formatDecisionHeadline(item: HandReviewItem): string {
  return `${streetLabel(item.street)} · ${actionLabel(item.taken, item.raiseTo)}`;
}

export function formatVerdictLine(item: HandReviewItem): string {
  const mark = item.verdict === "best" ? "✓" : item.verdict === "mistake" ? "✗" : "~";
  return `${mark} ${item.badge} · ${item.reason}`;
}
