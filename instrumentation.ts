/**
 * Next runs `register()` once per server process, before the first request is served.
 *
 * This exists so that a misconfigured production deployment **stops** rather than failing at the
 * first sign-in. The distinction matters on a contest night: a server that boots and serves the
 * join page looks healthy, and the fault surfaces as forty students unable to log in at once, at
 * the moment nobody has time to read a stack trace.
 *
 * The checks themselves live in `lib/contest/boot-check.ts`. Next compiles this file for the Edge
 * runtime as well as Node, and a `process.exit` sitting here is flagged on every rebuild — so the
 * Node APIs stay behind the dynamic import, out of the Edge module graph.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runBootChecks } = await import("@/lib/contest/boot-check");
  runBootChecks();
}
