import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * G5 — hostile submission containment. Delivered in Phase 2.
 *
 * Pass condition: every hostile fixture (outbound network call, fork bomb, 10 GB
 * allocation, /etc/passwd read, host FS write, infinite loop, 1 GB stdout flood) is
 * contained, returns the correct verdict, and `docker ps -a` returns to its baseline count
 * with no leaked containers.
 *
 * If this gate fails, all other work stops. A leaky sandbox invalidates the entire project
 * (docs/KICKOFF.md Phase 2).
 *
 * Runs single-threaded: these fixtures deliberately exhaust host resources, and running
 * them concurrently makes a failure impossible to attribute.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/sandbox/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
  },
});
