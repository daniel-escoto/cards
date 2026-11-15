#!/usr/bin/env node
/**
 * Static design-system checks: max 2 buttons per row, shared button variants,
 * and public/ui.ts export surface.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const uiSrcPath = path.join(root, "public/ui.ts");
const appTablePath = path.join(root, "public/app-table.ts");
const trainerPath = path.join(root, "public/trainer.ts");

const ALLOWED_BUTTON_TOKENS = new Set([
  "secondary",
  "danger",
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
]);

/** Mirror HoldemUI.isAllowedButtonVariant (plus existing hand-review feature hooks). */
function isAllowedButtonVariant(className) {
  const tokens = String(className || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.every((token) => token === "primary" || token === "has-shortcut")) {
    return true;
  }
  if (tokens.some((token) => ALLOWED_BUTTON_TOKENS.has(token))) return true;
  // Existing structural hooks until call sites migrate fully onto createButton.
  const feature = tokens.filter(
    (token) => token !== "has-shortcut" && token !== "hidden" && !token.startsWith("is-"),
  );
  return (
    feature.length > 0 &&
    feature.every(
      (token) =>
        ALLOWED_BUTTON_TOKENS.has(token) ||
        token === "primary" ||
        /^hand-review-/.test(token),
    )
  );
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

/** Find template literals that look like action rows with 3+ consecutive <button tags. */
function findCrowdedButtonTemplates(source, fileLabel) {
  const violations = [];
  // Rough scan: template literals containing multiple <button opens.
  const templateRe = /`(?:\\`|[^`])*`/gs;
  let match;
  while ((match = templateRe.exec(source))) {
    const tpl = match[0];
    if (!/<button\b/i.test(tpl)) continue;
    // Skip if the only extra buttons sit inside .action-links.
    const withoutLinks = tpl.replace(
      /<div\b[^>]*class="[^"]*action-links[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      "",
    );
    const buttons = withoutLinks.match(/<button\b/gi) || [];
    if (buttons.length > 2) {
      const line = source.slice(0, match.index).split(/\n/).length;
      violations.push(`${fileLabel}:${line}: template has ${buttons.length} <button> without action-links carve-out`);
    }
  }
  return violations;
}

/** Parse addButton / addActionButton className string args (3rd positional). */
function findHelperClassViolations(source, fileLabel) {
  const violations = [];
  const callRe = /\b(addButton|addActionButton)\s*\(/g;
  let match;
  while ((match = callRe.exec(source))) {
    const start = match.index + match[0].length - 1;
    const argsSrc = sliceCallArgs(source, start);
    if (argsSrc == null) continue;
    const args = splitTopLevelArgs(argsSrc);
    const classArg = args[2];
    if (classArg == null) continue;
    const lit = stringLiteralValue(classArg.trim());
    if (lit == null) continue; // dynamic — skip
    if (!isAllowedButtonVariant(lit)) {
      const line = source.slice(0, match.index).split(/\n/).length;
      violations.push(
        `${fileLabel}:${line}: ${match[1]} className "${lit}" is not an allowed shared variant`,
      );
    }
  }
  return violations;
}

/** createElement("button") … .className = "…" within a short window. */
function findCreateElementClassViolations(source, fileLabel) {
  const violations = [];
  const createRe =
    /(?:document|doc)\.createElement\(\s*["']button["']\s*\)/g;
  let match;
  while ((match = createRe.exec(source))) {
    const window = source.slice(match.index, match.index + 400);
    const classMatch = window.match(/\.className\s*=\s*(["'`])([\s\S]*?)\1/);
    if (!classMatch) continue;
    const lit = classMatch[1] === "`" && classMatch[2].includes("${")
      ? null
      : classMatch[2];
    if (lit == null) continue;
    if (!isAllowedButtonVariant(lit)) {
      const line = source.slice(0, match.index).split(/\n/).length;
      violations.push(
        `${fileLabel}:${line}: createElement("button") className "${lit}" is not an allowed shared variant`,
      );
    }
  }
  return violations;
}

function sliceCallArgs(source, openParenIndex) {
  if (source[openParenIndex] !== "(") return null;
  let depth = 0;
  let inStr = null;
  let escaped = false;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

function splitTopLevelArgs(argsSrc) {
  const args = [];
  let depth = 0;
  let inStr = null;
  let escaped = false;
  let start = 0;
  for (let i = 0; i < argsSrc.length; i += 1) {
    const ch = argsSrc[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      args.push(argsSrc.slice(start, i));
      start = i + 1;
    }
  }
  args.push(argsSrc.slice(start));
  return args;
}

function stringLiteralValue(expr) {
  const trimmed = expr.trim();
  const m = trimmed.match(/^(["'])([\s\S]*)\1$/);
  if (!m) return null;
  return m[2];
}

// —— ui.ts exists + export names ——
assert.ok(fs.existsSync(uiSrcPath), "public/ui.ts must exist");
const uiSrc = read(uiSrcPath);
const expectedExports = [
  "BUTTON_VARIANTS",
  "variantClass",
  "keyBadgeHtml",
  "setButtonLabel",
  "createButton",
  "buttonHtml",
  "textActionLinkHtml",
  "iconCloseSvg",
  "verdictIconSvg",
  "isAllowedButtonVariant",
];
for (const name of expectedExports) {
  assert.match(
    uiSrc,
    new RegExp(`\\b${name}\\b`),
    `public/ui.ts should define/export ${name}`,
  );
}
assert.match(uiSrc, /root\.HoldemUI\s*=/, "public/ui.ts should assign root.HoldemUI");
assert.match(uiSrc, /module\.exports\s*=/, "public/ui.ts should set module.exports for Node");

const uiDistPath = path.join(root, "dist/public/ui.js");
if (fs.existsSync(uiDistPath)) {
  const ui = require(uiDistPath);
  for (const name of expectedExports) {
    assert.equal(typeof ui[name] !== "undefined", true, `dist ui exports ${name}`);
  }
  assert.deepEqual([...ui.BUTTON_VARIANTS], ["primary", "secondary", "danger", "ghost"]);
  assert.equal(ui.variantClass("primary"), "");
  assert.equal(ui.variantClass("ghost icon"), "ghost icon-btn");
  assert.equal(ui.isAllowedButtonVariant(""), true);
  assert.equal(ui.isAllowedButtonVariant("danger"), true);
  assert.equal(ui.isAllowedButtonVariant("fancy-purple"), false);
}

// —— source pattern checks ——
const appTable = read(appTablePath);
const trainer = read(trainerPath);

const crowded = [
  ...findCrowdedButtonTemplates(appTable, "app-table.ts"),
  ...findCrowdedButtonTemplates(trainer, "trainer.ts"),
];
assert.equal(
  crowded.length,
  0,
  `Action rows must not embed >2 <button> tags in one template (use .action-links):\n${crowded.join("\n")}`,
);

const classViolations = [
  ...findHelperClassViolations(appTable, "app-table.ts"),
  ...findHelperClassViolations(trainer, "trainer.ts"),
  ...findCreateElementClassViolations(appTable, "app-table.ts"),
  ...findCreateElementClassViolations(trainer, "trainer.ts"),
];
assert.equal(
  classViolations.length,
  0,
  `Button className must use shared variants:\n${classViolations.join("\n")}`,
);

console.log("Design system checks passed.");
