/**
 * Offline Preflop Trainer — RFI Raise/Fold drills presented as table-layout puzzles.
 */
(function (
  root: typeof globalThis & {
    PreflopTrainer?: PreflopTrainerAPI;
    RfiRanges?: RfiRangesAPI;
    HoldemFormat?: HoldemFormatAPI;
  },
  factory: (
    ranges: RfiRangesAPI | undefined,
    format: HoldemFormatAPI | undefined,
  ) => PreflopTrainerAPI,
) {
  if (typeof module === "object" && module.exports) {
    let ranges: RfiRangesAPI | undefined;
    try {
      ranges = require("../shared/rfi-ranges.node.js") as RfiRangesAPI;
    } catch {
      try {
        ranges = require("../shared/rfi-ranges.js") as RfiRangesAPI;
      } catch {
        ranges = undefined;
      }
    }
    let format: HoldemFormatAPI | undefined;
    try {
      format = require("./app-format.js") as HoldemFormatAPI;
    } catch {
      format = undefined;
    }
    module.exports = factory(ranges, format);
  } else {
    root.PreflopTrainer = factory(root.RfiRanges, root.HoldemFormat);
  }
})(
  typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis),
  function (ranges, format) {
    "use strict";

    const STATS_KEY = "holdem:trainer-stats";
    const TABLE_KEY = "holdem:trainer-table";
    const SMALL_BLIND = 10;
    const BIG_BLIND = 20;
    const STARTING_STACK = 1000;
    const POT = SMALL_BLIND + BIG_BLIND;

    /** Full table seats including BB (RFI spots never deal BB). */
    const TABLE_SEATS_6 = ["UTG", "HJ", "CO", "BTN", "SB", "BB"] as const;
    const TABLE_SEATS_9 = [
      "UTG",
      "UTG+1",
      "MP",
      "LJ",
      "HJ",
      "CO",
      "BTN",
      "SB",
      "BB",
    ] as const;

    type TrainerStats = {
      overall: { correct: number; total: number };
      streak: number;
      bestStreak: number;
      byPosition: Record<string, { correct: number; total: number }>;
    };

    type SpotState = {
      tableSize: 6 | 9;
      position: string;
      cards: [PublicCard, PublicCard];
      handKey: string;
      standard: "raise" | "fold";
      answered: boolean;
      chosen: "raise" | "fold" | null;
      correct: boolean | null;
    };

    function emptyStats(): TrainerStats {
      return {
        overall: { correct: 0, total: 0 },
        streak: 0,
        bestStreak: 0,
        byPosition: {},
      };
    }

    function loadStats(): TrainerStats {
      try {
        const raw = localStorage.getItem(STATS_KEY);
        if (!raw) return emptyStats();
        const parsed = JSON.parse(raw) as TrainerStats;
        if (
          !parsed ||
          typeof parsed !== "object" ||
          !parsed.overall ||
          typeof parsed.overall.correct !== "number" ||
          typeof parsed.overall.total !== "number"
        ) {
          return emptyStats();
        }
        return {
          overall: {
            correct: Math.max(0, Math.floor(parsed.overall.correct)),
            total: Math.max(0, Math.floor(parsed.overall.total)),
          },
          streak: Math.max(0, Math.floor(Number(parsed.streak) || 0)),
          bestStreak: Math.max(0, Math.floor(Number(parsed.bestStreak) || 0)),
          byPosition:
            parsed.byPosition && typeof parsed.byPosition === "object" ? parsed.byPosition : {},
        };
      } catch {
        return emptyStats();
      }
    }

    function saveStats(stats: TrainerStats): void {
      try {
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
      } catch {
        /* ignore quota / private mode */
      }
    }

    function loadTableSize(): 6 | 9 {
      try {
        if (localStorage.getItem(TABLE_KEY) === "9") return 9;
      } catch {
        /* ignore */
      }
      return 6;
    }

    function saveTableSize(size: 6 | 9): void {
      try {
        localStorage.setItem(TABLE_KEY, String(size));
      } catch {
        /* ignore */
      }
    }

    function pct(correct: number, total: number): string {
      if (total <= 0) return "—";
      return `${Math.round((100 * correct) / total)}%`;
    }

    function recordResult(stats: TrainerStats, position: string, correct: boolean): TrainerStats {
      const streak = correct ? stats.streak + 1 : 0;
      const next: TrainerStats = {
        overall: {
          correct: stats.overall.correct + (correct ? 1 : 0),
          total: stats.overall.total + 1,
        },
        streak,
        bestStreak: Math.max(stats.bestStreak, streak),
        byPosition: { ...stats.byPosition },
      };
      const prior = next.byPosition[position] || { correct: 0, total: 0 };
      next.byPosition[position] = {
        correct: prior.correct + (correct ? 1 : 0),
        total: prior.total + 1,
      };
      return next;
    }

    function escapeHtml(value: string): string {
      if (format && typeof format.escapeHtml === "function") {
        return format.escapeHtml(value);
      }
      return value.replace(/[&<>"']/g, (char) => {
        switch (char) {
          case "&":
            return "&amp;";
          case "<":
            return "&lt;";
          case ">":
            return "&gt;";
          case '"':
            return "&quot;";
          default:
            return "&#39;";
        }
      });
    }

    function seatsForTable(tableSize: 6 | 9): readonly string[] {
      return tableSize === 6 ? TABLE_SEATS_6 : TABLE_SEATS_9;
    }

    function stackForSeat(seat: string): number {
      if (seat === "SB") return STARTING_STACK - SMALL_BLIND;
      if (seat === "BB") return STARTING_STACK - BIG_BLIND;
      return STARTING_STACK;
    }

    function seatChipMarkup(seat: string): string {
      const chips: string[] = [];
      if (seat === "BTN") {
        chips.push('<span class="blind-chip dealer" title="Dealer" aria-label="Dealer">D</span>');
      }
      if (seat === "SB") {
        chips.push(
          '<span class="blind-chip small" title="Small blind" aria-label="Small blind">SB</span>',
        );
      }
      if (seat === "BB") {
        chips.push(
          '<span class="blind-chip big" title="Big blind" aria-label="Big blind">BB</span>',
        );
      }
      return chips.map((chip) => `<span class="seat-chip-slot">${chip}</span>`).join("");
    }

    function bind(doc: Document = document): { destroy: () => void } | null {
      if (!ranges) return null;

      const welcomeEl = doc.querySelector("#welcome");
      const trainerViewEl = doc.querySelector("#trainerView");
      const tableView = doc.querySelector("#tableView") as HTMLElement | null;
      const scoreView = doc.querySelector("#scoreView") as HTMLElement | null;
      const practiceBtn = doc.querySelector("#practiceBtn") as HTMLButtonElement | null;
      const trainerBtn = doc.querySelector("#trainerBtn") as HTMLButtonElement | null;
      if (
        !(welcomeEl instanceof HTMLElement) ||
        !(trainerViewEl instanceof HTMLElement) ||
        !(trainerBtn instanceof HTMLButtonElement)
      ) {
        return null;
      }
      const welcome = welcomeEl;
      const trainerView = trainerViewEl;

      const homeBtn = trainerView.querySelector("#trainerHomeBtn") as HTMLButtonElement | null;
      const menuBtn = trainerView.querySelector("#trainerMenuBtn") as HTMLButtonElement | null;
      const accuracyEl = trainerView.querySelector("#trainerAccuracy") as HTMLElement | null;
      const potEl = trainerView.querySelector("#trainerPotValue") as HTMLElement | null;
      const heroHandEl = trainerView.querySelector("#trainerHeroHand") as HTMLElement | null;
      const turnInfoEl = trainerView.querySelector("#trainerTurnInfo") as HTMLElement | null;
      const actionsEl = trainerView.querySelector("#trainerActions") as HTMLElement | null;
      const playersEl = trainerView.querySelector("#trainerPlayers") as HTMLElement | null;
      const controlPanel = trainerView.querySelector(
        "#trainerControlPanel",
      ) as HTMLElement | null;

      const menuModal = doc.querySelector("#trainerMenuModal") as HTMLElement | null;
      const closeMenuBtn = doc.querySelector("#trainerCloseMenuBtn") as HTMLButtonElement | null;
      const size6Btn = doc.querySelector("#trainerSize6") as HTMLButtonElement | null;
      const size9Btn = doc.querySelector("#trainerSize9") as HTMLButtonElement | null;
      const statsEl = doc.querySelector("#trainerStats") as HTMLElement | null;
      const resetBtn = doc.querySelector("#trainerResetBtn") as HTMLButtonElement | null;
      const leaveBtn = doc.querySelector("#trainerLeaveBtn") as HTMLButtonElement | null;

      const chartModal = doc.querySelector("#trainerChartModal") as HTMLElement | null;
      const closeChartBtn = doc.querySelector("#trainerCloseChartBtn") as HTMLButtonElement | null;
      const chartEl = doc.querySelector("#trainerChart") as HTMLElement | null;
      const chartEyebrow = doc.querySelector("#trainerChartEyebrow") as HTMLElement | null;
      const joinError = doc.querySelector("#joinError") as HTMLElement | null;

      if (
        !homeBtn ||
        !menuBtn ||
        !accuracyEl ||
        !potEl ||
        !heroHandEl ||
        !turnInfoEl ||
        !actionsEl ||
        !playersEl ||
        !controlPanel ||
        !menuModal ||
        !closeMenuBtn ||
        !size6Btn ||
        !size9Btn ||
        !statsEl ||
        !resetBtn ||
        !leaveBtn ||
        !chartModal ||
        !closeChartBtn ||
        !chartEl
      ) {
        return null;
      }

      let tableSize: 6 | 9 = loadTableSize();
      let stats = loadStats();
      let spot: SpotState | null = null;
      let active = false;

      function cardHtml(card: PublicCard): string {
        if (format && typeof format.cardTemplate === "function") {
          return format.cardTemplate(card);
        }
        const name = `${card.rank}${card.suit}`;
        return `<div class="card ${card.color === "red" ? "red" : ""}" aria-label="${name}">
          <span class="card-corner card-corner-top"><span class="card-rank">${card.rank}</span></span>
          <span class="card-corner card-corner-bottom"><span class="card-corner-suit suit">${card.suit}</span></span>
        </div>`;
      }

      function renderStats(): void {
        const overallPct = pct(stats.overall.correct, stats.overall.total);
        accuracyEl!.textContent = stats.overall.total > 0 ? overallPct : "—";
        const parts: string[] = [
          `Overall ${stats.overall.correct}/${stats.overall.total} (${overallPct})`,
          `Streak ${stats.streak}${stats.bestStreak ? ` (best ${stats.bestStreak})` : ""}`,
        ];
        const order = ranges!.positionsForTable(tableSize);
        for (const pos of order) {
          const row = stats.byPosition[pos];
          if (!row || row.total === 0) continue;
          parts.push(`${pos} ${row.correct}/${row.total}`);
        }
        statsEl!.textContent = parts.join(" · ");
      }

      function renderSizeToggle(): void {
        size6Btn!.classList.toggle("selected", tableSize === 6);
        size9Btn!.classList.toggle("selected", tableSize === 9);
        size6Btn!.setAttribute("aria-pressed", tableSize === 6 ? "true" : "false");
        size9Btn!.setAttribute("aria-pressed", tableSize === 9 ? "true" : "false");
      }

      function renderPlayers(): void {
        if (!spot) {
          playersEl!.innerHTML = "";
          return;
        }
        const seats = seatsForTable(spot.tableSize);
        const heroIndex = seats.indexOf(spot.position);
        const html = seats
          .map((seat, index) => {
            const isHero = seat === spot!.position;
            const folded = heroIndex >= 0 && index < heroIndex;
            const isActing = isHero && !spot!.answered;
            const waitingAfter = !folded && !isHero;
            let action = "";
            let actionClass = "";
            const nextSeat =
              !spot!.answered && heroIndex >= 0 ? seats[heroIndex + 1] || null : null;
            if (folded) {
              action = "Fold";
            } else if (isHero && spot!.answered) {
              action = spot!.chosen === "raise" ? "Raise" : "Fold";
              actionClass = spot!.chosen === "raise" ? " action-token-raise" : "";
            } else if (isActing) {
              action = "Acting";
            } else if (waitingAfter) {
              // Live-game cue: next seat after the actor shows muted "Next".
              if (seat === nextSeat) {
                action = "Next";
                actionClass = " is-next";
              } else {
                action = "—";
                actionClass = " is-waiting";
              }
            }
            const classes = [
              "table-player-row",
              isActing ? "turn" : "",
              seat === nextSeat ? "next-to-act" : "",
              folded ? "folded" : "",
              isHero ? "you" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return `<article class="${classes}">
              <span class="seat-timer" aria-hidden="true"><i class="player-dot"></i></span>
              <span class="seat-name seat-name-with-chips"><span class="seat-name-text">${escapeHtml(seat)}</span>${seatChipMarkup(seat)}</span>
              <span class="player-action${actionClass}">${escapeHtml(action)}</span>
              <strong class="player-stack">${stackForSeat(seat)}</strong>
            </article>`;
          })
          .join("");
        playersEl!.innerHTML = html;
      }

      function renderChart(highlightKey: string): void {
        const cells = ranges!.rfiChart(tableSize, spot!.position);
        if (!cells) {
          chartEl!.innerHTML = "";
          return;
        }
        const ranks = ranges!.RANK_ORDER;
        let html =
          '<div class="trainer-chart-grid" role="img" aria-label="Opening range chart">';
        html += '<span class="trainer-chart-corner"></span>';
        for (const rank of ranks) {
          html += `<span class="trainer-chart-axis">${rank}</span>`;
        }
        for (let row = 0; row < 13; row += 1) {
          html += `<span class="trainer-chart-axis">${ranks[row]}</span>`;
          for (let col = 0; col < 13; col += 1) {
            const cell = cells[row * 13 + col]!;
            const highlight = cell.key === highlightKey ? " is-hand" : "";
            const label = cell.key.length <= 3 ? cell.key : cell.key.slice(0, 2);
            html += `<span class="trainer-chart-cell is-${cell.action}${highlight}" title="${cell.key}">${label}</span>`;
          }
        }
        html += "</div>";
        chartEl!.innerHTML = html;
        if (chartEyebrow) {
          chartEyebrow.textContent = `${spot!.position} · ${tableSize}-max open`;
        }
      }

      function renderActions(): void {
        if (!spot) {
          actionsEl!.innerHTML = "";
          return;
        }
        if (!spot.answered) {
          actionsEl!.innerHTML = `
            <button id="trainerFoldBtn" class="secondary has-shortcut" type="button">
              Fold <kbd>F</kbd>
            </button>
            <button id="trainerRaiseBtn" class="has-shortcut" type="button">
              Raise <kbd>R</kbd>
            </button>
          `;
          const foldBtn = actionsEl!.querySelector("#trainerFoldBtn") as HTMLButtonElement;
          const raiseBtn = actionsEl!.querySelector("#trainerRaiseBtn") as HTMLButtonElement;
          foldBtn.addEventListener("click", () => answer("fold"));
          raiseBtn.addEventListener("click", () => answer("raise"));
          return;
        }
        actionsEl!.innerHTML = `
          <button id="trainerChartBtn" class="secondary" type="button">Chart</button>
          <button id="trainerNextBtn" class="has-shortcut" type="button">
            Next hand <kbd>N</kbd>
          </button>
        `;
        const chartBtn = actionsEl!.querySelector("#trainerChartBtn") as HTMLButtonElement;
        const nextBtn = actionsEl!.querySelector("#trainerNextBtn") as HTMLButtonElement;
        chartBtn.addEventListener("click", openChart);
        nextBtn.addEventListener("click", () => dealNext());
      }

      function renderTurnInfo(): void {
        if (!spot) {
          turnInfoEl!.textContent = "";
          turnInfoEl!.classList.remove("your-turn", "showdown-message");
          return;
        }
        if (!spot.answered) {
          turnInfoEl!.classList.add("your-turn");
          turnInfoEl!.classList.remove("showdown-message");
          turnInfoEl!.textContent = `Folded to you · ${spot.position}`;
          return;
        }
        turnInfoEl!.classList.remove("your-turn");
        turnInfoEl!.classList.add("showdown-message");
        const label = spot.standard === "raise" ? "Raise" : "Fold";
        const article = spot.standard === "raise" ? "an open" : "a fold";
        const verdict = spot.correct ? "Correct" : "Incorrect";
        turnInfoEl!.innerHTML = `<strong class="trainer-verdict ${
          spot.correct ? "is-correct" : "is-wrong"
        }">${verdict}</strong> · ${label} — ${escapeHtml(spot.handKey)} is ${article} from ${escapeHtml(spot.position)}`;
      }

      function dealNext(): void {
        closeChart();
        const dealt = ranges!.dealRandomRfiSpot(tableSize);
        spot = {
          tableSize: dealt.tableSize,
          position: dealt.position,
          cards: dealt.cards,
          handKey: dealt.handKey,
          standard: dealt.standard,
          answered: false,
          chosen: null,
          correct: null,
        };
        trainerView.classList.remove("is-answered");
        potEl!.textContent = String(POT);
        heroHandEl!.innerHTML = cardHtml(dealt.cards[0]) + cardHtml(dealt.cards[1]);
        chartEl!.innerHTML = "";
        renderPlayers();
        renderTurnInfo();
        renderActions();
      }

      function answer(chosen: "raise" | "fold"): void {
        if (!spot || spot.answered) return;
        const graded = ranges!.gradeRfiAction(tableSize, spot.position, spot.handKey, chosen);
        if (!graded) return;
        spot.answered = true;
        spot.chosen = chosen;
        spot.correct = graded.correct;
        trainerView.classList.add("is-answered");
        renderChart(spot.handKey);
        renderPlayers();
        renderTurnInfo();
        renderActions();
        stats = recordResult(stats, spot.position, graded.correct);
        saveStats(stats);
        renderStats();
      }

      function openMenu(): void {
        closeChart();
        menuModal!.classList.remove("hidden");
      }

      function closeMenu(): void {
        menuModal!.classList.add("hidden");
      }

      function openChart(): void {
        if (!spot?.answered) return;
        closeMenu();
        if (!chartEl!.innerHTML) renderChart(spot.handKey);
        chartModal!.classList.remove("hidden");
      }

      function closeChart(): void {
        chartModal!.classList.add("hidden");
      }

      function showTrainer(): void {
        if (tableView) tableView.classList.add("hidden");
        if (scoreView) scoreView.classList.add("hidden");
        welcome.classList.add("hidden");
        trainerView.classList.remove("hidden");
        doc.documentElement.classList.add("game-open-root", "trainer-open-root");
        doc.body.classList.add("game-open", "trainer-open");
        doc.body.classList.remove("keyboard-open");
        active = true;
        closeMenu();
        closeChart();
        renderSizeToggle();
        renderStats();
        dealNext();
        try {
          if (!/^\/trainer\/?$/i.test(window.location.pathname)) {
            if (window.location.pathname === "/" || window.location.pathname === "") {
              window.history.replaceState({}, "", "/trainer");
            }
          }
        } catch {
          /* ignore */
        }
      }

      function hideTrainer(): void {
        active = false;
        closeMenu();
        closeChart();
        trainerView.classList.add("hidden");
        trainerView.classList.remove("is-answered");
        welcome.classList.remove("hidden");
        doc.documentElement.classList.remove("game-open-root", "trainer-open-root");
        doc.body.classList.remove("game-open", "trainer-open");
        try {
          if (/^\/trainer\/?$/i.test(window.location.pathname)) {
            window.history.replaceState({}, "", "/");
          }
        } catch {
          /* ignore */
        }
      }

      function onPractice(): void {
        if (typeof startOfflineHost === "function") {
          startOfflineHost();
          return;
        }
        if (joinError) joinError.textContent = "Practice is unavailable.";
      }

      function onSize(size: 6 | 9): void {
        if (tableSize === size) return;
        tableSize = size;
        saveTableSize(size);
        renderSizeToggle();
        dealNext();
        renderStats();
      }

      function onKeydown(event: KeyboardEvent): void {
        if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        if (event.key === "Escape") {
          if (!chartModal!.classList.contains("hidden")) {
            event.preventDefault();
            closeChart();
            return;
          }
          if (!menuModal!.classList.contains("hidden")) {
            event.preventDefault();
            closeMenu();
            return;
          }
        }
        if (!menuModal!.classList.contains("hidden") || !chartModal!.classList.contains("hidden")) {
          return;
        }
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (!spot?.answered) {
          if (key === "r") {
            event.preventDefault();
            answer("raise");
            return;
          }
          if (key === "f") {
            event.preventDefault();
            answer("fold");
            return;
          }
        } else if (key === " " || key === "Enter" || key === "n") {
          event.preventDefault();
          dealNext();
        } else if (key === "c") {
          event.preventDefault();
          openChart();
        }
      }

      const onTrainerClick = () => showTrainer();
      const onHome = () => hideTrainer();
      const onLeave = () => {
        closeMenu();
        hideTrainer();
      };
      const onReset = () => {
        stats = emptyStats();
        saveStats(stats);
        renderStats();
      };
      const onSize6 = () => onSize(6);
      const onSize9 = () => onSize(9);
      const onMenuBackdrop = (event: MouseEvent) => {
        if (event.target === menuModal) closeMenu();
      };
      const onChartBackdrop = (event: MouseEvent) => {
        if (event.target === chartModal) closeChart();
      };

      trainerBtn.addEventListener("click", onTrainerClick);
      practiceBtn?.addEventListener("click", onPractice);
      homeBtn.addEventListener("click", onHome);
      menuBtn.addEventListener("click", openMenu);
      closeMenuBtn.addEventListener("click", closeMenu);
      leaveBtn.addEventListener("click", onLeave);
      resetBtn.addEventListener("click", onReset);
      size6Btn.addEventListener("click", onSize6);
      size9Btn.addEventListener("click", onSize9);
      closeChartBtn.addEventListener("click", closeChart);
      menuModal.addEventListener("click", onMenuBackdrop);
      chartModal.addEventListener("click", onChartBackdrop);
      doc.addEventListener("keydown", onKeydown);

      try {
        if (/^\/trainer\/?$/i.test(window.location.pathname)) {
          showTrainer();
        }
      } catch {
        /* ignore */
      }

      return {
        destroy() {
          active = false;
          trainerBtn.removeEventListener("click", onTrainerClick);
          practiceBtn?.removeEventListener("click", onPractice);
          homeBtn.removeEventListener("click", onHome);
          menuBtn.removeEventListener("click", openMenu);
          closeMenuBtn.removeEventListener("click", closeMenu);
          leaveBtn.removeEventListener("click", onLeave);
          resetBtn.removeEventListener("click", onReset);
          size6Btn.removeEventListener("click", onSize6);
          size9Btn.removeEventListener("click", onSize9);
          closeChartBtn.removeEventListener("click", closeChart);
          menuModal.removeEventListener("click", onMenuBackdrop);
          chartModal.removeEventListener("click", onChartBackdrop);
          doc.removeEventListener("keydown", onKeydown);
        },
      };
    }

    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          bind(document);
        });
      } else {
        bind(document);
      }
    }

    return {
      bind,
      loadStats,
      emptyStats,
      recordResult,
      STATS_KEY,
      TABLE_KEY,
    };
  },
);
