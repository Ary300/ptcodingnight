import "dotenv/config";

import { missingE2EEnvMessage } from "./helpers/env";

/**
 * Playwright `globalSetup` — refuse to start G7 without the environment it needs.
 *
 * The per-file `requiredEnv` calls would catch this too, but they catch it once per spec file,
 * during collection, interleaved with whatever else is failing. This catches it **once**, before
 * the web server starts, and prints one message naming every missing variable.
 *
 * That difference matters on a freshly built server, which is the case this was written for: the
 * `.env` is new, something is missing from it, and the person reading the output has been at it
 * for an hour. One paragraph naming the variable beats five stack traces.
 */
export default function globalSetup(): void {
  const message = missingE2EEnvMessage();
  if (message !== null) throw new Error(message);
}
