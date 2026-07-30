import type { NextResponse } from "next/server";

import { NO_STORE, ProblemParamsSchema, handle, jsonOk, readParams } from "@/lib/contest/http";
import { getProblemDetail } from "@/lib/contest/problems";
import { viewerFromRequest } from "@/lib/contest/viewer";

/**
 * `GET /api/contests/{id}/problems/{slug}` — statement, constraints, and sample I/O.
 *
 * Samples only. Hidden cases are never read on this path, let alone returned (docs/PRD.md §7.2),
 * and a `DRAFT` problem is refused here rather than merely hidden in the UI (§8).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<unknown> },
): Promise<NextResponse> {
  return handle(async () => {
    const now = new Date();
    const { id, slug } = await readParams(context.params, ProblemParamsSchema);
    const viewer = await viewerFromRequest(request, now);

    return jsonOk(await getProblemDetail(id, slug, viewer, now), NO_STORE);
  });
}
