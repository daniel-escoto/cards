/**
 * Offline Preflop Trainer — RFI Raise/Fold drills with shared chart data.
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
    };

    /** Seat order clockwise from UTG for table diagrams (no BB — RFI only). */
    const DIAGRAM_SEATS_6 = ["UTG", "HJ", "CO", "BTN", "SB"] as const;
    const DIAGRAM_SEATS_9 = ["UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB"] as const;

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

      const backBtn = trainerView.querySelector("#trainerBackBtn") as HTMLButtonElement | null;
      const size6Btn = trainerView.querySelector("#trainerSize6") as HTMLButtonElement | null;
      const size9Btn = trainerView.querySelector("#trainerSize9") as HTMLButtonElement | null;
      const accuracyEl = trainerView.querySelector("#trainerAccuracy") as HTMLElement | null;
      const positionEl = trainerView.querySelector("#trainerPosition") as HTMLElement | null;
      const diagramEl = trainerView.querySelector("#trainerTableDiagram") as HTMLElement | null;
      const cardsEl = trainerView.querySelector("#trainerCards") as HTMLElement | null;
      const raiseBtn = trainerView.querySelector("#trainerRaiseBtn") as HTMLButtonElement | null;
      const foldBtn = trainerView.querySelector("#trainerFoldBtn") as HTMLButtonElement | null;
      const actionsEl = trainerView.querySelector("#trainerActions") as HTMLElement | null;
      const feedbackEl = trainerView.querySelector("#trainerFeedback") as HTMLElement | null;
      const feedbackTitle = trainerView.querySelector("#trainerFeedbackTitle") as HTMLElement | null;
      const feedbackDetail = trainerView.querySelector(
        "#trainerFeedbackDetail",
      ) as HTMLElement | null;
      const chartEl = trainerView.querySelector("#trainerChart") as HTMLElement | null;
      const nextBtn = trainerView.querySelector("#trainerNextBtn") as HTMLButtonElement | null;
      const statsEl = trainerView.querySelector("#trainerStats") as HTMLElement | null;
      const statsSummaryEl = trainerView.querySelector(
        "#trainerStatsSummary",
      ) as HTMLElement | null;
      const resetBtn = trainerView.querySelector("#trainerResetBtn") as HTMLButtonElement | null;
      const joinError = doc.querySelector("#joinError") as HTMLElement | null;

      if (
        !backBtn ||
        !size6Btn ||
        !size9Btn ||
        !accuracyEl ||
        !positionEl ||
        !cardsEl ||
        !raiseBtn ||
        !foldBtn ||
        !actionsEl ||
        !feedbackEl ||
        !feedbackTitle ||
        !feedbackDetail ||
        !chartEl ||
        !nextBtn ||
        !statsEl ||
        !resetBtn
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
        accuracyEl!.textContent =
          stats.overall.total > 0 ? overallPct : "—";
        if (statsSummaryEl) {
          statsSummaryEl.textContent =
            stats.overall.total > 0
              ? `${overallPct} · streak ${stats.streak}`
              : "Stats";
        }
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

      function renderDiagram(activePos: string): void {
        if (!diagramEl) return;
        const seats = tableSize === 6 ? DIAGRAM_SEATS_6 : DIAGRAM_SEATS_9;
        let html = "";
        for (const seat of seats) {
          const on = seat === activePos ? " is-hero" : "";
          html += `<span class="trainer-seat-dot${on}" title="${seat}"><span>${seat}</span></span>`;
        }
        diagramEl.innerHTML = html;
        diagramEl.dataset.size = String(tableSize);
      }

      function renderPosition(position: string): void {
        positionEl!.innerHTML = "";
        const pill = doc.createElement("span");
        pill.className = "trainer-pos-pill";
        pill.textContent = position;
        const note = doc.createElement("span");
        note.className = "trainer-pos-note";
        note.textContent = "folded to you";
        positionEl!.append(pill, note);
        renderDiagram(position);
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
      }

      function dealNext(): void {
        const dealt = ranges!.dealRandomRfiSpot(tableSize);
        spot = {
          tableSize: dealt.tableSize,
          position: dealt.position,
          cards: dealt.cards,
          handKey: dealt.handKey,
          standard: dealt.standard,
          answered: false,
        };
        trainerView.classList.remove("is-answered");
        renderPosition(dealt.position);
        cardsEl!.innerHTML = cardHtml(dealt.cards[0]) + cardHtml(dealt.cards[1]);
        actionsEl!.classList.remove("hidden");
        feedbackEl!.classList.add("hidden");
        raiseBtn!.disabled = false;
        foldBtn!.disabled = false;
        chartEl!.innerHTML = "";
        feedbackTitle!.textContent = "";
        feedbackDetail!.textContent = "";
      }

      function answer(chosen: "raise" | "fold"): void {
        if (!spot || spot.answered) return;
        const graded = ranges!.gradeRfiAction(tableSize, spot.position, spot.handKey, chosen);
        if (!graded) return;
        spot.answered = true;
        raiseBtn!.disabled = true;
        foldBtn!.disabled = true;
        actionsEl!.classList.add("hidden");
        feedbackEl!.classList.remove("hidden");
        trainerView.classList.add("is-answered");
        feedbackTitle!.textContent = graded.correct ? "Correct" : "Incorrect";
        feedbackTitle!.classList.toggle("is-correct", graded.correct);
        feedbackTitle!.classList.toggle("is-wrong", !graded.correct);
        const label = graded.standard === "raise" ? "Raise" : "Fold";
        feedbackDetail!.textContent = `${label} — ${spot.handKey} is ${
          graded.standard === "raise" ? "an open" : "a fold"
        } from ${spot.position}`;
        renderChart(spot.handKey);
        stats = recordResult(stats, spot.position, graded.correct);
        saveStats(stats);
        renderStats();
      }

      function showTrainer(): void {
        if (tableView) tableView.classList.add("hidden");
        if (scoreView) scoreView.classList.add("hidden");
        welcome.classList.add("hidden");
        trainerView.classList.remove("hidden");
        doc.documentElement.classList.add("trainer-open-root");
        doc.body.classList.add("trainer-open");
        doc.documentElement.classList.remove("game-open-root");
        doc.body.classList.remove("game-open", "keyboard-open");
        active = true;
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
        trainerView.classList.add("hidden");
        trainerView.classList.remove("is-answered");
        welcome.classList.remove("hidden");
        doc.documentElement.classList.remove("trainer-open-root");
        doc.body.classList.remove("trainer-open");
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
        }
      }

      const onTrainerClick = () => showTrainer();
      const onBack = () => hideTrainer();
      const onRaise = () => answer("raise");
      const onFold = () => answer("fold");
      const onNext = () => dealNext();
      const onReset = () => {
        stats = emptyStats();
        saveStats(stats);
        renderStats();
      };
      const onSize6 = () => onSize(6);
      const onSize9 = () => onSize(9);

      trainerBtn.addEventListener("click", onTrainerClick);
      practiceBtn?.addEventListener("click", onPractice);
      backBtn.addEventListener("click", onBack);
      raiseBtn.addEventListener("click", onRaise);
      foldBtn.addEventListener("click", onFold);
      nextBtn.addEventListener("click", onNext);
      resetBtn.addEventListener("click", onReset);
      size6Btn.addEventListener("click", onSize6);
      size9Btn.addEventListener("click", onSize9);
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
          backBtn.removeEventListener("click", onBack);
          raiseBtn.removeEventListener("click", onRaise);
          foldBtn.removeEventListener("click", onFold);
          nextBtn.removeEventListener("click", onNext);
          resetBtn.removeEventListener("click", onReset);
          size6Btn.removeEventListener("click", onSize6);
          size9Btn.removeEventListener("click", onSize9);
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
