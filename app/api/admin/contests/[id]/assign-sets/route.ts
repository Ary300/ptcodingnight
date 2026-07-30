import type { NextResponse } from "next/server";

import { z } from "zod";

import { reDeriveAssignment, runSetAssignment } from "@/lib/contest/assign-sets";
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
 * `POST /api/admin/contests/{id}/assign-sets` — run Round 1 set assignment.
 * `GET`  — re-derive it from the stored seed and report whether it still matches.
 *
 * The GET is the point of the whole design. When a student says they got the hard set, an organizer
 * opens this and shows the assignment being recomputed from a seed that was fixed before anyone knew
 * who was on which team (docs/PRD.md §6.2). A disputed assignment has to be *explainable* rather
 * than argued about.
 *
 * Admin-only on both verbs, including the GET: the response lists every player's set, and a
 * competitor who could read it would know the whole room's problems before their own round.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AssignRequestSchema = z.object({
  /**
   * Required to re-run. Re-assigning moves students off problems they may already have started, so
   * it cannot be the accidental result of a double-clicked button.
   */
  reassign: z.boolean().optional(),
  /**
   * An explicit seed, for reproducing a past assignment exactly — restoring one after a bad
   * re-assignment, or demonstrating the algorithm on known input. Omit for a fresh random seed.
   */
  seed: z.string().min(8).max(64).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    const admin = requireAdmin(await viewerFromRequest(request, now));
    // Both fields are optional, so "assign for the first time" is a POST with no body at all.
    // readJson rejects an empty body — correctly, for every other route — so it is only consulted
    // when there is something to read. Otherwise an organizer clicking a button with no payload
    // would get "Request body must be JSON", which explains nothing.
    const hasBody = (request.headers.get("content-length") ?? "0") !== "0";
    const body = hasBody ? await readJson(request, AssignRequestSchema) : {};

    return jsonOk(await runSetAssignment(id, admin, now, body), NO_STORE);
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id } = await readParams(context.params, ContestIdParamsSchema);
    requireAdmin(await viewerFromRequest(request, now));

    return jsonOk(await reDeriveAssignment(id), NO_STORE);
  });
}
