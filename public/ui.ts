(function (
  root: typeof globalThis & { HoldemUI?: HoldemUIAPI; HoldemFormat?: HoldemFormatAPI },
  factory: () => HoldemUIAPI,
) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.HoldemUI = api;
})(typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis), function () {
  "use strict";

  const BUTTON_VARIANTS = ["primary", "secondary", "danger", "danger-outline", "ghost"] as const;

  const ALLOWED_BUTTON_TOKENS = new Set([
    "secondary",
    "danger",
    "danger-outline",
    "ghost",
    "appearance-choice",
    "menu-row-btn",
    "icon-btn",
    "action-placeholder",
    "text-action-link",
    "mode-option",
    "raise-action",
    "room-code-btn",
    "settings-back-btn",
    "hand-review-dot",
    "lobby-add-bot",
    "leave-game-btn",
    "add-bot-btn",
    "selected",
  ]);

  function localEscapeHtml(value: unknown): string {
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
        )[char] || char,
    );
  }

  function escapeHtml(value: unknown): string {
    const format = (
      globalThis as typeof globalThis & { HoldemFormat?: HoldemFormatAPI }
    ).HoldemFormat;
    if (format && typeof format.escapeHtml === "function") {
      return format.escapeHtml(value);
    }
    return localEscapeHtml(value);
  }

  function variantClass(variant: HoldemButtonVariantInput): string {
    const raw = String(variant || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!raw || raw === "primary") return "";
    if (raw === "ghost icon") return "ghost icon-btn";
    return raw;
  }

  function keyBadgeHtml(shortcut: string): string {
    const key = String(shortcut || "").trim();
    if (!key) return "";
    return `<kbd aria-hidden="true">${escapeHtml(key)}</kbd>`;
  }

  function setButtonLabel(
    button: HTMLElement | null | undefined,
    label: string,
    shortcut = "",
  ): void {
    if (!button) return;
    const key = String(shortcut || "").trim();
    button.innerHTML = `<span>${escapeHtml(label)}</span>${key ? keyBadgeHtml(key) : ""}`;
    button.classList.toggle("has-shortcut", Boolean(key));
    button.setAttribute("aria-label", key ? `${label} (${key})` : label);
  }

  function mergeClassNames(...parts: Array<string | undefined>): string {
    return parts
      .flatMap((part) =>
        String(part || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean),
      )
      .filter((token, index, all) => all.indexOf(token) === index)
      .join(" ");
  }

  function createButton(options: HoldemCreateButtonOptions): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = options.type || "button";
    if (options.id) button.id = options.id;
    const classes = mergeClassNames(variantClass(options.variant || "primary"), options.className);
    if (classes) button.className = classes;
    if (options.disabled) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    }
    setButtonLabel(button, options.label, options.shortcut || "");
    if (options.onClick) {
      button.addEventListener("click", options.onClick);
    }
    return button;
  }

  function buttonHtml(options: HoldemButtonHtmlOptions): string {
    const classes = mergeClassNames(variantClass(options.variant || "primary"), options.className);
    const shortcut = String(options.shortcut || "").trim();
    const withShortcut = shortcut ? mergeClassNames(classes, "has-shortcut") : classes;
    const classAttr = withShortcut ? ` class="${escapeHtml(withShortcut)}"` : "";
    const idAttr = options.id ? ` id="${escapeHtml(options.id)}"` : "";
    const disabledAttr = options.disabled ? ' disabled aria-disabled="true"' : "";
    const ariaLabel = shortcut ? `${options.label} (${shortcut})` : options.label;
    const aria = ` aria-label="${escapeHtml(ariaLabel)}"`;
    const body = `<span>${escapeHtml(options.label)}</span>${shortcut ? keyBadgeHtml(shortcut) : ""}`;
    return `<button type="button"${idAttr}${classAttr}${disabledAttr}${aria}>${body}</button>`;
  }

  function textActionLinkHtml(id: string, label: string): string {
    return `<button type="button" class="text-action-link" id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
  }

  function iconCloseSvg(): string {
    return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M4 4l8 8M12 4l-8 8"/></svg>`;
  }

  function verdictIconSvg(kind: "best" | "mistake" | "neutral"): string {
    if (kind === "best") {
      return `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>`;
    }
    if (kind === "mistake") {
      return `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M4 4l8 8M12 4l-8 8"/></svg>`;
    }
    return `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M3.5 9.5c1.2-2 2.8-3 4.5-3s3.3 1 4.5 3"/></svg>`;
  }

  function isAllowedButtonVariant(className: string): boolean {
    const tokens = String(className || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return true;
    if (tokens.every((token) => token === "primary" || token === "has-shortcut")) {
      return true;
    }
    return tokens.some((token) => ALLOWED_BUTTON_TOKENS.has(token));
  }

  return {
    BUTTON_VARIANTS,
    variantClass,
    keyBadgeHtml,
    setButtonLabel,
    createButton,
    buttonHtml,
    textActionLinkHtml,
    iconCloseSvg,
    verdictIconSvg,
    isAllowedButtonVariant,
  };
});
