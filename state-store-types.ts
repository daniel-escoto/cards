import type { HandoffMeta, PersistedState } from "./shared/types";

export interface StateStore {
  kind: "file" | "redis";
  filePath?: string;
  // Boundary: redis client shapes vary by injection in tests.
   
  client?: any;
   
  subscriber?: any;
   
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
   
  createClient?: (opts: { url: string }) => any;
  filePath?: string;
}
