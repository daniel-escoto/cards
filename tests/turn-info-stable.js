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
const LINE_HEIGHT = 1.35;

function px(value) {
  const calc = /calc\(\s*([\d.]+)px\s*\*\s*([\d.]+)\s*\)/.exec(value);
  if (calc) return Number(calc[1]) * Number(calc[2]);
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
assert.ok(yourTurnLine > 0, "your-turn font-size should be in px");

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
  if (!rule.fontSize || !rule.fontSize.endsWith("px")) continue;
  const line = px(rule.fontSize) * LINE_HEIGHT;
  if (line <= yourTurnLine) continue; // covered by the base min-height
  sized += 1;
  assert.ok(
    rule.minHeight && px(rule.minHeight) + 0.01 >= line,
    `.turn-info at font-size ${rule.fontSize} needs min-height >= ${line}px (got ${rule.minHeight})`,
  );
}
assert.ok(sized >= 1, "expected the 16px desktop .turn-info rule to be checked");

console.log("turn-info-stable: ok");
