import type { NextResponse } from "next/server";

import { adminAddNamedParticipant } from "@/lib/contest/teams";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import {
  AdminAddNamedParticipantRequestSchema,
  AdminAddNamedParticipantResponseSchema,
} from "@/lib/schemas/api";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/contests/{id}/roster/named` — add a student who has no account.
 *
 * The pre-contest roster build: a name, optionally a team and division, and the response carries
 * the join code the organizer prints on that student's slip. Distinct from the participants
 * route, which attaches an existing account; here there is no account and never will be.
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
    const input = await readJson(request, AdminAddNamedParticipantRequestSchema);

    const created = await adminAddNamedParticipant(
      id,
      {
        displayName: input.displayName,
        teamId: input.teamId ?? null,
        divisionId: input.divisionId ?? null,
      },
      actorLabel(admin),
    );

    return jsonOk(AdminAddNamedParticipantResponseSchema.parse(created), NO_STORE);
  });
}
