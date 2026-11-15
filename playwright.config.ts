import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: "tests/visual/baselines/{arg}{ext}",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      // Allow sub-pixel AA noise; intentional UI changes must still fail.
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    colorScheme: "dark",
    deviceScaleFactor: 1,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
