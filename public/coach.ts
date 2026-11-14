/**
 * Offline AI coach for bot-only tables. Uses hero cards + board only (never
 * opponent holes). Equity via the shared engine's Monte Carlo helpers.
 */
(function (
  root: typeof globalThis & { Coach?: CoachAPI; HoldemEngine?: HoldemEngineAPI },
  factory: (
    engine: HoldemEngineAPI | undefined,
    hand: { solve: (cards: string[]) => { descr?: string } } | undefined,
  ) => CoachAPI,
) {
  if (typeof module === "object" && module.exports) {
    let engine: HoldemEngineAPI | undefined;
    try {
      engine = require("../shared/engine.node.js") as HoldemEngineAPI;
    } catch {
      engine = undefined;
    }
    module.exports = factory(engine, undefined);
  } else {
    const handGlobal =
      typeof Hand !== "undefined" && Hand && typeof Hand.solve === "function"
        ? { solve: (cards: string[]) => Hand.solve(cards) as { descr?: string } }
        : undefined;
    root.Coach = factory(root.HoldemEngine, handGlobal);
  }
})(
  typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis),
  function (engine, handApi) {
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
      const minRaiseTo = Math.max(0, Number(room.minRaiseTo) || room.currentBet + (room.minRaise || 0));
      const maxRaise = hero.bet + hero.stack;
      if (maxRaise <= room.currentBet) return null;
      const target = aggressive
        ? Math.round(room.currentBet + Math.max(toCall, pot * 0.75))
        : Math.round(Math.max(minRaiseTo, room.currentBet + Math.max(toCall, pot * 0.5)));
      const clamped = Math.max(minRaiseTo, Math.min(maxRaise, target));
      if (clamped <= room.currentBet) return maxRaise;
      return clamped;
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
      const opponents = (room.players || []).filter(
        (player) => !player.isYou && !player.folded && (player.stack > 0 || player.allIn || player.invested > 0),
      ).length;
      const board = boardCodes(room);
      const toCall = Math.max(0, Number(room.toCall) || 0);
      const pot = Math.max(0, Number(room.pot) || 0);
      const potOdds = toCall > 0 ? toCall / Math.max(1, pot + toCall) : 0;
      const random = options.random || Math.random;
      const iterations = Math.max(40, Math.min(240, Math.floor(Number(options.iterations) || 120)));
      const equity = estimateEquity(heroCodes, board, Math.max(1, opponents), toCall, random, iterations);
      const label = handLabel(heroCodes, board);

      const canRaise = Boolean(room.canRaise || room.canShove);
      const maxRaise = hero.bet + hero.stack;
      let action: CoachSuggestion["action"];
      let raiseTo: number | null = null;
      let reason: string;

      if (toCall <= 0) {
        if (equity >= 0.62 && canRaise && maxRaise > room.currentBet) {
          action = room.currentBet > 0 ? "raise" : "bet";
          raiseTo = pickRaiseTo(room, hero, true);
          reason = "Strong equity — take the lead";
        } else if (equity >= 0.4 && canRaise && maxRaise > room.currentBet && equity >= 0.52) {
          action = room.currentBet > 0 ? "raise" : "bet";
          raiseTo = pickRaiseTo(room, hero, false);
          reason = "Slight edge — small value bet";
        } else {
          action = "check";
          reason = equity < 0.35 ? "Weak — keep the pot small" : "No price to call — check";
        }
      } else if (equity + 0.03 < potOdds) {
        action = "fold";
        reason = `Behind pot odds (${pct(equity)} < ${pct(potOdds)})`;
      } else if (equity >= potOdds + 0.12 && canRaise && maxRaise > room.currentBet) {
        action = "raise";
        raiseTo = pickRaiseTo(room, hero, equity >= 0.65);
        reason = "Well ahead of pot odds — raise";
      } else {
        action = "call";
        reason =
          equity >= potOdds
            ? `Getting the right price (${pct(equity)} ≥ ${pct(potOdds)})`
            : "Close with pot odds — call";
      }

      const actionLabel =
        action === "raise" || action === "bet"
          ? `${action === "bet" ? "Bet" : "Raise"} ${raiseTo ?? ""}`.trim()
          : action.charAt(0).toUpperCase() + action.slice(1);

      return {
        equity,
        potOdds,
        toCall,
        opponents: Math.max(1, opponents),
        handLabel: label,
        action,
        raiseTo,
        reason,
        summary: `${label} · ${pct(equity)} equity vs ${Math.max(1, opponents)} · ${
          toCall > 0 ? `pot odds ${pct(potOdds)} (call ${toCall})` : "no bet to call"
        } · ${actionLabel} — ${reason}`,
      };
    }

    function formatCoachHint(suggestion: CoachSuggestion, room: ClientRoom) {
      const callBit =
        suggestion.toCall > 0
          ? `pot odds ${pct(suggestion.potOdds)} (call ${
              room.moneyMode
                ? `$${(Math.round(Number(room.toCallCents) || 0) / 100).toFixed(2)}`
                : suggestion.toCall
            })`
          : "checked to you";
      const action =
        suggestion.action === "raise" || suggestion.action === "bet"
          ? `${suggestion.action === "bet" ? "Bet" : "Raise"} ${suggestion.raiseTo}`
          : suggestion.action.charAt(0).toUpperCase() + suggestion.action.slice(1);
      return `Coach · ${pct(suggestion.equity)} eq · ${callBit}\nSuggest: ${action} — ${suggestion.reason}`;
    }

    return {
      coachAvailableForPlayers,
      buildCoachSuggestion,
      formatCoachHint,
    };
  },
);
