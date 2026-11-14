#!/usr/bin/env node
/**
 * One-shot helper: build public/tokens.css from styles.css and rewrite styles.css
 * to use only var() for colors / spacing / font-size / radius (zero visual change).
 *
 * Re-run safely: if tokens.css already exists and styles has no :root color block,
 * this is a no-op rewrite of an already-migrated tree.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const stylesPath = path.join(root, "public/styles.css");
const tokensPath = path.join(root, "public/tokens.css");

const styles = fs.readFileSync(stylesPath, "utf8");

const SPACE_PX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 36];
const FONT_PX = [
  6.5, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 32, 40, 44, 52, 60, 68,
];
const RADIUS_PX = [2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18, 22, 999];

function tokenName(prefix, value) {
  return `--${prefix}-${String(value).replace(".", "_")}`;
}

function spaceVar(px) {
  return `var(${tokenName("space", px)})`;
}
function fontVar(px) {
  return `var(${tokenName("font-size", px)})`;
}
function radiusVar(px) {
  return `var(${tokenName("radius", px)})`;
}

/** Pull the leading :root / theme / felt token blocks out of styles.css. */
function extractRootBlocks(css) {
  const marker = "\n* {";
  const idx = css.indexOf(marker);
  if (idx === -1) throw new Error("Could not find global * reset after :root blocks");
  // Only treat as extractable if file still starts with :root {
  if (!css.trimStart().startsWith(":root")) {
    return { root: null, rest: css };
  }
  return { root: css.slice(0, idx).trimEnd() + "\n", rest: css.slice(idx + 1) };
}

const { root: rootBlocks, rest: bodyStart } = extractRootBlocks(styles);
let body = rootBlocks === null ? styles : bodyStart;

// Collect color literals that remain in the stylesheet body (declarations only).
const colorSet = new Set();
for (const m of body.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g)) {
  colorSet.add(m[0]);
}

const colorTokens = new Map();
let colorIndex = 0;
function colorTokenFor(literal) {
  if (colorTokens.has(literal)) return colorTokens.get(literal);
  // Prefer stable short names for pure white/black.
  let name;
  if (literal === "#ffffff" || literal === "#fff" || literal === "#FFFFFF") name = "--color-white";
  else if (literal === "#000000" || literal === "#000") name = "--color-black";
  else {
    colorIndex += 1;
    name = `--color-raw-${colorIndex}`;
  }
  colorTokens.set(literal, name);
  return name;
}

// Replace colors in body (not inside already-tokenized custom props we are about to write).
body = body.replace(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g, (literal) => {
  return `var(${colorTokenFor(literal)})`;
});

/** Replace px values in a property value for a known scale. */
function replacePxScale(value, scale, toVar) {
  return value.replace(/(-?[\d.]+)px/g, (full, num) => {
    const n = Number(num);
    if (!scale.includes(n) && !scale.includes(Math.abs(n))) return full;
    const abs = Math.abs(n);
    const v = toVar(abs);
    return n < 0 ? `calc(-1 * ${v})` : v;
  });
}

const SPACING_PROPS =
  /^(padding|margin|gap|row-gap|column-gap|top|right|bottom|left|inset)(-top|-right|-bottom|-left)?$/;
const FONT_PROPS = /^font-size$/;
const RADIUS_PROPS = /^border-radius$/;

body = body.replace(/(^|[{;\s])([a-z-]+)\s*:\s*([^;{}]+);/gm, (full, lead, prop, value) => {
  if (prop.startsWith("--")) return full;
  let next = value;
  if (SPACING_PROPS.test(prop)) next = replacePxScale(next, SPACE_PX, spaceVar);
  else if (FONT_PROPS.test(prop)) next = replacePxScale(next, FONT_PX, fontVar);
  else if (RADIUS_PROPS.test(prop)) next = replacePxScale(next, RADIUS_PX, radiusVar);
  if (next === value) return full;
  return `${lead}${prop}: ${next};`;
});

// Also catch font-size / padding shorthands inside media queries already handled by the regex.

const scaleLines = [];
scaleLines.push("  /* Spacing scale (padding / margin / gap). */");
for (const px of SPACE_PX) scaleLines.push(`  ${tokenName("space", px)}: ${px}px;`);
scaleLines.push("  /* Type scale. */");
for (const px of FONT_PX) scaleLines.push(`  ${tokenName("font-size", px)}: ${px}px;`);
scaleLines.push("  /* Radius scale. */");
for (const px of RADIUS_PX) {
  const val = px === 999 ? "999px" : `${px}px`;
  scaleLines.push(`  ${tokenName("radius", px)}: ${val};`);
}
scaleLines.push("  /* Shadows. */");
scaleLines.push(
  "  --shadow-panel: 0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 18px 44px rgba(0, 0, 0, 0.28);",
);
scaleLines.push(
  "  --shadow-panel-light: 0 1px 0 rgba(255, 255, 255, 0.8) inset, 0 18px 44px rgba(29, 47, 40, 0.12);",
);
scaleLines.push("  --shadow-raise: 0 8px 22px color-mix(in srgb, var(--accent) 22%, transparent);");
scaleLines.push("  --shadow-float: 0 5px 14px rgba(0, 0, 0, 0.24);");

const rawColorLines = [];
rawColorLines.push("  /* Migrated one-off colors (literal values live only here). */");
for (const [literal, name] of colorTokens) {
  rawColorLines.push(`  ${name}: ${literal};`);
}

let tokensCss;
if (rootBlocks) {
  // Insert scales + raw colors into the dark :root block before its closing brace.
  const firstRootEnd = rootBlocks.indexOf("\n}");
  if (firstRootEnd === -1) throw new Error("Malformed :root block");
  tokensCss =
    rootBlocks.slice(0, firstRootEnd) +
    "\n" +
    scaleLines.join("\n") +
    "\n" +
    rawColorLines.join("\n") +
    rootBlocks.slice(firstRootEnd);
  // Point existing --surface-shadow at the named shadow tokens where identical.
  tokensCss = tokensCss
    .replace(
      /--surface-shadow:\s*\n\s*0 1px 0 rgba\(255, 255, 255, 0\.04\) inset,\s*\n\s*0 18px 44px rgba\(0, 0, 0, 0\.28\);/,
      "--surface-shadow: var(--shadow-panel);",
    )
    .replace(
      /--surface-shadow:\s*\n\s*0 1px 0 rgba\(255, 255, 255, 0\.8\) inset,\s*\n\s*0 18px 44px rgba\(29, 47, 40, 0\.12\);/,
      "--surface-shadow: var(--shadow-panel-light);",
    );
} else {
  tokensCss = fs.readFileSync(tokensPath, "utf8");
}

const banner = `/* Design tokens for holdem.nyc — colors, spacing, type, radius, shadows.
 * Literal hex/rgb and spacing/font-size/radius px values belong HERE only.
 * See DESIGN.md. Generated/maintained for zero visual change vs prior screenshots.
 */\n\n`;

fs.writeFileSync(tokensPath, banner + (rootBlocks ? tokensCss : tokensCss));
fs.writeFileSync(stylesPath, body.startsWith("/*") || body.startsWith("*") ? body : body);

console.log("Wrote", path.relative(root, tokensPath));
console.log("Rewrote", path.relative(root, stylesPath));
console.log("Raw color tokens:", colorTokens.size);
console.log("Root extracted:", Boolean(rootBlocks));
