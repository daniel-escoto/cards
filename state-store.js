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

const fs = require("fs");
const path = require("path");

const REDIS_STATE_KEY = "holdem:game-state";
/** Durable handoff marker the new instance polls (pub/sub alone can miss under deploy timing). */
const REDIS_HANDOFF_KEY = "holdem:handoff";
const REDIS_HANDOFF_CHANNEL = "holdem:handoff-ch";

function createFileStateStore(filePath) {
  return {
    kind: "file",
    filePath,
    async load() {
      if (!fs.existsSync(filePath)) return null;
      try {
        const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (!payload || typeof payload !== "object") return null;
        return payload;
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
function createMemoryRedisBacking() {
  return {
    value: null,
    handoff: null,
    handlers: new Set(),
  };
}

function createMemoryStateStore(backing = createMemoryRedisBacking()) {
  return {
    kind: "redis",
    backing,
    async load() {
      if (backing.value == null) return null;
      return JSON.parse(JSON.stringify(backing.value));
    },
    async save(payload) {
      backing.value = JSON.parse(JSON.stringify(payload));
    },
    async publishHandoff(meta = {}) {
      const message = {
        at: new Date().toISOString(),
        ...meta,
      };
      backing.handoff = JSON.parse(JSON.stringify(message));
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
      return JSON.parse(JSON.stringify(backing.handoff));
    },
    async onHandoff(handler) {
      const wrapped = (message) => handler(message);
      backing.handlers.add(wrapped);
      return async () => {
        backing.handlers.delete(wrapped);
      };
    },
    async close() {},
  };
}

function parseHandoffRaw(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function createRedisStateStore(redisUrl, { createClient } = {}) {
  // Lazy require so file-only environments never load the redis package path in tests that mock.
  const redis = createClient ? null : require("redis");
  const makeClient = createClient || redis.createClient;

  const client = makeClient({ url: redisUrl });
  const subscriber = makeClient({ url: redisUrl });
  let connectPromise = null;

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
        return JSON.parse(raw);
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
      const listener = (message) => handler(message);
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
function createStateStore(options = {}) {
  if (options.store) return options.store;
  if (options.memoryBacking) return createMemoryStateStore(options.memoryBacking);
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (redisUrl) {
    return createRedisStateStore(redisUrl, { createClient: options.createClient });
  }
  const filePath = options.filePath
    || process.env.GAME_STATE_FILE
    || path.join(
      process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, ".data"),
      "rooms.json",
    );
  return createFileStateStore(filePath);
}

module.exports = {
  REDIS_STATE_KEY,
  REDIS_HANDOFF_KEY,
  REDIS_HANDOFF_CHANNEL,
  createFileStateStore,
  createMemoryRedisBacking,
  createMemoryStateStore,
  createRedisStateStore,
  createStateStore,
};
