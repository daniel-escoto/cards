#!/usr/bin/env node
/**
 * Headless all-CPU cash sim for fold-rate investigation.
 * Usage:
 *   node scripts/bot-fold-investigation.js
 *   BOT_SIM_HANDS=10000 BOT_SIM_SIZES=6,9 node scripts/bot-fold-investigation.js
 *
 * Scratch/investigation only — not part of the CI suite.
 */
const path = require("node:path");
const enginePath = process.env.BOT_STATS_ENGINE || path.join(__dirname, "../dist/shared/engine.node");
const engine = require(enginePath);

const HANDS = Number(process.env.BOT_SIM_HANDS) || 10000;
const SIZES = String(process.env.BOT_SIM_SIZES || "6,9")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n >= 2 && n <= 9);
const SB = 10;
const BB = 20;
const STACK = 100 * BB; // 100bb

const lcg = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

const profiles = engine.BOT_PROFILES;

function blank() {
  return {
    hands: 0,
    vpip: 0,
    pfr: 0,
    // Facing an open-raise preflop (currentBet > BB, no prior re-raise yet counted as open)
    faceOpen: 0,
    foldToOpen: 0,
    // Facing flop c-bet from preflop raiser
    faceCbet: 0,
    foldToCbet: 0,
    // Facing any turn bet
    faceTurnBet: 0,
    foldToTurnBet: 0,
    sawFlop: 0,
    showdown: 0,
    // Aggression factor: (bets+raises) / calls
    betsRaises: 0,
    calls: 0,
    // Fold when check was free
    freeFoldOpp: 0,
    freeFolds: 0,
    // Diagnostics
    faceRiverBet: 0,
    foldToRiverBet: 0,
    faceMinRaiseStrong: 0, // preflop facing ≤2.5x with top 15% hand
    foldMinRaiseStrong: 0,
  };
}

function pct(n, d) {
  if (!d) return "  n/a";
  return `${((100 * n) / d).toFixed(1)}%`.padStart(6);
}

function af(betsRaises, calls) {
  if (!calls) return betsRaises ? "  inf" : "  n/a";
  return (betsRaises / calls).toFixed(2).padStart(6);
}

function rate(n, d) {
  return d ? n / d : 0;
}

function preflopRaisesSoFar(room) {
  return room.actionLog.filter(
    (e) => e.phase === "preflop" && /^Raises to\s+/i.test(e.action || ""),
  ).length;
}

function preflopRaiserId(room) {
  for (let i = room.actionLog.length - 1; i >= 0; i -= 1) {
    const e = room.actionLog[i];
    if (e.phase === "preflop" && /^Raises to\s+/i.test(e.action || "")) return e.playerId;
  }
  return null;
}

function streetHasBet(room, phase) {
  return room.actionLog.some((e) => e.phase === phase && /^Raises to\s+/i.test(e.action || ""));
}

/** Rough top-hand detector using the engine's own preflop scorer via a probe. */
function handLooksStrong(hand) {
  // Mirror preflopHandScore thresholds: pairs 99+, broadway suited, AK/AQ ~ top ~15%.
  if (!hand || hand.length !== 2) return false;
  const ranks = "23456789TJQKA";
  const v = hand.map((c) => ranks.indexOf(c[0])).sort((a, b) => b - a);
  const paired = v[0] === v[1];
  const suited = hand[0][1] === hand[1][1];
  if (paired && v[0] >= 7) return true; // 99+
  if (v[0] === 12 && v[1] >= 10) return true; // AK AQ AJ AT
  if (v[0] === 12 && v[1] >= 9 && suited) return true; // A9s+
  if (v[0] >= 10 && v[1] >= 9 && suited) return true; // JTs+
  return false;
}

