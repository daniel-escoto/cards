/**
 * Approximate standard RFI (raise-first-in) opening ranges by table size and seat.
 * These are widely used training charts — approximate recreational/standard opens —
 * not solver-derived frequencies. Kept in one shared module so the in-game Coach
 * can reuse the same data later.
 */

export type RfiTableSize = 6 | 9;
export type RfiAction = "raise" | "fold";

/** 6-max RFI seats (folded to you). BB is omitted — walks are not RFI drills. */
export type RfiPosition6Max = "UTG" | "HJ" | "CO" | "BTN" | "SB";

/** 9-max RFI seats (folded to you). BB is omitted. */
export type RfiPosition9Max =
  | "UTG"
  | "UTG+1"
  | "MP"
  | "LJ"
  | "HJ"
  | "CO"
  | "BTN"
  | "SB";

export type RfiPosition = RfiPosition6Max | RfiPosition9Max;

export const RANK_ORDER = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export type RankChar = (typeof RANK_ORDER)[number];

export const POSITIONS_6MAX: readonly RfiPosition6Max[] = ["UTG", "HJ", "CO", "BTN", "SB"];
export const POSITIONS_9MAX: readonly RfiPosition9Max[] = [
  "UTG",
  "UTG+1",
  "MP",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
];

const RANK_INDEX: Record<string, number> = Object.fromEntries(
  RANK_ORDER.map((rank, index) => [rank, index]),
);

function isRankChar(value: string): value is RankChar {
  return Object.prototype.hasOwnProperty.call(RANK_INDEX, value);
}

function rankIndex(rank: string): number {
  return RANK_INDEX[rank] ?? -1;
}

/** Normalize two hole-card codes (`As`, `Kh`) into a chart key (`AKo`, `77`, `T9s`). */
export function handKeyFromCodes(codeA: string, codeB: string): string | null {
  if (!/^[2-9TJQKA][cdhs]$/i.test(codeA) || !/^[2-9TJQKA][cdhs]$/i.test(codeB)) {
    return null;
  }
  const rankA = codeA[0]!.toUpperCase();
  const rankB = codeB[0]!.toUpperCase();
  const suitA = codeA[1]!.toLowerCase();
  const suitB = codeB[1]!.toLowerCase();
  if (!isRankChar(rankA) || !isRankChar(rankB)) return null;
  if (rankA === rankB) return `${rankA}${rankB}`;
  const suited = suitA === suitB;
  const highFirst = rankIndex(rankA) <= rankIndex(rankB);
  const high = highFirst ? rankA : rankB;
  const low = highFirst ? rankB : rankA;
  return `${high}${low}${suited ? "s" : "o"}`;
}

/** Chart cell key for row/col in a 13×13 grid (row 0 = Ace). */
export function chartKeyAt(row: number, col: number): string {
  const rowRank = RANK_ORDER[row];
  const colRank = RANK_ORDER[col];
  if (!rowRank || !colRank) return "";
  if (row === col) return `${rowRank}${colRank}`;
  if (row < col) return `${rowRank}${colRank}s`;
  return `${colRank}${rowRank}o`;
}

function pairsFrom(minPair: string): string[] {
  const minRank = minPair[0]!;
  const start = rankIndex(minRank);
  if (start < 0) return [];
  return RANK_ORDER.slice(0, start + 1).map((rank) => `${rank}${rank}`);
}

function broadwayPlus(high: string, minLow: string, suited: boolean): string[] {
  const highIdx = rankIndex(high);
  const minLowIdx = rankIndex(minLow);
  if (highIdx < 0 || minLowIdx < 0 || minLowIdx <= highIdx) return [];
  const out: string[] = [];
  for (let i = highIdx + 1; i <= minLowIdx; i += 1) {
    const low = RANK_ORDER[i]!;
    out.push(`${high}${low}${suited ? "s" : "o"}`);
  }
  return out;
}

