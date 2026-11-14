/**
 * Approximate vs-open (facing a preflop raise) ranges for the Trainer.
 *
 * Charts are standard recreational 100bb 6-max-ish guides — not solver
 * frequencies. Each (hero seat × opener seat) maps hands into:
 *   - 3-bet (raise)
 *   - call (flat)
 *   - fold (everything else)
 *
 * Built for the facing-raise puzzle drill. Reuses RFI hand-key helpers.
 */

import {
  RANK_ORDER,
  chartKeyAt,
  classifyRfiHand,
  expandRangeTokens,
  handKeyFromCodes,
  rfiCategoryLabel,
  rfiPositionName,
  type HoleCard,
  type RankChar,
  type RfiHandCategory,
  type RfiTableSize,
} from "./rfi-ranges";

export type FacingAction = "fold" | "call" | "raise";
export type FacingCoachBadge = "Best" | "Fine" | "Mistake";

/** Seats that can open (never BB). */
export type FacingOpener6 =
  | "UTG"
  | "HJ"
  | "CO"
  | "BTN"
  | "SB";
export type FacingOpener9 =
  | "UTG"
  | "UTG+1"
  | "MP"
  | "LJ"
  | "HJ"
  | "CO"
  | "BTN"
  | "SB";
export type FacingOpener = FacingOpener6 | FacingOpener9;

/** Seats that can face an open (never UTG — nobody opens before). */
export type FacingHero6 = "HJ" | "CO" | "BTN" | "SB" | "BB";
export type FacingHero9 =
  | "UTG+1"
  | "MP"
  | "LJ"
  | "HJ"
  | "CO"
  | "BTN"
  | "SB"
  | "BB";
export type FacingHero = FacingHero6 | FacingHero9;

export type FacingRange = {
  threeBet: ReadonlySet<string>;
  call: ReadonlySet<string>;
};

const TABLE_ORDER_6 = ["UTG", "HJ", "CO", "BTN", "SB", "BB"] as const;
const TABLE_ORDER_9 = [
  "UTG",
  "UTG+1",
  "MP",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
] as const;

function setFromTokens(tokens: readonly string[]): ReadonlySet<string> {
  return new Set(expandRangeTokens(tokens));
}

function range(threeBet: readonly string[], call: readonly string[]): FacingRange {
  return {
    threeBet: setFromTokens(threeBet),
    call: setFromTokens(call),
  };
}

/**
 * 6-max facing charts (hero → opener → range).
 * Standard-ish 100bb: value 3-bets + polarized bluffs; flats are playable middling hands.
 */
