#!/usr/bin/env node
/**
 * Cash-game join / money-panel copy stays factual and short (no settle-up essays).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Format = require("../dist/public/app-format");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const bootSrc = fs.readFileSync(path.join(__dirname, "../public/app-boot.ts"), "utf8");
const tableSrc = fs.readFileSync(path.join(__dirname, "../public/app-table.ts"), "utf8");
const handlersSrc = fs.readFileSync(path.join(__dirname, "../server/sockets/handlers.ts"), "utf8");

{
  assert.equal(Format.formatMoneyCompact(2500), "$25");
  assert.equal(Format.formatMoneyCompact(10), "$0.10");
  assert.equal(Format.formatMoneyCompact(25), "$0.25");
  assert.equal(Format.formatMoneyCompact(2550), "$25.50");
  assert.equal(
    Format.moneyJoinSummary({ buyInCents: 2500, smallBlindCents: 10, bigBlindCents: 25 }),
    "$25 buy-in · $0.10/$0.25 blinds",
  );
  assert.equal(Format.moneyJoinButtonLabel({ buyInCents: 2500 }), "Join · $25");
  assert.equal(Format.moneyJoinButtonLabel(null), "Join");
  assert.equal(Format.moneyJoinButtonLabel(undefined), "Join");
}

{
  assert.doesNotMatch(html, /Track buy-ins in dollars/);
  assert.doesNotMatch(html, /Settle up after the game/);
  assert.doesNotMatch(html, /Buy-ins during a hand apply/);
  assert.match(html, /id="joinPreview"/);
  assert.match(html, /class="money-note hidden"/);
}

{
  assert.doesNotMatch(bootSrc, /Join table · Play next hand/);
  assert.doesNotMatch(bootSrc, /Join table"/);
  assert.match(bootSrc, /moneyJoinButtonLabel\(acceptedMoneyTerms\)/);
  assert.doesNotMatch(bootSrc, /Settle up after the game/);
  assert.doesNotMatch(bootSrc, /Buy-in now for the next deal/);
  assert.match(bootSrc, /Finish this hand first/);
}

{
  assert.doesNotMatch(tableSrc, /Money game ·/);
  assert.doesNotMatch(tableSrc, /Payments happen separately/);
  assert.doesNotMatch(tableSrc, /You’ll play on the next deal|You'll play on the next deal/);
  assert.doesNotMatch(tableSrc, /Confirm to take a seat/);
  assert.doesNotMatch(tableSrc, /Take a seat/);
  assert.match(tableSrc, /moneyJoinSummary\(/);
  assert.match(tableSrc, /moneyJoinButtonLabel\(acceptedMoneyTerms\)/);
}

{
  assert.doesNotMatch(handlersSrc, /Review the buy-in and blinds before joining/);
  assert.match(handlersSrc, /Confirm buy-in\./);
}

{
  const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
  assert.match(
    css,
    /\.welcome \.actions-row > #tableActionBtn \{[^}]*white-space:\s*nowrap/s,
    "join CTA stays single-line at 375",
  );
}

console.log("Money join copy checks passed.");
