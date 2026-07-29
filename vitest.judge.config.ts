import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * G4 — judge verdict fixtures. Delivered in Phase 2.
 *
 * Pass condition: >=24 fixture submissions covering AC, WA, TLE, MLE, RE, and CE across
 * Python and Java, with 24/24 exact verdict matches. Requires a running Docker daemon;
 * the suite must hard-fail rather than skip if the daemon is absent.
 *
 * `passWithNoTests` is deliberately NOT set. Until the fixtures exist this exits non-zero,
 * which reports honestly as NOT RUN instead of a vacuous PASS.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/judge/**/*.test.ts"],
    /*
     * Generous by necessity, not by hedging. A TLE fixture must actually burn its full
     * wall-clock kill on every test case before the verdict is known: for Java that is
     * 3 x (2000ms x 2 + 8000ms startup budget) = 36s per case, three cases, plus container
     * startup. Proving a timeout takes time by definition.
     */
    testTimeout: 600_000,
    hookTimeout: 180_000,
  },
});
