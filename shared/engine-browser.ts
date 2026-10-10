/**
 * Browser bundle entry — esbuild emits IIFE `HoldemEngine` for /shared/engine.js.
 * Relies on /shared/pokersolver.js having already set global `Hand`.
 */
import { createHoldemEngine } from "./create-holdem-engine";

if (typeof Hand === "undefined" || typeof Hand.solve !== "function") {
  throw new Error("HoldemEngine requires pokersolver Hand");
}

const engine = createHoldemEngine(Hand);
export default engine;
