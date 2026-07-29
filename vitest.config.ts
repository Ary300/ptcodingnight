import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * G3 — the unit suite.
 *
 * Coverage thresholds are deliberately scoped to the two directories where correctness is
 * load-bearing: lib/scoring/ and lib/judge/. PRD §12 requires >=90% line coverage there.
 * Lowering these numbers to get a gate green is forbidden (docs/KICKOFF.md).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "worker/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**", "tests/a11y/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/scoring/**", "lib/judge/**"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
