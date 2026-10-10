import api = require("../api");
import "../config";
import "../runtime";
import type { Player, Room } from "../../shared/types";

function clearTurnTimer(room: Room): void {
  if (!room) return;
  api.shotClockTime.clearTimeout(room.turnTimer);
  room.turnTimer = null;
  room.turnEndsAt = null;
  room.turnTimerPlayerId = null;
}

function clearReadyTimer(room: Room): void {
  if (!room) return;
  api.shotClockTime.clearTimeout(room.readyTimer);
  room.readyTimer = null;
  room.readyEndsAt = null;
}

function applyReadyTimeout(room: Room): void {
  if (!room || !api.canReadyForHand(room)) return;
  const satOutNames: string[] = [];
  for (const player of room.players) {
    if (player.isBot || player.sittingOut || player.stack <= 0 || player.ready) continue;
    player.sittingOut = true;
    player.ready = false;
    satOutNames.push(player.name);
  }
  if (satOutNames.length === 1) {
    room.message = `${satOutNames[0]} sat out (ready timer).`;
  } else if (satOutNames.length > 1) {
    room.message = `${satOutNames.join(", ")} sat out (ready timer).`;
  }
  api.tryStartReadyHand(room);
}

function armReadyTimeout(room: Room, delayMs: number): void {
  const roomId = room.id;
  api.shotClockTime.clearTimeout(room.readyTimer);
  room.readyTimer = api.shotClockTime.setTimeout(
    () => {
      const current = api.rooms.get(roomId);
      if (!current) return;
      current.readyTimer = null;
      current.readyEndsAt = null;
      if (
        !api.canReadyForHand(current) ||
        !api.normalizeReadyTimerMs(current.readyTimeLimitMs, api.READY_TIMER_DEFAULT_MS)
      ) {
        api.emitRoom(current);
        return;
      }
      applyReadyTimeout(current);
      api.emitRoom(current);
    },
    Math.max(0, delayMs),
  );
}

function scheduleReadyTimer(room: Room): void {
  const limitMs = api.normalizeReadyTimerMs(room?.readyTimeLimitMs, api.READY_TIMER_DEFAULT_MS);
  // First lobby (handNumber 0) keeps today's untimed Ready; timer starts after a hand completes.
  const betweenHands =
    api.canReadyForHand(room) && (room.phase === "complete" || room.handNumber > 0);
  if (!room || !limitMs || !betweenHands) {
    clearReadyTimer(room);
    return;
  }

  const seated = api.playersWithChips(room).filter((player: Player) => !player.sittingOut);
  const humans = seated.filter((player: Player) => !player.isBot);
  if (seated.length < 2 || humans.length === 0) {
    clearReadyTimer(room);
    return;
  }
  if (humans.every((player: Player) => player.connected && player.ready)) {
    clearReadyTimer(room);
    return;
  }

  const now = api.shotClockTime.now();
  if (room.readyEndsAt) {
    if (!room.readyTimer) {
      armReadyTimeout(room, room.readyEndsAt - now);
    }
    return;
  }

  room.readyEndsAt = now + limitMs;
  armReadyTimeout(room, limitMs);
}

function autoTurnAction(room: Room, player: Player): { type: string } {
  const toCall = Math.max(0, (room?.currentBet || 0) - (player?.bet || 0));
  return toCall > 0 ? { type: "fold" } : { type: "check" };
}

function isBettingStreet(phase: string): boolean {
  return ["preflop", "flop", "turn", "river"].includes(phase);
}

function armTurnTimeout(room: Room, expectedTurn: string, delayMs: number): void {
  const roomId = room.id;
  api.shotClockTime.clearTimeout(room.turnTimer);
  room.turnTimer = api.shotClockTime.setTimeout(
    () => {
      const current = api.rooms.get(roomId);
      if (!current) return;
      current.turnTimer = null;
      current.turnEndsAt = null;
      current.turnTimerPlayerId = null;
      const actor = current.players.find((item) => item.id === current.turn);
      // Still auto-act during disconnect grace — refresh/rejoin must not pause the clock.
      if (
        !actor ||
        actor.id !== expectedTurn ||
        actor.isBot ||
        actor.folded ||
        actor.allIn ||
        !api.isHandInProgress(current) ||
        !isBettingStreet(current.phase) ||
        !api.normalizeShotClockMs(current.turnTimeLimitMs, api.SHOT_CLOCK_DEFAULT_MS)
      ) {
        api.emitRoom(current);
        return;
      }
      const action = autoTurnAction(current, actor);
      const result = api.applyPlayerAction(current, actor.id, action);
      if (!result.ok && action.type === "check") {
        api.applyPlayerAction(current, actor.id, { type: "fold" });
      }
      api.emitRoom(current);
    },
    Math.max(0, delayMs),
  );
}

