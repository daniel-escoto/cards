/**
 * Ambient typings for the vendored pokersolver UMD build.
 * The implementation stays as plain JS — rewriting it is riskier than typing the surface we use.
 */

export interface SolvedHand {
  name: string;
  descr: string;
  rank: number;
  score: number;
  cards: string[];
  // Boundary: pokersolver attaches additional fields we do not model.
   
  [key: string]: any;
}

export interface HandConstructor {
  solve(cards: string[], game?: string): SolvedHand;
  winners(hands: SolvedHand[]): SolvedHand[];
}

export const Hand: HandConstructor;

declare global {
  // Browser script-tag global from /shared/pokersolver.js
   
  var Hand: HandConstructor;
}

export {};
