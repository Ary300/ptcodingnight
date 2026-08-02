import type { NextResponse } from "next/server";

import { AdminMoveParticipantRequestSchema } from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { adminMoveParticipant, adminRoster } from "@/lib/contest/teams";
import { AdminRosterSchema } from "@/lib/schemas/api";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/contests/{id}/roster/move` — move a participant between teams, or off one.
 *
 * **The most consequential write in the admin surface.** Team size is the divisor, so moving one
 * person changes TWO team scores: the team they left gets a smaller divisor, the team they joined
 * a larger one. Neither team submitted anything, and both their scores move.
 *
 * The audit row records the sizes on both sides as they were before the move, so "why did our
 * score change" has an answer that is not somebody's memory. The reason is optional - the
 * organizer overruled requiring prose on every assignment - but recorded whenever given.
 *
 * A `divisionId` in the same request sets the player's division in the same organizer action,
 * before their set is dealt, so the set they receive belongs to the division they now hold.
 *
 * Returns the whole roster, so the screen cannot show a stale count of the thing it just changed.
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

    const input = await readJson(request, AdminMoveParticipantRequestSchema);
    await adminMoveParticipant(
      input.participantId,
      input.teamId,
      actorLabel(admin),
      input.reason,
      input.divisionId,
    );

    return jsonOk(AdminRosterSchema.parse(await adminRoster(id)), NO_STORE);
  });
}