/** Expand compact tokens like `77+`, `ATs+`, `ATo+`, `KQs` into hand keys. */
export function expandRangeTokens(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;
    const pairPlus = /^([2-9TJQKA])\1\+$/i.exec(token);
    if (pairPlus) {
      out.push(...pairsFrom(`${pairPlus[1]!.toUpperCase()}${pairPlus[1]!.toUpperCase()}`));
      continue;
    }
    const plusSuited = /^([2-9TJQKA])([2-9TJQKA])s\+$/i.exec(token);
    if (plusSuited) {
      out.push(...broadwayPlus(plusSuited[1]!.toUpperCase(), plusSuited[2]!.toUpperCase(), true));
      continue;
    }
    const plusOff = /^([2-9TJQKA])([2-9TJQKA])o\+$/i.exec(token);
    if (plusOff) {
      out.push(...broadwayPlus(plusOff[1]!.toUpperCase(), plusOff[2]!.toUpperCase(), false));
      continue;
    }
    const single = /^([2-9TJQKA])([2-9TJQKA])([so])$/i.exec(token);
    if (single) {
      const a = single[1]!.toUpperCase();
      const b = single[2]!.toUpperCase();
      const suited = single[3]!.toLowerCase() === "s";
      if (rankIndex(a) > rankIndex(b)) {
        out.push(`${b}${a}${suited ? "s" : "o"}`);
      } else {
        out.push(`${a}${b}${suited ? "s" : "o"}`);
      }
      continue;
    }
    const pair = /^([2-9TJQKA])\1$/i.exec(token);
    if (pair) {
      const rank = pair[1]!.toUpperCase();
      out.push(`${rank}${rank}`);
    }
  }
  return out;
}

function setFromTokens(tokens: readonly string[]): ReadonlySet<string> {
  return new Set(expandRangeTokens(tokens));
}

/**
 * 6-max RFI raise sets. Later seats are looser; values are approximate open charts.
 */
const RFI_6MAX: Record<RfiPosition6Max, ReadonlySet<string>> = {
  UTG: setFromTokens(["77+", "ATs+", "AJo+", "KQs", "KQo", "QJs", "JTs"]),
  HJ: setFromTokens([
    "66+",
    "A9s+",
    "ATo+",
    "KTs+",
    "KJo+",
    "QTs+",
    "QJo",
    "JTs",
    "T9s",
    "98s",
  ]),
  CO: setFromTokens([
    "55+",
    "A2s+",
    "A9o+",
    "K9s+",
    "KTo+",
    "Q9s+",
    "QTo+",
    "J9s+",
    "JTo",
    "T8s+",
    "T9o",
    "97s+",
    "98o",
    "87s",
    "76s",
    "65s",
  ]),
  BTN: setFromTokens([
    "22+",
    "A2s+",
    "A2o+",
    "K2s+",
    "K7o+",
    "Q4s+",
    "Q8o+",
    "J6s+",
    "J8o+",
    "T6s+",
    "T8o+",
    "96s+",
    "97o",
    "85s+",
    "87o",
    "74s+",
    "76o",
    "63s+",
    "65o",
    "53s+",
    "54o",
    "43s",
  ]),
  SB: setFromTokens([
    "22+",
    "A2s+",
    "A2o+",
    "K2s+",
    "K8o+",
    "Q5s+",
    "Q9o+",
    "J7s+",
    "J9o+",
    "T7s+",
    "T9o",
    "96s+",
    "98o",
    "85s+",
    "87o",
    "75s+",
    "65s",
    "54s",
  ]),
};

/**
 * 9-max RFI raise sets. Early seats are tighter than 6-max; late seats match 6-max.
 */
const RFI_9MAX: Record<RfiPosition9Max, ReadonlySet<string>> = {
  UTG: setFromTokens(["88+", "ATs+", "AQo+", "KQs", "QJs"]),
  "UTG+1": setFromTokens(["77+", "ATs+", "AJo+", "KQs", "KQo", "QJs", "JTs"]),
  MP: setFromTokens(["77+", "A9s+", "AJo+", "KTs+", "KQo", "QJs", "QJo", "JTs", "T9s"]),
  LJ: setFromTokens([
    "66+",
    "A9s+",
    "ATo+",
    "KTs+",
    "KJo+",
    "QTs+",
    "QJo",
    "JTs",
    "T9s",
    "98s",
  ]),
  HJ: RFI_6MAX.HJ,
  CO: RFI_6MAX.CO,
  BTN: RFI_6MAX.BTN,
  SB: RFI_6MAX.SB,
};

