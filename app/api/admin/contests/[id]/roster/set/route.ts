import type { NextResponse } from "next/server";

import { AdminReassignSetRequestSchema, AdminRosterSchema } from "@/lib/schemas/api";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readJson,
  readParams,
} from "@/lib/contest/http";
import { adminReassignSet, adminRoster } from "@/lib/contest/teams";
import { actorLabel, requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/contests/{id}/roster/set` — force a participant onto a problem set.
 *
 * The escape hatch for a disputed or broken assignment, and it deliberately bypasses the seeded
 * derivation. That is exactly why the reason is required: afterwards
 * `GET /api/admin/contests/{id}/assign-sets` reports `matchesStored: false`, and an organizer
 * showing a student "here is why you got set C" has to know a human overrode it rather than
 * concluding the seed is broken.
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

    const input = await readJson(request, AdminReassignSetRequestSchema);
    await adminReassignSet(input.participantId, input.setId, actorLabel(admin), input.reason);

    return jsonOk(AdminRosterSchema.parse(await adminRoster(id)), NO_STORE);
  });
}
