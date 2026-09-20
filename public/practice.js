/**
 * Browser-side offline practice session. Drives HoldemEngine without Socket.IO.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../shared/engine"));
  } else {
    root.PracticeSession = factory(root.HoldemEngine);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine) {
  "use strict";

  if (!engine) throw new Error("PracticeSession requires HoldemEngine");

  const CPU_ACTION_DELAY_MS = 250;
  const SHOWDOWN_DELAY_MS = 1600;

  /**
   * Solo chip online tables may continue locally after a disconnect.
   * Money games, multi-human rooms, and already-offline sessions stay online/reconnect.
   */
  function canHandoffToOffline(state) {
    if (!state || typeof state !== "object") return false;
    if (state.offline) return false;
    if (state.moneyMode) return false;
    if (!state.phase) return false;
    if (!Array.isArray(state.players) || state.players.length === 0) return false;
    const humans = state.players.filter((player) => !player.isBot);
    if (humans.length !== 1) return false;
    return Boolean(humans[0].isYou);
  }

  function createPracticeSession(options = {}) {
    const room = options.room || engine.createPracticeRoom(options);
    const viewerId = options.viewerId || room.hostId;
    let onUpdate = typeof options.onUpdate === "function" ? options.onUpdate : null;
    let disposed = false;

    function snapshot() {
      return engine.serializeRoom(room, viewerId);
    }

    function publish() {
      if (disposed || !onUpdate) return;
      onUpdate(snapshot());
      scheduleShowdown();
      scheduleBot();
    }

    function scheduleShowdown() {
      if (disposed || room.phase !== "showdown" || room.showdownTimer) return;
      const delay = engine.isSoloHumanFolded(room) ? 30 : SHOWDOWN_DELAY_MS;
      room.showdownTimer = setTimeout(() => {
        if (disposed || !room || room.phase !== "showdown") return;
        engine.settleShowdown(room);
        publish();
      }, delay);
    }

    function scheduleBot() {
      clearTimeout(room.botTimer);
      if (disposed) return;
      const player = room.players.find((item) => item.id === room.turn);
      if (!player?.isBot || !engine.isHandInProgress(room)) return;
      room.botTimer = setTimeout(() => {
        if (disposed) return;
        const current = room.players.find((item) => item.id === room.turn);
        if (!current?.isBot || !engine.isHandInProgress(room)) return;
        engine.applyPlayerAction(room, current.id, engine.chooseComputerAction(room, current));
        publish();
      }, CPU_ACTION_DELAY_MS);
    }

    function handle(eventName, payload = {}) {
      if (disposed) return { ok: false, error: "Practice session ended." };

      if (eventName === "game:ready") {
        const hero = room.players.find((player) => player.id === viewerId);
        if (!hero || hero.isBot) return { ok: false, error: "Player not found." };
        if (!engine.canReadyForHand(room)) return { ok: false, error: "Cannot ready now." };
        const nextReady = payload.ready == null ? !hero.ready : Boolean(payload.ready);
        hero.ready = nextReady;
        engine.maybeStartReadyHand(room);
        publish();
        return { ok: true };
      }

      if (eventName === "game:action") {
        const result = engine.applyPlayerAction(room, viewerId, payload);
        if (result.ok) publish();
        return result;
      }

      if (eventName === "game:showCards") {
        const result = engine.showPlayerCards(room, viewerId);
        if (result.ok) publish();
        return result;
      }

      if (eventName === "room:addBot") {
        if (room.handNumber !== 0 || room.players.length >= engine.MAX_PLAYERS) {
          return { ok: false, error: "Cannot add a bot right now." };
        }
        engine.addComputerPlayers(room, room.players.length + 1);
        const added = room.players[room.players.length - 1];
        if (added?.isBot) added.stack = Math.max(1, Math.floor(Number(room.startingStack) || engine.STARTING_STACK));
        room.tableSize = room.players.length;
        room.message = `${added.name} joined the practice table.`;
        publish();
        return { ok: true };
      }

      if (eventName === "game:sitOut") {
        const hero = room.players.find((player) => player.id === viewerId);
        if (!hero) return { ok: false, error: "Player not found." };
        hero.sittingOut = Boolean(payload.sittingOut);
        hero.ready = false;
        room.message = hero.sittingOut ? `${hero.name} is sitting out.` : `${hero.name} is back.`;
        publish();
        return { ok: true };
      }

      if (eventName === "game:setBlinds") {
        if (room.hostId !== viewerId || !engine.canReadyForHand(room)) {
          return { ok: false, error: "Cannot change blinds now." };
        }
        const small = Math.max(1, Math.floor(Number(payload.smallBlind) || room.baseSmallBlind));
        const big = Math.max(small + 1, Math.floor(Number(payload.bigBlind) || room.baseBigBlind));
        room.baseSmallBlind = small;
        room.baseBigBlind = big;
        room.minRaise = big;
        room.message = `Blinds set to ${small}/${big}.`;
        engine.resetReadiness(room);
        publish();
        return { ok: true };
      }

      if (eventName === "game:restart") {
        engine.restartPracticeRoom(room);
        publish();
        return { ok: true };
      }

      if (eventName === "game:end") {
        engine.endPracticeGame(room);
        publish();
        return { ok: true };
      }

      if (eventName === "player:setName") {
        const hero = room.players.find((player) => player.id === viewerId);
        if (!hero) return { ok: false, error: "Player not found." };
        hero.name = engine.cleanName(payload.name);
        publish();
        return { ok: true };
      }

      return { ok: false, error: "Not available in practice mode." };
    }

    function dispose() {
      disposed = true;
      clearTimeout(room.botTimer);
      clearTimeout(room.showdownTimer);
      room.botTimer = null;
      room.showdownTimer = null;
      onUpdate = null;
    }

    return {
      offline: true,
      getRoom: () => room,
      viewerId,
      snapshot,
      publish,
      handle,
      dispose,
      setOnUpdate(fn) {
        onUpdate = typeof fn === "function" ? fn : null;
      },
    };
  }

  function createPracticeSessionFromSnapshot(snapshot, options = {}) {
    const room = engine.hydratePracticeRoomFromSnapshot(snapshot);
    return createPracticeSession({
      ...options,
      room,
      viewerId: room.hostId,
    });
  }

  return {
    canHandoffToOffline,
    createPracticeSession,
    createPracticeSessionFromSnapshot,
  };
});
