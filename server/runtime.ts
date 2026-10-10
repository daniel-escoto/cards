import { customAlphabet } from "nanoid";
import express = require("express");
import http = require("http");
import { Server } from "socket.io";
import { createStateStore } from "../state-store";
import type { StateStore } from "../state-store-types";
import type { HandoffMeta, Room } from "../shared/types";
import api = require("./api");
import "./config";
import type { TypedIoServer } from "./server-api";

const app = express();
const server = http.createServer(app);
const io = new Server(server) as TypedIoServer;
const makeId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();
const socketPlayer = new Map<string, string>();
/** Rooms that have had live socket activity on this process (overlap-safe Redis merge). */
const liveRoomIds = new Set<string>();

interface RuntimeFlags {
  saveTimer: ReturnType<typeof setTimeout> | null;
  shuttingDown: boolean;
  holdNewHands: boolean;
  suppressPersistence: boolean;
  handoffComplete: boolean;
  stateRestored: boolean;
  serverListening: boolean;
  stateStore: StateStore | null;
  unsubscribeHandoff: (() => void | Promise<void>) | null;
  takeoverTimer: ReturnType<typeof setTimeout> | null;
  handoffPollTimer: ReturnType<typeof setInterval> | null;
  handoffWaitStartedAtMs: number;
  lastHandoffMeta: HandoffMeta | null;
}

const flags: RuntimeFlags = {
  saveTimer: null,
  shuttingDown: false,
  holdNewHands: false,
  suppressPersistence: false,
  handoffComplete: !process.env.REDIS_URL,
  stateRestored: false,
  serverListening: false,
  stateStore: null,
  unsubscribeHandoff: null,
  takeoverTimer: null,
  handoffPollTimer: null,
  handoffWaitStartedAtMs: 0,
  lastHandoffMeta: null,
};

for (const key of Object.keys(flags) as Array<keyof RuntimeFlags>) {
  Object.defineProperty(api, key, {
    enumerable: true,
    configurable: true,
    get() {
      return flags[key];
    },
    set(v: RuntimeFlags[keyof RuntimeFlags]) {
      // Indexed write across the flag union.
      (flags as Record<keyof RuntimeFlags, RuntimeFlags[keyof RuntimeFlags]>)[key] = v;
    },
  });
}

function getStateStore(): StateStore {
  if (!api.stateStore) api.stateStore = createStateStore({ filePath: api.STATE_FILE });
  return api.stateStore;
}

/** Test helper: inject a memory/Redis store before load/save. */
function setStateStore(store: StateStore | null): void {
  api.stateStore = store;
  api.handoffComplete = !store || store.kind !== "redis";
  api.lastHandoffMeta = null;
  api.handoffWaitStartedAtMs = 0;
  if (typeof api.clearHandoffWaiters === "function") api.clearHandoffWaiters();
}

function usingRedis(): boolean {
  return getStateStore().kind === "redis";
}

function markRoomLive(roomId: string): void {
  if (!roomId) return;
  liveRoomIds.add(String(roomId).toUpperCase());
}

function markStateRestored(value = true): void {
  api.stateRestored = Boolean(value);
}

function markServerListening(value = true): void {
  api.serverListening = Boolean(value);
}

Object.assign(api, {
  app,
  server,
  io,
  makeId,
  rooms,
  socketRoom,
  socketPlayer,
  liveRoomIds,
  getStateStore,
  setStateStore,
  usingRedis,
  markRoomLive,
  markStateRestored,
  markServerListening,
  isHoldingNewHands: () => api.holdNewHands,
  isHandoffComplete: () => api.handoffComplete,
  isServerReady: () => api.stateRestored && api.serverListening,
});

export = {
  app,
  server,
  io,
  makeId,
  rooms,
  socketRoom,
  socketPlayer,
  liveRoomIds,
  flags,
  getStateStore,
  setStateStore,
  usingRedis,
  markRoomLive,
  markStateRestored,
  markServerListening,
};