const VS_OPEN_6: Record<FacingHero6, Partial<Record<FacingOpener6, FacingRange>>> = {
  HJ: {
    UTG: range(
      ["JJ+", "AQs+", "AKo"],
      ["TT-88", "AJs", "KQs", "AQo"],
    ),
  },
  CO: {
    UTG: range(
      ["JJ+", "AQs+", "AKo", "A5s-A4s"],
      ["TT-77", "AJs", "KQs", "QJs", "JTs", "AQo"],
    ),
    HJ: range(
      ["TT+", "AJs+", "AQo+", "A5s-A4s", "KQs"],
      ["99-66", "ATs", "KJs", "QJs", "JTs", "T9s", "AJo"],
    ),
  },
  BTN: {
    UTG: range(
      ["TT+", "AQs+", "AKo", "A5s-A2s", "KQs"],
      ["99-55", "AJs-ATs", "KJs", "QJs", "JTs", "T9s", "98s", "AQo"],
    ),
    HJ: range(
      ["99+", "AJs+", "AQo+", "A5s-A2s", "KQs", "KJs"],
      ["88-44", "ATs", "KTs", "QJs-QTs", "JTs", "T9s", "98s", "87s", "AJo", "KQo"],
    ),
    CO: range(
      ["88+", "ATs+", "AJo+", "A5s-A2s", "KJs+", "QJs", "JTs"],
      ["77-33", "A9s-A6s", "KTs", "QTs", "J9s", "T9s", "98s", "87s", "76s", "ATo", "KQo", "KJo", "QJo"],
    ),
  },
  SB: {
    UTG: range(
      ["JJ+", "AQs+", "AKo"],
      ["TT-99", "AJs", "KQs"],
    ),
    HJ: range(
      ["TT+", "AJs+", "AQo+", "A5s-A4s", "KQs"],
      ["99-77", "ATs", "KJs", "QJs", "JTs"],
    ),
    CO: range(
      ["99+", "ATs+", "AJo+", "A5s-A2s", "KJs+", "QJs"],
      ["88-66", "A9s", "KTs", "QTs", "JTs", "T9s", "98s", "ATo", "KQo"],
    ),
    BTN: range(
      ["88+", "ATs+", "AJo+", "A5s-A2s", "KTs+", "QJs", "JTs"],
      ["77-55", "A9s-A6s", "K9s", "QTs", "J9s", "T9s", "98s", "87s", "ATo", "KQo", "KJo", "QJo"],
    ),
  },
  BB: {
    UTG: range(
      ["JJ+", "AQs+", "AKo"],
      ["TT-55", "AJs-ATs", "KQs-KJs", "QJs", "JTs", "T9s", "98s", "AQo", "AJo", "KQo"],
    ),
    HJ: range(
      ["TT+", "AJs+", "AQo+", "A5s-A4s", "KQs"],
      ["99-44", "ATs-A8s", "KJs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "87s", "AJo", "KQo"],
    ),
    CO: range(
      ["99+", "ATs+", "AJo+", "A5s-A2s", "KJs+", "QJs"],
      ["88-33", "A9s-A6s", "KTs-K9s", "QTs-Q9s", "JTs-J9s", "T9s-T8s", "98s", "87s", "76s", "ATo", "KQo", "KJo", "QJo"],
    ),
    BTN: range(
      ["88+", "A9s+", "AJo+", "A5s-A2s", "KTs+", "QTs+", "JTs"],
      ["77-22", "A8s-A2s", "K9s-K7s", "Q9s", "J9s", "T9s-T8s", "98s-97s", "87s-86s", "76s", "65s", "ATo-A8o", "KQo-KTo", "QJo-QTo", "JTo"],
    ),
    SB: range(
      ["77+", "A9s+", "ATo+", "A5s-A2s", "KTs+", "QTs+", "JTs", "T9s"],
      ["66-22", "A8s-A2s", "K9s-K6s", "Q9s-Q8s", "J9s-J8s", "T8s", "98s-97s", "87s-86s", "76s-75s", "65s", "54s", "A9o-A7o", "KJo-KTo", "QJo-QTo", "JTo"],
    ),
  },
};

/** 9-max: reuse 6-max buckets by mapping early opens → UTG and mid opens → HJ. */
const VS_OPEN_9_OPENER_MAP: Record<FacingOpener9, FacingOpener6> = {
  UTG: "UTG",
  "UTG+1": "UTG",
  MP: "UTG",
  LJ: "HJ",
  HJ: "HJ",
  CO: "CO",
  BTN: "BTN",
  SB: "SB",
};

const VS_OPEN_9_HERO_MAP: Record<FacingHero9, FacingHero6> = {
  "UTG+1": "HJ",
  MP: "HJ",
  LJ: "CO",
  HJ: "HJ",
  CO: "CO",
  BTN: "BTN",
  SB: "SB",
  BB: "BB",
};

function tableOrder(tableSize: RfiTableSize): readonly string[] {
  return tableSize === 6 ? TABLE_ORDER_6 : TABLE_ORDER_9;
}

export function facingHeroPositions(tableSize: RfiTableSize): readonly FacingHero[] {
  return tableSize === 6
    ? (["HJ", "CO", "BTN", "SB", "BB"] as const)
    : (["UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"] as const);
}

export function facingOpenerPositions(
  tableSize: RfiTableSize,
  hero: string,
): readonly FacingOpener[] {
  const order = tableOrder(tableSize);
  const heroIdx = order.indexOf(hero);
  if (heroIdx <= 0) return [];
  return order.slice(0, heroIdx) as FacingOpener[];
}

export function isFacingHero(tableSize: RfiTableSize, position: string): position is FacingHero {
  return (facingHeroPositions(tableSize) as readonly string[]).includes(position);
}

export function isValidFacingPair(
  tableSize: RfiTableSize,
  hero: string,
  opener: string,
): boolean {
  return facingOpenerPositions(tableSize, hero).includes(opener as FacingOpener);
}

function rangeFor(
  tableSize: RfiTableSize,
  hero: string,
  opener: string,
): FacingRange | null {
  if (!isValidFacingPair(tableSize, hero, opener)) return null;
  if (tableSize === 6) {
    const block = VS_OPEN_6[hero as FacingHero6];
    return block?.[opener as FacingOpener6] || null;
  }
  const mappedHero = VS_OPEN_9_HERO_MAP[hero as FacingHero9];
  const mappedOpener = VS_OPEN_9_OPENER_MAP[opener as FacingOpener9];
  if (!mappedHero || !mappedOpener) return null;
  // BB vs early 9-max open: keep the tighter UTG defense.
  if (mappedHero === "BB" && (opener === "UTG" || opener === "UTG+1" || opener === "MP")) {
    return VS_OPEN_6.BB.UTG || null;
  }
  return VS_OPEN_6[mappedHero]?.[mappedOpener] || null;
}

/** Standard facing action for a hand (raise = 3-bet). */
export function standardFacingAction(
  tableSize: RfiTableSize,
  hero: string,
  opener: string,
  handKey: string,
): FacingAction | null {
  const chart = rangeFor(tableSize, hero, opener);
  if (!chart) return null;
  if (chart.threeBet.has(handKey)) return "raise";
  if (chart.call.has(handKey)) return "call";
  return "fold";
}

export type FacingGradeResult = {
  correct: boolean;
  standard: FacingAction;
  handKey: string;
};

export function gradeFacingAction(
  tableSize: RfiTableSize,
  hero: string,
  opener: string,
  handKey: string,
  chosen: FacingAction,
): FacingGradeResult | null {
  const standard = standardFacingAction(tableSize, hero, opener, handKey);
  if (!standard) return null;
  return {
    correct: chosen === standard,
    standard,
    handKey,
  };
}

export type FacingChartCell = {
  key: string;
  action: FacingAction;
  row: number;
  col: number;
};

/** 13×13 fold / call / raise matrix for one hero×opener pair. */
export function facingChart(
  tableSize: RfiTableSize,
  hero: string,
  opener: string,
): FacingChartCell[] | null {
  const chart = rangeFor(tableSize, hero, opener);
  if (!chart) return null;
  const cells: FacingChartCell[] = [];
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      const key = chartKeyAt(row, col);
      let action: FacingAction = "fold";
      if (chart.threeBet.has(key)) action = "raise";
      else if (chart.call.has(key)) action = "call";
      cells.push({ key, action, row, col });
    }
  }
  return cells;
}

