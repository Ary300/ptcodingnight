/**
 * Judge worker entrypoint. Delivered in Phase 2.
 *
 * This process consumes jobs from BullMQ and, for each one, spawns a fresh ephemeral
 * container to run the submission. It never executes untrusted code itself — see
 * docs/PRD.md §7 and the isolation flags in CLAUDE.md.
 *
 * The daemon check below is deliberate: a judge worker that starts without Docker would
 * accept jobs it cannot run and fail them as IE, which reads to a student as a broken
 * platform. Refusing to start is the honest failure.
 */

// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { parseServerEnv } from "@/lib/schemas/env";

function main(): never {
  const env = parseServerEnv();

  console.error(
    [
      "Judge worker is not implemented yet (delivered in Phase 2).",
      "",
      `  redis        : ${env.REDIS_URL}`,
      `  concurrency  : ${env.JUDGE_CONCURRENCY}`,
      `  python image : ${env.JUDGE_IMAGE_PYTHON}`,
      `  java image   : ${env.JUDGE_IMAGE_JAVA}`,
      "",
      "Phase 2 delivers: container isolation, verdict aggregation, output comparators.",
    ].join("\n"),
  );
  process.exit(1);
}

main();
