import type { NextResponse } from "next/server";

import { z } from "zod";

import { NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { contestSideActivities } from "@/lib/contest/side-activities";
import { requireAdmin, viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/admin/contests/{id}/side-activities` — every team's hand-typed awards, with their
 * sources, in one read.
 *
 * The breakdown behind the Puzzle column on the organizer's awards screen: which puzzle, which
 * seat, the Kahoot placing, who typed each and when. Organizer only, because the public board
 * shows the total and nothing else.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ParamsSchema);
    requireAdmin(await viewerFromRequest(request, now));
    return jsonOk({ teams: await contestSideActivities(id) }, NO_STORE);
  });
}
