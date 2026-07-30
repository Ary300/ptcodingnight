import type { NextResponse } from "next/server";

import { ContestIdParamsSchema, NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { getStandings } from "@/lib/contest/standings";
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

    return jsonOk(await getStandings(id, viewer, now), NO_STORE);
  });
}
