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

  function cardTemplate(card: PublicCard | null | undefined, extraClass = "") {
    const className = extraClass ? ` ${extraClass}` : "";
    if (!card) return `<div class="card back${className}"><span></span><span></span></div>`;
    const cardName = `${card.rank}${card.suit}`;
    return `
    <div class="card ${card.color === "red" ? "red" : ""}${className}" aria-label="${escapeHtml(cardName)}">
      <span class="card-corner card-corner-top">
        <span class="card-rank">${card.rank}</span>
      </span>
      <span class="card-corner card-corner-bottom">
        <span class="card-corner-suit suit">${card.suit}</span>
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
    formatSignedMoney,
    formatAmount,
    playerStackLabel,
    cardTemplate,
    playerColorStyle,
  };
});
