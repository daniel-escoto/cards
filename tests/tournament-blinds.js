/**
 * Tournament timed blind levels: schedule math + next-deal apply (unit).
 */
const assert = require("node:assert/strict");
const engine = require("../dist/shared/engine.node");

engine.setRandomInt(() => 0);

const {
  BLIND_LEVELS,
  TOURNAMENT_LEVEL_DURATION_MS,
  tournamentBlindSchedule,
  tournamentLevel,
  applyTournamentLevelOnDeal,
  currentBlinds,
  startHand,
  STARTING_STACK,
} = engine;

assert.equal(TOURNAMENT_LEVEL_DURATION_MS, 10 * 60 * 1000, "default level is 10 minutes");

{
  const schedule = tournamentBlindSchedule();
  assert.equal(schedule.length, BLIND_LEVELS.length);
  assert.equal(schedule[0].smallBlind, 10);
  assert.equal(schedule[0].bigBlind, 20);
  assert.equal(schedule[0].durationMs, TOURNAMENT_LEVEL_DURATION_MS);
  assert.equal(schedule[schedule.length - 1].durationMs, Number.POSITIVE_INFINITY);
}

{
  const short = tournamentBlindSchedule(5_000);
  assert.equal(short[0].durationMs, 5_000);
  assert.equal(short[1].durationMs, 5_000);
}

function makeTournamentRoom() {
  return {
    id: "TOUR1",
    hostId: "a",
    tableSize: 0,
    status: "lobby",
    phase: "lobby",
    deck: engine.makeDeck(),
    community: [],
    dealer: 0,
    turn: null,
    currentBet: 0,
    minRaise: 20,
    deadPot: 0,
    acted: new Set(),
    raiseEligible: new Set(),
    message: "",
    winners: [],
    actionLog: [],
    riverAggressor: null,
    allInCardsExposed: false,
    handNumber: 0,
    moneyMode: false,
    tournamentMode: true,
    tournamentLevelIndex: 0,
    tournamentPendingAdvance: false,
    tournamentLevelDurationMs: 5_000,
    tournamentLevelEndsAt: null,
    moneyUnitCents: null,
    buyInCents: 2000,
    baseSmallBlind: 10,
    baseBigBlind: 20,
    settlements: [],
    moneyLedger: [],
    players: [
      {
        id: "a",
        name: "Alice",
        color: "#60a5fa",
        stack: STARTING_STACK,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        showCards: false,
        ready: true,
        sittingOut: false,
        connected: true,
        isBot: false,
      },
      {
        id: "b",
        name: "Bob",
        color: "#4caf82",
        stack: STARTING_STACK,
        hand: [],
        folded: false,
        allIn: false,
        bet: 0,
        invested: 0,
        showCards: false,
        ready: true,
        sittingOut: false,
        connected: true,
        isBot: false,
      },
    ],
  };
}

{
  const room = makeTournamentRoom();
  assert.deepEqual(currentBlinds(room), { smallBlind: 10, bigBlind: 20 });
  assert.equal(tournamentLevel(room).smallBlind, 10);

  room.tournamentPendingAdvance = true;
  applyTournamentLevelOnDeal(room);
  assert.equal(room.tournamentLevelIndex, 1);
  assert.equal(room.tournamentPendingAdvance, false);
  assert.deepEqual(currentBlinds(room), { smallBlind: 20, bigBlind: 40 });
}

{
  const room = makeTournamentRoom();
  startHand(room);
  assert.equal(room.handNumber, 1);
  assert.deepEqual(currentBlinds(room), { smallBlind: 10, bigBlind: 20 });
  assert.equal(room.minRaise, 20);

  // Mid-hand pending advance must not change blinds until the next deal.
  room.tournamentPendingAdvance = true;
  assert.deepEqual(currentBlinds(room), { smallBlind: 10, bigBlind: 20 });

  room.phase = "complete";
  for (const player of room.players) {
    player.ready = true;
    player.folded = false;
    player.allIn = false;
    player.bet = 0;
    player.invested = 0;
    player.hand = [];
    player.stack = STARTING_STACK;
  }
  engine.startNextHand(room);
  assert.equal(room.tournamentLevelIndex, 1);
  assert.equal(room.tournamentPendingAdvance, false);
  assert.deepEqual(currentBlinds(room), { smallBlind: 20, bigBlind: 40 });
  assert.equal(room.minRaise, 40);
}

{
  // Cash rooms still use fixed blinds (regression).
  const cash = makeTournamentRoom();
  cash.tournamentMode = false;
  cash.moneyMode = true;
  cash.baseSmallBlind = 25;
  cash.baseBigBlind = 50;
  cash.handNumber = 99;
  assert.deepEqual(currentBlinds(cash), { smallBlind: 25, bigBlind: 50 });
}

{
  // Chip rooms still use the hand ladder (regression).
  const chip = makeTournamentRoom();
  chip.tournamentMode = false;
  chip.handNumber = 7;
  assert.deepEqual(currentBlinds(chip), { smallBlind: 20, bigBlind: 40 });
}

console.log("Tournament blinds unit test passed");
