#!/usr/bin/env node
/**
 * Guards the turn-change layout shift: #turnInfo swaps between the hero prompt
 * (.your-turn, 15px) and "X to act" (base size, 12–16px by breakpoint). Every
 * .turn-info rule that sets a font-size must reserve a min-height at least as tall as
 * both line boxes, or the action panel and seat list jump a few pixels each turn.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
const tokens = fs.readFileSync(path.join(__dirname, "../public/tokens.css"), "utf8");
const LINE_HEIGHT = 1.35;

/** Resolve var(--font-size-N) / var(--space-N) and plain/calc px to a number. */
function px(value) {
  if (!value) return 0;
  const token = /var\(\s*(--(?:font-size|space)-([\d_]+))\s*\)/.exec(value);
  if (token) {
    const def = new RegExp(`${token[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([\\d.]+)px`).exec(
      tokens,
    );
    if (def) return Number(def[1]);
  }
  const calc = /calc\(\s*([\d.]+)px\s*\*\s*([\d.]+)\s*\)/.exec(value);
  if (calc) return Number(calc[1]) * Number(calc[2]);
  const calcToken = /calc\(\s*var\(\s*(--font-size-([\d_]+))\s*\)\s*\*\s*([\d.]+)\s*\)/.exec(value);
  if (calcToken) {
    const def = new RegExp(
      `${calcToken[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([\\d.]+)px`,
    ).exec(tokens);
    if (def) return Number(def[1]) * Number(calcToken[3]);
  }
  const plain = /^([\d.]+)px$/.exec(value.trim());
  return plain ? Number(plain[1]) : 0;
}

function declarations(selectorPattern) {
  const out = [];
  const re = new RegExp(`(^|[\\s}])${selectorPattern}\\s*\\{([^}]*)\\}`, "g");
  let match;
  while ((match = re.exec(css))) {
    const body = match[2];
    const get = (prop) => {
      const m = new RegExp(`(^|;|\\s)${prop}\\s*:\\s*([^;]+);`).exec(body);
      return m ? m[2].trim() : null;
    };
    out.push({
      fontSize: get("font-size"),
      minHeight: get("min-height"),
      lineHeight: get("line-height"),
    });
  }
  return out;
}

const base = declarations("\\.turn-info");
const yourTurn = declarations("\\.turn-info\\.your-turn");
assert.ok(base.length > 0, "expected .turn-info rules");
assert.equal(yourTurn.length, 1, "expected one .turn-info.your-turn rule");

const yourTurnLine = px(yourTurn[0].fontSize) * LINE_HEIGHT;
assert.ok(yourTurnLine > 0, `your-turn font-size should resolve (got ${yourTurn[0].fontSize})`);

const baseRule = base.find((rule) => rule.lineHeight);
assert.equal(
  baseRule && baseRule.lineHeight,
  String(LINE_HEIGHT),
  "turn-info line-height changed; update test",
);
assert.ok(
  px(baseRule.minHeight) + 0.01 >= yourTurnLine,
  `.turn-info min-height ${baseRule.minHeight} must reserve the your-turn line (${yourTurnLine}px)`,
);

let sized = 0;
for (const rule of base) {
  if (!rule.fontSize) continue;
  const sizePx = px(rule.fontSize);
  if (!sizePx) continue;
  const line = sizePx * LINE_HEIGHT;
  if (line <= yourTurnLine) continue; // covered by the base min-height
  sized += 1;
  assert.ok(
    rule.minHeight && px(rule.minHeight) + 0.01 >= line,
    `.turn-info at font-size ${rule.fontSize} needs min-height >= ${line}px (got ${rule.minHeight})`,
  );
}
assert.ok(sized >= 1, "expected the 16px desktop .turn-info rule to be checked");

console.log("turn-info-stable: ok");
