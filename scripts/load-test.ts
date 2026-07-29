/**
 * G8 — load. Delivered in Phase 4.
 *
 * Pass condition (docs/PRD.md §12): 40 concurrent submissions, zero dropped jobs, zero `IE`
 * verdicts, p95 verdict latency under 10 seconds. That number comes from how a Coding Night
 * actually ends — 20 to 40 people all submitting in the last minutes.
 *
 * Until the judge and the submission API exist this exits non-zero, reporting honestly as
 * NOT RUN rather than a vacuous pass.
 */

const TARGET_CONCURRENT_SUBMISSIONS = 40;
const P95_LATENCY_BUDGET_MS = 10_000;

function main(): never {
  console.error(
    [
      "G8 load test is not implemented yet (delivered in Phase 4).",
      "",
      `  target concurrency : ${TARGET_CONCURRENT_SUBMISSIONS} submissions`,
      `  p95 budget         : ${P95_LATENCY_BUDGET_MS} ms`,
      "  pass condition     : zero dropped jobs, zero IE verdicts",
      "",
      "Requires: judge worker (Phase 2), submissions API (Phase 4), running Docker daemon.",
    ].join("\n"),
  );
  process.exit(1);
}

main();
