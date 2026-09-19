const assert = require("node:assert/strict");
const CardArt = require("../public/card-art");

for (const suit of ["♠", "♥", "♦", "♣"]) {
  for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
    const markup = CardArt.render(rank, suit);
    const pips = [...markup.matchAll(/<text class="card-pip"[^>]*>(.*?)<\/text>/g)];
    assert.equal(pips.length, rank === "A" ? 1 : Number(rank), `${rank}${suit} pip count`);
    assert(pips.every((pip) => pip[1] === suit));
    assert(markup.includes('aria-hidden="true"'), "Art must not duplicate the card's accessible label");
  }
  const portraits = ["J", "Q", "K"].map((rank) => CardArt.render(rank, suit));
  assert.equal(new Set(portraits).size, 3, "Each court rank has distinct artwork");
  portraits.forEach((portrait) => assert(portrait.includes('rotate(180 50 72)'), "Courts are reversible"));
}
assert.equal(CardArt.render("bad", "♠"), "");
assert.equal(CardArt.render("A", "<script>"), "");
console.log("All 52 card artwork checks passed.");
