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
    // Containers are slow; a per-fixture judge run needs far more than the 5s default.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
