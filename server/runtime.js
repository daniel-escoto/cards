const { customAlphabet } = require("nanoid");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createStateStore } = require("../state-store");
const api = require("./api");
require("./config");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const makeId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

const rooms = new Map();
const socketRoom = new Map();
const socketPlayer = new Map();
/** Rooms that have had live socket activity on this process (overlap-safe Redis merge). */
const liveRoomIds = new Set();

const flags = {
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

for (const key of Object.keys(flags)) {
  Object.defineProperty(api, key, {
    enumerable: true,
    configurable: true,
    get() { return flags[key]; },
    set(v) { flags[key] = v; },
  });
}

function getStateStore() {
  if (!api.stateStore) api.stateStore = createStateStore({ filePath: api.STATE_FILE });
  return api.stateStore;
}

/** Test helper: inject a memory/Redis store before load/save. */
function setStateStore(store) {
  api.stateStore = store;
  api.handoffComplete = !store || store.kind !== "redis";
  api.lastHandoffMeta = null;
  api.handoffWaitStartedAtMs = 0;
  if (typeof api.clearHandoffWaiters === "function") api.clearHandoffWaiters();
}

function usingRedis() {
  return getStateStore().kind === "redis";
}

function markRoomLive(roomId) {
  if (!roomId) return;
  liveRoomIds.add(String(roomId).toUpperCase());
}

function markStateRestored(value = true) {
  api.stateRestored = Boolean(value);
}

function markServerListening(value = true) {
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

module.exports = {
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
