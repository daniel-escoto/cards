#!/usr/bin/env node
/**
 * Run every tests/*.js file except smoke.js (and this runner).
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const testsDir = __dirname;
const skip = new Set(["smoke.js", "run-all.js"]);
const files = fs
  .readdirSync(testsDir)
  .filter((name) => name.endsWith(".js") && !skip.has(name))
  .sort();

if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const fullPath = path.join(testsDir, file);
  console.log(`\n=== ${file} ===`);
  const result = spawnSync(process.execPath, [fullPath], {
    stdio: "inherit",
    // Real CPU think time is 0.5-4s; keep the suite fast unless a test overrides it.
    env: { CPU_ACTION_DELAY_MS: "20", ...process.env },
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`${file} failed (exit ${result.status ?? "null"})`);
  }
}

console.log(`\n${files.length - failed}/${files.length} test files passed.`);
process.exit(failed === 0 ? 0 : 1);
