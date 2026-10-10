import type { HandoffMeta, PersistedState } from "./shared/types";

/** Minimal Redis client surface used by createRedisStateStore. */
export interface RedisClientLike {
  isOpen: boolean;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  subscribe(channel: string, listener: (message: string) => void): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

export type RedisCreateClient = (opts: { url: string }) => RedisClientLike;

export interface StateStore {
  kind: "file" | "redis";
  filePath?: string;
  client?: RedisClientLike;
  subscriber?: RedisClientLike;
  backing?: MemoryRedisBacking;
  load(): Promise<PersistedState | null>;
  save(payload: PersistedState): Promise<void>;
  publishHandoff(meta?: Record<string, unknown>): Promise<void>;
  readHandoff(): Promise<HandoffMeta | null>;
  onHandoff(handler: (message: string) => void | Promise<void>): Promise<() => void | Promise<void>>;
  close(): Promise<void>;
}

export interface MemoryRedisBacking {
  value: PersistedState | null;
  handoff: HandoffMeta | null;
  handlers: Set<(message: string) => void | Promise<void>>;
}

export interface CreateStateStoreOptions {
  store?: StateStore;
  memoryBacking?: MemoryRedisBacking;
  redisUrl?: string;
  createClient?: RedisCreateClient;
  filePath?: string;
}
