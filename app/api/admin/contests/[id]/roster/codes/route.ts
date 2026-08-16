import type { NextResponse } from "next/server";

import { mintMissingJoinCodes } from "@/lib/contest/teams";
import {
  ContestIdParamsSchema,
  NO_STORE,
  handle,
  jsonOk,
  readParams,
} from "@/lib/contest/http";
import { AdminMintJoinCodesResponseSchema } from "@/lib/schemas/api";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `POST /api/admin/contests/{id}/roster/codes` — give every seat without a code one.
 *
 * Idempotent, and that property is load bearing: an organizer who presses it twice must not
 * invalidate slips already printed and handed out. A seat that has a code keeps exactly the code
 * it has.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    requireAdmin(await viewerFromRequest(request, new Date()));

    return jsonOk(
      AdminMintJoinCodesResponseSchema.parse(await mintMissingJoinCodes(id)),
      NO_STORE,
    );
  });
}