export function positionsForTable(tableSize: RfiTableSize): readonly RfiPosition[] {
  return tableSize === 6 ? POSITIONS_6MAX : POSITIONS_9MAX;
}

export function isRfiPosition(tableSize: RfiTableSize, position: string): position is RfiPosition {
  return (positionsForTable(tableSize) as readonly string[]).includes(position);
}

function raiseSetFor(tableSize: RfiTableSize, position: RfiPosition): ReadonlySet<string> | null {
  if (tableSize === 6) {
    if (!(position in RFI_6MAX)) return null;
    return RFI_6MAX[position as RfiPosition6Max];
  }
  if (!(position in RFI_9MAX)) return null;
  return RFI_9MAX[position as RfiPosition9Max];
}

/** Standard RFI action for a hand at a seat (raise or fold). */
export function standardRfiAction(
  tableSize: RfiTableSize,
  position: string,
  handKey: string,
): RfiAction | null {
  if (!isRfiPosition(tableSize, position)) return null;
  const raiseSet = raiseSetFor(tableSize, position);
  if (!raiseSet) return null;
  return raiseSet.has(handKey) ? "raise" : "fold";
}

export type GradeResult = {
  correct: boolean;
  standard: RfiAction;
  handKey: string;
};

/** Grade a player's Raise/Fold choice against the shared chart. */
export function gradeRfiAction(
  tableSize: RfiTableSize,
  position: string,
  handKey: string,
  chosen: RfiAction,
): GradeResult | null {
  const standard = standardRfiAction(tableSize, position, handKey);
  if (!standard) return null;
  return {
    correct: chosen === standard,
    standard,
    handKey,
  };
}

export type ChartCell = {
  key: string;
  action: RfiAction;
  row: number;
  col: number;
};

/** Full 13×13 raise/fold matrix for one seat (for the feedback chart). */
export function rfiChart(tableSize: RfiTableSize, position: string): ChartCell[] | null {
  if (!isRfiPosition(tableSize, position)) return null;
  const raiseSet = raiseSetFor(tableSize, position);
  if (!raiseSet) return null;
  const cells: ChartCell[] = [];
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      const key = chartKeyAt(row, col);
      cells.push({
        key,
        action: raiseSet.has(key) ? "raise" : "fold",
        row,
        col,
      });
    }
  }
  return cells;
}

export type HoleCard = { code: string; rank: string; suit: string; color: "red" | "black" };

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

export type DealtRfiSpot = {
  tableSize: RfiTableSize;
  position: RfiPosition;
  cards: [HoleCard, HoleCard];
  handKey: string;
  standard: RfiAction;
};

/** Deal a random RFI spot: two hole cards + a random seat for the table size. */
export function dealRandomRfiSpot(
  tableSize: RfiTableSize,
  random: () => number = Math.random,
): DealtRfiSpot {
  const positions = positionsForTable(tableSize);
  const position = positions[Math.floor(random() * positions.length)]!;
  const deck = FULL_DECK.slice();
  shuffleInPlace(deck, random);
  const codeA = deck[0]!;
  const codeB = deck[1]!;
  const cardA = cardFromCode(codeA)!;
  const cardB = cardFromCode(codeB)!;
  const handKey = handKeyFromCodes(codeA, codeB)!;
  const standard = standardRfiAction(tableSize, position, handKey)!;
  return {
    tableSize,
    position,
    cards: [cardA, cardB],
    handKey,
    standard,
  };
}

/** Hand buckets for short coach explanations. */
export type RfiHandCategory =
  | "pair"
  | "suited_ace"
  | "suited_broadway"
  | "offsuit_broadway"
  | "suited_connector"
  | "trash";

/** Seat bands for RFI advice. */
export type RfiPositionBand = "early" | "middle" | "late" | "blinds";

