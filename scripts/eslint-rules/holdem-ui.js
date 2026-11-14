/**
 * Flat-config-compatible ESLint plugin for holdem.nyc UI rules.
 *
 * Usage (eslint.config.js):
 *   const holdemUi = require("./scripts/eslint-rules/holdem-ui");
 *   plugins: { "holdem-ui": holdemUi }
 *   rules: { "holdem-ui/no-inline-style": "error", "holdem-ui/no-ui-emoji": "error" }
 */

"use strict";

/** @type {import("eslint").Rule.RuleModule} */
const noInlineStyle = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban element.style assignments and setAttribute('style') in public UI code; use CSS classes/tokens.",
    },
    schema: [],
    messages: {
      styleAssign: "Do not assign to element.style; use CSS classes and design tokens.",
      setAttributeStyle:
        "Do not setAttribute('style', …); use CSS classes. playerColorStyle(--player-color) is allowed.",
    },
  },
  create(context) {
    const source = context.sourceCode?.getText?.() ?? context.getSourceCode?.()?.getText?.() ?? "";

    function allowsPlayerColorStyle(node) {
      // Allow the shared helper that only sets --player-color custom properties.
      if (!source.includes("--player-color")) return false;
      const text = context.sourceCode?.getText?.(node) ?? context.getSourceCode?.()?.getText?.(node) ?? "";
      return text.includes("--player-color") || text.includes("playerColorStyle");
    }

    return {
      AssignmentExpression(node) {
        const left = node.left;
        if (!left || left.type !== "MemberExpression") return;

        // element.style = …
        if (
          left.property &&
          !left.computed &&
          left.property.type === "Identifier" &&
          left.property.name === "style"
        ) {
          context.report({ node, messageId: "styleAssign" });
          return;
        }

        // element.style.foo = …
        if (
          left.object &&
          left.object.type === "MemberExpression" &&
          left.object.property &&
          !left.object.computed &&
          left.object.property.type === "Identifier" &&
          left.object.property.name === "style"
        ) {
          context.report({ node, messageId: "styleAssign" });
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.computed ||
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "setAttribute"
        ) {
          return;
        }
        const first = node.arguments[0];
        if (!first || (first.type !== "Literal" && first.type !== "TemplateLiteral")) return;
        let value = "";
        if (first.type === "Literal" && typeof first.value === "string") {
          value = first.value;
        } else if (first.type === "TemplateLiteral" && first.expressions.length === 0) {
          value = first.quasis.map((q) => q.value.cooked || "").join("");
        }
        if (value !== "style") return;
        if (allowsPlayerColorStyle(node)) return;
        const argText =
          node.arguments[1] &&
          (context.sourceCode?.getText?.(node.arguments[1]) ??
            context.getSourceCode?.()?.getText?.(node.arguments[1]) ??
            "");
        if (typeof argText === "string" && argText.includes("--player-color")) return;
        context.report({ node, messageId: "setAttributeStyle" });
      },
    };
  },
};

/** Suit glyphs + a few typographic symbols that are intentional UI/content, not emoji. */
const ALLOWED_SYMBOLS = new Set([
  "♠",
  "♥",
  "♦",
  "♣",
  "×", // U+00D7 multiplication sign (close affordance until SVG migration)
  "→", // U+2192
  "−", // U+2212 minus
  "←",
  "·",
  "…",
]);

/**
 * Ban emoji / pictographs in string & template literals.
 * Allows French-suited card glyphs and a few typographic marks.
 * Bans ✓✗ (use verdictIconSvg instead).
 */
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2705}\u{274C}\u{2713}\u{2714}\u{2717}\u{2718}\u{2715}\u{2716}]/u;

/** @type {import("eslint").Rule.RuleModule} */
const noUiEmoji = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban emoji/pictograph glyphs in public UI strings; use inline SVG currentColor instead.",
    },
    schema: [],
    messages: {
      emoji:
        "Do not use emoji glyphs in UI strings (found {{glyph}}). Use inline SVG currentColor; suits ♠♥♦♣ are allowed.",
      checkCross: "Do not use ✓/✗ glyphs; use HoldemUI.verdictIconSvg instead.",
    },
  },
  create(context) {
    function reportIfEmoji(node, text) {
      if (typeof text !== "string" || !text) return;
      for (const ch of text) {
        if (ALLOWED_SYMBOLS.has(ch)) continue;
        if (ch === "✓" || ch === "✗") {
          context.report({ node, messageId: "checkCross" });
          return;
        }
        if (EMOJI_RE.test(ch)) {
          context.report({
            node,
            messageId: "emoji",
            data: { glyph: ch },
          });
          return;
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") reportIfEmoji(node, node.value);
      },
      TemplateElement(node) {
        reportIfEmoji(node, node.value.cooked || "");
      },
    };
  },
};

module.exports = {
  rules: {
    "no-inline-style": noInlineStyle,
    "no-ui-emoji": noUiEmoji,
  },
};