function runTable(tableSize, hands, seed) {
  const realRandom = Math.random;
  Math.random = lcg(seed);
  const intRandom = lcg(seed + 97);
  engine.setRandomInt((max) => Math.floor(intRandom() * max));

  const byStyle = Object.fromEntries(profiles.map((p) => [p.short, blank()]));
  const all = blank();
  let order = profiles.map((p) => p.short);

  const t0 = Date.now();
  for (let h = 0; h < hands; h += 1) {
    if (h > 0 && h % 50 === 0) order = [...order.slice(1), order[0]];
    const room = engine.createPracticeRoom({
      name: "Hero",
      playerId: "hero",
      tableSize,
      botCount: tableSize - 1,
      startingStack: STACK,
      smallBlind: SB,
      bigBlind: BB,
    });
    room.players.forEach((player, index) => {
      const short = order[index % order.length];
      player.botProfile = profiles.find((p) => p.short === short).tag;
      // maybeStartReadyHand requires ≥1 human; hero stays non-bot but still uses
      // chooseComputerAction via botProfile (same pattern as tests/bot-postflop-stats.js).
      player.ready = true;
      player.connected = true;
    });
    if (!engine.maybeStartReadyHand(room)) continue;

    const styleOf = (player) => engine.computerProfile(player).short;
    const seen = new Map(
      room.players.map((p) => [p.id, { vpip: false, pfr: false, flop: false }]),
    );
    let openRaiseSize = 0; // first raise-to amount this hand

    for (let guard = 0; guard < 400; guard += 1) {
      if (!(room.turn && engine.isHandInProgress(room) && room.phase !== "showdown")) break;
      const player = room.players.find((item) => item.id === room.turn);
      const s = byStyle[styleOf(player)];
      const callAmount = Math.max(0, room.currentBet - player.bet);
      const buckets = [s, all];

      // Free-check opportunity bookkeeping (before action).
      if (callAmount === 0) {
        for (const b of buckets) b.freeFoldOpp += 1;
      }

      const raisesBefore = preflopRaisesSoFar(room);
      const facingOpen =
        room.phase === "preflop" &&
        callAmount > 0 &&
        room.currentBet > BB &&
        raisesBefore === 1;
      const facingCbet =
        room.phase === "flop" &&
        callAmount > 0 &&
        preflopRaiserId(room) != null &&
        streetHasBet(room, "flop") &&
        // First bet on flop (c-bet), not a raise: currentBet was set by one aggressor
        // and this player hasn't put in that amount yet.
        room.actionLog.filter((e) => e.phase === "flop" && /^Raises to\s+/i.test(e.action || ""))
          .length === 1;
      const facingTurnBet = room.phase === "turn" && callAmount > 0;
      const facingRiverBet = room.phase === "river" && callAmount > 0;
      const facingMinRaiseStrong =
        room.phase === "preflop" &&
        facingOpen &&
        room.currentBet <= BB * 2.5 + 0.01 &&
        handLooksStrong(player.hand);

      if (facingOpen) for (const b of buckets) b.faceOpen += 1;
      if (facingCbet) for (const b of buckets) b.faceCbet += 1;
      if (facingTurnBet) for (const b of buckets) b.faceTurnBet += 1;
      if (facingRiverBet) for (const b of buckets) b.faceRiverBet += 1;
      if (facingMinRaiseStrong) for (const b of buckets) b.faceMinRaiseStrong += 1;

      const action = engine.chooseComputerAction(room, player);

      if (callAmount === 0 && action.type === "fold") {
        for (const b of buckets) b.freeFolds += 1;
      }

      if (action.type === "raise" || (action.type === "call" && callAmount > 0 && room.currentBet > player.bet)) {
        // Aggression / calls counted on every street for AF.
      }
      if (action.type === "raise") {
        for (const b of buckets) b.betsRaises += 1;
        if (room.phase === "preflop") {
          seen.get(player.id).pfr = true;
          seen.get(player.id).vpip = true;
          if (raisesBefore === 0) openRaiseSize = action.raiseTo || room.currentBet;
        }
      } else if (action.type === "call") {
        for (const b of buckets) b.calls += 1;
        if (room.phase === "preflop" && callAmount > 0) seen.get(player.id).vpip = true;
      } else if (action.type === "fold") {
        if (facingOpen) for (const b of buckets) b.foldToOpen += 1;
        if (facingCbet) for (const b of buckets) b.foldToCbet += 1;
        if (facingTurnBet) for (const b of buckets) b.foldToTurnBet += 1;
        if (facingRiverBet) for (const b of buckets) b.foldToRiverBet += 1;
        if (facingMinRaiseStrong) for (const b of buckets) b.foldMinRaiseStrong += 1;
      }

      if (room.phase !== "preflop") seen.get(player.id).flop = true;

      const result = engine.applyPlayerAction(room, player.id, action);
      if (!result.ok) {
        console.error("Illegal action", action, result);
        break;
      }
    }

    const showdown = room.players.filter((p) => !p.folded).length > 1;
    for (const player of room.players) {
      const s = byStyle[styleOf(player)];
      const mark = seen.get(player.id);
      for (const b of [s, all]) {
        b.hands += 1;
        if (mark.vpip) b.vpip += 1;
        if (mark.pfr) b.pfr += 1;
        if (mark.flop) {
          b.sawFlop += 1;
          if (showdown && !player.folded) b.showdown += 1;
        }
      }
    }
    if (room.phase === "showdown") engine.settleShowdown(room);

    if ((h + 1) % 500 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      process.stderr.write(`  ${tableSize}-max: ${h + 1}/${hands} hands (${elapsed}s)\n`);
    }
  }

  Math.random = realRandom;
  return { byStyle, all, ms: Date.now() - t0 };
}

