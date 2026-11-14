/**
 * Offline AI coach for bot-only tables. Uses hero cards + board only (never
 * opponent holes). Equity via the shared engine's Monte Carlo helpers.
 * Implied-odds upgrades for speculative hands live in shared/coach-odds.
 */
(function (
  root: typeof globalThis & {
    Coach?: CoachAPI;
    HoldemEngine?: HoldemEngineAPI;
    CoachOdds?: CoachOddsAPI;
    RaiseSizing?: RaiseSizingAPI;
  },
  factory: (
    engine: HoldemEngineAPI | undefined,
    hand: { solve: (cards: string[]) => { descr?: string } } | undefined,
    odds: CoachOddsAPI | undefined,
    sizing: RaiseSizingAPI | undefined,
  ) => CoachAPI,
) {
  if (typeof module === "object" && module.exports) {
    let engine: HoldemEngineAPI | undefined;
    try {
      engine = require("../shared/engine.node.js") as HoldemEngineAPI;
    } catch {
      engine = undefined;
    }
    let odds: CoachOddsAPI | undefined;
    try {
      odds = require("../shared/coach-odds.node.js") as CoachOddsAPI;
    } catch {
      try {
        odds = require("../shared/coach-odds.js") as CoachOddsAPI;
      } catch {
        odds = undefined;
      }
    }
    let sizing: RaiseSizingAPI | undefined;
    try {
      sizing = require("./raise-sizing.js") as RaiseSizingAPI;
    } catch {
      sizing = undefined;
    }
    module.exports = factory(engine, undefined, odds, sizing);
  } else {
    const handGlobal =
      typeof Hand !== "undefined" && Hand && typeof Hand.solve === "function"
        ? { solve: (cards: string[]) => Hand.solve(cards) as { descr?: string } }
        : undefined;
    root.Coach = factory(root.HoldemEngine, handGlobal, root.CoachOdds, root.RaiseSizing);
  }
})(
  typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis),
  function (engine, handApi, oddsApi, sizingApi) {
    "use strict";

    type SeatLike = { id: string; isYou?: boolean; isBot?: boolean };

    function coachAvailableForPlayers(players: SeatLike[] | null | undefined, viewerId?: string | null) {
      const seats = players || [];
      const hero =
        (viewerId && seats.find((player) => player.id === viewerId)) ||
        seats.find((player) => player.isYou);
      if (!hero || hero.isBot) return false;
      return seats.every((player) => player.id === hero.id || Boolean(player.isBot));
    }

    function cardCode(card: PublicCard | null | undefined): string | null {
      if (!card) return null;
      if (card.code && /^[2-9TJQKA][cdhs]$/i.test(card.code)) return card.code;
      return null;
    }

    function visibleHeroCodes(player: ClientPlayer | null | undefined): string[] {
      if (!player?.isYou) return [];
      return (player.cards || []).map(cardCode).filter((code): code is string => Boolean(code));
    }

    function boardCodes(room: ClientRoom): string[] {
      return (room.community || []).map(cardCode).filter((code): code is string => Boolean(code));
    }

    function pct(value: number) {
      return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
    }

    function handLabel(heroCodes: string[], board: string[]) {
      if (heroCodes.length !== 2) return "Unknown";
      if (board.length >= 3 && handApi && typeof handApi.solve === "function") {
        try {
          const solved = handApi.solve([...heroCodes, ...board]);
          return String(solved?.descr || "Made hand");
        } catch {
          /* fall through */
        }
      }
      if (engine && typeof engine.preflopHandScore === "function") {
        const score = engine.preflopHandScore(heroCodes);
        if (score >= 0.75) return "Strong preflop";
        if (score >= 0.45) return "Playable preflop";
        return "Weak preflop";
      }
      return board.length ? "Postflop" : "Preflop";
    }

    function estimateEquity(
      heroCodes: string[],
      board: string[],
      opponents: number,
      toCall: number,
      random: () => number,
      iterations: number,
    ) {
      const opp = Math.max(1, opponents);
      if (!engine) return 1 / (opp + 1);
      if (board.length > 0 && typeof engine.estimatePostflopEquity === "function") {
        const headsUp = engine.estimatePostflopEquity(heroCodes, board, iterations, random);
        return headsUp ** opp;
      }
      if (typeof engine.estimatePreflopEquityAgainstRange === "function") {
        const range = toCall > 0 ? 0.45 : 0.85;
        const headsUp = engine.estimatePreflopEquityAgainstRange(
          heroCodes,
          range,
          iterations,
          random,
        );
        return headsUp ** opp;
      }
      return 1 / (opp + 1);
    }

    function pickRaiseTo(room: ClientRoom, hero: ClientPlayer, aggressive: boolean) {
      const pot = Math.max(0, Number(room.pot) || 0);
      const toCall = Math.max(0, Number(room.toCall) || 0);
      const currentBet = Math.max(0, Number(room.currentBet) || 0);
      const minRaiseTo = Math.max(0, Number(room.minRaiseTo) || currentBet + (room.minRaise || 0));
      const step = Math.max(1, Number(room.bigBlind) || Number(room.minRaise) || 1);
      const maxRaise = hero.bet + hero.stack;
      if (maxRaise <= currentBet) return null;
      // Prefer pot-fraction sizing, then snap onto the same legal ladder as the raise box.
      const raw = aggressive
        ? Math.round(currentBet + Math.max(toCall, pot * 0.75))
        : Math.round(Math.max(minRaiseTo, currentBet + Math.max(toCall, pot * 0.5)));
      if (sizingApi && typeof sizingApi.legalRaiseTo === "function") {
        return sizingApi.legalRaiseTo(raw, {
          minRaiseTo: Math.min(maxRaise, minRaiseTo),
          maxRaiseTo: maxRaise,
          step,
        });
      }
      const minLegal = Math.min(maxRaise, minRaiseTo);
      const clamped = Math.max(minLegal, Math.min(maxRaise, raw));
      if (clamped <= currentBet) return maxRaise;
      return clamped;
    }

    function applyImpliedOdds(
      heroCodes: [string, string],
      boardLength: number,
      equity: number,
      potOdds: number,
      toCall: number,
      effectiveStack: number,
    ): { action: "fold" | "call"; verdict: CoachVerdict; reason: string } | null {
      if (!oddsApi || typeof oddsApi.adviseFacingBet !== "function") return null;
      const advice = oddsApi.adviseFacingBet({
        equity,
        potOdds,
        toCall,
        effectiveStack,
        heroCodes,
        boardLength,
      });
      return {
        action: advice.action,
        verdict: advice.verdict,
        reason: advice.reason,
      };
    }

    function buildCoachSuggestion(
      room: ClientRoom | null | undefined,
      options: { random?: () => number; iterations?: number } = {},
    ): CoachSuggestion | null {
      if (!room || !coachAvailableForPlayers(room.players)) return null;
      if (room.isSpectator) return null;
      if (!room.isYourTurn) return null;
      if (!["preflop", "flop", "turn", "river"].includes(room.phase)) return null;

      const hero = (room.players || []).find((player) => player.isYou) || null;
      if (!hero || hero.folded || hero.allIn) return null;
      const heroCodes = visibleHeroCodes(hero);
      if (heroCodes.length !== 2) return null;

      // Fairness: ignore every other seat's cards entirely (even if somehow present).
      const liveOpponents = (room.players || []).filter(
        (player) =>
          !player.isYou && !player.folded && (player.stack > 0 || player.allIn || player.invested > 0),
      );
      const opponents = liveOpponents.length;
      const board = boardCodes(room);
      const toCall = Math.max(0, Number(room.toCall) || 0);
      const pot = Math.max(0, Number(room.pot) || 0);
      const potOdds = toCall > 0 ? toCall / Math.max(1, pot + toCall) : 0;
      const random = options.random || Math.random;
      const iterations = Math.max(40, Math.min(240, Math.floor(Number(options.iterations) || 120)));
      const equity = estimateEquity(heroCodes, board, Math.max(1, opponents), toCall, random, iterations);
      const label = handLabel(heroCodes, board);
      const effectiveStack =
        oddsApi && typeof oddsApi.effectiveStackForCall === "function"
          ? oddsApi.effectiveStackForCall(
              hero.stack,
              liveOpponents.map((player) => player.stack),
            )
          : hero.stack;

      const canRaise = Boolean(room.canRaise || room.canShove);
      const maxRaise = hero.bet + hero.stack;
      let action: CoachSuggestion["action"];
      let verdict: CoachVerdict;
      let raiseTo: number | null = null;
      let reason: string;

      if (toCall <= 0) {
        if (equity >= 0.62 && canRaise && maxRaise > room.currentBet) {
          action = room.currentBet > 0 ? "raise" : "bet";
          verdict = action;
          raiseTo = pickRaiseTo(room, hero, true);
          reason = "Strong equity — take the lead.";
        } else if (equity >= 0.4 && canRaise && maxRaise > room.currentBet && equity >= 0.52) {
          action = room.currentBet > 0 ? "raise" : "bet";
          verdict = action;
          raiseTo = pickRaiseTo(room, hero, false);
          reason = "Slight edge — small value bet.";
        } else {
          action = "check";
          verdict = "check";
          reason = equity < 0.35 ? "Weak — keep the pot small." : "No price to call — check.";
        }
      } else if (equity + 0.03 < potOdds) {
        const codes: [string, string] = [heroCodes[0]!, heroCodes[1]!];
        const implied = applyImpliedOdds(codes, board.length, equity, potOdds, toCall, effectiveStack);
        if (implied) {
          action = implied.action;
          verdict = implied.verdict;
          reason = implied.reason;
        } else {
          action = "fold";
          verdict = "fold";
          reason = `You need to win ${pct(potOdds)} to call; you win about ${pct(equity)}. Fold.`;
        }
      } else if (equity >= potOdds + 0.12 && canRaise && maxRaise > room.currentBet) {
        action = "raise";
        verdict = "raise";
        raiseTo = pickRaiseTo(room, hero, equity >= 0.65);
        reason = `Well ahead of the price (${pct(equity)} vs ${pct(potOdds)} needed). Raise.`;
      } else {
        action = "call";
        verdict = "call";
        reason =
          equity >= potOdds
            ? `You need to win ${pct(potOdds)} to call; you win about ${pct(equity)}. Call.`
            : `Close with pot odds (${pct(equity)} vs ${pct(potOdds)}). Call.`;
      }

      const actionLabel =
        verdict === "borderline"
          ? "Borderline"
          : action === "raise" || action === "bet"
            ? `${action === "bet" ? "Bet" : "Raise"} ${raiseTo ?? ""}`.trim()
            : action.charAt(0).toUpperCase() + action.slice(1);

      return {
        equity,
        potOdds,
        toCall,
        opponents: Math.max(1, opponents),
        handLabel: label,
        action,
        verdict,
        raiseTo,
        reason,
        summary: `${label} · ${pct(equity)} equity vs ${Math.max(1, opponents)} · ${
          toCall > 0 ? `pot odds ${pct(potOdds)} (call ${toCall})` : "no bet to call"
        } · ${actionLabel} — ${reason}`,
      };
    }

    function actionHeadline(suggestion: CoachSuggestion): string {
      if (suggestion.verdict === "borderline") return "Borderline";
      if (suggestion.action === "raise" || suggestion.action === "bet") {
        const verb = suggestion.action === "bet" ? "Bet" : "Raise to";
        return suggestion.raiseTo != null ? `${verb} ${suggestion.raiseTo}` : verb;
      }
      return suggestion.action.charAt(0).toUpperCase() + suggestion.action.slice(1);
    }

    function formatToCall(suggestion: CoachSuggestion, room: ClientRoom): string {
      if (suggestion.toCall <= 0) return "—";
      if (room.moneyMode) {
        return `$${(Math.round(Number(room.toCallCents) || 0) / 100).toFixed(2)}`;
      }
      return String(suggestion.toCall);
    }

    /** Structured coach card copy (headline / reason / stats). */
    function formatCoachHintModel(suggestion: CoachSuggestion, room: ClientRoom): CoachHintModel {
      return {
        action: suggestion.verdict,
        headline: actionHeadline(suggestion),
        reason: suggestion.reason,
        equity: pct(suggestion.equity),
        potOdds: suggestion.toCall > 0 ? pct(suggestion.potOdds) : "—",
        toCall: formatToCall(suggestion, room),
      };
    }

    /** Plain-text fallback for tests / copy. */
    function formatCoachHint(suggestion: CoachSuggestion, room: ClientRoom) {
      const model = formatCoachHintModel(suggestion, room);
      return `${model.headline} — ${model.reason}\nEquity ${model.equity} · Pot odds ${model.potOdds} · To call ${model.toCall}`;
    }

    return {
      coachAvailableForPlayers,
      buildCoachSuggestion,
      formatCoachHint,
      formatCoachHintModel,
      actionHeadline,
    };
  },
);
