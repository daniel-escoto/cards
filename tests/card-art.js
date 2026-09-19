const assert = require("node:assert/strict");
const CardArt = require("../public/card-art");

const expectedLayouts = {
  2: [[50, 20], [50, 124]],
  3: [[50, 20], [50, 72], [50, 124]],
  4: [[24, 20], [76, 20], [24, 124], [76, 124]],
  5: [[24, 20], [76, 20], [50, 72], [24, 124], [76, 124]],
  6: [[24, 20], [76, 20], [24, 72], [76, 72], [24, 124], [76, 124]],
  7: [[24, 20], [76, 20], [50, 44], [24, 72], [76, 72], [24, 124], [76, 124]],
  8: [[24, 20], [76, 20], [50, 44], [24, 72], [76, 72], [50, 100], [24, 124], [76, 124]],
  9: [[24, 18], [76, 18], [24, 48], [76, 48], [50, 72], [24, 96], [76, 96], [24, 126], [76, 126]],
  10: [[24, 18], [76, 18], [50, 38], [24, 48], [76, 48], [24, 96], [76, 96], [50, 106], [24, 126], [76, 126]],
};

assert.deepEqual(CardArt.layouts, expectedLayouts, "Option D airy pip layouts");

for (const suit of ["♠", "♥", "♦", "♣"]) {
  for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
    const markup = CardArt.render(rank, suit);
    assert(markup.includes('class="card-art'), `${rank}${suit} includes art markup`);
    assert(markup.includes("<svg"), `${rank}${suit} includes svg`);
    const pips = [...markup.matchAll(/<text class="card-pip"[^>]*>(.*?)<\/text>/g)];
    assert.equal(pips.length, rank === "A" ? 1 : Number(rank), `${rank}${suit} pip count`);
    assert(pips.every((pip) => pip[1] === suit));
    assert(markup.includes('aria-hidden="true"'), "Art must not duplicate the card's accessible label");

    if (rank === "A") {
      assert(markup.includes('font-size="86"'), "Ace uses a large centered pip");
      assert(!markup.includes("transform="), "Ace stays upright");
    } else {
      const size = rank === "10" ? "33" : "36";
      assert(markup.includes(`font-size="${size}"`), `${rank} uses pip size ${size}`);

      for (const [x, y] of CardArt.layouts[rank]) {
        if (y > 72) {
          assert(
            markup.includes(`transform="rotate(180 ${x} ${y})"`),
            `${rank}${suit} flips pip at (${x},${y})`
          );
        } else {
          assert(
            !markup.includes(`transform="rotate(180 ${x} ${y})"`),
            `${rank}${suit} keeps centerline/top pip at (${x},${y}) upright`
          );
        }
      }
    }
  }
  const portraits = ["J", "Q", "K"].map((rank) => CardArt.render(rank, suit));
  assert.equal(new Set(portraits).size, 3, "Each court rank has distinct artwork");
  portraits.forEach((portrait) => {
    assert(portrait.includes('class="card-art card-art-court"'), "Court art markup present");
    assert(portrait.includes('rotate(180 50 72)'), "Courts are reversible");
  });
}
assert.equal(CardArt.render("bad", "♠"), "");
assert.equal(CardArt.render("A", "<script>"), "");
console.log("All 52 card artwork checks passed.");
