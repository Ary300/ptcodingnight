import { assertAuthEnvIsDeployable } from "@/lib/contest/env";

/**
 * The Node-only half of the startup check.
 *
 * Separate from `instrumentation.ts` because Next compiles that file for **both** the Node and
 * the Edge runtime, and statically flags `process.exit` / `process.stderr` in the Edge build —
 * "A Node.js API is used which is not supported in the Edge Runtime", once per rebuild. The
 * `NEXT_RUNTIME` guard is a runtime check and does not quiet a bundler reading the module graph.
 *
 * Keeping the Node APIs behind the dynamic import keeps them out of the Edge graph entirely.
 */

/**
 * Why this exits rather than throwing.
 *
 * Next binds the port before `register()` resolves and turns a rejection here into an
 * `unhandledRejection` it logs and carries on from. Measured: the server stays up and answers
 * **500 on every route**, including `/`. Under `restart: unless-stopped` that is an invisible
 * restart loop; behind a healthcheck it is a container that reports itself unhealthy for a reason
 * buried three stack traces deep.
 *
 * Exiting non-zero makes the failure what it actually is — the deployment did not come up — and
 * puts the operator's next action on the last line of the log.
 */
export function runBootChecks(): void {
  try {
    assertAuthEnvIsDeployable();
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `\n[31mFATAL: refusing to start.[0m\n\n${detail}\n\n` +
        "See docs/DEPLOY.md for the deployed configuration, or docs/AUTH.md §5 for what these\n" +
        "cookie settings protect.\n\n",
    );
    process.exit(1);
  }
}