function parseHandKey(handKey: string): {
  high: RankChar;
  low: RankChar;
  suited: boolean;
  pair: boolean;
} | null {
  if (!handKey || handKey.length < 2) return null;
  const high = handKey[0] as RankChar;
  const low = handKey[1] as RankChar;
  if (!RANK_ORDER.includes(high) || !RANK_ORDER.includes(low)) return null;
  if (handKey.length === 2) {
    if (high !== low) return null;
    return { high, low, suited: false, pair: true };
  }
  const flag = handKey[2];
  if (flag !== "s" && flag !== "o") return null;
  return { high, low, suited: flag === "s", pair: false };
}

function neighborKeys(handKey: string): string[] {
  const parsed = parseHandKey(handKey);
  if (!parsed) return [];
  const out: string[] = [];
  const highIdx = RANK_ORDER.indexOf(parsed.high);
  const lowIdx = RANK_ORDER.indexOf(parsed.low);
  if (parsed.pair) {
    if (highIdx > 0) {
      const up = RANK_ORDER[highIdx - 1]!;
      out.push(`${up}${up}`);
    }
    if (highIdx < RANK_ORDER.length - 1) {
      const down = RANK_ORDER[highIdx + 1]!;
      out.push(`${down}${down}`);
    }
    return out;
  }
  const suffix = parsed.suited ? "s" : "o";
  if (lowIdx < RANK_ORDER.length - 1) {
    out.push(`${parsed.high}${RANK_ORDER[lowIdx + 1]!}${suffix}`);
  }
  if (lowIdx > highIdx + 1) {
    out.push(`${parsed.high}${RANK_ORDER[lowIdx - 1]!}${suffix}`);
  }
  out.push(`${parsed.high}${parsed.low}${parsed.suited ? "o" : "s"}`);
  return out;
}

/**
 * Edge of the standard action's range: a neighbor has a different action.
 * inside = hand is in a play bucket next to a fold; outside = fold next to a play.
 */
export function facingBorderline(
  tableSize: RfiTableSize,
  hero: string,
  opener: string,
  handKey: string,
): "inside" | "outside" | null {
  const standard = standardFacingAction(tableSize, hero, opener, handKey);
  if (!standard) return null;
  const neighbors = neighborKeys(handKey);
  let sawOther = false;
  for (const key of neighbors) {
    const neighbor = standardFacingAction(tableSize, hero, opener, key);
    if (neighbor && neighbor !== standard) {
      sawOther = true;
      break;
    }
  }
  if (!sawOther) return null;
  return standard === "fold" ? "outside" : "inside";
}

