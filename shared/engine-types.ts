/**
 * Engine-facing aliases. The pure engine mutates room/player objects that match
 * the shared Room/Player shapes (Sets for acted/raiseEligible at runtime).
 */
export type {
  ActionLogEntry,
  ActionType,
  BlindLevel,
  CardCode,
  Player,
  PlayerColor,
  PublicCard,
  Room,
  RoomPhase,
  WinnerSummary,
} from "./types";

import type {
  ActionLogEntry,
  ActionType,
  CardCode,
  Player,
  PlayerColor,
  PublicCard,
  Room,
  WinnerSummary,
} from "./types";

export type RandomIntFn = (maxExclusive: number) => number;

export interface BotProfile {
  tag: string;
  style: string;
  /** Short seat-tag label shown to players (e.g. "Loose"). */
  short: string;
  /** Think-time multiplier: < 1 acts faster, > 1 slower. */
  tempo: number;
  aggression: number;
  looseness: number;
  bluff: number;
  skill: number;
}

export interface MakePlayerArgs {
  id: string;
  name: string;
  socketId?: string | null;
  isBot?: boolean;
}

export interface ActionMetadata {
  playerId?: string;
  action?: string;
}

export interface SidePot {
  amount: number;
  contenders: Player[];
  contenderIds: string[];
}

export interface PracticeRoomOptions {
  tableSize?: number;
  startingStack?: number;
  smallBlind?: number;
  bigBlind?: number;
  name?: string;
  playerId?: string;
  botCount?: number;
}

/** ClientRoom-like snapshot used by offline hydrate / handoff. */
export interface PracticeSnapshot {
  status?: string;
  phase?: string;
  tableSize?: number;
  message?: string;
  turn?: string | null;
  currentBet?: number;
  minRaise?: number;
  smallBlind?: number;
  bigBlind?: number;
  pot?: number;
  handNumber?: number;
  moneyMode?: boolean;
  chipValueCents?: number;
  riverAggressor?: string | null;
  allInCardsExposed?: boolean;
  winners?: WinnerSummary[];
  actionLog?: ActionLogEntry[];
  community?: Array<PublicCard | CardCode | null | undefined>;
  players: PracticeSnapshotPlayer[];
}

export interface PracticeSnapshotPlayer {
  id: string;
  name?: string;
  color?: PlayerColor;
  stack?: number;
  bet?: number;
  invested?: number;
  folded?: boolean;
  allIn?: boolean;
  showCards?: boolean;
  ready?: boolean;
  sittingOut?: boolean;
  waitingForNextHand?: boolean;
  isBot?: boolean;
  isYou?: boolean;
  dealer?: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
  buyInsCents?: number;
  cashOutCents?: number;
  botProfile?: string | null;
  cards?: Array<PublicCard | CardCode | null | undefined>;
}

export interface PlayerActionInput {
  type?: ActionType;
  raiseTo?: number;
}

export type EngineRoom = Room;
