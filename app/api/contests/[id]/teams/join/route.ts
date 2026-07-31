import type { NextResponse } from "next/server";

import { JoinTeamRequestSchema, TeamMembershipResponseSchema } from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { joinTeamByCode } from "@/lib/contest/teams";
import { requireCompetitorOf, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/contests/{id}/teams/join` — join a team with the code a teammate read out.
 *
 * Not rate limited, and that is considered rather than overlooked. A team code is not a
 * credential: guessing one puts you on a team whose membership is already public on the
 * leaderboard, and an organizer can move you straight off it. The controls that matter are the
 * ones a guessed code cannot get past — one team per participant, the size limit, and formation
 * closing when the contest starts.
 *
 * Joining is also the case where a limiter does the most harm: thirty students type their code in
 * the same two minutes, and behind a school NAT they share one address (see `hasTrustedProxy`).
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

    const input = await readJson(request, JoinTeamRequestSchema);
    const result = await joinTeamByCode(id, viewer.participantId, input.code, now);

    return jsonOk(TeamMembershipResponseSchema.parse(result), NO_STORE);
  });
}
