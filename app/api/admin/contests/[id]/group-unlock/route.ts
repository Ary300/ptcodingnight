import type { NextResponse } from "next/server";

import {
  AdminGroupUnlockRequestSchema,
  AdminGroupUnlockResponseSchema,
} from "@/lib/schemas/api";
import { setGroupUnlock } from "@/lib/contest/admin";
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
 * `POST /api/admin/contests/{id}/group-unlock` — when the whole-team questions open.
 *
 * The night runs an individual stretch first and team collaboration after it. This sets that
 * clock the way the organizer says it, "thirty minutes in", decided before the night and fired
 * without anybody's attention. The mirror of `/freeze-schedule`, which counts from the other end.
 *
 * The request carries MINUTES and the server does the addition, so starting the contest early or
 * moving its window re-derives the opening instead of leaving a stale absolute timestamp behind.
 * `null` clears it, and the team questions open with everything else at the start.
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
    const { minutesAfterStart } = await readJson(request, AdminGroupUnlockRequestSchema);

    return jsonOk(
      AdminGroupUnlockResponseSchema.parse(await setGroupUnlock(id, minutesAfterStart, admin)),
      NO_STORE,
    );
  });
}