function scheduleHumanTurnTimer(room: Room): void {
  const limitMs = api.normalizeShotClockMs(room?.turnTimeLimitMs, api.SHOT_CLOCK_DEFAULT_MS);
  const player = room?.players.find((item) => item.id === room.turn);
  if (
    !room ||
    !limitMs ||
    !player ||
    player.isBot ||
    !api.isHandInProgress(room) ||
    !isBettingStreet(room.phase) ||
    player.folded ||
    player.allIn
  ) {
    clearTurnTimer(room);
    return;
  }

  const now = api.shotClockTime.now();
  // Absolute deadline is set once per turn. Reconnect, presence, and broadcasts only
  // re-arm the timeout for the remaining time — never extend turnEndsAt.
  if (room.turnEndsAt && room.turnTimerPlayerId === player.id) {
    if (!room.turnTimer) {
      armTurnTimeout(room, player.id, room.turnEndsAt - now);
    }
    return;
  }

  clearTurnTimer(room);
  room.turnTimerPlayerId = player.id;
  room.turnEndsAt = now + limitMs;
  armTurnTimeout(room, player.id, limitMs);
}

function setRoomShotClock(room: Room, seconds: number): { ok: boolean; error?: string } {
  if (!room) return { ok: false, error: "Room not found." };
  const raw = Number(seconds);
  if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
    return {
      ok: false,
      error: "Shot clock must be an integer from 10 to 600 seconds, or Off (0).",
    };
  }
  if (raw !== 0 && (raw < api.SHOT_CLOCK_MIN_MS / 1000 || raw > api.SHOT_CLOCK_MAX_MS / 1000)) {
    return {
      ok: false,
      error: "Shot clock must be an integer from 10 to 600 seconds, or Off (0).",
    };
  }
  const ms = raw * 1000;
  room.turnTimeLimitMs = ms;
  if (!ms) {
    clearTurnTimer(room);
  } else if (room.turnTimerPlayerId) {
    // Host changed the limit mid-turn — restart the clock for the current actor.
    clearTurnTimer(room);
    scheduleHumanTurnTimer(room);
  }
  room.message = ms
    ? `Shot clock set to ${api.formatShotClockSeconds(raw)}.`
    : "Shot clock turned off.";
  return { ok: true };
}

function setRoomReadyTimer(room: Room, seconds: number): { ok: boolean; error?: string } {
  if (!room) return { ok: false, error: "Room not found." };
  const raw = Number(seconds);
  if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
    return {
      ok: false,
      error: "Ready-up timer must be an integer from 5 to 300 seconds, or Off (0).",
    };
  }
  if (raw !== 0 && (raw < api.READY_TIMER_MIN_MS / 1000 || raw > api.READY_TIMER_MAX_MS / 1000)) {
    return {
      ok: false,
      error: "Ready-up timer must be an integer from 5 to 300 seconds, or Off (0).",
    };
  }
  const ms = raw * 1000;
  room.readyTimeLimitMs = ms;
  // Changing the limit (or turning Off) clears any in-flight deadline; api.emitRoom re-arms when On.
  clearReadyTimer(room);
  if (ms) scheduleReadyTimer(room);
  room.message = ms
    ? `Ready-up timer set to ${api.formatShotClockSeconds(raw)}.`
    : "Ready-up timer turned off.";
  return { ok: true };
}

function scheduleComputerTurn(room: Room): void {
  clearTimeout(room.botTimer!);
  if (!api.hasConnectedHuman(room)) return;
  const player = room.players.find((item) => item.id === room.turn);
  if (!player?.isBot || !api.isHandInProgress(room)) return;
  room.botTimer = setTimeout(() => {
    const currentRoom = api.rooms.get(room.id);
    const currentPlayer = currentRoom?.players.find((item) => item.id === currentRoom.turn);
    if (
      !currentRoom ||
      !api.hasConnectedHuman(currentRoom) ||
      !currentPlayer?.isBot ||
      !api.isHandInProgress(currentRoom)
    )
      return;
    api.applyPlayerAction(
      currentRoom,
      currentPlayer.id,
      api.chooseComputerAction(currentRoom, currentPlayer),
    );
    api.emitRoom(currentRoom);
  }, api.CPU_ACTION_DELAY_MS);
}

Object.assign(api, {
  clearTurnTimer,
  clearReadyTimer,
  applyReadyTimeout,
  armReadyTimeout,
  scheduleReadyTimer,
  autoTurnAction,
  isBettingStreet,
  armTurnTimeout,
  scheduleHumanTurnTimer,
  setRoomShotClock,
  setRoomReadyTimer,
  scheduleComputerTurn,
});

export = {
  clearTurnTimer,
  clearReadyTimer,
  applyReadyTimeout,
  armReadyTimeout,
  scheduleReadyTimer,
  autoTurnAction,
  isBettingStreet,
  armTurnTimeout,
  scheduleHumanTurnTimer,
  setRoomShotClock,
  setRoomReadyTimer,
  scheduleComputerTurn,
};
