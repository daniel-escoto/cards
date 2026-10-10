/**
 * Room-state persistence: file (local/dev) or Redis (Railway overlap-safe deploys).
 *
 * Serialized payload shape matches rooms.json:
 *   { version, savedAt, buildId, rooms: [...] }
 *
 * Redis keys / channels:
 *   holdem:game-state  — JSON payload
 *   holdem:handoff     — pub/sub after the draining instance's final flush
 */

const fs = require("fs");
const path = require("path");

const REDIS_STATE_KEY = "holdem:game-state";
const REDIS_HANDOFF_CHANNEL = "holdem:handoff";

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
      const message = JSON.stringify({ at: new Date().toISOString(), ...meta });
      for (const handler of [...backing.handlers]) {
        try {
          await handler(message);
        } catch (error) {
          console.error("Handoff handler error:", error);
        }
      }
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

function createRedisStateStore(redisUrl, { createClient } = {}) {
  // Lazy require so file-only environments never load the redis package path in tests that mock.
  const redis = createClient ? null : require("redis");
  const makeClient = createClient || redis.createClient;

  const client = makeClient({ url: redisUrl });
  const subscriber = makeClient({ url: redisUrl });
  let connectPromise = null;
  let handoffHandler = null;

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
      await client.publish(
        REDIS_HANDOFF_CHANNEL,
        JSON.stringify({ at: new Date().toISOString(), ...meta }),
      );
    },
    async onHandoff(handler) {
      await ensureConnected();
      handoffHandler = (message) => handler(message);
      await subscriber.subscribe(REDIS_HANDOFF_CHANNEL, handoffHandler);
      return async () => {
        try {
          await subscriber.unsubscribe(REDIS_HANDOFF_CHANNEL);
        } catch {
          // ignore
        }
        handoffHandler = null;
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
  REDIS_HANDOFF_CHANNEL,
  createFileStateStore,
  createMemoryRedisBacking,
  createMemoryStateStore,
  createRedisStateStore,
  createStateStore,
};
