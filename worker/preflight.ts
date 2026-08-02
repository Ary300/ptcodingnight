import { RUNTIMES, type RuntimeId } from "@/lib/judge/runtimes";
import { imageExists } from "@/worker/docker";
import type { ImageOverrides } from "@/worker/runner";

/**
 * The worker's boot check: every image the registry names must exist locally BEFORE the worker
 * consumes a single job.
 *
 * Why this is a startup refusal and not a per-job error: a worker missing an image does not fail
 * loudly at boot on its own. It accepts every submission for that runtime and fails each one as
 * IE at run time, one retry apiece, while the student watches a spinner. On this machine a
 * submission has already sat 12 minutes in Redis for the sibling failure (no worker at all), so
 * the shape of the mistake is known: silence now, latency later. One `docker image inspect` per
 * image at boot converts that into an error message with the fix in it.
 *
 * Split pure/impure so the interesting parts are unit-testable without a daemon:
 * `requiredImages` and `describeMissingImages` are pure; `findMissingImages` takes the probe as
 * an argument and only defaults to the real `docker image inspect`.
 */

/**
 * Every image this worker will actually run, after env overrides — deduped, in registry order.
 *
 * Overrides are applied per RuntimeId exactly as `worker/index.ts` builds them, because checking
 * the registry's image while the worker runs an overridden one would prove the wrong image
 * exists.
 */
export function requiredImages(overrides: ImageOverrides): readonly string[] {
  const images = (Object.keys(RUNTIMES) as RuntimeId[]).map(
    (id) => overrides[id] ?? RUNTIMES[id].image,
  );
  // Two runtimes could legitimately share an image via overrides; inspect each once.
  return [...new Set(images)];
}

/** Which of the required images are absent from the local daemon. Never pulls. */
export async function findMissingImages(
  required: readonly string[],
  exists: (image: string) => Promise<boolean> = imageExists,
): Promise<readonly string[]> {
  const present = await Promise.all(required.map((image) => exists(image)));
  return required.filter((_, index) => !present[index]);
}

/**
 * The refusal message, with the fix in it.
 *
 * Names the command rather than describing it: the person reading this is starting a worker,
 * possibly at 6pm on the night, and "prepare the images" without the exact invocation is a
 * documentation scavenger hunt at the worst possible moment.
 */
export function describeMissingImages(missing: readonly string[]): string {
  return [
    `The judge worker refuses to start: ${String(missing.length)} runtime image(s) named in`,
    "lib/judge/runtimes.ts are not present on this host:",
    ...missing.map((image) => `  - ${image}`),
    "",
    "Build and verify them first:",
    "  scripts/build-judge-images.sh --verify",
    "",
    "A worker without its images would accept every submission for those runtimes and fail",
    "each one as IE at run time, which reads to a student as a broken platform.",
  ].join("\n");
}
