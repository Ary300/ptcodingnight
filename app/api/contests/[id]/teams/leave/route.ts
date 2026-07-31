import type { NextResponse } from "next/server";

import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readParams,
} from "@/lib/contest/http";
import { leaveTeam } from "@/lib/contest/teams";
import { requireCompetitorOf, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/contests/{id}/teams/leave` — leave the team you are on.
 *
 * A distinct action rather than a side effect of joining another, so that "create a team" cannot
 * silently abandon the team three people are already counting on.
 *
 * **The problem set is NOT returned.** Taking it back would let a student clear an assignment they
 * did not like by leaving and rejoining — the T5 re-roll reached through a different door. The
 * assignment belongs to the participant and survives their roster changing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const viewer = requireCompetitorOf(await viewerFromRequest(request, now), id);

    await leaveTeam(id, viewer.participantId, now);
    return jsonOk({ onTeam: false as const }, NO_STORE);
  });
}
