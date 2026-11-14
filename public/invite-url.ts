(function (
  root: typeof globalThis & { InviteUrl?: InviteUrlAPI },
  factory: () => InviteUrlAPI,
) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.InviteUrl = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (this as typeof globalThis), function () {
  "use strict";

  const CANONICAL_ORIGIN = "https://holdem.nyc";
  /** 6-char room codes (nanoid alphabet is a subset of A-Z0-9). */
  const ROOM_CODE_PATH = /^\/([A-Za-z0-9]{6})\/?$/;

  function isProductionInviteHost(hostname: unknown) {
    const host = String(hostname || "").toLowerCase();
    if (!host) return false;
    if (host === "holdem.nyc" || host === "www.holdem.nyc") return true;
    if (host === "floproom.com" || host === "www.floproom.com") return true;
    if (host.endsWith(".up.railway.app")) return true;
    return false;
  }

  function normalizeRoomCode(value: unknown): string {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  /** Extract a 6-char room code from a pathname like `/LL3RJF`. */
  function roomCodeFromPath(pathname: unknown): string {
    const match = ROOM_CODE_PATH.exec(String(pathname || ""));
    if (!match) return "";
    return normalizeRoomCode(match[1]);
  }

  function isRoomCodePath(pathname: unknown): boolean {
    return roomCodeFromPath(pathname).length === 6;
  }

  /**
   * Build a shareable invite link for a room.
   * Production hosts always use https://holdem.nyc/{CODE}.
   * Local/dev hosts keep the current origin with /{CODE}.
   *
   * @param {string} roomId
   * @param {{ hostname?: string, origin?: string, pathname?: string } | string} [locationLike]
   *        Browser Location-like object, or a hostname string for tests.
   */
  function canonicalInviteUrl(roomId: unknown, locationLike?: InviteLocationLike | string) {
    const code = normalizeRoomCode(roomId);
    const loc = normalizeLocation(locationLike);
    if (isProductionInviteHost(loc.hostname)) {
      return `${CANONICAL_ORIGIN}/${encodeURIComponent(code)}`;
    }
    const origin = String(loc.origin || "http://localhost").replace(/\/$/, "");
    return `${origin}/${code}`;
  }

  function normalizeLocation(locationLike?: InviteLocationLike | string | null) {
    if (locationLike == null) {
      if (typeof window !== "undefined" && window.location) {
        return {
          hostname: window.location.hostname,
          origin: window.location.origin,
          pathname: window.location.pathname,
        };
      }
      return { hostname: "localhost", origin: "http://localhost", pathname: "/" };
    }
    if (typeof locationLike === "string") {
      // Allow tests to pass a bare hostname.
      if (!locationLike.includes("://")) {
        return {
          hostname: locationLike,
          origin: `https://${locationLike}`,
          pathname: "/",
        };
      }
      const parsed = new URL(locationLike);
      return {
        hostname: parsed.hostname,
        origin: parsed.origin,
        pathname: parsed.pathname,
      };
    }
    return {
      hostname: locationLike.hostname || "",
      origin: locationLike.origin || "http://localhost",
      pathname: locationLike.pathname || "/",
    };
  }

  return {
    CANONICAL_ORIGIN,
    ROOM_CODE_PATH,
    isProductionInviteHost,
    normalizeRoomCode,
    roomCodeFromPath,
    isRoomCodePath,
    canonicalInviteUrl,
  };
});
