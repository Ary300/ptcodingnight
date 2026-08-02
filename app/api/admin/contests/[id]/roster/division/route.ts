import type { NextResponse } from "next/server";

import { AdminRosterSchema, AdminSetDivisionRequestSchema } from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { adminRoster, adminSetParticipantDivision } from "@/lib/contest/teams";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/contests/{id}/roster/division` — put a player in a division, or in none.
 *
 * Division decides which problems this player may open and which board ranks them, so the schema
 * requires a reason the same way a team move does. The division is validated as belonging to THIS
 * contest inside `adminSetParticipantDivision`, before anything is written — the id arrives in the
 * body, so nothing about the URL constrains it.
 *
 * Deliberately leaves the player's set assignment alone: after a division change their set may
 * belong to the wrong division, and the roster this returns shows both facts side by side so the
 * organizer makes that correction explicitly rather than having it happen inside this write.
 *
 * Returns the whole roster, so the screen cannot show a stale copy of the thing it just changed.
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

    const input = await readJson(request, AdminSetDivisionRequestSchema);
    await adminSetParticipantDivision(
      input.participantId,
      input.divisionId,
      actorLabel(admin),
      input.reason,
    );

    return jsonOk(AdminRosterSchema.parse(await adminRoster(id)), NO_STORE);
  });
}
