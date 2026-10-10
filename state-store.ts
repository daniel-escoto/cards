/**
 * Room-state persistence: file (local/dev) or Redis (Railway overlap-safe deploys).
 *
 * Serialized payload shape matches rooms.json:
 *   { version, savedAt, buildId, rooms: [...], shutdownFlushedAt? }
 *
 * Redis keys / channels:
 *   holdem:game-state  — JSON payload
 *   holdem:handoff     — durable handoff marker (SET) after the draining instance's final flush
 *   holdem:handoff-ch  — pub/sub channel (fast path; key poll is the reliable path)
 */

import fs from "fs";
import path from "path";
import type { HandoffMeta, PersistedState } from "./shared/types";
import type {
  CreateStateStoreOptions,
  MemoryRedisBacking,
  RedisClientLike,
  RedisCreateClient,
  StateStore,
} from "./state-store-types";

const REDIS_STATE_KEY = "holdem:game-state";
/** Durable handoff marker the new instance polls (pub/sub alone can miss under deploy timing). */
const REDIS_HANDOFF_KEY = "holdem:handoff";
const REDIS_HANDOFF_CHANNEL = "holdem:handoff-ch";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersistedState(value: unknown): value is PersistedState {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.savedAt !== "string" || typeof value.buildId !== "string") return false;
  if (!Array.isArray(value.rooms)) return false;
  if (value.shutdownFlushedAt != null && typeof value.shutdownFlushedAt !== "string") return false;
  return true;
}

function isHandoffMeta(value: unknown): value is HandoffMeta {
  if (!isRecord(value)) return false;
  return typeof value.at === "string";
}

function parsePersistedState(raw: string): PersistedState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPersistedState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clonePersistedState(value: PersistedState): PersistedState {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isPersistedState(parsed)) throw new Error("Failed to clone PersistedState");
  return parsed;
}

function cloneHandoffMeta(value: HandoffMeta): HandoffMeta {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isHandoffMeta(parsed)) throw new Error("Failed to clone HandoffMeta");
  return parsed;
}

function createFileStateStore(filePath: string): StateStore {
  return {
    kind: "file",
    filePath,
    async load() {
      if (!fs.existsSync(filePath)) return null;
      try {
        return parsePersistedState(fs.readFileSync(filePath, "utf8"));
      } catch (error) {
        console.error("Failed to read game state file:", error);
        return null;
      }
    },
    async save(payload) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
    },
    async publishHandoff() {
      // File mode has no overlapping replica.
    },
    async readHandoff() {
      return null;
    },
    async onHandoff() {
      return () => {};
    },
    async close() {},
  };
}

/**
 * In-memory store that speaks the Redis store interface (for unit tests).
 * Shares one backing object so multiple "connections" see the same data/pubsub.
 */
function createMemoryRedisBacking(): MemoryRedisBacking {
  return {
    value: null,
    handoff: null,
    handlers: new Set(),
  };
}

function createMemoryStateStore(backing: MemoryRedisBacking = createMemoryRedisBacking()): StateStore {
  return {
    kind: "redis",
    backing,
    async load() {
      if (backing.value == null) return null;
      return clonePersistedState(backing.value);
    },
    async save(payload) {
      backing.value = clonePersistedState(payload);
    },
    async publishHandoff(meta = {}) {
      const message: HandoffMeta = {
        at: new Date().toISOString(),
        ...meta,
      };
      backing.handoff = cloneHandoffMeta(message);
      const raw = JSON.stringify(message);
      for (const handler of [...backing.handlers]) {
        try {
          await handler(raw);
        } catch (error) {
          console.error("Handoff handler error:", error);
        }
      }
    },
    async readHandoff() {
      if (backing.handoff == null) return null;
      return cloneHandoffMeta(backing.handoff);
    },
    async onHandoff(handler) {
      const wrapped = (message: string) => handler(message);
      backing.handlers.add(wrapped);
      return async () => {
        backing.handlers.delete(wrapped);
      };
    },
    async close() {},
  };
}

