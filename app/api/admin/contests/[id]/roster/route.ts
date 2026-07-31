import type { NextResponse } from "next/server";

import { AdminRosterSchema } from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readParams,
} from "@/lib/contest/http";
import { adminRoster } from "@/lib/contest/teams";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/contests/{id}/roster` — every team, its members, and everybody on none.
 *
 * The "unassigned" list is the point of this screen. A participant with no team contributes to no
 * team score, so on the night the question an organizer actually has is "who is not counted yet",
 * and that is a list rather than something to infer by comparing two other screens.
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
    requireAdmin(await viewerFromRequest(request, now));

    return jsonOk(AdminRosterSchema.parse(await adminRoster(id)), NO_STORE);
  });
}
