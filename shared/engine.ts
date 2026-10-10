/**
 * Node entry: `require("./engine")` / `import engine = require("./engine")` yields the engine API.
 * Browser loads the esbuild IIFE from engine-browser.ts (overwrites dist/shared/engine.js).
 */
import { createHoldemEngine, type HoldemEngine } from "./create-holdem-engine";
import PokerSolver = require("./pokersolver");

export type { HoldemEngine };
export { createHoldemEngine };

function isHandConstructor(value: unknown): value is PokerSolver.HandConstructor {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  if (!("solve" in value) || !("winners" in value)) return false;
  return typeof value.solve === "function" && typeof value.winners === "function";
}

function readPokersolverHand(): PokerSolver.HandConstructor {
  const mod: unknown = PokerSolver;
  if (typeof mod !== "object" || mod === null || !("Hand" in mod)) {
    throw new Error("pokersolver module missing Hand");
  }
  const Hand = (mod as { Hand: unknown }).Hand;
  if (!isHandConstructor(Hand)) {
    throw new Error("pokersolver Hand missing solve/winners");
  }
  return Hand;
}

const engine: HoldemEngine = createHoldemEngine(readPokersolverHand());

export = engine;