function parseHandoffRaw(raw: string | null | undefined): HandoffMeta | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isHandoffMeta(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRedisCreateClient(value: unknown): value is RedisCreateClient {
  return typeof value === "function";
}

function isRedisClientLike(value: unknown): value is RedisClientLike {
  if (!isRecord(value)) return false;
  return (
    typeof value.connect === "function" &&
    typeof value.get === "function" &&
    typeof value.set === "function" &&
    typeof value.publish === "function" &&
    typeof value.subscribe === "function" &&
    typeof value.unsubscribe === "function" &&
    typeof value.quit === "function" &&
    typeof value.isOpen === "boolean"
  );
}

function defaultRedisCreateClient(): RedisCreateClient {
  // Lazy require so file-only environments never load redis until needed.
  const redis: unknown = require("redis");
  if (!isRecord(redis) || typeof redis.createClient !== "function") {
    throw new Error("redis package missing createClient");
  }
  const createClientFn = redis.createClient;
  return (opts: { url: string }) => {
    const client: unknown = createClientFn.call(redis, opts);
    if (!isRedisClientLike(client)) {
      throw new Error("redis.createClient returned an unexpected client shape");
    }
    return client;
  };
}

function createRedisStateStore(
  redisUrl: string,
  { createClient }: { createClient?: RedisCreateClient } = {},
): StateStore {
  const makeClient = createClient && isRedisCreateClient(createClient) ? createClient : defaultRedisCreateClient();

  const client = makeClient({ url: redisUrl });
  const subscriber = makeClient({ url: redisUrl });
  let connectPromise: Promise<unknown> | null = null;

  async function ensureConnected() {
    if (!connectPromise) {
      connectPromise = Promise.all([
        client.isOpen ? Promise.resolve() : client.connect(),
        subscriber.isOpen ? Promise.resolve() : subscriber.connect(),
      ]);
    }
    await connectPromise;
  }

  return {
    kind: "redis",
    client,
    subscriber,
    async load() {
      await ensureConnected();
      const raw = await client.get(REDIS_STATE_KEY);
      if (!raw) return null;
      try {
        const parsed = parsePersistedState(raw);
        if (!parsed) console.error("Failed to parse Redis game state: invalid shape");
        return parsed;
      } catch (error) {
        console.error("Failed to parse Redis game state:", error);
        return null;
      }
    },
    async save(payload) {
      await ensureConnected();
      await client.set(REDIS_STATE_KEY, JSON.stringify(payload));
    },
    async publishHandoff(meta = {}) {
      await ensureConnected();
      const message = {
        at: new Date().toISOString(),
        ...meta,
      };
      const raw = JSON.stringify(message);
      // Durable key first so a polling replica can observe handoff even if pub/sub is missed.
      await client.set(REDIS_HANDOFF_KEY, raw);
      await client.publish(REDIS_HANDOFF_CHANNEL, raw);
    },
    async readHandoff() {
      await ensureConnected();
      return parseHandoffRaw(await client.get(REDIS_HANDOFF_KEY));
    },
    async onHandoff(handler) {
      await ensureConnected();
      const listener = (message: string) => handler(message);
      await subscriber.subscribe(REDIS_HANDOFF_CHANNEL, listener);
      return async () => {
        try {
          await subscriber.unsubscribe(REDIS_HANDOFF_CHANNEL);
        } catch {
          // ignore
        }
      };
    },
    async close() {
      try {
        if (subscriber.isOpen) await subscriber.quit();
      } catch {
        // ignore
      }
      try {
        if (client.isOpen) await client.quit();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Build the active store from env.
 * Prefer an injected store (tests). Otherwise REDIS_URL → Redis, else file.
 */
function createStateStore(options: CreateStateStoreOptions = {}): StateStore {
  if (options.store) return options.store;
  if (options.memoryBacking) return createMemoryStateStore(options.memoryBacking);
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (redisUrl) {
    return createRedisStateStore(redisUrl, { createClient: options.createClient });
  }
  // Compiled to dist/state-store.js — keep .data at the repo root (one level up).
  const repoRoot = path.join(__dirname, "..");
  const filePath =
    options.filePath ||
    process.env.GAME_STATE_FILE ||
    path.join(
      process.env.RAILWAY_VOLUME_MOUNT_PATH ||
        process.env.DATA_DIR ||
        path.join(repoRoot, ".data"),
      "rooms.json",
    );
  return createFileStateStore(filePath);
}

export {
  REDIS_STATE_KEY,
  REDIS_HANDOFF_KEY,
  REDIS_HANDOFF_CHANNEL,
  createFileStateStore,
  createMemoryRedisBacking,
  createMemoryStateStore,
  createRedisStateStore,
  createStateStore,
};
