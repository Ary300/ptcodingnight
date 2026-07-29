import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * G6 — golden standings replay. Delivered in Phase 3.
 *
 * Pass condition: replays the reconstructed past contest (2 divisions x 3 difficulty slots
 * x 4 participants, from docs/PRD.md Appendix A) and matches
 * fixtures/expected-standings.json byte-for-byte, and replaying twice produces identical
 * output.
 *
 * Needs no Docker and no database — lib/scoring/ is pure, so this gate is runnable the
 * moment the engine exists.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/scoring/**/*.golden.test.ts"],
  },
});