export type FacingCoachExplain = {
  verdict: "correct" | "mistake";
  badge: FacingCoachBadge;
  reason: string;
  borderline: "inside" | "outside" | null;
  borderlineNote: string | null;
  category: RfiHandCategory;
  categoryLabel: string;
  heroName: string;
  openerName: string;
  why: string[];
  ruleOfThumb: string;
};

function actionVerb(action: FacingAction): string {
  if (action === "raise") return "3-bet";
  if (action === "call") return "call";
  return "fold";
}

export function explainFacingDecision(
  tableSize: RfiTableSize,
  hero: string,
  opener: string,
  handKey: string,
  chosen: FacingAction,
): FacingCoachExplain | null {
  const graded = gradeFacingAction(tableSize, hero, opener, handKey, chosen);
  if (!graded) return null;
  const category = classifyRfiHand(handKey);
  if (!category) return null;
  const borderline = facingBorderline(tableSize, hero, opener, handKey);
  const heroName = rfiPositionName(hero);
  const openerName = rfiPositionName(opener);
  const categoryLabel = rfiCategoryLabel(category);
  const correct = graded.correct;
  let badge: FacingCoachBadge;
  if (!correct) badge = "Mistake";
  else if (borderline) badge = "Fine";
  else badge = "Best";

  const standardLabel = actionVerb(graded.standard);
  const chosenLabel = actionVerb(chosen);
  let reason: string;
  if (correct && badge === "Best") {
    reason = `${standardLabel.charAt(0).toUpperCase()}${standardLabel.slice(1)} is the chart play vs ${opener} open.`;
  } else if (correct) {
    reason = `${standardLabel.charAt(0).toUpperCase()}${standardLabel.slice(1)} is fine here — near the edge vs ${opener}.`;
  } else {
    reason = `${chosenLabel.charAt(0).toUpperCase()}${chosenLabel.slice(1)} misses — chart says ${standardLabel} vs ${opener}.`;
  }

  const borderlineNote = borderline
    ? borderline === "inside"
      ? "Borderline — this hand sits at the edge of the play range."
      : "Borderline — a nearby hand would play; this one is just outside."
    : null;

  const why: string[] = [
    `You're in ${heroName} facing a raise from ${openerName}.`,
    `With ${categoryLabel} (${handKey}), the chart's play is ${standardLabel}.`,
  ];
  if (graded.standard === "raise") {
    why.push("3-bet for value or as a polarized bluff; don't flat these.");
  } else if (graded.standard === "call") {
    why.push("Flat keeps the pot smaller and plays well multiway or in position.");
  } else {
    why.push("This hand doesn't defend profitably against that open.");
  }

  let ruleOfThumb = "Defend wider in position; tighten up out of position.";
  if (hero === "BB") ruleOfThumb = "Big blind defends widest — price is best here.";
  else if (hero === "BTN") ruleOfThumb = "Button can 3-bet light and flat suited playables.";
  else if (opener === "UTG" || opener === "UTG+1") {
    ruleOfThumb = "Vs early opens, keep 3-bets strong and flats tidy.";
  }

  return {
    verdict: correct ? "correct" : "mistake",
    badge,
    reason,
    borderline,
    borderlineNote,
    category,
    categoryLabel,
    heroName,
    openerName,
    why,
    ruleOfThumb,
  };
}

export type FacingTeachingHint = {
  concept: string;
  reveal: string;
  standard: FacingAction;
};

export function facingTeachingHint(
  tableSize: RfiTableSize,
  hero: string,
  opener: string,
  handKey: string,
): FacingTeachingHint | null {
  const standard = standardFacingAction(tableSize, hero, opener, handKey);
  if (!standard) return null;
  const heroName = rfiPositionName(hero);
  const openerName = rfiPositionName(opener);
  const category = classifyRfiHand(handKey);
  const categoryLabel = category ? rfiCategoryLabel(category) : "this hand";
  const concept = `You're ${heroName} facing ${openerName}'s open. In position or with a discount? That shapes call vs 3-bet vs fold.`;
  let reveal: string;
  if (standard === "raise") {
    reveal = `3-bet. With ${categoryLabel} (${handKey}), the chart re-raises vs ${opener}.`;
  } else if (standard === "call") {
    reveal = `Call. ${categoryLabel} (${handKey}) flats vs ${opener} — keep the pot controlled.`;
  } else {
    reveal = `Fold. ${categoryLabel} (${handKey}) doesn't defend vs ${opener} on this chart.`;
  }
  return { concept, reveal, standard };
}

