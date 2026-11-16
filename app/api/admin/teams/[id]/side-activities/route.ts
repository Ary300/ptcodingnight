import type { NextResponse } from "next/server";

import { z } from "zod";

import {
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import {
  SIDE_ACTIVITY_POINT_LIMIT,
  addSideActivity,
  teamSideActivities,
} from "@/lib/contest/side-activities";
import {
  actorLabel,
  requireAdmin,
  viewerFromRequest,
} from "@/lib/contest/viewer";

/**
 * `GET  /api/admin/teams/{id}/side-activities` — what this team has been awarded, and for what.
 * `POST` — award points typed in by an organizer: a paper puzzle, the Kahoot placing.
 *
 * **This is the only score input with no submission behind it**, which makes its audit trail the
 * only record that it happened at all. A judged submission can be replayed from the log; a puzzle
 * cannot. So `enteredBy` and `enteredAt` are not optional, and every write also lands in
 * `AuditLog`. The rules live in `lib/contest/side-activities.ts`; this handler validates and
 * delegates.
 *
 * A POST whose label matches an award the team already holds answers 409 naming that award, and
 * goes through only with `confirmDuplicate: true`. Points may be negative.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TeamIdParamsSchema = z.object({ id: z.string().min(1) });

const SideActivitySchema = z.object({
  label: z.string().trim().min(1, "Name the activity").max(120),
  /**
   * Bounded in both directions. A typo of 8000 for 80 would silently decide the contest, and the
   * scoring engine has no way to know it was a typo: side activity points are added flat, so a
   * bad one is not diluted by team size the way a problem score would be.
   */
  points: z.number().int().min(-SIDE_ACTIVITY_POINT_LIMIT).max(SIDE_ACTIVITY_POINT_LIMIT),
  confirmDuplicate: z.boolean().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, TeamIdParamsSchema);
    requireAdmin(await viewerFromRequest(request, now));
    return jsonOk(await teamSideActivities(id), NO_STORE);
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, TeamIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));
    const input = await readJson(request, SideActivitySchema);

    const { row } = await addSideActivity(id, input, actorLabel(admin));

    return jsonOk(
      {
        id: row.id,
        teamId: id,
        label: row.label,
        points: row.points,
        enteredAt: row.enteredAt,
      },
      NO_STORE,
    );
  });
}
