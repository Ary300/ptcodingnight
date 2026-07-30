import type { NextResponse } from "next/server";

import { ContestIdParamsSchema, NO_STORE, handle, jsonOk, readParams } from "@/lib/contest/http";
import { listProblems } from "@/lib/contest/problems";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/contests/{id}/problems` — the problem list for whoever is asking.
 *
 * A competitor sees their division's published problems and their own status on each. An
 * organizer sees everything, drafts included. Nobody else sees anything: this route requires a
 * session, because the list carries per-participant progress.
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

    return jsonOk(await listProblems(id, viewer, now), NO_STORE);
  });
}
