import type { NextResponse } from "next/server";

import {
  AdminFreezeScheduleRequestSchema,
  AdminFreezeScheduleResponseSchema,
} from "@/lib/schemas/api";
import { setFreezeSchedule } from "@/lib/contest/admin";
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
 * `POST /api/admin/contests/{id}/freeze-schedule` — when the public board should stop updating.
 *
 * Distinct from `/freeze`, which stops it now. This sets the clock: "thirty minutes before the end",
 * decided before the night and fired without anybody's attention. Judging never stops either way
 * (docs/PRD.md §6.3); the organizer's own view stays live, which is what makes the reveal at the end
 * a reveal.
 *
 * The request carries MINUTES and the server does the subtraction, so moving the contest's end time
 * re-derives the freeze from it instead of leaving a stale absolute timestamp behind.
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
    const { minutesBeforeEnd } = await readJson(request, AdminFreezeScheduleRequestSchema);

    return jsonOk(
      AdminFreezeScheduleResponseSchema.parse(
        await setFreezeSchedule(id, minutesBeforeEnd, admin),
      ),
      NO_STORE,
    );
  });
}
