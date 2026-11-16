import type { NextResponse } from "next/server";

import { AdminEndTimeRequestSchema, AdminEndTimeResponseSchema } from "@/lib/schemas/api";
import { setContestEndTime } from "@/lib/contest/end-time";
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
 * `POST /api/admin/contests/{id}/end-time` — move the end of the contest.
 *
 * Extends or shortens a live contest, sets the end of one that has not started, and resumes one
 * that was ended by mistake. The rules are in `lib/contest/end-time.ts`.
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
    const input = await readJson(request, AdminEndTimeRequestSchema);

    const result = await setContestEndTime(id, new Date(input.endsAt), input.reason, admin);
    return jsonOk(AdminEndTimeResponseSchema.parse(result), NO_STORE);
  });
}