function printReport(tableSize, result) {
  const ref =
    tableSize <= 6
      ? { vpip: "22–28%", pfr: "17–22%", foldCbet: "40–55%", note: "solid 6-max regular" }
      : { vpip: "15–22%", pfr: "12–18%", foldCbet: "45–60%", note: "solid 9-max regular" };

  console.log(`\n=== ${tableSize}-max, ${HANDS} hands, ${SB}/${BB}, ${STACK / BB}bb stacks ===`);
  console.log(`Reference (${ref.note}): VPIP ${ref.vpip}, PFR ${ref.pfr}, fold-to-cbet ${ref.foldCbet}`);
  console.log(
    "Style     VPIP    PFR   FtOpen  FtCbet  FtTurn   WTSD     AF  FreeF  FtRiver  FtMin+str",
  );

  const rows = [...Object.entries(result.byStyle), ["ALL", result.all]];
  for (const [name, s] of rows) {
    console.log(
      [
        name.padEnd(8),
        pct(s.vpip, s.hands),
        pct(s.pfr, s.hands),
        pct(s.foldToOpen, s.faceOpen),
        pct(s.foldToCbet, s.faceCbet),
        pct(s.foldToTurnBet, s.faceTurnBet),
        pct(s.showdown, s.sawFlop),
        af(s.betsRaises, s.calls),
        pct(s.freeFolds, s.freeFoldOpp),
        pct(s.foldToRiverBet, s.faceRiverBet),
        pct(s.foldMinRaiseStrong, s.faceMinRaiseStrong),
      ].join(" "),
    );
  }
  console.log(
    `Samples — faceOpen ${result.all.faceOpen}, faceCbet ${result.all.faceCbet}, faceTurn ${result.all.faceTurnBet}, freeFoldOpp ${result.all.freeFoldOpp}, strong-vs-minraise ${result.all.faceMinRaiseStrong}`,
  );
  console.log(`Elapsed ${(result.ms / 1000).toFixed(1)}s`);

  return {
    tableSize,
    ref,
    all: {
      vpip: rate(result.all.vpip, result.all.hands),
      pfr: rate(result.all.pfr, result.all.hands),
      foldToOpen: rate(result.all.foldToOpen, result.all.faceOpen),
      foldToCbet: rate(result.all.foldToCbet, result.all.faceCbet),
      foldToTurn: rate(result.all.foldToTurnBet, result.all.faceTurnBet),
      wtsd: rate(result.all.showdown, result.all.sawFlop),
      af: result.all.calls ? result.all.betsRaises / result.all.calls : null,
      freeFold: rate(result.all.freeFolds, result.all.freeFoldOpp),
      foldToRiver: rate(result.all.foldToRiverBet, result.all.faceRiverBet),
      foldStrongVsMin: rate(result.all.foldMinRaiseStrong, result.all.faceMinRaiseStrong),
    },
    byStyle: Object.fromEntries(
      Object.entries(result.byStyle).map(([k, s]) => [
        k,
        {
          vpip: rate(s.vpip, s.hands),
          pfr: rate(s.pfr, s.hands),
          foldToOpen: rate(s.foldToOpen, s.faceOpen),
          foldToCbet: rate(s.foldToCbet, s.faceCbet),
          foldToTurn: rate(s.foldToTurnBet, s.faceTurnBet),
          wtsd: rate(s.showdown, s.sawFlop),
          af: s.calls ? s.betsRaises / s.calls : null,
          freeFold: rate(s.freeFolds, s.freeFoldOpp),
        },
      ]),
    ),
  };
}

const summaries = [];
for (const size of SIZES) {
  process.stderr.write(`Running ${size}-max × ${HANDS} hands…\n`);
  const result = runTable(size, HANDS, 20261115 + size);
  summaries.push(printReport(size, result));
}

if (process.env.BOT_SIM_JSON) {
  console.log("\nJSON_SUMMARY " + JSON.stringify(summaries));
}
