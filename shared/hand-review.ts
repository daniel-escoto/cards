/**
 * Post-hand review for bot-only tables (chess.com Game Review style).
 * Pure builders over a typed HandRecording — grades hero decisions with coach-odds
 * implied-odds math. No LLM. Equity is injected by the caller.
 */

import {
  adviseFacingBet,
  effectiveStackForCall,
  formatNeedHave,
  speculativeCategoryLabel,
  type CoachOddsAdvice,
  type SpeculativeCategory,
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
  /** Raise ladder step (usually big blind). Used with legalRaiseTo snap. */
  raiseStep?: number;
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
 * Same ladder snap as public/raise-sizing.ts `legalRaiseTo` — keep review copy
 * on legal sizes (e.g. 125 → 120 when min=120, step=20).
 */
export function legalRaiseTo(
  rawValue: unknown,
  {
    minRaiseTo,
    maxRaiseTo,
    step,
  }: { minRaiseTo?: number; maxRaiseTo?: number; step?: number } = {},
): number {
  const max = Math.max(0, Math.floor(Number(maxRaiseTo) || 0));
  const requestedMin = Math.max(0, Math.floor(Number(minRaiseTo) || 0));
  const min = Math.min(max, requestedMin);
  const stride = Math.max(1, Math.floor(Number(step) || 1));
  let target = Math.floor(Number(rawValue));
  if (!Number.isFinite(target)) target = min;
  if (min >= max) return max;
  if (target <= min) return min;
  if (target >= max) return max;
  const snapped = min + Math.round((target - min) / stride) * stride;
  if (snapped <= min) return min;
  if (snapped >= max) return max;
  return snapped;
}

/**
 * Pick the standard action from equity + pot odds (+ implied odds when short).
 * Check/bet when toCall is 0; fold/call/raise when facing a bet.
 * Every suggested raise size is snapped with legalRaiseTo.
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
  raiseStep?: number;
}): { action: ReviewAction; raiseTo: number | null; advice: CoachOddsAdvice | null; potOdds: number } {
  const toCall = Math.max(0, input.toCall);
  const pot = Math.max(0, input.pot);
  const potOdds = toCall > 0 ? toCall / Math.max(1, pot + toCall) : 0;
  const equity = Math.max(0, Math.min(1, input.equity));
  const effective = effectiveStackForCall(input.heroStack, input.opponentStacks);
  const snap = (raw: number) =>
    legalRaiseTo(raw, {
      minRaiseTo: input.minRaiseTo,
      maxRaiseTo: input.maxRaiseTo,
      step: input.raiseStep,
    });

  if (toCall <= 0) {
    if (equity >= 0.62 && input.canRaise) {
      const raiseTo = snap(Math.round(input.currentBet + Math.max(pot * 0.5, 1)));
      return {
        action: input.currentBet > 0 ? "raise" : "bet",
        raiseTo,
        advice: null,
        potOdds,
      };
    }
    if (equity >= 0.52 && input.canRaise) {
      const raiseTo = snap(input.minRaiseTo);
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
    return { action: "raise", raiseTo: snap(raw), advice: null, potOdds };
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

/** Cap review why-copy at ~12 words (minimal UI). */
function trimReason(text: string, maxWords = 12): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function categoryLabel(category: SpeculativeCategory): string | null {
  return category ? speculativeCategoryLabel(category) : null;
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
  let reason: string;
  if (args.advice && args.advice.reason) {
    if (args.match) {
      reason = args.advice.reason;
    } else if (
      args.advice.action === "call" &&
      (args.taken === "raise" || args.taken === "bet")
    ) {
      const cat = categoryLabel(args.advice.category);
      reason = cat ? `${cat}, fine call. Raise is too much.` : "Fine call. Raise is too much.";
    } else {
      // Recommended play is the punchline — do not append the taken action.
      reason = args.advice.reason;
    }
  } else if (args.potOdds <= 0) {
    if (args.match) {
      reason =
        args.recommended === "check" ? "No bet — check." : "Strong enough — lead.";
    } else {
      reason = `Better to ${actionLabel(args.recommended, args.recommendedRaiseTo).toLowerCase()}.`;
    }
  } else {
    const needHave = formatNeedHave(args.equity, args.potOdds);
    if (args.match) {
      if (args.recommended === "fold") reason = `${needHave} Fold.`;
      else if (args.recommended === "raise" || args.recommended === "bet") {
        reason = `${needHave} Raise.`;
      } else reason = `${needHave} Call.`;
    } else if (args.recommended === "raise" || args.recommended === "bet") {
      reason = `${actionLabel(args.recommended, args.recommendedRaiseTo)}. ${needHave}`;
    } else if (args.recommended === "fold") {
      reason = `${needHave} Fold.`;
    } else if (args.recommended === "call") {
      reason = `${needHave} Call.`;
    } else {
      reason = `${actionLabel(args.recommended, args.recommendedRaiseTo)} was better.`;
    }
  }
  return trimReason(reason);
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
  const raiseStep =
    typeof decision.raiseStep === "number" && decision.raiseStep > 0
      ? decision.raiseStep
      : Math.max(1, minRaiseTo - decision.currentBet || 1);
  // Nobody left who can put more chips in → raising is not a real option; grade as Call/Fold only.
  const opponentsCanRespond = decision.opponentStacks.some((stack) => stack > 0);
  const canRaise =
    (typeof options.canRaise === "boolean"
      ? options.canRaise
      : typeof decision.canRaise === "boolean"
        ? decision.canRaise
        : true) &&
    maxRaiseTo > decision.currentBet &&
    opponentsCanRespond;

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
    raiseStep,
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
  return {
    items,
    best,
    fine,
    mistake,
    summary: formatReviewSummary(items.length, best, fine, mistake),
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

  return {
    steps,
    items,
    best,
    fine,
    mistake,
    summary: formatReviewSummary(items.length, best, fine, mistake) || `${steps.length} steps`,
  };
}

/** Header summary: original decision counts (lowercase badges — not the retry). */
export function formatReviewSummary(
  decisions: number,
  best: number,
  fine: number,
  mistake: number,
): string {
  const parts = [`${decisions} decision${decisions === 1 ? "" : "s"}`];
  if (best) parts.push(`${best} best`);
  if (fine) parts.push(`${fine} fine`);
  if (mistake) parts.push(`${mistake} mistake${mistake === 1 ? "" : "s"}`);
  return parts.join(" · ");
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
      line: `Your retry: Correct — ${actionLabel(item.recommended, item.recommendedRaiseTo)}.`,
    };
  }
  return {
    correct: false,
    line: `Your retry: Still off — ${actionLabel(item.recommended, item.recommendedRaiseTo)}.`,
  };
}

/** Non-spoiling nudge on a Mistake before Show answer / retry. */
export function formatMistakeNudge(): string {
  return "There was a better play here.";
}

export function formatDecisionHeadline(item: HandReviewItem): string {
  return `${streetLabel(item.street)} · ${actionLabel(item.taken, item.raiseTo)}`;
}

/** Badge fragment only — e.g. "✗ Mistake" (UI colors the mark). FE0E = text, not emoji. */
export function formatVerdictBadge(item: HandReviewItem): string {
  const mark =
    item.verdict === "best" ? "✓\uFE0E" : item.verdict === "mistake" ? "✗\uFE0E" : "~";
  return `${mark} ${item.badge}`;
}

/** Short why line under the badge (no badge prefix). */
export function formatVerdictWhy(item: HandReviewItem): string {
  return item.reason;
}

export function formatVerdictLine(item: HandReviewItem): string {
  return `${formatVerdictBadge(item)} · ${formatVerdictWhy(item)}`;
}
