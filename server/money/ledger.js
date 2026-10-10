const api = require("../api");
require("../config");
require("../runtime");

function cleanMoneyCents(value, fallback = api.DEFAULT_BUY_IN_CENTS) {
  const cents = Math.round(Number(value) || 0);
  if (!Number.isFinite(cents) || cents <= 0) return fallback;
  return Math.max(100, Math.min(1000000, cents));
}

function chipValueCents(room) {
  if (room?.moneyMode && room.moneyUnitCents === 1) return 1;
  return cleanMoneyCents(room?.buyInCents, api.DEFAULT_BUY_IN_CENTS) / api.STARTING_STACK;
}

function centsToChips(room, cents) {
  return Math.max(1, Math.round(Math.max(0, Number(cents) || 0) / chipValueCents(room)));
}

function chipsToCents(room, chips) {
  return Math.round(Math.max(0, Math.floor(Number(chips) || 0)) * chipValueCents(room));
}

function syncPlayerToMoneyLedger(room, player) {
  if (!room?.moneyMode || !player || player.isBot) return null;
  if (!Array.isArray(room.moneyLedger)) room.moneyLedger = [];
  let entry = room.moneyLedger.find((item) => item.playerId === player.id);
  if (!entry) {
    entry = { playerId: player.id, name: player.name, buyInsCents: 0, cashOutCents: 0 };
    room.moneyLedger.push(entry);
  }
  entry.name = player.name;
  entry.buyInsCents = Math.max(entry.buyInsCents, player.buyInsCents || 0);
  entry.cashOutCents = Math.max(entry.cashOutCents, player.cashOutCents || 0);
  return entry;
}

function addMoneyBuyIn(room, player, cents) {
  if (!room?.moneyMode || !player) return;
  const entry = syncPlayerToMoneyLedger(room, player);
  entry.buyInsCents += cents;
  player.buyInsCents = entry.buyInsCents;
  player.cashOutCents = entry.cashOutCents;
}

function optimizeSettlements(entries) {
  const debtors = entries
    .map((entry) => ({
      playerId: entry.playerId || entry.id,
      name: entry.name,
      amountCents: Math.max(0, entry.buyInsCents - entry.cashOutCents),
    }))
    .filter((item) => item.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);
  const creditors = entries
    .map((entry) => ({
      playerId: entry.playerId || entry.id,
      name: entry.name,
      amountCents: Math.max(0, entry.cashOutCents - entry.buyInsCents),
    }))
    .filter((item) => item.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);
  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.amountCents, creditor.amountCents);
    if (amountCents > 0) {
      settlements.push({
        fromPlayerId: debtor.playerId,
        fromName: debtor.name,
        toPlayerId: creditor.playerId,
        toName: creditor.name,
        amountCents,
      });
    }
    debtor.amountCents -= amountCents;
    creditor.amountCents -= amountCents;
    if (debtor.amountCents === 0) debtorIndex += 1;
    if (creditor.amountCents === 0) creditorIndex += 1;
  }
  return settlements;
}

function settleMoneyGame(room) {
  if (!room.moneyMode) return;
  const refundActiveInvestments = api.isHandInProgress(room);
  for (const player of room.players) {
    if (refundActiveInvestments && player.invested > 0) {
      player.stack += player.invested;
      player.invested = 0;
      player.bet = 0;
    }
    if (player.stack > 0) {
      player.cashOutCents += chipsToCents(room, player.stack);
      player.stack = 0;
    }
    syncPlayerToMoneyLedger(room, player);
  }
  room.settlements = optimizeSettlements(room.moneyLedger);
}

function cashInPlayer(room, playerId, amountCents) {
  const player = room?.players.find((item) => item.id === playerId);
  if (!room?.moneyMode) return { ok: false, error: "This room is not using money mode." };
  if (!player || player.isBot) return { ok: false, error: "Player not found." };
  const handLive = api.isHandInProgress(room);
  if (handLive) {
    // Still contesting this pot (including all-in with cards) — no mid-pot top-up.
    // Busted / folded / waiting seats may buy chips for the next hand now.
    const inCurrentPot = player.hand.length > 0 && !player.folded;
    if (inCurrentPot) {
      return { ok: false, error: "You can’t add chips while you’re in the current hand." };
    }
  }
  const cents = cleanMoneyCents(amountCents, room.buyInCents);
  player.buyInsCents += cents;
  player.stack += centsToChips(room, cents);
  player.allIn = false;
  if (handLive) {
    // Sit out the rest of this hand; chips are only live on the next deal.
    player.folded = true;
    player.hand = [];
    player.bet = 0;
  }
  api.resetReadiness(room);
  syncPlayerToMoneyLedger(room, player);
  room.settlements = [];
  room.message = handLive
    ? `${player.name} buys in for the next hand.`
    : `${player.name} cashed in.`;
  return { ok: true };
}

function playerCanCashIn(room, player) {
  if (!room?.moneyMode || !player || player.isBot) return false;
  if (!api.isHandInProgress(room)) return true;
  return !(player.hand.length > 0 && !player.folded);
}

function cashOutPlayer(room, playerId) {
  const player = room?.players.find((item) => item.id === playerId);
  if (!room?.moneyMode) return { ok: false, error: "This room is not using money mode." };
  if (!player || player.isBot) return { ok: false, error: "Player not found." };
  if (api.isHandInProgress(room)) return { ok: false, error: "Cash out between hands." };
  if (player.stack <= 0) return { ok: false, error: "You do not have chips to cash out." };
  player.cashOutCents += chipsToCents(room, player.stack);
  player.stack = 0;
  player.bet = 0;
  player.invested = 0;
  player.folded = true;
  player.allIn = true;
  api.resetReadiness(room);
  syncPlayerToMoneyLedger(room, player);
  room.settlements = optimizeSettlements(room.moneyLedger);
  room.message = `${player.name} cashed out.`;
  return { ok: true };
}

function moneyTermsForRoom(room) {
  const blinds = api.currentBlinds(room);
  return {
    roomId: room.id,
    buyInCents: room.buyInCents,
    smallBlindCents: chipsToCents(room, blinds.smallBlind),
    bigBlindCents: chipsToCents(room, blinds.bigBlind),
  };
}

function moneyTermsAccepted(room, acceptedMoneyTerms) {
  const moneyTerms = moneyTermsForRoom(room);
  return Boolean(
    acceptedMoneyTerms &&
    Object.keys(moneyTerms).every((key) => acceptedMoneyTerms[key] === moneyTerms[key]),
  );
}

Object.assign(api, {
  cleanMoneyCents,
  chipValueCents,
  centsToChips,
  chipsToCents,
  syncPlayerToMoneyLedger,
  addMoneyBuyIn,
  optimizeSettlements,
  settleMoneyGame,
  cashInPlayer,
  playerCanCashIn,
  cashOutPlayer,
  moneyTermsForRoom,
  moneyTermsAccepted,
});

module.exports = {
  cleanMoneyCents,
  chipValueCents,
  centsToChips,
  chipsToCents,
  syncPlayerToMoneyLedger,
  addMoneyBuyIn,
  optimizeSettlements,
  settleMoneyGame,
  cashInPlayer,
  playerCanCashIn,
  cashOutPlayer,
  moneyTermsForRoom,
  moneyTermsAccepted,
};
