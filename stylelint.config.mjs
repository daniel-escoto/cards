/** @type {import("stylelint").Config} */
const config = {
  ignoreFiles: ["dist/**", "node_modules/**", "pr-screenshots/**", "tests/visual/**"],
  rules: {},
  overrides: [
    {
      files: ["public/tokens.css"],
      rules: {
        // Token file owns raw colors, px spacing, and font sizes.
      },
    },
    {
      files: ["public/styles.css"],
      rules: {
        // Prefer tokens: no raw hex in styles.css (use var(--…)).
        "color-no-hex": true,
        "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"],
        "declaration-property-value-disallowed-list": {
          "/^(padding|margin|gap|row-gap|column-gap|font-size)(-|$)/": [
            "/\\d+(\\.\\d+)?px/",
          ],
          "/^(padding|margin)-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)$/":
            ["/\\d+(\\.\\d+)?px/"],
          "font-size": ["/\\d+(\\.\\d+)?px/"],
          gap: ["/\\d+(\\.\\d+)?px/"],
          "row-gap": ["/\\d+(\\.\\d+)?px/"],
          "column-gap": ["/\\d+(\\.\\d+)?px/"],
          "padding-inline": ["/\\d+(\\.\\d+)?px/"],
          "padding-block": ["/\\d+(\\.\\d+)?px/"],
          "margin-inline": ["/\\d+(\\.\\d+)?px/"],
          "margin-block": ["/\\d+(\\.\\d+)?px/"],
        },
      },
    },
  ],
};

export default config;
