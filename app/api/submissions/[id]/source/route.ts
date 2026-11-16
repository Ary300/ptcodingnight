import type { NextResponse } from "next/server";

import { NO_STORE, SubmissionIdParamsSchema, handle, jsonOk, readParams } from "@/lib/contest/http";
import { getSubmissionSource } from "@/lib/contest/submission-source";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/submissions/{id}/source` — the code a student submitted, for that student.
 *
 * The owner or an organizer, nobody else; anyone else gets the same 404 as a missing id. Read
 * once by the problem workspace to put a returning student's last submission back in the editor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { id } = await readParams(context.params, SubmissionIdParamsSchema);
    const viewer = await viewerFromRequest(request, new Date());

    return jsonOk(await getSubmissionSource(id, viewer), NO_STORE);
  });
}
