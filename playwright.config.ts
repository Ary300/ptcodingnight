import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

/**
 * G7 — end-to-end. Delivered in Phase 4.
 *
 * The required journey (docs/PRD.md §12): join -> read problem -> run samples -> submit ->
 * live verdict -> leaderboard updates -> freeze hides changes -> admin unfreezes -> admin
 * exports CSV.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  /*
   * Serial, and not for want of trying to parallelise it.
   *
   * Every spec seeds the SAME contest fixture into the SAME Postgres, because that is what an
   * end-to-end test of one contest means. Run in parallel, one worker deletes the fixture's
   * problems while another still has ContestProblem rows pointing at them, and Postgres
   * correctly refuses: `ContestProblem_problemId_fkey`. That is a real constraint doing its
   * job, not flakiness to be retried away.
   *
   * The alternative — a database per worker — buys speed this suite does not need and adds a
   * schema-migration step per worker that could itself drift.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      // Students use phones (PRD §11) — but only the BROWSER specs care which browser they
      // are in. Running the `.api.spec.ts` files under a second device profile tests the same
      // HTTP handlers twice, doubles the contention on the one seeded contest, and doubles the
      // container work in the judged specs.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testIgnore: /\.api\.spec\.ts$/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: process.env.BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
