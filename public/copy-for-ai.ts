/**
 * Build a plain-text hand prompt for pasting into an AI chat ("Copy for AI").
 * Only uses information already visible to the viewer — never other players' hidden holes.
 */
(function (
  root: typeof globalThis & { CopyForAi?: CopyForAiAPI },
  factory: () => CopyForAiAPI,
) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CopyForAi = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis), function () {
  "use strict";

  const BETTING_PHASES = new Set(["preflop", "flop", "turn", "river"]);
  const BETWEEN_HANDS = new Set(["lobby", "complete", "gameover"]);
  const STREET_ORDER = ["preflop", "flop", "turn", "river", "showdown"];

  /** 3–9 handed labels from the button clockwise. */
  const POSITION_SETS: Record<number, string[]> = {
    2: ["BTN/SB", "BB"],
    3: ["BTN", "SB", "BB"],
    4: ["BTN", "SB", "BB", "UTG"],
    5: ["BTN", "SB", "BB", "UTG", "CO"],
    6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
    7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
    8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
    9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO"],
  };

  function isBettingPhase(phase: string | null | undefined) {
    return BETTING_PHASES.has(String(phase || ""));
  }

  function isBetweenHands(phase: string | null | undefined) {
    return BETWEEN_HANDS.has(String(phase || ""));
  }

  function handIsOver(phase: string | null | undefined) {
    return ["showdown", "complete", "lobby", "gameover"].includes(String(phase || ""));
  }

  /**
   * Online + spectator: only between hands.
   * Offline Practice (`offline: true`): always allowed.
   */
  function copyForAiAllowed(room: ClientRoom | null | undefined) {
    if (!room) return false;
    if (room.offline) return true;
    return isBetweenHands(room.phase);
  }

  function formatCardPlain(card: PublicCard | null | undefined) {
    if (!card || !(card.code || (card.rank && card.suit))) return null;
    if (card.code && /^[2-9TJQKA][cdhs]$/i.test(card.code)) return card.code;
    const rank = String(card.rank || "");
    const suit = String(card.suit || "");
    const suitMap: Record<string, string> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
    const suitLetter = suitMap[suit] || (suit.length === 1 ? suit.toLowerCase() : "");
    if (!rank || !suitLetter) return null;
    return `${rank}${suitLetter}`;
  }

  function visibleCardsPlain(cards: Array<PublicCard | null | undefined> | null | undefined) {
    return (cards || [])
      .map(formatCardPlain)
      .filter((code): code is string => Boolean(code));
  }

  function formatAmountPlain(room: ClientRoom, chips: unknown, cents: unknown) {
    if (room.moneyMode) {
      const amount = (Math.round(Number(cents) || 0) / 100).toFixed(2);
      return `$${amount}`;
    }
    return String(Math.round(Number(chips) || 0));
  }

  function seatStatus(player: ClientPlayer) {
    if (player.sittingOut) return "sitting out";
    if (player.waitingForNextHand) return "waiting for next hand";
    if (player.folded) return "folded";
    if (player.allIn) return "all-in";
    return "in";
  }

  function positionByPlayerId(players: ClientPlayer[]) {
    const seats = players || [];
    const map = new Map<string, string>();
    if (!seats.length) return map;
    let dealerIdx = seats.findIndex((player) => player.dealer);
    if (dealerIdx < 0) dealerIdx = 0;
    const labels = POSITION_SETS[seats.length] || null;
    for (let offset = 0; offset < seats.length; offset += 1) {
      const player = seats[(dealerIdx + offset) % seats.length];
      map.set(player.id, labels ? labels[offset] : `Seat ${offset + 1}`);
    }
    return map;
  }

  function streetTitle(phase: string) {
    const key = String(phase || "").toLowerCase();
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Unknown";
  }

  function handActionLog(room: ClientRoom) {
    const handNumber = Number(room.handNumber) || 0;
    const log = room.actionLog || [];
    if (!handNumber) return log.slice();
    const prefix = `${handNumber}-`;
    const forHand = log.filter((entry) => String(entry.id || "").startsWith(prefix));
    return forHand.length ? forHand : log.slice();
  }

  function buildCopyForAiPrompt(room: ClientRoom | null | undefined) {
    if (!room) return "";
    const players = room.players || [];
    const positions = positionByPlayerId(players);
    const hero = players.find((player) => player.isYou) || null;
    const blinds = room.moneyMode
      ? `${formatAmountPlain(room, room.smallBlind, room.smallBlindCents)}/${formatAmountPlain(room, room.bigBlind, room.bigBlindCents)}`
      : `${room.smallBlind}/${room.bigBlind}`;
    const gameType = room.moneyMode ? "No-limit Hold'em (money)" : "No-limit Hold'em (chips)";
    const mode = room.offline ? "Practice (offline)" : room.isSpectator ? "Online (spectator)" : "Online";

    const lines: string[] = [];
    lines.push(`${gameType} — ${mode}`);
    lines.push(`Blinds: ${blinds}`);
    lines.push(`Phase: ${room.phase}`);
    lines.push("");
    lines.push("Seats (button order):");
    const dealerIdx = Math.max(
      0,
      players.findIndex((player) => player.dealer),
    );
    for (let offset = 0; offset < players.length; offset += 1) {
      const player = players[(dealerIdx + offset) % players.length];
      const pos = positions.get(player.id) || "?";
      const stack = formatAmountPlain(room, player.stack, player.stackCents);
      const you = player.isYou ? " (you)" : "";
      lines.push(`- ${pos}: ${player.name}${you} — stack ${stack} — ${seatStatus(player)}`);
    }

    lines.push("");
    if (hero) {
      const heroPos = positions.get(hero.id) || "?";
      const hole = visibleCardsPlain(hero.cards);
      lines.push(
        `Hero: ${hero.name} (${heroPos}) hole cards: ${hole.length ? hole.join(" ") : "(none)"}`,
      );
    } else {
      lines.push("Hero: (spectator — no hole cards)");
    }

    // Only cards the viewer can already see: shown hands / all-in runouts.
    const shown = players.filter(
      (player) =>
        !player.isYou &&
        player.showCards &&
        visibleCardsPlain(player.cards).length > 0,
    );
    if (shown.length) {
      lines.push("Shown hands:");
      for (const player of shown) {
        const pos = positions.get(player.id) || "?";
        lines.push(`- ${pos} ${player.name}: ${visibleCardsPlain(player.cards).join(" ")}`);
      }
    }

    const board = visibleCardsPlain(room.community);
    const rabbit = visibleCardsPlain(room.rabbitCards);
    lines.push(`Board: ${board.length ? board.join(" ") : "(none)"}`);
    if (rabbit.length) lines.push(`Rabbit: ${rabbit.join(" ")}`);
    lines.push(`Pot: ${formatAmountPlain(room, room.pot, room.potCents)}`);

    lines.push("");
    lines.push("Action history:");
    const actions = handActionLog(room);
    if (!actions.length) {
      lines.push("(none yet)");
    } else {
      const byStreet = new Map<string, ActionLogEntry[]>();
      for (const entry of actions) {
        const street = String(entry.phase || "unknown");
        if (!byStreet.has(street)) byStreet.set(street, []);
        byStreet.get(street)!.push(entry);
      }
      const streets = [
        ...STREET_ORDER.filter((street) => byStreet.has(street)),
        ...[...byStreet.keys()].filter((street) => !STREET_ORDER.includes(street)),
      ];
      for (const street of streets) {
        lines.push(`${streetTitle(street)}:`);
        for (const entry of byStreet.get(street) || []) {
          // Prefer `text` (includes the player name); fall back to bare `action`.
          const text = String(entry.text || entry.action || "")
            .trim()
            .replace(/\.$/, "");
          if (text) lines.push(`- ${text}`);
        }
      }
    }

    lines.push("");
    lines.push(handIsOver(room.phase) ? "How did I play this hand?" : "What should I do here?");
    return lines.join("\n");
  }

  return {
    isBettingPhase,
    isBetweenHands,
    handIsOver,
    copyForAiAllowed,
    formatCardPlain,
    visibleCardsPlain,
    positionByPlayerId,
    buildCopyForAiPrompt,
  };
});
