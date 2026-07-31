import type { NextResponse } from "next/server";

import { AdminCreateTeamRequestSchema, TeamViewSchema } from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { adminCreateTeam } from "@/lib/contest/teams";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/contests/{id}/teams` — create a team directly.
 *
 * For the teams that exist before anybody arrives: a roster decided in advance, or a team an
 * organizer is rebuilding after dissolving one. It has no creator and no members; participants
 * are moved in through the roster route.
 *
 * No reason required, unlike every other organizer action here — creating an empty team changes
 * no score, because it has no members and therefore no divisor.
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
    const admin = requireAdmin(await viewerFromRequest(request, now));

    const input = await readJson(request, AdminCreateTeamRequestSchema);
    const team = await adminCreateTeam(id, actorLabel(admin), input.name);

    return jsonOk(TeamViewSchema.parse(team), NO_STORE);
  });
}