const SUIT_GLYPH: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

function cardFromCode(code: string): HoleCard | null {
  if (!/^[2-9TJQKA][cdhs]$/i.test(code)) return null;
  const rankChar = code[0]!.toUpperCase();
  const suitLetter = code[1]!.toLowerCase();
  const suit = SUIT_GLYPH[suitLetter];
  if (!suit) return null;
  const rank = rankChar === "T" ? "10" : rankChar;
  return {
    code: `${rankChar}${suitLetter}`,
    rank,
    suit,
    color: suitLetter === "h" || suitLetter === "d" ? "red" : "black",
  };
}

const FULL_DECK: string[] = (() => {
  const codes: string[] = [];
  for (const rank of RANK_ORDER) {
    for (const suit of ["s", "h", "d", "c"]) {
      codes.push(`${rank}${suit}`);
    }
  }
  return codes;
})();

function shuffleInPlace(cards: string[], random: () => number): void {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = tmp;
  }
}

/** Open size in chips for puzzles (3× big blind). */
export const FACING_OPEN_BB_MULT = 3;

export type DealtFacingSpot = {
  tableSize: RfiTableSize;
  heroPosition: FacingHero;
  openerPosition: FacingOpener;
  /** Positions between opener and hero that flat-called (usually none). */
  callers: string[];
  cards: [HoleCard, HoleCard];
  handKey: string;
  standard: FacingAction;
  bigBlind: number;
  smallBlind: number;
  openTo: number;
  toCall: number;
  pot: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  /** Preferred 3-bet size before legalRaiseTo snap (caller snaps). */
  preferredRaiseTo: number;
};

/**
 * Deal a random facing-raise puzzle: opener raised, folds/calls between,
 * action on hero with a charted fold/call/3-bet decision.
 */
export function dealRandomFacingSpot(
  tableSize: RfiTableSize,
  options: {
    random?: () => number;
    smallBlind?: number;
    bigBlind?: number;
    startingStack?: number;
  } = {},
): DealtFacingSpot {
  const random = options.random || Math.random;
  const smallBlind = Math.max(1, Math.floor(options.smallBlind || 10));
  const bigBlind = Math.max(smallBlind * 2, Math.floor(options.bigBlind || 20));
  const startingStack = Math.max(bigBlind * 20, Math.floor(options.startingStack || 1000));

  const heroes = facingHeroPositions(tableSize);
  const heroPosition = heroes[Math.floor(random() * heroes.length)]!;
  const openers = facingOpenerPositions(tableSize, heroPosition);
  const openerPosition = openers[Math.floor(random() * openers.length)]!;

  const order = tableOrder(tableSize);
  const openerIdx = order.indexOf(openerPosition);
  const heroIdx = order.indexOf(heroPosition);
  const between = order.slice(openerIdx + 1, heroIdx);

  // ~20% of spots include one cold-caller when there is a seat between.
  const callers: string[] = [];
  if (between.length > 0 && random() < 0.2) {
    const pick = between[Math.floor(random() * between.length)]!;
    callers.push(pick);
  }

  const deck = FULL_DECK.slice();
  shuffleInPlace(deck, random);
  const codeA = deck[0]!;
  const codeB = deck[1]!;
  const cardA = cardFromCode(codeA)!;
  const cardB = cardFromCode(codeB)!;
  const handKey = handKeyFromCodes(codeA, codeB)!;
  const standard = standardFacingAction(tableSize, heroPosition, openerPosition, handKey)!;

  const openTo = bigBlind * FACING_OPEN_BB_MULT;
  const heroPosted =
    heroPosition === "BB" ? bigBlind : heroPosition === "SB" ? smallBlind : 0;
  const toCall = Math.max(0, openTo - heroPosted);
  const pot =
    smallBlind +
    bigBlind +
    (openTo - (openerPosition === "SB" ? smallBlind : 0)) +
    callers.length * openTo;
  const lastRaiseSize = openTo - bigBlind;
  const minRaiseTo = openTo + lastRaiseSize;
  const heroStack = startingStack - heroPosted;
  const maxRaiseTo = heroStack + heroPosted;
  const preferredRaiseTo = openTo * 3;

  return {
    tableSize,
    heroPosition,
    openerPosition,
    callers,
    cards: [cardA, cardB],
    handKey,
    standard,
    bigBlind,
    smallBlind,
    openTo,
    toCall,
    pot,
    minRaiseTo,
    maxRaiseTo,
    preferredRaiseTo,
  };
}
