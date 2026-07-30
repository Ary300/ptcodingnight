import type { NextResponse } from "next/server";

import { NO_STORE, SubmissionIdParamsSchema, handle, jsonOk, readParams } from "@/lib/contest/http";
import { getSubmissionView } from "@/lib/contest/submissions";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/submissions/{id}` — one submission's verdict and per-test detail.
 *
 * The owner or an organizer, nobody else — a submission id read off somebody's shoulder is not
 * an authorization. This is also the polling fallback for verdicts (docs/PRD.md §10): it
 * reconciles the finished judge job itself, so it returns the same truth the stream would push.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, SubmissionIdParamsSchema);
    const viewer = await viewerFromRequest(request, now);

    return jsonOk(await getSubmissionView(id, viewer, now), NO_STORE);
  });
}
