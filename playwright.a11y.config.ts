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
  fullyParallel: true,
  forbidOnly: true,
  reporter: "list",
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
