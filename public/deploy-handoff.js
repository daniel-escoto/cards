/**
 * Deploy / reconnect helpers shared by the browser client and Node tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DeployHandoff = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ACTIVE_HAND_PHASES = new Set(["preflop", "flop", "turn", "river", "showdown"]);

  function isActiveHandPhase(phase) {
    return ACTIVE_HAND_PHASES.has(String(phase || ""));
  }

  /**
   * Reload only when the server build differs and the player is not mid-hand.
   * Safe between hands (lobby / complete / gameover) or when no phase is active.
   */
  function shouldReloadForNewBuild({ clientBuildId, serverBuildId, phase } = {}) {
    if (!clientBuildId || !serverBuildId) return false;
    if (String(clientBuildId) === String(serverBuildId)) return false;
    return !isActiveHandPhase(phase);
  }

  return {
    ACTIVE_HAND_PHASES,
    isActiveHandPhase,
    shouldReloadForNewBuild,
  };
});
