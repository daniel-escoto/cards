/**
 * Node entry: `require("./engine")` yields the engine API (copied to engine.node.js at build).
 * Browser loads the esbuild IIFE from engine-browser.ts at /shared/engine.js.
 */
import { createHoldemEngine, type HoldemEngine } from "./create-holdem-engine";
import PokerSolver = require("./pokersolver");

function isHandConstructor(value: unknown): value is PokerSolver.HandConstructor {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  if (!("solve" in value) || !("winners" in value)) return false;
  return typeof value.solve === "function" && typeof value.winners === "function";
}

function readPokersolverHand(): PokerSolver.HandConstructor {
  if (!isHandConstructor(PokerSolver.Hand)) {
    throw new Error("pokersolver Hand missing solve/winners");
  }
  return PokerSolver.Hand;
}

const engine: HoldemEngine = createHoldemEngine(readPokersolverHand());

export = engine;
