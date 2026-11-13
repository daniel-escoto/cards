/**
 * One structured console line per table event, prefixed so Railway logs
 * can be filtered with:  [usage]
 *
 * Never log IPs, tokens, ledger amounts, or chat.
 */
export type UsageKind = "human" | "bot";

export type UsageEvent =
  | {
      event: "room_created";
      room: string;
      host: string;
      moneyMode: boolean;
    }
  | {
      event: "player_joined";
      room: string;
      name: string;
      seat: number | null;
      kind: UsageKind;
      spectator: boolean;
      rejoin: boolean;
    }
  | {
      event: "player_left";
      room: string;
      name: string;
      kind: UsageKind;
      spectator: boolean;
    }
  | {
      event: "room_closed";
      room: string;
      reason: "expired" | "empty";
      durationMs: number;
      hands: number;
      maxHumans: number;
    }
  | {
      event: "hand_started";
      room: string;
      hand: number;
      humans: number;
      bots: number;
    };

export const USAGE_LOG_PREFIX = "[usage]";

type UsageStats = {
  createdAt: number;
  maxHumans: number;
};

const usageByRoom = new Map<string, UsageStats>();

type UsageWriter = (line: string) => void;

let writeUsageLine: UsageWriter = (line) => {
  console.log(line);
};

export function setUsageLogWriter(next: UsageWriter | null): void {
  writeUsageLine =
    next ??
    ((line) => {
      console.log(line);
    });
}

export function resetUsageStats(): void {
  usageByRoom.clear();
}

export function formatUsageLine(payload: UsageEvent): string {
  return `${USAGE_LOG_PREFIX} ${JSON.stringify(payload)}`;
}

export function logUsage(payload: UsageEvent): void {
  writeUsageLine(formatUsageLine(payload));
}

type Seated = {
  id: string;
  name: string;
  isBot?: boolean;
};

type UsageRoom = {
  id: string;
  handNumber?: number;
  players: Seated[];
};

function humanCount(room: UsageRoom): number {
  return room.players.filter((player) => !player.isBot).length;
}

function botCount(room: UsageRoom): number {
  return room.players.filter((player) => player.isBot).length;
}

export function noteRoomUsage(room: UsageRoom, now = Date.now()): UsageStats {
  let stats = usageByRoom.get(room.id);
  if (!stats) {
    stats = { createdAt: now, maxHumans: 0 };
    usageByRoom.set(room.id, stats);
  }
  const humans = humanCount(room);
  if (humans > stats.maxHumans) stats.maxHumans = humans;
  return stats;
}

export function takeRoomUsage(roomId: string): UsageStats | undefined {
  const stats = usageByRoom.get(roomId);
  usageByRoom.delete(roomId);
  return stats;
}

export function seatedIds(room: UsageRoom): Set<string> {
  return new Set(room.players.map((player) => player.id));
}

export function logRoomCreated(room: UsageRoom, hostName: string, moneyMode: boolean): void {
  noteRoomUsage(room);
  logUsage({
    event: "room_created",
    room: room.id,
    host: hostName,
    moneyMode,
  });
}

export function logPlayerJoined(
  room: UsageRoom,
  player: Seated,
  seat: number | null,
  options: { spectator?: boolean; rejoin?: boolean } = {},
): void {
  noteRoomUsage(room);
  logUsage({
    event: "player_joined",
    room: room.id,
    name: player.name,
    seat,
    kind: player.isBot ? "bot" : "human",
    spectator: Boolean(options.spectator),
    rejoin: Boolean(options.rejoin),
  });
}

export function logPlayerLeft(
  room: Pick<UsageRoom, "id">,
  name: string,
  options: { kind?: UsageKind; spectator?: boolean } = {},
): void {
  logUsage({
    event: "player_left",
    room: room.id,
    name,
    kind: options.kind ?? "human",
    spectator: Boolean(options.spectator),
  });
}

export function logNewSeatedPlayers(room: UsageRoom, previousIds: Set<string>): void {
  for (const [seat, player] of room.players.entries()) {
    if (previousIds.has(player.id)) continue;
    logPlayerJoined(room, player, seat);
  }
}

export function logHandStarted(room: UsageRoom): void {
  noteRoomUsage(room);
  logUsage({
    event: "hand_started",
    room: room.id,
    hand: room.handNumber ?? 0,
    humans: humanCount(room),
    bots: botCount(room),
  });
}

export function logRoomClosed(room: UsageRoom, reason: "expired" | "empty", now = Date.now()): void {
  const stats = takeRoomUsage(room.id);
  const createdAt = stats?.createdAt;
  logUsage({
    event: "room_closed",
    room: room.id,
    reason,
    durationMs: createdAt != null ? Math.max(0, now - createdAt) : 0,
    hands: room.handNumber ?? 0,
    maxHumans: Math.max(stats?.maxHumans ?? 0, humanCount(room)),
  });
}
