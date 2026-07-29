import type { NextResponse } from "next/server";

import { RunSamplesRequestSchema, RunSamplesResponseSchema } from "@/lib/schemas/api";
import { NO_STORE, handle, jsonOk, readJson } from "@/lib/contest/http";
import { runSamples } from "@/lib/contest/submissions";
import { requireCompetitor, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/run-samples` — free, unjudged, and it creates no `Submission` (docs/PRD.md §9.1).
 *
 * Same sandbox, same queue, same isolation. What differs is that nothing is persisted and no
 * attempt is spent, so a student can iterate on the samples without paying a penalty for it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The wait is bounded in `runSamples`; this keeps the platform from cutting it short first. */
export const maxDuration = 120;

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const viewer = requireCompetitor(viewerFromRequest(request, now));
    const input = await readJson(request, RunSamplesRequestSchema);

    const result = await runSamples(input, viewer, now);
    return jsonOk(RunSamplesResponseSchema.parse(result), NO_STORE);
  });
}
