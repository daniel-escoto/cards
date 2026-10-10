#!/usr/bin/env node
/**
 * Build holdem.nyc → dist/
 * 1) tsc emits server/shared/public JS
 * 2) copy Node engine to engine.node.js; esbuild browser IIFE → engine.js
 * 3) copy vendored pokersolver + static public assets
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyIfExists(src, dest) {
  if (fs.existsSync(src)) copyFile(src, dest);
}

fs.rmSync(dist, { recursive: true, force: true });

run(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"]);

// Node CJS engine (export=) — keep for tests / practice require
copyFile(path.join(dist, "shared/engine.js"), path.join(dist, "shared/engine.node.js"));

// Browser IIFE served at /shared/engine.js (script tag + SW precache)
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "shared/engine-browser.ts")],
  outfile: path.join(dist, "shared/engine.js"),
  bundle: true,
  format: "iife",
  globalName: "HoldemEngine",
  platform: "browser",
  target: ["es2022"],
  logLevel: "info",
});

copyFile(path.join(root, "shared/pokersolver.js"), path.join(dist, "shared/pokersolver.js"));

const staticFiles = ["index.html", "styles.css", "icon.svg", "manifest.webmanifest"];
for (const name of staticFiles) {
  copyIfExists(path.join(root, "public", name), path.join(dist, "public", name));
}

copyIfExists(path.join(root, "package.json"), path.join(dist, "package.json"));

console.log("Build complete → dist/");
