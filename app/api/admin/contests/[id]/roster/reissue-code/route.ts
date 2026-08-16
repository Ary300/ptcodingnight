import type { NextResponse } from "next/server";

import { reissueJoinCode } from "@/lib/contest/join-code";
import { ContestIdParamsSchema, NO_STORE, handle, jsonOk, readJson, readParams } from "@/lib/contest/http";
import {
  AdminReissueJoinCodeRequestSchema,
  AdminReissueJoinCodeResponseSchema,
} from "@/lib/schemas/api";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/contests/{id}/roster/reissue-code` — give one seat a new code.
 *
 * This INVALIDATES the slip already printed for that seat, which is the point: it exists for a
 * slip handed to the wrong student, read aloud, or photographed. Moving somebody between teams
 * does not come here, because the code identifies the person and keeps working across a move.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    await readParams(context.params, ContestIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));
    const input = await readJson(request, AdminReissueJoinCodeRequestSchema);

    return jsonOk(
      AdminReissueJoinCodeResponseSchema.parse(
        await reissueJoinCode(input.participantId, actorLabel(admin)),
      ),
      NO_STORE,
    );
  });
}
