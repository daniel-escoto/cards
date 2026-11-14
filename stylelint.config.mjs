/** @type {import("stylelint").Config} */
const config = {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "node_modules/**", "pr-screenshots/**"],
  rules: {
    // Noisy / conflicts with existing stylesheet structure.
    "no-descending-specificity": null,
    "no-duplicate-selectors": null,
    "selector-class-pattern": null,
    "custom-property-pattern": null,
    "keyframes-name-pattern": null,
    "selector-id-pattern": null,
    "declaration-block-no-redundant-longhand-properties": null,
    "alpha-value-notation": null,
    "color-function-notation": null,
    "color-function-alias-notation": null,
    "hue-degree-notation": null,
    "import-notation": null,
    "media-feature-range-notation": null,
    "value-keyword-case": null,
    "declaration-property-value-no-unknown": null,
  },
  overrides: [
    {
      files: ["public/tokens.css"],
      rules: {
        // Token file owns raw colors, px spacing, and font sizes.
        "color-no-hex": null,
        "declaration-property-value-disallowed-list": null,
        "function-disallowed-list": null,
      },
    },
    {
      files: ["public/styles.css"],
      rules: {
        // Prefer tokens: no raw hex in styles.css (use var(--…)).
        "color-no-hex": true,
        "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"],
        "declaration-property-value-disallowed-list": {
          "/.*/": [ "/#[0-9a-fA-F]{3,8}\\b/", "/\\brgba?\\s*\\(/", "/\\bhsla?\\s*\\(/" ],
          "/^(padding|margin|gap|row-gap|column-gap|font-size)(-|$)/": [
            "/\\d+(\\.\\d+)?px/",
          ],
          "/^(padding|margin)-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)$/":
            ["/\\d+(\\.\\d+)?px/"],
          "font-size": ["/\\d+(\\.\\d+)?px/"],
          "gap": ["/\\d+(\\.\\d+)?px/"],
          "row-gap": ["/\\d+(\\.\\d+)?px/"],
          "column-gap": ["/\\d+(\\.\\d+)?px/"],
        },
      },
    },
  ],
};

export default config;
