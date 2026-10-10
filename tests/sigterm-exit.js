/**
 * Process-level check: SIGTERM to `node dist/server.js` must exit 0 after drain.
 * Railway emails "Deploy Crashed" when the start command exits non-zero; npm wraps
 * node and turns SIGTERM into a failed exit — production uses `node dist/server.js`
 * directly (see railway.json).
 */
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SERVER_ENTRY = path.join(ROOT, "dist", "server.js");
assert.ok(fs.existsSync(SERVER_ENTRY), "Run npm run build before this test");

const PORT = 3100 + (process.pid % 500);
const STATE_PATH = path.join(os.tmpdir(), `cards-sigterm-exit-${process.pid}.json`);
try {
  fs.unlinkSync(STATE_PATH);
} catch {
  // ignore
}

function waitForHealthz(url, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error(`healthz status ${res.statusCode}`));
          return;
        }
        setTimeout(attempt, 50);
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error("healthz never became ready"));
          return;
        }
        setTimeout(attempt, 50);
      });
    };
    attempt();
  });
}

(async () => {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      GAME_STATE_FILE: STATE_PATH,
      // Keep drain snappy for the test; no Redis.
      DEPLOY_HAND_WAIT_MS: "500",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitPromise = new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });

  try {
    await waitForHealthz(`http://127.0.0.1:${PORT}/healthz`);
  } catch (error) {
    child.kill("SIGKILL");
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`healthz wait failed: ${detail}\nstdout:\n${stdout}\nstderr:\n${stderr}`, {
      cause: error,
    });
  }

  child.kill("SIGTERM");

  const { code, signal } = await Promise.race([
    exitPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("server did not exit after SIGTERM")), 15000),
    ),
  ]);

  assert.equal(
    signal,
    null,
    `expected clean exit after SIGTERM, got signal ${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
  assert.equal(
    code,
    0,
    `SIGTERM drain must exit 0 (got ${code})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
  assert.match(stdout, /Received SIGTERM/, "gracefulShutdown should log SIGTERM");

  console.log("SIGTERM process exit checks passed.");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.unlinkSync(STATE_PATH);
    } catch {
      // ignore
    }
  });
