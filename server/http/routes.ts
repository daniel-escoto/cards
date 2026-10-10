import fs = require("fs");
import path = require("path");
import QRCode = require("qrcode");
import express = require("express");
import type { Request, Response } from "express";
import api = require("../api");
import "../config";
import "../runtime";

function registerHttpRoutes(): void {
  // Compiled to dist/server/http/; static assets are emitted beside it under dist/.
  const publicDir = path.join(__dirname, "..", "..", "public");
  const sharedDir = path.join(__dirname, "..", "..", "shared");

  // Serve sw.js with a deploy-scoped cache name so new builds activate cleanly.
  api.app.get("/sw.js", (_req: Request, res: Response) => {
    try {
      const source = fs.readFileSync(path.join(publicDir, "sw.js"), "utf8");
      res.type("application/javascript").send(source.replaceAll("__BUILD_ID__", api.BUILD_ID));
    } catch (_error) {
      res.status(500).type("text/plain").send("Service worker unavailable");
    }
  });

  api.app.get("/api/build", (_req: Request, res: Response) => {
    res.json({ buildId: api.BUILD_ID });
  });

  /** 200 only after state restore + listen; 503 while booting. */
  api.app.get("/healthz", (_req: Request, res: Response): void => {
    if (!api.stateRestored || !api.serverListening) {
      res.status(503).type("text/plain").send("not ready");
      return;
    }
    res.status(200).type("text/plain").send("ok");
  });

  api.app.use(express.static(publicDir));
  api.app.use("/shared", express.static(sharedDir));

  api.app.get("/qr.svg", async (req: Request, res: Response): Promise<void> => {
    const text = String(req.query.text || "").slice(0, 512);
    if (!text) {
      res.status(400).type("text/plain").send("Missing text");
      return;
    }
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
export = { registerHttpRoutes };
