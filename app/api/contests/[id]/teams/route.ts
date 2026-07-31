import type { NextResponse } from "next/server";

import {
  CreateTeamRequestSchema,
  TeamMembershipResponseSchema,
} from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { createTeam } from "@/lib/contest/teams";
import { requireCompetitorOf, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/contests/{id}/teams` — a student creates a team and is placed on it.
 *
 * The creator joins their own team in the same transaction. A screen that makes you create a
 * team and then separately join it is a screen people get wrong, and a team with no members is a
 * row an organizer has to clean up.
 *
 * Scoped to the contest in the URL **and** to the session's contest: `requireCompetitorOf`
 * refuses a session belonging to a different contest, so the id in the path cannot be used to
 * reach across contests.
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

    const input = await readJson(request, CreateTeamRequestSchema);
    const result = await createTeam(id, viewer.participantId, input.name, now);

    return jsonOk(
      TeamMembershipResponseSchema.parse({
        team: result.team,
        chosenSetId: result.chosenSetId,
        alreadyMember: false,
      }),
      NO_STORE,
    );
  });
}
