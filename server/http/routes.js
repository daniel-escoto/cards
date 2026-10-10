const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const express = require("express");
const api = require("../api");
require("../config");
require("../runtime");

function registerHttpRoutes() {
  // Serve sw.js with a deploy-scoped cache name so new builds activate cleanly.
  api.app.get("/sw.js", (req, res) => {
    try {
      const source = fs.readFileSync(api.path.join(__dirname, "..", "public", "sw.js"), "utf8");
      res.type("application/javascript").send(source.replaceAll("__BUILD_ID__", api.BUILD_ID));
    } catch (_error) {
      res.status(500).type("text/plain").send("Service worker unavailable");
    }
  });

  api.app.get("/api/build", (_req, res) => {
    res.json({ buildId: api.BUILD_ID });
  });

  /** 200 only after state restore + listen; 503 while booting. */
  api.app.get("/healthz", (_req, res) => {
    if (!api.stateRestored || !api.serverListening) {
      return res.status(503).type("text/plain").send("not ready");
    }
    res.status(200).type("text/plain").send("ok");
  });

  api.app.use(express.static(path.join(__dirname, "..", "public")));
  api.app.use("/shared", express.static(api.path.join(__dirname, "..", "shared")));

  api.app.get("/qr.svg", async (req, res) => {
    const text = String(req.query.text || "").slice(0, 512);
    if (!text) return res.status(400).type("text/plain").send("Missing text");
    try {
      const svg = await QRCode.toString(text, {
        type: "svg",
        margin: 1,
        color: {
          dark: "#0f1619",
          light: "#f7f1e6",
        },
      });
      res.type("image/svg+xml").send(svg);
    } catch (_error) {
      res.status(500).type("text/plain").send("Could not generate QR code");
    }
  });
}

Object.assign(api, { registerHttpRoutes });
module.exports = { registerHttpRoutes };
