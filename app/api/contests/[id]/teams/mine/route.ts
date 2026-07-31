import type { NextResponse } from "next/server";

import { TeamViewSchema } from "@/lib/schemas/api";
import { prisma } from "@/lib/db";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readParams,
} from "@/lib/contest/http";
import { teamFormationOpen, teamViewFor } from "@/lib/contest/teams";
import { requireCompetitorOf, viewerFromRequest } from "@/lib/contest/viewer";
import { NotFoundError } from "@/lib/errors";

/**
 * `GET /api/contests/{id}/teams/mine` — the team this competitor is on, if any.
 *
 * Answers with `team: null` rather than 404 when they are on none: "you have no team" is a state
 * the screen has to draw, not an error. It also reports whether formation is still open, because
 * the difference between "you can still join one" and "sign-up has closed, ask an organizer" is
 * the whole of what that screen should say.
 *
 * Only ever the caller's OWN team. Another team's join code is not returned by this route.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const viewer = requireCompetitorOf(await viewerFromRequest(request, now), id);

    const contest = await prisma.contest.findUnique({
      where: { id },
      select: {
        state: true,
        startsAt: true,
        teamFormationClosesAt: true,
        maxTeamSize: true,
      },
    });
    if (contest === null) throw new NotFoundError("Contest");

    const participant = await prisma.participant.findFirst({
      where: { id: viewer.participantId, contestId: id },
      select: { teamId: true },
    });

    const team =
      participant?.teamId == null
        ? null
        : TeamViewSchema.parse(await teamViewFor(participant.teamId, contest.maxTeamSize));

    return jsonOk(
      {
        team,
        formationOpen: teamFormationOpen(contest, now),
        maxTeamSize: contest.maxTeamSize,
      },
      NO_STORE,
    );
  });
}
