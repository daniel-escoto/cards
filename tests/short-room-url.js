#!/usr/bin/env node
/**
 * Short room URL route: GET /{CODE} serves index.html without shadowing statics.
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

// Minimal express app mirroring route registration order from server/http/routes.ts
const express = require("express");
const app = express();
const publicDir = path.join(__dirname, "../dist/public");
const sharedDir = path.join(__dirname, "../dist/shared");

app.get("/sw.js", (_req, res) => {
  res.type("application/javascript").send("// sw");
});
app.get("/api/build", (_req, res) => {
  res.json({ buildId: "test" });
});
app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok");
});
app.use(express.static(publicDir));
app.use("/shared", express.static(sharedDir));
app.get("/trainer", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});
app.get("/:code", (req, res, next) => {
  const code = String(req.params.code || "");
  if (!/^[A-Za-z0-9]{6}$/i.test(code)) {
    next();
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"));
});
app.get("/qr.svg", (_req, res) => {
  res.type("image/svg+xml").send("<svg></svg>");
});

const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");

function request(server, urlPath) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    http
      .get({ hostname: "127.0.0.1", port, path: urlPath }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      })
      .on("error", reject);
  });
}

async function main() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const shell = await request(server, "/LL3RJF");
    assert.equal(shell.status, 200);
    assert.match(shell.headers["content-type"] || "", /html/);
    assert.equal(shell.body, indexHtml);

    const lower = await request(server, "/ll3rjf");
    assert.equal(lower.status, 200);
    assert.equal(lower.body, indexHtml);

    const trainer = await request(server, "/trainer");
    assert.equal(trainer.status, 200);
    assert.equal(trainer.body, indexHtml);

    const css = await request(server, "/styles.css");
    assert.equal(css.status, 200);
    assert.match(css.headers["content-type"] || "", /css/);
    assert.notEqual(css.body, indexHtml);

    const sw = await request(server, "/sw.js");
    assert.equal(sw.status, 200);
    assert.match(sw.body, /sw/);

    const api = await request(server, "/api/build");
    assert.equal(api.status, 200);
    assert.match(api.body, /buildId/);

    const qr = await request(server, "/qr.svg");
    assert.equal(qr.status, 200);
    assert.match(qr.body, /svg/);

    const tooShort = await request(server, "/ABC");
    assert.equal(tooShort.status, 404);

    const tooLong = await request(server, "/ABCDEFG");
    assert.equal(tooLong.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("Short room URL route checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
