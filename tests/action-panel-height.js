#!/usr/bin/env node
/**
 * Control panel height must stay equal on your turn vs waiting (375 + 1280).
 * Off-turn keeps the Fold/Call + raise shell mounted (disabled); heroHand has no title tooltip.
 */
/* eslint-disable no-undef -- page.evaluate callbacks run in the browser (document/state). */
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const CHROME =
  process.env.CHROME_PATH ||
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  "/usr/local/bin/google-chrome";

async function waitForServer(port, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited early (${child.exitCode})`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}

async function measureAtViewport(browser, baseUrl, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.fill("#nameInput", "Daniel");
  await page.click("#tableActionBtn");
  await page.waitForSelector("#tableView:not(.hidden)");

  // Add bots and ready until a hand is live.
  for (let i = 0; i < 3; i += 1) {
    const add = page.locator("#gameButtons button.lobby-add-bot");
    if (await add.count()) await add.first().click();
    await page.waitForTimeout(80);
  }
  const ready = page.locator('#gameButtons button:has-text("Ready")');
  if (await ready.count()) await ready.first().click();

  await page.waitForFunction(
    () => {
      const room = typeof state !== "undefined" ? state : null;
      const phase = room?.phase || "";
      const panel = document.querySelector("#tableView .control-panel");
      return panel && room && !["lobby", "complete", "gameover"].includes(phase);
    },
    null,
    { timeout: 20000 },
  );

  async function snapshot() {
    return page.evaluate(() => {
      const room = typeof state !== "undefined" ? state : null;
      const panel = document.querySelector("#tableView .control-panel");
      const bet = document.querySelector("#betControls");
      const presets = document.querySelector("#betPresets");
      const heroHand = document.querySelector("#heroHand");
      const buttons = [...document.querySelectorAll("#gameButtons > button")].map((b) => ({
        text: (b.textContent || "").trim(),
        disabled: b.disabled,
        ariaDisabled: b.getAttribute("aria-disabled"),
      }));
      return {
        height: panel ? Math.round(panel.getBoundingClientRect().height) : 0,
        yourTurn: Boolean(room?.isYourTurn),
        betReserved: bet?.classList.contains("is-reserved") || false,
        compact: panel?.classList.contains("is-compact") || false,
        presetCount: presets ? presets.querySelectorAll("button").length : 0,
        presetLabels: presets
          ? [...presets.querySelectorAll("button")].map((b) => (b.textContent || "").trim())
          : [],
        buttons,
        heroTitle: heroHand?.getAttribute("title"),
        phase: room?.phase || "",
      };
    });
  }

  // Wait until we see either your-turn with raise presets, or off-turn with disabled presets.
  let onTurn = null;
  let offTurn = null;
  for (let i = 0; i < 120; i += 1) {
    const snap = await snapshot();
    if (snap.heroTitle) {
      assert.equal(snap.heroTitle, null, "heroHand must not set a native title tooltip");
    }
    if (snap.yourTurn && snap.presetCount >= 1 && !snap.compact) {
      onTurn = snap;
    }
    if (!snap.yourTurn && snap.presetCount >= 1 && !snap.compact && snap.buttons.some((b) => b.disabled)) {
      offTurn = snap;
    }
    if (onTurn && offTurn) break;

    // If it's our turn with a Call/Check, take the passive action so we can measure off-turn.
    if (snap.yourTurn) {
      const callOrCheck = page.locator(
        '#gameButtons > button:not(.danger):not(:disabled)',
      );
      if (await callOrCheck.count()) {
        await callOrCheck.first().click();
        await page.waitForTimeout(200);
        continue;
      }
    }
    await page.waitForTimeout(150);
  }

  assert.ok(onTurn, `expected an on-turn raise shell at ${viewport.width}x${viewport.height}`);
  assert.ok(offTurn, `expected an off-turn disabled raise shell at ${viewport.width}x${viewport.height}`);
  assert.equal(
    onTurn.height,
    offTurn.height,
    `panel height on-turn (${onTurn.height}) vs off-turn (${offTurn.height}) at ${viewport.width}`,
  );
  assert.ok(
    offTurn.buttons.every((b) => b.disabled && b.ariaDisabled === "true"),
    "off-turn action buttons must be disabled + aria-disabled",
  );
  assert.equal(offTurn.heroTitle, null);
  assert.equal(onTurn.heroTitle, null);

  await page.close();
  return { onTurn, offTurn };
}

async function main() {
  // Prefer a free port; avoid colliding with a local 3055/3056.
  const port = 3100 + Math.floor(Math.random() * 200);
  const child = spawn("node", [path.join(root, "dist/server.js")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      CPU_ACTION_DELAY_MS: "400",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += String(d);
  });
  try {
    await waitForServer(port, child);
    const browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const baseUrl = `http://127.0.0.1:${port}`;
      await measureAtViewport(browser, baseUrl, { width: 375, height: 812 });
      await measureAtViewport(browser, baseUrl, { width: 1280, height: 800 });
    } finally {
      await browser.close();
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    if (!child.killed) child.kill("SIGKILL");
  }
  if (stderr && /Error|EADDRINUSE/.test(stderr)) {
    console.error(stderr);
  }
  console.log("Action panel height stable on/off turn at 375 and 1280.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