export type RfiCoachExplain = {
  verdict: "correct" | "mistake";
  /** Optional chess.com-style badge when the play matches best. */
  badge: "Best" | null;
  reason: string;
  borderline: "inside" | "outside" | null;
  category: RfiHandCategory;
  band: RfiPositionBand;
};

const BROADWAY = new Set(["A", "K", "Q", "J", "T"]);

function parseHandKey(handKey: string): {
  high: RankChar;
  low: RankChar;
  suited: boolean;
  pair: boolean;
} | null {
  if (!handKey || handKey.length < 2) return null;
  const high = handKey[0] as RankChar;
  const low = handKey[1] as RankChar;
  if (!isRankChar(high) || !isRankChar(low)) return null;
  if (handKey.length === 2) {
    if (high !== low) return null;
    return { high, low, suited: false, pair: true };
  }
  const flag = handKey[2];
  if (flag !== "s" && flag !== "o") return null;
  return { high, low, suited: flag === "s", pair: false };
}

function rankGap(high: RankChar, low: RankChar): number {
  return Math.abs(rankIndex(high) - rankIndex(low));
}

/** Classify a hand key into a coach category. */
export function classifyRfiHand(handKey: string): RfiHandCategory | null {
  const parsed = parseHandKey(handKey);
  if (!parsed) return null;
  if (parsed.pair) return "pair";
  if (parsed.suited && parsed.high === "A") return "suited_ace";
  const bothBroadway = BROADWAY.has(parsed.high) && BROADWAY.has(parsed.low);
  if (bothBroadway) return parsed.suited ? "suited_broadway" : "offsuit_broadway";
  if (parsed.suited && rankGap(parsed.high, parsed.low) <= 2) return "suited_connector";
  return "trash";
}

/** Map a seat to early / middle / late / blinds. */
export function rfiPositionBand(tableSize: RfiTableSize, position: string): RfiPositionBand | null {
  if (position === "BB") return "blinds";
  if (!isRfiPosition(tableSize, position)) return null;
  if (position === "SB") return "blinds";
  if (position === "BTN" || position === "CO") return "late";
  if (tableSize === 6) {
    if (position === "UTG") return "early";
    if (position === "HJ") return "middle";
  } else if (position === "UTG" || position === "UTG+1" || position === "MP") {
    return "early";
  } else if (position === "LJ" || position === "HJ") {
    return "middle";
  }
  return "middle";
}

function neighborKeys(handKey: string): string[] {
  const parsed = parseHandKey(handKey);
  if (!parsed) return [];
  const out: string[] = [];
  const highIdx = rankIndex(parsed.high);
  const lowIdx = rankIndex(parsed.low);
  if (parsed.pair) {
    if (highIdx + 1 < RANK_ORDER.length) out.push(`${RANK_ORDER[highIdx + 1]}${RANK_ORDER[highIdx + 1]}`);
    if (highIdx > 0) out.push(`${RANK_ORDER[highIdx - 1]}${RANK_ORDER[highIdx - 1]}`);
    return out;
  }
  const suffix = parsed.suited ? "s" : "o";
  if (lowIdx + 1 < RANK_ORDER.length && lowIdx + 1 !== highIdx) {
    out.push(`${parsed.high}${RANK_ORDER[lowIdx + 1]}${suffix}`);
  }
  if (lowIdx > 0 && lowIdx - 1 !== highIdx) {
    out.push(`${parsed.high}${RANK_ORDER[lowIdx - 1]}${suffix}`);
  }
  // Suit flip toward the stronger / weaker version.
  out.push(`${parsed.high}${parsed.low}${parsed.suited ? "o" : "s"}`);
  return out;
}

/**
 * Borderline = just inside the raise set (a weaker neighbor folds) or just outside
 * (a stronger neighbor raises).
 */
export function rfiBorderline(
  tableSize: RfiTableSize,
  position: string,
  handKey: string,
): "inside" | "outside" | null {
  if (!isRfiPosition(tableSize, position)) return null;
  const raiseSet = raiseSetFor(tableSize, position);
  if (!raiseSet) return null;
  const standard = raiseSet.has(handKey) ? "raise" : "fold";
  const neighbors = neighborKeys(handKey);
  if (standard === "raise") {
    if (neighbors.some((key) => !raiseSet.has(key))) return "inside";
    return null;
  }
  if (neighbors.some((key) => raiseSet.has(key))) return "outside";
  return null;
}

