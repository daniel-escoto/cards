/**
 * Offline Preflop Trainer — RFI and facing-raise drills as table-layout puzzles.
 */
(function (
  root: typeof globalThis & {
    PreflopTrainer?: PreflopTrainerAPI;
    RfiRanges?: RfiRangesAPI;
    VsOpenRanges?: VsOpenRangesAPI;
    HoldemFormat?: HoldemFormatAPI;
    RaiseSizing?: RaiseSizingAPI;
  },
  factory: (
    ranges: RfiRangesAPI | undefined,
    vsOpen: VsOpenRangesAPI | undefined,
    format: HoldemFormatAPI | undefined,
    sizing: RaiseSizingAPI | undefined,
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
    let vsOpen: VsOpenRangesAPI | undefined;
    try {
      vsOpen = require("../shared/vs-open-ranges.node.js") as VsOpenRangesAPI;
    } catch {
      try {
        vsOpen = require("../shared/vs-open-ranges.js") as VsOpenRangesAPI;
      } catch {
        vsOpen = undefined;
      }
    }
    let format: HoldemFormatAPI | undefined;
    try {
      format = require("./app-format.js") as HoldemFormatAPI;
    } catch {
      format = undefined;
    }
    let sizing: RaiseSizingAPI | undefined;
    try {
      sizing = require("./raise-sizing.js") as RaiseSizingAPI;
    } catch {
      sizing = undefined;
    }
    module.exports = factory(ranges, vsOpen, format, sizing);
  } else {
    root.PreflopTrainer = factory(
      root.RfiRanges,
      root.VsOpenRanges,
      root.HoldemFormat,
      root.RaiseSizing,
    );
  }
})(
  typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis),
  function (ranges, vsOpen, format, sizing) {
    "use strict";

    const STATS_KEY = "holdem:trainer-stats";
    const TABLE_KEY = "holdem:trainer-table";
    const DRILL_KEY = "holdem:trainer-drill";
    const SMALL_BLIND = 10;
    const BIG_BLIND = 20;
    const STARTING_STACK = 1000;
    const POT_RFI = SMALL_BLIND + BIG_BLIND;

    type DrillMode = "rfi" | "facing" | "mix";
    type FacingAction = "fold" | "call" | "raise";

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

    const POSITION_FULL_NAME: Record<string, string> = {
      UTG: "Under the gun",
      "UTG+1": "Under the gun +1",
      MP: "Middle position",
      LJ: "Lojack",
      HJ: "Hijack",
      CO: "Cutoff",
      BTN: "Button",
      SB: "Small blind",
      BB: "Big blind",
    };

    const POSITION_BLURB: Record<string, string> = {
      UTG: "first to act, play tight",
      "UTG+1": "early seat, stay selective",
      MP: "middle seat, still cautious",
      LJ: "opens a bit wider than early",
      HJ: "mid-late, expanding range",
      CO: "late position, open wider",
      BTN: "acts last, widest range",
      SB: "out of position — open or fold",
      BB: "already posted; defend later",
    };

    function positionFullName(seat: string): string {
      return POSITION_FULL_NAME[seat] || seat;
    }

    function positionBlurb(seat: string): string {
      return POSITION_BLURB[seat] || "table position";
    }

    function positionLabel(seat: string): string {
      const full = positionFullName(seat);
      return full === seat ? seat : `${seat} · ${full}`;
    }

    type PositionStat = { correct: number; total: number; hinted: number };

    type TrainerStats = {
      overall: { correct: number; total: number; hinted: number };
      streak: number;
      bestStreak: number;
      byPosition: Record<string, PositionStat>;
    };

    type RfiSpotState = {
      kind: "rfi";
      tableSize: 6 | 9;
      position: string;
      cards: [PublicCard, PublicCard];
      handKey: string;
      standard: "raise" | "fold";
      answered: boolean;
      chosen: "raise" | "fold" | null;
      correct: boolean | null;
      hintStep: 0 | 1 | 2;
      whyOpen: boolean;
      scored: boolean;
    };

    type FacingSpotState = {
      kind: "facing";
      tableSize: 6 | 9;
      position: string;
      openerPosition: string;
      callers: string[];
      cards: [PublicCard, PublicCard];
      handKey: string;
      standard: FacingAction;
      openTo: number;
      toCall: number;
      pot: number;
      minRaiseTo: number;
      maxRaiseTo: number;
      raiseTo: number;
      answered: boolean;
      chosen: FacingAction | null;
      correct: boolean | null;
      hintStep: 0 | 1 | 2;
      whyOpen: boolean;
      scored: boolean;
    };

    type SpotState = RfiSpotState | FacingSpotState;

    function emptyStats(): TrainerStats {
      return {
        overall: { correct: 0, total: 0, hinted: 0 },
        streak: 0,
        bestStreak: 0,
        byPosition: {},
      };
    }

    function normalizePositionStat(raw: unknown): PositionStat {
      if (!raw || typeof raw !== "object") return { correct: 0, total: 0, hinted: 0 };
      const row = raw as { correct?: unknown; total?: unknown; hinted?: unknown };
      return {
        correct: Math.max(0, Math.floor(Number(row.correct) || 0)),
        total: Math.max(0, Math.floor(Number(row.total) || 0)),
        hinted: Math.max(0, Math.floor(Number(row.hinted) || 0)),
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
        const byPosition: Record<string, PositionStat> = {};
        if (parsed.byPosition && typeof parsed.byPosition === "object") {
          for (const [key, value] of Object.entries(parsed.byPosition)) {
            byPosition[key] = normalizePositionStat(value);
          }
        }
        return {
          overall: {
            correct: Math.max(0, Math.floor(parsed.overall.correct)),
            total: Math.max(0, Math.floor(parsed.overall.total)),
            hinted: Math.max(0, Math.floor(Number(parsed.overall.hinted) || 0)),
          },
          streak: Math.max(0, Math.floor(Number(parsed.streak) || 0)),
          bestStreak: Math.max(0, Math.floor(Number(parsed.bestStreak) || 0)),
          byPosition,
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

    function loadDrillMode(): DrillMode {
      try {
        const raw = localStorage.getItem(DRILL_KEY);
        if (raw === "facing" || raw === "mix" || raw === "rfi") return raw;
      } catch {
        /* ignore */
      }
      return "rfi";
    }

    function saveDrillMode(mode: DrillMode): void {
      try {
        localStorage.setItem(DRILL_KEY, mode);
      } catch {
        /* ignore */
      }
    }

    function pct(correct: number, total: number): string {
      if (total <= 0) return "—";
      return `${Math.round((100 * correct) / total)}%`;
    }

    function recordResult(
      stats: TrainerStats,
      position: string,
      correct: boolean,
      hinted: boolean,
    ): TrainerStats {
      const streak = correct ? stats.streak + 1 : 0;
      const next: TrainerStats = {
        overall: {
          correct: stats.overall.correct + (correct ? 1 : 0),
          total: stats.overall.total + 1,
          hinted: stats.overall.hinted + (hinted ? 1 : 0),
        },
        streak,
        bestStreak: Math.max(stats.bestStreak, streak),
        byPosition: { ...stats.byPosition },
      };
      const prior = normalizePositionStat(next.byPosition[position]);
      next.byPosition[position] = {
        correct: prior.correct + (correct ? 1 : 0),
        total: prior.total + 1,
        hinted: prior.hinted + (hinted ? 1 : 0),
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

    function openerStack(spot: FacingSpotState): number {
      // openTo is the total bet; SB open already includes the blind.
      return STARTING_STACK - spot.openTo;
    }

    function seatStackFacing(seat: string, spot: FacingSpotState): number {
      if (seat === spot.openerPosition) return openerStack(spot);
      if (spot.callers.includes(seat)) return STARTING_STACK - spot.openTo;
      if (seat === spot.position) {
        const posted =
          seat === "BB" ? BIG_BLIND : seat === "SB" ? SMALL_BLIND : 0;
        return STARTING_STACK - posted;
      }
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

    function snapRaiseTo(
      preferred: number,
      minRaiseTo: number,
      maxRaiseTo: number,
    ): number {
      if (sizing && typeof sizing.legalRaiseTo === "function") {
        return sizing.legalRaiseTo(preferred, {
          minRaiseTo,
          maxRaiseTo,
          step: BIG_BLIND,
        });
      }
      const clamped = Math.max(minRaiseTo, Math.min(maxRaiseTo, preferred));
      return Math.round(clamped / BIG_BLIND) * BIG_BLIND;
    }

    function nudgeRaise(
      current: number,
      direction: number,
      minRaiseTo: number,
      maxRaiseTo: number,
    ): number {
      if (sizing && typeof sizing.nudgeRaiseTo === "function") {
        return sizing.nudgeRaiseTo(current, direction, {
          minRaiseTo,
          maxRaiseTo,
          step: BIG_BLIND,
        });
      }
      return snapRaiseTo(current + direction * BIG_BLIND, minRaiseTo, maxRaiseTo);
    }

    function bind(doc: Document = document): { destroy: () => void } | null {
      if (!ranges) return null;

      const welcomeEl = doc.querySelector("#welcome");
      const trainerViewEl = doc.querySelector("#trainerView");
      const tableView = doc.querySelector("#tableView") as HTMLElement | null;
      const scoreView = doc.querySelector("#scoreView") as HTMLElement | null;
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
      const communityEl = trainerView.querySelector("#trainerCommunity") as HTMLElement | null;
      const turnInfoEl = trainerView.querySelector("#trainerTurnInfo") as HTMLElement | null;
      const coachEl = trainerView.querySelector("#trainerCoach") as HTMLElement | null;
      const actionsEl = trainerView.querySelector("#trainerActions") as HTMLElement | null;
      const playersEl = trainerView.querySelector("#trainerPlayers") as HTMLElement | null;
      const controlPanel = trainerView.querySelector(
        "#trainerControlPanel",
      ) as HTMLElement | null;
      const betControls = trainerView.querySelector(
        "#trainerBetControls",
      ) as HTMLElement | null;
      const raiseAmountEl = trainerView.querySelector(
        "#trainerRaiseAmount",
      ) as HTMLElement | null;
      const raiseMinusBtn = trainerView.querySelector(
        "#trainerRaiseMinus",
      ) as HTMLButtonElement | null;
      const raisePlusBtn = trainerView.querySelector(
        "#trainerRaisePlus",
      ) as HTMLButtonElement | null;
      const raiseActionBtn = trainerView.querySelector(
        "#trainerRaiseActionBtn",
      ) as HTMLButtonElement | null;

      const menuModal = doc.querySelector("#trainerMenuModal") as HTMLElement | null;
      const closeMenuBtn = doc.querySelector("#trainerCloseMenuBtn") as HTMLButtonElement | null;
      const size6Btn = doc.querySelector("#trainerSize6") as HTMLButtonElement | null;
      const size9Btn = doc.querySelector("#trainerSize9") as HTMLButtonElement | null;
      const drillRfiBtn = doc.querySelector("#trainerDrillRfi") as HTMLButtonElement | null;
      const drillFacingBtn = doc.querySelector(
        "#trainerDrillFacing",
      ) as HTMLButtonElement | null;
      const drillMixBtn = doc.querySelector("#trainerDrillMix") as HTMLButtonElement | null;
      const statsEl = doc.querySelector("#trainerStats") as HTMLElement | null;
      const resetBtn = doc.querySelector("#trainerResetBtn") as HTMLButtonElement | null;
      const leaveBtn = doc.querySelector("#trainerLeaveBtn") as HTMLButtonElement | null;

      const chartModal = doc.querySelector("#trainerChartModal") as HTMLElement | null;
      const closeChartBtn = doc.querySelector("#trainerCloseChartBtn") as HTMLButtonElement | null;
      const chartEl = doc.querySelector("#trainerChart") as HTMLElement | null;
      const chartEyebrow = doc.querySelector("#trainerChartEyebrow") as HTMLElement | null;
      const chartLegendCall = doc.querySelector(
        "#trainerChartLegend .trainer-legend-call",
      ) as HTMLElement | null;
      const seatPopover = trainerView.querySelector("#trainerSeatPopover") as HTMLElement | null;

      if (
        !homeBtn ||
        !menuBtn ||
        !accuracyEl ||
        !potEl ||
        !heroHandEl ||
        !communityEl ||
        !turnInfoEl ||
        !coachEl ||
        !actionsEl ||
        !playersEl ||
        !controlPanel ||
        !betControls ||
        !raiseAmountEl ||
        !raiseMinusBtn ||
        !raisePlusBtn ||
        !raiseActionBtn ||
        !menuModal ||
        !closeMenuBtn ||
        !size6Btn ||
        !size9Btn ||
        !drillRfiBtn ||
        !drillFacingBtn ||
        !drillMixBtn ||
        !statsEl ||
        !resetBtn ||
        !leaveBtn ||
        !chartModal ||
        !closeChartBtn ||
        !chartEl ||
        !seatPopover
      ) {
        return null;
      }

      let tableSize: 6 | 9 = loadTableSize();
      let drillMode: DrillMode = loadDrillMode();
      let stats = loadStats();
      let spot: SpotState | null = null;
      let active = false;
      let seatPopoverSeat: string | null = null;
      let seatPopoverTimer: ReturnType<typeof setTimeout> | null = null;

      function clearSeatPopoverTimer(): void {
        if (seatPopoverTimer !== null) {
          clearTimeout(seatPopoverTimer);
          seatPopoverTimer = null;
        }
      }

      function closeSeatPopover(): void {
        clearSeatPopoverTimer();
        seatPopoverSeat = null;
        seatPopover!.classList.add("hidden");
        seatPopover!.setAttribute("aria-hidden", "true");
        seatPopover!.innerHTML = "";
        playersEl!.querySelectorAll(".trainer-seat-row[aria-expanded='true']").forEach((row) => {
          row.setAttribute("aria-expanded", "false");
        });
      }

      function placeSeatPopover(anchor: HTMLElement): void {
        const tip = seatPopover!;
        tip.classList.remove("hidden");
        tip.style.left = "0px";
        tip.style.top = "0px";
        const pad = 8;
        const gap = 8;
        const anchorRect = anchor.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = anchorRect.left;
        let top = anchorRect.top - tipRect.height - gap;
        if (top < pad) {
          top = anchorRect.bottom + gap;
        }
        if (top + tipRect.height > vh - pad) {
          top = Math.max(pad, vh - tipRect.height - pad);
        }
        if (left + tipRect.width > vw - pad) {
          left = Math.max(pad, vw - tipRect.width - pad);
        }
        if (left < pad) left = pad;
        tip.style.left = `${Math.round(left)}px`;
        tip.style.top = `${Math.round(top)}px`;
      }

      function openSeatPopover(row: HTMLElement): void {
        const seat = row.getAttribute("data-seat") || "";
        if (!seat) return;
        if (seatPopoverSeat === seat && !seatPopover!.classList.contains("hidden")) {
          closeSeatPopover();
          return;
        }
        const full = row.getAttribute("data-full") || positionFullName(seat);
        const blurb = row.getAttribute("data-blurb") || positionBlurb(seat);
        const title = full === seat ? seat : `${seat} · ${full}`;
        closeSeatPopover();
        seatPopoverSeat = seat;
        seatPopover!.innerHTML = `<strong class="trainer-seat-popover-title">${escapeHtml(
          title,
        )}</strong><span class="trainer-seat-popover-blurb">${escapeHtml(blurb)}</span>`;
        seatPopover!.classList.remove("hidden");
        seatPopover!.setAttribute("aria-hidden", "false");
        row.setAttribute("aria-expanded", "true");
        placeSeatPopover(row);
        clearSeatPopoverTimer();
        seatPopoverTimer = setTimeout(() => {
          closeSeatPopover();
        }, 3200);
      }

      function cardHtml(card: PublicCard | null): string {
        if (format && typeof format.cardTemplate === "function") {
          return format.cardTemplate(card);
        }
        if (!card) return `<div class="card back"><span></span><span></span></div>`;
        const suitMap: Record<string, string> = {
          s: "♠",
          h: "♥",
          d: "♦",
          c: "♣",
          "♠": "♠",
          "♥": "♥",
          "♦": "♦",
          "♣": "♣",
        };
        const suit =
          suitMap[card.suit] ||
          suitMap[String(card.code || "").slice(1, 2).toLowerCase()] ||
          card.suit;
        const name = `${card.rank}${suit}`;
        return `<div class="card ${card.color === "red" ? "red" : ""}" aria-label="${name}">
          <span class="card-corner card-corner-top"><span class="card-rank">${card.rank}</span></span>
          <span class="card-corner card-corner-bottom"><span class="card-corner-suit suit">${suit}</span></span>
        </div>`;
      }

      function facedownBoardHtml(): string {
        return Array.from({ length: 5 }, () => cardHtml(null)).join("");
      }

      function renderStats(): void {
        const overallPct = pct(stats.overall.correct, stats.overall.total);
        if (stats.overall.total > 0) {
          accuracyEl!.textContent = overallPct;
          accuracyEl!.classList.remove("hidden");
        } else {
          accuracyEl!.textContent = "";
          accuracyEl!.classList.add("hidden");
        }
        const parts: string[] = [
          `Overall ${stats.overall.correct}/${stats.overall.total} (${overallPct})`,
          `Streak ${stats.streak}${stats.bestStreak ? ` (best ${stats.bestStreak})` : ""}`,
        ];
        if (stats.overall.hinted > 0) {
          parts.push(`Hinted ${stats.overall.hinted}`);
        }
        const order = ranges!.positionsForTable(tableSize);
        for (const pos of order) {
          const row = stats.byPosition[pos];
          if (!row || row.total === 0) continue;
          const hintMark = row.hinted > 0 ? ` · ${row.hinted}h` : "";
          parts.push(`${pos} ${row.correct}/${row.total}${hintMark}`);
        }
        if (vsOpen) {
          for (const pos of vsOpen.facingHeroPositions(tableSize)) {
            if ((order as readonly string[]).includes(pos)) continue;
            const row = stats.byPosition[pos];
            if (!row || row.total === 0) continue;
            const hintMark = row.hinted > 0 ? ` · ${row.hinted}h` : "";
            parts.push(`${pos} ${row.correct}/${row.total}${hintMark}`);
          }
        }
        statsEl!.textContent = parts.join(" · ");
      }

      function hideCoach(): void {
        coachEl!.classList.add("hidden");
        coachEl!.replaceChildren();
        coachEl!.removeAttribute("data-action");
        coachEl!.removeAttribute("data-hint-step");
      }

      function setBetControlsVisible(visible: boolean): void {
        if (visible) {
          // Practice hides .bet-controls under .is-compact; drop compact while raising.
          controlPanel!.classList.remove("is-compact");
          betControls!.classList.remove("is-reserved");
          betControls!.removeAttribute("inert");
          betControls!.setAttribute("aria-hidden", "false");
        } else {
          controlPanel!.classList.add("is-compact");
          betControls!.classList.add("is-reserved");
          betControls!.setAttribute("inert", "");
          betControls!.setAttribute("aria-hidden", "true");
        }
      }

      function syncRaiseDisplay(): void {
        if (!spot || spot.kind !== "facing" || spot.answered) {
          // Keep the raise slot reserved (not compact) so Fold/Call → answered doesn't jump.
          if (spot?.kind === "facing") {
            controlPanel!.classList.remove("is-compact");
            betControls!.classList.add("is-reserved");
            betControls!.setAttribute("inert", "");
            betControls!.setAttribute("aria-hidden", "true");
          } else {
            setBetControlsVisible(false);
          }
          return;
        }
        raiseAmountEl!.textContent = String(spot.raiseTo);
        setBetControlsVisible(true);
        // Raise lives with sizing in bet-controls (max 2 buttons in .game-buttons).
        raiseActionBtn?.classList.remove("hidden");
      }

      function textActionLink(id: string, label: string, onClick: () => void, disabled = false): string {
        return `<button id="${id}" class="text-action-link" type="button"${disabled ? " disabled" : ""}>${label}</button>`;
      }

      function renderHintCoach(): void {
        if (!spot || spot.answered || spot.hintStep === 0) {
          hideCoach();
          return;
        }
        if (spot.kind === "facing") {
          if (!vsOpen || typeof vsOpen.facingTeachingHint !== "function") {
            hideCoach();
            return;
          }
          const hint = vsOpen.facingTeachingHint(
            tableSize,
            spot.position,
            spot.openerPosition,
            spot.handKey,
          );
          if (!hint) {
            hideCoach();
            return;
          }
          const head = doc.createElement("div");
          head.className = "coach-hint-head";
          const badge = doc.createElement("span");
          badge.className = "coach-hint-badge";
          badge.textContent = spot.hintStep === 1 ? "Hint" : "Hint · reveal";
          const headline = doc.createElement("strong");
          headline.className = "coach-hint-headline";
          headline.textContent =
            spot.hintStep === 1
              ? "Think about the spot"
              : hint.standard === "raise"
                ? "3-bet"
                : hint.standard === "call"
                  ? "Call"
                  : "Fold";
          head.append(badge, headline);
          const reason = doc.createElement("p");
          reason.className = "coach-hint-reason trainer-coach-reason-wrap";
          reason.textContent = spot.hintStep === 1 ? hint.concept : hint.reveal;
          coachEl!.replaceChildren(head, reason);
          coachEl!.dataset.hintStep = String(spot.hintStep);
          if (spot.hintStep === 2) coachEl!.dataset.action = hint.standard;
          else coachEl!.removeAttribute("data-action");
          coachEl!.classList.remove("hidden");
          return;
        }

        const hint =
          typeof ranges!.rfiTeachingHint === "function"
            ? ranges!.rfiTeachingHint(tableSize, spot.position, spot.handKey)
            : null;
        if (!hint) {
          hideCoach();
          return;
        }
        const head = doc.createElement("div");
        head.className = "coach-hint-head";
        const badge = doc.createElement("span");
        badge.className = "coach-hint-badge";
        badge.textContent = spot.hintStep === 1 ? "Hint" : "Hint · reveal";
        const headline = doc.createElement("strong");
        headline.className = "coach-hint-headline";
        headline.textContent =
          spot.hintStep === 1 ? "Think about the seat" : hint.standard === "raise" ? "Raise" : "Fold";
        head.append(badge, headline);
        const reason = doc.createElement("p");
        reason.className = "coach-hint-reason trainer-coach-reason-wrap";
        reason.textContent = spot.hintStep === 1 ? hint.concept : hint.reveal;
        coachEl!.replaceChildren(head, reason);
        coachEl!.dataset.hintStep = String(spot.hintStep);
        if (spot.hintStep === 2) coachEl!.dataset.action = hint.standard;
        else coachEl!.removeAttribute("data-action");
        coachEl!.classList.remove("hidden");
      }

      function appendWhyDetails(
        nodes: Node[],
        why: string[],
        ruleOfThumb: string,
        whyOpen: boolean,
      ): void {
        if (why.length === 0) return;
        const details = doc.createElement("details");
        details.className = "trainer-why";
        details.open = whyOpen;
        details.addEventListener("toggle", () => {
          if (!spot) return;
          spot.whyOpen = details.open;
        });
        const summary = doc.createElement("summary");
        summary.textContent = "Why?";
        const body = doc.createElement("div");
        body.className = "trainer-why-body";
        const list = doc.createElement("ul");
        list.className = "trainer-why-list";
        for (const line of why) {
          const item = doc.createElement("li");
          item.textContent = line;
          list.append(item);
        }
        body.append(list);
        if (ruleOfThumb) {
          const rule = doc.createElement("p");
          rule.className = "trainer-why-rule";
          rule.textContent = `Remember: ${ruleOfThumb}`;
          body.append(rule);
        }
        details.append(summary, body);
        nodes.push(details);
      }

      function renderAnswerCoach(): void {
        if (!spot || !spot.answered) {
          hideCoach();
          return;
        }

        if (spot.kind === "facing") {
          const chosen = spot.chosen || "fold";
          const explain =
            vsOpen && typeof vsOpen.explainFacingDecision === "function"
              ? vsOpen.explainFacingDecision(
                  tableSize,
                  spot.position,
                  spot.openerPosition,
                  spot.handKey,
                  chosen,
                )
              : null;
          const correct = Boolean(spot.correct);
          const badgeLabel = explain?.badge || (correct ? "Best" : "Mistake");
          const reasonText =
            explain?.reason ||
            (correct ? "Nice — that matches the chart." : "Check the chart for this spot.");

          const head = doc.createElement("div");
          head.className = "coach-hint-head";
          const badge = doc.createElement("span");
          badge.className = "coach-hint-badge";
          badge.textContent = "Trainer";
          const headline = doc.createElement("strong");
          headline.className = "coach-hint-headline";
          const icon = correct ? "✓" : "✗";
          headline.textContent = `${icon} ${badgeLabel}`;
          head.append(badge, headline);

          const reason = doc.createElement("p");
          reason.className = "coach-hint-reason trainer-coach-reason-wrap";
          reason.textContent = reasonText;

          const nodes: Node[] = [head, reason];
          if (explain?.borderlineNote) {
            const note = doc.createElement("p");
            note.className = "trainer-borderline-note";
            note.textContent = explain.borderlineNote;
            nodes.push(note);
          }
          if (explain) {
            appendWhyDetails(nodes, explain.why, explain.ruleOfThumb, spot.whyOpen);
          }

          coachEl!.replaceChildren(...nodes);
          if (badgeLabel === "Mistake") coachEl!.dataset.action = "fold";
          else if (badgeLabel === "Best") coachEl!.dataset.action = "raise";
          else coachEl!.dataset.action = "call";
          coachEl!.removeAttribute("data-hint-step");
          coachEl!.classList.remove("hidden");
          return;
        }

        const chosen = spot.chosen || "fold";
        const explain =
          typeof ranges!.explainRfiDecision === "function"
            ? ranges!.explainRfiDecision(tableSize, spot.position, spot.handKey, chosen)
            : null;
        const correct = Boolean(spot.correct);
        const badgeLabel = explain?.badge || (correct ? "Best" : "Mistake");
        const reasonText = explain?.reason
          ? explain.reason
          : correct
            ? "Nice — that matches the chart."
            : "Check the chart for this seat.";

        const head = doc.createElement("div");
        head.className = "coach-hint-head";
        const badge = doc.createElement("span");
        badge.className = "coach-hint-badge";
        badge.textContent = "Trainer";
        const headline = doc.createElement("strong");
        headline.className = "coach-hint-headline";
        const icon = correct ? "✓" : "✗";
        headline.textContent = `${icon} ${badgeLabel}`;
        head.append(badge, headline);

        const reason = doc.createElement("p");
        reason.className = "coach-hint-reason trainer-coach-reason-wrap";
        reason.textContent = reasonText;

        const nodes: Node[] = [head, reason];
        if (explain) {
          appendWhyDetails(nodes, explain.why, explain.ruleOfThumb, spot.whyOpen);
        }

        coachEl!.replaceChildren(...nodes);
        if (badgeLabel === "Mistake") coachEl!.dataset.action = "fold";
        else if (badgeLabel === "Best") coachEl!.dataset.action = "raise";
        else coachEl!.dataset.action = "call";
        coachEl!.removeAttribute("data-hint-step");
        coachEl!.classList.remove("hidden");
      }

      function renderCoach(): void {
        if (!spot) {
          hideCoach();
          return;
        }
        if (spot.answered) {
          renderAnswerCoach();
          return;
        }
        renderHintCoach();
      }

      function onHint(): void {
        if (!spot || spot.answered) return;
        if (spot.hintStep < 2) {
          spot.hintStep = (spot.hintStep + 1) as 1 | 2;
        }
        renderCoach();
        renderActions();
        renderTurnInfo();
      }

      function renderSizeToggle(): void {
        size6Btn!.classList.toggle("selected", tableSize === 6);
        size9Btn!.classList.toggle("selected", tableSize === 9);
        size6Btn!.setAttribute("aria-pressed", tableSize === 6 ? "true" : "false");
        size9Btn!.setAttribute("aria-pressed", tableSize === 9 ? "true" : "false");
      }

      function renderDrillToggle(): void {
        const facingAvailable = Boolean(vsOpen);
        drillFacingBtn!.disabled = !facingAvailable;
        drillMixBtn!.disabled = !facingAvailable;
        if (!facingAvailable && drillMode !== "rfi") {
          drillMode = "rfi";
          saveDrillMode(drillMode);
        }
        drillRfiBtn!.classList.toggle("selected", drillMode === "rfi");
        drillFacingBtn!.classList.toggle("selected", drillMode === "facing");
        drillMixBtn!.classList.toggle("selected", drillMode === "mix");
        drillRfiBtn!.setAttribute("aria-pressed", drillMode === "rfi" ? "true" : "false");
        drillFacingBtn!.setAttribute(
          "aria-pressed",
          drillMode === "facing" ? "true" : "false",
        );
        drillMixBtn!.setAttribute("aria-pressed", drillMode === "mix" ? "true" : "false");
      }

      function chosenActionLabel(spotState: SpotState): string {
        if (spotState.kind === "rfi") {
          return spotState.chosen === "raise" ? "Raise" : "Fold";
        }
        if (spotState.chosen === "raise") return `Raises to ${spotState.raiseTo}`;
        if (spotState.chosen === "call") return `Calls ${spotState.toCall}`;
        return "Fold";
      }

      function renderPlayers(): void {
        if (!spot) {
          playersEl!.innerHTML = "";
          return;
        }
        const seats = seatsForTable(spot.tableSize);
        const heroIndex = seats.indexOf(spot.position);

        if (spot.kind === "rfi") {
          const html = seats
            .map((seat, index) => {
              const isHero = seat === spot!.position;
              const folded = heroIndex >= 0 && index < heroIndex;
              const isActing = isHero && !spot!.answered;
              const waitingAfter = !folded && !isHero;
              let action = "";
              let actionClass = "";
              const nextSeat =
                !spot!.answered && heroIndex >= 0
                  ? seats[(heroIndex + 1) % seats.length] || null
                  : null;
              const nextArrow =
                isActing && nextSeat
                  ? seats.indexOf(nextSeat) < heroIndex
                    ? "▲"
                    : "▼"
                  : "";
              if (folded) {
                action = "Fold";
              } else if (isHero && spot!.answered) {
                action = chosenActionLabel(spot!);
                actionClass = spot!.chosen === "raise" ? " action-token-raise" : "";
              } else if (isActing) {
                action = "Acting";
              } else if (waitingAfter) {
                action = "—";
                actionClass = " is-waiting";
              }
              const classes = [
                "table-player-row",
                isActing ? "turn" : "",
                folded ? "folded" : "",
                isHero ? "you" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const full = positionFullName(seat);
              const blurb = positionBlurb(seat);
              const arrowMarkup = nextArrow
                ? `<span class="next-act-arrow" title="Next to act ${nextArrow === "▲" ? "above" : "below"}" aria-label="Next player ${nextArrow === "▲" ? "above" : "below"}">${nextArrow}</span>`
                : "";
              return `<article
              class="${classes} trainer-seat-row"
              data-seat="${escapeHtml(seat)}"
              data-full="${escapeHtml(full)}"
              data-blurb="${escapeHtml(blurb)}"
              tabindex="0"
              role="button"
              aria-label="${escapeHtml(seat)}, ${escapeHtml(full)}. ${escapeHtml(blurb)}"
            >
              <span class="seat-timer" aria-hidden="true"><i class="player-dot"></i></span>
              <span class="seat-name seat-name-with-chips">
                <span class="seat-name-text">${escapeHtml(seat)}</span>${seatChipMarkup(seat)}
              </span>
              <span class="player-action${actionClass}">${escapeHtml(action)}${arrowMarkup}</span>
              <strong class="player-stack">${stackForSeat(seat)}</strong>
            </article>`;
            })
            .join("");
          playersEl!.innerHTML = html;
          closeSeatPopover();
          return;
        }

        const facing = spot;
        const openerIndex = seats.indexOf(facing.openerPosition);
        const html = seats
          .map((seat, index) => {
            const isHero = seat === facing.position;
            const isOpener = seat === facing.openerPosition;
            const isCaller = facing.callers.includes(seat);
            const foldedBefore =
              (openerIndex >= 0 && index < openerIndex) ||
              (openerIndex >= 0 &&
                heroIndex >= 0 &&
                index > openerIndex &&
                index < heroIndex &&
                !isCaller);
            const isActing = isHero && !facing.answered;
            let action: string;
            let actionClass = "";
            const nextSeat =
              !facing.answered && heroIndex >= 0
                ? seats[(heroIndex + 1) % seats.length] || null
                : null;
            const nextArrow =
              isActing && nextSeat
                ? seats.indexOf(nextSeat) < heroIndex
                  ? "▲"
                  : "▼"
                : "";
            if (foldedBefore) {
              action = "Fold";
            } else if (isOpener) {
              action = `Raises to ${facing.openTo}`;
              actionClass = " action-token-raise";
            } else if (isCaller) {
              action = `Calls ${facing.openTo}`;
            } else if (isHero && facing.answered) {
              action = chosenActionLabel(facing);
              actionClass =
                facing.chosen === "raise"
                  ? " action-token-raise"
                  : facing.chosen === "call"
                    ? " action-token-call"
                    : "";
            } else if (isActing) {
              action = "Acting";
            } else {
              action = "—";
              actionClass = " is-waiting";
            }
            const classes = [
              "table-player-row",
              isActing ? "turn" : "",
              foldedBefore ? "folded" : "",
              isHero ? "you" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const full = positionFullName(seat);
            const blurb = positionBlurb(seat);
            const arrowMarkup = nextArrow
              ? `<span class="next-act-arrow" title="Next to act ${nextArrow === "▲" ? "above" : "below"}" aria-label="Next player ${nextArrow === "▲" ? "above" : "below"}">${nextArrow}</span>`
              : "";
            return `<article
              class="${classes} trainer-seat-row"
              data-seat="${escapeHtml(seat)}"
              data-full="${escapeHtml(full)}"
              data-blurb="${escapeHtml(blurb)}"
              tabindex="0"
              role="button"
              aria-label="${escapeHtml(seat)}, ${escapeHtml(full)}. ${escapeHtml(blurb)}"
            >
              <span class="seat-timer" aria-hidden="true"><i class="player-dot"></i></span>
              <span class="seat-name seat-name-with-chips">
                <span class="seat-name-text">${escapeHtml(seat)}</span>${seatChipMarkup(seat)}
              </span>
              <span class="player-action${actionClass}">${escapeHtml(action)}${arrowMarkup}</span>
              <strong class="player-stack">${seatStackFacing(seat, facing)}</strong>
            </article>`;
          })
          .join("");
        playersEl!.innerHTML = html;
        closeSeatPopover();
      }

      function renderChart(highlightKey: string): void {
        if (!spot) {
          chartEl!.innerHTML = "";
          return;
        }
        if (spot.kind === "facing") {
          if (!vsOpen) {
            chartEl!.innerHTML = "";
            return;
          }
          const cells = vsOpen.facingChart(tableSize, spot.position, spot.openerPosition);
          if (!cells) {
            chartEl!.innerHTML = "";
            return;
          }
          if (chartLegendCall) chartLegendCall.classList.remove("hidden");
          const ranks = ranges!.RANK_ORDER;
          let html =
            '<div class="trainer-chart-grid" role="img" aria-label="Facing raise chart">';
          html += '<span class="trainer-chart-corner"></span>';
          for (const rank of ranks) {
            html += `<span class="trainer-chart-axis">${rank}</span>`;
          }
          for (let row = 0; row < 13; row += 1) {
            html += `<span class="trainer-chart-axis">${ranks[row]}</span>`;
            for (let col = 0; col < 13; col += 1) {
              const cell = cells[row * 13 + col]!;
              const highlight = cell.key === highlightKey ? " is-hand" : "";
              let shape = " is-offsuit";
              if (cell.key.length === 2) shape = " is-pair";
              else if (cell.key.endsWith("s")) shape = " is-suited";
              const label = cell.key.length <= 3 ? cell.key : cell.key.slice(0, 2);
              html += `<span class="trainer-chart-cell is-${cell.action}${shape}${highlight}" title="${cell.key}">${label}</span>`;
            }
          }
          html += "</div>";
          chartEl!.innerHTML = html;
          if (chartEyebrow) {
            chartEyebrow.textContent = `${positionLabel(spot.position)} vs ${spot.openerPosition} open · ${tableSize}-max`;
          }
          return;
        }

        if (chartLegendCall) chartLegendCall.classList.add("hidden");
        const cells = ranges!.rfiChart(tableSize, spot.position);
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
            let shape = " is-offsuit";
            if (cell.key.length === 2) shape = " is-pair";
            else if (cell.key.endsWith("s")) shape = " is-suited";
            const label = cell.key.length <= 3 ? cell.key : cell.key.slice(0, 2);
            html += `<span class="trainer-chart-cell is-${cell.action}${shape}${highlight}" title="${cell.key}">${label}</span>`;
          }
        }
        html += "</div>";
        chartEl!.innerHTML = html;
        if (chartEyebrow) {
          chartEyebrow.textContent = `${positionLabel(spot.position)} · ${tableSize}-max open`;
        }
      }

      function renderActions(): void {
        if (!spot) {
          actionsEl!.innerHTML = "";
          trainerView.classList.remove("is-facing");
          setBetControlsVisible(false);
          return;
        }

        if (!spot.answered) {
          const hintLabel =
            spot.hintStep === 0 ? "Hint" : spot.hintStep === 1 ? "Hint again" : "Hinted";
          if (spot.kind === "facing") {
            trainerView.classList.add("is-facing");
            // Max 2 buttons: Fold | Call. Raise sits with sizing in bet-controls. Hint is a link.
            actionsEl!.innerHTML = `
              <div class="action-links">${textActionLink(
                "trainerHintBtn",
                hintLabel,
                () => {},
                spot.hintStep >= 2,
              )}</div>
              <button id="trainerFoldBtn" class="secondary has-shortcut" type="button">
                <span>Fold</span><kbd aria-hidden="true">F</kbd>
              </button>
              <button id="trainerCallBtn" class="secondary has-shortcut" type="button">
                <span>Call ${spot.toCall}</span><kbd aria-hidden="true">C</kbd>
              </button>
            `;
            const hintBtn = actionsEl!.querySelector("#trainerHintBtn") as HTMLButtonElement;
            const foldBtn = actionsEl!.querySelector("#trainerFoldBtn") as HTMLButtonElement;
            const callBtn = actionsEl!.querySelector("#trainerCallBtn") as HTMLButtonElement;
            hintBtn.addEventListener("click", onHint);
            foldBtn.addEventListener("click", () => answerFacing("fold"));
            callBtn.addEventListener("click", () => answerFacing("call"));
            syncRaiseDisplay();
            return;
          }
          trainerView.classList.remove("is-facing");
          actionsEl!.innerHTML = `
            <div class="action-links">${textActionLink(
              "trainerHintBtn",
              hintLabel,
              () => {},
              spot.hintStep >= 2,
            )}</div>
            <button id="trainerFoldBtn" class="secondary has-shortcut" type="button">
              <span>Fold</span><kbd aria-hidden="true">F</kbd>
            </button>
            <button id="trainerRaiseBtn" class="has-shortcut" type="button">
              <span>Raise</span><kbd aria-hidden="true">R</kbd>
            </button>
          `;
          const hintBtn = actionsEl!.querySelector("#trainerHintBtn") as HTMLButtonElement;
          const foldBtn = actionsEl!.querySelector("#trainerFoldBtn") as HTMLButtonElement;
          const raiseBtn = actionsEl!.querySelector("#trainerRaiseBtn") as HTMLButtonElement;
          hintBtn.addEventListener("click", onHint);
          foldBtn.addEventListener("click", () => answerRfi("fold"));
          raiseBtn.addEventListener("click", () => answerRfi("raise"));
          setBetControlsVisible(false);
          return;
        }

        trainerView.classList.toggle("is-facing", spot.kind === "facing");
        syncRaiseDisplay();
        const showRetry = spot.kind === "facing" && spot.correct === false;
        // Max 2 buttons: Retry (secondary) + Next hand (primary). Chart is a link.
        actionsEl!.innerHTML = `
          <div class="action-links">${textActionLink("trainerChartBtn", "Chart", () => {})}</div>
          ${
            showRetry
              ? `<button id="trainerRetryBtn" class="secondary has-shortcut" type="button">
                   <span>Retry</span><kbd aria-hidden="true">T</kbd>
                 </button>`
              : `<button id="trainerRetryPlaceholder" class="action-placeholder" type="button" tabindex="-1" aria-hidden="true">Retry</button>`
          }
          <button id="trainerNextBtn" class="has-shortcut" type="button">
            <span>Next hand</span><kbd aria-hidden="true">N</kbd>
          </button>
        `;
        const chartBtn = actionsEl!.querySelector("#trainerChartBtn") as HTMLButtonElement;
        chartBtn.addEventListener("click", openChart);
        const nextBtn = actionsEl!.querySelector("#trainerNextBtn") as HTMLButtonElement;
        nextBtn.addEventListener("click", () => dealNext());
        const retryBtn = actionsEl!.querySelector("#trainerRetryBtn") as HTMLButtonElement | null;
        if (retryBtn) retryBtn.addEventListener("click", retrySpot);
      }

      function facingActionLine(spotState: Extract<SpotState, { kind: "facing" }>): string {
        const openerName = positionFullName(spotState.openerPosition);
        const heroName = positionFullName(spotState.position);
        const callerNames = spotState.callers.map((c) => positionFullName(c));
        let line = `${openerName} raised to ${spotState.openTo}`;
        if (callerNames.length === 1) line += `, ${callerNames[0]} called`;
        else if (callerNames.length > 1) line += `, ${callerNames.join(" and ")} called`;
        line += `. You're in the ${heroName}.`;
        return line;
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
          if (spot.kind === "facing") {
            turnInfoEl!.textContent = facingActionLine(spot);
            return;
          }
          turnInfoEl!.innerHTML = `Folded to you · <span class="trainer-pos-label" title="${escapeHtml(
            positionFullName(spot.position),
          )}">${escapeHtml(positionLabel(spot.position))}</span>`;
          return;
        }
        turnInfoEl!.classList.remove("your-turn", "showdown-message");
        turnInfoEl!.textContent = "";
      }

      function pickDrillKind(): "rfi" | "facing" {
        if (drillMode === "rfi" || !vsOpen) return "rfi";
        if (drillMode === "facing") return "facing";
        return Math.random() < 0.5 ? "rfi" : "facing";
      }

      function dealRfiSpot(): void {
        const dealt = ranges!.dealRandomRfiSpot(tableSize);
        spot = {
          kind: "rfi",
          tableSize: dealt.tableSize,
          position: dealt.position,
          cards: dealt.cards,
          handKey: dealt.handKey,
          standard: dealt.standard,
          answered: false,
          chosen: null,
          correct: null,
          hintStep: 0,
          whyOpen: false,
          scored: false,
        };
        potEl!.textContent = String(POT_RFI);
      }

      function dealFacingSpot(): void {
        if (!vsOpen) {
          dealRfiSpot();
          return;
        }
        const dealt = vsOpen.dealRandomFacingSpot(tableSize, {
          smallBlind: SMALL_BLIND,
          bigBlind: BIG_BLIND,
          startingStack: STARTING_STACK,
        });
        const raiseTo = snapRaiseTo(
          dealt.preferredRaiseTo,
          dealt.minRaiseTo,
          dealt.maxRaiseTo,
        );
        spot = {
          kind: "facing",
          tableSize: dealt.tableSize,
          position: dealt.heroPosition,
          openerPosition: dealt.openerPosition,
          callers: dealt.callers.slice(),
          cards: dealt.cards,
          handKey: dealt.handKey,
          standard: dealt.standard,
          openTo: dealt.openTo,
          toCall: dealt.toCall,
          pot: dealt.pot,
          minRaiseTo: dealt.minRaiseTo,
          maxRaiseTo: dealt.maxRaiseTo,
          raiseTo,
          answered: false,
          chosen: null,
          correct: null,
          hintStep: 0,
          whyOpen: false,
          scored: false,
        };
        potEl!.textContent = String(dealt.pot);
      }

      function dealNext(): void {
        closeChart();
        if (pickDrillKind() === "facing") dealFacingSpot();
        else dealRfiSpot();
        if (!spot) return;
        trainerView.classList.remove("is-answered");
        const holes = cardHtml(spot.cards[0]) + cardHtml(spot.cards[1]);
        heroHandEl!.innerHTML = holes;
        communityEl!.innerHTML = facedownBoardHtml();
        chartEl!.innerHTML = "";
        hideCoach();
        renderPlayers();
        renderTurnInfo();
        renderCoach();
        renderActions();
      }

      function retrySpot(): void {
        if (!spot || spot.kind !== "facing" || !spot.answered) return;
        closeChart();
        spot.answered = false;
        spot.chosen = null;
        spot.correct = null;
        spot.hintStep = 0;
        spot.whyOpen = false;
        // Keep scored=true so a second attempt does not double-count stats.
        trainerView.classList.remove("is-answered");
        hideCoach();
        renderPlayers();
        renderTurnInfo();
        renderCoach();
        renderActions();
      }

      function answerRfi(chosen: "raise" | "fold"): void {
        if (!spot || spot.kind !== "rfi" || spot.answered) return;
        const graded = ranges!.gradeRfiAction(tableSize, spot.position, spot.handKey, chosen);
        if (!graded) return;
        const hinted = spot.hintStep > 0;
        spot.answered = true;
        spot.chosen = chosen;
        spot.correct = graded.correct;
        spot.whyOpen = false;
        trainerView.classList.add("is-answered");
        renderChart(spot.handKey);
        renderPlayers();
        renderTurnInfo();
        renderCoach();
        renderActions();
        if (!spot.scored) {
          spot.scored = true;
          stats = recordResult(stats, spot.position, graded.correct, hinted);
          saveStats(stats);
          renderStats();
        }
      }

      function answerFacing(chosen: FacingAction): void {
        if (!spot || spot.kind !== "facing" || spot.answered || !vsOpen) return;
        const graded = vsOpen.gradeFacingAction(
          tableSize,
          spot.position,
          spot.openerPosition,
          spot.handKey,
          chosen,
        );
        if (!graded) return;
        const hinted = spot.hintStep > 0;
        spot.answered = true;
        spot.chosen = chosen;
        spot.correct = graded.correct;
        spot.whyOpen = false;
        trainerView.classList.add("is-answered");
        renderChart(spot.handKey);
        renderPlayers();
        renderTurnInfo();
        renderCoach();
        renderActions();
        if (!spot.scored) {
          spot.scored = true;
          stats = recordResult(stats, spot.position, graded.correct, hinted);
          saveStats(stats);
          renderStats();
        }
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
        renderDrillToggle();
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
        closeSeatPopover();
        hideCoach();
        setBetControlsVisible(false);
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

      function onSize(size: 6 | 9): void {
        if (tableSize === size) return;
        tableSize = size;
        saveTableSize(size);
        renderSizeToggle();
        dealNext();
        renderStats();
      }

      function onDrill(mode: DrillMode): void {
        if (drillMode === mode) return;
        if ((mode === "facing" || mode === "mix") && !vsOpen) return;
        drillMode = mode;
        saveDrillMode(mode);
        renderDrillToggle();
        dealNext();
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
          if (!seatPopover!.classList.contains("hidden")) {
            event.preventDefault();
            closeSeatPopover();
            return;
          }
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
          if (spot?.kind === "facing") {
            if (key === "r") {
              event.preventDefault();
              answerFacing("raise");
              return;
            }
            if (key === "c") {
              event.preventDefault();
              answerFacing("call");
              return;
            }
            if (key === "f") {
              event.preventDefault();
              answerFacing("fold");
              return;
            }
            return;
          }
          if (key === "r") {
            event.preventDefault();
            answerRfi("raise");
            return;
          }
          if (key === "f") {
            event.preventDefault();
            answerRfi("fold");
            return;
          }
        } else if (key === " " || key === "Enter" || key === "n") {
          event.preventDefault();
          dealNext();
        } else if (key === "t" && spot?.kind === "facing" && spot.correct === false) {
          event.preventDefault();
          retrySpot();
        } else if (key === "c" && spot?.kind === "rfi") {
          event.preventDefault();
          openChart();
        } else if (key === "c" && spot?.kind === "facing") {
          // Facing answered: C was Call while deciding; after answer open chart.
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
      const onDrillRfi = () => onDrill("rfi");
      const onDrillFacing = () => onDrill("facing");
      const onDrillMix = () => onDrill("mix");
      const onMenuBackdrop = (event: MouseEvent) => {
        if (event.target === menuModal) closeMenu();
      };
      const onChartBackdrop = (event: MouseEvent) => {
        if (event.target === chartModal) closeChart();
      };
      const onSeatRowActivate = (event: Event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const row = target.closest(".trainer-seat-row");
        if (!(row instanceof HTMLElement) || !playersEl!.contains(row)) return;
        event.preventDefault();
        event.stopPropagation();
        openSeatPopover(row);
      };
      const onSeatRowKeydown = (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.classList.contains("trainer-seat-row")) return;
        event.preventDefault();
        openSeatPopover(target);
      };
      const onDocPointerDown = (event: Event) => {
        if (seatPopover!.classList.contains("hidden")) return;
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (seatPopover!.contains(target)) return;
        if (target instanceof HTMLElement && target.closest(".trainer-seat-row")) return;
        closeSeatPopover();
      };
      const onRaiseMinus = () => {
        if (!spot || spot.kind !== "facing" || spot.answered) return;
        spot.raiseTo = nudgeRaise(spot.raiseTo, -1, spot.minRaiseTo, spot.maxRaiseTo);
        syncRaiseDisplay();
      };
      const onRaisePlus = () => {
        if (!spot || spot.kind !== "facing" || spot.answered) return;
        spot.raiseTo = nudgeRaise(spot.raiseTo, 1, spot.minRaiseTo, spot.maxRaiseTo);
        syncRaiseDisplay();
      };
      const onRaiseAction = () => {
        if (!spot || spot.kind !== "facing" || spot.answered) return;
        answerFacing("raise");
      };

      trainerBtn.addEventListener("click", onTrainerClick);
      homeBtn.addEventListener("click", onHome);
      menuBtn.addEventListener("click", openMenu);
      closeMenuBtn.addEventListener("click", closeMenu);
      leaveBtn.addEventListener("click", onLeave);
      resetBtn.addEventListener("click", onReset);
      size6Btn.addEventListener("click", onSize6);
      size9Btn.addEventListener("click", onSize9);
      drillRfiBtn.addEventListener("click", onDrillRfi);
      drillFacingBtn.addEventListener("click", onDrillFacing);
      drillMixBtn.addEventListener("click", onDrillMix);
      closeChartBtn.addEventListener("click", closeChart);
      menuModal.addEventListener("click", onMenuBackdrop);
      chartModal.addEventListener("click", onChartBackdrop);
      playersEl.addEventListener("click", onSeatRowActivate);
      playersEl.addEventListener("keydown", onSeatRowKeydown);
      raiseMinusBtn.addEventListener("click", onRaiseMinus);
      raisePlusBtn.addEventListener("click", onRaisePlus);
      raiseActionBtn.addEventListener("click", onRaiseAction);
      doc.addEventListener("pointerdown", onDocPointerDown, true);
      window.addEventListener("resize", closeSeatPopover);
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
          homeBtn.removeEventListener("click", onHome);
          menuBtn.removeEventListener("click", openMenu);
          closeMenuBtn.removeEventListener("click", closeMenu);
          leaveBtn.removeEventListener("click", onLeave);
          resetBtn.removeEventListener("click", onReset);
          size6Btn.removeEventListener("click", onSize6);
          size9Btn.removeEventListener("click", onSize9);
          drillRfiBtn.removeEventListener("click", onDrillRfi);
          drillFacingBtn.removeEventListener("click", onDrillFacing);
          drillMixBtn.removeEventListener("click", onDrillMix);
          closeChartBtn.removeEventListener("click", closeChart);
          menuModal.removeEventListener("click", onMenuBackdrop);
          chartModal.removeEventListener("click", onChartBackdrop);
          playersEl.removeEventListener("click", onSeatRowActivate);
          playersEl.removeEventListener("keydown", onSeatRowKeydown);
          raiseMinusBtn.removeEventListener("click", onRaiseMinus);
          raisePlusBtn.removeEventListener("click", onRaisePlus);
          raiseActionBtn.removeEventListener("click", onRaiseAction);
          doc.removeEventListener("pointerdown", onDocPointerDown, true);
          window.removeEventListener("resize", closeSeatPopover);
          doc.removeEventListener("keydown", onKeydown);
          closeSeatPopover();
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
      DRILL_KEY,
    };
  },
);
