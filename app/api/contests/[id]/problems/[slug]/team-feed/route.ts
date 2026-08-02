import type { NextResponse } from "next/server";

import { NO_STORE, ProblemParamsSchema, handle, jsonOk, readParams } from "@/lib/contest/http";
import { getTeamProblemFeed } from "@/lib/contest/problems";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/contests/{id}/problems/{slug}/team-feed` — my team's attempts on this GROUP problem.
 *
 * Verdict, score and time per teammate; never source code and never a diff. Answers 404 on an
 * individual problem, because a feed of teammates' attempts there would be answer sharing with
 * extra steps. The whole policy argument lives on `getTeamProblemFeed`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id, slug } = await readParams(context.params, ProblemParamsSchema);
    const viewer = await viewerFromRequest(request, now);

    return jsonOk(await getTeamProblemFeed(id, slug, viewer, now), NO_STORE);
  });
}
