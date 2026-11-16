import type { NextResponse } from "next/server";

import { ContestIdParamsSchema, handle, jsonOkRevalidated, readParams } from "@/lib/contest/http";
import { getStandings, reconcileClockFromBoard } from "@/lib/contest/standings";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/contests/{id}/standings` — the leaderboard.
 *
 * Public: the projector has no login (docs/PRD.md §4), so the payload is rank, name, score, and
 * penalty and nothing that belongs to a student. The freeze is expressed as *which instant* the
 * board is computed as-of — `freezeAt` for everyone else, `null` for an organizer — never by
 * filtering the answer afterwards.
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
    const viewer = await viewerFromRequest(request, now);

    // Polled by the individual boards the same way the projector polls team-standings: when the
    // window says the contest should have started or ended, the poll makes it true.
    await reconcileClockFromBoard(id, now);

    return jsonOkRevalidated(request, await getStandings(id, viewer, now));
  });
}
