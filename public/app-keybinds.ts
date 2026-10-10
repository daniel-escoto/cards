(function (
  root: typeof globalThis & { HoldemKeybinds?: HoldemKeybindsAPI },
  factory: () => HoldemKeybindsAPI,
) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HoldemKeybinds = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis), function () {
  "use strict";

  const KEYBIND_DEFINITIONS = [
    { id: "fold", label: "Fold", defaultKey: "f" },
    { id: "call", label: "Check / call / ready up", defaultKey: "c" },
    { id: "raise", label: "Bet / raise", defaultKey: "r" },
    { id: "raiseUp", label: "Increase bet", defaultKey: "ArrowUp", defaultAliases: ["ArrowRight"] },
    {
      id: "raiseDown",
      label: "Decrease bet",
      defaultKey: "ArrowDown",
      defaultAliases: ["ArrowLeft"],
    },
    { id: "showHand", label: "Show hand", defaultKey: "h" },
    { id: "menu", label: "Table menu", defaultKey: "m" },
  ];
  const DEFAULT_KEYBINDS = Object.fromEntries(
    KEYBIND_DEFINITIONS.map((item) => [item.id, item.defaultKey]),
  );
  const DEFAULT_KEYBIND_ALIASES = Object.fromEntries(
    KEYBIND_DEFINITIONS.map((item) => [item.id, [...(item.defaultAliases || [])]]),
  );

  function normalizedKey(key: string | undefined) {
    if (key === " " || key === "Spacebar") return "Space";
    return key?.length === 1 ? key.toLowerCase() : key;
  }

  function loadKeybinds() {
    try {
      const saved = JSON.parse(localStorage.getItem("holdem:keybinds") || "null");
      if (!saved || typeof saved !== "object") return { ...DEFAULT_KEYBINDS };
      const next = { ...DEFAULT_KEYBINDS };
      KEYBIND_DEFINITIONS.forEach(({ id }) => {
        if (typeof saved[id] === "string" && saved[id]) next[id] = normalizedKey(saved[id]) || saved[id];
      });
      return next;
    } catch {
      return { ...DEFAULT_KEYBINDS };
    }
  }

  function keybindLabel(key: string | undefined) {
    return (
      (
        {
          Space: "Space",
          ArrowUp: "↑",
          ArrowDown: "↓",
          ArrowLeft: "←",
          ArrowRight: "→",
          Enter: "Enter",
          Backspace: "⌫",
          Delete: "Del",
        } as Record<string, string>
      )[key || ""] || (key?.length === 1 ? key.toUpperCase() : key)
    );
  }

  function activeKeybindAliases(keybinds: KeybindMap, action: string) {
    const claimed = new Set(Object.values(keybinds));
    return (DEFAULT_KEYBIND_ALIASES[action] || []).filter((key) => !claimed.has(key));
  }

  function keysForAction(keybinds: KeybindMap, action: string) {
    return [
      ...new Set([keybinds[action], ...activeKeybindAliases(keybinds, action)].filter(Boolean)),
    ];
  }

  function keybindDisplay(keybinds: KeybindMap, action: string) {
    return keysForAction(keybinds, action).map(keybindLabel).join(" / ");
  }

  function saveKeybinds(keybinds: KeybindMap) {
    localStorage.setItem("holdem:keybinds", JSON.stringify(keybinds));
  }

  function matchesKeybind(event: KeyboardEvent, keybinds: KeybindMap, action: string) {
    return keysForAction(keybinds, action).includes(normalizedKey(event.key) || "");
  }

  function assignKeybindState(keybinds: KeybindMap, action: string, key: string) {
    const previousKey = keybinds[action];
    const conflictAction = Object.keys(keybinds).find(
      (id) => id !== action && keybinds[id] === key,
    );
    const next = { ...keybinds, [action]: key };
    if (conflictAction) next[conflictAction] = previousKey;
    return { keybinds: next, conflictAction: conflictAction || null };
  }

  return {
    KEYBIND_DEFINITIONS,
    DEFAULT_KEYBINDS,
    DEFAULT_KEYBIND_ALIASES,
    normalizedKey,
    loadKeybinds,
    keybindLabel,
    activeKeybindAliases,
    keysForAction,
    keybindDisplay,
    saveKeybinds,
    matchesKeybind,
    assignKeybindState,
  };
});
