import type { NextResponse } from "next/server";

import { z } from "zod";

import { NO_STORE, handle, jsonOk, readJson, readParams } from "@/lib/contest/http";
import {
  SIDE_ACTIVITY_POINT_LIMIT,
  editSideActivity,
  removeSideActivity,
} from "@/lib/contest/side-activities";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `PATCH  /api/admin/teams/{id}/side-activities/{activityId}` — change one award's source or
 * points.
 * `DELETE` — take one award off the team.
 *
 * Both are audited with what the award said before, in the same transaction as the change, so a
 * corrected typo leaves the same record a negative correction entry used to.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1), activityId: z.string().min(1) });

const EditSchema = z
  .object({
    label: z.string().trim().min(1, "Name the activity").max(120).optional(),
    points: z
      .number()
      .int()
      .min(-SIDE_ACTIVITY_POINT_LIMIT)
      .max(SIDE_ACTIVITY_POINT_LIMIT)
      .optional(),
  })
  .refine((input) => input.label !== undefined || input.points !== undefined, {
    message: "Change the activity or the points.",
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id, activityId } = await readParams(context.params, ParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));
    const input = await readJson(request, EditSchema);
    const row = await editSideActivity(id, activityId, input, actorLabel(admin));
    return jsonOk({ teamId: id, ...row }, NO_STORE);
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id, activityId } = await readParams(context.params, ParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));
    await removeSideActivity(id, activityId, actorLabel(admin));
    return jsonOk({ teamId: id, removed: activityId }, NO_STORE);
  });
}
