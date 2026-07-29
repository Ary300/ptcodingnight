import type { NextResponse } from "next/server";

import { FreezeRequestSchema } from "@/lib/schemas/api";
import { setFrozen } from "@/lib/contest/admin";
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
 * `POST /api/admin/contests/{id}/freeze` — stop and restart the public board.
 *
 * Judging never stops; only the public board does (docs/PRD.md §6.3). The organizer's own view
 * is live throughout, which is what makes the unfreeze at the end a reveal rather than a
 * recalculation.
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
    const admin = requireAdmin(viewerFromRequest(request, now));
    const { frozen } = await readJson(request, FreezeRequestSchema);

    return jsonOk(await setFrozen(id, frozen, admin, now), NO_STORE);
  });
}
