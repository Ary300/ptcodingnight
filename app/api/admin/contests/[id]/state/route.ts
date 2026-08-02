import type { NextResponse } from "next/server";

import { SetContestStateRequestSchema, SetContestStateResponseSchema } from "@/lib/schemas/api";
import { setContestState } from "@/lib/contest/contests";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/contests/{id}/state` — publish a contest, open it, or end it.
 *
 * The missing half of contest creation. A contest was born DRAFT and nothing could move it, so an
 * organizer could build one and never start it; the only contests students could ever enter were
 * the ones a seed script wrote.
 *
 * FREEZING IS NOT HERE. `POST .../freeze` owns that, it is reversible, and it belongs to the live
 * console where somebody is watching a room. Two routes able to reach one state is how a board
 * ends up frozen with nothing able to unfreeze it.
 *
 * Publishing a contest with an empty line-up is refused inside `setContestState` rather than here,
 * because it is a fact about contests rather than about HTTP — and it is the failure that looks
 * most like success: students sign in, see nothing, and conclude the platform is broken.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, new Date()));
    const input = await readJson(request, SetContestStateRequestSchema);

    const result = await setContestState(id, input.state, {
      actor: `admin:${admin.sessionId}`,
      reason: input.reason,
    });

    return jsonOk(SetContestStateResponseSchema.parse(result), NO_STORE);
  });
}
