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

  function isProductionInviteHost(hostname: unknown) {
    const host = String(hostname || "").toLowerCase();
    if (!host) return false;
    if (host === "holdem.nyc" || host === "www.holdem.nyc") return true;
    if (host === "floproom.com" || host === "www.floproom.com") return true;
    if (host.endsWith(".up.railway.app")) return true;
    return false;
  }

  /**
   * Build a shareable invite link for a room.
   * Production hosts always use https://holdem.nyc/?room=CODE.
   * Local/dev hosts keep the current origin (and pathname), with only the room param.
   *
   * @param {string} roomId
   * @param {{ hostname?: string, origin?: string, pathname?: string } | string} [locationLike]
   *        Browser Location-like object, or a hostname string for tests.
   */
  function canonicalInviteUrl(roomId: unknown, locationLike?: InviteLocationLike | string) {
    const code = String(roomId || "");
    const loc = normalizeLocation(locationLike);
    if (isProductionInviteHost(loc.hostname)) {
      return `${CANONICAL_ORIGIN}/?room=${encodeURIComponent(code)}`;
    }
    const path = loc.pathname || "/";
    const url = new URL(path, loc.origin || "http://localhost/");
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", code);
    return url.toString();
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
    isProductionInviteHost,
    canonicalInviteUrl,
  };
});