function pairRankLabel(high: RankChar): string {
  if (high === "A" || high === "K" || high === "Q" || high === "J") return "big";
  if (high === "T" || high === "9" || high === "8") return "mid";
  return "small";
}

function reasonFor(
  category: RfiHandCategory,
  band: RfiPositionBand,
  standard: RfiAction,
  handKey: string,
): string {
  const parsed = parseHandKey(handKey)!;
  if (category === "pair") {
    const size = pairRankLabel(parsed.high);
    if (standard === "raise") {
      if (size === "big") return "Pairs this big always open.";
      if (band === "early") return "Mid pairs open from early seats.";
      if (band === "blinds") return "Pairs play fine as a blind open.";
      return "This pair is strong enough to open.";
    }
    if (band === "early") return "Too many players behind for this pair.";
    return "This pair is too weak to open here.";
  }
  if (category === "suited_ace") {
    if (standard === "raise") {
      if (band === "late" || band === "blinds") return "Suited aces play well late — open.";
      return "Suited aces realize well — open.";
    }
    return "Weak suited ace is too thin early.";
  }
  if (category === "suited_broadway") {
    if (standard === "raise") return "Suited broadway opens for value.";
    return "Suited broadway still too thin early.";
  }
  if (category === "offsuit_broadway") {
    if (standard === "raise") {
      if (band === "late" || band === "blinds") return "Offsuit broadway is fine late.";
      return "This broadway is strong enough to open.";
    }
    if (band === "early") return `${handKey} is too weak to open early.`;
    return `${handKey} gets dominated by better kickers.`;
  }
  if (category === "suited_connector") {
    if (standard === "raise") {
      if (band === "late" || band === "blinds") return "Suited connectors play well late.";
      return "Suited connectors can open here.";
    }
    if (band === "early") return "Too many players behind for suited connectors.";
    return "This connector is too weak to open.";
  }
  // trash
  if (standard === "raise") return "This speculative hand still opens here.";
  if (band === "early") return "Trash hands fold with players left to act.";
  if (band === "late") return "Still too weak to open, even late.";
  return "This hand is too weak to open.";
}

function trimWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}.`;
}

/**
 * Chess.com-style one-liner: why the standard raise/fold is right for this spot.
 * Optional borderline note when the hand sits on the range edge.
 */
export function explainRfiDecision(
  tableSize: RfiTableSize,
  position: string,
  handKey: string,
  chosen: RfiAction,
): RfiCoachExplain | null {
  const graded = gradeRfiAction(tableSize, position, handKey, chosen);
  if (!graded) return null;
  const category = classifyRfiHand(handKey);
  const band = rfiPositionBand(tableSize, position);
  if (!category || !band) return null;
  const borderline = rfiBorderline(tableSize, position, handKey);
  let reason = reasonFor(category, band, graded.standard, handKey);
  if (borderline === "inside") {
    reason = `Borderline — just inside the ${position} range.`;
  } else if (borderline === "outside") {
    reason = `Borderline — just outside the ${position} range.`;
  } else if (!graded.correct && graded.standard === "fold" && category === "offsuit_broadway") {
    reason = `${handKey} is too weak to open from ${position}.`;
  } else if (!graded.correct && graded.standard === "raise") {
    // Mistaken fold: emphasize the open.
    if (category === "pair") reason = "Pairs this big always open.";
    else if (category === "suited_ace") reason = "Suited aces play well — open.";
    else if (category === "suited_broadway") reason = "Suited broadway should open.";
    else if (band === "late") reason = `Open this from ${position}.`;
  }
  reason = trimWords(reason, 12);
  return {
    verdict: graded.correct ? "correct" : "mistake",
    badge: graded.correct ? "Best" : null,
    reason,
    borderline,
    category,
    band,
  };
}
