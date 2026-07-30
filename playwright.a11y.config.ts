import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

/**
 * G9 — accessibility. Delivered in Phase 5.
 *
 * Pass condition: axe-core reports zero critical or serious violations on the competitor,
 * problem, and projector views, and the submit flow completes keyboard-only.
 *
 * This is a quality floor, not a feature: the projector is low-contrast and read from the
 * back of a classroom, and students are on phones (docs/PRD.md §11).
 */
export default defineConfig({
  testDir: "./tests/a11y",
  /*
   * Serial, for the same reason G7 is (see playwright.config.ts).
   *
   * These specs used to be read-only against a stub backend, where parallelism was free. They now
   * exercise the real API: each one joins the SAME seeded contest and writes a participant row,
   * and the ones behind the lobby then assign that participant a division and a set. Run in
   * parallel against one contest and one dev server, they contend — and the symptom is a test
   * that passes alone and fails in the suite, which reads as flakiness rather than as contention.
   *
   * The audits themselves are the slow part and they are unaffected; this only stops the setup
   * from racing itself.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: "list",
  /*
   * axe's full ruleset on the competitor problem workspace measured 14-30s on this host,
   * against Playwright's 30s default — so runs were failing on the clock rather than on a
   * violation, which reads identically in the output and is far more misleading.
   *
   * This raises only the time allowed to COMPUTE the audit. The pass condition is unchanged:
   * still zero critical or serious violations. A slow measurement is not a weaker one.
   */
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: process.env.BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
