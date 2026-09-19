/* Shared, resolution-independent artwork. Indices remain in the card template. */
const CardArt = (() => {
  // Option D — airy French-suited grid (viewBox 0 0 100 144).
  const layouts = {
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

  function courtHalf(rank) {
    const queen = rank === "Q";
    const king = rank === "K";
    const headwear = rank === "J"
      ? '<path class="court-ink" d="M28 16 24 5 66 2 73 10 65 16Z"/><path class="court-red" d="M29 12H66V18H29Z"/>'
      : '<path class="court-accent" d="M29 17 24 3 38 9 47 0 56 9 71 3 65 17Z"/><path class="court-red" d="M29 14H65V20H29Z"/>';
    const hair = queen
      ? '<path class="court-ink" d="M30 19Q18 32 21 49L39 53 65 46 63 20Z"/>'
      : '<path class="court-ink" d="M30 19 65 19 67 42 53 49 26 43Q20 39 27 32Z"/>';
    const beard = king
      ? '<path class="court-ink" d="M38 35Q43 42 48 36L60 35 59 48 47 56 35 46 33 34Z"/><path class="court-paper court-line" d="M47 42h7"/>'
      : '<path class="court-line" d="M48 40q5 3 9-1"/>';
    const prop = queen
      ? '<path class="court-line court-stem" d="M82 71V39M82 59q-12-1-11-10 11 0 11 10M82 53q11-1 10-10-10 0-10 10"/><g class="court-red"><circle cx="82" cy="30" r="6"/><circle cx="75" cy="36" r="6"/><circle cx="89" cy="36" r="6"/><circle cx="78" cy="43" r="6"/><circle cx="86" cy="43" r="6"/></g><circle class="court-paper" cx="82" cy="37" r="4"/>'
      : king
        ? '<path class="court-ink" d="M80 70V14L84 6 88 14V70Z"/><path class="court-paper" d="M83 17h2v37h-2Z"/><path class="court-accent" d="M74 54H94V59H74Z"/>'
        : '<path class="court-ink" d="M81 70V30H85V70Z"/><path class="court-accent" d="m83 10 7 12-7 11-7-11Z"/>';
    return `${prop}
      <path class="court-accent" d="M34 45Q12 47 10 68V72H73V65Q71 49 58 46Z"/>
      <path class="court-red" d="M23 48 46 67 62 47 70 53 53 72H36L16 55Z"/>
      <path class="court-ink" d="M12 56Q4 61 7 71H23V52Z"/>
      <path class="court-paper" d="M39 39H55V51L47 58 38 50Z"/>
      ${hair}
      <path class="court-paper" d="M36 21H58L58 29 64 33 59 36V42Q51 50 39 41L34 33Z"/>
      <path class="court-line" d="M48 27h6M53 30v2"/>
      ${beard}${headwear}
      <path class="court-line" d="M35 24q-7 1-5 8"/>
      <path class="court-paper court-outline" d="M78 61q-5-4-8 1v8q8 6 17-1v-7q-2-4-5 0Z"/>
      <path class="court-line" d="M78 65h7"/>
      <path class="court-trim" d="m27 54 20 18 17-18M17 61v11"/>
      <path class="court-detail" d="m29 61 3 3-3 3-3-3Zm35 2 3 3-3 3-3-3Z"/>`;
  }

  function pipSize(rank) {
    return rank === "10" ? 33 : 36;
  }

  function renderPip([x, y], suit, size) {
    const flip = y > 72 ? ` transform="rotate(180 ${x} ${y})"` : "";
    return `<text class="card-pip" x="${x}" y="${y}" font-size="${size}"${flip}>${suit}</text>`;
  }

  function render(rank, suit) {
    if (!["♠", "♥", "♦", "♣"].includes(suit)) return "";
    let content;
    let type = "pips";
    if (["J", "Q", "K"].includes(rank)) {
      type = "court";
      const half = courtHalf(rank);
      content = `<g>${half}</g><g transform="rotate(180 50 72)">${half}</g>`;
    } else if (rank === "A") {
      type = "ace";
      content = `<text class="card-pip" x="50" y="72" font-size="86">${suit}</text>`;
    } else {
      const points = layouts[rank];
      if (!points) return "";
      const size = pipSize(rank);
      content = points.map((point) => renderPip(point, suit, size)).join("");
    }
    return `<span class="card-art card-art-${type}" aria-hidden="true"><svg viewBox="0 0 100 144" focusable="false" xmlns="http://www.w3.org/2000/svg">${content}</svg></span>`;
  }

  return { render, layouts };
})();

if (typeof module !== "undefined") module.exports = CardArt;
