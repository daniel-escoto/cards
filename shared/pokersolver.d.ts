/**
 * Ambient typings for the vendored pokersolver UMD/CJS build.
 * Models the Hand.solve / Hand.winners surface used by the engine.
 */

declare namespace PokerSolver {
  export interface SolvedHand {
    name: string;
    descr: string;
    rank: number;
    score: number;
    cards: string[];
  }

  export interface HandConstructor {
    solve(cards: string[], game?: string): SolvedHand;
    winners(hands: SolvedHand[]): SolvedHand[];
  }

  export const Hand: HandConstructor;
}

export = PokerSolver;

declare global {
  // Browser script-tag global from /shared/pokersolver.js
  // eslint-disable-next-line no-var
  var Hand: PokerSolver.HandConstructor;
}
