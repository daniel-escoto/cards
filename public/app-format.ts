(function (
  root: typeof globalThis & { HoldemFormat?: HoldemFormatAPI },
  factory: () => HoldemFormatAPI,
) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HoldemFormat = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis), function () {
  "use strict";

  const SUIT_GLYPH: Record<string, string> = {
    s: "♠",
    h: "♥",
    d: "♦",
    c: "♣",
    "♠": "♠",
    "♥": "♥",
    "♦": "♦",
    "♣": "♣",
  };

  /** Always render French-suited glyphs — never a bare s/h/d/c letter. */
  function normalizeSuitGlyph(suit: unknown, code?: string | null): string {
    const raw = String(suit || "").trim();
    if (SUIT_GLYPH[raw]) return SUIT_GLYPH[raw];
    const fromCode = String(code || "")
      .trim()
      .slice(1, 2)
      .toLowerCase();
    if (SUIT_GLYPH[fromCode]) return SUIT_GLYPH[fromCode];
    const lower = raw.toLowerCase();
    if (SUIT_GLYPH[lower]) return SUIT_GLYPH[lower];
    return raw;
  }

  function normalizePublicCard(card: PublicCard): PublicCard {
    const suit = normalizeSuitGlyph(card.suit, card.code);
    const red = suit === "♥" || suit === "♦";
    return {
      ...card,
      suit,
      color: card.color === "red" || card.color === "black" ? card.color : red ? "red" : "black",
    };
  }

  function cardTemplate(card: PublicCard | null | undefined, extraClass = "") {
    const className = extraClass ? ` ${extraClass}` : "";
    if (!card) return `<div class="card back${className}"><span></span><span></span></div>`;
    const face = normalizePublicCard(card);
    const cardName = `${face.rank}${face.suit}`;
    return `
    <div class="card ${face.color === "red" ? "red" : ""}${className}" aria-label="${escapeHtml(cardName)}" data-code="${escapeHtml(face.code || "")}">
      <span class="card-corner card-corner-top">
        <span class="card-rank">${escapeHtml(face.rank)}</span>
      </span>
      <span class="card-corner card-corner-bottom">
        <span class="card-corner-suit suit">${face.suit}</span>
      </span>
    </div>
  `;
  }

  function playerColorStyle(player: ClientPlayer | null | undefined) {
    return player?.color ? `style="--player-color: ${escapeHtml(player.color)}"` : "";
  }

  function moneyCentsFromInput(input: HTMLInputElement, fallback = 20) {
    const dollars = Number(input.value);
    if (!Number.isFinite(dollars) || dollars <= 0) return Math.round(fallback * 100);
    return Math.max(100, Math.min(1000000, Math.round(dollars * 100)));
  }

  function formatMoney(cents: unknown) {
    const amount = (Math.round(Number(cents) || 0) / 100).toFixed(2);
    return `$${amount}`;
  }

  /** Whole dollars without trailing .00; cents keep two places ($25, $0.10). */
  function formatMoneyCompact(cents: unknown) {
    const value = Math.round(Number(cents) || 0) / 100;
    if (!Number.isFinite(value)) return "$0";
    if (Number.isInteger(value)) return `$${value}`;
    return `$${value.toFixed(2)}`;
  }

  /** Join preview / take-seat facts line: buy-in + blinds only. */
  function moneyJoinSummary(terms: {
    buyInCents?: unknown;
    smallBlindCents?: unknown;
    bigBlindCents?: unknown;
  } | null | undefined) {
    if (!terms) return "";
    const buyIn = formatMoneyCompact(terms.buyInCents);
    const sb = formatMoneyCompact(terms.smallBlindCents);
    const bb = formatMoneyCompact(terms.bigBlindCents);
    return `${buyIn} buy-in · ${sb}/${bb} blinds`;
  }

  /** Primary join / take-seat CTA: Join · $25 (or Join). */
  function moneyJoinButtonLabel(
    terms: { buyInCents?: unknown } | null | undefined,
    fallback = "Join",
  ) {
    if (!terms || terms.buyInCents == null) return fallback;
    return `Join · ${formatMoneyCompact(terms.buyInCents)}`;
  }

  function formatSignedMoney(cents: unknown) {
    const amount = Math.round(Number(cents) || 0);
    if (amount === 0) return "$0.00";
    return `${amount > 0 ? "+" : "-"}${formatMoney(Math.abs(amount))}`;
  }

  function formatAmount(chips: unknown, cents: unknown) {
    // Reads the live table state from the classic-script global set in app-boot.js.
    const moneyMode = (typeof globalThis !== "undefined" ? globalThis.state : null)?.moneyMode;
    return moneyMode ? formatMoney(cents) : String(chips);
  }

  function playerStackLabel(player: ClientPlayer) {
    return formatAmount(player.stack, player.stackCents);
  }

  function escapeHtml(value: unknown) {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        (
          {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
          } as Record<string, string>
        )[char],
    );
  }

  function escapeRegExp(value: unknown) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  return {
    escapeHtml,
    escapeRegExp,
    moneyCentsFromInput,
    formatMoney,
    formatMoneyCompact,
    moneyJoinSummary,
    moneyJoinButtonLabel,
    formatSignedMoney,
    formatAmount,
    playerStackLabel,
    normalizeSuitGlyph,
    normalizePublicCard,
    cardTemplate,
    playerColorStyle,
  };
});
